/**
 * @module HostValidation
 * @description Shared SSRF guard for the LAN-pair proxy. Validates
 * that a host string the operator typed (or a URL the browser
 * forwarded) points at a private / mDNS / loopback address before
 * Mission Control's Next.js server makes any plain-HTTP request on
 * the operator's behalf.
 *
 * Used by both the server-side `/api/lan-pair/*` route handlers and
 * the browser-side `local-pair-client.ts` so the GCS surfaces a
 * typed rejection before round-tripping the server, and so the
 * proxy can't be used as an open scanner if a request bypasses the
 * client check.
 *
 * Pure function: no Node, no DOM, no react. Importable from both
 * runtimes.
 *
 * @license GPL-3.0-only
 */

const PRIVATE_V4 = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^127\./,
  /^169\.254\./, // link-local
];

export type HostValidationResult =
  | { url: string; host: string; port: number; error?: never; message?: never }
  | { error: string; message: string; url?: never; host?: never; port?: never };

/**
 * Normalise a user-pasted host string and confirm it points at a
 * private address Mission Control is willing to proxy to.
 *
 * Accepts bare hostnames (`groundnode.local`, `192.168.1.50`), full
 * URLs (`http://192.168.1.50:8080`), and trailing slashes. Defaults
 * the port to 8080 when an http:// URL omits it (matches the agent's
 * default REST port). Rejects userinfo, non-http(s) schemes, and
 * public hostnames.
 */
export function normaliseAndCheckHost(input: string): HostValidationResult {
  let s = (input ?? "").trim();
  if (!s) {
    return { error: "host_required", message: "host is required" };
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { error: "bad_host", message: "Could not parse host as URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return {
      error: "bad_scheme",
      message: "Only http and https are supported",
    };
  }
  if (u.username || u.password) {
    return {
      error: "userinfo_not_allowed",
      message: "URL must not include user:password",
    };
  }
  if (!u.port && u.protocol === "http:") {
    u.port = "8080";
  }
  // Strip path / query / fragment — the proxy will compose its own
  // upstream path.
  u.pathname = "";
  u.search = "";
  u.hash = "";

  const host = u.hostname.toLowerCase();
  const isMdns = host.endsWith(".local");
  const isLoopback =
    host === "localhost" || host === "::1" || host === "127.0.0.1";
  const isPrivateV4 = PRIVATE_V4.some((re) => re.test(host));
  // Very narrow IPv6 check. fc00::/7 (ULA) and fe80::/10 (link-local)
  // are the only IPv6 ranges Mission Control accepts. Hostname check
  // is sufficient because URL.hostname strips zone ids and brackets.
  const isPrivateV6 =
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:");

  if (!isMdns && !isLoopback && !isPrivateV4 && !isPrivateV6) {
    return {
      error: "host_not_private",
      message:
        "Only RFC1918, mDNS .local, or loopback hosts are allowed",
    };
  }

  const normalized = u.toString().replace(/\/+$/, "");
  return {
    url: normalized,
    host,
    port: Number(u.port) || (u.protocol === "https:" ? 443 : 80),
  };
}
