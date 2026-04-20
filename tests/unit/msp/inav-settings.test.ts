import { describe, it, expect } from 'vitest'
import { SettingType, SettingsClient, SettingsError } from '@/lib/protocol/msp/settings'
import type { MspSerialQueue } from '@/lib/protocol/msp/msp-serial-queue'
import type { ParsedMspFrame } from '@/lib/protocol/msp/msp-parser'
import { INAV_MSP } from '@/lib/protocol/msp/msp-decoders-inav'

// ── SettingType enum ──────────────────────────────────────────

describe('SettingType', () => {
  it('has expected values', () => {
    expect(SettingType.UINT8).toBe(0)
    expect(SettingType.INT8).toBe(1)
    expect(SettingType.UINT16).toBe(2)
    expect(SettingType.INT16).toBe(3)
    expect(SettingType.UINT32).toBe(4)
    expect(SettingType.INT32).toBe(5)
    expect(SettingType.FLOAT).toBe(6)
    expect(SettingType.STRING).toBe(7)
  })
})

// ── SettingsError ─────────────────────────────────────────────

describe('SettingsError', () => {
  it('stores settingName and message', () => {
    const err = new SettingsError('test error', 'nav_mc_pos_z_p')
    expect(err.message).toBe('test error')
    expect(err.settingName).toBe('nav_mc_pos_z_p')
    expect(err.name).toBe('SettingsError')
  })

  it('stores a cause', () => {
    const cause = new Error('underlying')
    const err = new SettingsError('outer', 'some_setting', cause)
    expect(err.cause).toBe(cause)
  })
})

// ── Mock queue factory ────────────────────────────────────────

function makeFrame(command: number, payload: Uint8Array): ParsedMspFrame {
  return { command, payload, version: 2, direction: 'response' }
}

function mockQueue(handler: (command: number, payload: Uint8Array | undefined) => ParsedMspFrame): MspSerialQueue {
  return {
    send(command: number, payload?: Uint8Array) {
      return Promise.resolve(handler(command, payload))
    },
    sendNoReply() {},
    flush() {},
    destroy() {},
    pending: 0,
  } as unknown as MspSerialQueue
}

// ── SettingsClient.getRaw ─────────────────────────────────────

describe('SettingsClient.getRaw', () => {
  it('sends MSP2_COMMON_SETTING with name payload', async () => {
    let sentCmd = 0
    let sentPayload: Uint8Array | undefined

    const queue = mockQueue((cmd, payload) => {
      sentCmd = cmd
      sentPayload = payload
      return makeFrame(cmd, new Uint8Array([42]))
    })

    const client = new SettingsClient(queue)
    const result = await client.getRaw('debug_mode')

    expect(sentCmd).toBe(INAV_MSP.MSP2_COMMON_SETTING)
    expect(sentPayload).toBeDefined()
    // payload should be null-terminated 'debug_mode'
    const nameStr = String.fromCharCode(...sentPayload!.subarray(0, sentPayload!.length - 1))
    expect(nameStr).toBe('debug_mode')
    expect(sentPayload![sentPayload!.length - 1]).toBe(0)
    // result is the raw bytes from the response
    expect(result[0]).toBe(42)
  })

  it('throws SettingsError on queue rejection', async () => {
    const queue = {
      send() { return Promise.reject(new Error('timeout')) },
    } as unknown as MspSerialQueue

    const client = new SettingsClient(queue)
    await expect(client.getRaw('some_setting')).rejects.toThrow(SettingsError)
  })
})

// ── SettingsClient.getInfo ────────────────────────────────────

describe('SettingsClient.getInfo', () => {
  it('sends MSP2_COMMON_SETTING_INFO and decodes pgId', async () => {
    const infoPayload = new Uint8Array(23)
    const dv = new DataView(infoPayload.buffer)
    dv.setUint16(0, 99, true)   // pgId
    dv.setUint8(2, 2)           // type: UINT16
    dv.setInt32(4, 0, true)     // min
    dv.setInt32(8, 500, true)   // max

    const queue = mockQueue((cmd) => makeFrame(cmd, infoPayload))
    const client = new SettingsClient(queue)
    const info = await client.getInfo('nav_fw_cruise_speed')

    expect(info.pgId).toBe(99)
    expect(info.type).toBe(SettingType.UINT16)
    expect(info.max).toBe(500)
  })
})

// ── SettingsClient.setRaw ─────────────────────────────────────

describe('SettingsClient.setRaw', () => {
  it('sends MSP2_COMMON_SET_SETTING with name+value payload', async () => {
    let sentCmd = 0
    let sentPayload: Uint8Array | undefined

    const queue = mockQueue((cmd, payload) => {
      sentCmd = cmd
      sentPayload = payload
      return makeFrame(cmd, new Uint8Array(0))
    })

    const client = new SettingsClient(queue)
    const name = 'osd_crosshairs'
    const rawValue = new Uint8Array([1])
    await client.setRaw(name, rawValue)

    expect(sentCmd).toBe(INAV_MSP.MSP2_COMMON_SET_SETTING)
    expect(sentPayload).toBeDefined()
    // name null-terminated then raw value
    expect(sentPayload!.byteLength).toBe(name.length + 1 + rawValue.length)
    expect(sentPayload![name.length]).toBe(0) // null terminator
    expect(sentPayload![name.length + 1]).toBe(1)
  })
})

// ── SettingsClient.getPgList ──────────────────────────────────

describe('SettingsClient.getPgList', () => {
  it('decodes a list of PG IDs from the response', async () => {
    const payload = new Uint8Array(6)
    const dv = new DataView(payload.buffer)
    dv.setUint16(0, 100, true)
    dv.setUint16(2, 200, true)
    dv.setUint16(4, 300, true)

    const queue = mockQueue((cmd) => makeFrame(cmd, payload))
    const client = new SettingsClient(queue)
    const pgIds = await client.getPgList()

    expect(pgIds).toHaveLength(3)
    expect(pgIds[0]).toBe(100)
    expect(pgIds[1]).toBe(200)
    expect(pgIds[2]).toBe(300)
  })

  it('returns empty array for empty payload', async () => {
    const queue = mockQueue((cmd) => makeFrame(cmd, new Uint8Array(0)))
    const client = new SettingsClient(queue)
    const pgIds = await client.getPgList()
    expect(pgIds).toHaveLength(0)
  })
})
