/**
 * Synthetic DroneCAN bus for demo mode.
 *
 * Simulates 4 realistic DroneCAN nodes that periodically publish
 * telemetry on CAN bus 0. The frames are fed into the mock protocol
 * via `emitCanFrame` and show up in the CAN Monitor panel with decoded
 * labels (see `src/lib/can/known-ids.ts`).
 *
 * This is NOT a DSDL encoder — it fabricates plausible payload bytes
 * so the monitor has something to display. Real DroneCAN decoding is
 * not required for a viewer.
 *
 * @license GPL-3.0-only
 */

import type { MockProtocol } from "./mock-protocol";

/** DroneCAN priority levels (lower = higher priority). */
const PRIORITY_NORMAL = 20;
const PRIORITY_HIGH = 5;

/**
 * Build a 29-bit DroneCAN message frame ID.
 *
 * Layout (bit 0 = LSB):
 *   0..6   source node ID (7 bits)
 *   7      service_not_message (0 = message)
 *   8..23  data type ID (16 bits)
 *   24..28 priority (5 bits)
 */
function buildMessageFrameId(
  sourceNodeId: number,
  dataTypeId: number,
  priority = PRIORITY_NORMAL,
): number {
  return (
    (sourceNodeId & 0x7f) |
    (0 << 7) |
    ((dataTypeId & 0xffff) << 8) |
    ((priority & 0x1f) << 24)
  );
}

interface CanNode {
  /** DroneCAN node ID (1..127). */
  nodeId: number;
  /** Human-readable name. */
  name: string;
  /** Short category shown in the monitor sidebar. */
  category: "ESC" | "GPS" | "Airspeed" | "Power" | "FC";
  /** Millis between frame bursts for this node. */
  periodMs: number;
  /** Next tick timestamp (millis) when this node should emit. */
  nextEmitMs: number;
  /** Frame builder — returns zero or more frames to emit. */
  buildFrames: (t: number, node: CanNode) => MockCanFrame[];
}

export interface MockCanFrame {
  id: number;
  bus: number;
  len: number;
  data: Uint8Array;
}

/** Fill a buffer with pseudo-random but stable bytes for a given tag. */
function fillBytes(buf: Uint8Array, seed: number): void {
  let x = seed >>> 0;
  for (let i = 0; i < buf.length; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    buf[i] = x & 0xff;
  }
}

/** Pack a float32 little-endian into the first 4 bytes. */
function packFloat32LE(buf: Uint8Array, offset: number, value: number): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setFloat32(offset, value, true);
}

/** Pack a uint16 little-endian. */
function packU16LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
}

// ── Frame builders for each node type ──────────────────────────────

/** ESC node: emits ESC Status + ESC RPM for 4 motors at 50 Hz. */
function buildEscFrames(t: number, node: CanNode): MockCanFrame[] {
  const frames: MockCanFrame[] = [];
  const baseRpm = 8000 + Math.sin(t / 500) * 800;

  for (let motor = 0; motor < 4; motor++) {
    // ESC Status (data type 1030)
    const status = new Uint8Array(8);
    const rpm = Math.round(baseRpm + motor * 40);
    const voltage = 15.8 + Math.random() * 0.3;
    const current = 6 + Math.random() * 2 + motor * 0.3;
    const temp = 42 + Math.random() * 4;
    packU16LE(status, 0, rpm & 0xffff);
    packU16LE(status, 2, Math.round(voltage * 100));
    packU16LE(status, 4, Math.round(current * 100));
    status[6] = Math.round(temp);
    status[7] = motor;
    frames.push({
      id: buildMessageFrameId(node.nodeId, 1030),
      bus: 0,
      len: 8,
      data: status,
    });
  }
  return frames;
}

/** GPS node: emits GNSS Fix2 at 5 Hz. */
function buildGpsFrames(t: number, node: CanNode): MockCanFrame[] {
  const buf = new Uint8Array(8);
  // Lat: 12.9716 (Bangalore), jitter ~2m
  const lat = 12.9716 + (Math.sin(t / 2000) * 2e-5);
  const lon = 77.5946 + (Math.cos(t / 2000) * 2e-5);
  packFloat32LE(buf, 0, lat);
  packFloat32LE(buf, 4, lon);
  return [
    {
      id: buildMessageFrameId(node.nodeId, 1061),
      bus: 0,
      len: 8,
      data: buf,
    },
  ];
}

/** Airspeed node: emits airspeed + static pressure at 10 Hz. */
function buildAirspeedFrames(t: number, node: CanNode): MockCanFrame[] {
  const airspeedBuf = new Uint8Array(8);
  const pressureBuf = new Uint8Array(8);
  const airspeed = 14 + Math.sin(t / 800) * 2;
  const pressure = 96500 + Math.random() * 50;
  packFloat32LE(airspeedBuf, 0, airspeed);
  packFloat32LE(airspeedBuf, 4, 0.5); // variance
  packFloat32LE(pressureBuf, 0, pressure);
  packFloat32LE(pressureBuf, 4, 25); // temp
  return [
    { id: buildMessageFrameId(node.nodeId, 1027), bus: 0, len: 8, data: airspeedBuf },
    { id: buildMessageFrameId(node.nodeId, 1028), bus: 0, len: 8, data: pressureBuf },
  ];
}

/** Power node: emits battery info at 5 Hz. */
function buildPowerFrames(t: number, node: CanNode): MockCanFrame[] {
  const buf = new Uint8Array(8);
  const voltage = 22.2 - (t % 300000) * 0.000008;
  const current = 24 + Math.random() * 4;
  packFloat32LE(buf, 0, voltage);
  packFloat32LE(buf, 4, current);
  return [
    {
      id: buildMessageFrameId(node.nodeId, 1092),
      bus: 0,
      len: 8,
      data: buf,
    },
  ];
}

/** Flight controller: emits NodeStatus heartbeat at 1 Hz per node. */
function buildNodeStatus(t: number, node: CanNode): MockCanFrame[] {
  const buf = new Uint8Array(7);
  const uptime = Math.floor(t / 1000);
  buf[0] = uptime & 0xff;
  buf[1] = (uptime >>> 8) & 0xff;
  buf[2] = (uptime >>> 16) & 0xff;
  buf[3] = (uptime >>> 24) & 0xff;
  buf[4] = 0; // health OK
  buf[5] = 2; // mode OPERATIONAL
  buf[6] = 0; // sub-mode
  return [
    {
      id: buildMessageFrameId(node.nodeId, 341, PRIORITY_HIGH),
      bus: 0,
      len: 7,
      data: buf,
    },
  ];
}

// ── Node registry ─────────────────────────────────────────────────

export interface CanNodeSummary {
  nodeId: number;
  name: string;
  category: CanNode["category"];
  framesPerSecond: number;
  lastSeen: number;
}

export class MockCanBus {
  private nodes: CanNode[] = [];
  private frameCountWindow = new Map<number, number>();
  private windowStartMs = 0;
  private nodeFps = new Map<number, number>();
  private lastSeen = new Map<number, number>();

  constructor() {
    this.nodes = [
      {
        nodeId: 10,
        name: "ESC Controller",
        category: "ESC",
        periodMs: 20, // 50 Hz
        nextEmitMs: 0,
        buildFrames: buildEscFrames,
      },
      {
        nodeId: 11,
        name: "Here3 GPS",
        category: "GPS",
        periodMs: 200, // 5 Hz
        nextEmitMs: 0,
        buildFrames: buildGpsFrames,
      },
      {
        nodeId: 12,
        name: "Airspeed Sensor",
        category: "Airspeed",
        periodMs: 100, // 10 Hz
        nextEmitMs: 0,
        buildFrames: buildAirspeedFrames,
      },
      {
        nodeId: 13,
        name: "Power Monitor",
        category: "Power",
        periodMs: 200, // 5 Hz
        nextEmitMs: 0,
        buildFrames: buildPowerFrames,
      },
    ];
  }

  /** Run one tick of the simulator and emit frames via the given protocol. */
  tick(protocol: MockProtocol, now: number): void {
    // NodeStatus heartbeat every 1 s per node.
    for (const node of this.nodes) {
      if (now % 1000 < 50) {
        for (const f of buildNodeStatus(now, node)) {
          this.emit(protocol, f, now);
        }
      }
      if (now >= node.nextEmitMs) {
        for (const f of node.buildFrames(now, node)) {
          this.emit(protocol, f, now);
        }
        node.nextEmitMs = now + node.periodMs;
      }
    }

    // FPS rolling window (1s).
    if (now - this.windowStartMs >= 1000) {
      this.nodeFps = new Map(this.frameCountWindow);
      this.frameCountWindow.clear();
      this.windowStartMs = now;
    }
  }

  private emit(protocol: MockProtocol, frame: MockCanFrame, now: number): void {
    protocol.emitCanFrame({
      timestamp: now,
      bus: frame.bus,
      len: frame.len,
      targetSystem: 1,
      targetComponent: 1,
      id: frame.id,
      data: frame.data,
    });
    // Attribute the frame to its source node for per-node FPS.
    const sourceNodeId = frame.id & 0x7f;
    this.frameCountWindow.set(
      sourceNodeId,
      (this.frameCountWindow.get(sourceNodeId) ?? 0) + 1,
    );
    this.lastSeen.set(sourceNodeId, now);
  }

  /** Snapshot of the simulated nodes + their live frame rates. */
  getNodeSummaries(): CanNodeSummary[] {
    return this.nodes.map((n) => ({
      nodeId: n.nodeId,
      name: n.name,
      category: n.category,
      framesPerSecond: this.nodeFps.get(n.nodeId) ?? 0,
      lastSeen: this.lastSeen.get(n.nodeId) ?? 0,
    }));
  }

  /** Reset to initial state (used on engine stop). */
  reset(): void {
    this.frameCountWindow.clear();
    this.nodeFps.clear();
    this.lastSeen.clear();
    this.windowStartMs = 0;
    for (const n of this.nodes) n.nextEmitMs = 0;
    // Silence unused-import complaints in narrow builds.
    void fillBytes;
  }
}

/** Singleton for easy access from CanMonitorPanel sidebar. */
export const mockCanBus = new MockCanBus();

// ── Mock DroneCAN client (demo-mode wiring) ──────────────────────────
//
// The block below adds a thin in-memory model of three synthetic DroneCAN
// nodes (a regular AP_Periph node, a bootloader-only node, and a peripheral
// with warning health) plus a `MockDroneCanBus` class whose surface matches
// the methods that the GCS calls on `DroneCanClient`. Tests and the demo
// engine can construct it directly and feed status into the stores.

import { useDroneCanNodeStore } from "@/stores/dronecan/node-store";
import {
  HEALTH_OK,
  HEALTH_WARNING,
  MODE_INITIALIZATION,
  MODE_MAINTENANCE,
  MODE_OPERATIONAL,
  MODE_SOFTWARE_UPDATE,
  type NodeHealth,
  type NodeMode,
  type NodeStatus,
} from "@/lib/dronecan/dsdl/node-status";
import type { GetNodeInfoResponse } from "@/lib/dronecan/dsdl/get-node-info";
import {
  ValueTag,
  type Value as ParamValueRaw,
  type ParamGetSetResponse,
} from "@/lib/dronecan/dsdl/param-getset";
import type { ParamExecuteOpcodeResponse } from "@/lib/dronecan/dsdl/param-executeopcode";
import type { RestartNodeResponse } from "@/lib/dronecan/dsdl/restart-node";
import type {
  BeginFirmwareUpdateResponse,
} from "@/lib/dronecan/dsdl/begin-firmware-update";
import type { GetTransportStatsResponse } from "@/lib/dronecan/dsdl/get-transport-stats";

interface MockNodeParam {
  name: string;
  value: ParamValueRaw;
  min?: ParamValueRaw;
  max?: ParamValueRaw;
  default?: ParamValueRaw;
}

interface MockDroneCanNode {
  nodeId: number;
  name: string;
  hwMajor: number;
  hwMinor: number;
  swMajor: number;
  swMinor: number;
  baseUptimeMs: number;
  health: NodeHealth;
  mode: NodeMode;
  params: MockNodeParam[];
  uniqueId: Uint8Array;
}

function mkUniqueId(seed: number): Uint8Array {
  const out = new Uint8Array(16);
  let x = (seed * 2654435761) >>> 0;
  for (let i = 0; i < 16; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out[i] = x & 0xff;
  }
  return out;
}

function intV(v: number): ParamValueRaw {
  return { tag: ValueTag.Integer, value: BigInt(v) };
}
function realV(v: number): ParamValueRaw {
  return { tag: ValueTag.Real, value: v };
}
function boolV(v: boolean): ParamValueRaw {
  return { tag: ValueTag.Boolean, value: v };
}

function defaultParamsApPeriph(): MockNodeParam[] {
  return [
    { name: "UAVCAN_NODE_ID", value: intV(11), min: intV(1), max: intV(125), default: intV(11) },
    { name: "GPS_TYPE", value: intV(9), min: intV(0), max: intV(28), default: intV(0) },
    { name: "GPS_DELAY_MS", value: intV(200), min: intV(0), max: intV(1000), default: intV(0) },
    { name: "FLASH_BOOTLOADER", value: intV(0), min: intV(0), max: intV(1), default: intV(0) },
    { name: "MAG_ENABLE", value: boolV(true), default: boolV(true) },
    { name: "BARO_ENABLE", value: boolV(true), default: boolV(true) },
    { name: "BAUD_RATE", value: intV(115200), min: intV(9600), max: intV(2000000), default: intV(115200) },
    { name: "BCN_ENABLE", value: boolV(false), default: boolV(false) },
  ];
}

function defaultParamsBootloader(): MockNodeParam[] {
  return [
    { name: "UAVCAN_NODE_ID", value: intV(14), min: intV(1), max: intV(125), default: intV(14) },
    { name: "FLASH_BOOTLOADER", value: intV(1), min: intV(0), max: intV(1), default: intV(0) },
  ];
}

function defaultParamsMatekPeriph(): MockNodeParam[] {
  return [
    { name: "UAVCAN_NODE_ID", value: intV(22), min: intV(1), max: intV(125), default: intV(22) },
    { name: "AIRSPEED_TYPE", value: intV(8), min: intV(0), max: intV(20), default: intV(0) },
    { name: "AIRSPEED_OFFSET", value: realV(0.0), min: realV(-5), max: realV(5), default: realV(0) },
    { name: "POWER_VOLT_DIVIDER", value: realV(10.1), min: realV(1), max: realV(100), default: realV(10.0) },
    { name: "POWER_AMP_PER_V", value: realV(40.0), min: realV(1), max: realV(100), default: realV(40.0) },
    { name: "TEMP_OFFSET", value: realV(-1.5), min: realV(-50), max: realV(50), default: realV(0) },
  ];
}

interface PendingFirmwareUpdate {
  nodeId: number;
  startedAt: number;
  durationMs: number;
}

export class MockDroneCanBus {
  private nodes: MockDroneCanNode[];
  private startedAt = Date.now();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingFw: PendingFirmwareUpdate | null = null;
  private transferCounts = new Map<number, bigint>();

  constructor() {
    this.nodes = [
      {
        nodeId: 11,
        name: "org.ardupilot.ap_periph",
        hwMajor: 1,
        hwMinor: 2,
        swMajor: 1,
        swMinor: 4,
        baseUptimeMs: 0,
        health: HEALTH_OK,
        mode: MODE_OPERATIONAL,
        params: defaultParamsApPeriph(),
        uniqueId: mkUniqueId(11),
      },
      {
        nodeId: 14,
        name: "bootloader",
        hwMajor: 1,
        hwMinor: 0,
        swMajor: 0,
        swMinor: 1,
        baseUptimeMs: 0,
        health: HEALTH_OK,
        mode: MODE_MAINTENANCE,
        params: defaultParamsBootloader(),
        uniqueId: mkUniqueId(14),
      },
      {
        nodeId: 22,
        name: "com.matek.h743.periph",
        hwMajor: 2,
        hwMinor: 1,
        swMajor: 0,
        swMinor: 9,
        baseUptimeMs: 0,
        health: HEALTH_WARNING,
        mode: MODE_OPERATIONAL,
        params: defaultParamsMatekPeriph(),
        uniqueId: mkUniqueId(22),
      },
    ];
  }

  /** Begin emitting NodeStatus broadcasts into the global node store. */
  start(): void {
    if (this.heartbeatTimer !== null) return;
    this.startedAt = Date.now();
    const beat = () => {
      const store = useDroneCanNodeStore.getState();
      // Advance the simulated firmware-update state machine before emitting.
      this.advanceFirmwareUpdate();
      for (const n of this.nodes) {
        const status: NodeStatus = {
          uptime_sec: Math.floor((Date.now() - this.startedAt + n.baseUptimeMs) / 1000),
          health: n.health,
          mode: n.mode,
          vendor_specific_status_code: 0,
        };
        store.upsertStatus(n.nodeId, status);
        if (!store.getNode(n.nodeId)?.nodeInfo) {
          store.setNodeInfo(n.nodeId, this.buildNodeInfo(n));
        }
        this.transferCounts.set(
          n.nodeId,
          (this.transferCounts.get(n.nodeId) ?? BigInt(0)) + BigInt(1),
        );
      }
    };
    beat();
    this.heartbeatTimer = setInterval(beat, 800);
  }

  /** Stop emitting NodeStatus broadcasts. Idempotent. */
  stop(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  getNodeIds(): number[] {
    return this.nodes.map((n) => n.nodeId);
  }

  private findNode(nodeId: number): MockDroneCanNode | undefined {
    return this.nodes.find((n) => n.nodeId === nodeId);
  }

  private buildNodeInfo(n: MockDroneCanNode): GetNodeInfoResponse {
    const status: NodeStatus = {
      uptime_sec: Math.floor((Date.now() - this.startedAt + n.baseUptimeMs) / 1000),
      health: n.health,
      mode: n.mode,
      vendor_specific_status_code: 0,
    };
    return {
      status,
      software_version: {
        major: n.swMajor,
        minor: n.swMinor,
        optional_field_flags: 0,
        vcs_commit: 0,
        image_crc: BigInt(0),
      },
      hardware_version: {
        major: n.hwMajor,
        minor: n.hwMinor,
        unique_id: n.uniqueId,
        certificate_of_authenticity: new Uint8Array(0),
      },
      name: n.name,
    };
  }

  // ── DroneCanClient surface ────────────────────────────────

  async getNodeInfo(nodeId: number): Promise<GetNodeInfoResponse> {
    const n = this.findNode(nodeId);
    if (!n) throw new Error(`unknown node ${nodeId}`);
    return this.buildNodeInfo(n);
  }

  async paramGet(nodeId: number, index: number): Promise<ParamGetSetResponse> {
    const n = this.findNode(nodeId);
    if (!n) throw new Error(`unknown node ${nodeId}`);
    const p = n.params[index];
    if (!p) {
      return {
        value: { tag: ValueTag.Empty },
        default_value: { tag: ValueTag.Empty },
        max_value: { tag: ValueTag.Empty },
        min_value: { tag: ValueTag.Empty },
        name: "",
      };
    }
    return {
      value: p.value,
      default_value: p.default ?? { tag: ValueTag.Empty },
      max_value: p.max ?? { tag: ValueTag.Empty },
      min_value: p.min ?? { tag: ValueTag.Empty },
      name: p.name,
    };
  }

  async paramSet(
    nodeId: number,
    name: string,
    value: ParamValueRaw,
  ): Promise<ParamGetSetResponse> {
    const n = this.findNode(nodeId);
    if (!n) throw new Error(`unknown node ${nodeId}`);
    const p = n.params.find((q) => q.name === name);
    if (!p) {
      return {
        value: { tag: ValueTag.Empty },
        default_value: { tag: ValueTag.Empty },
        max_value: { tag: ValueTag.Empty },
        min_value: { tag: ValueTag.Empty },
        name: "",
      };
    }
    p.value = value;
    // Mock echoes the new value back, matching real-node semantics.
    return {
      value,
      default_value: p.default ?? { tag: ValueTag.Empty },
      max_value: p.max ?? { tag: ValueTag.Empty },
      min_value: p.min ?? { tag: ValueTag.Empty },
      name,
    };
  }

  async paramExecuteOpcode(
    nodeId: number,
    opcode: 0 | 1 | number,
  ): Promise<ParamExecuteOpcodeResponse> {
    const n = this.findNode(nodeId);
    if (!n) throw new Error(`unknown node ${nodeId}`);
    if (opcode === 1) {
      // ERASE: restore defaults
      for (const p of n.params) {
        if (p.default) p.value = p.default;
      }
    }
    return { argument: BigInt(0), ok: true };
  }

  async restart(nodeId: number): Promise<RestartNodeResponse> {
    const n = this.findNode(nodeId);
    if (!n) throw new Error(`unknown node ${nodeId}`);
    // Simulate uptime reset: shift baseUptimeMs back to "now".
    n.baseUptimeMs = -(Date.now() - this.startedAt);
    return { ok: true };
  }

  async beginFirmwareUpdate(
    targetNodeId: number,
    _sourceNodeId: number,
    _imagePath: string,
  ): Promise<BeginFirmwareUpdateResponse> {
    const n = this.findNode(targetNodeId);
    if (!n) throw new Error(`unknown node ${targetNodeId}`);
    n.mode = MODE_SOFTWARE_UPDATE;
    this.pendingFw = {
      nodeId: targetNodeId,
      startedAt: Date.now(),
      durationMs: 3_000,
    };
    return { error: 0, optional_error_message: "" };
  }

  async getTransportStats(nodeId: number): Promise<GetTransportStatsResponse> {
    const n = this.findNode(nodeId);
    if (!n) throw new Error(`unknown node ${nodeId}`);
    const transfers = this.transferCounts.get(nodeId) ?? BigInt(0);
    return {
      transfer_count: transfers,
      message_count: transfers,
      error_count: BigInt(0),
      can_iface_stats: [
        { frames_tx: transfers, frames_rx: transfers * BigInt(2), errors: BigInt(0) },
      ],
    };
  }

  /**
   * Tick the firmware-update simulator. Switches mode through
   * SOFTWARE_UPDATE → INITIALIZATION → OPERATIONAL.
   */
  private advanceFirmwareUpdate(): void {
    if (!this.pendingFw) return;
    const elapsed = Date.now() - this.pendingFw.startedAt;
    const n = this.findNode(this.pendingFw.nodeId);
    if (!n) {
      this.pendingFw = null;
      return;
    }
    if (elapsed > this.pendingFw.durationMs * 1.5) {
      n.mode = MODE_OPERATIONAL;
      this.pendingFw = null;
    } else if (elapsed > this.pendingFw.durationMs) {
      n.mode = MODE_INITIALIZATION;
    }
  }
}

/** Singleton DroneCAN mock for demo wiring. */
export const mockDroneCanBus = new MockDroneCanBus();
