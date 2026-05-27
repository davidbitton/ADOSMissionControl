/**
 * @module command/bridges/status-mapper
 * @description Pure mapping helpers that turn a `cmd_droneStatus`
 * Convex row into the shapes the rest of the GCS consumes (AgentStatus,
 * service list, fan-out blocks, capability extras). No React, no
 * Zustand — every call returns a value the bridge component can hand
 * off to the appropriate setter atomically.
 * @license GPL-3.0-only
 */

import type {
  AgentStatus,
  InstallStatus,
  WfbModuleSource,
} from "@/lib/agent/types";
import type { AgentCapabilities } from "@/lib/agent/feature-types";
import type { GroundStationRole } from "@/lib/api/ground-station/types";
import type { inferCapabilities } from "@/lib/agent/infer-capabilities";

const SERVICE_STATES = [
  "running",
  "stopped",
  "error",
  "degraded",
  "starting",
  "circuit_open",
] as const;
type ServiceState = (typeof SERVICE_STATES)[number];

const WFB_MODULE_SOURCES = ["prebuilt", "dkms", "none"] as const;
const INSTALL_STATUSES = ["ok", "degraded", "failed", "unknown"] as const;

function asWfbModuleSource(value: unknown): WfbModuleSource | undefined {
  return typeof value === "string" &&
    (WFB_MODULE_SOURCES as readonly string[]).includes(value)
    ? (value as WfbModuleSource)
    : undefined;
}

function asInstallStatus(value: unknown): InstallStatus | undefined {
  return typeof value === "string" &&
    (INSTALL_STATUSES as readonly string[]).includes(value)
    ? (value as InstallStatus)
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

export interface MappedAgentStatus {
  status: AgentStatus;
}

export function mapCloudStatus(cloudStatus: Record<string, unknown>): AgentStatus {
  const board = {
    name: (cloudStatus.boardName as string | undefined) || "Unknown",
    model: "",
    tier: (cloudStatus.boardTier as number | undefined) || 0,
    ram_mb:
      (cloudStatus.boardRamMb as number | undefined) ||
      (cloudStatus.memoryTotalMb as number | undefined) ||
      0,
    cpu_cores: (cloudStatus.cpuCores as number | undefined) || 0,
    vendor: "",
    soc: (cloudStatus.boardSoc as string | undefined) || "",
    arch: (cloudStatus.boardArch as string | undefined) || "",
    hw_video_codecs: [] as string[],
  };
  return {
    version: (cloudStatus.version as string | undefined) || "?.?.?",
    uptime_seconds: (cloudStatus.uptimeSeconds as number | undefined) || 0,
    board,
    health: {
      cpu_percent: (cloudStatus.cpuPercent as number | undefined) || 0,
      memory_percent: (cloudStatus.memoryPercent as number | undefined) || 0,
      disk_percent: (cloudStatus.diskPercent as number | undefined) || 0,
      temperature: (cloudStatus.temperature as number | null | undefined) ?? null,
      timestamp: new Date(cloudStatus.updatedAt as number).toISOString(),
    },
    fc_connected: (cloudStatus.fcConnected as boolean | undefined) || false,
    fc_port: (cloudStatus.fcPort as string | undefined) || "",
    fc_baud: (cloudStatus.fcBaud as number | undefined) || 0,
    // Install-health + kernel/radio-module surface. Mirrors the
    // boardArch handling: forwarded verbatim from the heartbeat row,
    // left undefined when the agent omits the field so older agents
    // render nothing rather than a stale value.
    kernel_release:
      typeof cloudStatus.kernelRelease === "string" && cloudStatus.kernelRelease
        ? cloudStatus.kernelRelease
        : undefined,
    wfb_module_source: asWfbModuleSource(cloudStatus.wfbModuleSource),
    install_status: asInstallStatus(cloudStatus.installStatus),
    install_version:
      typeof cloudStatus.installVersion === "string" && cloudStatus.installVersion
        ? cloudStatus.installVersion
        : undefined,
    failed_steps: asStringArray(cloudStatus.failedSteps),
  };
}

export interface MappedSystemUpdate {
  status: AgentStatus;
  lastUpdatedAt: number;
  stale: boolean;
  resources: {
    cpu_percent: number;
    memory_percent: number;
    memory_used_mb: number;
    memory_total_mb: number;
    disk_percent: number;
    disk_used_gb: number;
    disk_total_gb: number;
    temperature: number | null;
  };
  cpuHistory?: number[];
  memoryHistory?: number[];
  services?: Array<{
    name: unknown;
    status: ServiceState;
    pid: unknown;
    cpu_percent: number;
    memory_mb: number;
    uptime_seconds: number;
    category?: "core" | "hardware" | "suite" | "ondemand";
  }>;
  processCpuPercent?: number | null;
  processMemoryMb?: number | null;
  logs?: unknown[];
}

export function buildSystemUpdate(
  mapped: AgentStatus,
  cloudStatus: Record<string, unknown>,
  isDataFresh: boolean,
): MappedSystemUpdate {
  const update: MappedSystemUpdate = {
    status: mapped,
    lastUpdatedAt: cloudStatus.updatedAt as number,
    stale: !isDataFresh,
    resources: {
      cpu_percent: mapped.health.cpu_percent,
      memory_percent: mapped.health.memory_percent,
      memory_used_mb: (cloudStatus.memoryUsedMb as number | undefined) ?? 0,
      memory_total_mb: (cloudStatus.memoryTotalMb as number | undefined) ?? 0,
      disk_percent: mapped.health.disk_percent,
      disk_used_gb: (cloudStatus.diskUsedGb as number | undefined) ?? 0,
      disk_total_gb: (cloudStatus.diskTotalGb as number | undefined) ?? 0,
      temperature: mapped.health.temperature,
    },
  };

  const cpuHistory = cloudStatus.cpuHistory;
  if (Array.isArray(cpuHistory) && cpuHistory.length > 0) {
    update.cpuHistory = cpuHistory as number[];
  }
  const memoryHistory = cloudStatus.memoryHistory;
  if (Array.isArray(memoryHistory) && memoryHistory.length > 0) {
    update.memoryHistory = memoryHistory as number[];
  }

  const services = cloudStatus.services;
  if (Array.isArray(services)) {
    update.services = services.map((s: Record<string, unknown>) => {
      const rawStatus = (s.status ?? "stopped") as string;
      const safeStatus = (SERVICE_STATES as readonly string[]).includes(rawStatus)
        ? (rawStatus as ServiceState)
        : "stopped";
      return {
        name: s.name,
        status: safeStatus,
        pid: s.pid ?? null,
        cpu_percent: (s.cpuPercent as number | undefined) || 0,
        memory_mb: (s.memoryMb as number | undefined) || 0,
        uptime_seconds: (s.uptimeSeconds as number | undefined) ?? 0,
        category: s.category as "core" | "hardware" | "suite" | "ondemand" | undefined,
      };
    });
    update.processCpuPercent =
      (cloudStatus.processCpuPercent as number | null | undefined) ?? null;
    update.processMemoryMb =
      (cloudStatus.processMemoryMb as number | null | undefined) ?? null;
  }

  const logs = cloudStatus.logs;
  if (Array.isArray(logs)) {
    update.logs = logs;
  }

  return update;
}

export interface GroundStationFanOutCurrent {
  linkHealth: {
    rssi_dbm: number | null;
    bitrate_mbps: number | null;
    fec_rec: number;
    fec_lost: number;
    channel: number | null;
  };
  status: {
    paired_drone: string | null;
    profile: string;
    uplink_active: string | null;
  };
  role: {
    info: {
      current: GroundStationRole | null;
      configured: GroundStationRole | null;
      supported: GroundStationRole[];
      mesh_capable: boolean;
    } | null;
  };
  uplink: {
    active: string | null;
  };
  peripherals: {
    list: unknown[];
  };
}

/**
 * Build the per-slice patch the bridge component should apply to
 * `useGroundStationStore` when the agent profile is `ground-station`.
 * Returns `null` when there's nothing to patch (avoids a no-op
 * setState).
 */
export function buildGroundStationPatch(
  cloudStatus: Record<string, unknown>,
  current: GroundStationFanOutCurrent,
): Record<string, unknown> | null {
  const profileField = cloudStatus.profile as string | undefined;
  if (profileField !== "ground-station" && profileField !== "ground_station") {
    return null;
  }

  const radio = cloudStatus.radio as Record<string, unknown> | undefined;
  const wfbFailoverState = cloudStatus.wfbFailoverState as string | undefined;
  const roleField = cloudStatus.role as string | undefined;
  const peripherals = cloudStatus.peripherals;

  const patch: Record<string, unknown> = {};

  if (radio) {
    const rssiDbm = radio.rssiDbm as number | null | undefined;
    const bitrateKbps = radio.bitrateKbps as number | null | undefined;
    const fecRecovered = radio.fecRecovered as number | null | undefined;
    const fecLost = radio.fecLost as number | null | undefined;
    const channel = radio.channel as number | null | undefined;
    patch.linkHealth = {
      ...current.linkHealth,
      rssi_dbm: rssiDbm ?? null,
      bitrate_mbps: bitrateKbps != null ? bitrateKbps / 1000 : null,
      fec_rec: fecRecovered ?? 0,
      fec_lost: fecLost ?? 0,
      channel: channel ?? null,
    };
    const pairedWithDeviceId = radio.pairedWithDeviceId as string | null | undefined;
    patch.status = {
      ...current.status,
      paired_drone: pairedWithDeviceId ?? null,
      profile: "ground_station",
      uplink_active: wfbFailoverState ?? current.status.uplink_active,
    };
  }

  if (roleField) {
    const role = roleField as GroundStationRole;
    const currentRoleInfo = current.role.info;
    patch.role = {
      ...current.role,
      info: {
        current: role,
        configured: currentRoleInfo?.configured ?? role,
        supported: currentRoleInfo?.supported ?? ["direct", "relay", "receiver"],
        mesh_capable: currentRoleInfo?.mesh_capable ?? false,
      },
    };
  }

  if (wfbFailoverState) {
    patch.uplink = {
      ...current.uplink,
      active: wfbFailoverState,
    };
  }

  if (Array.isArray(peripherals)) {
    patch.peripherals = {
      ...current.peripherals,
      list: peripherals as typeof current.peripherals.list,
    };
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export interface VideoStreamUrls {
  state: string | undefined;
  whepUrl: string | null;
  lanHost: string | null;
}

/**
 * Resolve the WHEP URL the cascade should attempt next, given the
 * heartbeat's video block + a possible LAN host fallback.
 */
export function resolveVideoUrls(
  cloudStatus: Record<string, unknown>,
  lanHost: string | null,
): VideoStreamUrls {
  const videoState = cloudStatus.videoState as string | undefined;
  const videoWhepPort = cloudStatus.videoWhepPort as number | undefined;
  const videoWhepUrl = cloudStatus.videoWhepUrl as string | undefined;
  const lastIp = cloudStatus.lastIp as string | undefined;

  let whepUrl: string | null = null;
  if (videoState === "running" && videoWhepUrl) {
    whepUrl = videoWhepUrl;
  } else if (
    videoState === "running" &&
    lastIp &&
    videoWhepPort &&
    videoWhepPort > 0
  ) {
    whepUrl = `http://${lastIp}:${videoWhepPort}/main/whep`;
  } else if (videoState === "running" && lanHost) {
    // mediamtx default WHEP port is stable across deployments.
    whepUrl = `http://${lanHost}:8889/main/whep`;
  }
  return { state: videoState, whepUrl, lanHost };
}

export interface MavlinkUrl {
  url: string | null;
}

/**
 * Resolve the MAVLink WebSocket URL the connection store should
 * advertise. Prefers the heartbeat-published URL, then a port hint
 * + lastIp, then the LAN-host default port.
 */
export function resolveMavlinkUrl(
  cloudStatus: Record<string, unknown>,
  lanHost: string | null,
): MavlinkUrl {
  const mavlinkWsPort = cloudStatus.mavlinkWsPort as number | undefined;
  const mavlinkWsUrl = cloudStatus.mavlinkWsUrl as string | undefined;
  const lastIp = cloudStatus.lastIp as string | undefined;

  if (mavlinkWsUrl) return { url: mavlinkWsUrl };
  if (lastIp && mavlinkWsPort && mavlinkWsPort > 0) {
    return { url: `ws://${lastIp}:${mavlinkWsPort}/` };
  }
  if (lanHost) {
    // ados-mavlink defaults to port 8765 across all shipped agents.
    return { url: `ws://${lanHost}:8765/` };
  }
  return { url: null };
}

export interface HeartbeatExtras {
  videoRestartAttempts: number;
  foxgloveBindFailed: boolean;
  pairingCodeExpiresAt: number | null;
  mavlinkWsUrlPrev: string | null;
  wfbFailoverState: "local" | "cloud_relay" | "failed";
  manualConnectionUrls:
    | {
        mavlinkTcp: string | null;
        mavlinkWs: string | null;
        videoViewer: string | null;
        videoWhep: string | null;
      }
    | null;
  cloudRelayUrl: string | null;
  cloudflareUrl: string | null;
  videoPipeline: AgentCapabilities["videoPipeline"] | undefined;
  inferOverrides: Parameters<typeof inferCapabilities>[2];
  radioRaw: unknown;
  setupState: string | undefined;
  profileSource: string | undefined;
  profile: string | undefined;
  role: string | null | undefined;
  peerDeviceId: string | null;
  peerRole: string | null;
  peerChannel: number | null;
  peerRssiDbm: number | null;
  peerSeenAtUnix: number | null;
  cameraState: string | null;
  canBuses: AgentCapabilities["canBuses"];
}

const FAILOVER_STATES = ["local", "cloud_relay", "failed"] as const;

const pickStringOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

/**
 * Pull every heartbeat-derived extra field out of the Convex row.
 * Returned shape is forward-permissive: the bridge can hand each
 * field to the capability store and rely on the store's own merge to
 * preserve the prior value when a tick omits a field.
 */
export function buildHeartbeatExtras(
  cloudStatus: Record<string, unknown>,
): HeartbeatExtras {
  const videoRestart = cloudStatus.videoRestartAttempts;
  const videoRestartAttempts =
    typeof videoRestart === "number" &&
    Number.isFinite(videoRestart) &&
    videoRestart >= 0
      ? Math.floor(videoRestart)
      : 0;
  const foxgloveBindFailed = cloudStatus.foxgloveBindFailed === true;
  const pairingCodeExpiresAtRaw = cloudStatus.pairingCodeExpiresAt;
  const pairingCodeExpiresAt =
    typeof pairingCodeExpiresAtRaw === "number" &&
    Number.isFinite(pairingCodeExpiresAtRaw) &&
    pairingCodeExpiresAtRaw > 0
      ? pairingCodeExpiresAtRaw
      : null;
  const mavlinkWsUrlPrevRaw = cloudStatus.mavlinkWsUrlPrev;
  const mavlinkWsUrlPrev =
    typeof mavlinkWsUrlPrevRaw === "string" && mavlinkWsUrlPrevRaw.length > 0
      ? mavlinkWsUrlPrevRaw
      : null;
  const wfbFailoverRaw = cloudStatus.wfbFailoverState as string | undefined;
  const wfbFailoverState: "local" | "cloud_relay" | "failed" = (
    FAILOVER_STATES as readonly string[]
  ).includes(wfbFailoverRaw ?? "")
    ? (wfbFailoverRaw as "local" | "cloud_relay" | "failed")
    : "local";

  const rawManual = cloudStatus.manualConnectionUrls;
  const manualConnectionUrls =
    rawManual && typeof rawManual === "object"
      ? {
          mavlinkTcp: pickStringOrNull(
            (rawManual as Record<string, unknown>).mavlinkTcp,
          ),
          mavlinkWs: pickStringOrNull(
            (rawManual as Record<string, unknown>).mavlinkWs,
          ),
          videoViewer: pickStringOrNull(
            (rawManual as Record<string, unknown>).videoViewer,
          ),
          videoWhep: pickStringOrNull(
            (rawManual as Record<string, unknown>).videoWhep,
          ),
        }
      : null;

  const inferOverrides: Parameters<typeof inferCapabilities>[2] = {
    lcdActivePage: cloudStatus.lcdActivePage as string | null | undefined,
    lcdTouchCalibrated: cloudStatus.lcdTouchCalibrated as
      | boolean
      | null
      | undefined,
    lcdRotation: cloudStatus.lcdRotation as number | null | undefined,
    lcdSnapshotUrl: cloudStatus.lcdSnapshotUrl as string | null | undefined,
    lcdLastTouchAt: cloudStatus.lcdLastTouchAt as number | null | undefined,
    lcdLastGesture: cloudStatus.lcdLastGesture as string | null | undefined,
    videoLocalDecoderActive: cloudStatus.videoLocalDecoderActive as
      | boolean
      | null
      | undefined,
    videoLocalDecoderType: cloudStatus.videoLocalDecoderType as
      | string
      | null
      | undefined,
    videoLocalDecoderFps: cloudStatus.videoLocalDecoderFps as
      | number
      | null
      | undefined,
    videoRecording: cloudStatus.videoRecording as boolean | null | undefined,
    uiTheme: cloudStatus.uiTheme as string | null | undefined,
    displayType: cloudStatus.displayType as string | null | undefined,
    navigation: cloudStatus.navigation,
  };

  const flavor = cloudStatus.videoPipelineFlavor;
  const videoPipeline: AgentCapabilities["videoPipeline"] | undefined =
    typeof flavor === "string" && flavor.length > 0
      ? {
          flavor,
          encoderName:
            typeof cloudStatus.videoEncoderName === "string"
              ? cloudStatus.videoEncoderName
              : undefined,
          encoderHwAccel:
            typeof cloudStatus.videoEncoderHwAccel === "boolean"
              ? cloudStatus.videoEncoderHwAccel
              : undefined,
          cameraSource:
            typeof cloudStatus.videoCameraSource === "string"
              ? cloudStatus.videoCameraSource
              : undefined,
          state:
            typeof cloudStatus.videoPipelineState === "string"
              ? cloudStatus.videoPipelineState
              : undefined,
        }
      : undefined;

  const setupState =
    typeof cloudStatus.setupState === "string"
      ? cloudStatus.setupState
      : undefined;
  const profileSource =
    typeof cloudStatus.profileSource === "string"
      ? cloudStatus.profileSource
      : undefined;
  const profile =
    typeof cloudStatus.profile === "string"
      ? cloudStatus.profile
      : undefined;
  const role =
    typeof cloudStatus.role === "string"
      ? cloudStatus.role
      : cloudStatus.role === null
        ? null
        : undefined;

  const peerSeenRaw = cloudStatus.peerSeenAtUnix;
  const peerSeenAtUnix =
    typeof peerSeenRaw === "number" && Number.isFinite(peerSeenRaw)
      ? peerSeenRaw
      : null;
  const peerChannelRaw = cloudStatus.peerChannel;
  const peerChannel =
    typeof peerChannelRaw === "number" && Number.isFinite(peerChannelRaw)
      ? peerChannelRaw
      : null;
  const peerRssiRaw = cloudStatus.peerRssiDbm;
  const peerRssiDbm =
    typeof peerRssiRaw === "number" && Number.isFinite(peerRssiRaw)
      ? peerRssiRaw
      : null;

  return {
    videoRestartAttempts,
    foxgloveBindFailed,
    pairingCodeExpiresAt,
    mavlinkWsUrlPrev,
    wfbFailoverState,
    manualConnectionUrls,
    cloudRelayUrl: pickStringOrNull(cloudStatus.cloudRelayUrl),
    cloudflareUrl: pickStringOrNull(cloudStatus.cloudflareUrl),
    videoPipeline,
    inferOverrides,
    radioRaw: cloudStatus.radio,
    setupState,
    profileSource,
    profile,
    role,
    peerDeviceId: pickStringOrNull(cloudStatus.peerDeviceId),
    peerRole: pickStringOrNull(cloudStatus.peerRole),
    peerChannel,
    peerRssiDbm,
    peerSeenAtUnix,
    cameraState: (() => {
      const raw = cloudStatus.cameraState;
      if (typeof raw === "string" && (raw === "ready" || raw === "missing" || raw === "error")) {
        return raw;
      }
      return null;
    })(),
    canBuses: (() => {
      // Structural pass-through. The agent emits the canBuses array on
      // the heartbeat root once the FC parameter cache has at least
      // one CAN_P*_DRIVER / BITRATE / CAN_D*_PROTOCOL entry; before
      // that the field is omitted entirely. We return undefined to
      // preserve that "not yet known" semantics so the store's merge
      // can keep the prior value through a sparse tick.
      const raw = cloudStatus.canBuses;
      if (!Array.isArray(raw)) return undefined;
      const parsed = raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const e = entry as Record<string, unknown>;
        if (
          typeof e.port !== "number"
          || typeof e.driver !== "number"
          || typeof e.bitrate !== "number"
          || typeof e.protocol !== "number"
        ) {
          return [];
        }
        return [{
          port: e.port,
          driver: e.driver,
          bitrate: e.bitrate,
          protocol: e.protocol,
        }];
      });
      return parsed;
    })(),
  };
}
