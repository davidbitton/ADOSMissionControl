/**
 * Shared types for the ground-station store slices. Lifted out of the main
 * store file so consumers have a single import home for slice shapes.
 *
 * @module stores/ground-station/types
 */

import type {
  ApStatus,
  BluetoothDevice,
  DisplayConfig,
  EthernetConfig,
  Gamepad,
  MeshGateway,
  MeshHealth,
  MeshNeighbor,
  MeshRoute,
  ModemStatus,
  NetworkStatus,
  PairingPendingRequest,
  PairResult,
  PeripheralDetail,
  PeripheralSummary,
  RoleInfo,
  UiConfig,
  UplinkFailoverEntry,
  UplinkHealth,
  WfbReceiverCombined,
  WfbReceiverRelay,
  WfbRelayStatus,
  WifiScanResult,
} from "@/lib/api/ground-station-api";

export interface GroundStationLinkHealth {
  rssi_dbm: number | null;
  bitrate_mbps: number | null;
  fec_rec: number;
  fec_lost: number;
  channel: number | null;
}

export type WfbBitrateProfile = "low-latency" | "balanced" | "long-range";

export interface WfbConfig {
  channel: number;
  bitrate_profile: WfbBitrateProfile;
}

export type GroundStationProfile =
  | "ground_station"
  | "drone"
  | "auto"
  | "unconfigured";

export interface GroundStationStatus {
  paired_drone: string | null;
  profile: GroundStationProfile;
  uplink_active: string | null;
}

export interface PairSlice {
  loading: boolean;
  result: PairResult | null;
  error: string | null;
  errorStatus: number | null;
}

export interface PicSlice {
  state: string;
  claimed_by: string | null;
  claim_counter: number;
  primary_gamepad_id: string | null;
  loading: boolean;
  error: string | null;
}

export interface GamepadsSlice {
  devices: Gamepad[];
  primary_id: string | null;
  loading: boolean;
}

export interface BluetoothSlice {
  scanning: boolean;
  scan_results: BluetoothDevice[];
  paired: BluetoothDevice[];
  pairing_mac: string | null;
  error: string | null;
}

export interface WifiScanCache {
  results: WifiScanResult[];
  scanning: boolean;
  scannedAt: number | null;
  error: string | null;
}

export interface UplinkDataCap {
  state: "ok" | "warn_80" | "throttle_95" | "blocked_100";
  percent: number;
  used_mb: number;
  cap_mb: number;
}

export interface UplinkSlice {
  active: string | null;
  priority: string[];
  health: UplinkHealth;
  failover_log: UplinkFailoverEntry[];
  data_cap: UplinkDataCap | null;
  loading: boolean;
  error: string | null;
}

export interface PeripheralsSlice {
  list: PeripheralSummary[];
  detail: Record<string, PeripheralDetail>;
  loading: boolean;
  error: string | null;
}

// Distributed receive + mesh slices.

export interface RoleSlice {
  info: RoleInfo | null;
  loading: boolean;
  switching: boolean;
  error: string | null;
}

export interface DistributedRxSlice {
  /** Receiver view of remote relays; empty on relay/direct nodes. */
  receiverRelays: WfbReceiverRelay[];
  /** Receiver combined FEC output; null on relay/direct nodes. */
  combined: WfbReceiverCombined | null;
  /** Relay view of its local forwarder state; null on receiver/direct nodes. */
  relayStatus: WfbRelayStatus | null;
  pairingWindowOpen: boolean;
  pairingWindowExpiresAt: number | null;
  pendingRequests: PairingPendingRequest[];
  loading: boolean;
  error: string | null;
}

export interface MeshTransientEvent {
  kind: string;
  payload: Record<string, unknown>;
  ts: number;
}

export type MeshWsState = "idle" | "connected" | "reconnecting" | "closed";

export interface MeshSlice {
  health: MeshHealth | null;
  neighbors: MeshNeighbor[];
  routes: MeshRoute[];
  gateways: MeshGateway[];
  selectedGateway: string | null;
  /** Latest transient (toast-worthy) event the WS surfaced. */
  lastTransientEvent: MeshTransientEvent | null;
  /** Live mesh WS connection state so the UI can surface a
   * "connection lost / reconnecting" banner instead of silently
   * missing neighbor / gateway / pair events. */
  wsState: MeshWsState;
  /** Epoch ms the ws last left the connected state. Null while connected
   * or while we have never connected. */
  wsDisconnectedAt: number | null;
  loading: boolean;
  error: string | null;
}
