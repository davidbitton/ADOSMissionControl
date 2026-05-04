/**
 * @module AgentClient
 * @description REST API client for communicating with the ADOS Drone Agent.
 * @license GPL-3.0-only
 */

import { z } from "zod";
import type {
  AgentStatus,
  AgentVersionInfo,
  TelemetrySnapshot,
  ServiceInfo,
  SystemResources,
  LogEntry,
  CommandResult,
  PeripheralInfo,
  ScriptInfo,
  ScriptRunResult,
  SuiteInfo,
  MeshNetEnrollment,
  NetworkPeer,
  PairingInfo,
  SetupStatus,
  SetupActionResult,
  HardwareCheckStatus,
  ClaimResponse,
  VideoStatus,
  FullStatusResponse,
} from "./types";
import {
  AgentStatusSchema,
  AgentVersionInfoSchema,
  ClaimResponseSchema,
  CommandResultSchema,
  FullStatusResponseSchema,
  HardwareCheckStatusSchema,
  MeshNetEnrollmentSchema,
  NetworkPeerListSchema,
  PairingInfoSchema,
  PeripheralListSchema,
  ServicesResponseSchema,
  SetupActionResultSchema,
  SetupStatusSchema,
  SystemResourcesRawSchema,
  TelemetrySnapshotSchema,
  VideoStatusSchema,
} from "./schemas";

// Module-level cache so multiple components hitting getVersion() in the
// same render frame do not produce duplicate network requests. Keyed
// by baseUrl|apiKey; entries expire after CAPABILITY_TTL_MS or when
// the page is reloaded.
const CAPABILITY_TTL_MS = 5 * 60 * 1000;
interface CachedVersion {
  info: AgentVersionInfo | null;
  expiresAt: number;
}
const versionCache = new Map<string, CachedVersion>();

/**
 * Capability flag presence check that gracefully handles older agents
 * (where /api/version is absent). Falls back to feature absent.
 */
export function agentSupports(
  info: AgentVersionInfo | null | undefined,
  capability: string,
): boolean {
  if (!info) return false;
  return info.capabilities.includes(capability);
}

export class AgentClient {
  private baseUrl: string;
  private apiKey: string | null;

  constructor(baseUrl: string, apiKey?: string | null) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey ?? null;
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { schema?: z.ZodType<T>; allowSchemaFallback?: boolean },
  ): Promise<T> {
    const { schema, allowSchemaFallback = false, ...fetchInit } = init ?? {};
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(fetchInit?.headers as Record<string, string>),
    };
    if (this.apiKey) {
      headers["X-ADOS-Key"] = this.apiKey;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...fetchInit,
      headers,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(`Agent API ${res.status}: ${text}`);
    }
    const json = (await res.json()) as unknown;
    if (schema) {
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        if (allowSchemaFallback && process.env.NODE_ENV !== "production") {
          console.warn(
            `[agent-client] schema mismatch on ${path}:`,
            parsed.error.flatten(),
          );
        }
        if (allowSchemaFallback) {
          return json as T;
        }
        throw new Error(`Agent API schema mismatch on ${path}`);
      }
      return parsed.data as T;
    }
    return json as T;
  }

  async getStatus(): Promise<AgentStatus> {
    return this.request<AgentStatus>("/api/status", {
      schema: AgentStatusSchema as z.ZodType<AgentStatus>,
      allowSchemaFallback: true,
    });
  }

  /**
   * Fetch the agent's wire-protocol version + capability flags.
   * Returns null when the agent is older than 0.8.6 (does not have
   * the endpoint). Cached for 5 minutes per baseUrl+apiKey to avoid
   * burning requests when multiple components ask in the same frame.
   */
  async getVersion(opts?: { force?: boolean }): Promise<AgentVersionInfo | null> {
    const key = `${this.baseUrl}|${this.apiKey ?? ""}`;
    const cached = versionCache.get(key);
    if (cached && !opts?.force && Date.now() < cached.expiresAt) {
      return cached.info;
    }
    let info: AgentVersionInfo | null = null;
    try {
      info = await this.request<AgentVersionInfo>("/api/version", {
        schema: AgentVersionInfoSchema as z.ZodType<AgentVersionInfo>,
      });
    } catch (err) {
      // Older agent (pre-0.8.6) has no /api/version. Treat as
      // "no capabilities advertised" so callers fall back to the
      // legacy code path. Other transport errors are also treated as
      // "no info"; the caller sees null and degrades.
      if (process.env.NODE_ENV !== "production") {
        console.debug("[agent-client] getVersion failed:", err);
      }
      info = null;
    }
    versionCache.set(key, {
      info,
      expiresAt: Date.now() + CAPABILITY_TTL_MS,
    });
    return info;
  }

  /** Convenience: does the agent advertise the named capability? */
  async supports(capability: string): Promise<boolean> {
    const info = await this.getVersion();
    return agentSupports(info, capability);
  }

  async getTelemetry(): Promise<TelemetrySnapshot> {
    return this.request<TelemetrySnapshot>("/api/telemetry", {
      schema: TelemetrySnapshotSchema as z.ZodType<TelemetrySnapshot>,
      allowSchemaFallback: true,
    });
  }

  async getServices(agentUptimeHint?: number): Promise<ServiceInfo[]> {
    const svcRes = await this.request<
      Array<Record<string, unknown>> | { services: Array<Record<string, unknown>> }
    >("/api/services", {
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
        cpu_percent: typeof s.cpu_percent === "number" ? s.cpu_percent : (typeof s.cpuPercent === "number" ? s.cpuPercent : 0),
        memory_mb: typeof s.memory_mb === "number" ? s.memory_mb : (typeof s.memoryMb === "number" ? s.memoryMb : 0),
        uptime_seconds: uptimeSeconds,
      };
    });
  }

  async getSystemResources(): Promise<SystemResources> {
    const res = await this.request<Record<string, unknown>>("/api/system", {
      schema: SystemResourcesRawSchema as z.ZodType<Record<string, unknown>>,
      allowSchemaFallback: true,
    });
    // Agent returns temperatures: { cpu_thermal: 45.2 } — map to flat temperature field
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
      disk_percent: Number(res.disk_percent ?? 0),
      disk_used_gb: Number(res.disk_used_gb ?? 0),
      disk_total_gb: Number(res.disk_total_gb ?? 0),
      temperature,
    };
  }

  async getLogs(params?: { level?: string; limit?: number }): Promise<LogEntry[]> {
    const qs = new URLSearchParams();
    if (params?.level) qs.set("level", params.level);
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    const res = await this.request<LogEntry[] | { entries: LogEntry[] }>(`/api/logs${query ? `?${query}` : ""}`);
    return Array.isArray(res) ? res : (res.entries ?? []);
  }

  async getParams(): Promise<Record<string, number>> {
    return this.request<Record<string, number>>("/api/params");
  }

  async sendCommand(cmd: string, args?: unknown[]): Promise<CommandResult> {
    return this.request<CommandResult>("/api/command", {
      method: "POST",
      body: JSON.stringify({ command: cmd, args: args ?? [] }),
      schema: CommandResultSchema as z.ZodType<CommandResult>,
    });
  }

  async getConfig(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/config");
  }

  async getSetupStatus(): Promise<SetupStatus> {
    return this.request<SetupStatus>("/api/v1/setup/status", {
      schema: SetupStatusSchema as z.ZodType<SetupStatus>,
      allowSchemaFallback: true,
    });
  }

  /**
   * Persist the operator's profile choice from the onboarding wizard.
   * Pass `ground_role` only when `profile === "ground_station"`.
   */
  async postProfileChoice(
    profile: "drone" | "ground_station",
    ground_role?: "direct" | "relay" | "receiver" | null,
  ): Promise<SetupActionResult> {
    const body: { profile: string; ground_role?: string | null } = { profile };
    if (profile === "ground_station") {
      body.ground_role = ground_role ?? "direct";
    }
    return this.request<SetupActionResult>("/api/v1/setup/profile", {
      method: "POST",
      body: JSON.stringify(body),
      schema: SetupActionResultSchema as z.ZodType<SetupActionResult>,
      allowSchemaFallback: true,
    });
  }

  /** Per-component hardware-check snapshot for the active profile + role. */
  async getHardwareCheck(): Promise<HardwareCheckStatus> {
    return this.request<HardwareCheckStatus>("/api/v1/setup/hardware-check", {
      schema: HardwareCheckStatusSchema as z.ZodType<HardwareCheckStatus>,
      allowSchemaFallback: true,
    });
  }

  /** Re-run the hardware-check sweep on demand. Uncached. */
  async refreshHardwareCheck(): Promise<HardwareCheckStatus> {
    return this.request<HardwareCheckStatus>(
      "/api/v1/setup/hardware-check/refresh",
      {
        method: "POST",
        schema: HardwareCheckStatusSchema as z.ZodType<HardwareCheckStatus>,
        allowSchemaFallback: true,
      },
    );
  }

  async restartService(name: string): Promise<CommandResult> {
    return this.request<CommandResult>(`/api/services/${encodeURIComponent(name)}/restart`, {
      method: "POST",
      schema: CommandResultSchema as z.ZodType<CommandResult>,
    });
  }

  // ── Peripherals ─────────────────────────────────────────

  async getPeripherals(): Promise<PeripheralInfo[]> {
    return this.request<PeripheralInfo[]>("/api/peripherals", {
      schema: PeripheralListSchema as z.ZodType<PeripheralInfo[]>,
      allowSchemaFallback: true,
    });
  }

  async scanPeripherals(): Promise<PeripheralInfo[]> {
    return this.request<PeripheralInfo[]>("/api/peripherals/scan", {
      method: "POST",
      schema: PeripheralListSchema as z.ZodType<PeripheralInfo[]>,
      allowSchemaFallback: true,
    });
  }

  // ── Scripts ─────────────────────────────────────────────

  async getScripts(): Promise<ScriptInfo[]> {
    const res = await this.request<ScriptInfo[] | { scripts: ScriptInfo[] }>("/api/scripts");
    return Array.isArray(res) ? res : (res.scripts ?? []);
  }

  async saveScript(name: string, content: string, suite?: string): Promise<ScriptInfo> {
    return this.request<ScriptInfo>("/api/scripts", {
      method: "POST",
      body: JSON.stringify({ name, content, suite }),
    });
  }

  async deleteScript(id: string): Promise<CommandResult> {
    return this.request<CommandResult>(`/api/scripts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async runScript(id: string): Promise<ScriptRunResult> {
    return this.request<ScriptRunResult>(`/api/scripts/${encodeURIComponent(id)}/run`, {
      method: "POST",
    });
  }

  // ── Suites ──────────────────────────────────────────────

  async getSuites(): Promise<SuiteInfo[]> {
    return this.request<SuiteInfo[]>("/api/suites");
  }

  async installSuite(id: string): Promise<CommandResult> {
    return this.request<CommandResult>(`/api/suites/${encodeURIComponent(id)}/install`, {
      method: "POST",
    });
  }

  async uninstallSuite(id: string): Promise<CommandResult> {
    return this.request<CommandResult>(`/api/suites/${encodeURIComponent(id)}/uninstall`, {
      method: "POST",
    });
  }

  async activateSuite(id: string): Promise<CommandResult> {
    return this.request<CommandResult>(`/api/suites/${encodeURIComponent(id)}/activate`, {
      method: "POST",
    });
  }

  // ── Fleet ───────────────────────────────────────────────

  async getEnrollment(): Promise<MeshNetEnrollment> {
    return this.request<MeshNetEnrollment>("/api/fleet/enrollment", {
      schema: MeshNetEnrollmentSchema as z.ZodType<MeshNetEnrollment>,
      allowSchemaFallback: true,
    });
  }

  async getPeers(): Promise<NetworkPeer[]> {
    return this.request<NetworkPeer[]>("/api/fleet/peers", {
      schema: NetworkPeerListSchema as z.ZodType<NetworkPeer[]>,
      allowSchemaFallback: true,
    });
  }

  // ── Consolidated ────────────────────────────────────────

  /**
   * Fetch all status data in a single request (agent v0.3.19+).
   * Falls back to null on older agents that don't have this endpoint.
   *
   * Uses /api/version capability negotiation when available so we
   * skip the request entirely (and don't burn a 404 round-trip)
   * against an agent that hasn't advertised status.full.
   */
  async getFullStatus(): Promise<FullStatusResponse | null> {
    const info = await this.getVersion();
    if (info && !agentSupports(info, "status.full")) {
      return null;
    }
    try {
      return await this.request<FullStatusResponse>("/api/status/full", {
        schema: FullStatusResponseSchema as z.ZodType<FullStatusResponse>,
        allowSchemaFallback: true,
      });
    } catch {
      return null; // Agent version < 0.3.19, or transient failure
    }
  }

  // ── Video ───────────────────────────────────────────────

  async getVideoStatus(): Promise<VideoStatus | null> {
    try {
      return await this.request<VideoStatus>("/api/video", {
        schema: VideoStatusSchema as z.ZodType<VideoStatus>,
        allowSchemaFallback: true,
      });
    } catch {
      return null; // Agent may not support this endpoint
    }
  }

  // ── Pairing ──────────────────────────────────────────────

  async getPairingInfo(): Promise<PairingInfo> {
    return this.request<PairingInfo>("/api/pairing/info", {
      schema: PairingInfoSchema as z.ZodType<PairingInfo>,
    });
  }

  async claimLocally(userId: string): Promise<ClaimResponse> {
    return this.request<ClaimResponse>("/api/pairing/claim", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
      schema: ClaimResponseSchema as z.ZodType<ClaimResponse>,
    });
  }

  async unpairAgent(): Promise<CommandResult> {
    return this.request<CommandResult>("/api/pairing/unpair", {
      method: "POST",
      schema: CommandResultSchema as z.ZodType<CommandResult>,
    });
  }

  // ── MAVLink signing ───────────────────────────────────────────
  //
  // The agent holds no key material. These endpoints cover capability
  // detection, one-shot FC enrollment (key_hex zeroized after), FC
  // clearing, SIGNING_REQUIRE toggle, and passive signed-frame counters.

  async getSigningCapability(): Promise<SigningCapability> {
    return this.request<SigningCapability>("/api/mavlink/signing/capability");
  }

  async enrollSigningKey(keyHex: string, linkId: number): Promise<SigningEnrollResult> {
    return this.request<SigningEnrollResult>("/api/mavlink/signing/enroll-fc", {
      method: "POST",
      body: JSON.stringify({ key_hex: keyHex, link_id: linkId }),
    });
  }

  async disableSigningOnFc(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/api/mavlink/signing/disable-on-fc", {
      method: "POST",
    });
  }

  async getSigningRequire(): Promise<{ require: boolean | null }> {
    return this.request<{ require: boolean | null }>("/api/mavlink/signing/require");
  }

  async setSigningRequire(require: boolean): Promise<{ success: boolean; require: boolean }> {
    return this.request<{ success: boolean; require: boolean }>("/api/mavlink/signing/require", {
      method: "PUT",
      body: JSON.stringify({ require }),
    });
  }

  async getSigningCounters(): Promise<SigningCounters> {
    return this.request<SigningCounters>("/api/mavlink/signing/counters");
  }
}

// ──────────────────────────────────────────────────────────────
// Signing response shapes
// ──────────────────────────────────────────────────────────────

export interface SigningCapability {
  supported: boolean;
  reason:
    | "ok"
    | "fc_not_connected"
    | "firmware_not_supported"
    | "firmware_too_old"
    | "firmware_px4_no_persistent_store"
    | "msp_protocol"
    | string;
  firmware_name: string | null;
  firmware_version: string | null;
  signing_params_present: boolean;
}

export interface SigningEnrollResult {
  success: boolean;
  key_id: string;
  enrolled_at: string;
}

export interface SigningCounters {
  tx_signed_count: number;
  rx_signed_count: number;
  last_signed_rx_at: number | null;
}
