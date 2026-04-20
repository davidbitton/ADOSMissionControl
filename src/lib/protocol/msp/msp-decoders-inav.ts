/**
 * iNav-specific MSP decoders.
 *
 * iNav extends MSP with navigation features: waypoints, safehomes,
 * NAV configuration, geozones, logic conditions, programming PIDs,
 * mixer profiles, and extended status. These decoders handle iNav-specific
 * MSP2 responses (0x2000+ range) and shared MSP_WP (118).
 *
 * Pure functions - each takes a DataView of the MSP response payload
 * and returns a typed object. All multi-byte values are little-endian.
 *
 * @module protocol/msp/msp-decoders-inav
 */

// ── DataView helpers ─────────────────────────────────────────

function readU8(dv: DataView, offset: number): number {
  return dv.getUint8(offset);
}

function readU16(dv: DataView, offset: number): number {
  return dv.getUint16(offset, true);
}

function readS16(dv: DataView, offset: number): number {
  return dv.getInt16(offset, true);
}

function readS32(dv: DataView, offset: number): number {
  return dv.getInt32(offset, true);
}

function readU32(dv: DataView, offset: number): number {
  return dv.getUint32(offset, true);
}

function readFloat32(dv: DataView, offset: number): number {
  return dv.getFloat32(offset, true);
}

/** Read a null-terminated ASCII string starting at offset. Returns [string, bytesConsumed]. */
function readCString(dv: DataView, offset: number): [string, number] {
  let end = offset;
  while (end < dv.byteLength && dv.getUint8(end) !== 0) end++;
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset + offset, end - offset);
  const str = String.fromCharCode(...bytes);
  return [str, end - offset + 1]; // +1 for null terminator
}

// ── iNav MSP2 command codes ──────────────────────────────────

export const INAV_MSP = {
  // Existing entries
  MSP2_INAV_STATUS: 0x2000,
  MSP2_INAV_OPTICAL_FLOW: 0x2001,
  MSP2_INAV_ANALOG: 0x2002,
  MSP2_INAV_MISC: 0x2003,
  MSP2_INAV_SET_MISC: 0x2004,
  MSP2_INAV_BATTERY_CONFIG: 0x2005,
  MSP2_INAV_SET_BATTERY_CONFIG: 0x2006,
  MSP2_INAV_RATE_PROFILE: 0x2007,
  MSP2_INAV_SET_RATE_PROFILE: 0x2008,
  MSP2_INAV_AIR_SPEED: 0x2009,
  MSP2_INAV_OUTPUT_MAPPING: 0x200a,
  MSP2_INAV_SAFEHOME: 0x2038,
  MSP2_INAV_SET_SAFEHOME: 0x2039,
  MSP2_INAV_MISC2: 0x203a,

  // Legacy nav config entry. This ID (0x2100) collides with MSP2_INAV_CUSTOM_OSD_ELEMENTS.
  // The shape decoded here does not match the Custom OSD Elements response format.
  // Retained as a legacy alias so existing callers are not broken; treat with caution.
  // See decodeMspINavNavConfigLegacy below.
  MSP2_INAV_NAV_CONFIG_LEGACY: 0x2100,
  MSP_NAV_STATUS: 0x2101,
  MSP_WP: 118,
  MSP_SET_WP: 209,

  // MSPv1 iNav navigation commands
  MSP_NAV_POSHOLD: 0x0c,
  MSP_SET_NAV_POSHOLD: 0x0d,
  MSP_RTH_AND_LAND_CONFIG: 0x14,
  MSP_SET_RTH_AND_LAND_CONFIG: 0x15,
  MSP_FW_CONFIG: 0x16,
  MSP_SET_FW_CONFIG: 0x17,

  // Waypoint mission storage
  MSP_WP_MISSION_LOAD: 0x1d2,
  MSP_WP_MISSION_SAVE: 0x1d3,
  MSP_WP_GETINFO: 0x1f4,
  MSP_SET_HOME_POSITION: 0xd9,

  // MSP2 common settings system
  MSP2_COMMON_SETTING: 0x1003,
  MSP2_COMMON_SET_SETTING: 0x1004,
  MSP2_COMMON_MOTOR_MIXER: 0x1005,
  MSP2_COMMON_SET_MOTOR_MIXER: 0x1006,
  MSP2_COMMON_SETTING_INFO: 0x1007,
  MSP2_COMMON_PG_LIST: 0x1008,

  // MSP2 iNav mixer
  MSP2_INAV_MIXER: 0x2010,
  MSP2_INAV_SET_MIXER: 0x2011,

  // MSP2 iNav OSD
  MSP2_INAV_OSD_LAYOUTS: 0x2012,
  MSP2_INAV_OSD_SET_LAYOUT_ITEM: 0x2013,
  MSP2_INAV_OSD_ALARMS: 0x2014,
  MSP2_INAV_OSD_SET_ALARMS: 0x2015,
  MSP2_INAV_OSD_PREFERENCES: 0x2016,
  MSP2_INAV_OSD_SET_PREFERENCES: 0x2017,

  // MSP2 iNav battery and debug
  MSP2_INAV_SELECT_BATTERY_PROFILE: 0x2018,
  MSP2_INAV_DEBUG: 0x2019,
  MSP2_INAV_BLACKBOX_CONFIG: 0x201a,
  MSP2_INAV_SET_BLACKBOX_CONFIG: 0x201b,
  MSP2_INAV_TEMP_SENSOR_CONFIG: 0x201c,
  MSP2_INAV_SET_TEMP_SENSOR_CONFIG: 0x201d,
  MSP2_INAV_TEMPERATURES: 0x201e,

  // MSP2 iNav servo and logic
  MSP2_INAV_SERVO_MIXER: 0x2020,
  MSP2_INAV_SET_SERVO_MIXER: 0x2021,
  MSP2_INAV_LOGIC_CONDITIONS: 0x2022,
  MSP2_INAV_SET_LOGIC_CONDITIONS: 0x2023,
  MSP2_INAV_GLOBAL_FUNCTIONS: 0x2024,
  MSP2_INAV_SET_GLOBAL_FUNCTIONS: 0x2025,
  MSP2_INAV_LOGIC_CONDITIONS_STATUS: 0x2026,
  MSP2_INAV_GVAR_STATUS: 0x2027,

  // MSP2 iNav programming PID
  MSP2_INAV_PROGRAMMING_PID: 0x2028,
  MSP2_INAV_SET_PROGRAMMING_PID: 0x2029,
  MSP2_INAV_PROGRAMMING_PID_STATUS: 0x202a,

  // MSP2 iNav braking, output mapping, timer
  MSP2_INAV_MC_BRAKING: 0x200b,
  MSP2_INAV_SET_MC_BRAKING: 0x200c,
  MSP2_INAV_OUTPUT_MAPPING_EXT: 0x200d,
  MSP2_INAV_OUTPUT_MAPPING_EXT2: 0x210d,
  MSP2_INAV_TIMER_OUTPUT_MODE: 0x200e,
  MSP2_INAV_SET_TIMER_OUTPUT_MODE: 0x200f,

  // MSP2 iNav PID
  MSP2_INAV_PID: 0x2030,
  MSP2_INAV_SET_PID: 0x2031,

  // MSP2 iNav LED strip extended
  MSP2_INAV_LED_STRIP_CONFIG_EX: 0x2048,
  MSP2_INAV_SET_LED_STRIP_CONFIG_EX: 0x2049,

  // MSP2 iNav fixed-wing approach
  MSP2_INAV_FW_APPROACH: 0x204a,
  MSP2_INAV_SET_FW_APPROACH: 0x204b,

  // MSP2 iNav rate dynamics and EzTune
  MSP2_INAV_RATE_DYNAMICS: 0x2060,
  MSP2_INAV_SET_RATE_DYNAMICS: 0x2061,
  MSP2_INAV_EZ_TUNE: 0x2070,
  MSP2_INAV_EZ_TUNE_SET: 0x2071,

  // MSP2 iNav mixer profile
  MSP2_INAV_SELECT_MIXER_PROFILE: 0x2080,

  // MSP2 ADS-B
  MSP2_ADSB_VEHICLE_LIST: 0x2090,

  // MSP2 iNav custom OSD elements (note: 0x2100 is also MSP2_INAV_NAV_CONFIG_LEGACY above)
  MSP2_INAV_CUSTOM_OSD_ELEMENTS: 0x2100,
  MSP2_INAV_CUSTOM_OSD_ELEMENT: 0x2101,
  MSP2_INAV_SET_CUSTOM_OSD_ELEMENTS: 0x2102,

  // MSP2 iNav servo config
  MSP2_INAV_SERVO_CONFIG: 0x2200,
  MSP2_INAV_SET_SERVO_CONFIG: 0x2201,

  // MSP2 iNav geozone
  MSP2_INAV_GEOZONE: 0x2210,
  MSP2_INAV_SET_GEOZONE: 0x2211,
  MSP2_INAV_GEOZONE_VERTEX: 0x2212,
  MSP2_INAV_SET_GEOZONE_VERTEX: 0x2213,
} as const;

// ── iNav waypoint actions ────────────────────────────────────

export const INAV_WP_ACTION = {
  WAYPOINT: 1,
  POSHOLD_UNLIM: 2,
  POSHOLD_TIME: 3,
  RTH: 4,
  SET_POI: 5,
  JUMP: 6,
  SET_HEAD: 7,
  LAND: 8,
} as const;

/** Flag value indicating last waypoint in mission. */
export const INAV_WP_FLAG_LAST = 0xa5;

// ── Decoded result types ─────────────────────────────────────

export interface INavWaypoint {
  number: number;
  action: number;
  lat: number;
  lon: number;
  altitude: number;
  p1: number;
  p2: number;
  p3: number;
  flag: number;
}

export interface INavStatus {
  cycleTime: number;
  i2cErrors: number;
  sensors: number;
  modeFlags: number;
  currentProfile: number;
  cpuLoad: number;
  armingFlags: number;
  navState: number;
  navAction: number;
}

export interface INavMisc2 {
  onTime: number;
  flyTime: number;
  lastArmTime: number;
  totalArmTime: number;
  flags: number;
}

export interface INavSafehome {
  index: number;
  enabled: boolean;
  lat: number;
  lon: number;
}

/**
 * Legacy nav config shape decoded from the 0x2100 ID.
 * This ID now collides with Custom OSD Elements in newer iNav builds.
 * Retained for backward compatibility; check INAV_MSP note above.
 */
export interface INavNavConfig {
  maxNavAltitude: number;
  maxNavSpeed: number;
  maxClimbRate: number;
  maxManualClimbRate: number;
  maxManualSpeed: number;
  landSlowdownMinAlt: number;
  landSlowdownMaxAlt: number;
  navEmergencyLandingSpeed: number;
  navMinRthDistance: number;
  navOverclimbAngle: number;
  useMidThrottleForAlthold: boolean;
  navExtraArming: number;
}

export interface INavAnalog {
  flags: number;
  /** Battery voltage in volts (divided from raw mV). */
  voltage: number;
  mAhDrawn: number;
  rssiPct: number;
  /** Current draw in amps. */
  amperage: number;
  powerMw: number;
  mWhDrawn: number;
  batteryPercent: number;
}

export interface INavMisc {
  midrc: number;
  minthrottle: number;
  maxthrottle: number;
  mincommand: number;
  failsafeThrottle: number;
  gpsProvider: number;
  gpsBaudrateIdx: number;
  gpsUbxSbas: number;
  multiwiiCurrentOutput: number;
  rssiChannel: number;
  placeholder: number;
  magDeclination: number;
  voltageScale: number;
  cellMin: number;
  cellMax: number;
  cellWarning: number;
}

export interface INavBatteryConfig {
  capacityMah: number;
  capacityWarningMah: number;
  capacityCriticalMah: number;
  capacityUnit: number;
  voltageSource: number;
  cells: number;
  cellDetect: number;
  cellMin: number;
  cellMax: number;
  cellWarning: number;
  currentScale: number;
  currentOffset: number;
}

export interface INavRateProfile {
  throttleMid: number;
  throttleExpo: number;
  dynamicThrottlePid: number;
  rcRateRoll: number;
  rcRatePitch: number;
  rcRateYaw: number;
  rcExpoRoll: number;
  rcExpoPitch: number;
  rcExpoYaw: number;
  rateRoll: number;
  ratePitch: number;
  rateYaw: number;
}

export interface INavAirSpeed {
  /** Air speed in cm/s. */
  airSpeedCmS: number;
}

export interface INavMixer {
  /** Platform type: 0=MULTIROTOR, 1=AIRPLANE, 2=TRICOPTER, 3=ROVER, 4=BOAT, 5=HELICOPTER. */
  platformType: number;
  yawMotorsReversed: boolean;
  hasFlaps: boolean;
  appliedMixerPreset: number;
  motorCount: number;
  servoCount: number;
}

export interface INavOsdLayoutsHeader {
  layoutCount: number;
  itemCount: number;
  variant: number;
}

export interface INavOsdAlarms {
  /** Raw alarm bytes (layout varies by iNav version). */
  raw: Uint8Array;
}

export interface INavOsdPreferences {
  /** Raw preference bytes (layout varies by iNav version). */
  raw: Uint8Array;
}

export interface INavMcBraking {
  speedThreshold: number;
  disengageSpeed: number;
  timeout: number;
  boostFactor: number;
  boostTimeout: number;
  boostSpeedThreshold: number;
  boostDisengage: number;
  bankAngle: number;
}

export interface INavTimerOutputModeEntry {
  timerId: number;
  mode: number;
}

export interface INavOutputMappingExt2Entry {
  timerId: number;
  usageFlags: number;
  specialLabels: number;
}

export interface INavTempSensorConfigEntry {
  type: number;
  address: number[];
  alarmMin: number;
  alarmMax: number;
  label: string;
}

export interface INavServoMixerRule {
  targetChannel: number;
  inputSource: number;
  rate: number;
  speed: number;
  conditionId: number;
}

export interface INavLogicCondition {
  enabled: boolean;
  activatorId: number;
  operation: number;
  operandAType: number;
  operandAValue: number;
  operandBType: number;
  operandBValue: number;
  flags: number;
}

export interface INavLogicConditionsStatus {
  id: number;
  value: number;
}

export interface INavGvarStatus {
  /** Array of 16 global variable values. */
  values: number[];
}

export interface INavProgrammingPid {
  enabled: boolean;
  setpointType: number;
  setpointValue: number;
  measurementType: number;
  measurementValue: number;
  gains: { P: number; I: number; D: number; FF: number };
}

export interface INavProgrammingPidStatus {
  id: number;
  output: number;
}

export interface INavPid {
  /** Axis index: 0=ROLL, 1=PITCH, 2=YAW, 3=POS_Z, 4=POS_XY, 5=VEL_XY, 6=SURFACE, 7=LEVEL, 8=HEADING, 9=VEL_Z */
  axis: number;
  P: number;
  I: number;
  D: number;
  FF: number;
}

export interface INavFwApproach {
  number: number;
  approachAlt: number;
  landAlt: number;
  approachDirection: number;
  landHeading1: number;
  landHeading2: number;
  isSeaLevelRef: boolean;
}

export interface INavRateDynamics {
  sensitivityRoll: number;
  sensitivityPitch: number;
  sensitivityYaw: number;
  correctionRoll: number;
  correctionPitch: number;
  correctionYaw: number;
  weightRoll: number;
  weightPitch: number;
  weightYaw: number;
}

export interface INavEzTune {
  enabled: boolean;
  filterHz: number;
  axisRatio: number;
  response: number;
  damping: number;
  stability: number;
  aggressiveness: number;
  rate: number;
  expo: number;
  snappiness: number;
}

export interface INavServoConfig {
  rate: number;
  min: number;
  max: number;
  middle: number;
  forwardFromChannel: number;
  reversedInputSources: number;
  flags: number;
}

export interface INavGeozone {
  number: number;
  /** 0=EXCLUSIVE, 1=INCLUSIVE */
  type: number;
  /** 0=CIRCULAR, 1=POLYGON */
  shape: number;
  minAlt: number;
  maxAlt: number;
  fenceAction: number;
  vertexCount: number;
  isSeaLevelRef: boolean;
  enabled: boolean;
}

export interface INavGeozoneVertex {
  geozoneId: number;
  vertexIdx: number;
  lat: number;
  lon: number;
}

export interface INavAdsbVehicle {
  callsign: string;
  icao: number;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  lastSeenMs: number;
  emitterType: number;
  ttlSec: number;
}

export interface INavCommonSetting {
  /** Raw bytes. Caller interprets based on SettingInfo.type. */
  raw: Uint8Array;
}

export interface INavSettingInfo {
  pgId: number;
  type: number;
  flags: number;
  min: number;
  max: number;
  absoluteMin: number;
  absoluteMax: number;
  mode: number;
  profileCount: number;
  profileIdx: number;
}

export interface INavPgList {
  pgIds: number[];
}

// ── Waypoint decoder/encoder ─────────────────────────────────

/**
 * MSP_WP (118)
 *
 * U8  number
 * U8  action (1-8, see INAV_WP_ACTION)
 * S32 lat (degrees x 1e7)
 * S32 lon (degrees x 1e7)
 * S32 altitude (cm)
 * U16 p1 (action-specific)
 * U16 p2 (action-specific)
 * U16 p3 (action-specific)
 * U8  flag (0 = not last, 0xA5 = last waypoint)
 */
export function decodeMspWp(dv: DataView): INavWaypoint {
  return {
    number: readU8(dv, 0),
    action: readU8(dv, 1),
    lat: readS32(dv, 2) / 1e7,
    lon: readS32(dv, 6) / 1e7,
    altitude: readS32(dv, 10),
    p1: readU16(dv, 14),
    p2: readU16(dv, 16),
    p3: readU16(dv, 18),
    flag: readU8(dv, 20),
  };
}

/**
 * Encode MSP_SET_WP (209) payload.
 * Same layout as the MSP_WP read response.
 */
export function encodeMspSetWp(wp: INavWaypoint): Uint8Array {
  const buf = new Uint8Array(21);
  const dv = new DataView(buf.buffer);

  dv.setUint8(0, wp.number);
  dv.setUint8(1, wp.action);
  dv.setInt32(2, Math.round(wp.lat * 1e7), true);
  dv.setInt32(6, Math.round(wp.lon * 1e7), true);
  dv.setInt32(10, wp.altitude, true);
  dv.setUint16(14, wp.p1, true);
  dv.setUint16(16, wp.p2, true);
  dv.setUint16(18, wp.p3, true);
  dv.setUint8(20, wp.flag);

  return buf;
}

// ── iNav extended status decoder ─────────────────────────────

/**
 * MSP2_INAV_STATUS (0x2000)
 *
 * U16 cycleTime
 * U16 i2cErrors
 * U16 sensors
 * U16 (reserved, skip 2 bytes)
 * U32 modeFlags
 * U8  currentProfile
 * U16 cpuLoad
 * U8  (profile count, skip)
 * U8  (rate profile, skip)
 * U32 armingFlags
 * U8  navState
 * U8  navAction
 *
 * Layout handles the common fields present in iNav 6.x+ (API 2.5+).
 */
export function decodeMspINavStatus(dv: DataView): INavStatus {
  const cycleTime = readU16(dv, 0);
  const i2cErrors = readU16(dv, 2);
  const sensors = readU16(dv, 4);
  // offset 6-7: reserved
  const modeFlags = readU32(dv, 8);
  const currentProfile = readU8(dv, 12);
  const cpuLoad = readU16(dv, 13);
  // offset 15: profile count
  // offset 16: rate profile
  const armingFlags = readU32(dv, 17);

  const navState = dv.byteLength > 21 ? readU8(dv, 21) : 0;
  const navAction = dv.byteLength > 22 ? readU8(dv, 22) : 0;

  return {
    cycleTime,
    i2cErrors,
    sensors,
    modeFlags,
    currentProfile,
    cpuLoad,
    armingFlags,
    navState,
    navAction,
  };
}

// ── iNav MISC2 decoder ───────────────────────────────────────

/**
 * MSP2_INAV_MISC2 (0x203A)
 *
 * U32 onTime (seconds)
 * U32 flyTime (seconds)
 * U32 lastArmTime (seconds)
 * U32 totalArmTime (seconds)
 * U8  flags
 */
export function decodeMspINavMisc2(dv: DataView): INavMisc2 {
  return {
    onTime: readU32(dv, 0),
    flyTime: readU32(dv, 4),
    lastArmTime: readU32(dv, 8),
    totalArmTime: readU32(dv, 12),
    flags: dv.byteLength > 16 ? readU8(dv, 16) : 0,
  };
}

// ── iNav safehome decoder/encoder ────────────────────────────

/**
 * MSP2_INAV_SAFEHOME (0x2038)
 *
 * U8  index
 * U8  enabled (bool)
 * S32 lat (degrees x 1e7)
 * S32 lon (degrees x 1e7)
 */
export function decodeMspINavSafehome(dv: DataView): INavSafehome {
  return {
    index: readU8(dv, 0),
    enabled: readU8(dv, 1) !== 0,
    lat: readS32(dv, 2) / 1e7,
    lon: readS32(dv, 6) / 1e7,
  };
}

/**
 * Encode MSP2_INAV_SET_SAFEHOME (0x2039) payload.
 */
export function encodeMspINavSetSafehome(sh: INavSafehome): Uint8Array {
  const buf = new Uint8Array(10);
  const dv = new DataView(buf.buffer);

  dv.setUint8(0, sh.index);
  dv.setUint8(1, sh.enabled ? 1 : 0);
  dv.setInt32(2, Math.round(sh.lat * 1e7), true);
  dv.setInt32(6, Math.round(sh.lon * 1e7), true);

  return buf;
}

// ── iNav NAV config decoder (legacy, 0x2100) ─────────────────

/**
 * Decodes the legacy nav-config response at ID 0x2100.
 *
 * NOTE: ID 0x2100 collides with MSP2_INAV_CUSTOM_OSD_ELEMENTS in
 * newer iNav builds. This decoder is retained for pre-7.x compatibility
 * and should not be used on builds that report Custom OSD Elements at 0x2100.
 *
 * Payload layout:
 * U32 maxNavAltitude (cm)
 * U16 maxNavSpeed (cm/s)
 * U16 maxClimbRate (cm/s)
 * U16 maxManualClimbRate (cm/s)
 * U16 maxManualSpeed (cm/s)
 * U16 landSlowdownMinAlt (cm)
 * U16 landSlowdownMaxAlt (cm)
 * U16 navEmergencyLandingSpeed (cm/s)
 * U16 navMinRthDistance (cm)
 * U8  navOverclimbAngle (degrees)
 * U8  useMidThrottleForAlthold (bool)
 * U8  navExtraArming
 */
export function decodeMspINavNavConfigLegacy(dv: DataView): INavNavConfig {
  return {
    maxNavAltitude: readU32(dv, 0),
    maxNavSpeed: readU16(dv, 4),
    maxClimbRate: readU16(dv, 6),
    maxManualClimbRate: readU16(dv, 8),
    maxManualSpeed: readU16(dv, 10),
    landSlowdownMinAlt: readU16(dv, 12),
    landSlowdownMaxAlt: readU16(dv, 14),
    navEmergencyLandingSpeed: readU16(dv, 16),
    navMinRthDistance: readU16(dv, 18),
    navOverclimbAngle: readU8(dv, 20),
    useMidThrottleForAlthold: readU8(dv, 21) !== 0,
    navExtraArming: dv.byteLength > 22 ? readU8(dv, 22) : 0,
  };
}

/**
 * Alias for the legacy nav config decoder.
 * @deprecated Use decodeMspINavNavConfigLegacy. This name existed before the ID collision was identified.
 */
export const decodeMspNavConfig = decodeMspINavNavConfigLegacy;

// ── iNav ANALOG decoder ──────────────────────────────────────

/**
 * MSP2_INAV_ANALOG (0x2002)
 *
 * U8  flags
 * U16 voltage (mV, divide by 1000 for volts)
 * U32 mAhDrawn
 * U16 rssiPct (0-100)
 * U32 amperage (mA, divide by 1000 for amps)
 * U32 powerMw
 * U32 mWhDrawn
 * U8  batteryPercent (0-100)
 */
export function decodeMspINavAnalog(dv: DataView): INavAnalog {
  return {
    flags: readU8(dv, 0),
    voltage: (dv.byteLength > 2 ? readU16(dv, 1) : 0) / 1000,
    mAhDrawn: dv.byteLength > 6 ? readU32(dv, 3) : 0,
    rssiPct: dv.byteLength > 8 ? readU16(dv, 7) : 0,
    amperage: (dv.byteLength > 12 ? readU32(dv, 9) : 0) / 1000,
    powerMw: dv.byteLength > 16 ? readU32(dv, 13) : 0,
    mWhDrawn: dv.byteLength > 20 ? readU32(dv, 17) : 0,
    batteryPercent: dv.byteLength > 21 ? readU8(dv, 21) : 0,
  };
}

// ── iNav MISC decoder ────────────────────────────────────────

/**
 * MSP2_INAV_MISC (0x2003) - iNav 7 layout.
 *
 * U16 midrc
 * U16 minthrottle
 * U16 maxthrottle
 * U16 mincommand
 * U16 failsafeThrottle
 * U8  gpsProvider
 * U8  gpsBaudrateIdx
 * U8  gpsUbxSbas
 * U8  multiwiiCurrentOutput
 * U8  rssiChannel
 * U8  placeholder
 * U16 magDeclination (tenths of degrees)
 * U8  voltageScale
 * U8  cellMin (tenths of volt)
 * U8  cellMax (tenths of volt)
 * U8  cellWarning (tenths of volt)
 */
export function decodeMspINavMisc(dv: DataView): INavMisc {
  return {
    midrc: readU16(dv, 0),
    minthrottle: readU16(dv, 2),
    maxthrottle: readU16(dv, 4),
    mincommand: readU16(dv, 6),
    failsafeThrottle: readU16(dv, 8),
    gpsProvider: dv.byteLength > 10 ? readU8(dv, 10) : 0,
    gpsBaudrateIdx: dv.byteLength > 11 ? readU8(dv, 11) : 0,
    gpsUbxSbas: dv.byteLength > 12 ? readU8(dv, 12) : 0,
    multiwiiCurrentOutput: dv.byteLength > 13 ? readU8(dv, 13) : 0,
    rssiChannel: dv.byteLength > 14 ? readU8(dv, 14) : 0,
    placeholder: dv.byteLength > 15 ? readU8(dv, 15) : 0,
    magDeclination: dv.byteLength > 17 ? readU16(dv, 16) : 0,
    voltageScale: dv.byteLength > 18 ? readU8(dv, 18) : 0,
    cellMin: dv.byteLength > 19 ? readU8(dv, 19) : 0,
    cellMax: dv.byteLength > 20 ? readU8(dv, 20) : 0,
    cellWarning: dv.byteLength > 21 ? readU8(dv, 21) : 0,
  };
}

// ── iNav BATTERY CONFIG decoder ──────────────────────────────

/**
 * MSP2_INAV_BATTERY_CONFIG (0x2005)
 *
 * U32 capacityMah
 * U32 capacityWarningMah
 * U32 capacityCriticalMah
 * U8  capacityUnit
 * U8  voltageSource
 * U8  cells
 * U8  cellDetect
 * U16 cellMin (mV)
 * U16 cellMax (mV)
 * U16 cellWarning (mV)
 * U16 currentScale
 * U16 currentOffset
 */
export function decodeMspINavBatteryConfig(dv: DataView): INavBatteryConfig {
  return {
    capacityMah: readU32(dv, 0),
    capacityWarningMah: dv.byteLength > 7 ? readU32(dv, 4) : 0,
    capacityCriticalMah: dv.byteLength > 11 ? readU32(dv, 8) : 0,
    capacityUnit: dv.byteLength > 12 ? readU8(dv, 12) : 0,
    voltageSource: dv.byteLength > 13 ? readU8(dv, 13) : 0,
    cells: dv.byteLength > 14 ? readU8(dv, 14) : 0,
    cellDetect: dv.byteLength > 15 ? readU8(dv, 15) : 0,
    cellMin: dv.byteLength > 17 ? readU16(dv, 16) : 0,
    cellMax: dv.byteLength > 19 ? readU16(dv, 18) : 0,
    cellWarning: dv.byteLength > 21 ? readU16(dv, 20) : 0,
    currentScale: dv.byteLength > 23 ? readU16(dv, 22) : 0,
    currentOffset: dv.byteLength > 25 ? readU16(dv, 24) : 0,
  };
}

// ── iNav RATE PROFILE decoder ────────────────────────────────

/**
 * MSP2_INAV_RATE_PROFILE (0x2007)
 *
 * U8  throttleMid
 * U8  throttleExpo
 * U8  dynamicThrottlePid
 * U8  rcRateRoll
 * U8  rcRatePitch
 * U8  rcRateYaw
 * U8  rcExpoRoll
 * U8  rcExpoPitch
 * U8  rcExpoYaw
 * U8  rateRoll
 * U8  ratePitch
 * U8  rateYaw
 */
export function decodeMspINavRateProfile(dv: DataView): INavRateProfile {
  return {
    throttleMid: readU8(dv, 0),
    throttleExpo: dv.byteLength > 1 ? readU8(dv, 1) : 0,
    dynamicThrottlePid: dv.byteLength > 2 ? readU8(dv, 2) : 0,
    rcRateRoll: dv.byteLength > 3 ? readU8(dv, 3) : 0,
    rcRatePitch: dv.byteLength > 4 ? readU8(dv, 4) : 0,
    rcRateYaw: dv.byteLength > 5 ? readU8(dv, 5) : 0,
    rcExpoRoll: dv.byteLength > 6 ? readU8(dv, 6) : 0,
    rcExpoPitch: dv.byteLength > 7 ? readU8(dv, 7) : 0,
    rcExpoYaw: dv.byteLength > 8 ? readU8(dv, 8) : 0,
    rateRoll: dv.byteLength > 9 ? readU8(dv, 9) : 0,
    ratePitch: dv.byteLength > 10 ? readU8(dv, 10) : 0,
    rateYaw: dv.byteLength > 11 ? readU8(dv, 11) : 0,
  };
}

// ── iNav AIR SPEED decoder ───────────────────────────────────

/**
 * MSP2_INAV_AIR_SPEED (0x2009)
 *
 * U32 airspeed (cm/s)
 */
export function decodeMspINavAirSpeed(dv: DataView): INavAirSpeed {
  return {
    airSpeedCmS: readU32(dv, 0),
  };
}

// ── iNav MIXER decoder ───────────────────────────────────────

/**
 * MSP2_INAV_MIXER (0x2010)
 *
 * U8  platformType (0=MULTIROTOR, 1=AIRPLANE, 2=TRICOPTER, 3=ROVER, 4=BOAT, 5=HELICOPTER)
 * U8  yawMotorsReversed (bool)
 * U8  hasFlaps (bool)
 * U16 appliedMixerPreset
 * U8  motorCount
 * U8  servoCount
 */
export function decodeMspINavMixer(dv: DataView): INavMixer {
  return {
    platformType: readU8(dv, 0),
    yawMotorsReversed: dv.byteLength > 1 ? readU8(dv, 1) !== 0 : false,
    hasFlaps: dv.byteLength > 2 ? readU8(dv, 2) !== 0 : false,
    appliedMixerPreset: dv.byteLength > 4 ? readU16(dv, 3) : 0,
    motorCount: dv.byteLength > 5 ? readU8(dv, 5) : 0,
    servoCount: dv.byteLength > 6 ? readU8(dv, 6) : 0,
  };
}

// ── iNav OSD decoders ────────────────────────────────────────

/**
 * MSP2_INAV_OSD_LAYOUTS (0x2012) - header only.
 *
 * U8  layoutCount
 * U8  itemCount
 * U8  variant
 */
export function decodeMspINavOsdLayoutsHeader(dv: DataView): INavOsdLayoutsHeader {
  return {
    layoutCount: readU8(dv, 0),
    itemCount: dv.byteLength > 1 ? readU8(dv, 1) : 0,
    variant: dv.byteLength > 2 ? readU8(dv, 2) : 0,
  };
}

/**
 * MSP2_INAV_OSD_ALARMS (0x2014)
 *
 * Payload layout varies by iNav version. Returns raw bytes.
 */
export function decodeMspINavOsdAlarms(dv: DataView): INavOsdAlarms {
  return { raw: new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength) };
}

/**
 * MSP2_INAV_OSD_PREFERENCES (0x2016)
 *
 * Payload layout varies by iNav version. Returns raw bytes.
 */
export function decodeMspINavOsdPreferences(dv: DataView): INavOsdPreferences {
  return { raw: new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength) };
}

// ── iNav MC BRAKING decoder ──────────────────────────────────

/**
 * MSP2_INAV_MC_BRAKING (0x200b)
 *
 * U16 speedThreshold (cm/s)
 * U16 disengageSpeed (cm/s)
 * U16 timeout (ms)
 * U8  boostFactor
 * U16 boostTimeout (ms)
 * U16 boostSpeedThreshold (cm/s)
 * U16 boostDisengage (cm/s)
 * U8  bankAngle (degrees)
 */
export function decodeMspINavMcBraking(dv: DataView): INavMcBraking {
  return {
    speedThreshold: readU16(dv, 0),
    disengageSpeed: dv.byteLength > 3 ? readU16(dv, 2) : 0,
    timeout: dv.byteLength > 5 ? readU16(dv, 4) : 0,
    boostFactor: dv.byteLength > 6 ? readU8(dv, 6) : 0,
    boostTimeout: dv.byteLength > 8 ? readU16(dv, 7) : 0,
    boostSpeedThreshold: dv.byteLength > 10 ? readU16(dv, 9) : 0,
    boostDisengage: dv.byteLength > 12 ? readU16(dv, 11) : 0,
    bankAngle: dv.byteLength > 13 ? readU8(dv, 13) : 0,
  };
}

// ── iNav TIMER OUTPUT MODE decoder ───────────────────────────

/**
 * MSP2_INAV_TIMER_OUTPUT_MODE (0x200e)
 *
 * Repeated for each timer:
 *   U8 timerId
 *   U8 mode
 */
export function decodeMspINavTimerOutputMode(dv: DataView): INavTimerOutputModeEntry[] {
  const result: INavTimerOutputModeEntry[] = [];
  let offset = 0;
  while (offset + 1 < dv.byteLength) {
    result.push({
      timerId: readU8(dv, offset),
      mode: readU8(dv, offset + 1),
    });
    offset += 2;
  }
  return result;
}

// ── iNav OUTPUT MAPPING EXT2 decoder ─────────────────────────

/**
 * MSP2_INAV_OUTPUT_MAPPING_EXT2 (0x210d)
 *
 * Repeated for each output:
 *   U8 timerId
 *   U16 usageFlags
 *   U16 specialLabels
 */
export function decodeMspINavOutputMappingExt2(dv: DataView): INavOutputMappingExt2Entry[] {
  const result: INavOutputMappingExt2Entry[] = [];
  let offset = 0;
  while (offset + 4 < dv.byteLength) {
    result.push({
      timerId: readU8(dv, offset),
      usageFlags: readU16(dv, offset + 1),
      specialLabels: readU16(dv, offset + 3),
    });
    offset += 5;
  }
  return result;
}

// ── iNav TEMP SENSOR CONFIG decoder ──────────────────────────

/**
 * MSP2_INAV_TEMP_SENSOR_CONFIG (0x201c)
 *
 * Repeated for each sensor:
 *   U8   type
 *   U8[8] address
 *   S16  alarmMin (tenths of degree C)
 *   S16  alarmMax (tenths of degree C)
 *   char[4] label (null-padded, not null-terminated)
 */
export function decodeMspINavTempSensorConfig(dv: DataView): INavTempSensorConfigEntry[] {
  const ENTRY_SIZE = 16; // 1 + 8 + 2 + 2 + 4 (but label may be 4 chars fixed)
  const result: INavTempSensorConfigEntry[] = [];
  let offset = 0;
  while (offset + ENTRY_SIZE <= dv.byteLength) {
    const type = readU8(dv, offset);
    const address: number[] = [];
    for (let i = 0; i < 8; i++) address.push(readU8(dv, offset + 1 + i));
    const alarmMin = readS16(dv, offset + 9);
    const alarmMax = readS16(dv, offset + 11);
    // 4-byte null-padded label
    let label = '';
    for (let i = 0; i < 4; i++) {
      const ch = readU8(dv, offset + 13 + i);
      if (ch !== 0) label += String.fromCharCode(ch);
    }
    result.push({ type, address, alarmMin, alarmMax, label });
    offset += ENTRY_SIZE;
  }
  return result;
}

// ── iNav TEMPERATURES decoder ────────────────────────────────

/**
 * MSP2_INAV_TEMPERATURES (0x201e)
 *
 * S16[8] temperatures (tenths of degree C; 0x8000 = sensor not present)
 */
export function decodeMspINavTemperatures(dv: DataView): number[] {
  const result: number[] = [];
  for (let i = 0; i < 8; i++) {
    result.push(dv.byteLength >= (i + 1) * 2 ? readS16(dv, i * 2) : 0x8000);
  }
  return result;
}

// ── iNav SERVO MIXER decoder ──────────────────────────────────

/**
 * MSP2_INAV_SERVO_MIXER (0x2020)
 *
 * Repeated per rule:
 *   U8  targetChannel
 *   U8  inputSource
 *   S16 rate
 *   U8  speed
 *   U8  conditionId (or -1 if none)
 */
export function decodeMspINavServoMixer(dv: DataView): INavServoMixerRule[] {
  const result: INavServoMixerRule[] = [];
  let offset = 0;
  while (offset + 5 < dv.byteLength) {
    result.push({
      targetChannel: readU8(dv, offset),
      inputSource: readU8(dv, offset + 1),
      rate: readS16(dv, offset + 2),
      speed: readU8(dv, offset + 4),
      conditionId: dv.byteLength > offset + 5 ? readU8(dv, offset + 5) : 0,
    });
    offset += 6;
  }
  return result;
}

// ── iNav LOGIC CONDITIONS decoder ────────────────────────────

/**
 * MSP2_INAV_LOGIC_CONDITIONS (0x2022)
 *
 * Repeated per condition (12 bytes each):
 *   U8  enabled
 *   U8  activatorId
 *   U8  operation
 *   U8  operandAType
 *   S32 operandAValue
 *   U8  operandBType
 *   S32 operandBValue
 *   U8  flags
 */
export function decodeMspINavLogicConditions(dv: DataView): INavLogicCondition[] {
  const result: INavLogicCondition[] = [];
  let offset = 0;
  while (offset + 12 <= dv.byteLength) {
    result.push({
      enabled: readU8(dv, offset) !== 0,
      activatorId: readU8(dv, offset + 1),
      operation: readU8(dv, offset + 2),
      operandAType: readU8(dv, offset + 3),
      operandAValue: readS32(dv, offset + 4),
      operandBType: readU8(dv, offset + 8),
      operandBValue: dv.byteLength >= offset + 13 ? readS32(dv, offset + 9) : 0,
      flags: dv.byteLength >= offset + 14 ? readU8(dv, offset + 13) : 0,
    });
    offset += 14;
  }
  return result;
}

// ── iNav LOGIC CONDITIONS STATUS decoder ─────────────────────

/**
 * MSP2_INAV_LOGIC_CONDITIONS_STATUS (0x2026)
 *
 * Repeated per condition:
 *   U8  id
 *   S32 value
 */
export function decodeMspINavLogicConditionsStatus(dv: DataView): INavLogicConditionsStatus[] {
  const result: INavLogicConditionsStatus[] = [];
  let offset = 0;
  while (offset + 4 < dv.byteLength) {
    result.push({
      id: readU8(dv, offset),
      value: readS32(dv, offset + 1),
    });
    offset += 5;
  }
  return result;
}

// ── iNav GVAR STATUS decoder ─────────────────────────────────

/**
 * MSP2_INAV_GVAR_STATUS (0x2027)
 *
 * S16[16] global variable values
 */
export function decodeMspINavGvarStatus(dv: DataView): INavGvarStatus {
  const values: number[] = [];
  for (let i = 0; i < 16; i++) {
    values.push(dv.byteLength >= (i + 1) * 2 ? readS16(dv, i * 2) : 0);
  }
  return { values };
}

// ── iNav PROGRAMMING PID decoder ─────────────────────────────

/**
 * MSP2_INAV_PROGRAMMING_PID (0x2028)
 *
 * Repeated per PID (variable size):
 *   U8  enabled
 *   U8  setpointType
 *   S32 setpointValue
 *   U8  measurementType
 *   S32 measurementValue
 *   U8  P
 *   U8  I
 *   U8  D
 *   U8  FF
 */
export function decodeMspINavProgrammingPid(dv: DataView): INavProgrammingPid[] {
  const result: INavProgrammingPid[] = [];
  let offset = 0;
  while (offset + 14 <= dv.byteLength) {
    result.push({
      enabled: readU8(dv, offset) !== 0,
      setpointType: readU8(dv, offset + 1),
      setpointValue: readS32(dv, offset + 2),
      measurementType: readU8(dv, offset + 6),
      measurementValue: readS32(dv, offset + 7),
      gains: {
        P: dv.byteLength >= offset + 15 ? readU8(dv, offset + 11) : 0,
        I: dv.byteLength >= offset + 16 ? readU8(dv, offset + 12) : 0,
        D: dv.byteLength >= offset + 17 ? readU8(dv, offset + 13) : 0,
        FF: dv.byteLength >= offset + 18 ? readU8(dv, offset + 14) : 0,
      },
    });
    offset += 15;
  }
  return result;
}

// ── iNav PROGRAMMING PID STATUS decoder ──────────────────────

/**
 * MSP2_INAV_PROGRAMMING_PID_STATUS (0x202a)
 *
 * Repeated per PID:
 *   U8  id
 *   S32 output
 */
export function decodeMspINavProgrammingPidStatus(dv: DataView): INavProgrammingPidStatus[] {
  const result: INavProgrammingPidStatus[] = [];
  let offset = 0;
  while (offset + 4 < dv.byteLength) {
    result.push({
      id: readU8(dv, offset),
      output: readS32(dv, offset + 1),
    });
    offset += 5;
  }
  return result;
}

// ── iNav PID decoder ─────────────────────────────────────────

/**
 * MSP2_INAV_PID (0x2030)
 *
 * Repeated per axis (5 bytes each):
 *   U8 P
 *   U8 I
 *   U8 D
 *   U8 FF
 *   (axis index is the iteration index: 0=ROLL...9=VEL_Z)
 *
 * Axes: 0=ROLL, 1=PITCH, 2=YAW, 3=POS_Z, 4=POS_XY, 5=VEL_XY,
 *       6=SURFACE, 7=LEVEL, 8=HEADING, 9=VEL_Z
 */
export function decodeMspINavPid(dv: DataView): INavPid[] {
  const result: INavPid[] = [];
  let offset = 0;
  let axis = 0;
  while (offset + 3 < dv.byteLength) {
    result.push({
      axis,
      P: readU8(dv, offset),
      I: readU8(dv, offset + 1),
      D: readU8(dv, offset + 2),
      FF: dv.byteLength > offset + 3 ? readU8(dv, offset + 3) : 0,
    });
    offset += 4;
    axis++;
  }
  return result;
}

// ── iNav FW APPROACH decoder ──────────────────────────────────

/**
 * MSP2_INAV_FW_APPROACH (0x204a)
 *
 * Repeated per approach:
 *   U8  number
 *   S32 approachAlt (cm)
 *   S32 landAlt (cm)
 *   U8  approachDirection
 *   S16 landHeading1 (degrees)
 *   S16 landHeading2 (degrees)
 *   U8  isSeaLevelRef (bool)
 */
export function decodeMspINavFwApproach(dv: DataView): INavFwApproach[] {
  const result: INavFwApproach[] = [];
  let offset = 0;
  while (offset + 14 <= dv.byteLength) {
    result.push({
      number: readU8(dv, offset),
      approachAlt: readS32(dv, offset + 1),
      landAlt: readS32(dv, offset + 5),
      approachDirection: readU8(dv, offset + 9),
      landHeading1: readS16(dv, offset + 10),
      landHeading2: readS16(dv, offset + 12),
      isSeaLevelRef: dv.byteLength > offset + 14 ? readU8(dv, offset + 14) !== 0 : false,
    });
    offset += 15;
  }
  return result;
}

// ── iNav RATE DYNAMICS decoder ────────────────────────────────

/**
 * MSP2_INAV_RATE_DYNAMICS (0x2060)
 *
 * U8 sensitivityRoll
 * U8 sensitivityPitch
 * U8 sensitivityYaw
 * U8 correctionRoll
 * U8 correctionPitch
 * U8 correctionYaw
 * U8 weightRoll
 * U8 weightPitch
 * U8 weightYaw
 */
export function decodeMspINavRateDynamics(dv: DataView): INavRateDynamics {
  return {
    sensitivityRoll: readU8(dv, 0),
    sensitivityPitch: dv.byteLength > 1 ? readU8(dv, 1) : 0,
    sensitivityYaw: dv.byteLength > 2 ? readU8(dv, 2) : 0,
    correctionRoll: dv.byteLength > 3 ? readU8(dv, 3) : 0,
    correctionPitch: dv.byteLength > 4 ? readU8(dv, 4) : 0,
    correctionYaw: dv.byteLength > 5 ? readU8(dv, 5) : 0,
    weightRoll: dv.byteLength > 6 ? readU8(dv, 6) : 0,
    weightPitch: dv.byteLength > 7 ? readU8(dv, 7) : 0,
    weightYaw: dv.byteLength > 8 ? readU8(dv, 8) : 0,
  };
}

// ── iNav EZ TUNE decoder ──────────────────────────────────────

/**
 * MSP2_INAV_EZ_TUNE (0x2070)
 *
 * U8  enabled
 * U16 filterHz
 * U8  axisRatio
 * U8  response
 * U8  damping
 * U8  stability
 * U8  aggressiveness
 * U8  rate
 * U8  expo
 * U8  snappiness
 */
export function decodeMspINavEzTune(dv: DataView): INavEzTune {
  return {
    enabled: readU8(dv, 0) !== 0,
    filterHz: dv.byteLength > 2 ? readU16(dv, 1) : 0,
    axisRatio: dv.byteLength > 3 ? readU8(dv, 3) : 0,
    response: dv.byteLength > 4 ? readU8(dv, 4) : 0,
    damping: dv.byteLength > 5 ? readU8(dv, 5) : 0,
    stability: dv.byteLength > 6 ? readU8(dv, 6) : 0,
    aggressiveness: dv.byteLength > 7 ? readU8(dv, 7) : 0,
    rate: dv.byteLength > 8 ? readU8(dv, 8) : 0,
    expo: dv.byteLength > 9 ? readU8(dv, 9) : 0,
    snappiness: dv.byteLength > 10 ? readU8(dv, 10) : 0,
  };
}

// ── iNav SERVO CONFIG decoder ─────────────────────────────────

/**
 * MSP2_INAV_SERVO_CONFIG (0x2200)
 *
 * Repeated per servo (10 bytes each):
 *   S16 rate
 *   S16 min
 *   S16 max
 *   S16 middle
 *   U8  forwardFromChannel
 *   U16 reversedInputSources (bitmask)
 *   U8  flags
 */
export function decodeMspINavServoConfig(dv: DataView): INavServoConfig[] {
  const result: INavServoConfig[] = [];
  let offset = 0;
  while (offset + 10 <= dv.byteLength) {
    result.push({
      rate: readS16(dv, offset),
      min: readS16(dv, offset + 2),
      max: readS16(dv, offset + 4),
      middle: readS16(dv, offset + 6),
      forwardFromChannel: readU8(dv, offset + 8),
      reversedInputSources: dv.byteLength >= offset + 11 ? readU16(dv, offset + 9) : 0,
      flags: dv.byteLength >= offset + 12 ? readU8(dv, offset + 11) : 0,
    });
    offset += 12;
  }
  return result;
}

// ── iNav GEOZONE decoder ──────────────────────────────────────

/**
 * MSP2_INAV_GEOZONE (0x2210)
 *
 * U8  number
 * U8  type (0=EXCLUSIVE, 1=INCLUSIVE)
 * U8  shape (0=CIRCULAR, 1=POLYGON)
 * S32 minAlt (cm)
 * S32 maxAlt (cm)
 * U8  fenceAction
 * U8  vertexCount
 * U8  isSeaLevelRef (bool)
 * U8  enabled (bool)
 */
export function decodeMspINavGeozone(dv: DataView): INavGeozone {
  return {
    number: readU8(dv, 0),
    type: dv.byteLength > 1 ? readU8(dv, 1) : 0,
    shape: dv.byteLength > 2 ? readU8(dv, 2) : 0,
    minAlt: dv.byteLength > 6 ? readS32(dv, 3) : 0,
    maxAlt: dv.byteLength > 10 ? readS32(dv, 7) : 0,
    fenceAction: dv.byteLength > 11 ? readU8(dv, 11) : 0,
    vertexCount: dv.byteLength > 12 ? readU8(dv, 12) : 0,
    isSeaLevelRef: dv.byteLength > 13 ? readU8(dv, 13) !== 0 : false,
    enabled: dv.byteLength > 14 ? readU8(dv, 14) !== 0 : false,
  };
}

// ── iNav GEOZONE VERTEX decoder ───────────────────────────────

/**
 * MSP2_INAV_GEOZONE_VERTEX (0x2212)
 *
 * U8  geozoneId
 * U8  vertexIdx
 * S32 lat (degrees x 1e7)
 * S32 lon (degrees x 1e7)
 */
export function decodeMspINavGeozoneVertex(dv: DataView): INavGeozoneVertex {
  return {
    geozoneId: readU8(dv, 0),
    vertexIdx: dv.byteLength > 1 ? readU8(dv, 1) : 0,
    lat: dv.byteLength > 5 ? readS32(dv, 2) / 1e7 : 0,
    lon: dv.byteLength > 9 ? readS32(dv, 6) / 1e7 : 0,
  };
}

// ── MSP2 ADSB VEHICLE LIST decoder ───────────────────────────

/**
 * MSP2_ADSB_VEHICLE_LIST (0x2090)
 *
 * Repeated per vehicle:
 *   char[9] callsign (null-terminated, max 8 chars + null)
 *   U32     icao
 *   S32     lat (degrees x 1e7)
 *   S32     lon (degrees x 1e7)
 *   S32     alt (cm)
 *   U16     heading (degrees x 10)
 *   U32     lastSeenMs
 *   U8      emitterType
 *   U8      ttlSec
 */
export function decodeMspAdsbVehicleList(dv: DataView): INavAdsbVehicle[] {
  const result: INavAdsbVehicle[] = [];
  let offset = 0;
  while (offset + 9 < dv.byteLength) {
    const [callsign, csLen] = readCString(dv, offset);
    offset += csLen;
    if (offset + 24 > dv.byteLength) break;
    result.push({
      callsign,
      icao: readU32(dv, offset),
      lat: readS32(dv, offset + 4) / 1e7,
      lon: readS32(dv, offset + 8) / 1e7,
      alt: readS32(dv, offset + 12),
      heading: readU16(dv, offset + 16) / 10,
      lastSeenMs: readU32(dv, offset + 18),
      emitterType: readU8(dv, offset + 22),
      ttlSec: readU8(dv, offset + 23),
    });
    offset += 24;
  }
  return result;
}

// ── MSP2 COMMON SETTING decoders ─────────────────────────────

/**
 * MSP2_COMMON_SETTING (0x1003) response.
 *
 * Raw bytes. Caller interprets based on the setting type from SETTING_INFO.
 */
export function decodeCommonSetting(dv: DataView): INavCommonSetting {
  return { raw: new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength) };
}

/**
 * MSP2_COMMON_SETTING_INFO (0x1007) response.
 *
 * U16 pgId
 * U8  type (0=UINT8, 1=INT8, 2=UINT16, 3=INT16, 4=UINT32, 5=INT32, 6=FLOAT, 7=STRING)
 * U8  flags
 * S32 min
 * S32 max
 * S32 absoluteMin
 * S32 absoluteMax
 * U8  mode
 * U8  profileCount
 * U8  profileIdx
 */
export function decodeCommonSettingInfo(dv: DataView): INavSettingInfo {
  return {
    pgId: readU16(dv, 0),
    type: dv.byteLength > 2 ? readU8(dv, 2) : 0,
    flags: dv.byteLength > 3 ? readU8(dv, 3) : 0,
    min: dv.byteLength > 7 ? readS32(dv, 4) : 0,
    max: dv.byteLength > 11 ? readS32(dv, 8) : 0,
    absoluteMin: dv.byteLength > 15 ? readS32(dv, 12) : 0,
    absoluteMax: dv.byteLength > 19 ? readS32(dv, 16) : 0,
    mode: dv.byteLength > 20 ? readU8(dv, 20) : 0,
    profileCount: dv.byteLength > 21 ? readU8(dv, 21) : 0,
    profileIdx: dv.byteLength > 22 ? readU8(dv, 22) : 0,
  };
}

/**
 * MSP2_COMMON_PG_LIST (0x1008) response.
 *
 * Repeated U16 pgId values.
 */
export function decodeCommonPgList(dv: DataView): INavPgList {
  const pgIds: number[] = [];
  let offset = 0;
  while (offset + 1 < dv.byteLength) {
    pgIds.push(readU16(dv, offset));
    offset += 2;
  }
  return { pgIds };
}

// ── Re-exports for backward compatibility ─────────────────────

// encodeMspSetWp is defined above (not moved to encoders file).
// encodeMspINavSetSafehome is defined above (not moved to encoders file).
// Both are also re-exported from msp-encoders-inav for callers that import from there.

// ── Unused import warning suppression ────────────────────────
// readFloat32 is used by encoders in msp-encoders-inav.ts; exported for use there.
export { readFloat32 };
