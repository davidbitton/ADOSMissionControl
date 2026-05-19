/**
 * @module AgentCapabilities/Normalizer
 * @description Pure shape mappers that flatten the on-wire agent capabilities
 * payload onto the GCS-side TypeScript types. The agent has shipped several
 * legacy shapes over time (features as an array OR { enabled, active }, models
 * as an array OR { installed, cache_used_mb, ... }); the normalizer collapses
 * those into a single canonical shape the store can hold.
 *
 * Smaller forward-permissive per-field parsers live in `./derivers`. Defaults
 * for compute / vision / models / features are exported here so the state
 * module can seed the initial Zustand state.
 *
 * Every helper here is a pure function: no Zustand access, no side effects.
 *
 * @license GPL-3.0-only
 */

import type {
  AgentCapabilities,
  CameraCapability,
  ComputeCapability,
  VisionState,
  ModelCacheInfo,
  InstalledModel,
  NavigationCapability,
} from "@/lib/agent/feature-types";
import { AgentCapabilitiesRawSchema } from "@/lib/agent/schemas";
import type {
  RadioState,
  RadioLinkState,
  RadioTopology,
} from "@/lib/api/ground-station/types";

export const DEFAULT_COMPUTE: ComputeCapability = {
  npu_available: false,
  npu_runtime: null,
  npu_tops: 0,
  npu_utilization_pct: 0,
  gpu_available: false,
};

export const DEFAULT_VISION: VisionState = {
  engine_state: "off",
  active_behavior: null,
  behavior_state: null,
  fps: 0,
  inference_ms: 0,
  model_loaded: null,
  track_count: 0,
  target_locked: false,
  target_confidence: 0,
  obstacle_mode: "off",
  nearest_obstacle_m: null,
  threat_level: "green",
};

export const DEFAULT_MODELS: ModelCacheInfo = {
  installed: [],
  cache_used_mb: 0,
  cache_max_mb: 500,
  registry_url: "",
};

// Recognized literal values for the radio link state and the power
// topology. Unknown values fall back to safe defaults so the UI never
// crashes on a future agent that ships an extension.
const RADIO_LINK_STATES: ReadonlySet<RadioLinkState> = new Set<RadioLinkState>([
  "absent",
  "disconnected",
  "unpaired",
  "auto_pairing",
  "binding",
  "connecting",
  "connected",
  "degraded",
]);
const RADIO_TOPOLOGIES: ReadonlySet<RadioTopology> = new Set<RadioTopology>([
  "host_vbus",
  "powered_hub",
  "external_5v",
]);

/** Normalize the on-wire radio block onto the GCS RadioState shape. */
export function normalizeRadio(raw: unknown): RadioState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const stateRaw = typeof r.state === "string" ? r.state : "absent";
  const state: RadioLinkState = RADIO_LINK_STATES.has(
    stateRaw as RadioLinkState,
  )
    ? (stateRaw as RadioLinkState)
    : "absent";
  const topologyRaw = typeof r.topology === "string" ? r.topology : "host_vbus";
  const topology: RadioTopology = RADIO_TOPOLOGIES.has(
    topologyRaw as RadioTopology,
  )
    ? (topologyRaw as RadioTopology)
    : "host_vbus";
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return null;
  };
  const numOrZero = (v: unknown): number => {
    const n = num(v);
    return n ?? 0;
  };
  return {
    state,
    iface: typeof r.iface === "string" ? r.iface : null,
    driver: typeof r.driver === "string" ? r.driver : null,
    channel: num(r.channel),
    freqMhz: num(r.freqMhz),
    bandwidthMhz: numOrZero(r.bandwidthMhz),
    txPowerDbm: num(r.txPowerDbm),
    txPowerMaxDbm: numOrZero(r.txPowerMaxDbm),
    topology,
    rssiDbm: num(r.rssiDbm),
    bitrateKbps: num(r.bitrateKbps),
    fecRecovered: numOrZero(r.fecRecovered),
    fecLost: numOrZero(r.fecLost),
    packetsLost: numOrZero(r.packetsLost),
    // Pair-state fields are optional on the wire (older agents omit
    // them). Treat absent / null as "unpaired, auto-pair unknown" so
    // the UI never confuses a missing field with an explicit false.
    paired: r.paired === true,
    pairedWithDeviceId:
      typeof r.pairedWithDeviceId === "string" ? r.pairedWithDeviceId : null,
    pairedAt: typeof r.pairedAt === "string" ? r.pairedAt : null,
    publicKeyFingerprint:
      typeof r.publicKeyFingerprint === "string"
        ? r.publicKeyFingerprint
        : null,
    // autoPairEnabled defaults to false when absent so the UI does
    // not show a misleading "armed" badge against an old agent that
    // doesn't actually run the auto-pair supervisor.
    autoPairEnabled: r.autoPairEnabled === true,
  };
}

/**
 * Map a raw agent capabilities payload onto the GCS AgentCapabilities shape.
 * Failure (schema mismatch, non-object input) falls back to defaults so the
 * UI degrades gracefully instead of crashing on a single bad heartbeat.
 */
export function normalizeCapabilities(raw: unknown): AgentCapabilities {
  // Run the payload through the schema. Schemas are permissive
  // (passthrough + optional everywhere) so this validates shape but
  // does not reject unknown fields. Failure falls back to defaults.
  const parsed = AgentCapabilitiesRawSchema.safeParse(raw);
  if (!parsed.success || !raw || typeof raw !== "object") {
    return {
      tier: 0,
      cameras: [],
      compute: DEFAULT_COMPUTE,
      vision: DEFAULT_VISION,
      models: DEFAULT_MODELS,
    };
  }
  const data = parsed.data;

  // Normalize compute: infer npu_available from npu_tops > 0
  const rawCompute = data.compute ?? {};
  const npuTops = Number(rawCompute.npu_tops ?? 0);
  const compute: ComputeCapability = {
    npu_available: rawCompute.npu_available ?? npuTops > 0,
    npu_runtime: rawCompute.npu_runtime ?? null,
    npu_tops: npuTops,
    npu_utilization_pct: Number(rawCompute.npu_utilization_pct ?? 0),
    gpu_available: Boolean(rawCompute.gpu_available ?? false),
  };

  // Normalize cameras: default streaming to true, type to "usb"
  const cameras: CameraCapability[] = (data.cameras ?? []).map((c) => ({
    name: c.name ?? "Unknown Camera",
    type: (c.type as CameraCapability["type"]) ?? "usb",
    device: c.device,
    resolution: c.resolution ?? "unknown",
    fps: c.fps,
    streaming: c.streaming ?? true, // Agent-detected cameras are streaming
  }));

  // Normalize vision: merge with defaults
  const vision: VisionState = { ...DEFAULT_VISION };
  if (data.vision) {
    const v = data.vision;
    if (v.engine_state) vision.engine_state = v.engine_state;
    if (v.active_behavior !== undefined) vision.active_behavior = v.active_behavior;
    if (v.behavior_state !== undefined) vision.behavior_state = v.behavior_state;
    if (typeof v.fps === "number") vision.fps = v.fps;
    if (typeof v.inference_ms === "number") vision.inference_ms = v.inference_ms;
    if (v.model_loaded !== undefined) vision.model_loaded = v.model_loaded;
    if (typeof v.track_count === "number") vision.track_count = v.track_count;
    if (typeof v.target_locked === "boolean") vision.target_locked = v.target_locked;
    if (typeof v.target_confidence === "number") vision.target_confidence = v.target_confidence;
    if (v.obstacle_mode) vision.obstacle_mode = v.obstacle_mode;
    if (v.nearest_obstacle_m !== undefined && v.nearest_obstacle_m !== null) {
      vision.nearest_obstacle_m = v.nearest_obstacle_m;
    }
    if (v.threat_level) vision.threat_level = v.threat_level;
    // Also check the agent's vision.enabled field (agent shape)
    if (v.enabled === true && vision.engine_state === "off") {
      vision.engine_state = "ready";
    }
  }

  // Normalize models
  const rawModels = data.models;
  let installed: InstalledModel[] = [];
  let cacheUsedMb = 0;
  let cacheMaxMb = 500;
  let registryUrl = "";
  if (Array.isArray(rawModels)) {
    installed = rawModels as InstalledModel[];
  } else if (rawModels) {
    installed = (rawModels.installed ?? []) as InstalledModel[];
    cacheUsedMb = rawModels.cache_used_mb ?? 0;
    cacheMaxMb = rawModels.cache_max_mb ?? 500;
    registryUrl = rawModels.registry_url ?? "";
  }
  const models: ModelCacheInfo = {
    installed,
    cache_used_mb: cacheUsedMb,
    cache_max_mb: cacheMaxMb,
    registry_url: registryUrl,
  };

  // Pass-through: pre-inferred display block from infer-capabilities or
  // a future agent capabilities API field. The Zod raw schema is
  // forward-permissive, so we read the field directly off the input.
  const displayCandidate = (raw as { display?: unknown }).display;
  const display =
    displayCandidate && typeof displayCandidate === "object"
      ? (displayCandidate as AgentCapabilities["display"])
      : undefined;

  // Pass-through: effective primary local-display path. Agent emits
  // one of "hdmi" | "lcd" | "none" each heartbeat; "auto" is accepted
  // as well so a future config-echo payload that carries the
  // unresolved override still surfaces cleanly. Anything else is
  // treated as absent so a stale string can't pin the picker.
  const displayTypeCandidate = (raw as { displayType?: unknown }).displayType;
  const displayType: AgentCapabilities["displayType"] =
    displayTypeCandidate === "auto" ||
    displayTypeCandidate === "hdmi" ||
    displayTypeCandidate === "lcd" ||
    displayTypeCandidate === "none"
      ? displayTypeCandidate
      : displayTypeCandidate === null
        ? null
        : undefined;

  // Pass-through: local video tap state. infer-capabilities builds
  // this block from the heartbeat top-level keys; an agent that
  // ships a /api/capabilities surface in the future can also
  // populate it directly.
  const videoLocalTapCandidate = (raw as { videoLocalTap?: unknown })
    .videoLocalTap;
  const videoLocalTap =
    videoLocalTapCandidate && typeof videoLocalTapCandidate === "object"
      ? (videoLocalTapCandidate as AgentCapabilities["videoLocalTap"])
      : undefined;

  const videoRecordingCandidate = (raw as { videoRecording?: unknown })
    .videoRecording;
  const videoRecording =
    typeof videoRecordingCandidate === "boolean"
      ? videoRecordingCandidate
      : undefined;

  const uiThemeCandidate = (raw as { uiTheme?: unknown }).uiTheme;
  const uiTheme: AgentCapabilities["uiTheme"] =
    uiThemeCandidate === "dark" || uiThemeCandidate === "light"
      ? uiThemeCandidate
      : undefined;

  const videoPipelineCandidate = (raw as { videoPipeline?: unknown })
    .videoPipeline;
  const videoPipeline =
    videoPipelineCandidate && typeof videoPipelineCandidate === "object"
      ? (videoPipelineCandidate as AgentCapabilities["videoPipeline"])
      : undefined;

  // Pass-through: camera + vision navigation block. The Zod raw
  // schema validates the inner shape (four required keys + optional
  // metrics); a payload that fails the schema falls through to
  // undefined so downstream selectors see the absence cleanly. The
  // schema's NumberLike preprocessor coerces stringly-typed metrics
  // back to numbers, so the parsed shape is safe to surface as a
  // NavigationCapability.
  const navigation: NavigationCapability | undefined = data.navigation
    ? (data.navigation as NavigationCapability)
    : undefined;

  const asStringOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const asNumberOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const peerDeviceId = asStringOrNull((data as Record<string, unknown>).peerDeviceId);
  const peerRole = asStringOrNull((data as Record<string, unknown>).peerRole);
  const peerChannel = asNumberOrNull((data as Record<string, unknown>).peerChannel);
  const peerRssiDbm = asNumberOrNull((data as Record<string, unknown>).peerRssiDbm);
  const peerSeenAtUnix = asNumberOrNull((data as Record<string, unknown>).peerSeenAtUnix);

  return {
    tier: Number(data.tier ?? 0),
    cameras,
    compute,
    vision,
    models,
    display,
    displayType,
    videoLocalTap,
    videoRecording,
    uiTheme,
    videoPipeline,
    navigation,
    peerDeviceId,
    peerRole,
    peerChannel,
    peerRssiDbm,
    peerSeenAtUnix,
  };
}
