"use client";

/**
 * @module CommandFleetStore
 * @description Per-agent Command overview data that must not overwrite the
 * focused single-agent stores.
 * @license GPL-3.0-only
 */

import { create } from "zustand";

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
