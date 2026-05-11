/**
 * @module FeatureTypes
 * @description Types for the ADOS feature system: smart modes, suites, and agent capabilities.
 * @license GPL-3.0-only
 */

// ── Sensor & Model Requirements ──────────────────────────

export interface SensorRequirement {
  type: "camera" | "npu" | "gps" | "imu" | "rangefinder" | "lidar" | "thermal";
  label: string;
  required: boolean;
}

export interface ModelRequirement {
  modelId: string;
  required: boolean;
  purpose: string;
}

// ── Config Schema (drives dynamic setup UI) ──────────────

export interface ConfigParam {
  key: string;
  label: string;
  type: "slider" | "select" | "toggle" | "number";
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
  description?: string;
}

// ── Feature Definition (static catalog entry) ────────────

export type FeatureCategory = "tracking" | "cinematography" | "safety" | "mission" | "utility";
export type FeatureType = "smart-mode" | "suite" | "utility";

export interface FeatureDef {
  id: string;
  type: FeatureType;
  name: string;
  description: string;
  icon: string;
  category: FeatureCategory;
  tierRequired: number;
  sensorsRequired: SensorRequirement[];
  servicesRequired: string[];
  visionBehavior?: string;
  requiresNpu?: boolean;
  requiredModels?: ModelRequirement[];
  suiteId?: string;
  configSchema?: ConfigParam[];
  comingSoon?: boolean;
}

// ── Feature State (resolved from catalog + agent) ────────

export type FeatureStatus =
  | "unavailable"
  | "available"
  | "coming-soon"
  | "setup-required"
  | "enabled"
  | "active"
  | "degraded"
  | "error";

export interface ResolvedFeature extends FeatureDef {
  status: FeatureStatus;
  enabled: boolean;
  active: boolean;
  setupComplete: boolean;
  missingSensors: string[];
  statusReason?: string;
}

// ── Agent Capabilities (from /api/status/full) ───────────

export interface CameraCapability {
  name: string;
  type: "csi" | "usb" | "ip";
  device?: string;
  resolution: string;
  fps?: number;
  streaming: boolean;
}

export interface ComputeCapability {
  npu_available: boolean;
  npu_runtime: "rknn" | "tensorrt" | "tflite" | "opencv_dnn" | null;
  npu_tops: number;
  npu_utilization_pct: number;
  gpu_available: boolean;
}

export interface VisionState {
  engine_state: "off" | "initializing" | "ready" | "active" | "degraded" | "error";
  active_behavior: string | null;
  behavior_state: "idle" | "designating" | "searching" | "tracking" | "executing" | "paused" | null;
  fps: number;
  inference_ms: number;
  model_loaded: string | null;
  track_count: number;
  target_locked: boolean;
  target_confidence: number;
  obstacle_mode: "off" | "brake" | "detour";
  nearest_obstacle_m: number | null;
  threat_level: "green" | "yellow" | "red";
  error_message?: string;
}

export interface InstalledModel {
  id: string;
  variant: string;
  format: string;
  size_mb: number;
  loaded: boolean;
}

export interface ModelCacheInfo {
  installed: InstalledModel[];
  cache_used_mb: number;
  cache_max_mb: number;
  registry_url: string;
}

export interface FeatureState {
  enabled: string[];
  active: string | null;
}

/**
 * Local panel attached to the companion board over the 40-pin
 * expansion header (e.g. a 3.5" SPI LCD on a Cubie A7Z or Rock 5C
 * ground station). The agent reports this as a peripheral with
 * category="display"; infer-capabilities maps it to this shape so
 * the Hardware tab can render a status card and the drone card can
 * show an "LCD" pill next to the role badge.
 *
 * The live-state fields (touchCalibrated, activePage, lastTouchAt,
 * lastGesture, snapshotUrl) are populated from top-level heartbeat
 * keys, not from the peripheral's extra blob, so they refresh every
 * heartbeat without depending on a peripheral re-enumeration.
 */
export type LcdGesture = "tap" | "long_press" | "swipe" | "drag";

export interface AttachedDisplay {
  type: "spi-lcd" | "hdmi" | "none";
  controller?: string;
  hasTouch?: boolean;
  resolution?: string;
  rotation?: number;
  /** True once the touch panel has been calibrated against the
   * current rotation. Reflected in the agent's persistent display
   * config. Undefined for legacy heartbeats. */
  touchCalibrated?: boolean;
  /** Currently rendered page on the local LCD. Free-form string so
   * a future agent can add new pages without a GCS-side enum bump.
   * Examples: "dashboard" | "video" | "settings" | "more" |
   * "details.radio_link". */
  activePage?: string;
  /** Epoch milliseconds of the most recent touch event the agent
   * processed. Used by the Display sub-view to surface "last touch
   * Xs ago" without polling a separate endpoint. */
  lastTouchAt?: number;
  /** Most recent gesture the agent's touch input bridge classified.
   * "tap" / "long_press" / "swipe" / "drag" matches the agent
   * gesture taxonomy; anything else falls through as undefined. */
  lastGesture?: LcdGesture;
  /** Absolute URL to the agent's display snapshot endpoint. Returns
   * a PNG of the current framebuffer when polled. Lets the GCS show
   * a thumbnail without holding a video stream open. */
  snapshotUrl?: string;
}

/**
 * Snapshot of the agent's local-display video appsink tap. When the
 * companion board is rendering video to a bound LCD, the agent's
 * GStreamer pipeline forks a low-FPS appsink whose state we surface
 * here so the GCS can show "decoding via mppvideodec at 30 fps" in
 * the Hardware tab and the Video sub-view.
 */
export interface VideoLocalTap {
  /** True when the local appsink is producing frames. False when
   * the pipeline has paused the local tap (e.g. video recording is
   * the only active sink, or the LCD is off). Undefined for legacy
   * heartbeats that predate the local tap. */
  active?: boolean;
  /** Hardware decoder element name in the agent's pipeline.
   * Examples: "mppvideodec" (Rockchip), "v4l2h264dec" (Pi),
   * "avdec_h264" (software fallback). */
  decoderType?: string;
  /** Frames per second the local appsink is emitting. Used as the
   * refresh metric in the Hardware tab. */
  fps?: number;
}

export interface AgentCapabilities {
  tier: number;
  cameras: CameraCapability[];
  compute: ComputeCapability;
  vision: VisionState;
  models: ModelCacheInfo;
  features: FeatureState;
  /** Backend variant the agent process is running. Hides plugin /
   * peripheral / scripting / ROS surfaces when "lite". Defaults to
   * "full" when absent. */
  runtimeMode?: "full" | "lite";
  /** Setup wizard state on the agent. Live agents report "configured"
   * once the universal webapp wizard has been completed. Older agents
   * omit this and the GCS treats them as configured by default. */
  setupState?: string;
  /** How the agent landed on its current profile. One of "detected"
   * (auto-detected by hardware fingerprint), "tiebreaker" (auto with
   * ambiguous signals), "default" (no detect signals, fell back),
   * "override" (forced via /etc/ados/board_override), or "user"
   * (operator picked in the setup webapp). Undefined for legacy
   * heartbeats that predate this field. */
  profileSource?: string;
  /** Optional. Present only when an SPI LCD or other companion-board
   * display is bound on the agent side. Absent on stock drone or
   * headless ground-station builds. */
  display?: AttachedDisplay;
  /** Optional. State of the agent's local-LCD video appsink tap.
   * Undefined when the agent does not bind a local display or has
   * not yet shipped local-tap support. */
  videoLocalTap?: VideoLocalTap;
  /** Optional. True when the agent is currently recording the main
   * video stream to disk. Drives the "REC" badge on the drone card
   * and the recording status pill in the Video sub-view. */
  videoRecording?: boolean;
  /** Optional. Air-side video pipeline identity. Populated by the
   * cloud heartbeat when the agent has opted into the in-process
   * GStreamer pipeline; absent when the legacy bash composition is
   * in force on the agent. Drives the "GST" pill on the drone card
   * and the encoder row on the Configure tab. */
  videoPipeline?: {
    /** "gst-native" when the in-process pipeline owns the stream. */
    flavor?: string;
    /** Element factory name of the chosen H.264 encoder
     * (e.g. "v4l2h264enc", "mpph264enc", "x264enc"). */
    encoderName?: string;
    /** True when the chosen encoder is a hardware path. */
    encoderHwAccel?: boolean;
    /** GStreamer source element kind (e.g. "libcamerasrc",
     * "v4l2src", "rpicamsrc", "videotestsrc"). */
    cameraSource?: string;
    /** Current pipeline state — "playing" | "paused" | "error" | ... */
    state?: string;
  };
  /** Optional. Theme the operator picked for the local LCD UI. The
   * GCS mirrors this back into the WelcomeModal preference flow so
   * the drone and the desktop stay in sync. */
  uiTheme?: "dark" | "light";
  /** Optional. Number of pipeline restarts since the last healthy
   * interval. The agent resets this once video stays up for the
   * configured cool-down. The GCS surfaces a banner when the count
   * crosses an unhealthy threshold. Undefined for legacy heartbeats. */
  videoRestartAttempts?: number;
  /** Optional. True when the agent's foxglove_bridge process failed
   * to bind its WebSocket port at last restart. Surfaced inside the
   * ROS tab so operators can spot a port collision without opening
   * journal logs. Undefined for agents that predate the probe. */
  foxgloveBindFailed?: boolean;
  /** Optional. Agent-authoritative pairing-code expiry (epoch
   * seconds). Mirrors the timer the agent's local wizard is showing
   * so the cloud-side countdown matches the physical device. Null
   * when the agent has no pending code; undefined for legacy
   * heartbeats. */
  pairingCodeExpiresAt?: number | null;
  /** Optional. Previous MAVLink WebSocket URL the agent advertised.
   * Populated when the agent rotates its WebSocket binding. Lets the
   * GCS retry the prior URL once before surfacing a connection error
   * so a brief rotation doesn't drop an in-flight session. */
  mavlinkWsUrlPrev?: string | null;
  /** Optional. Tracks how the agent is currently servicing the
   * pairing/uplink path. "local" is the steady state on the wireless
   * radio link. "cloud_relay" means the local pairing supervisor
   * fell over to the cloud heartbeat path; the GCS surfaces a notice
   * with a retry control. "failed" means both local and cloud paths
   * are unavailable. Undefined for legacy heartbeats. */
  wfbFailoverState?: "local" | "cloud_relay" | "failed";
}

// ── Detection Data (for vision overlay) ──────────────────

export interface Detection {
  class: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  track_id?: number;
  designated?: boolean;
}

export interface VisionFrame {
  detections: Detection[];
  timestamp: number;
  frame_width: number;
  frame_height: number;
}

// ── Model Registry (from registry.json) ──────────────────

export interface ModelVariantFormat {
  url: string;
  size_mb: number;
  sha256: string;
}

export interface ModelVariant {
  variant: string;
  input_size: string;
  min_tops: number;
  formats: Record<string, ModelVariantFormat>;
}

export interface RegistryModel {
  id: string;
  name: string;
  description: string;
  license: string;
  classes: string[];
  variants: ModelVariant[];
}

export interface ModelRegistry {
  version: number;
  models: RegistryModel[];
}

export interface ModelDownloadStatus {
  model_id: string;
  state: "idle" | "downloading" | "verifying" | "complete" | "error";
  progress: number;
  error?: string;
}
