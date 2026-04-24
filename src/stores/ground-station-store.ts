/**
 * @module GroundStationStore
 * @description Zustand store for the ADOS Ground Agent / ground station state.
 * Phase 0: link health, WFB-ng config, and paired-drone status.
 * Phase 1 (Wave D): network, pair, UI slices plus API-driven actions.
 * Phase 2 (Wave C): pic, gamepads, bluetooth, display slices plus PIC WebSocket subscription.
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import type {
  ApStatus,
  ApUpdate,
  BluetoothDevice,
  DisplayConfig,
  DisplayUpdate,
  EthernetConfig,
  EthernetConfigUpdate,
  Gamepad,
  GroundStationApi,
  GroundStationRole,
  MeshEvent,
  MeshGateway,
  MeshGatewayPreferenceUpdate,
  MeshHealth,
  MeshNeighbor,
  MeshRoute,
  ModemStatus,
  ModemUpdate,
  NetworkStatus,
  OledUpdate,
  PairingPendingRequest,
  PairResult,
  PeripheralDetail,
  PeripheralSummary,
  PicEvent,
  PicState,
  RoleInfo,
  ScreensUpdate,
  UiConfig,
  UplinkEvent,
  UplinkFailoverEntry,
  UplinkHealth,
  WfbReceiverCombined,
  WfbReceiverRelay,
  WfbRelayStatus,
  WifiScanResult,
} from "@/lib/api/ground-station-api";
import { GroundStationApiError } from "@/lib/api/ground-station-api";

// Slice types and initial-state constants live alongside this file.
export type {
  GroundStationLinkHealth,
  WfbBitrateProfile,
  WfbConfig,
  GroundStationProfile,
  GroundStationStatus,
  PairSlice,
  PicSlice,
  GamepadsSlice,
  BluetoothSlice,
  WifiScanCache,
  UplinkDataCap,
  UplinkSlice,
  PeripheralsSlice,
  RoleSlice,
  DistributedRxSlice,
  MeshTransientEvent,
  MeshWsState,
  MeshSlice,
} from "./ground-station/types";
import type {
  GroundStationLinkHealth,
  WfbConfig,
  GroundStationStatus,
  PairSlice,
  PicSlice,
  GamepadsSlice,
  BluetoothSlice,
  WifiScanCache,
  UplinkSlice,
  PeripheralsSlice,
  RoleSlice,
  DistributedRxSlice,
  MeshSlice,
} from "./ground-station/types";
import {
  INITIAL_LINK_HEALTH,
  INITIAL_STATUS,
  INITIAL_PAIR,
  INITIAL_PIC,
  INITIAL_GAMEPADS,
  INITIAL_BLUETOOTH,
  INITIAL_WIFI_SCAN,
  INITIAL_UPLINK,
  INITIAL_PERIPHERALS,
  INITIAL_ROLE,
  INITIAL_DISTRIBUTED_RX,
  INITIAL_MESH,
  FAILOVER_LOG_CAP,
} from "./ground-station/initial-state";

interface GroundStationState {
  linkHealth: GroundStationLinkHealth;
  wfbConfig: WfbConfig | null;
  status: GroundStationStatus;
  loading: boolean;
  lastError: string | null;
  lastFetchedAt: number | null;

  // Phase 1 slices
  network: NetworkStatus | null;
  ap: ApStatus | null;
  pair: PairSlice;
  ui: UiConfig | null;

  // Phase 2 slices (Wave C)
  pic: PicSlice;
  gamepads: GamepadsSlice;
  bluetooth: BluetoothSlice;
  display: DisplayConfig | null;

  // Phase 3 slices (Wave C) - network client, modem, uplink
  wifiScan: WifiScanCache;
  modem: ModemStatus | null;
  uplink: UplinkSlice;

  // Phase 4 (Wave 2) - Ethernet static-IP config (Wave 3 backend pending)
  ethernetConfig: EthernetConfig | null;

  // Phase 4 (Wave 3) - Peripheral Manager
  peripherals: PeripheralsSlice;

  // Distributed receive + mesh slices
  role: RoleSlice;
  distributedRx: DistributedRxSlice;
  mesh: MeshSlice;

  // Existing actions
  loadStatus: (status: GroundStationStatus, linkHealth?: Partial<GroundStationLinkHealth>) => void;
  loadWfb: (wfb: WfbConfig) => void;
  setWfbConfig: (partial: Partial<WfbConfig>) => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  reset: () => void;

  // Phase 1 actions
  loadNetwork: (api: GroundStationApi) => Promise<void>;
  applyAp: (api: GroundStationApi, update: ApUpdate) => Promise<ApStatus | null>;
  loadUi: (api: GroundStationApi) => Promise<void>;
  applyOled: (api: GroundStationApi, update: OledUpdate) => Promise<UiConfig | null>;
  applyScreens: (api: GroundStationApi, update: ScreensUpdate) => Promise<UiConfig | null>;
  startPair: (api: GroundStationApi, pairKey: string, droneId?: string) => Promise<void>;
  unpair: (api: GroundStationApi) => Promise<void>;
  clearPair: () => void;

  // Phase 2 actions (Wave C)
  loadPic: (api: GroundStationApi) => Promise<void>;
  claimPic: (
    api: GroundStationApi,
    clientId: string,
    opts?: { confirmToken?: string; force?: boolean },
  ) => Promise<boolean>;
  releasePic: (api: GroundStationApi, clientId: string) => Promise<boolean>;
  /**
   * Start a 10 s interval that POSTs to /pic/heartbeat for the given client
   * id. Returns a stop function that clears the interval. On a 410 (orphaned)
   * response, the local pic slice is reset to idle so the UI reflects the
   * agent-side auto-release.
   */
  pollPicHeartbeat: (api: GroundStationApi, clientId: string) => () => void;
  subscribePicWs: (api: GroundStationApi) => () => void;

  loadGamepads: (api: GroundStationApi) => Promise<void>;
  applyPrimaryGamepad: (api: GroundStationApi, deviceId: string | null) => Promise<boolean>;

  scanBluetooth: (api: GroundStationApi, durationS?: number) => Promise<void>;
  pairBluetooth: (api: GroundStationApi, mac: string) => Promise<boolean>;
  forgetBluetooth: (api: GroundStationApi, mac: string) => Promise<boolean>;
  loadPairedBluetooth: (api: GroundStationApi) => Promise<void>;

  loadDisplay: (api: GroundStationApi) => Promise<void>;
  applyDisplay: (api: GroundStationApi, update: DisplayUpdate) => Promise<DisplayConfig | null>;

  // Phase 3 actions (Wave C)
  scanWifiNetworks: (
    api: GroundStationApi,
    timeoutS?: number,
  ) => Promise<WifiScanResult[]>;
  joinWifi: (
    api: GroundStationApi,
    ssid: string,
    passphrase?: string,
    force?: boolean,
  ) => Promise<{ joined: boolean; needsForce: boolean; error: string | null }>;
  leaveWifi: (api: GroundStationApi) => Promise<boolean>;
  loadModem: (api: GroundStationApi) => Promise<void>;
  applyModem: (
    api: GroundStationApi,
    update: ModemUpdate,
  ) => Promise<ModemStatus | null>;
  loadPriority: (api: GroundStationApi) => Promise<void>;
  applyPriority: (
    api: GroundStationApi,
    priority: string[],
  ) => Promise<string[] | null>;
  toggleShareUplink: (
    api: GroundStationApi,
    enabled: boolean,
  ) => Promise<boolean | null>;
  subscribeUplinkWs: (api: GroundStationApi) => () => void;

  // Phase 4 Wave 2 - Ethernet static-IP config
  loadEthernetConfig: (api: GroundStationApi) => Promise<EthernetConfig | null>;
  applyEthernetConfig: (
    api: GroundStationApi,
    update: EthernetConfigUpdate,
  ) => Promise<{ config: EthernetConfig | null; error: string | null; backendPending: boolean }>;

  // Phase 4 Wave 3 - Peripheral Manager
  loadPeripherals: (api: GroundStationApi) => Promise<void>;
  loadPeripheralDetail: (
    api: GroundStationApi,
    id: string,
  ) => Promise<PeripheralDetail | null>;
  configurePeripheral: (
    api: GroundStationApi,
    id: string,
    config: Record<string, unknown>,
  ) => Promise<boolean>;
  invokePeripheralAction: (
    api: GroundStationApi,
    id: string,
    actionId: string,
    body?: Record<string, unknown>,
  ) => Promise<{ queued: boolean; result?: unknown } | null>;

  // Distributed receive + mesh actions
  loadRole: (api: GroundStationApi) => Promise<void>;
  applyRole: (api: GroundStationApi, role: GroundStationRole) => Promise<RoleInfo | null>;
  loadDistributedRx: (api: GroundStationApi) => Promise<void>;
  loadMesh: (api: GroundStationApi) => Promise<void>;
  pinMeshGateway: (
    api: GroundStationApi,
    update: MeshGatewayPreferenceUpdate,
  ) => Promise<boolean>;
  openPairingWindow: (
    api: GroundStationApi,
    duration_s?: number,
  ) => Promise<boolean>;
  closePairingWindow: (api: GroundStationApi) => Promise<boolean>;
  approvePairing: (api: GroundStationApi, device_id: string) => Promise<boolean>;
  revokeRelay: (api: GroundStationApi, device_id: string) => Promise<boolean>;
  loadPairingPending: (api: GroundStationApi) => Promise<void>;
  subscribeMeshWs: (api: GroundStationApi) => () => void;

  resetAll: () => void;
}


function errorMessage(err: unknown): { message: string; status: number | null } {
  if (err instanceof GroundStationApiError) {
    let parsedMsg = err.body;
    try {
      const parsed = JSON.parse(err.body) as { detail?: string; message?: string };
      parsedMsg = parsed.detail || parsed.message || err.body;
    } catch {
      // keep raw body
    }
    return { message: parsedMsg || err.message, status: err.status };
  }
  if (err instanceof Error) return { message: err.message, status: null };
  return { message: "Unknown error", status: null };
}

export const useGroundStationStore = create<GroundStationState>((set, get) => ({
  linkHealth: INITIAL_LINK_HEALTH,
  wfbConfig: null,
  status: INITIAL_STATUS,
  loading: false,
  lastError: null,
  lastFetchedAt: null,

  network: null,
  ap: null,
  pair: INITIAL_PAIR,
  ui: null,

  pic: INITIAL_PIC,
  gamepads: INITIAL_GAMEPADS,
  bluetooth: INITIAL_BLUETOOTH,
  display: null,

  wifiScan: INITIAL_WIFI_SCAN,
  modem: null,
  uplink: INITIAL_UPLINK,

  ethernetConfig: null,

  peripherals: INITIAL_PERIPHERALS,

  role: INITIAL_ROLE,
  distributedRx: INITIAL_DISTRIBUTED_RX,
  mesh: INITIAL_MESH,

  loadStatus: (status, linkHealth) => {
    const current = get().linkHealth;
    set({
      status,
      linkHealth: linkHealth ? { ...current, ...linkHealth } : current,
      lastFetchedAt: Date.now(),
      lastError: null,
    });
  },

  loadWfb: (wfb) => {
    set({ wfbConfig: wfb, lastFetchedAt: Date.now(), lastError: null });
  },

  setWfbConfig: (partial) => {
    const current = get().wfbConfig;
    if (!current) return;
    set({ wfbConfig: { ...current, ...partial } });
  },

  setLoading: (loading) => set({ loading }),

  setError: (message) => set({ lastError: message }),

  reset: () =>
    set({
      linkHealth: INITIAL_LINK_HEALTH,
      wfbConfig: null,
      status: INITIAL_STATUS,
      loading: false,
      lastError: null,
      lastFetchedAt: null,
    }),

  loadNetwork: async (api) => {
    try {
      const net = await api.getNetwork();
      const modemFromNet = net.modem_4g ?? net.modem ?? null;
      const currentUplink = get().uplink;
      set({
        network: net,
        ap: net.ap,
        modem: modemFromNet,
        uplink: {
          ...currentUplink,
          active: net.active_uplink ?? currentUplink.active,
          priority: net.priority ?? currentUplink.priority,
          data_cap: modemFromNet?.data_cap ?? currentUplink.data_cap,
        },
        lastError: null,
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
    }
  },

  applyAp: async (api, update) => {
    try {
      const ap = await api.setAp(update);
      const prev = get().network;
      set({
        ap,
        network: prev ? { ...prev, ap } : prev,
        lastError: null,
      });
      return ap;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
      return null;
    }
  },

  loadUi: async (api) => {
    try {
      const ui = await api.getUi();
      set({ ui, lastError: null });
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
    }
  },

  applyOled: async (api, update) => {
    try {
      const ui = await api.setOled(update);
      set({ ui, lastError: null });
      return ui;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
      return null;
    }
  },

  applyScreens: async (api, update) => {
    try {
      const ui = await api.setScreens(update);
      set({ ui, lastError: null });
      return ui;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
      return null;
    }
  },

  startPair: async (api, pairKey, droneId) => {
    set({ pair: { loading: true, result: null, error: null, errorStatus: null } });
    try {
      const result = await api.pairDrone(pairKey, droneId);
      set({
        pair: { loading: false, result, error: null, errorStatus: null },
        status: { ...get().status, paired_drone: result.paired_drone_id },
      });
    } catch (err) {
      const { message, status } = errorMessage(err);
      set({
        pair: { loading: false, result: null, error: message, errorStatus: status },
      });
    }
  },

  unpair: async (api) => {
    try {
      await api.unpairDrone();
      set({
        pair: INITIAL_PAIR,
        status: { ...get().status, paired_drone: null },
      });
    } catch (err) {
      const { message, status } = errorMessage(err);
      set({
        pair: { ...get().pair, error: message, errorStatus: status, loading: false },
      });
    }
  },

  clearPair: () => set({ pair: INITIAL_PAIR }),

  // ============================================================
  // Phase 2 actions (Wave C)
  // ============================================================

  loadPic: async (api) => {
    set({ pic: { ...get().pic, loading: true, error: null } });
    try {
      const s = await api.getPicState();
      set({
        pic: {
          state: s.state,
          claimed_by: s.claimed_by,
          claim_counter: s.claim_counter,
          primary_gamepad_id: s.primary_gamepad_id,
          loading: false,
          error: null,
        },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({ pic: { ...get().pic, loading: false, error: message } });
    }
  },

  claimPic: async (api, clientId, opts) => {
    set({ pic: { ...get().pic, loading: true, error: null } });
    try {
      const res = await api.claimPic(clientId, opts?.confirmToken, opts?.force);
      set({
        pic: {
          ...get().pic,
          loading: false,
          claimed_by: res.claimed_by,
          claim_counter: res.claim_counter,
          state: res.claimed ? "claimed" : get().pic.state,
          error: null,
        },
      });
      return res.claimed;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ pic: { ...get().pic, loading: false, error: message } });
      return false;
    }
  },

  releasePic: async (api, clientId) => {
    set({ pic: { ...get().pic, loading: true, error: null } });
    try {
      const res = await api.releasePic(clientId);
      set({
        pic: {
          ...get().pic,
          loading: false,
          claimed_by: res.claimed_by,
          state: res.released ? "idle" : get().pic.state,
          error: null,
        },
      });
      return res.released;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ pic: { ...get().pic, loading: false, error: message } });
      return false;
    }
  },

  pollPicHeartbeat: (api, clientId) => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await api.heartbeatPic(clientId);
        if (!res.ok && res.orphaned) {
          // Agent auto-released the claim. Reset local state to idle.
          const current = get().pic;
          set({
            pic: {
              ...current,
              state: "idle",
              claimed_by: null,
              error: null,
            },
          });
        }
      } catch {
        // Network glitches are expected during uplink failover. Swallow
        // and let the next tick try again. WebSocket events remain the
        // authoritative signal for claim state.
      }
    };
    // Fire once immediately so the agent sees a live client without waiting
    // a full interval, then settle into the 10 s cadence.
    void tick();
    const handle = setInterval(tick, 10_000);
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  },

  subscribePicWs: (api) => {
    return api.subscribePicEvents((event: PicEvent) => {
      const current = get().pic;
      if (event.type === "state" || event.type === "claimed" || event.type === "released") {
        set({
          pic: {
            ...current,
            state: (event as { state?: string }).state ?? current.state,
            claimed_by:
              (event as { claimed_by?: string | null }).claimed_by !== undefined
                ? ((event as { claimed_by: string | null }).claimed_by)
                : current.claimed_by,
            claim_counter:
              (event as { claim_counter?: number }).claim_counter ?? current.claim_counter,
            primary_gamepad_id:
              (event as { primary_gamepad_id?: string | null }).primary_gamepad_id !== undefined
                ? ((event as { primary_gamepad_id: string | null }).primary_gamepad_id)
                : current.primary_gamepad_id,
          },
        });
      } else if (event.type === "gamepad_changed") {
        set({
          pic: {
            ...current,
            primary_gamepad_id:
              (event as { primary_gamepad_id?: string | null }).primary_gamepad_id ?? null,
          },
        });
      }
    });
  },

  loadGamepads: async (api) => {
    set({ gamepads: { ...get().gamepads, loading: true } });
    try {
      const list = await api.listGamepads();
      set({
        gamepads: {
          devices: list.devices,
          primary_id: list.primary_id,
          loading: false,
        },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        gamepads: { ...get().gamepads, loading: false },
        lastError: message,
      });
    }
  },

  applyPrimaryGamepad: async (api, deviceId) => {
    try {
      const list = await api.setPrimaryGamepad(deviceId);
      set({
        gamepads: {
          devices: list.devices,
          primary_id: list.primary_id,
          loading: false,
        },
      });
      return true;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
      return false;
    }
  },

  scanBluetooth: async (api, durationS) => {
    set({
      bluetooth: { ...get().bluetooth, scanning: true, error: null, scan_results: [] },
    });
    try {
      const res = await api.scanBluetooth(durationS ?? 10);
      set({
        bluetooth: {
          ...get().bluetooth,
          scanning: false,
          scan_results: res.devices,
          error: null,
        },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        bluetooth: { ...get().bluetooth, scanning: false, error: message },
      });
    }
  },

  pairBluetooth: async (api, mac) => {
    set({ bluetooth: { ...get().bluetooth, pairing_mac: mac, error: null } });
    try {
      const res = await api.pairBluetooth(mac);
      set({ bluetooth: { ...get().bluetooth, pairing_mac: null, error: null } });
      if (res.paired) {
        // refresh paired list
        try {
          const list = await api.getPairedBluetooth();
          set({ bluetooth: { ...get().bluetooth, paired: list.devices } });
        } catch {
          // non-fatal
        }
      }
      return res.paired;
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        bluetooth: { ...get().bluetooth, pairing_mac: null, error: message },
      });
      return false;
    }
  },

  forgetBluetooth: async (api, mac) => {
    try {
      const res = await api.forgetBluetooth(mac);
      if (res.forgotten) {
        const remaining = get().bluetooth.paired.filter((d) => d.mac !== mac);
        set({ bluetooth: { ...get().bluetooth, paired: remaining } });
      }
      return res.forgotten;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ bluetooth: { ...get().bluetooth, error: message } });
      return false;
    }
  },

  loadPairedBluetooth: async (api) => {
    try {
      const list = await api.getPairedBluetooth();
      set({
        bluetooth: { ...get().bluetooth, paired: list.devices, error: null },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({ bluetooth: { ...get().bluetooth, error: message } });
    }
  },

  loadDisplay: async (api) => {
    try {
      const d = await api.getDisplay();
      set({ display: d });
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
    }
  },

  applyDisplay: async (api, update) => {
    try {
      const d = await api.setDisplay(update);
      set({ display: d });
      return d;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
      return null;
    }
  },

  // ============================================================
  // Phase 3 actions (Wave C) - network client, modem, uplink
  // ============================================================

  scanWifiNetworks: async (api, timeoutS) => {
    set({
      wifiScan: { ...get().wifiScan, scanning: true, error: null },
    });
    try {
      const res = await api.scanWifiClient(timeoutS ?? 10);
      const results = [...res.networks].sort((a, b) => b.signal - a.signal);
      set({
        wifiScan: {
          results,
          scanning: false,
          scannedAt: Date.now(),
          error: null,
        },
      });
      return results;
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        wifiScan: { ...get().wifiScan, scanning: false, error: message },
      });
      return [];
    }
  },

  joinWifi: async (api, ssid, passphrase, force) => {
    try {
      const res = await api.joinWifiClient(ssid, passphrase, force);
      if (res.joined) {
        // refresh network on success
        try {
          const net = await api.getNetwork();
          const modemFromNet = net.modem_4g ?? net.modem ?? null;
          set({
            network: net,
            ap: net.ap,
            modem: modemFromNet,
          });
        } catch {
          // non-fatal
        }
      }
      return { joined: res.joined, needsForce: Boolean(res.needs_force), error: null };
    } catch (err) {
      const { message, status } = errorMessage(err);
      let needsForce = status === 409;
      if (err instanceof GroundStationApiError) {
        try {
          const parsed = JSON.parse(err.body) as { needs_force?: boolean; detail?: { needs_force?: boolean } };
          if (parsed.needs_force || parsed.detail?.needs_force) needsForce = true;
        } catch {
          // ignore parse failure
        }
      }
      return { joined: false, needsForce, error: message };
    }
  },

  leaveWifi: async (api) => {
    try {
      await api.leaveWifiClient();
      try {
        const net = await api.getNetwork();
        set({ network: net, ap: net.ap });
      } catch {
        // non-fatal
      }
      return true;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
      return false;
    }
  },

  loadModem: async (api) => {
    try {
      const m = await api.getModem();
      const currentUplink = get().uplink;
      set({
        modem: m,
        uplink: {
          ...currentUplink,
          data_cap: m.data_cap ?? currentUplink.data_cap,
        },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
    }
  },

  applyModem: async (api, update) => {
    try {
      const m = await api.setModem(update);
      const currentUplink = get().uplink;
      set({
        modem: m,
        uplink: {
          ...currentUplink,
          data_cap: m.data_cap ?? currentUplink.data_cap,
        },
      });
      return m;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
      return null;
    }
  },

  loadPriority: async (api) => {
    try {
      const res = await api.getPriority();
      const currentUplink = get().uplink;
      set({
        uplink: { ...currentUplink, priority: res.priority },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
    }
  },

  applyPriority: async (api, priority) => {
    // capture full slice for optimistic revert
    const prevUplink = get().uplink;
    // optimistic update
    set({ uplink: { ...prevUplink, priority } });
    try {
      const res = await api.setPriority(priority);
      set({
        uplink: { ...get().uplink, priority: res.priority },
      });
      return res.priority;
    } catch (err) {
      const { message } = errorMessage(err);
      // revert full slice on failure, surface error
      set({
        uplink: { ...prevUplink, error: message },
      });
      return null;
    }
  },

  toggleShareUplink: async (api, enabled) => {
    try {
      const res = await api.setShareUplink(enabled);
      const prev = get().network;
      if (prev) {
        set({ network: { ...prev, share_uplink: res.enabled } });
      }
      return res.enabled;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ lastError: message });
      return null;
    }
  },

  subscribeUplinkWs: (api) => {
    return api.subscribeUplinkEvents((event: UplinkEvent) => {
      const current = get().uplink;
      if (event.type === "state") {
        const e = event as {
          active?: string | null;
          priority?: string[];
          health?: UplinkHealth;
        };
        set({
          uplink: {
            ...current,
            active: e.active ?? current.active,
            priority: e.priority ?? current.priority,
            health: e.health ?? current.health,
          },
        });
      } else if (event.type === "active") {
        const e = event as { iface: string };
        set({
          uplink: { ...current, active: e.iface },
        });
      } else if (event.type === "priority") {
        const e = event as { priority: string[] };
        set({
          uplink: { ...current, priority: e.priority },
        });
      } else if (event.type === "health") {
        const e = event as { health: UplinkHealth };
        set({
          uplink: { ...current, health: e.health },
        });
      } else if (event.type === "failover") {
        const e = event as {
          from: string | null;
          to: string;
          reason: string;
          timestamp?: number;
        };
        const entry: UplinkFailoverEntry = {
          from: e.from,
          to: e.to,
          reason: e.reason,
          timestamp: e.timestamp ?? Date.now(),
        };
        const nextLog = [entry, ...current.failover_log].slice(0, FAILOVER_LOG_CAP);
        set({
          uplink: {
            ...current,
            active: e.to,
            failover_log: nextLog,
          },
        });
      } else if (event.type === "data_cap") {
        const e = event as {
          state: "ok" | "warn_80" | "throttle_95" | "blocked_100";
          percent: number;
          used_mb: number;
          cap_mb: number;
        };
        set({
          uplink: {
            ...current,
            data_cap: {
              state: e.state,
              percent: e.percent,
              used_mb: e.used_mb,
              cap_mb: e.cap_mb,
            },
          },
        });
      }
    });
  },

  // ============================================================
  // Phase 4 Wave 2 - Ethernet static-IP config
  // Backend endpoint lands in Wave 3 (Violas). 404 surfaces as a
  // clear "backend pending" signal so the form does not look broken.
  // ============================================================

  loadEthernetConfig: async (api) => {
    try {
      const cfg = await api.getEthernetConfig();
      set({ ethernetConfig: cfg });
      return cfg;
    } catch (err) {
      const { message, status } = errorMessage(err);
      if (status === 404) {
        // Wave 3 backend not yet shipped. Do not pollute lastError.
        return null;
      }
      set({ lastError: message });
      return null;
    }
  },

  applyEthernetConfig: async (api, update) => {
    try {
      const cfg = await api.setEthernetConfig(update);
      const prev = get().ethernetConfig;
      const merged = prev ? { ...prev, ...cfg } : cfg;
      set({ ethernetConfig: merged });
      return { config: merged, error: null, backendPending: false };
    } catch (err) {
      const { message, status } = errorMessage(err);
      if (status === 404) {
        return {
          config: null,
          error: "Ethernet config backend pending (Phase 4 Wave 3)",
          backendPending: true,
        };
      }
      return { config: null, error: message, backendPending: false };
    }
  },

  // ============================================================
  // Phase 4 Wave 3 - Peripheral Manager
  // ============================================================

  loadPeripherals: async (api) => {
    set({ peripherals: { ...get().peripherals, loading: true, error: null } });
    try {
      const res = await api.listPeripherals();
      set({
        peripherals: {
          ...get().peripherals,
          list: res.peripherals,
          loading: false,
          error: null,
        },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        peripherals: { ...get().peripherals, loading: false, error: message },
      });
    }
  },

  loadPeripheralDetail: async (api, id) => {
    try {
      const detail = await api.getPeripheral(id);
      const current = get().peripherals;
      set({
        peripherals: {
          ...current,
          detail: { ...current.detail, [id]: detail },
          error: null,
        },
      });
      return detail;
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        peripherals: { ...get().peripherals, error: message },
      });
      return null;
    }
  },

  configurePeripheral: async (api, id, config) => {
    try {
      const res = await api.configurePeripheral(id, config);
      return Boolean(res.saved);
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        peripherals: { ...get().peripherals, error: message },
      });
      return false;
    }
  },

  invokePeripheralAction: async (api, id, actionId, body) => {
    try {
      const res = await api.invokePeripheralAction(id, actionId, body);
      return res;
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        peripherals: { ...get().peripherals, error: message },
      });
      return null;
    }
  },

  // --- Distributed receive + mesh actions -------------------------------

  loadRole: async (api) => {
    set({ role: { ...get().role, loading: true, error: null } });
    try {
      const info = await api.getRole();
      set({ role: { info, loading: false, switching: false, error: null } });
    } catch (err) {
      const { message, status } = errorMessage(err);
      // A 404 on /role means the agent is running in drone profile,
      // not ground-station. Surface a specific, actionable hint
      // instead of the raw error so the operator knows what to fix.
      const friendly =
        status === 404
          ? "This agent is not in ground-station profile. Reinstall with install.sh --with-mesh or set agent.profile = ground-station in /etc/ados/config.yaml."
          : message;
      set({ role: { ...get().role, loading: false, error: friendly } });
    }
  },

  applyRole: async (api, role) => {
    set({ role: { ...get().role, switching: true, error: null } });
    try {
      const info = await api.setRole(role);
      set({ role: { info, loading: false, switching: false, error: null } });
      return info;
    } catch (err) {
      const { message, status } = errorMessage(err);
      // 409 on PUT /role means the relay cannot switch until it has
      // an approved invite bundle. 403 means mesh_capable=false (no
      // second USB dongle, or --with-mesh was not run). Both benefit
      // from specific guidance.
      const friendly =
        status === 409 && role === "relay"
          ? "Relay role needs an approved invite bundle first. Pair with the receiver from the OLED, then retry."
          : status === 403
            ? "Mesh role requires mesh capability on this node. Rerun install.sh --with-mesh."
            : message;
      set({ role: { ...get().role, switching: false, error: friendly } });
      return null;
    }
  },

  loadDistributedRx: async (api) => {
    const currentRole = get().role.info?.current ?? "direct";
    if (currentRole === "direct") {
      set({ distributedRx: { ...INITIAL_DISTRIBUTED_RX } });
      return;
    }
    set({
      distributedRx: { ...get().distributedRx, loading: true, error: null },
    });
    try {
      if (currentRole === "receiver") {
        const [relays, combined, pending] = await Promise.all([
          api.getWfbReceiverRelays(),
          api.getWfbReceiverCombined(),
          api.getPairingPending(),
        ]);
        set({
          distributedRx: {
            ...get().distributedRx,
            receiverRelays: relays.relays,
            combined,
            relayStatus: null,
            pairingWindowOpen: !!pending.open,
            pairingWindowExpiresAt: pending.closes_at_ms ?? null,
            pendingRequests: pending.pending ?? [],
            loading: false,
            error: null,
          },
        });
      } else if (currentRole === "relay") {
        const relayStatus = await api.getWfbRelayStatus();
        set({
          distributedRx: {
            ...get().distributedRx,
            receiverRelays: [],
            combined: null,
            relayStatus,
            pairingWindowOpen: false,
            pairingWindowExpiresAt: null,
            pendingRequests: [],
            loading: false,
            error: null,
          },
        });
      }
    } catch (err) {
      const { message, status } = errorMessage(err);
      // 503 on /wfb/receiver/* means the UDP socket failed to bind on
      // `bat0:5801`. Usually the mesh carrier is not up yet or another
      // process holds the port. Give the operator a specific pointer
      // rather than surfacing the raw "pairing_bind_failed" body.
      const friendly =
        status === 503
          ? "WFB receiver cannot bind to UDP 5801 on bat0. Confirm `bat0` is up (ados gs mesh health) and no other process is holding the port."
          : message;
      set({
        distributedRx: {
          ...get().distributedRx,
          loading: false,
          error: friendly,
        },
      });
    }
  },

  loadMesh: async (api) => {
    const currentRole = get().role.info?.current ?? "direct";
    if (currentRole === "direct") {
      set({ mesh: { ...INITIAL_MESH } });
      return;
    }
    set({ mesh: { ...get().mesh, loading: true, error: null } });
    try {
      const [health, neighbors, routes, gateways] = await Promise.all([
        api.getMeshHealth(),
        api.getMeshNeighbors(),
        api.getMeshRoutes(),
        api.getMeshGateways(),
      ]);
      set({
        mesh: {
          ...get().mesh,
          health,
          neighbors: neighbors.neighbors,
          routes: routes.routes,
          gateways: gateways.gateways,
          selectedGateway: gateways.selected,
          loading: false,
          error: null,
        },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({ mesh: { ...get().mesh, loading: false, error: message } });
    }
  },

  pinMeshGateway: async (api, update) => {
    try {
      await api.setMeshGatewayPreference(update);
      return true;
    } catch (err) {
      const { message } = errorMessage(err);
      set({ mesh: { ...get().mesh, error: message } });
      return false;
    }
  },

  openPairingWindow: async (api, duration_s = 60) => {
    try {
      const window = await api.openPairingWindow(duration_s);
      set({
        distributedRx: {
          ...get().distributedRx,
          pairingWindowOpen: true,
          pairingWindowExpiresAt: window.closes_at_ms,
          error: null,
        },
      });
      return true;
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        distributedRx: { ...get().distributedRx, error: message },
      });
      return false;
    }
  },

  closePairingWindow: async (api) => {
    try {
      await api.closePairingWindow();
      set({
        distributedRx: {
          ...get().distributedRx,
          pairingWindowOpen: false,
          pairingWindowExpiresAt: null,
          pendingRequests: [],
          error: null,
        },
      });
      return true;
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        distributedRx: { ...get().distributedRx, error: message },
      });
      return false;
    }
  },

  approvePairing: async (api, device_id) => {
    try {
      await api.approvePairing(device_id);
      // Next loadPairingPending / poll will drop the approved entry.
      return true;
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        distributedRx: { ...get().distributedRx, error: message },
      });
      return false;
    }
  },

  revokeRelay: async (api, device_id) => {
    try {
      await api.revokeRelay(device_id);
      set({
        distributedRx: {
          ...get().distributedRx,
          receiverRelays: get().distributedRx.receiverRelays.filter(
            (r) => r.mac !== device_id,
          ),
          error: null,
        },
      });
      return true;
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        distributedRx: { ...get().distributedRx, error: message },
      });
      return false;
    }
  },

  loadPairingPending: async (api) => {
    try {
      const snap = await api.getPairingPending();
      set({
        distributedRx: {
          ...get().distributedRx,
          pairingWindowOpen: !!snap.open,
          pairingWindowExpiresAt: snap.closes_at_ms ?? null,
          pendingRequests: snap.pending ?? [],
          error: null,
        },
      });
    } catch (err) {
      const { message } = errorMessage(err);
      set({
        distributedRx: { ...get().distributedRx, error: message },
      });
    }
  },

  subscribeMeshWs: (api) => {
    // Coalesce neighbor churn into a single `loadMesh` call per
    // 500 ms window so a storm of `neighbor_join` / `neighbor_leave`
    // events during mesh convergence does not stampede the agent REST
    // surface. First event within a quiet window schedules the poll;
    // subsequent events inside the window no-op.
    let meshPollTimer: ReturnType<typeof setTimeout> | null = null;
    const NEIGHBOR_DEBOUNCE_MS = 500;
    const scheduleNeighborPoll = () => {
      if (meshPollTimer) return;
      meshPollTimer = setTimeout(() => {
        meshPollTimer = null;
        // Intentionally fire-and-forget. If this load errors, the
        // periodic 3 s poll in hardware/mesh/page.tsx will recover.
        void get().loadMesh(api);
      }, NEIGHBOR_DEBOUNCE_MS);
    };

    return api.subscribeMeshEvents(
      (evt: MeshEvent) => {
        const state = get();
        if (evt.bus === "mesh") {
          if (evt.kind === "role_changed") {
          // Optimistic: let the next /role poll confirm.
          const info = state.role.info;
          if (info) {
            const nextRole = (evt.payload.role as GroundStationRole) ?? info.current;
            set({
              role: { ...state.role, info: { ...info, current: nextRole } },
            });
          }
        } else if (evt.kind === "neighbor_join" || evt.kind === "neighbor_leave") {
          // Trigger a fresh mesh poll; the next loadMesh catches up.
          // Debounced so a convergence storm does not stampede HTTP.
          scheduleNeighborPoll();
        } else if (evt.kind === "gateway_changed") {
          set({
            mesh: {
              ...state.mesh,
              selectedGateway: (evt.payload.selected as string | null) ?? null,
            },
          });
        } else if (evt.kind === "partition_detected") {
          if (state.mesh.health) {
            set({
              mesh: { ...state.mesh, health: { ...state.mesh.health, partition: true } },
            });
          }
        } else if (evt.kind === "partition_healed") {
          if (state.mesh.health) {
            set({
              mesh: { ...state.mesh, health: { ...state.mesh.health, partition: false } },
            });
          }
        } else if (
          evt.kind === "receiver_unreachable"
          || evt.kind === "relay_disconnected"
        ) {
          set({
            mesh: {
              ...state.mesh,
              lastTransientEvent: {
                kind: evt.kind,
                payload: evt.payload,
                ts: evt.timestamp_ms || Date.now(),
              },
            },
          });
        }
      } else if (evt.bus === "pair") {
        if (evt.kind === "accept_window_opened") {
          set({
            distributedRx: {
              ...state.distributedRx,
              pairingWindowOpen: true,
            },
          });
        } else if (evt.kind === "accept_window_closed") {
          set({
            distributedRx: {
              ...state.distributedRx,
              pairingWindowOpen: false,
              pairingWindowExpiresAt: null,
              pendingRequests: [],
            },
          });
        } else if (evt.kind === "revoked") {
          set({
            mesh: {
              ...state.mesh,
              lastTransientEvent: {
                kind: "relay_revoked",
                payload: evt.payload,
                ts: evt.timestamp_ms || Date.now(),
              },
            },
          });
        }
      }
      },
      (wsState: "connected" | "reconnecting" | "closed") => {
        const prev = get().mesh;
        set({
          mesh: {
            ...prev,
            wsState,
            // Stamp the first transition away from "connected" so the
            // UI can render "Lost for N seconds" and decide how loud a
            // banner to show. Clear the stamp when we reconnect.
            wsDisconnectedAt:
              wsState === "connected"
                ? null
                : prev.wsState === "connected"
                  ? Date.now()
                  : prev.wsDisconnectedAt,
          },
        });
        if (wsState === "closed" && meshPollTimer) {
          clearTimeout(meshPollTimer);
          meshPollTimer = null;
        }
      },
    );
  },

  resetAll: () =>
    set({
      linkHealth: INITIAL_LINK_HEALTH,
      wfbConfig: null,
      status: INITIAL_STATUS,
      loading: false,
      lastError: null,
      lastFetchedAt: null,
      network: null,
      ap: null,
      pair: INITIAL_PAIR,
      ui: null,
      pic: INITIAL_PIC,
      gamepads: INITIAL_GAMEPADS,
      bluetooth: INITIAL_BLUETOOTH,
      display: null,
      wifiScan: INITIAL_WIFI_SCAN,
      modem: null,
      uplink: INITIAL_UPLINK,
      ethernetConfig: null,
      peripherals: INITIAL_PERIPHERALS,
      role: INITIAL_ROLE,
      distributedRx: INITIAL_DISTRIBUTED_RX,
      mesh: INITIAL_MESH,
    }),
}));
