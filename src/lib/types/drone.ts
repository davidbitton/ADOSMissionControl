/**
 * Drone identity, fleet, and alert types.
 * @module types/drone
 */

import type { PositionData, BatteryData, GpsData } from './telemetry';

// ── Drone State ──────────────────────────────────────────────

export type DroneStatus = "online" | "in_mission" | "idle" | "returning" | "maintenance" | "offline";
export type ConnectionState = "disconnected" | "connecting" | "connected" | "armed" | "in_flight";
export type FlightMode =
  | "STABILIZE" | "ALT_HOLD" | "LOITER" | "GUIDED" | "AUTO" | "RTL" | "LAND" | "MANUAL" | "ACRO"
  // ArduPlane modes
  | "FBWA" | "FBWB" | "CRUISE" | "TRAINING" | "CIRCLE" | "AUTOTUNE"
  | "QSTABILIZE" | "QHOVER" | "QLOITER" | "QLAND" | "QRTL" | "QAUTOTUNE" | "QACRO"
  | "AVOID_ADSB" | "THERMAL"
  // ArduCopter modes
  | "POSHOLD" | "BRAKE" | "SMART_RTL" | "DRIFT" | "SPORT" | "FLIP" | "THROW"
  | "FLOWHOLD" | "FOLLOW" | "ZIGZAG" | "SYSTEMID" | "HELI_AUTOROTATE" | "AUTO_RTL"
  // ArduPlane extras
  | "TAKEOFF" | "LOITER_TO_QLAND";
export type ArmState = "disarmed" | "armed";

export interface DroneInfo {
  id: string;
  name: string;
  status: DroneStatus;
  suiteName?: string;
  connectionState: ConnectionState;
  flightMode: FlightMode;
  armState: ArmState;
  lastHeartbeat: number;
  firmwareVersion?: string;
  frameType?: string;
}

// ── Fleet ────────────────────────────────────────────────────

export interface FleetDrone extends DroneInfo {
  position?: PositionData;
  battery?: BatteryData;
  gps?: GpsData;
  healthScore: number; // 0-100
  hasAgent?: boolean;
  /** "local" for direct MAVLink connections, "cloud" for cloud-paired agents */
  source?: "local" | "cloud";
  /** Cloud device ID for cloud-paired agents */
  cloudDeviceId?: string;
  /** Cloud posture chosen on the agent. "local" hides the cloud-relay
   * connectivity expectation so the fleet card distinguishes an
   * intentionally offline drone from one that dropped off. Undefined
   * for older agents that predate the field (treated as "cloud"). */
  cloudPosture?: "local" | "cloud" | "self_hosted";
  /** Local panel attached to the companion board over the 40-pin
   * expansion header (e.g. SPI LCD on a Cubie A7Z or Rock 5C
   * ground-station node). Undefined when no display is bound. */
  attachedDisplayType?: "spi-lcd" | "hdmi" | "none";
  /** How the agent landed on its current profile. Drives the small
   * "auto" pill on the fleet card. One of "detected", "tiebreaker",
   * "default", "override", "user", or undefined for legacy
   * heartbeats that predate this field. */
  profileSource?: "detected" | "tiebreaker" | "default" | "override" | "user";
  /** Air-side video pipeline flavor. Populated by the cloud heartbeat
   * when the agent runs the in-process GStreamer pipeline; undefined
   * when the legacy bash composition is in force. Drives the "GST"
   * pill on the fleet card. */
  videoPipelineFlavor?: string;
  /** GStreamer element factory name of the chosen H.264 encoder
   * ("v4l2h264enc", "mpph264enc", "x264enc", ...). Surfaced on the
   * fleet card tooltip and the drone Configure tab. */
  videoEncoderName?: string;
  /** True when the chosen encoder is a hardware path. */
  videoEncoderHwAccel?: boolean;
  /** Wire-contract node profile. "drone" or "ground-station" today,
   * "compute" in the future. Drives node grouping in the
   * Command-tab sidebar and panel selection in the right pane.
   * Defaults to "drone" for legacy heartbeats. */
  profile?: "drone" | "ground-station" | "compute";
  /** Ground-station role when applicable. Undefined / null on drones. */
  role?: "direct" | "relay" | "receiver" | null;
  /** Direct LAN MAVLink WebSocket URL the agent advertises in its
   * heartbeat. Drives the "Direct" pill on the fleet drone card so
   * the operator can switch from cloud relay to direct LAN in one
   * click. Undefined when the agent reports no LAN-routable URL. */
  manualMavlinkWsUrl?: string;
  /** True when the agent reports an active GPS-denied estimator
   * (optical flow or VIO). Denormalized from cmd_drones so the fleet
   * card can render a "VIO" pill without joining cmd_droneStatus.
   * Undefined for agents that predate the navigation surface. */
  navigationGpsDenied?: boolean;
  /** Active vision-nav estimator mode (free-form string mirroring the
   * agent's ``mode`` config). Used by the fleet card to render the
   * correct short badge: "OF" / "OF*" / "VIO" / "Hybrid". Undefined
   * for agents that predate the estimator framework heartbeat. */
   navigationMode?: string;
   /** Inter-rig peer device-id (truncated to 16 ASCII chars), populated
    * by the agent's HopListener when it decodes a WFB-radio
    * PresenceBeacon. Drives the "Peer" pill on the drone card. Null
    * or undefined when no beacon decoded recently. */
   peerDeviceId?: string | null;
   /** Peer-reported RSSI in dBm (signed). Surfaced in the Peer pill
    * tooltip. Null when unknown or 0 dBm. */
   peerRssiDbm?: number | null;
   /** Air-side camera discovery state. "ready" / "missing" / "error"
    * mirror the agent's /run/ados/camera-state.json snapshot.
    * Drives the "Camera Missing" pill on the fleet card so an
    * operator sees a wedged or unplugged USB camera without
    * SSH'ing in. Null / undefined on agents that predate the
    * surface or when no state has been reported yet. */
   cameraState?: string | null;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  droneId: string;
  droneName: string;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}
