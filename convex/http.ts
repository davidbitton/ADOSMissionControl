import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();
auth.addHttpRoutes(http);

const jsonHeaders = { "Content-Type": "application/json" };

async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "JSON object required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    return body as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function numberField(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  return typeof value === "number" ? value : undefined;
}

function booleanField(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === "boolean" ? value : undefined;
}

function numberArrayField(
  body: Record<string, unknown>,
  key: string,
): number[] | undefined {
  const value = body[key];
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "number") ? value : undefined;
}

function stringArrayField(
  body: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = body[key];
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "string")
    ? (value as string[])
    : undefined;
}

interface ServiceStatusPayload {
  name: string;
  status: string;
  cpuPercent?: number;
  memoryMb?: number;
  uptimeSeconds?: number;
  pid?: number;
  category?: string;
}

function serviceListField(
  body: Record<string, unknown>,
  key: string,
): ServiceStatusPayload[] | undefined {
  const value = body[key];
  if (!Array.isArray(value)) return undefined;
  const services: ServiceStatusPayload[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = stringField(row, "name");
    const status = stringField(row, "status");
    if (!name || !status) continue;
    services.push({
      name,
      status,
      cpuPercent: numberField(row, "cpuPercent"),
      memoryMb: numberField(row, "memoryMb"),
      uptimeSeconds: numberField(row, "uptimeSeconds"),
      pid: numberField(row, "pid"),
      category: stringField(row, "category"),
    });
  }
  return services;
}

function commandStatusField(value: string | undefined): "completed" | "failed" {
  return value === "failed" ? "failed" : "completed";
}

interface RadioPayload {
  state: string;
  iface: string | null;
  driver: string | null;
  channel: number | null;
  freqMhz: number | null;
  bandwidthMhz: number;
  txPowerDbm: number | null;
  txPowerMaxDbm: number;
  topology: string;
  rssiDbm: number | null;
  bitrateKbps: number | null;
  fecRecovered: number;
  fecLost: number;
  packetsLost: number;
  homeChannel: number | null;
  band: string | null;
  regDomain: string | null;
  regPosture: string | null;
  pinnedRegion: string | null;
  regVerified: boolean | null;
  monitorActive: boolean | null;
  txActive: boolean | null;
  peerLink: string | null;
  hopState: string | null;
  snrDb: number | null;
  noiseDbm: number | null;
  lossPercent: number | null;
  mcsIndex: number | null;
  rxSilentSeconds: number | null;
  txVideoStalled: boolean | null;
  txVideoStallKills: number | null;
  txVideoRecvqBytes: number | null;
  acquireState: string | null;
  channelLocked: boolean | null;
  reacquireKills: number | null;
  rxZombieKills: number | null;
  validRxPacketsPerS: number | null;
  adapterChipset?: string | null;
  adapterInjectionOk?: boolean | null;
  adapterUsbDegraded?: boolean | null;
  adapterUsbSpeedMbps?: number | null;
  phyMuted?: boolean | null;
  txZombieKills?: number | null;
  txBytesPerS?: number | null;
  restartCount?: number | null;
  paired?: boolean;
  pairedWithDeviceId?: string | null;
  pairedAt?: string | null;
  publicKeyFingerprint?: string | null;
  autoPairEnabled?: boolean | null;
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number") return value;
  return undefined;
}

function nullableBoolean(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  return undefined;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

// Translate the agent's snake_case radio block into the camelCase shape the
// validator and schema expect. Every key is converted generically, so any
// current or future radio field reaches pushStatus already camelCased with no
// per-field plumbing to maintain here — a field can never slip through as
// snake_case and get rejected by the strict validator. Adding a new field then
// only needs the validator + schema (this stays untouched). Returns undefined
// when the block is absent so the heartbeat stays additive. The RadioPayload
// interface above documents the known fields; the cast bridges the generic
// object onto it for the typed status payload.
function radioField(
  body: Record<string, unknown>,
  key: string,
): RadioPayload | undefined {
  const raw = body[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const remapped: Record<string, unknown> = {};
  for (const [k, value] of Object.entries(raw as Record<string, unknown>)) {
    const camelKey = k.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
    remapped[camelKey] = value;
  }
  return remapped as unknown as RadioPayload;
}

function commandResultField(
  value: unknown,
): { success: boolean; message: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const success = booleanField(row, "success");
  const message = stringField(row, "message");
  if (success === undefined || !message) return undefined;
  return { success, message };
}

// ── ADOS Pairing: agent registers its pairing code ──────────

http.route({
  path: "/pairing/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const deviceId = stringField(body, "deviceId");
    const pairingCode = stringField(body, "pairingCode");

    if (!deviceId || !pairingCode) {
      return new Response(
        JSON.stringify({ error: "deviceId and pairingCode required" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const result = await ctx.runMutation(api.cmdPairing.registerAgent, {
      deviceId,
      pairingCode,
      apiKey: stringField(body, "apiKey"),
      name: stringField(body, "name"),
      version: stringField(body, "version"),
      board: stringField(body, "board"),
      tier: numberField(body, "tier"),
      os: stringField(body, "os"),
      mdnsHost: stringField(body, "mdnsHost"),
      localIp: stringField(body, "localIp"),
      pairingCodeExpiresAt: numberField(body, "pairingCodeExpiresAt"),
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: jsonHeaders,
    });
  }),
});

// ── ADOS Pairing: agent polls for claim status ──────────────

http.route({
  path: "/pairing/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId");
    if (!deviceId) {
      return new Response(
        JSON.stringify({ error: "deviceId required" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const status = await ctx.runQuery(api.cmdPairing.getPairingStatus, {
      deviceId,
    });
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: jsonHeaders,
    });
  }),
});

// ── ADOS Heartbeat: agent sends periodic status ─────────────

http.route({
  path: "/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const deviceId = stringField(body, "deviceId");
    const apiKey = stringField(body, "apiKey");
    if (!deviceId || !apiKey) {
      return new Response(
        JSON.stringify({ error: "deviceId and apiKey required" }),
        { status: 400, headers: jsonHeaders }
      );
    }
    const result = await ctx.runMutation(api.cmdDrones.updateHeartbeat, {
      deviceId,
      apiKey,
      lastIp: stringField(body, "lastIp"),
      mdnsHost: stringField(body, "mdnsHost"),
      fcConnected: booleanField(body, "fcConnected"),
      agentVersion: stringField(body, "agentVersion"),
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: jsonHeaders,
    });
  }),
});

// ── Cloud Relay: agent pushes full status ──────────────────

http.route({
  path: "/agent/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const deviceId = stringField(body, "deviceId");
    const version = stringField(body, "version");
    const uptimeSeconds = numberField(body, "uptimeSeconds");
    const apiKey = request.headers.get("X-ADOS-Key") ?? undefined;

    if (!deviceId || !apiKey || !version || uptimeSeconds === undefined) {
      return new Response(
        JSON.stringify({ error: "deviceId, apiKey, version, and uptimeSeconds required" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Validate API key matches the paired drone
    const drone = await ctx.runQuery(internal.cmdDrones.getDroneByDeviceId, { deviceId });
    if (!drone || drone.apiKey !== apiKey) {
      return new Response(
        JSON.stringify({ error: "Invalid device or API key" }),
        { status: 401, headers: jsonHeaders }
      );
    }

    // Strip legacy auth fields and sanitize before passing to mutation.
    // Agent sends agentVersion (not in schema) and temperature: null
    // (v.float64() rejects null — must be absent or a number)
    const statusPayload = {
      deviceId,
      version,
      uptimeSeconds,
      boardName: stringField(body, "boardName"),
      boardTier: numberField(body, "boardTier"),
      boardSoc: stringField(body, "boardSoc"),
      boardArch: stringField(body, "boardArch"),
      // Probed-from-silicon hardware truth, forwarded verbatim. Each stays
      // undefined when the agent omits it so the row remains additive.
      boardSocProbed: stringField(body, "boardSocProbed"),
      boardCpuProbed: stringField(body, "boardCpuProbed"),
      hwEncoderProbed: stringField(body, "hwEncoderProbed"),
      // Kernel release + radio-module source + install-health summary.
      // Forwarded verbatim from the agent heartbeat; each stays
      // undefined when the agent omits it so the row remains additive.
      kernelRelease: stringField(body, "kernelRelease"),
      wfbModuleSource: stringField(body, "wfbModuleSource"),
      // Overall radio-stack health + the top-level mirror of the selected
      // WFB adapter verdict. The agent carries these at the heartbeat root
      // (also nested inside the radio block); forward them so a remotely
      // connected operator sees the stranded-radio warning and the radio
      // module badge. radioStackState is a plain optional string; the
      // adapter mirrors preserve the agent's explicit null ("no
      // injection-capable adapter found") so null stays distinct from
      // absent. Each stays undefined when the agent omits it so the row
      // remains additive.
      radioStackState: stringField(body, "radioStackState"),
      // Stable-MAC pin verdicts (a free-form object). Forwarded verbatim when
      // the agent sends an object; absent otherwise so the row stays additive.
      macStability:
        typeof body.macStability === "object" && body.macStability !== null
          ? body.macStability
          : undefined,
      // Management-link health (a free-form object). Forwarded verbatim when the
      // agent sends an object; absent otherwise so the row stays additive.
      managementLink:
        typeof body.managementLink === "object" &&
        body.managementLink !== null
          ? body.managementLink
          : undefined,
      // Management-link reach-back mode + failover interface/reason. Each stays
      // undefined when the agent omits it so the row stays additive.
      mgmtLinkMode: stringField(body, "mgmtLinkMode"),
      mgmtFailoverIface: nullableString(body.mgmtFailoverIface),
      mgmtFailoverReason: nullableString(body.mgmtFailoverReason),
      // USB-rehome self-heal state + attempt count + last outcome. Each stays
      // undefined when the agent omits it so the row stays additive.
      usbRehomeState: stringField(body, "usbRehomeState"),
      usbRehomeAttempts: nullableNumber(body.usbRehomeAttempts),
      usbRehomeLastResult: nullableString(body.usbRehomeLastResult),
      wfbAdapterChipset: nullableString(body.wfbAdapterChipset),
      wfbAdapterInjectionOk: nullableBoolean(body.wfbAdapterInjectionOk),
      wfbAdapterUsbDegraded: nullableBoolean(body.wfbAdapterUsbDegraded),
      wfbAdapterUsbSpeedMbps: nullableNumber(body.wfbAdapterUsbSpeedMbps),
      installStatus: stringField(body, "installStatus"),
      installVersion: stringField(body, "installVersion"),
      failedSteps: stringArrayField(body, "failedSteps"),
      cpuPercent: numberField(body, "cpuPercent"),
      memoryPercent: numberField(body, "memoryPercent"),
      diskPercent: numberField(body, "diskPercent"),
      temperature: numberField(body, "temperature"),
      fcConnected: booleanField(body, "fcConnected"),
      fcPort: stringField(body, "fcPort"),
      fcBaud: numberField(body, "fcBaud"),
      memoryUsedMb: numberField(body, "memoryUsedMb"),
      memoryTotalMb: numberField(body, "memoryTotalMb"),
      memoryAvailableMb: numberField(body, "memoryAvailableMb"),
      memoryCacheMb: numberField(body, "memoryCacheMb"),
      swapTotalMb: numberField(body, "swapTotalMb"),
      swapUsedMb: numberField(body, "swapUsedMb"),
      swapPercent: numberField(body, "swapPercent"),
      diskUsedGb: numberField(body, "diskUsedGb"),
      diskTotalGb: numberField(body, "diskTotalGb"),
      cpuCores: numberField(body, "cpuCores"),
      boardRamMb: numberField(body, "boardRamMb"),
      processCpuPercent: numberField(body, "processCpuPercent"),
      processMemoryMb: numberField(body, "processMemoryMb"),
      cpuHistory: numberArrayField(body, "cpuHistory"),
      memoryHistory: numberArrayField(body, "memoryHistory"),
      services: serviceListField(body, "services"),
      lastIp: stringField(body, "lastIp"),
      mdnsHost: stringField(body, "mdnsHost"),
      setupUrl: stringField(body, "setupUrl"),
      apiUrl: stringField(body, "apiUrl"),
      missionControlUrl: stringField(body, "missionControlUrl"),
      videoState: stringField(body, "videoState"),
      videoWhepPort: numberField(body, "videoWhepPort"),
      videoWhepUrl: stringField(body, "videoWhepUrl"),
      videoRestartAttempts: numberField(body, "videoRestartAttempts"),
      mavlinkWsPort: numberField(body, "mavlinkWsPort"),
      mavlinkWsUrl: stringField(body, "mavlinkWsUrl"),
      mavlinkWsUrlPrev: stringField(body, "mavlinkWsUrlPrev"),
      wfbFailoverState: stringField(body, "wfbFailoverState"),
      runtimeMode: stringField(body, "runtimeMode"),
      remoteAccess: body.remoteAccess,
      peripherals: body.peripherals,
      scripts: body.scripts,
      enrollment: body.enrollment,
      peers: body.peers,
      telemetry: body.telemetry,
      logs: body.logs,
      radio: radioField(body, "radio"),
      // FC CAN bus configuration. Validate the inner shape here so a
      // malformed agent payload (e.g., a string masquerading as a
      // port number) doesn't get rejected by the strict pushStatus
      // validator and fail the entire heartbeat. The field stays
      // undefined unless every entry is a complete numeric record.
      canBuses: (() => {
        const raw = body.canBuses;
        if (!Array.isArray(raw)) return undefined;
        const entries: Array<{ port: number; driver: number; bitrate: number; protocol: number }> = [];
        for (const entry of raw) {
          if (!entry || typeof entry !== "object") continue;
          const e = entry as Record<string, unknown>;
          if (
            typeof e.port !== "number"
            || typeof e.driver !== "number"
            || typeof e.bitrate !== "number"
            || typeof e.protocol !== "number"
          ) continue;
          entries.push({
            port: e.port,
            driver: e.driver,
            bitrate: e.bitrate,
            protocol: e.protocol,
          });
        }
        return entries;
      })(),
    };
    const result = await ctx.runMutation(internal.cmdDroneStatus.pushStatus, statusPayload);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: jsonHeaders,
    });
  }),
});

// ── Cloud Relay: agent polls for pending commands ──────────

http.route({
  path: "/agent/commands",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId");
    const apiKey = request.headers.get("X-ADOS-Key") ?? undefined;

    if (!deviceId || !apiKey) {
      return new Response(
        JSON.stringify({ error: "deviceId and apiKey required" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Validate API key
    const drone = await ctx.runQuery(internal.cmdDrones.getDroneByDeviceId, { deviceId });
    if (!drone || drone.apiKey !== apiKey) {
      return new Response(
        JSON.stringify({ error: "Invalid device or API key" }),
        { status: 401, headers: jsonHeaders }
      );
    }

    const commands = await ctx.runQuery(internal.cmdDroneCommands.getPendingCommands, { deviceId });
    return new Response(JSON.stringify({ commands }), {
      status: 200,
      headers: jsonHeaders,
    });
  }),
});

// ── Cloud Relay: agent acknowledges command completion ─────

http.route({
  path: "/agent/commands/ack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const commandId = stringField(body, "commandId");
    const deviceId = stringField(body, "deviceId");
    const status = stringField(body, "status");
    const result = commandResultField(body.result);
    const { data } = body;
    const apiKey = request.headers.get("X-ADOS-Key") ?? undefined;

    if (!commandId || !deviceId || !apiKey) {
      return new Response(
        JSON.stringify({ error: "commandId, deviceId, and apiKey required" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Validate API key
    const drone = await ctx.runQuery(internal.cmdDrones.getDroneByDeviceId, { deviceId });
    if (!drone || drone.apiKey !== apiKey) {
      return new Response(
        JSON.stringify({ error: "Invalid device or API key" }),
        { status: 401, headers: jsonHeaders }
      );
    }

    const ackResult = await ctx.runMutation(internal.cmdDroneCommands.ackCommand, {
      commandId: commandId as Id<"cmd_droneCommands">,
      deviceId,
      status: commandStatusField(status),
      result,
      data,
    });
    return new Response(JSON.stringify(ackResult), {
      status: 200,
      headers: jsonHeaders,
    });
  }),
});

// ── Explicit log-window export: agent uploads one chosen window ──
// One authenticated binary POST. Window metadata travels as headers;
// the body is the raw exported-window blob. Auth mirrors /agent/status
// (device API key in X-ADOS-Key, validated against the paired drone).
// The server recomputes the content hash from the stored bytes inside
// ingestWindow — the agent never sends a hash claim used for storage.

http.route({
  path: "/agent/logd/window",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = request.headers.get("X-ADOS-Key") ?? undefined;
    const h = request.headers;
    const deviceId = h.get("X-ADOS-Device") ?? undefined;
    const sessionId = h.get("X-ADOS-Session") ?? "";
    const kind = h.get("X-ADOS-Kind") ?? undefined;
    const format = h.get("X-ADOS-Format") ?? undefined;
    const windowStartUs = Number(h.get("X-ADOS-Window-Start-Us"));
    const windowEndUs = Number(h.get("X-ADOS-Window-End-Us"));
    const rowCount = Number(h.get("X-ADOS-Row-Count"));

    if (
      !deviceId
      || !apiKey
      || !kind
      || !format
      || !Number.isFinite(windowStartUs)
      || !Number.isFinite(windowEndUs)
      || !Number.isFinite(rowCount)
    ) {
      return new Response(
        JSON.stringify({ error: "missing window metadata" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Validate API key matches the paired drone
    const drone = await ctx.runQuery(internal.cmdDrones.getDroneByDeviceId, { deviceId });
    if (!drone || drone.apiKey !== apiKey) {
      return new Response(
        JSON.stringify({ error: "Invalid device or API key" }),
        { status: 401, headers: jsonHeaders }
      );
    }

    const blob = await request.blob();
    const MAX_WINDOW_BYTES = 32 * 1024 * 1024;
    if (blob.size === 0 || blob.size > MAX_WINDOW_BYTES) {
      return new Response(
        JSON.stringify({ error: "window too large or empty" }),
        { status: 413, headers: jsonHeaders }
      );
    }

    const storageId = await ctx.storage.store(blob);
    try {
      const result = await ctx.runAction(internal.cmdLogdWindows.ingestWindow, {
        deviceId,
        sessionId,
        kind,
        windowStartUs,
        windowEndUs,
        format,
        rowCount,
        storageId,
      });
      return new Response(
        JSON.stringify({
          status: result.status,
          windowId: result.windowId,
          contentHash: result.contentHash,
        }),
        { status: 200, headers: jsonHeaders }
      );
    } catch (err) {
      // ingestWindow deletes the blob on every validation failure, so a
      // rejected upload never orphans storage. Surface a 400 with the
      // kernel message for the operator.
      const message = err instanceof Error ? err.message : "ingest failed";
      return new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: jsonHeaders }
      );
    }
  }),
});

export default http;
