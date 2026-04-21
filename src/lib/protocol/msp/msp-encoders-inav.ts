/**
 * iNav-specific MSP encoders.
 *
 * Encoding helpers for iNav MSP2 write commands: waypoints, safehomes,
 * geozones, battery config, misc config, and the name-based settings system.
 * Each function returns a Uint8Array that is the MSP payload (no framing).
 *
 * All multi-byte values are written little-endian to match MSP convention.
 *
 * @module protocol/msp/msp-encoders-inav
 */

import type {
  INavWaypoint,
  INavSafehome,
  INavMisc,
  INavBatteryConfig,
  INavGeozone,
  INavGeozoneVertex,
  INavServoConfig,
  INavMcBraking,
  INavRateDynamics,
  INavTimerOutputModeEntry,
  INavEzTune,
  INavFwApproach,
  INavOsdAlarms,
  INavOsdPreferences,
  INavLogicCondition,
  INavProgrammingPid,
} from './msp-decoders-inav'

// Re-export the two encoders that live in the decoders file for backward compat.
export { encodeMspSetWp, encodeMspINavSetSafehome } from './msp-decoders-inav'

// ── DataView write helpers ────────────────────────────────────

function writeU8(dv: DataView, offset: number, value: number): void {
  dv.setUint8(offset, value)
}

function writeU16(dv: DataView, offset: number, value: number): void {
  dv.setUint16(offset, value, true)
}

function writeU32(dv: DataView, offset: number, value: number): void {
  dv.setUint32(offset, value, true)
}

function writeS32(dv: DataView, offset: number, value: number): void {
  dv.setInt32(offset, value, true)
}

/** Write a null-terminated ASCII string and return total bytes written (including null). */
function writeCString(buf: Uint8Array, offset: number, str: string): number {
  for (let i = 0; i < str.length; i++) {
    buf[offset + i] = str.charCodeAt(i)
  }
  buf[offset + str.length] = 0
  return str.length + 1
}

// ── MSP2 common settings encoders ────────────────────────────

/**
 * Encode MSP2_COMMON_SETTING request payload.
 * Payload is the setting name as a null-terminated ASCII string.
 */
export function encodeCommonSetting(name: string): Uint8Array {
  const buf = new Uint8Array(name.length + 1)
  writeCString(buf, 0, name)
  return buf
}

/**
 * Encode MSP2_COMMON_SET_SETTING payload.
 * Layout: name (null-terminated string) followed immediately by rawValue bytes.
 */
export function encodeCommonSetSetting(name: string, rawValue: Uint8Array): Uint8Array {
  const nameLen = name.length + 1 // +1 for null terminator
  const buf = new Uint8Array(nameLen + rawValue.length)
  writeCString(buf, 0, name)
  buf.set(rawValue, nameLen)
  return buf
}

/**
 * Encode MSP2_COMMON_SETTING_INFO request payload.
 * Payload is the setting name as a null-terminated ASCII string.
 */
export function encodeCommonSettingInfo(name: string): Uint8Array {
  const buf = new Uint8Array(name.length + 1)
  writeCString(buf, 0, name)
  return buf
}

// ── iNav misc config encoder ─────────────────────────────────

/**
 * Encode MSP2_INAV_SET_MISC (0x2004) payload.
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
 * S16 magDeclination (degrees x 10)
 * U8  voltageScale
 * U8  cellMin (x 10)
 * U8  cellMax (x 10)
 * U8  cellWarning (x 10)
 */
export function encodeMspINavSetMisc(misc: INavMisc): Uint8Array {
  const buf = new Uint8Array(22)
  const dv = new DataView(buf.buffer)

  writeU16(dv, 0, misc.midrc)
  writeU16(dv, 2, misc.minthrottle)
  writeU16(dv, 4, misc.maxthrottle)
  writeU16(dv, 6, misc.mincommand)
  writeU16(dv, 8, misc.failsafeThrottle)
  writeU8(dv, 10, misc.gpsProvider)
  writeU8(dv, 11, misc.gpsBaudrateIdx)
  writeU8(dv, 12, misc.gpsUbxSbas)
  writeU8(dv, 13, misc.multiwiiCurrentOutput)
  writeU8(dv, 14, misc.rssiChannel)
  writeU8(dv, 15, misc.placeholder)
  writeU16(dv, 16, misc.magDeclination)
  writeU8(dv, 18, misc.voltageScale)
  writeU8(dv, 19, misc.cellMin)
  writeU8(dv, 20, misc.cellMax)
  writeU8(dv, 21, misc.cellWarning)

  return buf
}

// ── iNav battery config encoder ──────────────────────────────

/**
 * Encode MSP2_INAV_SET_BATTERY_CONFIG (0x200F) payload.
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
export function encodeMspINavSetBatteryConfig(cfg: INavBatteryConfig): Uint8Array {
  const buf = new Uint8Array(26)
  const dv = new DataView(buf.buffer)

  writeU32(dv, 0, cfg.capacityMah)
  writeU32(dv, 4, cfg.capacityWarningMah)
  writeU32(dv, 8, cfg.capacityCriticalMah)
  writeU8(dv, 12, cfg.capacityUnit)
  writeU8(dv, 13, cfg.voltageSource)
  writeU8(dv, 14, cfg.cells)
  writeU8(dv, 15, cfg.cellDetect)
  writeU16(dv, 16, cfg.cellMin)
  writeU16(dv, 18, cfg.cellMax)
  writeU16(dv, 20, cfg.cellWarning)
  writeU16(dv, 22, cfg.currentScale)
  writeU16(dv, 24, cfg.currentOffset)

  return buf
}

// ── iNav geozone encoders ────────────────────────────────────

/**
 * Encode MSP2_INAV_SET_GEOZONE (0x2203) payload.
 *
 * U8  number (geozone index)
 * U8  type   (0=EXCLUSIVE, 1=INCLUSIVE)
 * U8  shape  (0=CIRCULAR, 1=POLYGON)
 * S32 minAlt (cm)
 * S32 maxAlt (cm)
 * U8  fenceAction
 * U8  vertexCount
 * U8  isSeaLevelRef (bool)
 * U8  enabled (bool)
 */
export function encodeMspINavSetGeozone(g: INavGeozone): Uint8Array {
  const buf = new Uint8Array(14)
  const dv = new DataView(buf.buffer)

  writeU8(dv, 0, g.number)
  writeU8(dv, 1, g.type)
  writeU8(dv, 2, g.shape)
  writeS32(dv, 3, g.minAlt)
  writeS32(dv, 7, g.maxAlt)
  writeU8(dv, 11, g.fenceAction)
  writeU8(dv, 12, g.vertexCount)
  writeU8(dv, 13, g.isSeaLevelRef ? 1 : 0)
  // enabled is not part of the SET payload (controlled by vertex presence)

  return buf
}

/**
 * Encode MSP2_INAV_SET_GEOZONE_VERTEX (0x2205) payload.
 *
 * U8  geozoneId
 * U8  vertexIdx
 * S32 lat (degrees x 1e7)
 * S32 lon (degrees x 1e7)
 */
export function encodeMspINavSetGeozoneVertex(v: INavGeozoneVertex): Uint8Array {
  const buf = new Uint8Array(10)
  const dv = new DataView(buf.buffer)

  writeU8(dv, 0, v.geozoneId)
  writeU8(dv, 1, v.vertexIdx)
  writeS32(dv, 2, Math.round(v.lat * 1e7))
  writeS32(dv, 6, Math.round(v.lon * 1e7))

  return buf
}

// ── iNav profile select encoders ────────────────────────────

/**
 * Encode MSP2_INAV_SELECT_BATTERY_PROFILE (0x2012) payload.
 * Single byte: the battery profile index to activate (0-based).
 */
export function encodeMspINavSelectBatteryProfile(idx: number): Uint8Array {
  return new Uint8Array([idx & 0xff])
}

/**
 * Encode MSP2_INAV_SELECT_MIXER_PROFILE (0x200B) payload.
 * Single byte: the mixer profile index to activate (0-based).
 */
export function encodeMspINavSelectMixerProfile(idx: number): Uint8Array {
  return new Uint8Array([idx & 0xff])
}

// ── iNav servo config encoder ────────────────────────────────

/**
 * Encode MSP2_INAV_SET_SERVO_CONFIG (0x2201) payload for a single servo slot.
 *
 * U8  servoIndex
 * S16 rate
 * S16 min
 * S16 max
 * S16 middle
 * U8  forwardFromChannel
 * U16 reversedInputSources
 * U8  flags
 */
export function encodeMspINavSetServoConfig(idx: number, cfg: INavServoConfig): Uint8Array {
  const buf = new Uint8Array(12)
  const dv = new DataView(buf.buffer)

  writeU8(dv, 0, idx & 0xff)
  dv.setInt16(1, cfg.rate, true)
  dv.setInt16(3, cfg.min, true)
  dv.setInt16(5, cfg.max, true)
  dv.setInt16(7, cfg.middle, true)
  writeU8(dv, 9, cfg.forwardFromChannel)
  writeU16(dv, 10, cfg.reversedInputSources)

  return buf
}

// ── iNav MC braking encoder ──────────────────────────────────

/**
 * Encode MSP2_INAV_SET_MC_BRAKING (0x200C) payload.
 *
 * U16 speedThreshold (cm/s)
 * U16 disengageSpeed (cm/s)
 * U16 timeout        (ms)
 * U8  boostFactor
 * U16 boostTimeout   (ms)
 * U16 boostSpeedThreshold (cm/s)
 * U16 boostDisengage (cm/s)
 * U8  bankAngle      (degrees)
 */
export function encodeMspINavSetMcBraking(b: INavMcBraking): Uint8Array {
  const buf = new Uint8Array(14)
  const dv = new DataView(buf.buffer)

  writeU16(dv, 0, b.speedThreshold)
  writeU16(dv, 2, b.disengageSpeed)
  writeU16(dv, 4, b.timeout)
  writeU8(dv, 6, b.boostFactor)
  writeU16(dv, 7, b.boostTimeout)
  writeU16(dv, 9, b.boostSpeedThreshold)
  writeU16(dv, 11, b.boostDisengage)
  writeU8(dv, 13, b.bankAngle)

  return buf
}

// ── iNav rate dynamics encoder ───────────────────────────────

/**
 * Encode MSP2_INAV_SET_RATE_DYNAMICS (0x2061) payload.
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
export function encodeMspINavSetRateDynamics(r: INavRateDynamics): Uint8Array {
  return new Uint8Array([
    r.sensitivityRoll,
    r.sensitivityPitch,
    r.sensitivityYaw,
    r.correctionRoll,
    r.correctionPitch,
    r.correctionYaw,
    r.weightRoll,
    r.weightPitch,
    r.weightYaw,
  ])
}

// ── iNav timer output mode encoder ───────────────────────────

/**
 * Encode MSP2_INAV_SET_TIMER_OUTPUT_MODE (0x200F) payload.
 * Repeated pairs of U8 timerId + U8 mode for each entry.
 */
export function encodeMspINavSetTimerOutputMode(entries: INavTimerOutputModeEntry[]): Uint8Array {
  const buf = new Uint8Array(entries.length * 2)
  entries.forEach((e, i) => {
    buf[i * 2] = e.timerId & 0xff
    buf[i * 2 + 1] = e.mode & 0xff
  })
  return buf
}

// ── iNav polish encoders ──────────────────────────────────────

/**
 * Encode MSP2_INAV_EZ_TUNE_SET (0x2071) payload.
 *
 * U8  enabled (0/1)
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
export function encodeMspINavSetEzTune(cfg: INavEzTune): Uint8Array {
  const buf = new Uint8Array(11)
  const dv = new DataView(buf.buffer)
  writeU8(dv, 0, cfg.enabled ? 1 : 0)
  writeU16(dv, 1, Math.round(cfg.filterHz))
  writeU8(dv, 3, Math.round(cfg.axisRatio))
  writeU8(dv, 4, Math.round(cfg.response))
  writeU8(dv, 5, Math.round(cfg.damping))
  writeU8(dv, 6, Math.round(cfg.stability))
  writeU8(dv, 7, Math.round(cfg.aggressiveness))
  writeU8(dv, 8, Math.round(cfg.rate))
  writeU8(dv, 9, Math.round(cfg.expo))
  writeU8(dv, 10, Math.round(cfg.snappiness))
  return buf
}

/**
 * Encode MSP2_INAV_SET_FW_APPROACH (0x204b) payload.
 *
 * Per approach slot (15 bytes each):
 *   U8  number
 *   S32 approachAlt (cm)
 *   S32 landAlt (cm)
 *   U8  approachDirection
 *   S16 landHeading1
 *   S16 landHeading2
 *   U8  isSeaLevelRef (0/1)
 */
export function encodeMspINavSetFwApproach(a: INavFwApproach): Uint8Array {
  const buf = new Uint8Array(15)
  const dv = new DataView(buf.buffer)
  writeU8(dv, 0, a.number & 0xff)
  writeS32(dv, 1, a.approachAlt)
  writeS32(dv, 5, a.landAlt)
  writeU8(dv, 9, a.approachDirection & 0xff)
  dv.setInt16(10, a.landHeading1, true)
  dv.setInt16(12, a.landHeading2, true)
  writeU8(dv, 14, a.isSeaLevelRef ? 1 : 0)
  return buf
}

/**
 * Encode MSP2_INAV_OSD_SET_ALARMS (0x2015) payload.
 *
 * Passes through raw bytes as decoded from the FC.
 * The payload layout is iNav-version-specific; we store and restore
 * the raw bytes without reinterpreting them.
 */
export function encodeMspINavSetOsdAlarms(a: INavOsdAlarms): Uint8Array {
  return new Uint8Array(a.raw)
}

/**
 * Encode MSP2_INAV_OSD_SET_PREFERENCES (0x2017) payload.
 *
 * Passes through raw bytes as decoded from the FC.
 * The payload layout is iNav-version-specific; we store and restore
 * the raw bytes without reinterpreting them.
 */
export function encodeMspINavSetOsdPreferences(p: INavOsdPreferences): Uint8Array {
  return new Uint8Array(p.raw)
}

/**
 * Encode MSP2_INAV_SET_CUSTOM_OSD_ELEMENTS (0x2102) payload for one element.
 *
 * U8  index
 * U8  visible (0/1)
 * 16 bytes ASCII text (null-padded, not null-terminated in strict sense)
 */
export function encodeMspINavSetCustomOsdElement(el: {
  index: number
  visible: boolean
  text: string
}): Uint8Array {
  const TEXT_LEN = 16
  const buf = new Uint8Array(2 + TEXT_LEN)
  buf[0] = el.index & 0xff
  buf[1] = el.visible ? 1 : 0
  const truncated = el.text.slice(0, TEXT_LEN)
  for (let i = 0; i < truncated.length; i++) {
    buf[2 + i] = truncated.charCodeAt(i) & 0x7f
  }
  return buf
}

// ── iNav logic condition encoder ──────────────────────────────

/**
 * Encode MSP2_INAV_SET_LOGIC_CONDITIONS (0x2023) payload for one condition slot.
 *
 * U8  enabled
 * U8  activatorId
 * U8  operation
 * U8  operandAType
 * S32 operandAValue
 * U8  operandBType
 * S32 operandBValue
 * U8  flags
 *
 * 14 bytes total. Mirrors the decoder layout in decodeMspINavLogicConditions.
 */
export function encodeMspINavSetLogicCondition(rule: INavLogicCondition): Uint8Array {
  const buf = new Uint8Array(14)
  const dv = new DataView(buf.buffer)

  writeU8(dv, 0, rule.enabled ? 1 : 0)
  writeU8(dv, 1, rule.activatorId)
  writeU8(dv, 2, rule.operation)
  writeU8(dv, 3, rule.operandAType)
  writeS32(dv, 4, rule.operandAValue)
  writeU8(dv, 8, rule.operandBType)
  writeS32(dv, 9, rule.operandBValue)
  writeU8(dv, 13, rule.flags)

  return buf
}

// ── iNav programming PID encoder ──────────────────────────────

/**
 * Encode MSP2_INAV_SET_PROGRAMMING_PID (0x2029) payload for one PID slot.
 *
 * U8  enabled
 * U8  setpointType
 * S32 setpointValue
 * U8  measurementType
 * S32 measurementValue
 * U8  P
 * U8  I
 * U8  D
 * U8  FF
 *
 * 15 bytes total. Mirrors the decoder layout in decodeMspINavProgrammingPid.
 */
export function encodeMspINavSetProgrammingPid(rule: INavProgrammingPid): Uint8Array {
  const buf = new Uint8Array(15)
  const dv = new DataView(buf.buffer)

  writeU8(dv, 0, rule.enabled ? 1 : 0)
  writeU8(dv, 1, rule.setpointType)
  writeS32(dv, 2, rule.setpointValue)
  writeU8(dv, 6, rule.measurementType)
  writeS32(dv, 7, rule.measurementValue)
  writeU8(dv, 11, rule.gains.P)
  writeU8(dv, 12, rule.gains.I)
  writeU8(dv, 13, rule.gains.D)
  writeU8(dv, 14, rule.gains.FF)

  return buf
}
