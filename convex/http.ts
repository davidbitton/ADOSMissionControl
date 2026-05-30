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
  validRxPacketsPerS: number | null;
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

// Translate the agent's snake_case radio block into the camelCase shape
// the schema expects. Returns undefined when the block is missing or
// missing required fields so we keep the heartbeat additive.
function radioField(
  body: Record<string, unknown>,
  key: string,
): RadioPayload | undefined {
  const raw = body[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;

  const state = stringField(row, "state");
  const topology = stringField(row, "topology");
  const bandwidthMhz = numberField(row, "bandwidth_mhz");
  const txPowerMaxDbm = numberField(row, "tx_power_max_dbm");
  const fecRecovered = numberField(row, "fec_recovered");
  const fecLost = numberField(row, "fec_lost");
  const packetsLost = numberField(row, "packets_lost");

  if (
    state === undefined ||
    topology === undefined ||
    bandwidthMhz === undefined ||
    txPowerMaxDbm === undefined ||
    fecRecovered === undefined ||
    fecLost === undefined ||
    packetsLost === undefined
  ) {
    return undefined;
  }

  const iface = nullableString(row.iface);
  const driver = nullableString(row.driver);
  const channel = nullableNumber(row.channel);
  const freqMhz = nullableNumber(row.freq_mhz);
  const txPowerDbm = nullableNumber(row.tx_power_dbm);
  const rssiDbm = nullableNumber(row.rssi_dbm);
  const bitrateKbps = nullableNumber(row.bitrate_kbps);
  // Channel rendezvous + hop surface. Both sides boot on the fixed home
  // channel and only hop once the link is up. Optional on the wire;
  // older agents omit them and we forward null so the row stays additive.
  const homeChannel = nullableNumber(row.home_channel);
  const band = nullableString(row.band);
  const regDomain = nullableString(row.reg_domain);
  const monitorActive = nullableBoolean(row.monitor_active);
  const txActive = nullableBoolean(row.tx_active);
  const peerLink = nullableString(row.peer_link);
  const hopState = nullableString(row.hop_state);
  const snrDb = nullableNumber(row.snr_db);
  const noiseDbm = nullableNumber(row.noise_dbm);
  const lossPercent = nullableNumber(row.loss_percent);
  const mcsIndex = nullableNumber(row.mcs_index);
  const rxSilentSeconds = nullableNumber(row.rx_silent_seconds);
  // Per-stream video-tx liveness (rule 37). Optional on the wire; older
  // agents omit them and we forward null so the row stays additive.
  const txVideoStalled = nullableBoolean(row.tx_video_stalled);
  const txVideoStallKills = nullableNumber(row.tx_video_stall_kills);
  const txVideoRecvqBytes = nullableNumber(row.tx_video_recvq_bytes);
  // Ground-side receive acquisition surface. Optional on the wire;
  // transmit-side and older agents omit them and we forward null so the
  // row stays additive.
  const acquireState = nullableString(row.acquire_state);
  const channelLocked = nullableBoolean(row.channel_locked);
  const reacquireKills = nullableNumber(row.reacquire_kills);
  const validRxPacketsPerS = nullableNumber(row.valid_rx_packets_per_s);

  return {
    state,
    iface: iface === undefined ? null : iface,
    driver: driver === undefined ? null : driver,
    channel: channel === undefined ? null : channel,
    freqMhz: freqMhz === undefined ? null : freqMhz,
    bandwidthMhz,
    txPowerDbm: txPowerDbm === undefined ? null : txPowerDbm,
    txPowerMaxDbm,
    topology,
    rssiDbm: rssiDbm === undefined ? null : rssiDbm,
    bitrateKbps: bitrateKbps === undefined ? null : bitrateKbps,
    fecRecovered,
    fecLost,
    packetsLost,
    homeChannel: homeChannel === undefined ? null : homeChannel,
    band: band === undefined ? null : band,
    regDomain: regDomain === undefined ? null : regDomain,
    monitorActive: monitorActive === undefined ? null : monitorActive,
    txActive: txActive === undefined ? null : txActive,
    peerLink: peerLink === undefined ? null : peerLink,
    hopState: hopState === undefined ? null : hopState,
    snrDb: snrDb === undefined ? null : snrDb,
    noiseDbm: noiseDbm === undefined ? null : noiseDbm,
    lossPercent: lossPercent === undefined ? null : lossPercent,
    mcsIndex: mcsIndex === undefined ? null : mcsIndex,
    rxSilentSeconds: rxSilentSeconds === undefined ? null : rxSilentSeconds,
    txVideoStalled: txVideoStalled === undefined ? null : txVideoStalled,
    txVideoStallKills:
      txVideoStallKills === undefined ? null : txVideoStallKills,
    txVideoRecvqBytes:
      txVideoRecvqBytes === undefined ? null : txVideoRecvqBytes,
    acquireState: acquireState === undefined ? null : acquireState,
    channelLocked: channelLocked === undefined ? null : channelLocked,
    reacquireKills: reacquireKills === undefined ? null : reacquireKills,
    validRxPacketsPerS:
      validRxPacketsPerS === undefined ? null : validRxPacketsPerS,
  };
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

export default http;
