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

  return {
    tier: Number(data.tier ?? 0),
    cameras,
    compute,
    vision,
    models,
    features: normalizeFeatures(data.features),
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

    set({
      tier: normalized.tier,
      cameras: normalized.cameras,
      compute: normalized.compute,
      vision: normalized.vision,
      models: normalized.models,
      features: normalized.features,
      ros2State,
      loaded: true,
    });
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
      loaded: false,
    });
  },
}));
