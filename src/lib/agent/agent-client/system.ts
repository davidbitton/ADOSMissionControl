/**
 * @module agent/agent-client/system
 * @description Status / telemetry / services / system / logs / params
 * / generic command surface. Pure async functions that take a request
 * context; the AgentClient class re-exposes them as instance methods.
 * @license GPL-3.0-only
 */

import type { z } from "zod";
import type {
  AgentStatus,
  CommandResult,
  FcSource,
  FullStatusResponse,
  LogEntry,
  MavlinkPort,
  ServiceInfo,
  SystemResources,
  TelemetrySnapshot,
} from "../types";
import {
  AgentStatusSchema,
  CommandResultSchema,
  FullStatusResponseSchema,
  MavlinkPortsResponseSchema,
  PingResponseSchema,
  ServicesResponseSchema,
  SystemResourcesRawSchema,
  TelemetrySnapshotSchema,
} from "../schemas";
import { agentRequest, type RequestContext } from "./transport";
import { agentSupports, fetchVersionInfo } from "./version-cache";

/**
 * Coerce a raw `/api/system` (or partial consolidated `/api/status/full`)
 * response into the canonical `SystemResources` shape. Every numeric
 * field defaults to `0` so downstream consumers can `.toFixed()` etc.
 * without null-checking.
 *
 * The agent surfaces temperature in two shapes: `{ temperature: 45.2 }`
 * (consolidated endpoint) or `{ temperatures: { cpu_thermal: 45.2 } }`
 * (per-domain endpoint). Both are normalised to the flat `temperature`
 * field; falls back to `null` when neither is present.
 */
export function normaliseSystemResources(
  res: Record<string, unknown>,
): SystemResources {
  let temperature: number | null = null;
  if (res.temperature != null) {
    temperature = Number(res.temperature);
  } else if (res.temperatures && typeof res.temperatures === "object") {
    const temps = res.temperatures as Record<string, number>;
    temperature = temps.cpu_thermal ?? Object.values(temps)[0] ?? null;
  }
  return {
    cpu_percent: Number(res.cpu_percent ?? 0),
    memory_percent: Number(res.memory_percent ?? 0),
    memory_used_mb: Number(res.memory_used_mb ?? 0),
    memory_total_mb: Number(res.memory_total_mb ?? 0),
    memory_available_mb: Number(res.memory_available_mb ?? 0),
    memory_cache_mb: Number(res.memory_cache_mb ?? 0),
    swap_total_mb: Number(res.swap_total_mb ?? 0),
    swap_used_mb: Number(res.swap_used_mb ?? 0),
    swap_percent: Number(res.swap_percent ?? 0),
    disk_percent: Number(res.disk_percent ?? 0),
    disk_used_gb: Number(res.disk_used_gb ?? 0),
    disk_total_gb: Number(res.disk_total_gb ?? 0),
    temperature,
  };
}

export function getStatus(ctx: RequestContext): Promise<AgentStatus> {
  return agentRequest<AgentStatus>(ctx, "/api/status", {
    schema: AgentStatusSchema as z.ZodType<AgentStatus>,
    allowSchemaFallback: true,
  });
}

export function getTelemetry(ctx: RequestContext): Promise<TelemetrySnapshot> {
  return agentRequest<TelemetrySnapshot>(ctx, "/api/telemetry", {
    schema: TelemetrySnapshotSchema as z.ZodType<TelemetrySnapshot>,
    allowSchemaFallback: true,
  });
}

export async function getServices(
  ctx: RequestContext,
  agentUptimeHint?: number,
): Promise<ServiceInfo[]> {
  const svcRes = await agentRequest<
    Array<Record<string, unknown>> | { services: Array<Record<string, unknown>> }
  >(ctx, "/api/services", {
    schema: ServicesResponseSchema as z.ZodType<
      Array<Record<string, unknown>> | { services: Array<Record<string, unknown>> }
    >,
    allowSchemaFallback: true,
  });
  const list = Array.isArray(svcRes) ? svcRes : (svcRes.services ?? []);

  // Compute per-service uptime from monotonic last_transition timestamps.
  // Use agent uptime hint (from store) to estimate current monotonic time.
  const agentUptime = agentUptimeHint ?? 0;
  const transitions = list
    .map((s) => (typeof s.last_transition === "number" ? s.last_transition : 0))
    .filter((t) => t > 0);
  const earliestStart = transitions.length > 0 ? Math.min(...transitions) : 0;
  const monotonicNow = earliestStart > 0 ? earliestStart + agentUptime : 0;

  return list.map((s) => {
    const lastTransition = typeof s.last_transition === "number" ? s.last_transition : 0;
    const uptimeSeconds = monotonicNow > 0 && lastTransition > 0
      ? Math.max(0, monotonicNow - lastTransition)
      : (typeof s.uptime_seconds === "number" ? s.uptime_seconds : 0);

    return {
      name: String(s.name ?? "unknown"),
      status: (s.status ?? s.state ?? "stopped") as ServiceInfo["status"],
      pid: typeof s.pid === "number" ? s.pid : null,
      cpu_percent:
        typeof s.cpu_percent === "number"
          ? s.cpu_percent
          : (typeof s.cpuPercent === "number" ? s.cpuPercent : 0),
      memory_mb:
        typeof s.memory_mb === "number"
          ? s.memory_mb
          : (typeof s.memoryMb === "number" ? s.memoryMb : 0),
      uptime_seconds: uptimeSeconds,
    };
  });
}

export async function getSystemResources(
  ctx: RequestContext,
): Promise<SystemResources> {
  const res = await agentRequest<Record<string, unknown>>(ctx, "/api/system", {
    schema: SystemResourcesRawSchema as z.ZodType<Record<string, unknown>>,
    allowSchemaFallback: true,
  });
  return normaliseSystemResources(res);
}

export async function getLogs(
  ctx: RequestContext,
  params?: { level?: string; limit?: number },
): Promise<LogEntry[]> {
  const qs = new URLSearchParams();
  if (params?.level) qs.set("level", params.level);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  const res = await agentRequest<LogEntry[] | { entries: LogEntry[] }>(
    ctx,
    `/api/logs${query ? `?${query}` : ""}`,
  );
  return Array.isArray(res) ? res : (res.entries ?? []);
}

export function getParams(
  ctx: RequestContext,
): Promise<Record<string, number>> {
  return agentRequest<Record<string, number>>(ctx, "/api/params");
}

export function sendCommand(
  ctx: RequestContext,
  cmd: string,
  args?: unknown[],
): Promise<CommandResult> {
  return agentRequest<CommandResult>(ctx, "/api/command", {
    method: "POST",
    body: JSON.stringify({ command: cmd, args: args ?? [] }),
    schema: CommandResultSchema as z.ZodType<CommandResult>,
  });
}

export function getConfig(ctx: RequestContext): Promise<Record<string, unknown>> {
  return agentRequest<Record<string, unknown>>(ctx, "/api/config");
}

/**
 * Write a single config value via the agent's PUT /api/config endpoint.
 * Dot-separated key paths are supported by the agent
 * (e.g. `ground_station.display.type`). The agent coerces the string
 * value to the underlying field type at the Pydantic boundary, so the
 * caller hands in a plain string. Returns the {key, value} echo the
 * agent sends back so the UI can confirm the round-trip.
 */
export function setConfigValue(
  ctx: RequestContext,
  key: string,
  value: string,
): Promise<{ status?: string; key?: string; value?: unknown; error?: string }> {
  return agentRequest<{
    status?: string;
    key?: string;
    value?: unknown;
    error?: string;
  }>(ctx, "/api/config", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
}

export function restartService(
  ctx: RequestContext,
  name: string,
): Promise<CommandResult> {
  return agentRequest<CommandResult>(
    ctx,
    `/api/services/${encodeURIComponent(name)}/restart`,
    {
      method: "POST",
      schema: CommandResultSchema as z.ZodType<CommandResult>,
    },
  );
}

/**
 * Fetch all status data in a single request (agent v0.3.19+).
 * Falls back to null on older agents that don't have this endpoint.
 *
 * Uses /api/version capability negotiation when available so we
 * skip the request entirely (and don't burn a 404 round-trip)
 * against an agent that hasn't advertised status.full.
 */
export async function getFullStatus(
  ctx: RequestContext,
): Promise<FullStatusResponse | null> {
  const info = await fetchVersionInfo(ctx);
  if (info && !agentSupports(info, "status.full")) {
    return null;
  }
  try {
    return await agentRequest<FullStatusResponse>(ctx, "/api/status/full", {
      schema: FullStatusResponseSchema as z.ZodType<FullStatusResponse>,
      allowSchemaFallback: true,
    });
  } catch {
    return null; // Agent version older than 0.3.19, or transient failure
  }
}

/**
 * Enumerate the serial devices the agent's MAVLink router can bind as the
 * FC link (`GET /api/mavlink/ports`). Returns `[]` on agents that predate the
 * endpoint (or any transient failure) so the picker degrades to "no ports
 * detected" rather than throwing.
 */
export async function getMavlinkPorts(
  ctx: RequestContext,
): Promise<MavlinkPort[]> {
  try {
    const res = await agentRequest<{ ports: MavlinkPort[] }>(
      ctx,
      "/api/mavlink/ports",
      {
        schema: MavlinkPortsResponseSchema as z.ZodType<{ ports: MavlinkPort[] }>,
        allowSchemaFallback: true,
      },
    );
    return Array.isArray(res.ports) ? res.ports : [];
  } catch {
    return [];
  }
}

/**
 * Point the MAVLink router at a chosen FC source. Writes the `mavlink.source`
 * enum and, for a fixed serial source, the `serial_port` / `baud_rate`, all
 * through the existing PUT /api/config surface so the agent's config validator
 * owns the coercion. The caller then watches `mavlink_alive` / `heartbeat_age_s`
 * on the next status poll to confirm a live link.
 */
export async function setMavlinkSource(
  ctx: RequestContext,
  source: FcSource,
  opts?: { serialPort?: string; baudRate?: number },
): Promise<void> {
  await setConfigValue(ctx, "mavlink.source", source);
  if (source === "serial") {
    if (opts?.serialPort) {
      await setConfigValue(ctx, "mavlink.serial_port", opts.serialPort);
    }
    if (typeof opts?.baudRate === "number") {
      await setConfigValue(ctx, "mavlink.baud_rate", String(opts.baudRate));
    }
  }
}

/**
 * Measure the control-plane round-trip time to the agent. Hits the lightweight
 * `GET /api/ping` echo and times it with `performance.now()`. The returned
 * `rttMs` is the wall-clock RTT; `pong` is the server epoch ms the agent
 * stamped (handed back so callers can derive a clock offset if they want).
 * Returns null on agents that predate `/api/ping` or any transient failure.
 */
export async function pingAgent(
  ctx: RequestContext,
): Promise<{ rttMs: number; pong: number } | null> {
  const started =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const res = await agentRequest<{ pong: number }>(ctx, "/api/ping", {
      schema: PingResponseSchema as z.ZodType<{ pong: number }>,
      allowSchemaFallback: true,
    });
    const ended =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    return { rttMs: Math.max(0, Math.round(ended - started)), pong: res.pong };
  } catch {
    return null;
  }
}
