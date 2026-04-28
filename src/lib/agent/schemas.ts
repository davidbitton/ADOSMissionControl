/**
 * @module AgentSchemas
 * @description zod schemas for the ADOS Drone Agent REST API boundary.
 * Used as optional runtime validators on client.request() calls so the
 * GCS catches shape drift instead of crashing deep inside a store.
 *
 * Schemas are intentionally permissive at the seam: unknown fields pass
 * through, optional fields are explicitly optional, and unions accept the
 * older legacy shapes the agent has shipped over time.
 *
 * @license GPL-3.0-only
 */

import { z } from "zod";

// ── Primitives ──────────────────────────────────────────

/**
 * Numeric coercion for fields that older agents shipped as strings.
 * Falls back to 0 on parse failure so the UI degrades gracefully.
 */
const NumberLike = z.preprocess(
  (val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  },
  z.number(),
);

const NullableNumber = z.union([z.number(), z.null()]).nullable();
const NullableString = z.union([z.string(), z.null()]).nullable();

// ── Board + Health ──────────────────────────────────────

export const BoardInfoSchema = z
  .object({
    name: z.string(),
    model: z.string(),
    tier: NumberLike,
    ram_mb: NumberLike,
    cpu_cores: NumberLike,
    vendor: z.string(),
    soc: z.string(),
    arch: z.string(),
    hw_video_codecs: z.array(z.string()),
  })
  .passthrough();

export const HealthInfoSchema = z
  .object({
    cpu_percent: NumberLike,
    memory_percent: NumberLike,
    disk_percent: NumberLike,
    temperature: NullableNumber,
    timestamp: z.string(),
  })
  .passthrough();

// ── Status (legacy /api/status) ─────────────────────────

export const AgentStatusSchema = z
  .object({
    version: z.string(),
    uptime_seconds: NumberLike,
    board: BoardInfoSchema,
    health: HealthInfoSchema,
    fc_connected: z.boolean(),
    fc_port: z.string(),
    fc_baud: NumberLike,
  })
  .passthrough();

export type AgentStatusValidated = z.infer<typeof AgentStatusSchema>;

// ── Version + capabilities ──────────────────────────────

export const AgentVersionInfoSchema = z
  .object({
    api_version: z.string(),
    agent_version: z.string(),
    capabilities: z.array(z.string()),
  })
  .passthrough();

// ── System resources ────────────────────────────────────

export const SystemResourcesRawSchema = z
  .object({
    cpu_percent: NumberLike.optional(),
    memory_percent: NumberLike.optional(),
    memory_used_mb: NumberLike.optional(),
    memory_total_mb: NumberLike.optional(),
    disk_percent: NumberLike.optional(),
    disk_used_gb: NumberLike.optional(),
    disk_total_gb: NumberLike.optional(),
    temperature: NullableNumber.optional(),
    temperatures: z.record(z.string(), z.number()).optional(),
  })
  .passthrough();

// ── Telemetry snapshot ──────────────────────────────────

export const TelemetrySnapshotSchema = z
  .object({
    lat: NumberLike,
    lon: NumberLike,
    alt: NumberLike,
    relative_alt: NumberLike,
    heading: NumberLike,
    groundspeed: NumberLike,
    airspeed: NumberLike,
    roll: NumberLike,
    pitch: NumberLike,
    yaw: NumberLike,
    battery_voltage: NumberLike,
    battery_current: NumberLike,
    battery_remaining: NumberLike,
    gps_fix: NumberLike,
    satellites: NumberLike,
    mode: z.string(),
    armed: z.boolean(),
  })
  .passthrough();

// ── Services ────────────────────────────────────────────

export const ServiceSummarySchema = z
  .object({
    name: z.string(),
    state: z.string().optional(),
    status: z.string().optional(),
    pid: z.union([z.number(), z.null()]).optional(),
    cpu_percent: NumberLike.optional(),
    cpuPercent: NumberLike.optional(),
    memory_mb: NumberLike.optional(),
    memoryMb: NumberLike.optional(),
    uptime_seconds: NumberLike.optional(),
    uptimeSeconds: NumberLike.optional(),
    last_transition: NumberLike.optional(),
    task_done: z.boolean().optional(),
    category: z.enum(["core", "hardware", "suite", "ondemand"]).optional(),
  })
  .passthrough();

export const ServicesResponseSchema = z.union([
  z.array(ServiceSummarySchema),
  z.object({ services: z.array(ServiceSummarySchema) }).passthrough(),
]);

// ── Video status ────────────────────────────────────────

export const VideoStatusSchema = z
  .object({
    state: z.enum([
      "not_initialized",
      "stopped",
      "starting",
      "running",
      "error",
    ]),
    whep_url: NullableString,
    encoder: NullableString,
    cameras: z
      .object({
        cameras: z.array(
          z
            .object({
              name: z.string(),
              type: z.string(),
              device_path: z.string(),
              hardware_role: z.string(),
            })
            .passthrough(),
        ),
        assignments: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
    mediamtx: z
      .object({
        running: z.boolean(),
        webrtc_port: NumberLike,
      })
      .passthrough(),
    dependencies: z
      .record(
        z.string(),
        z
          .object({
            found: z.boolean(),
            path: NullableString.optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

// ── Capabilities (camera, compute, vision, models, features) ──

const CameraCapabilitySchema = z
  .object({
    name: z.string().optional(),
    type: z.string().optional(),
    device: z.string().optional(),
    resolution: z.string().optional(),
    fps: NumberLike.optional(),
    streaming: z.boolean().optional(),
  })
  .passthrough();

const ComputeCapabilitySchema = z
  .object({
    npu_available: z.boolean().optional(),
    npu_runtime: z
      .union([z.enum(["rknn", "tensorrt", "tflite", "opencv_dnn"]), z.null()])
      .optional(),
    npu_tops: NumberLike.optional(),
    npu_utilization_pct: NumberLike.optional(),
    gpu_available: z.boolean().optional(),
  })
  .passthrough();

const VisionStateSchema = z
  .object({
    engine_state: z
      .enum(["off", "initializing", "ready", "active", "degraded", "error"])
      .optional(),
    active_behavior: NullableString.optional(),
    behavior_state: z
      .union([
        z.enum([
          "idle",
          "designating",
          "searching",
          "tracking",
          "executing",
          "paused",
        ]),
        z.null(),
      ])
      .optional(),
    fps: NumberLike.optional(),
    inference_ms: NumberLike.optional(),
    model_loaded: NullableString.optional(),
    track_count: NumberLike.optional(),
    target_locked: z.boolean().optional(),
    target_confidence: NumberLike.optional(),
    obstacle_mode: z.enum(["off", "brake", "detour"]).optional(),
    nearest_obstacle_m: NullableNumber.optional(),
    threat_level: z.enum(["green", "yellow", "red"]).optional(),
    enabled: z.boolean().optional(),
    error_message: z.string().optional(),
  })
  .passthrough();

const ModelCacheInfoSchema = z
  .object({
    installed: z.array(z.unknown()).optional(),
    cache_used_mb: NumberLike.optional(),
    cache_max_mb: NumberLike.optional(),
    registry_url: z.string().optional(),
  })
  .passthrough();

const FeatureRecordSchema = z
  .object({
    id: z.string(),
    enabled: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .passthrough();

const FeatureStateLegacySchema = z
  .object({
    enabled: z.array(z.string()),
    active: NullableString,
  })
  .passthrough();

export const FeaturesPayloadSchema = z.union([
  z.array(FeatureRecordSchema),
  FeatureStateLegacySchema,
]);

const RosSnapshotSchema = z
  .object({
    supported: z.boolean().optional(),
    state: z.string().optional(),
  })
  .passthrough();

export const AgentCapabilitiesRawSchema = z
  .object({
    tier: NumberLike.optional(),
    cameras: z.array(CameraCapabilitySchema).optional(),
    compute: ComputeCapabilitySchema.optional(),
    vision: VisionStateSchema.optional(),
    models: z
      .union([z.array(z.unknown()), ModelCacheInfoSchema])
      .optional(),
    features: FeaturesPayloadSchema.optional(),
    ros: RosSnapshotSchema.optional(),
  })
  .passthrough();

export type AgentCapabilitiesRaw = z.infer<typeof AgentCapabilitiesRawSchema>;

// ── Consolidated /api/status/full ───────────────────────

const FullStatusServiceSchema = z
  .object({
    name: z.string(),
    state: z.string(),
    task_done: z.boolean().optional(),
    uptimeSeconds: NumberLike.optional(),
  })
  .passthrough();

const FullStatusResourcesSchema = z
  .object({
    cpu_percent: NumberLike,
    memory_percent: NumberLike,
    disk_percent: NumberLike,
    temperature: NullableNumber,
  })
  .passthrough();

const FullStatusVideoSchema = z
  .object({
    state: z.string(),
    whep_url: NullableString,
  })
  .passthrough();

export const FullStatusResponseSchema = z
  .object({
    version: z.string(),
    uptime_seconds: NumberLike,
    board: BoardInfoSchema,
    health: HealthInfoSchema,
    fc_connected: z.boolean(),
    fc_port: z.string(),
    fc_baud: NumberLike,
    services: z.array(FullStatusServiceSchema).optional(),
    resources: FullStatusResourcesSchema.optional(),
    video: FullStatusVideoSchema.optional(),
    telemetry: z.record(z.string(), z.unknown()).optional(),
    capabilities: AgentCapabilitiesRawSchema.optional(),
  })
  .passthrough();

export type FullStatusResponseValidated = z.infer<
  typeof FullStatusResponseSchema
>;

// ── Pairing ─────────────────────────────────────────────

export const PairingInfoSchema = z
  .object({
    device_id: z.string(),
    name: z.string(),
    version: z.string(),
    board: z.string(),
    paired: z.boolean(),
    pairing_code: z.string().optional(),
    owner_id: z.string().optional(),
    paired_at: NumberLike.optional(),
    mdns_host: z.string(),
  })
  .passthrough();

export const ClaimResponseSchema = z
  .object({
    api_key: z.string(),
    device_id: z.string(),
    name: z.string(),
    mdns_host: z.string(),
  })
  .passthrough();

// ── Peripherals ─────────────────────────────────────────

export const PeripheralInfoSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    category: z.enum(["sensor", "camera", "video", "gimbal", "compute"]),
    bus: z.string(),
    address: z.string(),
    rate_hz: NumberLike,
    status: z.enum(["ok", "warning", "error", "offline"]),
    last_reading: z.string(),
  })
  .passthrough();

export const PeripheralListSchema = z.array(PeripheralInfoSchema);

// ── MeshNet enrollment + peers ──────────────────────────

export const MeshNetEnrollmentSchema = z
  .object({
    enrolled: z.boolean(),
    droneId: z.string().optional(),
    fleetName: z.string().optional(),
    tier: NumberLike.optional(),
    enrolledSince: z.string().optional(),
  })
  .passthrough();

export const NetworkPeerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    signal_dbm: NumberLike,
    last_seen: z.string(),
    battery_percent: NumberLike,
    distance_m: NumberLike,
    tier: NumberLike,
    link_type: z.string(),
  })
  .passthrough();

export const NetworkPeerListSchema = z.array(NetworkPeerSchema);

// ── Command response ────────────────────────────────────

export const CommandResultSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .passthrough();
