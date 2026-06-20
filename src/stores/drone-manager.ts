import { create } from "zustand";
import type {
  DroneProtocol,
  Transport,
  VehicleInfo,
} from "@/lib/protocol/types";
import { useTelemetryStore } from "./telemetry-store";
import { useDroneStore } from "./drone-store";
import { useSettingsStore } from "./settings-store";
import { useVideoStore } from "./video-store";
import { useAgentCapabilitiesStore } from "./agent-capabilities-store";
import { useGroundStationStore } from "./ground-station-store";
import { useDiagnosticsStore } from "./diagnostics-store";
import { usePanelCacheStore } from "./panel-cache-store";
import {
  startRecordingFor,
  stopRecordingFor,
  isRecordingFor,
} from "@/lib/telemetry-recorder";
import { bridgeTelemetry } from "./drone-manager-bridge";
import { invalidateParamCache } from "@/components/fc/parameters/ParametersPanel";

export interface ConnectionMeta {
  type: "serial" | "websocket" | "mqtt-mavlink";
  baudRate?: number;
  url?: string;
  portVendorId?: number;
  portProductId?: number;
  presetId?: string;
}

export interface ManagedDrone {
  id: string;
  name: string;
  protocol: DroneProtocol;
  transport: Transport;
  vehicleInfo: VehicleInfo;
  unsubscribers: (() => void)[];
  connectedAt: number;
  connectionMeta?: ConnectionMeta;
  /**
   * Whether this managed drone owns its Fleet-view row. A direct connection
   * (USB serial, or a standalone agent with no device identity) owns the row
   * and removes it on disconnect. An FC attached through an already-paired
   * agent does NOT own the row — the presence bridge (Local/Cloud) owns it —
   * so detaching the FC leaves the card in place, reverting to "flight
   * controller not connected" instead of vanishing.
   */
  ownsFleetRow: boolean;
  /** Why the drone was disconnected. `null` while connected. */
  _disconnectReason: "intentional" | "unexpected" | null;
}

/** Listeners for unexpected disconnect events (used by auto-reconnect). */
type DisconnectListener = (droneId: string, droneName: string, meta: ConnectionMeta | undefined) => void;
const unexpectedDisconnectListeners = new Set<DisconnectListener>();

interface DroneManagerState {
  drones: Map<string, ManagedDrone>;
  selectedDroneId: string | null;

  addDrone: (
    id: string,
    name: string,
    protocol: DroneProtocol,
    transport: Transport,
    vehicleInfo: VehicleInfo,
    connectionMeta?: ConnectionMeta,
    options?: { ownsFleetRow?: boolean },
  ) => void;
  removeDrone: (id: string) => void;
  /** Intentional disconnect — marks drone as intentional, then removes. */
  disconnectDrone: (id: string) => void;
  /**
   * Swap the transport associated with a ManagedDrone in place. Used by the
   * SLCAN flash arbiter to survive a tear-down and re-open of the same USB
   * port without triggering the unexpected-disconnect path. The caller is
   * responsible for opening the new transport first and re-attaching it to
   * the protocol; this action only re-binds the close handler and refreshes
   * the stored transport reference. If the drone no longer exists in the
   * store (already removed by an earlier close handler) this is a no-op.
   */
  swapTransport: (id: string, nextTransport: Transport) => void;
  /**
   * Mark a drone's next transport close as intentional. The SLCAN arbiter
   * sets this before calling `protocol.disconnect()` so the close handler
   * does not fire the unexpected-disconnect cleanup path.
   */
  markIntentionalDisconnect: (id: string) => void;
  /**
   * Add a secondary transport as a link to an existing drone.
   * The protocol validates that the new transport reaches the same MAVLink sysid.
   * Returns success/error from the protocol.
   */
  attachLinkToDrone: (
    droneId: string,
    transport: Transport,
  ) => Promise<{ ok: true; linkId: string } | { ok: false; error: string }>;
  /** Remove a secondary link by id. If it's the last remaining link, the drone is removed. */
  detachLinkFromDrone: (droneId: string, linkId: string) => Promise<void>;
  selectDrone: (id: string | null) => void;
  getSelectedProtocol: () => DroneProtocol | null;
  getSelectedDrone: () => ManagedDrone | null;
  clear: () => void;
}

export const useDroneManager = create<DroneManagerState>((set, get) => ({
  drones: new Map(),
  selectedDroneId: null,

  addDrone: (id, name, protocol, transport, vehicleInfo, connectionMeta, options) => {
    // Idempotency guard: a re-add under an existing id replaces the prior
    // entry rather than stacking a second managed drone. removeDrone honors
    // ownsFleetRow (so a presence-bridge card survives) and self-guards
    // against re-entry, so this never double-tears-down.
    if (get().drones.get(id)) {
      get().removeDrone(id);
    }

    const ownsFleetRow = options?.ownsFleetRow ?? true;
    const unsubscribers = bridgeTelemetry(id, name, protocol);

    const drone: ManagedDrone = {
      id,
      name,
      protocol,
      transport,
      vehicleInfo,
      unsubscribers,
      connectedAt: Date.now(),
      connectionMeta,
      ownsFleetRow,
      _disconnectReason: null,
    };

    // Listen for transport close to detect unexpected disconnects
    const closeHandler = () => {
      const current = get().drones.get(id);
      if (!current || current._disconnectReason === "intentional") return;
      // Mark as unexpected and trigger listeners
      current._disconnectReason = "unexpected";
      for (const listener of unexpectedDisconnectListeners) {
        listener(id, name, connectionMeta);
      }
      // Clean up the drone from the store
      get().removeDrone(id);
    };
    transport.on("close", closeHandler as (data: void) => void);
    unsubscribers.push(() => transport.off("close", closeHandler as (data: void) => void));

    set((state) => {
      const newMap = new Map(state.drones);
      newMap.set(id, drone);
      return { drones: newMap };
    });

    useDiagnosticsStore.getState().logConnection("connect", name + " connected");

    // The fleet-store row is no longer written here. The node registry is the
    // single fleet-identity write target: AgentMavlinkBridge calls attachFc on
    // connect, and FleetProjectionBridge projects the registry into the fleet
    // store. Writing a bare row here was the source of the FC bare-row race
    // that locked the agent tabs.

    // Background bulk param download — seeds paramCache for instant panel reads
    protocol.getAllParameters().catch(() => {});

    // Auto-select if this is the first drone
    if (get().drones.size === 1) {
      get().selectDrone(id);
    }

    // Auto-start recording if enabled in settings. Use the per-drone slot so
    // captured frames (written via recordFrameFor(id, ...)) land in the same
    // slot the stop call later reads from.
    if (useSettingsStore.getState().autoRecordOnConnect && !isRecordingFor(id)) {
      startRecordingFor(id, name);
    }
  },

  removeDrone: (id) => {
    const drone = get().drones.get(id);
    const ownsFleetRow = drone ? drone.ownsFleetRow : true;
    if (drone) {
      useDiagnosticsStore.getState().logConnection("disconnect", drone.name + " disconnected");
      // Disconnect the transport BEFORE tearing down the close-handler
      // subscription. A transport that closes synchronously inside
      // disconnect() must still be observed by the close handler; running
      // the unsubscribers first would remove that handler and swallow the
      // close. If the close handler fires here and recursively removes this
      // drone, the entry is already gone by the time we resume — bail out so
      // the teardown below does not run twice.
      if (drone.protocol.isConnected) {
        drone.protocol.disconnect();
      }
      if (!get().drones.has(id)) return;
      drone.unsubscribers.forEach((unsub) => unsub());
    }

    // Persist any per-drone recording that was running for this drone so the
    // captured frames are saved rather than orphaned in the recorder slot.
    if (isRecordingFor(id)) {
      stopRecordingFor(id).catch(() => {});
    }

    // The fleet-store row is no longer removed here; the node registry owns
    // fleet identity. A direct-USB FC (ownsFleetRow=true, an `fc:<random>`
    // node) detaches via AgentMavlinkBridge's detachFc, which GCs its
    // registry row; an agent-attached FC leaves the presence row in place so
    // it reverts to "flight controller not connected". The projection reflects
    // both. `ownsFleetRow` is retained on the ManagedDrone for the reconnect
    // path's bookkeeping.
    void ownsFleetRow;

    // The singleton telemetry ring only ever holds the SELECTED drone's
    // history (the bridge gates pushes on selection), so only wipe it when
    // the drone being removed is the selected one — removing a background
    // drone must not blow away the drone the operator is watching. FC params
    // are per-drone, so always clear the removed drone's slot.
    if (get().selectedDroneId === id) {
      useTelemetryStore.getState().clear();
    }
    usePanelCacheStore.getState().clearForDrone(id);

    set((state) => {
      const newMap = new Map(state.drones);
      newMap.delete(id);
      const selectedId =
        state.selectedDroneId === id ? null : state.selectedDroneId;
      return { drones: newMap, selectedDroneId: selectedId };
    });

    // If we just deselected, reset downstream stores
    if (get().selectedDroneId === null) {
      useDroneStore.getState().selectDrone(null);
      useDroneStore.getState().setConnectionState("disconnected");
      invalidateParamCache();
    }
  },

  disconnectDrone: (id) => {
    const drone = get().drones.get(id);
    if (drone) {
      drone._disconnectReason = "intentional";
    }
    get().removeDrone(id);
  },

  markIntentionalDisconnect: (id) => {
    const drone = get().drones.get(id);
    if (drone) {
      drone._disconnectReason = "intentional";
    }
  },

  swapTransport: (id, nextTransport) => {
    const drone = get().drones.get(id);
    if (!drone) return;
    // Re-arm the close handler on the new transport. The original handler
    // was installed in addDrone() against the old transport, which is now
    // closed and gone; install an equivalent one here so an unexpected
    // close on the new transport still fires the auto-reconnect path.
    const closeHandler = () => {
      const current = get().drones.get(id);
      if (!current || current._disconnectReason === "intentional") return;
      current._disconnectReason = "unexpected";
      for (const listener of unexpectedDisconnectListeners) {
        listener(id, drone.name, drone.connectionMeta);
      }
      get().removeDrone(id);
    };
    nextTransport.on("close", closeHandler as (data: void) => void);
    drone.unsubscribers.push(() =>
      nextTransport.off("close", closeHandler as (data: void) => void),
    );
    drone.transport = nextTransport;
    drone._disconnectReason = null;
    // Force a re-render of consumers reading from the drones map.
    set((state) => {
      const newMap = new Map(state.drones);
      return { drones: newMap };
    });
  },

  attachLinkToDrone: async (droneId, transport) => {
    const drone = get().drones.get(droneId);
    if (!drone) {
      return { ok: false, error: "Drone not found" };
    }
    if (!drone.protocol.addLink) {
      return { ok: false, error: "This drone's protocol does not support multi-link" };
    }
    const result = await drone.protocol.addLink(transport);
    if (result.ok) {
      useDiagnosticsStore.getState().logConnection(
        "connect",
        `${drone.name} added link (${transport.type})`,
      );
      // Force a re-render of the drones map by replacing it
      set((state) => {
        const newMap = new Map(state.drones);
        return { drones: newMap };
      });
    }
    return result;
  },

  detachLinkFromDrone: async (droneId, linkId) => {
    const drone = get().drones.get(droneId);
    if (!drone || !drone.protocol.removeLink) return;
    await drone.protocol.removeLink(linkId);
    useDiagnosticsStore.getState().logConnection(
      "disconnect",
      `${drone.name} removed link ${linkId}`,
    );
    // Force a re-render
    set((state) => {
      const newMap = new Map(state.drones);
      return { drones: newMap };
    });
  },

  selectDrone: (id) => {
    const previousId = get().selectedDroneId;
    set({ selectedDroneId: id });

    // Switching to a different drone: clear cross-drone singleton state so the
    // newly selected drone never shows the previous one's data before its first
    // frame arrives. The telemetry buffers, the flight-state fields, and the
    // previous drone's cached FC params are all single-slot and would otherwise
    // bleed across the selection.
    if (id !== previousId) {
      useTelemetryStore.getState().clear();
      const droneStore = useDroneStore.getState();
      droneStore.setConnectionState("disconnected");
      droneStore.setFlightMode("STABILIZE");
      droneStore.setArmState("disarmed");
      droneStore.setSystemStatus(0);
      droneStore.setFirmwareType(null);
      if (previousId) {
        usePanelCacheStore.getState().clearForDrone(previousId);
      }
      invalidateParamCache();
      // Reset the GLOBAL single-value stores that otherwise bleed the previous
      // drone's data onto the newly selected one before its first frame: the
      // video pipeline (stream URL + agent video status + poll/latency scratch),
      // the per-agent capabilities (gate the radio/vision tabs + video feed),
      // and the ground-station snapshot.
      useVideoStore.getState().clearForSelection();
      useAgentCapabilitiesStore.getState().clear();
      useGroundStationStore.getState().resetAll();
    }

    if (id) {
      useDroneStore.getState().selectDrone(id);
    }
  },

  getSelectedProtocol: () => {
    const { drones, selectedDroneId } = get();
    if (!selectedDroneId) return null;
    return drones.get(selectedDroneId)?.protocol ?? null;
  },

  getSelectedDrone: () => {
    const { drones, selectedDroneId } = get();
    if (!selectedDroneId) return null;
    return drones.get(selectedDroneId) ?? null;
  },

  clear: () => {
    const { drones } = get();
    drones.forEach((drone) => {
      drone._disconnectReason = "intentional";
      drone.unsubscribers.forEach((unsub) => unsub());
      if (drone.protocol.isConnected) {
        drone.protocol.disconnect();
      }
    });
    set({ drones: new Map(), selectedDroneId: null });
    useDroneStore.getState().setConnectionState("disconnected");
    useTelemetryStore.getState().clear();
  },
}));

/** Subscribe to unexpected disconnect events. Returns unsubscribe function. */
export function onUnexpectedDisconnect(listener: DisconnectListener): () => void {
  unexpectedDisconnectListeners.add(listener);
  return () => unexpectedDisconnectListeners.delete(listener);
}
