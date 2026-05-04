/**
 * @module AgentTypes
 * @description TypeScript types for the ADOS Drone Agent REST API.
 * @license GPL-3.0-only
 */

/**
 * Agent /api/version response. Capability flags are stable string keys
 * the GCS uses to gate features; an older agent simply omits the flag.
 */
export interface AgentVersionInfo {
  api_version: string;
  agent_version: string;
  capabilities: string[];
}

export interface BoardInfo {
  name: string;
  model: string;
  tier: number;
  ram_mb: number;
  cpu_cores: number;
  vendor: string;
  soc: string;
  arch: string;
  hw_video_codecs: string[];
}

export interface HealthInfo {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  temperature: number | null;
  timestamp: string;
}

export interface AgentStatus {
  version: string;
  uptime_seconds: number;
  board: BoardInfo;
  health: HealthInfo;
  fc_connected: boolean;
  fc_port: string;
  fc_baud: number;
}

export interface ServiceInfo {
  name: string;
  status: "running" | "stopped" | "error" | "degraded" | "starting" | "circuit_open";
  pid: number | null;
  cpu_percent: number;
  memory_mb: number;
  uptime_seconds: number;
  category?: "core" | "hardware" | "suite" | "ondemand";
}

export interface SystemResources {
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  temperature: number | null;
}

export interface TelemetrySnapshot {
  lat: number;
  lon: number;
  alt: number;
  relative_alt: number;
  heading: number;
  groundspeed: number;
  airspeed: number;
  roll: number;
  pitch: number;
  yaw: number;
  battery_voltage: number;
  battery_current: number;
  battery_remaining: number;
  gps_fix: number;
  satellites: number;
  mode: string;
  armed: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warning" | "error";
  service: string;
  message: string;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export type PeripheralCategory = "sensor" | "camera" | "video" | "gimbal" | "compute";

export interface PeripheralInfo {
  name: string;
  type: string;
  category: PeripheralCategory;
  bus: string;
  address: string;
  rate_hz: number;
  status: "ok" | "warning" | "error" | "offline";
  last_reading: string;
}

export interface ScriptInfo {
  id: string;
  name: string;
  content: string;
  suite?: string;
  lastModified: string;
}

export interface ScriptRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface SuiteInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  sensorsRequired: string[];
  tierRequired: number;
  version: string;
  installed: boolean;
  active: boolean;
  category: "security" | "mapping" | "agriculture" | "logistics" | "rescue" | "inspection";
}

export interface MeshNetEnrollment {
  enrolled: boolean;
  droneId?: string;
  fleetName?: string;
  tier?: number;
  enrolledSince?: string;
}

export interface NetworkPeer {
  id: string;
  name: string;
  signal_dbm: number;
  last_seen: string;
  battery_percent: number;
  distance_m: number;
  tier: number;
  link_type: string;
}

// ── Video ──────────────────────────────────────────────

export interface VideoStatus {
  state: "not_initialized" | "stopped" | "starting" | "running" | "error";
  whep_url: string | null;
  encoder: string | null;
  cameras: {
    cameras: Array<{
      name: string;
      type: string;
      device_path: string;
      hardware_role: string;
    }>;
    assignments: Record<string, unknown>;
  };
  mediamtx: { running: boolean; webrtc_port: number };
  dependencies?: Record<string, { found: boolean; path: string | null }>;
}

// ── Setup / onboarding ─────────────────────────────────

export interface SetupAccessUrl {
  kind: "setup" | "api" | "mission_control" | "video" | "mavlink" | "cloud";
  label: string;
  url: string;
  source: "local" | "hotspot" | "usb" | "mdns" | "cloud" | "configured";
  primary: boolean;
}

export type SetupStepState =
  | "complete"
  | "needs_action"
  | "optional"
  | "blocked"
  | "not_applicable";

export interface SetupStep {
  id: string;
  label: string;
  state: SetupStepState;
  detail: string;
  action_label: string;
  href: string;
}

export interface CloudChoiceStatus {
  mode: "cloud" | "self_hosted" | "local";
  paired: boolean;
  pair_code_required: boolean;
  backend_url: string;
  backend_reachable: boolean;
  last_checked: string | null;
}

export interface ProfileSuggestion {
  detected: "drone" | "ground_station" | "unconfigured";
  ground_role_hint: "direct" | "relay" | "receiver";
  ground_score: number;
  air_score: number;
  mesh_capable: boolean;
  signals: Record<string, boolean>;
  confirmed: boolean;
  detected_at: string | null;
}

export type HardwareCheckItemState =
  | "ok"
  | "missing"
  | "warning"
  | "checking"
  | "unknown";

export interface HardwareCheckItem {
  id: string;
  label: string;
  required: boolean;
  state: HardwareCheckItemState;
  detail: string;
  fix_hint: string;
}

export interface HardwareCheckStatus {
  profile: string;
  ground_role: string;
  items: HardwareCheckItem[];
  last_run: string;
}

export interface SetupActionResult {
  ok: boolean;
  message: string;
  data: Record<string, unknown>;
}

export interface SetupStatus {
  version: string;
  device_id: string;
  device_name: string;
  profile: string;
  /** Distributed-RX role for ground-station profile. Empty for drone profile. */
  ground_role?: string;
  setup_complete: boolean;
  setup_finalized?: boolean;
  completion_percent: number;
  next_action: string;
  steps: SetupStep[];
  access_urls: SetupAccessUrl[];
  network: {
    hostname: string;
    mdns_host: string;
    api_port: number;
    hotspot_enabled: boolean;
    hotspot_ssid: string;
    local_ips: string[];
  };
  mavlink: {
    connected: boolean;
    port: string | null;
    baud: number | null;
    websocket_url: string | null;
    public_websocket_url: string | null;
  };
  video: {
    state: string;
    whep_url: string | null;
    public_whep_url: string | null;
    recording: boolean;
  };
  remote_access: {
    provider: "none" | "cloudflare";
    enabled: boolean;
    configured: boolean;
    status: "disabled" | "configured" | "running" | "stopped" | "error";
    public_urls: string[];
    error: string;
  };
  services: Array<Record<string, unknown>>;
  telemetry: Record<string, unknown>;
  cloud_choice?: CloudChoiceStatus;
  profile_suggestion?: ProfileSuggestion;
  hardware_check?: HardwareCheckStatus | null;
  skipped_steps?: string[];
}

// ── Consolidated ───────────────────────────────────────

/** Response from `/api/status/full` (agent v0.3.19+). */
export interface FullStatusResponse {
  version: string;
  uptime_seconds: number;
  board: BoardInfo;
  health: HealthInfo;
  fc_connected: boolean;
  fc_port: string;
  fc_baud: number;
  services: Array<{ name: string; state: string; task_done: boolean; uptimeSeconds: number }>;
  resources: { cpu_percent: number; memory_percent: number; disk_percent: number; temperature: number | null };
  video: { state: string; whep_url: string | null };
  telemetry: Record<string, unknown>;
  /** Newer agents include the capabilities snapshot here. Optional for older agents. */
  capabilities?: Record<string, unknown>;
}

// ── Pairing ─────────────────────────────────────────────

export interface PairingInfo {
  device_id: string;
  name: string;
  version: string;
  board: string;
  paired: boolean;
  pairing_code?: string;
  owner_id?: string;
  paired_at?: number;
  mdns_host: string;
}

export interface ClaimResponse {
  api_key: string;
  device_id: string;
  name: string;
  mdns_host: string;
}
