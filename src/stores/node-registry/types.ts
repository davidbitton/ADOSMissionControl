/**
 * @module NodeRegistry/types
 * @description Type definitions for the canonical node registry: the single
 * source of fleet identity, keyed by a stable `nodeId`. One {@link NodeEntry}
 * holds presence, connection, and flight-controller state as three independent
 * sub-states so that a single physical node (an agent, optionally with an
 * attached FC, optionally seen over both local and cloud transports) collapses
 * to exactly one row.
 *
 * This module ships dark: nothing imports it yet, and it changes no existing
 * behavior. It exists so the bridges can later feed this registry and project
 * `NodeEntry` back into the existing fleet shape.
 *
 * @license GPL-3.0-only
 */

import type {
  PositionData,
  BatteryData,
  GpsData,
} from "@/lib/types/telemetry";

/**
 * Which transport a presence observation arrived on. A node can be seen on
 * both at once; both must drop before the presence sub-state clears.
 */
export type PresenceSource = "local" | "cloud";

/**
 * The wire-contract node profile. Drives node grouping and panel selection.
 */
export type NodeProfile = "drone" | "ground-station" | "compute";

/**
 * Ground-station role when the profile is "ground-station". Null / undefined
 * on drones and compute nodes.
 */
export type NodeRole = "direct" | "relay" | "receiver" | null;

/**
 * Cloud posture chosen on the agent. "local" means the agent intentionally
 * disabled the cloud relay (correct default since the beacon-off release), so
 * an offline-by-design node is distinguishable from one that dropped off.
 */
export type NodeCloudPosture = "local" | "cloud" | "self_hosted";

/**
 * MAVLink transport binding for the node's connection sub-state.
 */
export type NodeTransport = "websocket" | "mqtt-mavlink";

/**
 * Arming state mirrored from the attached FC.
 */
export type NodeArmState = "disarmed" | "armed";

/**
 * Presence sub-state: who/what/where the node is, and on which transport(s)
 * it was last observed. A node may carry presence from `local`, `cloud`, or
 * both at once; the merged view here is the union with cloud-authoritative
 * identity fields and local-or-cloud freshness, whichever is more recent.
 */
export interface NodePresence {
  /** Stable agent device id (the key material behind a `node:` nodeId). */
  deviceId: string;
  /** Operator-visible name from the agent heartbeat. */
  name: string;
  /** Node profile from the heartbeat. Defaults to "drone" upstream. */
  profile: NodeProfile;
  /** Ground-station role; null / undefined on non-GS nodes. */
  role?: NodeRole;
  /** Cloud posture as reported by the agent. */
  cloudPosture?: NodeCloudPosture;
  /** Cloud device id used for relay pairing; present for cloud-seen nodes. */
  cloudDeviceId?: string;
  /**
   * The transports this presence was observed on. Empty means no live
   * presence source; combined with a null `fc.managedId` it makes the entry
   * eligible for garbage collection.
   */
  sources: PresenceSource[];
  /** Epoch ms of the freshest presence observation across all sources. */
  lastHeartbeat: number;
}

/**
 * Connection sub-state: how the GCS reaches the node's MAVLink stream, and
 * whether the node currently reports an attached, connected flight controller.
 */
export interface NodeConnection {
  /** Direct LAN MAVLink WebSocket URL the agent advertises, if any. */
  mavlinkUrl?: string;
  /** The transport carrying MAVLink for this node, if connected. */
  transport?: NodeTransport;
  /** True when the agent reports a connected flight controller. */
  fcConnected: boolean;
}

/**
 * Battery telemetry mirrored from the attached FC. The full
 * {@link BatteryData} shape passes through verbatim so the fleet projection
 * is lossless (the registry is a mirror, no field flattening).
 */
export type NodeFcBattery = BatteryData;

/** GPS fix telemetry mirrored from the attached FC (full {@link GpsData}). */
export type NodeFcGps = GpsData;

/** Position / pose telemetry mirrored from the attached FC (full {@link PositionData}). */
export type NodeFcPosition = PositionData;

/**
 * Flight-controller sub-state: the drone-manager managed id of the attached
 * FC plus the latest telemetry bridged from it. `managedId` is the second
 * survival anchor: while it is non-null the entry is never garbage-collected,
 * even with zero presence sources (a direct-USB FC has no agent presence).
 */
export interface NodeFc {
  /** drone-manager `ManagedDrone.id` of the attached FC, or null when none. */
  managedId: string | null;
  status?: string;
  flightMode?: string;
  armState?: NodeArmState;
  healthScore?: number;
  firmwareVersion?: string;
  frameType?: string;
  lastHeartbeat?: number;
  battery?: NodeFcBattery;
  gps?: NodeFcGps;
  position?: NodeFcPosition;
}

/**
 * A canonical node-registry entry. Exactly one per stable `nodeId`.
 *
 * `nodeId` is `"node:<deviceId>"` for an agent node (stable across the local
 * and cloud transports) or `"fc:<randomId>"` for a direct flight controller
 * with no agent identity.
 */
export interface NodeEntry {
  nodeId: string;
  presence: NodePresence;
  connection: NodeConnection;
  fc: NodeFc;
}
