/**
 * @module LocalPairClient
 * @description REST helpers for the local-first pair flow used by
 * the Add-a-Node card. Hits the agent's existing
 * ``/api/pairing/info`` and ``/api/pairing/claim`` endpoints
 * directly over LAN. No Convex round-trip.
 *
 * The agent treats the act of being on the same LAN as the auth
 * boundary for these two routes — claim only works while the agent
 * is unpaired, and the returned API key is what the GCS uses for
 * every subsequent call.
 * @license GPL-3.0-only
 */

import { getBrowserId } from "@/stores/browser-identity-store";

export interface ProbeResult {
  deviceId: string;
  name: string;
  version: string;
  board: string;
  paired: boolean;
  pairingCode?: string;
  ownerId?: string;
  pairedAt?: number;
  mdnsHost: string;
  profile: "drone" | "ground-station" | "compute" | "lite";
  role?: "direct" | "relay" | "receiver" | null;
  /** The normalised base URL the GCS should keep talking to. */
  hostname: string;
}

export interface ClaimResult {
  apiKey: string;
  deviceId: string;
  name: string;
  mdnsHost: string;
  hostname: string;
}

/** Strip trailing slashes and normalise a user-pasted host string.
 * Bare hostnames default to ``http://<host>:8080``. https URLs are
 * left untouched (TLS endpoints terminate on their own port).
 */
export function normaliseHost(input: string): string {
  let s = input.trim();
  if (!s) return s;
  // Bare hostname → assume http://<host>:8080.
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  // Append :8080 only for http URLs without an explicit port. Leave
  // https alone — TLS endpoints set their own port and 8080 would be
  // wrong 99% of the time.
  try {
    const u = new URL(s);
    if (!u.port && u.protocol === "http:") {
      u.port = "8080";
    }
    // Drop trailing slash from pathname.
    u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString().replace(/\/+$/, "");
  } catch {
    return s.replace(/\/+$/, "");
  }
}

const FETCH_TIMEOUT_MS = 8000;

/** Combine an optional caller signal with a local timeout signal. */
function combineSignals(
  caller?: AbortSignal,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!caller) return timeout;
  if ("any" in AbortSignal && typeof AbortSignal.any === "function") {
    return AbortSignal.any([caller, timeout]);
  }
  // Fallback for environments without AbortSignal.any.
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  caller.addEventListener("abort", onAbort);
  timeout.addEventListener("abort", onAbort);
  return ctrl.signal;
}

/** Hit ``/api/pairing/info`` and return the agent identity.
 * Times out after 8s so a non-responsive host doesn't hang the UI.
 */
export async function probeAgent(
  rawHost: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const host = normaliseHost(rawHost);
  if (!host) {
    throw new Error("Enter a hostname or URL to probe");
  }
  // Mixed-content guard: HTTPS pages can't fetch HTTP endpoints. The
  // browser will block silently otherwise; surface a clear message.
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    host.startsWith("http://")
  ) {
    throw new Error(
      "This Mission Control is served over HTTPS. Browsers block plain HTTP probes from HTTPS pages. Load Mission Control over http:// (or use a localhost build) to pair LAN agents.",
    );
  }
  const resp = await fetch(`${host}/api/pairing/info`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: combineSignals(signal),
  });
  if (!resp.ok) {
    throw new Error(`Probe failed: ${resp.status} ${resp.statusText}`);
  }
  const body = (await resp.json()) as Record<string, unknown>;
  const deviceId = String(body.device_id ?? "");
  if (!deviceId) {
    throw new Error("Probe response missing device_id");
  }
  const profile = (body.profile as string) || "drone";
  const role = (body.role as string | undefined) ?? null;
  return {
    deviceId,
    name: String(body.name ?? "ADOS Agent"),
    version: String(body.version ?? ""),
    board: String(body.board ?? "unknown"),
    paired: Boolean(body.paired),
    pairingCode: (body.pairing_code as string | undefined) ?? undefined,
    ownerId: (body.owner_id as string | undefined) ?? undefined,
    pairedAt: (body.paired_at as number | undefined) ?? undefined,
    mdnsHost: String(body.mdns_host ?? ""),
    profile: profile as ProbeResult["profile"],
    role: role as ProbeResult["role"],
    hostname: host,
  };
}

export class AgentAlreadyPairedError extends Error {
  constructor(message?: string) {
    super(message || "Agent is already paired. Unpair from the agent first.");
    this.name = "AgentAlreadyPairedError";
  }
}

/** POST ``/api/pairing/claim`` with the browser-local UUID as ``user_id``.
 * The browser UUID acts as the pair owner id — the agent treats it
 * as the credential for unpair on subsequent requests.
 */
export async function pairLocally(
  rawHost: string,
  signal?: AbortSignal,
): Promise<ClaimResult> {
  const host = normaliseHost(rawHost);
  const userId = getBrowserId();
  const resp = await fetch(`${host}/api/pairing/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
    signal: combineSignals(signal),
  });
  if (resp.status === 409) {
    throw new AgentAlreadyPairedError();
  }
  if (!resp.ok) {
    throw new Error(`Pair failed: ${resp.status} ${resp.statusText}`);
  }
  const body = (await resp.json()) as Record<string, unknown>;
  return {
    apiKey: String(body.api_key ?? ""),
    deviceId: String(body.device_id ?? ""),
    name: String(body.name ?? "ADOS Agent"),
    mdnsHost: String(body.mdns_host ?? ""),
    hostname: host,
  };
}

/** POST ``/api/pairing/unpair`` with the stored API key in the header. */
export async function unpairLocal(
  hostname: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<void> {
  const host = normaliseHost(hostname);
  const resp = await fetch(`${host}/api/pairing/unpair`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
    },
    signal,
  });
  if (!resp.ok && resp.status !== 409) {
    throw new Error(`Unpair failed: ${resp.status} ${resp.statusText}`);
  }
}
