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
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { usePairingStore } from "@/stores/pairing-store";
import { useVideoStore } from "@/stores/video-store";
import { useGroundStationStore } from "@/stores/ground-station-store";
import { cmdDroneStatusApi, cmdDroneCommandsApi } from "@/lib/community-api-drones";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import { STALE_THRESHOLD_MS, OFFLINE_THRESHOLD_MS } from "@/lib/agent/freshness";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { inferCapabilities } from "@/lib/agent/infer-capabilities";
import type {
  MeshNetEnrollment,
  NetworkPeer,
  PeripheralInfo,
  ScriptInfo,
} from "@/lib/agent/types";
import {
  buildGroundStationPatch,
  buildHeartbeatExtras,
  buildSystemUpdate,
  mapCloudStatus,
  resolveMavlinkUrl,
  resolveVideoUrls,
} from "./bridges/status-mapper";

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

    const cloudRecord = cloudStatus as Record<string, unknown>;
    const mapped = mapCloudStatus(cloudRecord);

    // Check if the data from Convex is actually fresh by comparing the
    // agent's last heartbeat timestamp against staleness thresholds.
    // The Convex reactive query returns the stored row regardless of age,
    // so we must check the data's own timestamp, not treat every query
    // response as proof the agent is alive.
    const dataAge = Date.now() - (cloudRecord.updatedAt as number);
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

    setCloudStatus(mapped, cloudRecord.updatedAt as number);

    // Single atomic update to system store — avoids multiple setState calls
    // that can cause React batching issues with stale intermediate states
    const systemUpdate = buildSystemUpdate(mapped, cloudRecord, isDataFresh);
    useAgentSystemStore.setState(systemUpdate as unknown as Record<string, unknown>);

    // Map extended status fields to their respective stores
    const peripherals = cloudRecord.peripherals;
    if (Array.isArray(peripherals)) {
      useAgentPeripheralsStore.setState({
        peripherals: peripherals as PeripheralInfo[],
      });
    }
    const scripts = cloudRecord.scripts;
    if (Array.isArray(scripts)) {
      useAgentScriptsStore.setState({ scripts: scripts as ScriptInfo[] });
    }
    const peers = cloudRecord.peers;
    if (Array.isArray(peers)) {
      useAgentScriptsStore.setState({ peers: peers as NetworkPeer[] });
    }
    const enrollment = cloudRecord.enrollment;
    if (enrollment && typeof enrollment === "object") {
      useAgentScriptsStore.setState({ enrollment: enrollment as MeshNetEnrollment });
    }

    // Ground-station fan-out. Only writes when the corresponding heartbeat
    // field is present — LAN polls keep their authority on every other field.
    const gsState = useGroundStationStore.getState();
    const gsPatch = buildGroundStationPatch(cloudRecord, {
      linkHealth: gsState.linkHealth,
      status: gsState.status,
      role: gsState.role,
      uplink: gsState.uplink,
      peripherals: gsState.peripherals,
    });
    if (gsPatch) {
      useGroundStationStore.setState(gsPatch);
    }

    // Map video status from cloud heartbeat to video store
    // LAN fallback: when the agent's cloud heartbeat lags (or is broken
    // outright) the Convex row may not yet carry videoWhepUrl/lastIp. If
    // the cached pair record has an mDNS host (browser-local for LAN-only
    // pairings, Convex-mediated when signed in), we can still synthesize
    // a WHEP URL the cascade can attempt on the LAN. Prefers the
    // Convex-published URL when present (lets future out-of-LAN setups
    // still work).
    //
    // Gated on HTTP origin: on HTTPS the browser blocks plain-HTTP
    // fetches to a private LAN host (mixed content) so the synthesized
    // URLs would just produce confusing "Failed to fetch" errors. The
    // cascade prefers p2p-mqtt on HTTPS anyway, so skipping the LAN
    // synthesis is the right behaviour for HTTPS-served GCS pages.
    const allowLanSynthesis =
      typeof window === "undefined" ||
      window.location.protocol !== "https:";
    const localNode = allowLanSynthesis
      ? useLocalNodesStore
          .getState()
          .nodes.find((n) => n.deviceId === cloudDeviceId)
      : null;
    const pairedDrone = allowLanSynthesis
      ? usePairingStore
          .getState()
          .pairedDrones.find((d) => d.deviceId === cloudDeviceId)
      : null;
    const lastIp = cloudRecord.lastIp as string | undefined;
    const lanHost =
      localNode?.mdnsHost ||
      localNode?.ipv4 ||
      pairedDrone?.mdnsHost ||
      pairedDrone?.lastIp ||
      lastIp ||
      null;

    const { state: videoState, whepUrl } = resolveVideoUrls(cloudRecord, lanHost);
    if (videoState) {
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
    const { url: mavlinkUrl } = resolveMavlinkUrl(cloudRecord, lanHost);
    if (mavlinkUrl) {
      useAgentConnectionStore.getState().setMavlinkUrl(mavlinkUrl);
    }

    // Infer capabilities from cloud status (board SoC → NPU, peripherals → cameras).
    // The cloud row carries the agent's runtimeMode regardless of whether the
    // /api/capabilities endpoint exists, so merge it into the inferred shape
    // before handing to the store. Without this, agents that never expose
    // /api/capabilities (notably the lightweight Rust backend at v0.1) would
    // silently fall back to runtimeMode="full".
    const capState = useAgentCapabilitiesStore.getState();
    const extras = buildHeartbeatExtras(cloudRecord);

    if (!capState.loaded || capState.cameras.length === 0) {
      const periphList = useAgentPeripheralsStore.getState().peripherals;
      const inferred = inferCapabilities(mapped, periphList, extras.inferOverrides);
      if (inferred) {
        const payload: Record<string, unknown> = {
          ...inferred,
          runtimeMode: extras.runtimeMode,
          videoRestartAttempts: extras.videoRestartAttempts,
          foxgloveBindFailed: extras.foxgloveBindFailed,
          pairingCodeExpiresAt: extras.pairingCodeExpiresAt,
          mavlinkWsUrlPrev: extras.mavlinkWsUrlPrev,
          wfbFailoverState: extras.wfbFailoverState,
          manualConnectionUrls: extras.manualConnectionUrls,
          cloudRelayUrl: extras.cloudRelayUrl,
          cloudflareUrl: extras.cloudflareUrl,
        };
        if (extras.setupState !== undefined) payload.setupState = extras.setupState;
        if (extras.profileSource !== undefined) payload.profileSource = extras.profileSource;
        if (extras.profile !== undefined) payload.profile = extras.profile;
        if (extras.role !== undefined) payload.role = extras.role;
        if (extras.radioRaw !== undefined) payload.radio = extras.radioRaw;
        if (extras.videoPipeline !== undefined) payload.videoPipeline = extras.videoPipeline;
        payload.peerDeviceId = extras.peerDeviceId;
        payload.peerRole = extras.peerRole;
        payload.peerChannel = extras.peerChannel;
        payload.peerRssiDbm = extras.peerRssiDbm;
        payload.peerSeenAtUnix = extras.peerSeenAtUnix;
        payload.cameraState = extras.cameraState;
        if (extras.canBuses !== undefined) payload.canBuses = extras.canBuses;
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
      const periphList = useAgentPeripheralsStore.getState().peripherals;
      const reInferred = inferCapabilities(mapped, periphList, extras.inferOverrides);
      const reInferredDisplay = reInferred?.display;
      const mergedDisplay = reInferredDisplay ?? capState.display;
      const reMergedProfile =
        extras.profile !== undefined ? extras.profile : capState.profile;
      const reMergedRole =
        extras.role !== undefined ? extras.role : capState.role;
      useAgentCapabilitiesStore.getState().setCapabilities({
        tier: capState.tier,
        cameras: capState.cameras,
        compute: capState.compute,
        vision: capState.vision,
        models: capState.models,
        runtimeMode: capState.runtimeMode,
        setupState: capState.setupState,
        profileSource: capState.profileSource,
        profile: reMergedProfile,
        role: reMergedRole,
        display: mergedDisplay,
        // Effective primary local-display path. Latest heartbeat wins;
        // a sparse tick falls back to whatever the store already had so
        // the picker doesn't flicker to "Auto-detecting…" on every
        // heartbeat that omits the field.
        displayType: reInferred?.displayType ?? capState.displayType,
        videoLocalTap: reInferred?.videoLocalTap ?? capState.videoLocalTap,
        videoRecording: reInferred?.videoRecording ?? capState.videoRecording,
        uiTheme: reInferred?.uiTheme ?? capState.uiTheme,
        // Latest heartbeat wins for the air-side pipeline identity; if
        // the current tick omits it, fall back to whatever the store
        // already had so a sparse heartbeat doesn't blank the pill.
        videoPipeline: extras.videoPipeline ?? capState.videoPipeline,
        // Latest heartbeat wins for the navigation block; sparse
        // heartbeats keep the prior value so flow / VIO indicators
        // don't flicker.
        navigation: reInferred?.navigation ?? capState.navigation,
        videoRestartAttempts: extras.videoRestartAttempts,
        foxgloveBindFailed: extras.foxgloveBindFailed,
        pairingCodeExpiresAt: extras.pairingCodeExpiresAt,
        mavlinkWsUrlPrev: extras.mavlinkWsUrlPrev,
        wfbFailoverState: extras.wfbFailoverState,
        manualConnectionUrls: extras.manualConnectionUrls,
        cloudRelayUrl: extras.cloudRelayUrl,
        cloudflareUrl: extras.cloudflareUrl,
        peerDeviceId: extras.peerDeviceId,
        peerRole: extras.peerRole,
        peerChannel: extras.peerChannel,
        peerRssiDbm: extras.peerRssiDbm,
        peerSeenAtUnix: extras.peerSeenAtUnix,
        cameraState: extras.cameraState,
        // Forward-permissive: undefined keeps whatever the store had,
        // matching the agent's "warmup window" semantics. Once the
        // FC param cache populates, every tick carries the latest
        // CAN bus snapshot.
        canBuses: extras.canBuses,
        ...(extras.radioRaw !== undefined ? { radio: extras.radioRaw } : {}),
      } as Record<string, unknown>);
    }

    initialLoadDone.current = true;
  }, [cloudStatus, cloudDeviceId, setCloudStatus]);

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
