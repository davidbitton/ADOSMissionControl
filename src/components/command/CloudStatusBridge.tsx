"use client";

/**
 * @module CloudStatusBridge
 * @description Bridges Convex cloud drone status into the agent Zustand stores.
 * Mounted when cloudMode is true. Reactively queries cmd_droneStatus and maps
 * to AgentStatus shape that the rest of the UI consumes.
 * Includes heartbeat staleness detection (marks agent offline after 30s).
 * @license GPL-3.0-only
 */

import { useEffect, useRef } from "react";
import { useMutation, useConvexAuth } from "convex/react";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { useAgentPeripheralsStore } from "@/stores/agent-peripherals-store";
import { useAgentScriptsStore } from "@/stores/agent-scripts-store";
import { usePairingStore } from "@/stores/pairing-store";
import { useVideoStore } from "@/stores/video-store";
import { cmdDroneStatusApi, cmdDroneCommandsApi } from "@/lib/community-api-drones";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import type { AgentCapabilities } from "@/lib/agent/feature-types";
import type { AgentStatus } from "@/lib/agent/types";
import { STALE_THRESHOLD_MS, OFFLINE_THRESHOLD_MS } from "@/lib/agent/freshness";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { inferCapabilities } from "@/lib/agent/infer-capabilities";

const STALE_CHECK_INTERVAL_MS = 5_000; // Check every 5s so the 1Hz UI label stays close to reality

export function CloudStatusBridge() {
  const cloudDeviceId = useAgentConnectionStore((s) => s.cloudDeviceId);
  const setCloudStatus = useAgentConnectionStore((s) => s.setCloudStatus);
  const convexAvailable = useConvexAvailable();
  const initialLoadDone = useRef(false);

  const cloudStatus = useConvexSkipQuery(cmdDroneStatusApi.getCloudStatus, {
    args: { deviceId: cloudDeviceId! },
    enabled: !!cloudDeviceId,
  });

  const { isAuthenticated } = useConvexAuth();
  const enqueueCommand = useMutation(cmdDroneCommandsApi.enqueueCommand);

  // Heartbeat monitoring: initial timeout (15s) + staleness detection (10s interval)
  useEffect(() => {
    if (!cloudDeviceId || !convexAvailable) return;

    // Surface error if no cloud status received within 15s
    const timer = setTimeout(() => {
      const current = useAgentConnectionStore.getState();
      if (current.cloudMode && !useAgentSystemStore.getState().status) {
        useAgentConnectionStore.setState({
          connectionError: "No cloud status received. Is the agent paired and online?",
        });
      }
    }, 15000);

    // Ongoing staleness check: two thresholds.
    //   > STALE_THRESHOLD_MS  (20s) → mark system store stale, dim the UI,
    //                                 keep last-known data visible.
    //   > OFFLINE_THRESHOLD_MS (60s) → mark connection offline, clear MAVLink
    //                                  URL so dependent UIs stop trying.
    const tick = () => {
      const state = useAgentConnectionStore.getState();
      if (!state.cloudMode || !state.lastCloudUpdate) return;

      const elapsed = Date.now() - state.lastCloudUpdate;

      if (elapsed > STALE_THRESHOLD_MS) {
        const sys = useAgentSystemStore.getState();
        const patch: Record<string, unknown> = {};
        if (!sys.stale) patch.stale = true;
        // Keep the freshness clock in sync with the watchdog. If the user
        // hit Reconnect (which clears lastUpdatedAt to null) and no heartbeat
        // arrived before the grace period elapsed, seed lastUpdatedAt from
        // lastCloudUpdate so useFreshness() starts reporting the correct
        // stale/offline state instead of staying stuck at "unknown".
        if (sys.lastUpdatedAt == null && state.lastCloudUpdate != null) {
          patch.lastUpdatedAt = state.lastCloudUpdate;
        }
        if (Object.keys(patch).length > 0) {
          useAgentSystemStore.setState(patch);
        }
      }

      if (elapsed > OFFLINE_THRESHOLD_MS) {
        const seconds = Math.round(elapsed / 1000);
        const patch: Record<string, unknown> = {
          connectionError: `Agent offline (last seen ${seconds}s ago)`,
        };
        if (state.connected) patch.connected = false;
        if (state.mavlinkUrl) patch.mavlinkUrl = null;
        useAgentConnectionStore.setState(patch);
      }
    };

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(tick, STALE_CHECK_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(timer);
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cloudDeviceId, convexAvailable]);

  // Map Convex status to AgentStatus
  useEffect(() => {
    if (!cloudStatus) return;

    const mapped: AgentStatus = {
      version: cloudStatus.version || "?.?.?",
      uptime_seconds: cloudStatus.uptimeSeconds || 0,
      board: {
        name: cloudStatus.boardName || "Unknown",
        model: "",
        tier: cloudStatus.boardTier || 0,
        ram_mb: cloudStatus.boardRamMb || cloudStatus.memoryTotalMb || 0,
        cpu_cores: cloudStatus.cpuCores || 0,
        vendor: "",
        soc: cloudStatus.boardSoc || "",
        arch: cloudStatus.boardArch || "",
        hw_video_codecs: [],
      },
      health: {
        cpu_percent: cloudStatus.cpuPercent || 0,
        memory_percent: cloudStatus.memoryPercent || 0,
        disk_percent: cloudStatus.diskPercent || 0,
        temperature: cloudStatus.temperature ?? null,
        timestamp: new Date(cloudStatus.updatedAt).toISOString(),
      },
      fc_connected: cloudStatus.fcConnected || false,
      fc_port: cloudStatus.fcPort || "",
      fc_baud: cloudStatus.fcBaud || 0,
    };

    // Check if the data from Convex is actually fresh by comparing the
    // agent's last heartbeat timestamp against staleness thresholds.
    // The Convex reactive query returns the stored row regardless of age,
    // so we must check the data's own timestamp, not treat every query
    // response as proof the agent is alive.
    const dataAge = Date.now() - cloudStatus.updatedAt;
    const isDataFresh = dataAge < STALE_THRESHOLD_MS;
    const isDataOffline = dataAge >= OFFLINE_THRESHOLD_MS;

    if (isDataFresh) {
      // Agent heartbeat is genuinely recent
      useAgentConnectionStore.setState({
        connected: true,
        connectionError: null,
      });
    } else if (isDataOffline) {
      // Data is older than the offline threshold
      const seconds = Math.round(dataAge / 1000);
      const label = seconds < 60
        ? `${seconds}s`
        : seconds < 3600
          ? `${Math.floor(seconds / 60)}m`
          : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
      useAgentConnectionStore.setState({
        connected: false,
        connectionError: `Agent offline (last heartbeat ${label} ago)`,
        mavlinkUrl: null,
      });
    }

    setCloudStatus(mapped, cloudStatus.updatedAt);

    // Single atomic update to system store — avoids multiple setState calls
    // that can cause React batching issues with stale intermediate states
    const systemUpdate: Record<string, unknown> = {
      status: mapped,
      lastUpdatedAt: cloudStatus.updatedAt,
      stale: !isDataFresh,
      resources: {
        cpu_percent: mapped.health.cpu_percent,
        memory_percent: mapped.health.memory_percent,
        memory_used_mb: cloudStatus.memoryUsedMb ?? 0,
        memory_total_mb: cloudStatus.memoryTotalMb ?? 0,
        disk_percent: mapped.health.disk_percent,
        disk_used_gb: cloudStatus.diskUsedGb ?? 0,
        disk_total_gb: cloudStatus.diskTotalGb ?? 0,
        temperature: mapped.health.temperature,
      },
    };

    if (cloudStatus.cpuHistory && Array.isArray(cloudStatus.cpuHistory) && cloudStatus.cpuHistory.length > 0) {
      systemUpdate.cpuHistory = cloudStatus.cpuHistory;
    }
    if (cloudStatus.memoryHistory && Array.isArray(cloudStatus.memoryHistory) && cloudStatus.memoryHistory.length > 0) {
      systemUpdate.memoryHistory = cloudStatus.memoryHistory;
    }

    if (cloudStatus.services && Array.isArray(cloudStatus.services)) {
      systemUpdate.services = cloudStatus.services.map((s: Record<string, unknown>) => ({
        name: s.name,
        status: (["running", "stopped", "error", "degraded", "starting", "circuit_open"].includes(s.status as string) ? s.status : "stopped") as "running" | "stopped" | "error" | "degraded" | "starting" | "circuit_open",
        pid: s.pid ?? null,
        cpu_percent: (s.cpuPercent as number) || 0,
        memory_mb: (s.memoryMb as number) || 0,
        uptime_seconds: (s.uptimeSeconds as number) ?? 0,
        category: s.category as "core" | "hardware" | "suite" | "ondemand" | undefined,
      }));
      systemUpdate.processCpuPercent = cloudStatus.processCpuPercent ?? null;
      systemUpdate.processMemoryMb = cloudStatus.processMemoryMb ?? null;
    }

    if (cloudStatus.logs && Array.isArray(cloudStatus.logs)) {
      systemUpdate.logs = cloudStatus.logs;
    }

    // Single atomic setState for ALL system store fields
    useAgentSystemStore.setState(systemUpdate);

    // Map extended status fields to their respective stores
    if (cloudStatus.peripherals && Array.isArray(cloudStatus.peripherals)) {
      useAgentPeripheralsStore.setState({ peripherals: cloudStatus.peripherals });
    }
    if (cloudStatus.scripts && Array.isArray(cloudStatus.scripts)) {
      useAgentScriptsStore.setState({ scripts: cloudStatus.scripts });
    }
    if (cloudStatus.suites && Array.isArray(cloudStatus.suites)) {
      useAgentScriptsStore.setState({ suites: cloudStatus.suites });
    }
    if (cloudStatus.peers && Array.isArray(cloudStatus.peers)) {
      useAgentScriptsStore.setState({ peers: cloudStatus.peers });
    }
    if (cloudStatus.enrollment && typeof cloudStatus.enrollment === "object") {
      useAgentScriptsStore.setState({ enrollment: cloudStatus.enrollment });
    }

    // Map video status from cloud heartbeat to video store
    const videoState = (cloudStatus as Record<string, unknown>).videoState as string | undefined;
    const videoWhepPort = (cloudStatus as Record<string, unknown>).videoWhepPort as number | undefined;
    const videoWhepUrl = (cloudStatus as Record<string, unknown>).videoWhepUrl as string | undefined;
    const lastIp = (cloudStatus as Record<string, unknown>).lastIp as string | undefined;

    // LAN fallback: when the agent's cloud heartbeat lags (or is broken
    // outright) the Convex row may not yet carry videoWhepUrl/lastIp. If
    // the paired-drone record cached at pair time has an mDNS host, we can
    // still synthesize a WHEP URL the cascade can attempt on the LAN.
    // Prefers the Convex-published URL when present (lets future
    // out-of-LAN setups still work).
    const pairedDrone = usePairingStore
      .getState()
      .pairedDrones.find((d) => d.deviceId === cloudDeviceId);
    const lanHost = pairedDrone?.mdnsHost || pairedDrone?.lastIp || lastIp;

    if (videoState) {
      let whepUrl: string | null = null;
      if (videoState === "running" && videoWhepUrl) {
        whepUrl = videoWhepUrl;
      } else if (videoState === "running" && lastIp && videoWhepPort && videoWhepPort > 0) {
        whepUrl = `http://${lastIp}:${videoWhepPort}/main/whep`;
      } else if (videoState === "running" && lanHost) {
        // mediamtx default WHEP port is stable across deployments.
        whepUrl = `http://${lanHost}:8889/main/whep`;
      }
      useVideoStore.getState().setAgentVideoStatus(videoState, whepUrl);
    } else if (lanHost) {
      // Convex doesn't yet know the video state (heartbeat hasn't landed,
      // or the field is missing). Assume "running" so the cascade has a
      // URL to attempt; if the agent rejects the WHEP POST the cascade
      // surfaces a normal failure and falls through to the next mode.
      useVideoStore
        .getState()
        .setAgentVideoStatus("running", `http://${lanHost}:8889/main/whep`);
    }

    // MAVLink WebSocket URL from agent heartbeat
    const mavlinkWsPort = (cloudStatus as Record<string, unknown>).mavlinkWsPort as number | undefined;
    const mavlinkWsUrl = (cloudStatus as Record<string, unknown>).mavlinkWsUrl as string | undefined;
    if (mavlinkWsUrl) {
      useAgentConnectionStore.getState().setMavlinkUrl(mavlinkWsUrl);
    } else if (lastIp && mavlinkWsPort && mavlinkWsPort > 0) {
      useAgentConnectionStore.getState().setMavlinkUrl(`ws://${lastIp}:${mavlinkWsPort}/`);
    } else if (lanHost) {
      // LAN fallback: ados-mavlink defaults to port 8765 across all
      // shipped agents, mirroring the WHEP default above.
      useAgentConnectionStore
        .getState()
        .setMavlinkUrl(`ws://${lanHost}:8765/`);
    }

    // Infer capabilities from cloud status (board SoC → NPU, peripherals → cameras).
    // The cloud row carries the agent's runtimeMode regardless of whether the
    // /api/capabilities endpoint exists, so merge it into the inferred shape
    // before handing to the store. Without this, agents that never expose
    // /api/capabilities (notably the lightweight Rust backend at v0.1) would
    // silently fall back to runtimeMode="full".
    const capState = useAgentCapabilitiesStore.getState();
    const cloudRecord = cloudStatus as Record<string, unknown>;
    const radioFromHeartbeat = cloudRecord.radio;

    // Heartbeat health surfaces forwarded into the capability store so
    // panels can react without re-querying. Each is forward-permissive:
    // if the agent omits the field on a given heartbeat, the store
    // keeps the prior value (the underlying setter handles the merge).
    const videoRestartAttempts =
      typeof cloudRecord.videoRestartAttempts === "number" &&
      Number.isFinite(cloudRecord.videoRestartAttempts as number) &&
      (cloudRecord.videoRestartAttempts as number) >= 0
        ? Math.floor(cloudRecord.videoRestartAttempts as number)
        : 0;
    const foxgloveBindFailed = cloudRecord.foxgloveBindFailed === true;
    const pairingCodeExpiresAt =
      typeof cloudRecord.pairingCodeExpiresAt === "number" &&
      Number.isFinite(cloudRecord.pairingCodeExpiresAt as number) &&
      (cloudRecord.pairingCodeExpiresAt as number) > 0
        ? (cloudRecord.pairingCodeExpiresAt as number)
        : null;
    const mavlinkWsUrlPrev =
      typeof cloudRecord.mavlinkWsUrlPrev === "string" &&
      (cloudRecord.mavlinkWsUrlPrev as string).length > 0
        ? (cloudRecord.mavlinkWsUrlPrev as string)
        : null;
    const wfbFailoverState: "local" | "cloud_relay" | "failed" = [
      "local",
      "cloud_relay",
      "failed",
    ].includes(cloudRecord.wfbFailoverState as string)
      ? (cloudRecord.wfbFailoverState as "local" | "cloud_relay" | "failed")
      : "local";

    // Manual-connection URL block (LAN-routable fallbacks the operator
    // can paste into a manual MAVLink / video form). Per-field optional.
    const rawManual = cloudRecord.manualConnectionUrls;
    const pickStringOrNull = (v: unknown): string | null =>
      typeof v === "string" && v.length > 0 ? v : null;
    const manualConnectionUrls =
      rawManual && typeof rawManual === "object"
        ? {
            mavlinkTcp: pickStringOrNull(
              (rawManual as Record<string, unknown>).mavlinkTcp,
            ),
            mavlinkWs: pickStringOrNull(
              (rawManual as Record<string, unknown>).mavlinkWs,
            ),
            videoViewer: pickStringOrNull(
              (rawManual as Record<string, unknown>).videoViewer,
            ),
            videoWhep: pickStringOrNull(
              (rawManual as Record<string, unknown>).videoWhep,
            ),
          }
        : null;
    const cloudRelayUrl = pickStringOrNull(cloudRecord.cloudRelayUrl);
    const cloudflareUrl = pickStringOrNull(cloudRecord.cloudflareUrl);

    // Top-level heartbeat extras the agent forwards every tick. These
    // refresh the LCD live state (active page, last touch, snapshot
    // URL) and the local video tap snapshot independent of any
    // peripheral re-enumeration. Pull them once and reuse on both
    // the first-load and steady-state paths so the store always
    // mirrors the latest heartbeat.
    const heartbeatExtras: Parameters<typeof inferCapabilities>[2] = {
      lcdActivePage: cloudRecord.lcdActivePage as string | null | undefined,
      lcdTouchCalibrated: cloudRecord.lcdTouchCalibrated as
        | boolean
        | null
        | undefined,
      lcdRotation: cloudRecord.lcdRotation as number | null | undefined,
      lcdSnapshotUrl: cloudRecord.lcdSnapshotUrl as string | null | undefined,
      lcdLastTouchAt: cloudRecord.lcdLastTouchAt as number | null | undefined,
      lcdLastGesture: cloudRecord.lcdLastGesture as string | null | undefined,
      videoLocalDecoderActive: cloudRecord.videoLocalDecoderActive as
        | boolean
        | null
        | undefined,
      videoLocalDecoderType: cloudRecord.videoLocalDecoderType as
        | string
        | null
        | undefined,
      videoLocalDecoderFps: cloudRecord.videoLocalDecoderFps as
        | number
        | null
        | undefined,
      videoRecording: cloudRecord.videoRecording as boolean | null | undefined,
      uiTheme: cloudRecord.uiTheme as string | null | undefined,
    };

    // Air-side pipeline identity. The agent enriches its heartbeat
    // when the in-process GStreamer pipeline owns the stream; absence
    // means the legacy bash composition is in force and the GCS
    // surfaces no pipeline pill. Build the block here so both the
    // cold-load and warm-merge branches can pass it through.
    const videoPipeline: AgentCapabilities["videoPipeline"] | undefined =
      typeof cloudStatus.videoPipelineFlavor === "string" &&
      cloudStatus.videoPipelineFlavor.length > 0
        ? {
            flavor: cloudStatus.videoPipelineFlavor,
            encoderName:
              typeof cloudStatus.videoEncoderName === "string"
                ? cloudStatus.videoEncoderName
                : undefined,
            encoderHwAccel:
              typeof cloudStatus.videoEncoderHwAccel === "boolean"
                ? cloudStatus.videoEncoderHwAccel
                : undefined,
            cameraSource:
              typeof cloudStatus.videoCameraSource === "string"
                ? cloudStatus.videoCameraSource
                : undefined,
            state:
              typeof cloudStatus.videoPipelineState === "string"
                ? cloudStatus.videoPipelineState
                : undefined,
          }
        : undefined;

    if (!capState.loaded || capState.cameras.length === 0) {
      const peripherals = useAgentPeripheralsStore.getState().peripherals;
      const inferred = inferCapabilities(mapped, peripherals, heartbeatExtras);
      if (inferred) {
        const runtimeMode: "full" | "lite" =
          cloudStatus.runtimeMode === "lite" ? "lite" : "full";
        const setupState =
          typeof cloudStatus.setupState === "string"
            ? cloudStatus.setupState
            : undefined;
        const profileSource =
          typeof cloudStatus.profileSource === "string"
            ? cloudStatus.profileSource
            : undefined;
        const profile =
          typeof cloudRecord.profile === "string"
            ? (cloudRecord.profile as string)
            : undefined;
        const role =
          typeof cloudRecord.role === "string"
            ? (cloudRecord.role as string)
            : cloudRecord.role === null
              ? null
              : undefined;
        const payload: Record<string, unknown> = {
          ...inferred,
          runtimeMode,
          videoRestartAttempts,
          foxgloveBindFailed,
          pairingCodeExpiresAt,
          mavlinkWsUrlPrev,
          wfbFailoverState,
          manualConnectionUrls,
          cloudRelayUrl,
          cloudflareUrl,
        };
        if (setupState !== undefined) payload.setupState = setupState;
        if (profileSource !== undefined) payload.profileSource = profileSource;
        if (profile !== undefined) payload.profile = profile;
        if (role !== undefined) payload.role = role;
        if (radioFromHeartbeat !== undefined) payload.radio = radioFromHeartbeat;
        if (videoPipeline !== undefined) payload.videoPipeline = videoPipeline;
        useAgentCapabilitiesStore.getState().setCapabilities(payload);
      }
    } else {
      // Capabilities are already loaded but several heartbeat-derived
      // fields change every tick: the radio block (TX power, RSSI,
      // FEC counters), the LCD live state (active page, last touch,
      // snapshot URL), and the local video tap (decoder fps,
      // recording flag). Re-merge the heartbeat-derived view of
      // those fields into the existing capability snapshot so the
      // normalizer fires without losing the deeper fields the agent
      // doesn't repeat every tick (cameras, compute, models).
      const peripherals = useAgentPeripheralsStore.getState().peripherals;
      const reInferred = inferCapabilities(mapped, peripherals, heartbeatExtras);
      const reInferredDisplay = reInferred?.display;
      const mergedDisplay = reInferredDisplay
        ? reInferredDisplay
        : capState.display;
      const reMergedProfile =
        typeof cloudRecord.profile === "string"
          ? (cloudRecord.profile as string)
          : capState.profile;
      const reMergedRole =
        typeof cloudRecord.role === "string"
          ? (cloudRecord.role as string)
          : cloudRecord.role === null
            ? null
            : capState.role;
      useAgentCapabilitiesStore.getState().setCapabilities({
        tier: capState.tier,
        cameras: capState.cameras,
        compute: capState.compute,
        vision: capState.vision,
        models: capState.models,
        features: capState.features,
        runtimeMode: capState.runtimeMode,
        setupState: capState.setupState,
        profileSource: capState.profileSource,
        profile: reMergedProfile,
        role: reMergedRole,
        display: mergedDisplay,
        videoLocalTap: reInferred?.videoLocalTap ?? capState.videoLocalTap,
        videoRecording: reInferred?.videoRecording ?? capState.videoRecording,
        uiTheme: reInferred?.uiTheme ?? capState.uiTheme,
        // Latest heartbeat wins for the air-side pipeline identity; if
        // the current tick omits it, fall back to whatever the store
        // already had so a sparse heartbeat doesn't blank the pill.
        videoPipeline: videoPipeline ?? capState.videoPipeline,
        videoRestartAttempts,
        foxgloveBindFailed,
        pairingCodeExpiresAt,
        mavlinkWsUrlPrev,
        wfbFailoverState,
        manualConnectionUrls,
        cloudRelayUrl,
        cloudflareUrl,
        ...(radioFromHeartbeat !== undefined ? { radio: radioFromHeartbeat } : {}),
      } as Record<string, unknown>);
    }

    initialLoadDone.current = true;
  }, [cloudStatus, setCloudStatus]);

  // Listen for cloud command events from the store
  useEffect(() => {
    if (!convexAvailable || !cloudDeviceId || !isAuthenticated) return;

    function handleCloudCommand(e: Event) {
      const detail = (e as CustomEvent).detail;
      enqueueCommand({
        deviceId: detail.deviceId,
        command: detail.command,
        args: detail.args,
      }).catch((err) => {
        console.warn("Cloud command enqueue failed:", err);
      });
    }

    window.addEventListener("cloud-command", handleCloudCommand);
    return () => window.removeEventListener("cloud-command", handleCloudCommand);
  }, [enqueueCommand, cloudDeviceId, convexAvailable, isAuthenticated]);

  return null; // Pure bridge, no UI
}
