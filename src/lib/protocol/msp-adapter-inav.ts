/**
 * iNav-specific MSP adapter methods.
 *
 * Mission upload/download using MSP_WP / MSP_WP_GETINFO / MSP_SET_WP,
 * safehome read/write via MSP2_INAV_SAFEHOME / MSP2_INAV_SET_SAFEHOME,
 * and geozone read/write via MSP2_INAV_GEOZONE* / MSP2_INAV_GEOZONE_VERTEX*.
 *
 * All multi-byte MSP2 codes (>254) route through the V2 encoder automatically.
 *
 * @module protocol/msp-adapter-inav
 */

import type { CommandResult, MissionItem } from './types'
import { formatErrorMessage } from '@/lib/utils'
import type { MspSerialQueue } from './msp/msp-serial-queue'
import { INAV_MSP } from './msp/msp-decoders-inav'
import {
  decodeMspWp,
  decodeMspINavSafehome,
  decodeMspINavGeozone,
  decodeMspINavGeozoneVertex,
  decodeMspINavBatteryConfig,
  decodeMspINavMixer,
  decodeMspINavOutputMappingExt2,
  decodeMspINavTimerOutputMode,
  decodeMspINavServoConfig,
  decodeMspINavTempSensorConfig,
  decodeMspINavMcBraking,
  decodeMspINavRateDynamics,
  INAV_WP_FLAG_LAST,
  type INavWaypoint,
  type INavSafehome,
  type INavGeozone,
  type INavGeozoneVertex,
  type INavBatteryConfig,
  type INavMixer,
  type INavServoConfig,
  type INavMcBraking,
  type INavRateDynamics,
  type INavTimerOutputModeEntry,
  type INavOutputMappingExt2Entry,
  type INavTempSensorConfigEntry,
  type INavEzTune,
  type INavFwApproach,
  type INavOsdAlarms,
  type INavOsdPreferences,
  type INavOsdLayoutsHeader,
  decodeMspINavEzTune,
  decodeMspINavFwApproach,
  decodeMspINavOsdAlarms,
  decodeMspINavOsdPreferences,
  decodeMspINavOsdLayoutsHeader,
  decodeMspINavLogicConditions,
  decodeMspINavLogicConditionsStatus,
  decodeMspINavGvarStatus,
  decodeMspINavProgrammingPid,
  decodeMspINavProgrammingPidStatus,
  type INavLogicCondition,
  type INavLogicConditionsStatus,
  type INavGvarStatus,
  type INavProgrammingPid,
  type INavProgrammingPidStatus,
} from './msp/msp-decoders-inav'
import {
  encodeMspSetWp,
  encodeMspINavSetSafehome,
  encodeMspINavSetGeozone,
  encodeMspINavSetGeozoneVertex,
  encodeMspINavSetBatteryConfig,
  encodeMspINavSelectBatteryProfile,
  encodeMspINavSelectMixerProfile,
  encodeMspINavSetTimerOutputMode,
  encodeMspINavSetServoConfig,
  encodeMspINavSetMcBraking,
  encodeMspINavSetRateDynamics,
  encodeMspINavSetEzTune,
  encodeMspINavSetFwApproach,
  encodeMspINavSetOsdAlarms,
  encodeMspINavSetOsdPreferences,
  encodeMspINavSetCustomOsdElement,
  encodeMspINavSetLogicCondition,
  encodeMspINavSetProgrammingPid,
} from './msp/msp-encoders-inav'
import {
  translateToInavWaypoints,
  translateFromInavWaypoints,
} from '@/lib/mission/inav-translator'

const NOT_CONNECTED: CommandResult = { success: false, resultCode: -1, message: 'Not connected' }

// ── WP info helper ───────────────────────────────────────────

/**
 * Decode MSP_WP_GETINFO response.
 * Payload: U8 confirmationResult, U8 waypointCount, U8 validMissionCountByte, U8 currentMissionIndex
 */
function decodeWpGetInfo(payload: Uint8Array): { waypointCount: number; missionIndex: number } {
  if (payload.length < 4) return { waypointCount: 0, missionIndex: 0 }
  return {
    waypointCount: payload[1],
    missionIndex: payload[3],
  }
}

// ── Mission download ─────────────────────────────────────────

/**
 * Download a mission from the FC via MSP_WP.
 *
 * Optionally load a specific multi-mission slot first with MSP_WP_MISSION_LOAD.
 */
export async function inavDownloadMission(
  queue: MspSerialQueue | null,
  missionIndex = 0,
): Promise<MissionItem[]> {
  if (!queue) return []
  try {
    // Switch multi-mission slot if requested
    if (missionIndex > 0) {
      const loadPayload = new Uint8Array([missionIndex])
      await queue.send(INAV_MSP.MSP_WP_MISSION_LOAD, loadPayload)
    }

    // Query how many WPs are loaded
    const infoFrame = await queue.send(INAV_MSP.MSP_WP_GETINFO)
    const { waypointCount } = decodeWpGetInfo(infoFrame.payload)
    if (waypointCount === 0) return []

    const waypoints: INavWaypoint[] = []
    for (let i = 0; i < waypointCount; i++) {
      const reqPayload = new Uint8Array([i + 1]) // WP numbers are 1-based
      const frame = await queue.send(INAV_MSP.MSP_WP, reqPayload)
      const dv = new DataView(frame.payload.buffer, frame.payload.byteOffset, frame.payload.byteLength)
      waypoints.push(decodeMspWp(dv))
    }

    return translateFromInavWaypoints(waypoints)
  } catch (err) {
    console.warn('Mission download failed:', formatErrorMessage(err))
    return []
  }
}

// ── Mission upload ───────────────────────────────────────────

/**
 * Upload a mission to the FC via MSP_SET_WP.
 *
 * Optionally saves to multi-mission slot via MSP_WP_MISSION_SAVE.
 */
export async function inavUploadMission(
  queue: MspSerialQueue | null,
  items: MissionItem[],
  missionIndex = 0,
): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  if (items.length === 0) return { success: true, resultCode: 0, message: 'No waypoints to upload' }
  try {
    const waypoints = translateToInavWaypoints(items)

    // Ensure last WP is marked
    if (waypoints.length > 0) {
      waypoints[waypoints.length - 1].flag = INAV_WP_FLAG_LAST
    }

    for (const wp of waypoints) {
      const payload = encodeMspSetWp(wp)
      await queue.send(INAV_MSP.MSP_SET_WP, payload)
    }

    // Save to EEPROM / multi-mission slot
    const savePayload = new Uint8Array([missionIndex])
    await queue.send(INAV_MSP.MSP_WP_MISSION_SAVE, savePayload)

    return { success: true, resultCode: 0, message: `Uploaded ${items.length} waypoints` }
  } catch (err) {
    return { success: false, resultCode: -1, message: `Mission upload failed: ${formatErrorMessage(err)}` }
  }
}

// ── Safehome download ─────────────────────────────────────────

/** Maximum safehome slots in iNav. */
const SAFEHOME_COUNT = 16

/**
 * Download all safehome slots (0-15) from the FC.
 * Returns all 16 slots; disabled slots have enabled=false.
 */
export async function inavDownloadSafehomes(
  queue: MspSerialQueue | null,
): Promise<INavSafehome[]> {
  if (!queue) return []
  const results: INavSafehome[] = []
  try {
    for (let i = 0; i < SAFEHOME_COUNT; i++) {
      const payload = new Uint8Array([i])
      const frame = await queue.send(INAV_MSP.MSP2_INAV_SAFEHOME, payload)
      const dv = new DataView(frame.payload.buffer, frame.payload.byteOffset, frame.payload.byteLength)
      results.push(decodeMspINavSafehome(dv))
    }
    return results
  } catch (err) {
    console.warn('Safehome download failed:', formatErrorMessage(err))
    return results
  }
}

// ── Safehome upload ───────────────────────────────────────────

/**
 * Upload all 16 safehome slots to the FC.
 * If fewer than 16 are provided the remaining slots are padded with disabled entries.
 */
export async function inavUploadSafehomes(
  queue: MspSerialQueue | null,
  safehomes: INavSafehome[],
): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    // Pad to 16 with disabled slots
    const slots: INavSafehome[] = Array.from({ length: SAFEHOME_COUNT }, (_, i) => {
      return safehomes[i] ?? { index: i, enabled: false, lat: 0, lon: 0 }
    })

    for (let i = 0; i < SAFEHOME_COUNT; i++) {
      const sh = { ...slots[i], index: i }
      const payload = encodeMspINavSetSafehome(sh)
      await queue.send(INAV_MSP.MSP2_INAV_SET_SAFEHOME, payload)
    }

    return { success: true, resultCode: 0, message: `Uploaded ${SAFEHOME_COUNT} safehome slots` }
  } catch (err) {
    return { success: false, resultCode: -1, message: `Safehome upload failed: ${formatErrorMessage(err)}` }
  }
}

// ── Geozone download ──────────────────────────────────────────

/** Maximum geozone slots in iNav. */
const GEOZONE_COUNT = 15

/**
 * Download up to 15 geozones and their vertices.
 * Queries each slot by index; stops on decode error or enabled=false after first zone.
 */
export async function inavDownloadGeozones(
  queue: MspSerialQueue | null,
): Promise<{ zones: INavGeozone[]; vertices: INavGeozoneVertex[] }> {
  if (!queue) return { zones: [], vertices: [] }
  const zones: INavGeozone[] = []
  const vertices: INavGeozoneVertex[] = []
  try {
    for (let i = 0; i < GEOZONE_COUNT; i++) {
      const payload = new Uint8Array([i])
      const zoneFrame = await queue.send(INAV_MSP.MSP2_INAV_GEOZONE, payload)
      const zdv = new DataView(zoneFrame.payload.buffer, zoneFrame.payload.byteOffset, zoneFrame.payload.byteLength)
      const zone = decodeMspINavGeozone(zdv)
      zones.push(zone)

      // Fetch vertices for this zone
      for (let v = 0; v < zone.vertexCount; v++) {
        const vPayload = new Uint8Array([i, v])
        const vFrame = await queue.send(INAV_MSP.MSP2_INAV_GEOZONE_VERTEX, vPayload)
        const vdv = new DataView(vFrame.payload.buffer, vFrame.payload.byteOffset, vFrame.payload.byteLength)
        vertices.push(decodeMspINavGeozoneVertex(vdv))
      }
    }
  } catch (err) {
    console.warn('Geozone download failed:', formatErrorMessage(err))
  }
  return { zones, vertices }
}

// ── Geozone upload ────────────────────────────────────────────

/**
 * Upload zones and their vertices to the FC.
 * Sends zone metadata first, then all vertices for that zone.
 */
export async function inavUploadGeozones(
  queue: MspSerialQueue | null,
  zones: INavGeozone[],
  vertices: INavGeozoneVertex[],
): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  if (zones.length > GEOZONE_COUNT) {
    return { success: false, resultCode: -1, message: `Maximum ${GEOZONE_COUNT} geozones supported` }
  }
  try {
    for (const zone of zones) {
      const zPayload = encodeMspINavSetGeozone(zone)
      await queue.send(INAV_MSP.MSP2_INAV_SET_GEOZONE, zPayload)

      // Upload vertices belonging to this zone
      const zoneVerts = vertices.filter((v) => v.geozoneId === zone.number)
      for (const vert of zoneVerts) {
        const vPayload = encodeMspINavSetGeozoneVertex(vert)
        await queue.send(INAV_MSP.MSP2_INAV_SET_GEOZONE_VERTEX, vPayload)
      }
    }
    return { success: true, resultCode: 0, message: `Uploaded ${zones.length} geozones` }
  } catch (err) {
    return { success: false, resultCode: -1, message: `Geozone upload failed: ${formatErrorMessage(err)}` }
  }
}

// ── Battery config ────────────────────────────────────────────

function dv(payload: Uint8Array): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
}

export async function inavGetBatteryConfig(queue: MspSerialQueue | null): Promise<INavBatteryConfig> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_BATTERY_CONFIG)
  return decodeMspINavBatteryConfig(dv(frame.payload))
}

export async function inavSetBatteryConfig(queue: MspSerialQueue | null, cfg: INavBatteryConfig): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SET_BATTERY_CONFIG, encodeMspINavSetBatteryConfig(cfg))
    return { success: true, resultCode: 0, message: 'Battery config saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

export async function inavSelectBatteryProfile(queue: MspSerialQueue | null, idx: number): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SELECT_BATTERY_PROFILE, encodeMspINavSelectBatteryProfile(idx))
    return { success: true, resultCode: 0, message: `Battery profile ${idx} selected` }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── Mixer config ─────────────────────────────────────────────

export async function inavGetMixerConfig(queue: MspSerialQueue | null): Promise<INavMixer> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_MIXER)
  return decodeMspINavMixer(dv(frame.payload))
}

export async function inavSelectMixerProfile(queue: MspSerialQueue | null, idx: number): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SELECT_MIXER_PROFILE, encodeMspINavSelectMixerProfile(idx))
    return { success: true, resultCode: 0, message: `Mixer profile ${idx} selected` }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── Output mapping ───────────────────────────────────────────

export async function inavGetOutputMapping(queue: MspSerialQueue | null): Promise<INavOutputMappingExt2Entry[]> {
  if (!queue) return []
  try {
    const frame = await queue.send(INAV_MSP.MSP2_INAV_OUTPUT_MAPPING_EXT2)
    return decodeMspINavOutputMappingExt2(dv(frame.payload))
  } catch { return [] }
}

export async function inavGetTimerOutputModes(queue: MspSerialQueue | null): Promise<INavTimerOutputModeEntry[]> {
  if (!queue) return []
  try {
    const frame = await queue.send(INAV_MSP.MSP2_INAV_TIMER_OUTPUT_MODE)
    return decodeMspINavTimerOutputMode(dv(frame.payload))
  } catch { return [] }
}

export async function inavSetTimerOutputModes(queue: MspSerialQueue | null, entries: INavTimerOutputModeEntry[]): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SET_TIMER_OUTPUT_MODE, encodeMspINavSetTimerOutputMode(entries))
    return { success: true, resultCode: 0, message: 'Timer output modes saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── Servo config ─────────────────────────────────────────────

export async function inavGetServoConfigs(queue: MspSerialQueue | null): Promise<INavServoConfig[]> {
  if (!queue) return []
  try {
    const frame = await queue.send(INAV_MSP.MSP2_INAV_SERVO_CONFIG)
    return decodeMspINavServoConfig(dv(frame.payload))
  } catch { return [] }
}

export async function inavSetServoConfig(queue: MspSerialQueue | null, idx: number, cfg: INavServoConfig): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SET_SERVO_CONFIG, encodeMspINavSetServoConfig(idx, cfg))
    return { success: true, resultCode: 0, message: `Servo ${idx} config saved` }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── Temperature sensors ───────────────────────────────────────

export async function inavGetTempSensorConfigs(queue: MspSerialQueue | null): Promise<INavTempSensorConfigEntry[]> {
  if (!queue) return []
  try {
    const frame = await queue.send(INAV_MSP.MSP2_INAV_TEMP_SENSOR_CONFIG)
    return decodeMspINavTempSensorConfig(dv(frame.payload))
  } catch { return [] }
}

// ── MC braking ───────────────────────────────────────────────

export async function inavGetMcBraking(queue: MspSerialQueue | null): Promise<INavMcBraking> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_MC_BRAKING)
  return decodeMspINavMcBraking(dv(frame.payload))
}

export async function inavSetMcBraking(queue: MspSerialQueue | null, b: INavMcBraking): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SET_MC_BRAKING, encodeMspINavSetMcBraking(b))
    return { success: true, resultCode: 0, message: 'Braking config saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── Rate dynamics ────────────────────────────────────────────

export async function inavGetRateDynamics(queue: MspSerialQueue | null): Promise<INavRateDynamics> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_RATE_DYNAMICS)
  return decodeMspINavRateDynamics(dv(frame.payload))
}

export async function inavSetRateDynamics(queue: MspSerialQueue | null, r: INavRateDynamics): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SET_RATE_DYNAMICS, encodeMspINavSetRateDynamics(r))
    return { success: true, resultCode: 0, message: 'Rate dynamics saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── EZ Tune ──────────────────────────────────────────────────

export async function inavGetEzTune(queue: MspSerialQueue | null): Promise<INavEzTune> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_EZ_TUNE)
  return decodeMspINavEzTune(dv(frame.payload))
}

export async function inavSetEzTune(queue: MspSerialQueue | null, cfg: INavEzTune): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_EZ_TUNE_SET, encodeMspINavSetEzTune(cfg))
    return { success: true, resultCode: 0, message: 'EZ Tune saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── FW Approach ──────────────────────────────────────────────

export async function inavGetFwApproach(queue: MspSerialQueue | null): Promise<INavFwApproach[]> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_FW_APPROACH)
  return decodeMspINavFwApproach(dv(frame.payload))
}

export async function inavSetFwApproach(queue: MspSerialQueue | null, a: INavFwApproach): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SET_FW_APPROACH, encodeMspINavSetFwApproach(a))
    return { success: true, resultCode: 0, message: 'FW approach saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── OSD layouts / alarms / preferences ───────────────────────

export async function inavGetOsdLayoutsHeader(queue: MspSerialQueue | null): Promise<INavOsdLayoutsHeader> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_OSD_LAYOUTS)
  return decodeMspINavOsdLayoutsHeader(dv(frame.payload))
}

export async function inavGetOsdAlarms(queue: MspSerialQueue | null): Promise<INavOsdAlarms> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_OSD_ALARMS)
  return decodeMspINavOsdAlarms(dv(frame.payload))
}

export async function inavSetOsdAlarms(queue: MspSerialQueue | null, a: INavOsdAlarms): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_OSD_SET_ALARMS, encodeMspINavSetOsdAlarms(a))
    return { success: true, resultCode: 0, message: 'OSD alarms saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

export async function inavGetOsdPreferences(queue: MspSerialQueue | null): Promise<INavOsdPreferences> {
  if (!queue) throw new Error('Not connected')
  const frame = await queue.send(INAV_MSP.MSP2_INAV_OSD_PREFERENCES)
  return decodeMspINavOsdPreferences(dv(frame.payload))
}

export async function inavSetOsdPreferences(queue: MspSerialQueue | null, p: INavOsdPreferences): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_OSD_SET_PREFERENCES, encodeMspINavSetOsdPreferences(p))
    return { success: true, resultCode: 0, message: 'OSD preferences saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── Custom OSD elements ───────────────────────────────────────

export async function inavSetCustomOsdElement(
  queue: MspSerialQueue | null,
  el: { index: number; visible: boolean; text: string },
): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    await queue.send(INAV_MSP.MSP2_INAV_SET_CUSTOM_OSD_ELEMENTS, encodeMspINavSetCustomOsdElement(el))
    return { success: true, resultCode: 0, message: 'Custom OSD element saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

// ── Programming Framework ─────────────────────────────────────

export async function inavDownloadLogicConditions(queue: MspSerialQueue | null): Promise<INavLogicCondition[]> {
  if (!queue) return []
  const frame = await queue.send(INAV_MSP.MSP2_INAV_LOGIC_CONDITIONS)
  return decodeMspINavLogicConditions(dv(frame.payload))
}

export async function inavUploadLogicCondition(
  queue: MspSerialQueue | null,
  idx: number,
  rule: INavLogicCondition,
): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    const idxBuf = new Uint8Array(1)
    idxBuf[0] = idx
    const payload = new Uint8Array(1 + 14)
    payload.set(idxBuf, 0)
    payload.set(encodeMspINavSetLogicCondition(rule), 1)
    await queue.send(INAV_MSP.MSP2_INAV_SET_LOGIC_CONDITIONS, payload)
    return { success: true, resultCode: 0, message: 'Logic condition saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

export async function inavDownloadLogicConditionsStatus(queue: MspSerialQueue | null): Promise<INavLogicConditionsStatus[]> {
  if (!queue) return []
  const frame = await queue.send(INAV_MSP.MSP2_INAV_LOGIC_CONDITIONS_STATUS)
  return decodeMspINavLogicConditionsStatus(dv(frame.payload))
}

export async function inavDownloadGvarStatus(queue: MspSerialQueue | null): Promise<INavGvarStatus> {
  if (!queue) return { values: [] }
  const frame = await queue.send(INAV_MSP.MSP2_INAV_GVAR_STATUS)
  return decodeMspINavGvarStatus(dv(frame.payload))
}

export async function inavDownloadProgrammingPids(queue: MspSerialQueue | null): Promise<INavProgrammingPid[]> {
  if (!queue) return []
  const frame = await queue.send(INAV_MSP.MSP2_INAV_PROGRAMMING_PID)
  return decodeMspINavProgrammingPid(dv(frame.payload))
}

export async function inavUploadProgrammingPid(
  queue: MspSerialQueue | null,
  idx: number,
  rule: INavProgrammingPid,
): Promise<CommandResult> {
  if (!queue) return NOT_CONNECTED
  try {
    const idxBuf = new Uint8Array(1)
    idxBuf[0] = idx
    const payload = new Uint8Array(1 + 15)
    payload.set(idxBuf, 0)
    payload.set(encodeMspINavSetProgrammingPid(rule), 1)
    await queue.send(INAV_MSP.MSP2_INAV_SET_PROGRAMMING_PID, payload)
    return { success: true, resultCode: 0, message: 'Programming PID saved' }
  } catch (err) {
    return { success: false, resultCode: -1, message: formatErrorMessage(err) }
  }
}

export async function inavDownloadProgrammingPidStatus(queue: MspSerialQueue | null): Promise<INavProgrammingPidStatus[]> {
  if (!queue) return []
  const frame = await queue.send(INAV_MSP.MSP2_INAV_PROGRAMMING_PID_STATUS)
  return decodeMspINavProgrammingPidStatus(dv(frame.payload))
}
