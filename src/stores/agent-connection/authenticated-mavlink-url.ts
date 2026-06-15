/**
 * @module agent-connection/authenticated-mavlink-url
 * @description Pure resolution of a LAN-paired agent's ticket-gated
 * authenticated MAVLink WebSocket endpoint for the connection poll. Kept free
 * of store/React deps so the logic is unit-testable in isolation (importing the
 * store slice it used to live in evaluates Zustand composition that cannot run
 * standalone).
 * @license GPL-3.0-only
 */

import type { FullStatusResponse } from "@/lib/agent/types";
import { resolveMavlinkUrl } from "@/components/command/bridges/status-mapper/urls";

/** The fixed path a ground-station agent serves its ticket-gated MAVLink
 * WebSocket bridge at, on its :8080 front. A stable contract, so the GCS can
 * derive the dialable URL for a LAN-paired ground station without the agent
 * having to advertise it on the consolidated status. */
const GS_GATED_MAVLINK_WS_PATH = "/api/v1/ground-station/ws/mavlink";
const AGENT_FRONT_PORT = 8080;

/**
 * Resolve the agent's ticket-gated authenticated MAVLink WebSocket endpoint
 * from the LAN-direct `/api/status/full` into a single dialable absolute URL.
 *
 * Prefers an endpoint the agent advertises explicitly on its `mavlink` block
 * (path-or-absolute → absolute, `.local` → IPv4 via the agent host). When that
 * is absent, a ground-station node still serves the gated endpoint at a fixed
 * path on its :8080 front, so the URL is derived from the proven-reachable
 * host. Returns null for a drone/compute node with no advertised endpoint (it
 * has no gated endpoint) so the bridge keeps its legacy raw-proxy fallback. The
 * bridge upgrades ws→wss for an https origin, so a bare `ws://` here is correct.
 */
export function resolveLocalAuthenticatedMavlinkWsUrl(
  mavlink: FullStatusResponse["mavlink"],
  profile: string | null | undefined,
  agentUrl: string | null,
): string | null {
  // The host the LAN poll is succeeding against is the proven-reachable
  // target; feed it as both the LAN host and the IPv4 hint so the shared
  // resolver builds an absolute URL and dodges a slow `.local` AAAA lookup.
  let lanHost: string | null = null;
  if (agentUrl) {
    try {
      lanHost = new URL(agentUrl).hostname;
    } catch {
      lanHost = null;
    }
  }
  const lastIp =
    lanHost && /^\d+\.\d+\.\d+\.\d+$/.test(lanHost) ? lanHost : undefined;

  // Prefer the endpoint the agent advertises explicitly on its mavlink block.
  const raw = mavlink
    ? (typeof mavlink.authenticated_websocket_url === "string" &&
      mavlink.authenticated_websocket_url.length > 0
        ? mavlink.authenticated_websocket_url
        : undefined) ??
      (typeof mavlink.authenticated_websocket_path === "string" &&
      mavlink.authenticated_websocket_path.length > 0
        ? mavlink.authenticated_websocket_path
        : undefined)
    : undefined;
  if (raw) {
    const { authenticatedUrl } = resolveMavlinkUrl(
      { mavlinkWsAuthenticated: raw, lastIp },
      lanHost,
    );
    if (authenticatedUrl) return authenticatedUrl;
  }

  // Fallback: derive the ground-station gated endpoint from the host.
  const isGroundStation =
    profile === "ground-station" || profile === "ground_station";
  if (isGroundStation && lanHost) {
    return `ws://${lanHost}:${AGENT_FRONT_PORT}${GS_GATED_MAVLINK_WS_PATH}`;
  }
  return null;
}
