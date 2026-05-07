/**
 * Typed shapes for the ADOS Ground Agent REST surface.
 * Lifted out of ground-station-api.ts to keep the API client focused on
 * HTTP wiring. Consumers continue to import types from
 * '@/lib/api/ground-station-api' via the barrel re-export.
 *
 * @module api/ground-station/types
 */

import type {
  GroundStationLinkHealth,
  GroundStationStatus as GroundStationStatusState,
} from "@/stores/ground-station-store";

export interface GroundStationStatusResponse extends GroundStationStatusState {
  link_health?: Partial<GroundStationLinkHealth>;
}

// Radio link snapshot, normalized to camelCase. The agent emits the
// equivalent block as snake_case on the wire; the cloud relay HTTP
// action and the local heartbeat decoder remap keys before this shape
// reaches Mission Control state.
export type RadioLinkState =
  | "absent"
  | "disconnected"
  | "connecting"
  | "connected"
  | "degraded";

export type RadioTopology = "host_vbus" | "powered_hub" | "external_5v";

export interface RadioState {
  state: RadioLinkState;
  iface: string | null;
  driver: string | null;
  channel: number | null;
  freqMhz: number | null;
  bandwidthMhz: number;
  txPowerDbm: number | null;
  txPowerMaxDbm: number;
  topology: RadioTopology;
  rssiDbm: number | null;
  bitrateKbps: number | null;
  fecRecovered: number;
  fecLost: number;
  packetsLost: number;
}

/** Response shape from PUT /api/wfb/tx-power. */
export interface SetTxPowerResult {
  requested_dbm: number;
  effective_dbm: number | null;
  tx_power_max_dbm: number;
}

// Network types
export interface ApStatus {
  enabled: boolean;
  ssid: string;
  passphrase: string;
  channel: number;
  connected_clients?: number | null;
}

export interface WifiClientStatus {
  available: boolean;
  connected?: boolean;
  ssid?: string | null;
  bssid?: string | null;
  rssi_dbm?: number | null;
  signal?: number | null;
  security?: string | null;
  ip?: string | null;
  gateway?: string | null;
}

export interface EthernetStatus {
  available: boolean;
  link?: boolean;
  speed_mbps?: number | null;
  ip?: string | null;
  gateway?: string | null;
  iface?: string | null;
}

// Ethernet static-IP config (backend pending)
export interface EthernetConfig {
  mode: "dhcp" | "static";
  ip?: string;       // IPv4 with prefix, e.g., "192.168.1.42/24"
  gateway?: string;
  dns?: string[];    // IPv4 addresses
}

export type EthernetConfigUpdate = Partial<EthernetConfig>;

// Peripheral Manager
export interface PeripheralMatch {
  vid?: string;
  pid?: string;
  regex?: string;
}

export interface PeripheralAction {
  id: string;
  display_name: string;
  requires_confirm: boolean;
  body_schema?: unknown;
}

export type PeripheralTransport = "usb" | "serial" | "network" | "ble";

export interface PeripheralSummary {
  id: string;
  display_name: string;
  transport: PeripheralTransport;
  connected: boolean;
  capabilities: string[];
}

export interface PeripheralDetail extends PeripheralSummary {
  match: PeripheralMatch;
  actions: PeripheralAction[];
  config_schema?: unknown;
  status_endpoint?: string;
  extra?: Record<string, unknown>;
}

export interface PeripheralListResponse {
  peripherals: PeripheralSummary[];
  count: number;
}

export type ModemConnState =
  | "disconnected"
  | "searching"
  | "registered"
  | "connected"
  | "error";

export type DataCapState = "ok" | "warn_80" | "throttle_95" | "blocked_100";

export interface ModemDataCap {
  state: DataCapState;
  percent: number;
  used_mb: number;
  cap_mb: number;
}

export interface ModemStatus {
  available: boolean;
  enabled?: boolean;
  state?: ModemConnState;
  carrier?: string | null;
  operator?: string | null;
  apn?: string | null;
  signal_bars?: number | null;
  signal_dbm?: number | null;
  iface?: string | null;
  ip?: string | null;
  data_cap?: ModemDataCap | null;
}

export interface ModemUpdate {
  apn?: string;
  cap_gb?: number;
  enabled?: boolean;
}

export type UplinkHealth = "ok" | "degraded" | "down";

export interface NetworkStatus {
  ap: ApStatus;
  wifi_client: WifiClientStatus;
  ethernet?: EthernetStatus;
  modem_4g?: ModemStatus;
  // legacy field
  modem?: ModemStatus;
  active_uplink?: string | null;
  priority?: string[];
  share_uplink?: boolean;
}

export interface ApUpdate {
  enabled?: boolean;
  ssid?: string;
  passphrase?: string;
  channel?: number;
}

export interface WifiScanResult {
  ssid: string;
  bssid: string;
  signal: number;
  security: string;
  in_use?: boolean;
}

export interface WifiScanResponse {
  networks: WifiScanResult[];
}

export interface WifiJoinResult {
  joined: boolean;
  ssid: string;
  needs_force?: boolean;
}

export interface WifiLeaveResult {
  previous_ssid: string | null;
}

export interface UplinkPriorityConfig {
  priority: string[];
}

export interface ShareUplinkResult {
  enabled: boolean;
}

export interface UplinkFailoverEntry {
  from: string | null;
  to: string;
  reason: string;
  timestamp: number;
}

export type UplinkEvent =
  | { type: "active"; iface: string; timestamp?: number }
  | { type: "priority"; priority: string[] }
  | { type: "health"; health: UplinkHealth; iface?: string }
  | { type: "failover"; from: string | null; to: string; reason: string; timestamp?: number }
  | { type: "data_cap"; state: DataCapState; percent: number; used_mb: number; cap_mb: number }
  | { type: "state"; active: string | null; priority: string[]; health: UplinkHealth }
  | { type: string; [key: string]: unknown };

// Pair types
export interface PairResult {
  paired_drone_id: string;
  paired_at: string;
  key_fingerprint: string;
}

export interface UnpairResult {
  unpaired: boolean;
  previous_drone_id: string | null;
}

// UI types
export interface OledConfig {
  brightness: number;
  auto_dim_enabled: boolean;
  screen_cycle_seconds: number;
}

export interface ButtonBinding {
  short_press?: string;
  long_press?: string;
}

export interface ButtonsConfig {
  [buttonId: string]: ButtonBinding;
}

export interface ScreensConfig {
  order: string[];
  enabled: string[];
}

export interface UiConfig {
  oled: OledConfig;
  buttons: ButtonsConfig;
  screens: ScreensConfig;
}

export interface OledUpdate {
  brightness?: number;
  auto_dim_enabled?: boolean;
  screen_cycle_seconds?: number;
}

export interface ScreensUpdate {
  order?: string[];
  enabled?: string[];
}

export interface FactoryResetResult {
  reset: boolean;
  timestamp: string;
}

// Display
export interface DisplayConfig {
  resolution: string;
  kiosk_enabled: boolean;
}

export interface DisplayUpdate {
  resolution?: string;
  kiosk_enabled?: boolean;
}

// Bluetooth
export interface BluetoothDevice {
  mac: string;
  name: string;
  rssi_dbm?: number | null;
  paired?: boolean;
  connected?: boolean;
}

export interface BluetoothScanResult {
  devices: BluetoothDevice[];
}

export interface BluetoothPairResult {
  paired: boolean;
  mac: string;
  name?: string | null;
}

export interface BluetoothForgetResult {
  forgotten: boolean;
  mac: string;
}

export interface BluetoothPairedList {
  devices: BluetoothDevice[];
}

// Gamepads
export interface Gamepad {
  device_id: string;
  name: string;
  type: "usb" | "bluetooth" | "unknown";
  connected: boolean;
  is_primary?: boolean;
}

export interface GamepadList {
  devices: Gamepad[];
  primary_id: string | null;
}

export interface GamepadPrimaryUpdate {
  primary_id: string | null;
}

// PIC (Pilot in Command)
export interface PicState {
  state: string;
  claimed_by: string | null;
  claim_counter: number;
  primary_gamepad_id: string | null;
}

export interface PicClaimResult {
  claimed: boolean;
  claimed_by: string | null;
  claim_counter: number;
  requires_confirm_token?: boolean;
}

export interface PicReleaseResult {
  released: boolean;
  claimed_by: string | null;
}

export interface PicConfirmTokenResult {
  confirm_token: string;
  expires_in_s: number;
}

export type PicEvent =
  | { type: "claimed"; claimed_by: string | null; claim_counter: number }
  | { type: "released"; claimed_by: string | null }
  | { type: "gamepad_changed"; primary_gamepad_id: string | null }
  | { type: "state"; state: string; claimed_by: string | null; claim_counter: number; primary_gamepad_id: string | null }
  | { type: string; [key: string]: unknown };

// Distributed receive + mesh types.

export type GroundStationRole = "direct" | "relay" | "receiver" | "unset";

export interface RoleInfo {
  /** Authoritative current role from the on-disk sentinel. */
  current: GroundStationRole;
  /** Pydantic-configured role; may differ from `current` during a transition. */
  configured: GroundStationRole;
  supported: GroundStationRole[];
  mesh_capable: boolean;
}

export interface MeshHealth {
  up: boolean;
  peer_count: number;
  selected_gateway: string | null;
  partition: boolean;
  mesh_id: string | null;
}

export interface MeshNeighbor {
  mac: string;
  iface: string;
  tq: number;
  last_seen_ms: number;
}

export interface MeshRoute {
  dest: string;
  via: string | null;
  metric: number | null;
}

export interface MeshGateway {
  mac: string;
  class_up_kbps: number;
  class_down_kbps: number;
  tq: number;
  selected: boolean;
}

export interface MeshGatewayPreferenceUpdate {
  mode: "auto" | "pinned" | "off";
  pinned_mac?: string | null;
}

export interface MeshConfig {
  mesh_id: string | null;
  carrier: "802.11s" | "ibss";
  channel: number;
  bat_iface: string;
  interface_override: string | null;
}

export interface MeshConfigUpdate {
  mesh_id?: string;
  carrier?: "802.11s" | "ibss";
  channel?: number;
}

export interface WfbRelayStatus {
  role: "relay";
  drone_iface: string;
  receiver_ip: string | null;
  receiver_port: number;
  receiver_last_seen_ms: number;
  fragments_seen: number;
  fragments_forwarded: number;
  up: boolean;
  mesh_iface: string;
}

export interface WfbReceiverRelay {
  mac: string;
  last_seen_ms: number;
  fragments: number;
}

export interface WfbReceiverCombined {
  fragments_after_dedup: number;
  fec_repaired: number;
  output_kbps: number;
  up: boolean;
}

export interface PairingWindow {
  opened_at_ms: number;
  closes_at_ms: number;
  duration_s: number;
}

export interface PairingPendingRequest {
  device_id: string;
  received_at_ms: number;
  remote_ip: string;
}

export interface PairingSnapshot {
  open: boolean;
  opened_at_ms?: number;
  closes_at_ms?: number;
  pending?: PairingPendingRequest[];
  approvals?: Record<string, number>;
}

export interface PairingApproveResult {
  device_id: string;
  invite_blob_hex: string;
  issued_at_ms: number;
  expires_at_ms: number;
}

export interface PairingRevokeResult {
  device_id: string;
  revoked: boolean;
}

export interface PairJoinRequest {
  receiver_host?: string | null;
  receiver_port?: number | null;
}

export interface PairJoinResult {
  mesh_id: string | null;
  receiver_host: string | null;
  ok: boolean;
}

/** Event envelope from /api/v1/ground-station/ws/mesh. */
export type MeshEvent =
  | {
      bus: "mesh";
      kind:
        | "role_changed"
        | "neighbor_join"
        | "neighbor_leave"
        | "partition_detected"
        | "partition_healed"
        | "gateway_changed"
        | "relay_connected"
        | "relay_disconnected"
        | "receiver_unreachable";
      timestamp_ms: number;
      payload: Record<string, unknown>;
    }
  | {
      bus: "pair";
      kind:
        | "accept_window_opened"
        | "accept_window_closed"
        | "join_request_received"
        | "join_approved"
        | "join_rejected"
        | "join_completed"
        | "revoked"
        | "psk_mismatch"
        | "bundle_expired";
      timestamp_ms: number;
      payload: Record<string, unknown>;
    };
