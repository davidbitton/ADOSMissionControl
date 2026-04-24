/**
 * Initial-state constants and internal helpers for the ground-station store.
 * Lifted out of the main store to keep the file focused on actions.
 *
 * @module stores/ground-station/initial-state
 */

import type {
  BluetoothSlice,
  DistributedRxSlice,
  GamepadsSlice,
  GroundStationLinkHealth,
  GroundStationStatus,
  MeshSlice,
  PairSlice,
  PeripheralsSlice,
  PicSlice,
  RoleSlice,
  UplinkSlice,
  WifiScanCache,
} from "./types";

export const INITIAL_LINK_HEALTH: GroundStationLinkHealth = {
  rssi_dbm: null,
  bitrate_mbps: null,
  fec_rec: 0,
  fec_lost: 0,
  channel: null,
};

export const INITIAL_STATUS: GroundStationStatus = {
  paired_drone: null,
  profile: "unconfigured",
  uplink_active: null,
};

export const INITIAL_PAIR: PairSlice = {
  loading: false,
  result: null,
  error: null,
  errorStatus: null,
};

export const INITIAL_PIC: PicSlice = {
  state: "idle",
  claimed_by: null,
  claim_counter: 0,
  primary_gamepad_id: null,
  loading: false,
  error: null,
};

export const INITIAL_GAMEPADS: GamepadsSlice = {
  devices: [],
  primary_id: null,
  loading: false,
};

export const INITIAL_BLUETOOTH: BluetoothSlice = {
  scanning: false,
  scan_results: [],
  paired: [],
  pairing_mac: null,
  error: null,
};

export const INITIAL_WIFI_SCAN: WifiScanCache = {
  results: [],
  scanning: false,
  scannedAt: null,
  error: null,
};

export const INITIAL_UPLINK: UplinkSlice = {
  active: null,
  priority: [],
  health: "ok",
  failover_log: [],
  data_cap: null,
  loading: false,
  error: null,
};

export const INITIAL_PERIPHERALS: PeripheralsSlice = {
  list: [],
  detail: {},
  loading: false,
  error: null,
};

export const INITIAL_ROLE: RoleSlice = {
  info: null,
  loading: false,
  switching: false,
  error: null,
};

export const INITIAL_DISTRIBUTED_RX: DistributedRxSlice = {
  receiverRelays: [],
  combined: null,
  relayStatus: null,
  pairingWindowOpen: false,
  pairingWindowExpiresAt: null,
  pendingRequests: [],
  loading: false,
  error: null,
};

export const INITIAL_MESH: MeshSlice = {
  health: null,
  neighbors: [],
  routes: [],
  gateways: [],
  selectedGateway: null,
  lastTransientEvent: null,
  wsState: "idle",
  wsDisconnectedAt: null,
  loading: false,
  error: null,
};

export const FAILOVER_LOG_CAP = 20;
