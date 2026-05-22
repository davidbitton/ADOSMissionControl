/**
 * @module AgentPluginInventoryStore
 * @description Zustand store that mirrors the agent's webapp plugin
 * inventory per device. The agent publishes the inventory in its
 * cloud heartbeat (`cmd_droneStatus.pluginInventory`) so the GCS can
 * surface installs the operator made directly from the agent's
 * webapp at port 8080 (which bypasses the Convex install path the
 * GCS Plugins tab uses).
 *
 * Convex's `cmdPlugins:listForDevice` remains the authority for
 * installs the GCS knows about. This store is purely additive: the
 * per-drone Plugins tab merges its entries with any inventory rows
 * that share a `pluginId` with a Convex row, and renders inventory-
 * only entries (those without a Convex match) with a "from agent"
 * marker so the operator can still see they exist.
 *
 * Keyed by `deviceId` so multi-drone sessions keep each drone's
 * inventory independent. CloudStatusBridge writes when a heartbeat
 * lands; consumers read by id.
 *
 * @license GPL-3.0-only
 */

import { create } from "zustand";

export interface AgentPluginInventoryEntry {
  plugin_id: string;
  version: string | null;
  status: string | null;
}

interface AgentPluginInventoryState {
  byDevice: Record<string, AgentPluginInventoryEntry[]>;
}

interface AgentPluginInventoryActions {
  setForDevice: (
    deviceId: string,
    entries: AgentPluginInventoryEntry[],
  ) => void;
  clearDevice: (deviceId: string) => void;
  clear: () => void;
}

export type AgentPluginInventoryStore = AgentPluginInventoryState &
  AgentPluginInventoryActions;

export const useAgentPluginInventoryStore = create<AgentPluginInventoryStore>(
  (set) => ({
    byDevice: {},

    setForDevice(deviceId, entries) {
      if (!deviceId) return;
      set((state) => ({
        byDevice: { ...state.byDevice, [deviceId]: entries },
      }));
    },

    clearDevice(deviceId) {
      set((state) => {
        if (!(deviceId in state.byDevice)) return state;
        const next = { ...state.byDevice };
        delete next[deviceId];
        return { byDevice: next };
      });
    },

    clear() {
      set({ byDevice: {} });
    },
  }),
);
