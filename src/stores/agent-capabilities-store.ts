/**
 * @module AgentCapabilitiesStore
 * @description Zustand store for ADOS agent capabilities: compute, vision, features, models.
 * Populated from the `capabilities` field in `/api/status/full` polling response.
 * Includes a normalizer to handle shape differences between agent API response and GCS types.
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import type {
  AgentCapabilities,
  CameraCapability,
  ComputeCapability,
  VisionState,
  ModelCacheInfo,
  FeatureState,
  InstalledModel,
} from "@/lib/agent/feature-types";
import {
  AgentCapabilitiesRawSchema,
  type AgentCapabilitiesRaw,
} from "@/lib/agent/schemas";
import type {
  RadioState,
  RadioLinkState,
  RadioTopology,
} from "@/lib/api/ground-station/types";

// Module-scoped set of unknown profile strings we've already warned
// about. Prevents the heartbeat-rate console spam when a future agent
// advertises a profile the GCS doesn't know yet.
const _seenUnknownProfiles = new Set<string>();

const DEFAULT_COMPUTE: ComputeCapability = {
  npu_available: false,
  npu_runtime: null,
  npu_tops: 0,
  npu_utilization_pct: 0,
  gpu_available: false,
};

const DEFAULT_VISION: VisionState = {
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

const DEFAULT_MODELS: ModelCacheInfo = {
  installed: [],
  cache_used_mb: 0,
  cache_max_mb: 500,
  registry_url: "",
};

const DEFAULT_FEATURES: FeatureState = {
  enabled: [],
  active: null,
};

// ── Normalizer ──────────────────────────────────────────
// Maps agent API response shape to GCS TypeScript types.
// The agent may return fields with different names or shapes
// (e.g., no npu_available, features as array instead of { enabled, active }).

// Recognized literal values for the radio link state and the power
// topology. Unknown values fall back to safe defaults so the UI never
// crashes on a future agent that ships an extension.
const RADIO_LINK_STATES: ReadonlySet<RadioLinkState> = new Set([
  "absent",
  "disconnected",
  "unpaired",
  "auto_pairing",
  "binding",
  "connecting",
  "connected",
  "degraded",
]);
const RADIO_TOPOLOGIES: ReadonlySet<RadioTopology> = new Set([
  "host_vbus",
  "powered_hub",
  "external_5v",
]);

function normalizeRadio(raw: unknown): RadioState | null {
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
      typeof r.publicKeyFingerprint === "string" ? r.publicKeyFingerprint : null,
    // autoPairEnabled defaults to false when absent so the UI does
    // not show a misleading "armed" badge against an old agent that
    // doesn't actually run the auto-pair supervisor.
    autoPairEnabled: r.autoPairEnabled === true,
  };
}

function normalizeFeatures(
  raw: AgentCapabilitiesRaw["features"] | undefined,
): FeatureState {
  if (!raw) return { enabled: [], active: null };
  // Agent sends array of feature objects with { id, enabled, active, ... }
  if (Array.isArray(raw)) {
    return {
      enabled: raw.filter((f) => f.enabled).map((f) => f.id),
      active: raw.find((f) => f.active)?.id ?? null,
    };
  }
  // Already in GCS format (from mock or inference)
  return raw;
}

function normalizeCapabilities(raw: unknown): AgentCapabilities {
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
      features: DEFAULT_FEATURES,
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

  return {
    tier: Number(data.tier ?? 0),
    cameras,
    compute,
    vision,
    models,
    features: normalizeFeatures(data.features),
    display,
    videoLocalTap,
    videoRecording,
    uiTheme,
    videoPipeline,
  };
}

// ── Store ────────────────────────────────────────────────

interface AgentCapabilitiesState {
  tier: number;
  cameras: CameraCapability[];
  compute: ComputeCapability;
  vision: VisionState;
  models: ModelCacheInfo;
  features: FeatureState;
  /** ROS 2 environment state: absent (no support), available (board supports, not running), running. */
  ros2State: "absent" | "available" | "running";
  /** Backend variant the agent process is running. "lite" hides plugin /
   * peripheral / scripting / ROS surfaces. Defaults to "full" until set. */
  runtimeMode: "full" | "lite";
  /** Setup wizard state on the agent. Undefined for legacy heartbeats. */
  setupState?: string;
  /** How the agent landed on its current profile. Undefined for legacy
   * heartbeats. See AgentCapabilities.profileSource for the value set. */
  profileSource?: string;
  /** Node deployment category. "drone" or "ground-station" today,
   * "compute" / "lite" in the future. Defaults to "drone" when the
   * heartbeat omits the field (older agents). Drives Command-tab
   * panel selection and tab visibility per node. */
  profile: "drone" | "ground-station" | "compute" | "lite";
  /** Ground-station role when applicable. Null on drones and
   * compute nodes, undefined on agents that predate the field. */
  role?: "direct" | "relay" | "receiver" | null;
  /** Local panel attached to the companion board (e.g. SPI LCD on a
   * ground-station node). Undefined when no display is bound. */
  display: AgentCapabilities["display"];
  /** Snapshot of the agent's local-LCD video appsink tap. Undefined
   * when the agent hasn't shipped local-tap support, or no display
   * is bound. Stays defined with active=false when the tap is
   * explicitly paused. */
  videoLocalTap: AgentCapabilities["videoLocalTap"];
  /** True when the agent is currently recording the main video
   * stream to disk. Undefined for agents that predate the recording
   * surface. */
  videoRecording: AgentCapabilities["videoRecording"];
  /** Theme the operator picked for the local LCD UI. Undefined when
   * the agent has no LCD or hasn't reported a theme yet. */
  uiTheme: AgentCapabilities["uiTheme"];
  /** Air-side video pipeline identity. Undefined when the agent
   * runs the legacy bash composition or hasn't reported yet. */
  videoPipeline: AgentCapabilities["videoPipeline"];
  /** Air-side WFB-ng radio snapshot. Null when the agent does not
   * advertise a radio service (drone has no air-side adapter, or runs
   * a profile without WFB-ng). Populated from the cloud heartbeat or
   * a future /api/capabilities response. */
  radio: RadioState | null;
  /** Pipeline restarts since the last healthy interval. Resets to
   * zero once video stays up for the agent's healthy cool-down.
   * Default 0 until the agent reports otherwise. */
  videoRestartAttempts: number;
  /** True when the agent's foxglove_bridge process failed to bind
   * at last restart. Default false until the agent flips it. */
  foxgloveBindFailed: boolean;
  /** Agent-authoritative pairing-code expiry (epoch seconds). Null
   * when the agent has no pending code or hasn't reported one. */
  pairingCodeExpiresAt: number | null;
  /** Previous MAVLink WebSocket URL the agent advertised, if it
   * rotated its binding. Null when no rotation is in flight. */
  mavlinkWsUrlPrev: string | null;
  /** Current pairing/uplink failover state. "local" is the steady
   * state on the wireless radio link. "cloud_relay" means the
   * agent's local pairing supervisor failed over to the cloud
   * path. "failed" means neither path is up. Defaults to "local"
   * for legacy heartbeats. */
  wfbFailoverState: "local" | "cloud_relay" | "failed";
  /** LAN-routable manual-connection URLs the agent advertises so
   * the operator can dial directly from a workstation on the same
   * network. Each field independently null when the agent can't
   * compute a usable URL (no MAVLink TCP listener, no video
   * pipeline, etc.). Undefined for legacy heartbeats. */
  manualConnectionUrls: {
    mavlinkTcp: string | null;
    mavlinkWs: string | null;
    videoViewer: string | null;
    videoWhep: string | null;
  } | null;
  /** Cloud relay backend the agent is paired to (Convex deployment),
   * or null when unpaired. Distinct from Cloudflare tunnel state. */
  cloudRelayUrl: string | null;
  /** Cloudflare tunnel ingress URL when the inbound tunnel is up,
   * or null when disabled. Distinct from cloud relay state. */
  cloudflareUrl: string | null;
  /** True once we've received at least one capabilities payload. */
  loaded: boolean;
}

interface AgentCapabilitiesActions {
  /** Update all capabilities from a parsed API response (normalizes shape). */
  setCapabilities: (caps: AgentCapabilities | Record<string, unknown>) => void;
  /** Optimistically mark a feature as enabled (before API confirmation). */
  optimisticEnableFeature: (featureId: string) => void;
  /** Optimistically mark a feature as disabled. */
  optimisticDisableFeature: (featureId: string) => void;
  /** Reset store on disconnect. */
  clear: () => void;
}

export type AgentCapabilitiesStore = AgentCapabilitiesState & AgentCapabilitiesActions;

export const useAgentCapabilitiesStore = create<AgentCapabilitiesStore>((set) => ({
  tier: 0,
  cameras: [],
  compute: DEFAULT_COMPUTE,
  vision: DEFAULT_VISION,
  models: DEFAULT_MODELS,
  features: DEFAULT_FEATURES,
  ros2State: "absent",
  runtimeMode: "full",
  setupState: undefined,
  profileSource: undefined,
  profile: "drone",
  role: undefined,
  display: undefined,
  videoLocalTap: undefined,
  videoRecording: undefined,
  uiTheme: undefined,
  videoPipeline: undefined,
  radio: null,
  videoRestartAttempts: 0,
  foxgloveBindFailed: false,
  pairingCodeExpiresAt: null,
  mavlinkWsUrlPrev: null,
  wfbFailoverState: "local",
  manualConnectionUrls: null,
  cloudRelayUrl: null,
  cloudflareUrl: null,
  loaded: false,

  setCapabilities(caps: AgentCapabilities | Record<string, unknown>) {
    const normalized = normalizeCapabilities(caps);
    // Infer ROS 2 state from the capabilities payload.
    // The agent includes a `ros` field with `{ supported, state }` when the
    // board profile has ros.supported=true and the API routes are registered.
    const rosParsed = AgentCapabilitiesRawSchema.safeParse(caps);
    const rawRos = rosParsed.success ? rosParsed.data.ros : undefined;
    let ros2State: "absent" | "available" | "running" = "absent";
    if (rawRos?.supported) {
      ros2State = rawRos.state === "running" ? "running" : "available";
    }

    // Pull runtimeMode out of the raw payload too; agents may send
    // either snake_case (runtime_mode) or camelCase (runtimeMode).
    const rawRuntime =
      (caps as { runtimeMode?: unknown }).runtimeMode ??
      (caps as { runtime_mode?: unknown }).runtime_mode;
    const runtimeMode: "full" | "lite" = rawRuntime === "lite" ? "lite" : "full";

    // Setup state and profile source travel through the same payload.
    // Both accept snake_case (setup_state, profile_source) or camelCase.
    const rawSetup =
      (caps as { setupState?: unknown }).setupState ??
      (caps as { setup_state?: unknown }).setup_state;
    const setupState = typeof rawSetup === "string" ? rawSetup : undefined;
    const rawProfileSource =
      (caps as { profileSource?: unknown }).profileSource ??
      (caps as { profile_source?: unknown }).profile_source;
    const profileSource =
      typeof rawProfileSource === "string" ? rawProfileSource : undefined;

    // Wire-contract identity. Profile is "drone" or "ground-station"
    // (hyphen form) coming off the heartbeat. Older agents that omit
    // the field default to drone. Role applies only to ground-station
    // nodes; on drones it's null. Accept snake_case and camelCase.
    const rawProfile =
      (caps as { profile?: unknown }).profile ??
      (caps as { node_profile?: unknown }).node_profile;
    const profile: "drone" | "ground-station" | "compute" | "lite" =
      rawProfile === "ground-station" ||
      rawProfile === "compute" ||
      rawProfile === "lite"
        ? rawProfile
        : "drone";
    // Forward-compat dev hint: if a future agent ships a profile
    // string we don't know yet, the cap store clamps to "drone" so
    // the GCS doesn't crash. Warn ONCE per unknown profile string
    // (module-scoped Set) so a heartbeat at 1Hz doesn't spam devtools.
    if (
      typeof rawProfile === "string" &&
      rawProfile !== "drone" &&
      rawProfile !== "ground-station" &&
      rawProfile !== "compute" &&
      rawProfile !== "lite" &&
      typeof console !== "undefined" &&
      !_seenUnknownProfiles.has(rawProfile)
    ) {
      _seenUnknownProfiles.add(rawProfile);
      console.warn(
        "[agent-capabilities-store] unknown profile %s clamped to drone",
        rawProfile,
      );
    }
    const rawRole = (caps as { role?: unknown }).role;
    const role: "direct" | "relay" | "receiver" | null | undefined =
      rawRole === "direct" ||
      rawRole === "relay" ||
      rawRole === "receiver"
        ? rawRole
        : rawRole === null
          ? null
          : undefined;

    // Air-side radio snapshot. Field name is camelCase here. The cloud
    // relay action remaps the agent's snake_case wire keys before the
    // payload reaches Mission Control state, so the store accepts the
    // already-camelCased shape directly.
    const rawRadio = (caps as { radio?: unknown }).radio;
    const radio = normalizeRadio(rawRadio);

    // Heartbeat health surfaces. Each is forward-permissive: the
    // store keeps the prior value when the heartbeat omits a field
    // (so a single sparse capabilities payload can't reset a count
    // back to zero). The full cloud heartbeat in CloudStatusBridge
    // always sets all four explicitly, so this branch only matters
    // when an /api/capabilities call lands without them.
    const rawVideoRestartAttempts =
      (caps as { videoRestartAttempts?: unknown }).videoRestartAttempts;
    const videoRestartAttempts =
      typeof rawVideoRestartAttempts === "number" &&
      Number.isFinite(rawVideoRestartAttempts) &&
      rawVideoRestartAttempts >= 0
        ? Math.floor(rawVideoRestartAttempts)
        : undefined;

    const rawFoxgloveBindFailed =
      (caps as { foxgloveBindFailed?: unknown }).foxgloveBindFailed;
    const foxgloveBindFailed =
      typeof rawFoxgloveBindFailed === "boolean"
        ? rawFoxgloveBindFailed
        : undefined;

    const rawPairingCodeExpiresAt =
      (caps as { pairingCodeExpiresAt?: unknown }).pairingCodeExpiresAt;
    const pairingCodeExpiresAt: number | null | undefined =
      typeof rawPairingCodeExpiresAt === "number" &&
      Number.isFinite(rawPairingCodeExpiresAt) &&
      rawPairingCodeExpiresAt > 0
        ? rawPairingCodeExpiresAt
        : rawPairingCodeExpiresAt === null
          ? null
          : undefined;

    const rawMavlinkWsUrlPrev =
      (caps as { mavlinkWsUrlPrev?: unknown }).mavlinkWsUrlPrev;
    const mavlinkWsUrlPrev: string | null | undefined =
      typeof rawMavlinkWsUrlPrev === "string" && rawMavlinkWsUrlPrev.length > 0
        ? rawMavlinkWsUrlPrev
        : rawMavlinkWsUrlPrev === null
          ? null
          : undefined;

    // Manual connection URLs. Forward-permissive: undefined keeps
    // the prior block. A partial block (e.g., only mavlinkWs set) is
    // accepted as-is so the GCS can render whichever fallbacks the
    // agent currently advertises.
    const rawManual = (caps as { manualConnectionUrls?: unknown })
      .manualConnectionUrls;
    let manualConnectionUrls:
      | { mavlinkTcp: string | null; mavlinkWs: string | null; videoViewer: string | null; videoWhep: string | null }
      | null
      | undefined = undefined;
    if (rawManual && typeof rawManual === "object") {
      const m = rawManual as Record<string, unknown>;
      const pick = (v: unknown): string | null =>
        typeof v === "string" && v.length > 0 ? v : null;
      manualConnectionUrls = {
        mavlinkTcp: pick(m.mavlinkTcp),
        mavlinkWs: pick(m.mavlinkWs),
        videoViewer: pick(m.videoViewer),
        videoWhep: pick(m.videoWhep),
      };
    } else if (rawManual === null) {
      manualConnectionUrls = null;
    }

    const rawCloudRelay = (caps as { cloudRelayUrl?: unknown }).cloudRelayUrl;
    const cloudRelayUrl: string | null | undefined =
      typeof rawCloudRelay === "string" && rawCloudRelay.length > 0
        ? rawCloudRelay
        : rawCloudRelay === null
          ? null
          : undefined;

    const rawCloudflare = (caps as { cloudflareUrl?: unknown }).cloudflareUrl;
    const cloudflareUrl: string | null | undefined =
      typeof rawCloudflare === "string" && rawCloudflare.length > 0
        ? rawCloudflare
        : rawCloudflare === null
          ? null
          : undefined;

    // Forward-permissive: undefined keeps the prior value, a known
    // string sets it, anything else clamps to "local" so an agent
    // shipping a future variant can't put the UI into an invalid
    // state.
    const rawFailover = (caps as { wfbFailoverState?: unknown })
      .wfbFailoverState;
    const wfbFailoverState:
      | "local"
      | "cloud_relay"
      | "failed"
      | undefined =
      rawFailover === undefined
        ? undefined
        : rawFailover === "local" ||
            rawFailover === "cloud_relay" ||
            rawFailover === "failed"
          ? rawFailover
          : "local";

    set((state) => ({
      tier: normalized.tier,
      cameras: normalized.cameras,
      compute: normalized.compute,
      vision: normalized.vision,
      models: normalized.models,
      features: normalized.features,
      ros2State,
      runtimeMode,
      setupState,
      profileSource,
      profile,
      role: role === undefined ? state.role : role,
      display: normalized.display,
      videoLocalTap: normalized.videoLocalTap,
      videoRecording: normalized.videoRecording,
      uiTheme: normalized.uiTheme,
      videoPipeline: normalized.videoPipeline,
      radio,
      // Forward-permissive merges: keep the prior value when the
      // payload omits the field. CloudStatusBridge always sets all
      // four explicitly, so prior values only carry over when an
      // /api/capabilities call lands without them.
      videoRestartAttempts:
        videoRestartAttempts ?? state.videoRestartAttempts,
      foxgloveBindFailed:
        foxgloveBindFailed ?? state.foxgloveBindFailed,
      pairingCodeExpiresAt:
        pairingCodeExpiresAt === undefined
          ? state.pairingCodeExpiresAt
          : pairingCodeExpiresAt,
      mavlinkWsUrlPrev:
        mavlinkWsUrlPrev === undefined
          ? state.mavlinkWsUrlPrev
          : mavlinkWsUrlPrev,
      wfbFailoverState:
        wfbFailoverState === undefined
          ? state.wfbFailoverState
          : wfbFailoverState,
      manualConnectionUrls:
        manualConnectionUrls === undefined
          ? state.manualConnectionUrls
          : manualConnectionUrls,
      cloudRelayUrl:
        cloudRelayUrl === undefined ? state.cloudRelayUrl : cloudRelayUrl,
      cloudflareUrl:
        cloudflareUrl === undefined ? state.cloudflareUrl : cloudflareUrl,
      loaded: true,
    }));
  },

  optimisticEnableFeature(featureId: string) {
    set((state) => ({
      features: {
        ...state.features,
        enabled: state.features.enabled.includes(featureId)
          ? state.features.enabled
          : [...state.features.enabled, featureId],
      },
    }));
  },

  optimisticDisableFeature(featureId: string) {
    set((state) => ({
      features: {
        ...state.features,
        enabled: state.features.enabled.filter((id) => id !== featureId),
        active: state.features.active === featureId ? null : state.features.active,
      },
    }));
  },

  clear() {
    set({
      tier: 0,
      cameras: [],
      compute: DEFAULT_COMPUTE,
      vision: DEFAULT_VISION,
      models: DEFAULT_MODELS,
      features: DEFAULT_FEATURES,
      ros2State: "absent",
      runtimeMode: "full",
      setupState: undefined,
      profileSource: undefined,
      profile: "drone",
      role: undefined,
      display: undefined,
      videoLocalTap: undefined,
      videoRecording: undefined,
      uiTheme: undefined,
      videoPipeline: undefined,
      radio: null,
      videoRestartAttempts: 0,
      foxgloveBindFailed: false,
      pairingCodeExpiresAt: null,
      mavlinkWsUrlPrev: null,
      wfbFailoverState: "local",
      manualConnectionUrls: null,
      cloudRelayUrl: null,
      cloudflareUrl: null,
      loaded: false,
    });
  },
}));
