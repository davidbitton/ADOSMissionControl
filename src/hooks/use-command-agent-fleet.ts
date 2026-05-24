"use client";

/**
 * @module use-command-agent-fleet
 * @description Merges paired drones, cloud status rows, and live telemetry
 * into the display model used by the Command all-agent overview.
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import type { PairedDrone } from "@/stores/pairing-store";
import {
  useCommandFleetStore,
  type CommandCloudStatus,
  type CommandTelemetrySnapshot,
} from "@/stores/command-fleet-store";
import {
  STALE_THRESHOLD_MS,
  OFFLINE_THRESHOLD_MS,
} from "@/lib/agent/freshness";
import { normalizeRadio } from "@/stores/agent-capabilities/normalizer";
import type { RadioState } from "@/lib/api/ground-station/types";

export type CommandAgentProfile = "drone" | "ground-station" | "compute" | "lite";
export type CommandAgentRole = "direct" | "relay" | "receiver" | null;

export type CommandAgentLiveness = "live" | "stale" | "offline";
export type CommandAgentVideoState =
  | "live"
  | "queued"
  | "paused"
  | "unavailable"
  | "offline";

export interface CommandAgentSummary {
  identity: {
    id: string;
    deviceId: string;
    name: string;
    board?: string;
    tier?: number;
    version?: string;
    lastIp?: string;
  };
  profile: CommandAgentProfile;
  role: CommandAgentRole;
  radio: RadioState | null;
  liveness: CommandAgentLiveness;
  lastSeen: number | null;
  system: {
    cpuPercent: number | null;
    memoryPercent: number | null;
    diskPercent: number | null;
    temperature: number | null;
    fcConnected: boolean;
    serviceCount: number;
    runningServiceCount: number;
  };
  video: {
    state: CommandAgentVideoState;
    agentState: string;
    whepUrl: string | null;
    active: boolean;
    queued: boolean;
  };
  telemetry: {
    armed: boolean | null;
    mode: string | null;
    batteryRemaining: number | null;
    batteryVoltage: number | null;
    gpsSatellites: number | null;
    gpsFixType: number | null;
    altitudeRel: number | null;
    groundspeed: number | null;
  };
}

function livenessFromTimestamp(ts: number | null): CommandAgentLiveness {
  if (!ts) return "offline";
  const elapsed = Date.now() - ts;
  if (elapsed < STALE_THRESHOLD_MS) return "live";
  if (elapsed < OFFLINE_THRESHOLD_MS) return "stale";
  return "offline";
}

function latestTimestamp(
  drone: PairedDrone,
  status: CommandCloudStatus | undefined,
): number | null {
  const candidates = [drone.lastSeen, status?.updatedAt].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function videoUrl(status: CommandCloudStatus | undefined): string | null {
  if (status?.videoWhepUrl && status.videoState === "running") return status.videoWhepUrl;
  if (!status?.lastIp || !status.videoWhepPort || status.videoWhepPort <= 0) return null;
  if (status.videoState !== "running") return null;
  return `http://${status.lastIp}:${status.videoWhepPort}/main/whep`;
}

function telemetryValue(
  telemetry: CommandTelemetrySnapshot | undefined,
  status: CommandCloudStatus | undefined,
): CommandTelemetrySnapshot | undefined {
  return telemetry ?? status?.telemetry;
}

export function useCommandAgentFleet(
  pairedDrones: PairedDrone[],
  activeVideoIds: Set<string>,
  pausedVideoIds: Set<string>,
): CommandAgentSummary[] {
  const cloudStatuses = useCommandFleetStore((s) => s.cloudStatuses);
  const telemetryByDeviceId = useCommandFleetStore((s) => s.telemetryByDeviceId);

  return useMemo(() => {
    const summaries = pairedDrones.map((drone): CommandAgentSummary => {
      const status = cloudStatuses[drone.deviceId];
      const telemetry = telemetryValue(
        telemetryByDeviceId[drone.deviceId],
        status,
      );
      const lastSeen = latestTimestamp(drone, status);
      const liveness = livenessFromTimestamp(lastSeen);
      const whepUrl = videoUrl(status);
      const paused = pausedVideoIds.has(drone.deviceId);
      const active = activeVideoIds.has(drone.deviceId);
      const canStream = liveness === "live" && !!whepUrl && !paused;
      const agentVideoState = status?.videoState ?? (whepUrl ? "running" : "unknown");
      const services = status?.services ?? [];

      return {
        identity: {
          id: drone._id,
          deviceId: drone.deviceId,
          name: drone.name,
          board: status?.boardName ?? drone.board,
          tier: status?.boardTier ?? drone.tier,
          version: status?.version ?? drone.agentVersion,
          lastIp: status?.lastIp ?? drone.lastIp,
        },
        profile: drone.profile ?? "drone",
        role: drone.role ?? null,
        radio: status?.radio ? normalizeRadio(status.radio) : null,
        liveness,
        lastSeen,
        system: {
          cpuPercent: status?.cpuPercent ?? null,
          memoryPercent: status?.memoryPercent ?? null,
          diskPercent: status?.diskPercent ?? null,
          temperature: status?.temperature ?? null,
          fcConnected: status?.fcConnected ?? drone.fcConnected ?? false,
          serviceCount: services.length,
          runningServiceCount: services.filter((s) => s.status === "running").length,
        },
        video: {
          state:
            liveness === "offline"
              ? "offline"
              : paused
                ? "paused"
                : canStream
                  ? active
                    ? "live"
                    : "queued"
                  : "unavailable",
          agentState: agentVideoState,
          whepUrl,
          active,
          queued: canStream && !active,
        },
        telemetry: {
          armed: typeof telemetry?.armed === "boolean" ? telemetry.armed : null,
          mode: telemetry?.mode ?? null,
          batteryRemaining:
            typeof telemetry?.battery?.remaining === "number"
              ? telemetry.battery.remaining
              : null,
          batteryVoltage:
            typeof telemetry?.battery?.voltage === "number"
              ? telemetry.battery.voltage
              : null,
          gpsSatellites:
            typeof telemetry?.gps?.satellites === "number"
              ? telemetry.gps.satellites
              : null,
          gpsFixType:
            typeof telemetry?.gps?.fix_type === "number"
              ? telemetry.gps.fix_type
              : null,
          altitudeRel:
            typeof telemetry?.position?.alt_rel === "number"
              ? telemetry.position.alt_rel
              : null,
          groundspeed:
            typeof telemetry?.velocity?.groundspeed === "number"
              ? telemetry.velocity.groundspeed
              : null,
        },
      };
    });

    return summaries.sort((a, b) => {
      const liveRank = { live: 0, stale: 1, offline: 2 };
      const videoRank = { live: 0, queued: 1, paused: 2, unavailable: 3, offline: 4 };
      return (
        liveRank[a.liveness] - liveRank[b.liveness] ||
        videoRank[a.video.state] - videoRank[b.video.state] ||
        a.identity.name.localeCompare(b.identity.name)
      );
    });
  }, [activeVideoIds, cloudStatuses, pairedDrones, pausedVideoIds, telemetryByDeviceId]);
}

export function formatCommandAge(ts: number | null): string {
  if (!ts) return "never";
  const elapsed = Math.max(0, Date.now() - ts);
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
