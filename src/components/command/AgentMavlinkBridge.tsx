"use client";

/**
 * @module AgentMavlinkBridge
 * @description Automatically establishes a MAVLink connection to the ADOS Drone
 * Agent when the agent reports an FC connected. Tries three paths in order:
 *
 *   1. Authenticated WebSocket — the agent's ticket-gated MAVLink endpoint,
 *      dialed with a one-shot ticket carried as a WebSocket subprotocol.
 *      Preferred when the agent advertises it and a pairing key is held.
 *   2. Legacy raw WebSocket (ws://agent:8765/) — unauthenticated proxy on
 *      agents that predate the gated endpoint.
 *   3. MQTT relay (via the cloud relay) — works from anywhere.
 *
 * Once connected via any path, calls DroneManager.addDrone() which activates
 * all GCS features (telemetry, config panels, mission planning, flight commands).
 *
 * Renders nothing — pure bridge component.
 * @license GPL-3.0-only
 */

import { useEffect, useRef } from "react";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { useDroneManager } from "@/stores/drone-manager";
import { useFleetStore } from "@/stores/fleet-store";
import type { Transport } from "@/lib/protocol/types/transport";
import {
  mintWsTicket,
  WS_TICKET_PROTOCOL,
} from "@/lib/api/ground-station/ws-ticket";

const WS_TIMEOUT_MS = 3000;

// Ports the MAVLink bridge will refuse to dial on a derived ws://
// URL even if the agent advertises one. 5760 is the ArduPilot SITL TCP
// listener; an `ws://localhost:5760/` attempt at boot has been observed
// in console logs with no user gesture, suggesting a stale advertised
// URL slipped past the agent-URL hostname check below. Block defensively
// so the symptom can never re-appear regardless of root cause. Triage
// this list further when the source is pinned (DevTools Network tab,
// "Initiator" column on the failed WS row, plus an IndexedDB scan of
// idb-keyval-store for any stored ws:// URL).
const FORBIDDEN_DERIVED_WS_PORTS = new Set(["5760"]);

/**
 * Force a ws:// gated URL to wss:// when the GCS page is served over
 * https, so the authenticated dial isn't blocked as mixed content. A
 * URL already on wss:// (or any non-ws scheme) is returned untouched.
 * Returns null on a malformed URL so the caller can skip the dial.
 */
function secureWsUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const pageSecure =
      typeof window !== "undefined" &&
      window.location.protocol === "https:";
    if (pageSecure && u.protocol === "ws:") {
      u.protocol = "wss:";
    }
    return u.toString();
  } catch {
    return null;
  }
}

export function AgentMavlinkBridge() {
  const mavlinkUrl = useAgentConnectionStore((s) => s.mavlinkUrl);
  const connected = useAgentConnectionStore((s) => s.connected);
  const nodeDeviceId = useAgentConnectionStore((s) => s.nodeDeviceId);
  const status = useAgentSystemStore((s) => s.status);
  const mavlinkWsUrlPrev = useAgentCapabilitiesStore(
    (s) => s.mavlinkWsUrlPrev,
  );
  // The agent's ticket-gated authenticated MAVLink endpoint, resolved from
  // the heartbeat / local-status path and merged into the capability store
  // alongside the other heartbeat extras. Null when the agent does not
  // advertise it, in which case the cascade falls back to the legacy raw
  // proxy.
  const mavlinkWsAuthenticated = useAgentCapabilitiesStore(
    (s) => s.mavlinkWsAuthenticated,
  );
  const fcConnected = status?.fc_connected ?? false;
  const connectingRef = useRef(false);
  const connectedDroneIdRef = useRef<string | null>(null);
  const prevFcConnectedRef = useRef(fcConnected);

  // Tear down the MAVLink session the moment the agent reports the FC
  // disconnected, rather than waiting for the transport "close" event (which
  // can lag or never fire on a relayed link). On a true->false transition
  // while this bridge owns a connected drone, remove it so the FC panels stop
  // rendering stale telemetry and queued writes stop going to a dead link.
  // removeDrone keeps a presence-bridge-owned fleet row in place, so the node
  // card reverts to "flight controller not connected" instead of vanishing.
  useEffect(() => {
    const prev = prevFcConnectedRef.current;
    prevFcConnectedRef.current = fcConnected;
    if (prev && !fcConnected && connectedDroneIdRef.current) {
      const droneId = connectedDroneIdRef.current;
      connectedDroneIdRef.current = null;
      useDroneManager.getState().removeDrone(droneId);
    }
  }, [fcConnected]);

  useEffect(() => {
    // Latest-value reads that must NOT re-trigger this effect: the agent URL
    // and the cloud-relay device id change atomically with the connection
    // inputs that ARE dependencies, so read them at execution time rather than
    // as closure deps (which would re-fire the dial on every change).
    const agentUrl = useAgentConnectionStore.getState().agentUrl;
    const cloudDeviceId = useAgentConnectionStore.getState().cloudDeviceId;
    const apiKey = useAgentConnectionStore.getState().apiKey;
    // Need at least: agent connected + FC connected + at least one dialable
    // path (the gated authenticated endpoint, the legacy raw WS, or the cloud
    // MQTT relay).
    if (!connected || !fcConnected || connectingRef.current) return;
    if (!mavlinkWsAuthenticated && !mavlinkUrl && !cloudDeviceId) return;

    // Whether the legacy raw ws:// URL is safe to dial. The guards below
    // disqualify a stale / forbidden / mixed-content legacy URL. When the
    // agent advertises an authenticated endpoint a bad legacy URL must not
    // abort the whole dial (the authenticated path is the one we want on a
    // secure origin), so the guard disables only the legacy step. With no
    // authenticated endpoint the guards abort exactly as before.
    let legacyUrlUsable = !!mavlinkUrl;
    const disqualifyLegacy = (): boolean => {
      legacyUrlUsable = false;
      // No authenticated path to fall through to, and no cloud relay → the
      // legacy URL was the only option, so abort (preserves prior behavior).
      return !mavlinkWsAuthenticated && !cloudDeviceId;
    };

    // Drop the MAVLink dial if the advertised ws:// URL doesn't share
    // a hostname with the active agent URL, or if it points at a port
    // we've blacklisted (SITL TCP, etc). Either case means the URL
    // was rotated stale or fingerprinted to the wrong target, and
    // attempting it spams console errors with no payoff.
    if (mavlinkUrl) {
      try {
        const wsUrl = new URL(mavlinkUrl);
        if (FORBIDDEN_DERIVED_WS_PORTS.has(wsUrl.port)) {
          console.debug(
            "[AgentMavlinkBridge] dropping mavlinkUrl: forbidden port",
            wsUrl.port,
          );
          if (disqualifyLegacy()) return;
        }
        // On an HTTPS-origin GCS the browser blocks an insecure ws:// upgrade
        // as mixed content; the dial fails silently and the session falls
        // through to MQTT with no visible reason. Skip the direct ws:// dial
        // with an explicit reason when the page is secure. The authenticated
        // wss:// agent endpoint is the preferred path on a secure origin and
        // should be dialed once the agent advertises a ticket-gated URL.
        else if (
          typeof window !== "undefined" &&
          window.location.protocol === "https:" &&
          wsUrl.protocol === "ws:"
        ) {
          console.debug(
            "[AgentMavlinkBridge] skipping mavlinkUrl: ws:// blocked as mixed content on an https origin; prefer the authenticated wss:// endpoint",
            { mavlinkUrl },
          );
          if (disqualifyLegacy()) return;
        } else if (agentUrl) {
          const agentHost = new URL(agentUrl).hostname;
          if (wsUrl.hostname !== agentHost) {
            console.debug(
              "[AgentMavlinkBridge] dropping mavlinkUrl: hostname mismatch",
              { mavlinkUrl, agentUrl },
            );
            if (disqualifyLegacy()) return;
          }
        }
      } catch {
        // Malformed URL — skip the legacy dial rather than trip the inner
        // connect. Abort only when there's no authenticated / relay path.
        if (disqualifyLegacy()) return;
      }
    }

    // Skip the MQTT MAVLink relay path on localhost dev mode
    // when no direct LAN WebSocket is available. The cloud MQTT MAVLink relay
    // requires production cloud infrastructure that doesn't exist for the
    // bench user, and the attempt always fails after 10s with the
    // "No heartbeat received within 10 seconds" error spamming the console.
    // Telemetry is already covered by MqttBridge.tsx in this mode, so the
    // missing MAVLinkAdapter just disables binary command/control (which is
    // fine for monitoring-only sessions).
    const isLocalDev =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");
    if (isLocalDev && !mavlinkWsAuthenticated && !legacyUrlUsable) {
      return;
    }

    // Don't reconnect if already connected to a drone from this bridge
    if (connectedDroneIdRef.current) {
      const existing = useDroneManager.getState().drones.get(connectedDroneIdRef.current);
      if (existing) return;
      connectedDroneIdRef.current = null;
    }

    connectingRef.current = true;
    let cancelled = false;

    async function connectMavlink() {
      // Track the live transport and whether it was handed to the drone
      // manager. If adapter.connect() (or any later step) throws after a
      // transport has connected, the outer catch disconnects it so the open
      // socket isn't leaked.
      let connectedTransport: Transport | undefined;
      let handedOff = false;
      try {
        const { MAVLinkAdapter } = await import("@/lib/protocol/mavlink-adapter");

        if (cancelled) return;

        let transport: Transport | undefined;
        let connType: "websocket" | "mqtt-mavlink" = "websocket";

        const { WebSocketTransport } = await import(
          "@/lib/protocol/transport/websocket"
        );
        const tryWs = async (
          url: string,
          protocols?: string | string[],
        ): Promise<InstanceType<typeof WebSocketTransport>> => {
          const wsTransport = new WebSocketTransport();
          await Promise.race([
            wsTransport.connect(url, protocols),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), WS_TIMEOUT_MS),
            ),
          ]);
          return wsTransport;
        };

        // Try 1: the agent's ticket-gated authenticated MAVLink endpoint.
        // Preferred when the agent advertises it and a pairing key is held:
        // mint a one-shot ticket and carry it as a WebSocket subprotocol so
        // it never reaches the URL. On a secure GCS origin the gated ws://
        // is upgraded to wss:// (the only path that survives mixed-content
        // blocking). With no pairing key (unpaired) the gated endpoint is
        // skipped and the cascade keeps the open-posture legacy behavior.
        if (mavlinkWsAuthenticated && apiKey && agentUrl) {
          const secured = secureWsUrl(mavlinkWsAuthenticated);
          if (secured) {
            try {
              const ticket = await mintWsTicket(
                { baseUrl: agentUrl, apiKey },
                "gs.mavlink_ws",
              );
              if (cancelled) return;
              transport = ticket
                ? await tryWs(secured, [WS_TICKET_PROTOCOL, ticket])
                : await tryWs(secured);
              connType = "websocket";
              console.log(
                "[AgentMavlinkBridge] Authenticated WebSocket connected",
              );
            } catch {
              transport = undefined;
              console.log(
                "[AgentMavlinkBridge] Authenticated WS failed, trying legacy direct WS...",
              );
            }
          }
        }

        // Try 2: legacy raw direct WebSocket (LAN, lowest latency). When the
        // agent has rotated its WebSocket binding (port change,
        // network move) the heartbeat carries the prior URL; if the
        // current URL fails we retry the prior URL once before
        // falling through to the MQTT relay path so a brief rotation
        // doesn't drop an in-flight session.
        if (!transport && legacyUrlUsable && mavlinkUrl) {
          try {
            transport = await tryWs(mavlinkUrl);
            console.log("[AgentMavlinkBridge] Direct WebSocket connected");
          } catch (err) {
            if (mavlinkWsUrlPrev && mavlinkWsUrlPrev !== mavlinkUrl) {
              try {
                transport = await tryWs(mavlinkWsUrlPrev);
                console.log(
                  "[AgentMavlinkBridge] Direct WebSocket connected via previous URL",
                );
              } catch {
                console.log(
                  "[AgentMavlinkBridge] Direct WS failed on current and previous URL, trying MQTT relay...",
                );
                void err;
              }
            } else {
              console.log(
                "[AgentMavlinkBridge] Direct WS failed, trying MQTT relay...",
              );
            }
          }
        }

        // Try 3: MQTT relay (cloud, works from anywhere)
        if (!transport && cloudDeviceId) {
          try {
            const { MqttMavlinkTransport } = await import(
              "@/lib/protocol/transport/mqtt-mavlink"
            );
            const mqttTransport = new MqttMavlinkTransport();
            await mqttTransport.connect(cloudDeviceId);
            transport = mqttTransport;
            connType = "mqtt-mavlink";
            console.log("[AgentMavlinkBridge] MQTT relay connected");
          } catch (mqttErr) {
            console.warn("[AgentMavlinkBridge] MQTT relay failed:", mqttErr);
          }
        }

        if (!transport) {
          console.warn("[AgentMavlinkBridge] All MAVLink connection methods failed");
          return;
        }
        connectedTransport = transport;

        if (cancelled) {
          transport.disconnect();
          return;
        }

        const adapter = new MAVLinkAdapter();
        const vehicleInfo = await adapter.connect(transport);

        if (cancelled) {
          adapter.disconnect();
          transport.disconnect();
          return;
        }

        // Reconcile to the presence-bridge fleet row for this node (created by
        // LocalDroneBridge / CloudDroneBridge) so the FC attaches to the
        // existing card instead of spawning a second entry. Match by the
        // node's device id and reuse that row's id and name. The node device id
        // is set on every connect path (LAN or cloud), so this identity is
        // stable across heartbeats and never timestamp-derived when present.
        const fleetRow = nodeDeviceId
          ? useFleetStore
              .getState()
              .drones.find(
                (d) =>
                  d.cloudDeviceId === nodeDeviceId ||
                  d.id === `local-${nodeDeviceId}` ||
                  d.id === `cloud-${nodeDeviceId}`,
              )
          : undefined;
        // When the presence row exists, attach to it. When it does not yet
        // (a connect/attach race), still key off the canonical `local-<id>`
        // id the LocalDroneBridge uses — never a self-owned `agent-node-*`
        // row, which would render a second card and split the FC-connected
        // state from the presence card the operator is looking at. Only a
        // node with no device id at all (direct USB/serial) owns a standalone
        // timestamped row.
        const droneId =
          fleetRow?.id ??
          (nodeDeviceId ? `local-${nodeDeviceId}` : `agent-${Date.now()}`);
        const droneName =
          fleetRow?.name ??
          useAgentSystemStore.getState().status?.board?.name ??
          "Drone";
        // The presence bridge owns the row whenever there is a node device id to
        // reconcile against; only own a standalone row when there is none.
        const ownsFleetRow = !nodeDeviceId;

        useDroneManager.getState().addDrone(
          droneId,
          droneName,
          adapter,
          transport,
          vehicleInfo,
          { type: connType, url: mavlinkUrl || undefined },
          { ownsFleetRow },
        );

        handedOff = true;
        connectedDroneIdRef.current = droneId;
        console.log(`[AgentMavlinkBridge] MAVLink connected via ${connType}:`, droneId);
      } catch (err) {
        console.warn("[AgentMavlinkBridge] MAVLink connection failed:", err);
      } finally {
        // A transport that connected but was never handed to the drone manager
        // (e.g. adapter handshake threw) would otherwise leak an open socket.
        if (connectedTransport && !handedOff) {
          try {
            connectedTransport.disconnect();
          } catch {
            // best-effort teardown
          }
        }
        connectingRef.current = false;
      }
    }

    connectMavlink();

    return () => {
      cancelled = true;
      connectingRef.current = false;
      // Don't disconnect the drone on unmount — the MAVLink connection should
      // persist across tab navigations. DroneManager handles its own lifecycle.
      // Only disconnect if the agent connection itself is dropped (handled by
      // transport "close" event → DroneManager.removeDrone automatically).
    };
  }, [
    mavlinkUrl,
    mavlinkWsUrlPrev,
    mavlinkWsAuthenticated,
    connected,
    fcConnected,
    nodeDeviceId,
  ]);

  return null;
}
