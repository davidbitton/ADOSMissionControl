/**
 * @module command/bridges/status-mapper/urls
 * @description Resolves the video (WHEP) and MAVLink WebSocket URLs the
 * connection cascade should attempt next, from the heartbeat's video /
 * mavlink blocks plus a LAN-host fallback. Prefers an IPv4 host over a
 * `.local` name to dodge a slow AAAA lookup. Pure.
 * @license GPL-3.0-only
 */

/** Swap a `.local` host in `url` for `lastIp` when known. Resolving `.local`
 * in the browser tries AAAA/IPv6 first and hangs ~5s on a box with no usable
 * IPv6, blowing the browser-direct video + MAVLink-WS connect timeouts. The
 * IPv4 connects instantly. Hosts that are already an IP are left untouched. */
function preferIpv4Host(url: string, lastIp: string | undefined): string {
  if (!lastIp) return url;
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase().endsWith(".local")) {
      u.hostname = lastIp;
      return u.toString();
    }
  } catch {
    /* not a parseable URL; leave as-is */
  }
  return url;
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
    whepUrl = preferIpv4Host(videoWhepUrl, lastIp);
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
  /** The legacy raw MAVLink WebSocket proxy URL (unauthenticated, port
   * 8765 on shipped agents). Dialed when the agent does not advertise a
   * gated endpoint, or as the fallback when the gated dial fails. */
  url: string | null;
  /** The ticket-gated authenticated MAVLink WebSocket URL the agent
   * advertises on its :8080 front (``mavlinkWsAuthenticated`` on the
   * heartbeat). Null when the agent predates the gated endpoint. When
   * present the cascade should mint a ``gs.mavlink_ws`` ticket and dial
   * this in preference to ``url``. */
  authenticatedUrl: string | null;
}

/**
 * Resolve the authenticated MAVLink WebSocket URL the agent advertises.
 *
 * The agent publishes either a fully-qualified URL or a path (relative
 * to its :8080 front) in ``mavlinkWsAuthenticated``. A bare path is
 * resolved against the LAN host so the cascade has an absolute target;
 * an absolute URL is honored verbatim (after the ``.local`` → IPv4 swap).
 * Returns null when the field is absent or unusable.
 */
function resolveAuthenticatedMavlinkWsUrl(
  cloudStatus: Record<string, unknown>,
  lanHost: string | null,
  lastIp: string | undefined,
): string | null {
  // The agent advertises the gated endpoint either at the row top level or,
  // mirroring the legacy `mavlinkWs`, inside the `manualConnectionUrls`
  // block. Prefer the top-level value, then the nested sibling.
  const manual = cloudStatus.manualConnectionUrls;
  const nested =
    manual && typeof manual === "object"
      ? (manual as Record<string, unknown>).mavlinkWsAuthenticated
      : undefined;
  const raw =
    typeof cloudStatus.mavlinkWsAuthenticated === "string" &&
    cloudStatus.mavlinkWsAuthenticated.length > 0
      ? cloudStatus.mavlinkWsAuthenticated
      : nested;
  if (typeof raw !== "string" || raw.length === 0) return null;

  // Absolute ws:// / wss:// URL — honor it, swapping a `.local` host for
  // the known IPv4 to dodge the slow AAAA lookup.
  if (/^wss?:\/\//i.test(raw)) {
    return preferIpv4Host(raw, lastIp);
  }
  // A path (e.g. "/v1/ground-station/ws/mavlink"). Resolve against the
  // LAN host so the cascade has an absolute target. The front speaks
  // plain ws:// on the LAN; the bridge upgrades to wss:// when the GCS
  // origin is secure.
  const host = lastIp ?? lanHost;
  if (!host) return null;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `ws://${host}:8080${path}`;
}

/**
 * Resolve the MAVLink WebSocket URLs the connection store should
 * advertise. ``url`` is the legacy raw proxy (heartbeat-published URL,
 * then a port hint + lastIp, then the LAN-host default port).
 * ``authenticatedUrl`` is the ticket-gated endpoint the agent advertises
 * on ``mavlinkWsAuthenticated``; the cascade prefers it when present.
 */
export function resolveMavlinkUrl(
  cloudStatus: Record<string, unknown>,
  lanHost: string | null,
): MavlinkUrl {
  const mavlinkWsPort = cloudStatus.mavlinkWsPort as number | undefined;
  const mavlinkWsUrl = cloudStatus.mavlinkWsUrl as string | undefined;
  const lastIp = cloudStatus.lastIp as string | undefined;

  const authenticatedUrl = resolveAuthenticatedMavlinkWsUrl(
    cloudStatus,
    lanHost,
    lastIp,
  );

  let url: string | null = null;
  if (mavlinkWsUrl) {
    url = preferIpv4Host(mavlinkWsUrl, lastIp);
  } else if (lastIp && mavlinkWsPort && mavlinkWsPort > 0) {
    url = `ws://${lastIp}:${mavlinkWsPort}/`;
  } else if (lanHost) {
    // ados-mavlink defaults to port 8765 across all shipped agents.
    url = `ws://${lanHost}:8765/`;
  }

  return { url, authenticatedUrl };
}
