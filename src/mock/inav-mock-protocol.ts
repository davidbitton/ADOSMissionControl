/**
 * INavMockProtocol : DroneProtocol implementation for iNav demo mode.
 *
 * Simulates an iNav flight controller over MSP, with in-memory state for
 * settings, waypoint missions, safehomes, and geozones. Telemetry fires at
 * 10 Hz via setInterval.
 *
 * @license GPL-3.0-only
 */

import type {
  DroneProtocol, Transport, VehicleInfo, CommandResult, ParameterValue,
  ProtocolCapabilities, FirmwareHandler, MissionItem, UnifiedFlightMode,
  LogEntry, LogDownloadProgressCallback,
  AttitudeCallback, PositionCallback, BatteryCallback, GpsCallback,
  VfrCallback, RcCallback, StatusTextCallback, HeartbeatCallback,
  ParameterCallback, SerialDataCallback, SysStatusCallback, RadioCallback,
  MissionProgressCallback, EkfCallback, VibrationCallback, ServoOutputCallback,
  WindCallback, TerrainCallback, MagCalProgressCallback, MagCalReportCallback,
  AccelCalPosCallback, HomePositionCallback, AutopilotVersionCallback,
  PowerStatusCallback, DistanceSensorCallback, FenceStatusCallback,
  NavControllerCallback, ScaledImuCallback, ScaledPressureCallback,
  EstimatorStatusCallback, CameraTriggerCallback, LinkStateCallback,
  LocalPositionCallback, DebugCallback, GimbalAttitudeCallback,
  ObstacleDistanceCallback, CameraImageCapturedCallback, ExtendedSysStateCallback,
  FencePointCallback, SystemTimeCallback, RawImuCallback, RcChannelsRawCallback,
  RcChannelsOverrideCallback, MissionItemCallback, AltitudeCallback,
  WindCovCallback, AisVesselCallback, GimbalManagerInfoCallback,
  GimbalManagerStatusCallback, CanFrameCallback,
} from "@/lib/protocol/types";
import { inavHandler } from "@/lib/protocol/firmware/inav";
import { INAV_WP_FLAG_LAST, INAV_WP_ACTION } from "@/lib/protocol/msp/msp-decoders-inav";
import type { INavWaypoint, INavSafehome } from "@/lib/protocol/msp/msp-decoders-inav";
import type { SettingValue } from "@/lib/protocol/msp/settings";
import { SettingType } from "@/lib/protocol/msp/settings";
import { createCallbackArrays } from "./mock-protocol-callbacks";
import type { MockCallbackArrays } from "./mock-protocol-callbacks";

// ── Helpers ───────────────────────────────────────────────────

function ok(message = "OK"): CommandResult { return { success: true, resultCode: 0, message }; }
function sub<T>(arr: T[], cb: T): () => void {
  arr.push(cb);
  return () => { const i = arr.indexOf(cb); if (i >= 0) arr.splice(i, 1); };
}

// ── iNav-only types ───────────────────────────────────────────

/** Geozone types supported in demo state. */
export const GEOZONE_TYPE_EXCLUSIVE = 0;
export const GEOZONE_TYPE_INCLUSIVE = 1;
export const GEOZONE_SHAPE_POLYGON = 0;
export const GEOZONE_SHAPE_CIRCULAR = 1;

export interface INavGeozone {
  index: number;
  enabled: boolean;
  shape: number;
  type: number;
  minAltitude: number;
  maxAltitude: number;
  /** Circular only: center lat (WGS84 degrees). */
  lat?: number;
  /** Circular only: center lon (WGS84 degrees). */
  lon?: number;
  /** Circular only: radius in cm. */
  radius?: number;
  /** Polygon only: vertex array [{lat, lon}] in degrees. */
  vertices?: Array<{ lat: number; lon: number }>;
}

/** Named setting entry stored in the in-memory map. */
interface SettingEntry {
  type: number;
  value: number | string;
}

// ── Vehicle info constants ────────────────────────────────────

const INAV_QUAD_VEHICLE_INFO: VehicleInfo = {
  firmwareType: "inav", vehicleClass: "copter",
  firmwareVersionString: "INAV 7.1.2 (MSP API 2.5)",
  systemId: 1, componentId: 1, autopilotType: 0, vehicleType: 0,
};

const INAV_PLANE_VEHICLE_INFO: VehicleInfo = {
  firmwareType: "inav", vehicleClass: "plane",
  firmwareVersionString: "INAV 7.1.2 (MSP API 2.5)",
  systemId: 1, componentId: 1, autopilotType: 0, vehicleType: 0,
};

// ── Config interface ──────────────────────────────────────────

export interface INavMockConfig {
  vehicleClass: "copter" | "plane";
  missionWaypoints?: INavWaypoint[];
  safehomes?: INavSafehome[];
  geozones?: INavGeozone[];
}

// ── Seed settings per vehicle class ──────────────────────────

function seedSettings(vehicleClass: "copter" | "plane"): Map<string, SettingEntry> {
  const m = new Map<string, SettingEntry>();
  const set = (k: string, t: number, v: number | string) => m.set(k, { type: t, value: v });

  set("nav_rth_altitude",                     SettingType.UINT16, 2500);
  set("nav_max_speed",                        SettingType.UINT16, 1000);
  set("nav_manual_speed",                     SettingType.UINT16, 800);
  set("nav_poshold_user_control_mode",        SettingType.UINT8,  0);
  set("nav_wp_max_distance_between_points",   SettingType.UINT32, 10000);
  set("failsafe_procedure",                   SettingType.UINT8,  0);
  set("failsafe_throttle",                    SettingType.UINT16, 1000);
  set("failsafe_delay",                       SettingType.UINT8,  5);
  set("platform_type",                        SettingType.UINT8,  vehicleClass === "plane" ? 1 : 0);
  set("motor_count",                          SettingType.UINT8,  vehicleClass === "plane" ? 1 : 4);
  set("servo_count",                          SettingType.UINT8,  vehicleClass === "plane" ? 5 : 0);
  set("safehome_max_distance",                SettingType.UINT32, 20000);
  set("battery_capacity",                     SettingType.UINT16, 2200);
  set("bat_cells",                            SettingType.UINT8,  4);
  set("vbat_min_cell_voltage",                SettingType.UINT8,  330);
  set("vbat_max_cell_voltage",                SettingType.UINT8,  420);
  set("vbat_warning_cell_voltage",            SettingType.UINT8,  350);

  return m;
}

// ── INavMockProtocol ──────────────────────────────────────────

/**
 * Full DroneProtocol implementation simulating an iNav flight controller.
 *
 * iNav-only surface (safehomes, geozones, multi-mission) is exposed as public
 * methods beyond the DroneProtocol interface. Formal DroneProtocol extension
 * follows in the mission and geozone module.
 */
export class INavMockProtocol implements DroneProtocol {
  readonly protocolName = "msp";

  private _connected = false;
  private _vehicleInfo: VehicleInfo;
  private cbs: MockCallbackArrays = createCallbackArrays();
  private tickTimers: ReturnType<typeof setInterval>[] = [];

  // In-memory state ──────────────────────────────────────────
  private settings: Map<string, SettingEntry>;
  private waypoints: INavWaypoint[] = [];
  private safehomeSlots: Array<INavSafehome | null> = Array(16).fill(null);
  private geozoneSlots: Array<INavGeozone | null> = Array(15).fill(null);

  // Telemetry drift state ────────────────────────────────────
  private lat: number;
  private lon: number;
  private battery = 100;
  private yaw = 0;
  private roll = 0;
  private pitch = 0;
  private sats = 12;
  private readonly baseLat: number;
  private readonly baseLon: number;

  constructor(config: INavMockConfig) {
    this._vehicleInfo = config.vehicleClass === "plane" ? INAV_PLANE_VEHICLE_INFO : INAV_QUAD_VEHICLE_INFO;
    this.settings = seedSettings(config.vehicleClass);

    // Seed provided state
    if (config.missionWaypoints) this.waypoints = [...config.missionWaypoints];
    if (config.safehomes) {
      for (const sh of config.safehomes) {
        if (sh.index >= 0 && sh.index < 16) this.safehomeSlots[sh.index] = { ...sh };
      }
    }
    if (config.geozones) {
      for (const gz of config.geozones) {
        if (gz.index >= 0 && gz.index < 15) this.geozoneSlots[gz.index] = { ...gz };
      }
    }

    // Base position: just south-west of Bangalore (offset from main demo cluster)
    this.baseLat = config.vehicleClass === "plane" ? 12.920 : 12.925;
    this.baseLon = config.vehicleClass === "plane" ? 77.595 : 77.600;
    this.lat = this.baseLat;
    this.lon = this.baseLon;
  }

  // ── Connection ──────────────────────────────────────────────

  get isConnected(): boolean { return this._connected; }

  async connect(_t: Transport): Promise<VehicleInfo> {
    await new Promise<void>((r) => setTimeout(r, 300));
    this._connected = true;
    this._startTelemetryTick();
    return this._vehicleInfo;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this._stopTelemetryTick();
  }

  // ── Info ────────────────────────────────────────────────────

  getVehicleInfo(): VehicleInfo { return this._vehicleInfo; }
  getCapabilities(): ProtocolCapabilities { return inavHandler.getCapabilities(); }
  getFirmwareHandler(): FirmwareHandler { return inavHandler; }

  // ── Settings (iNav name-based system) ──────────────────────

  /**
   * Read a named iNav setting from in-memory state.
   *
   * Returns a SettingValue shaped object without issuing any MSP request.
   * The type parameter is used to coerce the return type tag.
   */
  getSetting(name: string, _type?: number): SettingValue | undefined {
    const entry = this.settings.get(name);
    if (!entry) return undefined;
    const t = entry.type;
    const v = entry.value;
    if (t === SettingType.UINT8)  return { type: "uint8",  value: Number(v) };
    if (t === SettingType.INT8)   return { type: "int8",   value: Number(v) };
    if (t === SettingType.UINT16) return { type: "uint16", value: Number(v) };
    if (t === SettingType.INT16)  return { type: "int16",  value: Number(v) };
    if (t === SettingType.UINT32) return { type: "uint32", value: Number(v) };
    if (t === SettingType.INT32)  return { type: "int32",  value: Number(v) };
    if (t === SettingType.FLOAT)  return { type: "float",  value: Number(v) };
    if (t === SettingType.STRING) return { type: "string", value: String(v) };
    return { type: "raw", value: new Uint8Array([Number(v) & 0xff]) };
  }

  /**
   * Write a named iNav setting into in-memory state.
   *
   * Throws if the name is unknown (matches FC behaviour : the real FC rejects
   * unknown setting names). Type coercion: numeric types accept numbers;
   * string type accepts strings; passing a string to a numeric type throws.
   */
  setSetting(name: string, type: number, value: number | string): void {
    const existing = this.settings.get(name);
    const effectiveType = type !== undefined ? type : existing?.type ?? SettingType.UINT8;

    if (!existing && type === undefined) {
      throw new Error(`Unknown iNav setting: "${name}"`);
    }

    const isNumericType = effectiveType !== SettingType.STRING;
    if (isNumericType && typeof value === "string" && isNaN(Number(value))) {
      throw new TypeError(`Setting "${name}" expects a numeric value`);
    }

    const coerced: number | string = isNumericType ? Number(value) : String(value);
    this.settings.set(name, { type: effectiveType, value: coerced });
  }

  // ── Mission (iNav 60-slot, multi-mission) ──────────────────

  async uploadMission(items: MissionItem[]): Promise<CommandResult> {
    this.waypoints = items.map((item, i) => ({
      number: i + 1,
      action: INAV_WP_ACTION.WAYPOINT,
      lat: item.x / 1e7,
      lon: item.y / 1e7,
      altitude: item.z,
      p1: Math.round(item.param1 ?? 0),
      p2: Math.round(item.param2 ?? 0),
      p3: Math.round(item.param3 ?? 0),
      flag: i === items.length - 1 ? INAV_WP_FLAG_LAST : 0,
    }));
    return ok(`${items.length} waypoints uploaded`);
  }

  async downloadMission(): Promise<MissionItem[]> {
    await new Promise<void>((r) => setTimeout(r, 400));
    return this.waypoints.map((wp, i) => ({
      seq: i,
      frame: 3,
      command: 16,
      current: i === 0 ? 1 : 0,
      autocontinue: 1,
      param1: wp.p1,
      param2: wp.p2,
      param3: wp.p3,
      param4: 0,
      x: Math.round(wp.lat * 1e7),
      y: Math.round(wp.lon * 1e7),
      z: wp.altitude,
    }));
  }

  async setCurrentMissionItem(): Promise<CommandResult> { return ok("Mission item set"); }
  async clearMission(): Promise<CommandResult> { this.waypoints = []; return ok("Mission cleared"); }

  /** Read the raw INavWaypoint slots : used by tests and iNav-specific panels. */
  getINavWaypoints(): INavWaypoint[] { return [...this.waypoints]; }

  // ── Safehome CRUD (iNav-only surface) ───────────────────────
  // iNav-only surface; formal DroneProtocol extension follows in the mission and geozone module.

  getSafehome(index: number): INavSafehome | null {
    if (index < 0 || index >= 16) return null;
    return this.safehomeSlots[index] ? { ...this.safehomeSlots[index]! } : null;
  }

  getAllSafehomes(): Array<INavSafehome | null> {
    return this.safehomeSlots.map((s) => s ? { ...s } : null);
  }

  setSafehome(safehome: INavSafehome): CommandResult {
    if (safehome.index < 0 || safehome.index >= 16) {
      return { success: false, resultCode: 1, message: "Index out of range (0-15)" };
    }
    this.safehomeSlots[safehome.index] = { ...safehome };
    return ok(`Safehome ${safehome.index} saved`);
  }

  clearSafehome(index: number): CommandResult {
    if (index < 0 || index >= 16) {
      return { success: false, resultCode: 1, message: "Index out of range (0-15)" };
    }
    this.safehomeSlots[index] = null;
    return ok(`Safehome ${index} cleared`);
  }

  // ── Geozone CRUD (iNav-only surface) ───────────────────────
  // iNav-only surface; formal DroneProtocol extension follows in the mission and geozone module.

  getGeozone(index: number): INavGeozone | null {
    if (index < 0 || index >= 15) return null;
    return this.geozoneSlots[index] ? { ...this.geozoneSlots[index]! } : null;
  }

  getAllGeozones(): Array<INavGeozone | null> {
    return this.geozoneSlots.map((g) => g ? { ...g } : null);
  }

  setGeozone(zone: INavGeozone): CommandResult {
    if (zone.index < 0 || zone.index >= 15) {
      return { success: false, resultCode: 1, message: "Index out of range (0-14)" };
    }
    this.geozoneSlots[zone.index] = { ...zone, vertices: zone.vertices ? [...zone.vertices] : undefined };
    return ok(`Geozone ${zone.index} saved`);
  }

  clearGeozone(index: number): CommandResult {
    if (index < 0 || index >= 15) {
      return { success: false, resultCode: 1, message: "Index out of range (0-14)" };
    }
    this.geozoneSlots[index] = null;
    return ok(`Geozone ${index} cleared`);
  }

  // ── Commands ────────────────────────────────────────────────

  async arm(): Promise<CommandResult>   { this._emit("statusText", 6, "Arming motors"); return ok("Armed"); }
  async disarm(): Promise<CommandResult> { this._emit("statusText", 6, "Disarming motors"); return ok("Disarmed"); }
  async setFlightMode(m: UnifiedFlightMode): Promise<CommandResult> { this._emit("statusText", 6, `Mode change to ${m}`); return ok(`Mode: ${m}`); }
  async returnToLaunch(): Promise<CommandResult>   { this._emit("statusText", 6, "Returning to launch"); return ok("RTL"); }
  async land(): Promise<CommandResult>             { this._emit("statusText", 6, "Landing"); return ok("Landing"); }
  async takeoff(alt: number): Promise<CommandResult> { this._emit("statusText", 6, `Taking off to ${alt}m`); return ok(`Takeoff ${alt}m`); }
  async killSwitch(): Promise<CommandResult>       { this._emit("statusText", 2, "KILL SWITCH ACTIVATED"); return ok("Kill switch"); }
  async guidedGoto(): Promise<CommandResult>       { return ok("Goto"); }
  async pauseMission(): Promise<CommandResult>     { return ok("Mission paused"); }
  async resumeMission(): Promise<CommandResult>    { return ok("Mission resumed"); }
  async commitParamsToFlash(): Promise<CommandResult> { return ok("Params saved to flash"); }
  async setHome(): Promise<CommandResult>          { return ok("Home set"); }
  async changeSpeed(): Promise<CommandResult>      { return ok("Speed changed"); }
  async setYaw(): Promise<CommandResult>           { return ok("Yaw set"); }
  async setGeoFenceEnabled(): Promise<CommandResult> { return ok("Geofence updated"); }
  async setServo(): Promise<CommandResult>         { return ok("Servo set"); }
  async cameraTrigger(): Promise<CommandResult>    { return ok("Camera triggered"); }
  async setGimbalAngle(): Promise<CommandResult>   { return ok("Gimbal set"); }
  async setCameraTriggerDistance(): Promise<CommandResult> { return ok("Trigger distance set"); }
  async setGimbalMode(): Promise<CommandResult>    { return ok("Gimbal mode set"); }
  async setGimbalROI(): Promise<CommandResult>     { return ok("Gimbal ROI set"); }
  async setRoiLocation(): Promise<CommandResult>   { return ok("ROI set"); }
  async clearRoi(): Promise<CommandResult>         { return ok("ROI cleared"); }
  async orbit(): Promise<CommandResult>            { return ok("Orbit started"); }
  async setEkfOrigin(): Promise<CommandResult>     { return ok("EKF origin set"); }
  async startEscCalibration(): Promise<CommandResult> { return ok("ESC calibration started"); }
  async startCompassMotCal(): Promise<CommandResult>  { return ok("CompassMot calibration started"); }
  async enableFence(): Promise<CommandResult>      { return ok("Fence updated"); }
  async doLandStart(): Promise<CommandResult>      { return ok("Land start"); }
  async controlVideo(): Promise<CommandResult>     { return ok("Video control"); }
  async setRelay(): Promise<CommandResult>         { return ok("Relay set"); }
  async startRxPair(): Promise<CommandResult>      { return ok("RX pair started"); }
  async setMessageInterval(): Promise<CommandResult> { return ok("Interval set"); }
  async sendCommand(): Promise<CommandResult>      { return ok("Command sent"); }
  sendManualControl(): void {}
  sendPositionTarget(): void {}
  sendAttitudeTarget(): void {}
  setRcChannelValues(): void {}

  async doPreArmCheck(): Promise<CommandResult> { setTimeout(() => this._emit("statusText", 6, "PreArm: Ready to arm"), 200); return ok("Pre-arm check"); }

  // ── Fence / Rally ───────────────────────────────────────────

  async uploadFence(): Promise<CommandResult> { return ok("Fence uploaded"); }
  async downloadFence() { return []; }
  async uploadRallyPoints(): Promise<CommandResult> { return ok("Rally points uploaded"); }
  async downloadRallyPoints() { return []; }

  // ── Parameters ──────────────────────────────────────────────

  getCachedParameterNames(): string[] { return []; }
  async getAllParameters(): Promise<ParameterValue[]> { return []; }
  async getParameter(name: string): Promise<ParameterValue> { return { name, value: 0, type: 9, index: -1, count: 0 }; }
  async setParameter(name: string, value: number, type = 9): Promise<CommandResult> { void type; return ok(`${name} = ${value}`); }
  async resetParametersToDefault(): Promise<CommandResult> { return ok("Parameters reset"); }

  // ── Calibration ─────────────────────────────────────────────

  async startCalibration(): Promise<CommandResult> { return ok("Calibration started"); }
  confirmAccelCalPos(): void {}
  async acceptCompassCal(): Promise<CommandResult>  { return ok("Compass cal accepted"); }
  async cancelCompassCal(): Promise<CommandResult>  { return ok("Compass cal cancelled"); }
  async cancelCalibration(): Promise<CommandResult> { return ok("Calibration cancelled"); }
  async startGnssMagCal(): Promise<CommandResult>   { return ok("GNSS mag cal started"); }

  // ── Log Download ────────────────────────────────────────────

  async getLogList(): Promise<LogEntry[]> { return []; }
  async downloadLog(_id: number, onProgress?: LogDownloadProgressCallback): Promise<Uint8Array> {
    if (onProgress) onProgress(1024, 1024);
    return new Uint8Array(1024);
  }
  async eraseAllLogs(): Promise<CommandResult> { return ok("Logs erased"); }
  cancelLogDownload(): void {}

  // ── Motor Test / Reboot ─────────────────────────────────────

  async motorTest(motor: number, throttle: number, duration: number): Promise<CommandResult> {
    this._emit("statusText", 6, `Motor ${motor} test: ${throttle}% for ${duration}s`);
    return ok(`Motor ${motor} tested`);
  }
  async rebootToBootloader(): Promise<CommandResult> { return ok("Reboot to bootloader (mock)"); }
  async reboot(): Promise<CommandResult> { this._emit("statusText", 5, "Rebooting..."); return ok("Reboot (mock)"); }

  // ── Serial ──────────────────────────────────────────────────

  sendSerialData(): void {}
  async requestMessage(): Promise<CommandResult> { return ok("Message requested"); }

  // ── Telemetry tick ──────────────────────────────────────────

  private _emit(kind: "statusText", severity: number, text: string): void;
  private _emit(...args: unknown[]): void {
    if (args[0] === "statusText") {
      const sev = args[1] as number;
      const txt = args[2] as string;
      for (const cb of this.cbs.statusTextCbs) cb({ severity: sev, text: txt });
    }
  }

  /** Start 10 Hz telemetry loop. Called on connect. */
  startMockTelemetryTick(): void {
    this._startTelemetryTick();
  }

  stopMockTelemetryTick(): void {
    this._stopTelemetryTick();
  }

  private _startTelemetryTick(): void {
    this._stopTelemetryTick();
    const now = () => Date.now();

    const tick = setInterval(() => {
      const ts = now();

      // Slow drift around base position
      this.lat = this.baseLat + Math.sin(ts / 30000) * 0.001;
      this.lon = this.baseLon + Math.cos(ts / 30000) * 0.001;

      // Attitude drift
      this.roll  = Math.sin(ts / 4000) * 12;
      this.pitch = Math.cos(ts / 5000) * 8;
      this.yaw   = ((this.yaw + 0.5) % 360);

      // Battery drain ~0.1%/sec at 10 Hz
      this.battery = Math.max(5, this.battery - 0.01);

      // GPS satellite count jitter
      this.sats = 11 + (Math.floor(ts / 5000) % 4);

      for (const cb of this.cbs.attitudeCbs) {
        cb({ roll: this.roll, pitch: this.pitch, yaw: this.yaw, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 0.5, timestamp: ts });
      }
      for (const cb of this.cbs.positionCbs) {
        cb({
          lat: this.lat, lon: this.lon,
          alt: 45 + Math.sin(ts / 8000) * 5,
          relativeAlt: 45,
          heading: this.yaw, groundSpeed: 5 + Math.sin(ts / 3000) * 2,
          airSpeed: 6, climbRate: Math.cos(ts / 4000) * 0.5,
          timestamp: ts,
        });
      }
      for (const cb of this.cbs.batteryCbs) {
        const cellV = (16.8 * (this.battery / 100)) / 4;
        cb({
          voltage: 16.8 * (this.battery / 100),
          current: 8 + Math.random() * 3,
          remaining: this.battery,
          consumed: (100 - this.battery) * 14.7,
          temperature: 31 + Math.random() * 5,
          cellVoltages: [cellV, cellV, cellV, cellV],
          timestamp: ts,
        });
      }
      for (const cb of this.cbs.gpsCbs) {
        cb({
          fixType: 3, satellites: this.sats,
          hdop: 0.9 + Math.random() * 0.3,
          lat: this.lat, lon: this.lon, alt: 920,
          timestamp: ts,
        });
      }
      for (const cb of this.cbs.heartbeatCbs) {
        cb({ armed: true, mode: "POSHOLD", systemStatus: 4, vehicleInfo: this._vehicleInfo });
      }
    }, 100);

    this.tickTimers.push(tick);
  }

  private _stopTelemetryTick(): void {
    for (const t of this.tickTimers) clearInterval(t);
    this.tickTimers = [];
  }

  // ── Subscriptions ────────────────────────────────────────────

  onAttitude = (cb: AttitudeCallback) => sub(this.cbs.attitudeCbs, cb);
  onPosition = (cb: PositionCallback) => sub(this.cbs.positionCbs, cb);
  onBattery = (cb: BatteryCallback) => sub(this.cbs.batteryCbs, cb);
  onGps = (cb: GpsCallback) => sub(this.cbs.gpsCbs, cb);
  onVfr = (cb: VfrCallback) => sub(this.cbs.vfrCbs, cb);
  onRc = (cb: RcCallback) => sub(this.cbs.rcCbs, cb);
  onStatusText = (cb: StatusTextCallback) => sub(this.cbs.statusTextCbs, cb);
  onHeartbeat = (cb: HeartbeatCallback) => sub(this.cbs.heartbeatCbs, cb);
  onParameter = (cb: ParameterCallback) => sub(this.cbs.parameterCbs, cb);
  onSerialData = (cb: SerialDataCallback) => sub(this.cbs.serialDataCbs, cb);
  onSysStatus = (cb: SysStatusCallback) => sub(this.cbs.sysStatusCbs, cb);
  onRadio = (cb: RadioCallback) => sub(this.cbs.radioCbs, cb);
  onMissionProgress = (cb: MissionProgressCallback) => sub(this.cbs.missionProgressCbs, cb);
  onEkf = (cb: EkfCallback) => sub(this.cbs.ekfCbs, cb);
  onVibration = (cb: VibrationCallback) => sub(this.cbs.vibrationCbs, cb);
  onServoOutput = (cb: ServoOutputCallback) => sub(this.cbs.servoOutputCbs, cb);
  onWind = (cb: WindCallback) => sub(this.cbs.windCbs, cb);
  onTerrain = (cb: TerrainCallback) => sub(this.cbs.terrainCbs, cb);
  onMagCalProgress = (cb: MagCalProgressCallback) => sub(this.cbs.magCalProgressCbs, cb);
  onMagCalReport = (cb: MagCalReportCallback) => sub(this.cbs.magCalReportCbs, cb);
  onAccelCalPos = (cb: AccelCalPosCallback) => sub(this.cbs.accelCalPosCbs, cb);
  onHomePosition = (cb: HomePositionCallback) => sub(this.cbs.homePositionCbs, cb);
  onAutopilotVersion = (cb: AutopilotVersionCallback) => sub(this.cbs.autopilotVersionCbs, cb);
  onPowerStatus = (cb: PowerStatusCallback) => sub(this.cbs.powerStatusCbs, cb);
  onDistanceSensor = (cb: DistanceSensorCallback) => sub(this.cbs.distanceSensorCbs, cb);
  onFenceStatus = (cb: FenceStatusCallback) => sub(this.cbs.fenceStatusCbs, cb);
  onNavController = (cb: NavControllerCallback) => sub(this.cbs.navControllerCbs, cb);
  onScaledImu = (cb: ScaledImuCallback) => sub(this.cbs.scaledImuCbs, cb);
  onScaledPressure = (cb: ScaledPressureCallback) => sub(this.cbs.scaledPressureCbs, cb);
  onEstimatorStatus = (cb: EstimatorStatusCallback) => sub(this.cbs.estimatorStatusCbs, cb);
  onCameraTrigger = (cb: CameraTriggerCallback) => sub(this.cbs.cameraTriggerCbs, cb);
  onLinkLost = (cb: LinkStateCallback) => sub(this.cbs.linkLostCbs, cb);
  onLinkRestored = (cb: LinkStateCallback) => sub(this.cbs.linkRestoredCbs, cb);
  onLocalPosition = (cb: LocalPositionCallback) => sub(this.cbs.localPositionCbs, cb);
  onDebug = (cb: DebugCallback) => sub(this.cbs.debugCbs, cb);
  onGimbalAttitude = (cb: GimbalAttitudeCallback) => sub(this.cbs.gimbalAttitudeCbs, cb);
  onObstacleDistance = (cb: ObstacleDistanceCallback) => sub(this.cbs.obstacleDistanceCbs, cb);
  onCameraImageCaptured = (cb: CameraImageCapturedCallback) => sub(this.cbs.cameraImageCapturedCbs, cb);
  onExtendedSysState = (cb: ExtendedSysStateCallback) => sub(this.cbs.extendedSysStateCbs, cb);
  onFencePoint = (cb: FencePointCallback) => sub(this.cbs.fencePointCbs, cb);
  onSystemTime = (cb: SystemTimeCallback) => sub(this.cbs.systemTimeCbs, cb);
  onRawImu = (cb: RawImuCallback) => sub(this.cbs.rawImuCbs, cb);
  onRcChannelsRaw = (cb: RcChannelsRawCallback) => sub(this.cbs.rcChannelsRawCbs, cb);
  onRcChannelsOverride = (cb: RcChannelsOverrideCallback) => sub(this.cbs.rcChannelsOverrideCbs, cb);
  onMissionItem = (cb: MissionItemCallback) => sub(this.cbs.missionItemCbs, cb);
  onAltitude = (cb: AltitudeCallback) => sub(this.cbs.altitudeCbs, cb);
  onWindCov = (cb: WindCovCallback) => sub(this.cbs.windCovCbs, cb);
  onAisVessel = (cb: AisVesselCallback) => sub(this.cbs.aisVesselCbs, cb);
  onGimbalManagerInfo = (cb: GimbalManagerInfoCallback) => sub(this.cbs.gimbalManagerInfoCbs, cb);
  onGimbalManagerStatus = (cb: GimbalManagerStatusCallback) => sub(this.cbs.gimbalManagerStatusCbs, cb);
  onCanFrame = (cb: CanFrameCallback) => sub(this.cbs.canFrameCbs, cb);
}
