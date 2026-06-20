"use client";

/**
 * @module CommandFleetStore
 * @description Per-agent Command overview data that must not overwrite the
 * focused single-agent stores.
 * @license GPL-3.0-only
 */

import { create } from "zustand";

import type { CameraUsbRecovery } from "@/lib/agent/types";

export interface CommandTelemetrySnapshot {
  armed?: boolean;
  mode?: string;
  position?: {
    lat?: number;
    lon?: number;
    alt_msl?: number;
    alt_rel?: number;
    heading?: number;
  };
  velocity?: {
    groundspeed?: number;
    airspeed?: number;
    climb?: number;
  };
  battery?: {
    voltage?: number;
    current?: number;
    remaining?: number;
  };
  gps?: {
    fix_type?: number;
    satellites?: number;
  };
  last_heartbeat?: number;
  last_update?: number;
}

export interface CommandCloudStatus {
  deviceId: string;
  version?: string;
  uptimeSeconds?: number;
  boardName?: string;
  boardTier?: number;
  boardSoc?: string;
  boardArch?: string;
  cpuPercent?: number;
  memoryPercent?: number;
  diskPercent?: number;
  temperature?: number | null;
  fcConnected?: boolean;
  fcPort?: string;
  fcBaud?: number;
  /** Gated MAVLink truth, mirrored from the agent's heartbeat / status.
   * `transportOpen` = a port is open; `mavlinkAlive` = a HEARTBEAT decoded
   * within the freshness window; `heartbeatAgeS` = seconds since the last one.
   * Undefined on agents that predate the gated surface. */
  transportOpen?: boolean;
  mavlinkAlive?: boolean;
  heartbeatAgeS?: number | null;
  /** Which FC source the router resolved the link from. */
  fcSource?: "auto" | "serial" | "udp" | "tcp";
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  diskUsedGb?: number;
  diskTotalGb?: number;
  cpuCores?: number;
  boardRamMb?: number;
  services?: Array<{ name: string; status: string }>;
  lastIp?: string;
  mdnsHost?: string;
  setupUrl?: string;
  apiUrl?: string;
  missionControlUrl?: string;
  videoState?: string;
  videoWhepPort?: number;
  videoWhepUrl?: string;
  mavlinkWsPort?: number;
  mavlinkWsUrl?: string;
  remoteAccess?: {
    provider?: string;
    publicUrls?: string[];
  };
  telemetry?: CommandTelemetrySnapshot;
  // WFB radio snapshot (camelCase). Cloud path: the cmd_droneStatus row
  // carries it verbatim. LAN path: copied from /api/status/full. Kept as
  // a loose record so both sources fit without coupling to a strict type;
  // the fleet hook normalizes it before display.
  radio?: Record<string, unknown> | null;
  /** Air-side camera discovery state ("ready" | "missing" | "error").
   * Forwarded from the LAN-direct `/api/status/full` (the cloud path
   * maps cameraState through the capability store). Undefined / null on
   * agents that predate the surface. */
  cameraState?: string | null;
  /** Air-side USB camera recovery state from the LAN-direct status.
   * Undefined on agents that predate the surface. */
  cameraUsbRecovery?: CameraUsbRecovery;
  // ── Cloud-only display pills ────────────────────────────────────
  // These are denormalized onto the heartbeat by the cloud bridge and
  // surfaced as fleet-card badges by the projection selector. They are NOT
  // FC telemetry, so they live here (keyed by deviceId) rather than in the
  // node registry's FC sub-state — a cloud tick that carries them can never
  // overwrite live flight data.
  /** Local panel attached over the 40-pin header ("spi-lcd" | "hdmi" | "none"). */
  attachedDisplayType?: "spi-lcd" | "hdmi" | "none";
  /** How the agent landed on its current profile (drives the "auto" pill). */
  profileSource?: "detected" | "tiebreaker" | "default" | "override" | "user";
  /** Air-side video pipeline flavor (drives the "GST" pill). */
  videoPipelineFlavor?: string;
  /** GStreamer H.264 encoder factory name. */
  videoEncoderName?: string;
  /** True when the chosen encoder is a hardware path. */
  videoEncoderHwAccel?: boolean;
  /** Direct LAN MAVLink WebSocket URL the agent advertises (drives "Direct"). */
  manualMavlinkWsUrl?: string;
  /** True when the agent reports an active GPS-denied estimator. */
  navigationGpsDenied?: boolean;
  /** Active vision-nav estimator mode (free-form string). */
  navigationMode?: string;
  /** Inter-rig peer device-id from a decoded WFB PresenceBeacon. */
  peerDeviceId?: string | null;
  /** Peer-reported RSSI in dBm (signed). */
  peerRssiDbm?: number | null;
  updatedAt: number;
}

interface CommandFleetState {
  cloudStatuses: Record<string, CommandCloudStatus>;
  telemetryByDeviceId: Record<string, CommandTelemetrySnapshot>;
  /** Replace the whole map. Use when one source owns every row in the
   * cloudStatuses table (legacy single-bridge contract). */
  setCloudStatuses: (rows: CommandCloudStatus[]) => void;
  /** Merge rows by deviceId. Use when multiple bridges co-own rows
   * (e.g. the Convex cloud bridge plus the LAN local-node bridge). */
  upsertCloudStatuses: (rows: CommandCloudStatus[]) => void;
  /** Remove rows by deviceId. Use when a node disappears from a
   * bridge's ownership set (unpaired, fleet refresh dropped it). */
  removeCloudStatuses: (deviceIds: string[]) => void;
  setTelemetry: (deviceId: string, telemetry: CommandTelemetrySnapshot) => void;
  clear: () => void;
}

export const useCommandFleetStore = create<CommandFleetState>((set) => ({
  cloudStatuses: {},
  telemetryByDeviceId: {},

  setCloudStatuses(rows) {
    set({
      cloudStatuses: Object.fromEntries(rows.map((row) => [row.deviceId, row])),
    });
  },

  upsertCloudStatuses(rows) {
    if (rows.length === 0) return;
    set((state) => ({
      cloudStatuses: {
        ...state.cloudStatuses,
        ...Object.fromEntries(rows.map((row) => [row.deviceId, row])),
      },
    }));
  },

  removeCloudStatuses(deviceIds) {
    if (deviceIds.length === 0) return;
    set((state) => {
      const next = { ...state.cloudStatuses };
      let changed = false;
      for (const id of deviceIds) {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? { cloudStatuses: next } : state;
    });
  },

  setTelemetry(deviceId, telemetry) {
    set((state) => ({
      telemetryByDeviceId: {
        ...state.telemetryByDeviceId,
        [deviceId]: telemetry,
      },
    }));
  },

  clear() {
    set({ cloudStatuses: {}, telemetryByDeviceId: {} });
  },
}));
