/**
 * Drone identity, fleet, and alert types.
 * @module types/drone
 */

import type { PositionData, BatteryData, GpsData } from './telemetry';
import type { SuiteType } from './mission';

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
  suiteType?: SuiteType;
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
  /** Backend variant the agent process is running. Absent values
   * default to "full". The "lite" variant hides plugin / peripheral /
   * scripting / ROS surfaces in Mission Control. */
  runtimeMode?: "full" | "lite";
  /** Local panel attached to the companion board over the 40-pin
   * expansion header (e.g. SPI LCD on a Cubie A7Z or Rock 5C
   * ground-station node). Undefined when no display is bound. */
  attachedDisplayType?: "spi-lcd" | "hdmi" | "none";
  /** How the agent landed on its current profile. Drives the small
   * "auto" pill on the fleet card. One of "detected", "tiebreaker",
   * "default", "override", "user", or undefined for legacy
   * heartbeats that predate this field. */
  profileSource?: "detected" | "tiebreaker" | "default" | "override" | "user";
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
