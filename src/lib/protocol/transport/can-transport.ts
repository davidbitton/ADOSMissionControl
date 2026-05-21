/**
 * CAN transport abstraction for DroneCAN.
 *
 * A CanTransport is a byte-level pipe that delivers individual CAN frames
 * to and from the bus. Two concrete implementations:
 *
 *   - SlcanTransport: SLCAN ASCII codec over WebSerial. Used when the GCS
 *     shares the FC's USB port directly. Full bus throughput.
 *
 *   - MavlinkCanForwardTransport: CAN frames routed through MAVLink CAN_FRAME
 *     / CANFD_FRAME messages via the agent relay. Used over LAN or cloud.
 *     Bandwidth-limited by the radio link.
 *
 * Both expose the same lifecycle (open/close), frame send/receive, state
 * change notifications, and per-direction counters.
 */

/** A single CAN frame moving on the bus. */
export interface CanFrame {
  /** CAN identifier. 11-bit standard or 29-bit extended (see `extended`). */
  id: number;
  /** True for 29-bit identifiers, false for 11-bit. */
  extended: boolean;
  /** Data length code (0..8 for classic CAN, 0..15 for CAN FD). */
  dlc: number;
  /** Payload bytes, length must equal `dlc`. */
  data: Uint8Array;
  /** Optional wall-clock timestamp in ms (when emitted by the transport). */
  timestamp?: number;
}

/** Lifecycle state of a CAN transport. */
export type CanTransportState = "closed" | "opening" | "open" | "error";

/** Counters exposed by every CAN transport. */
export interface CanTransportStats {
  /** Frames written to the bus since the transport opened. */
  txCount: number;
  /** Frames decoded from the bus since the transport opened. */
  rxCount: number;
  /** Transport-level write failures (BEL responses, queue rejects, etc.). */
  txErrors: number;
  /** Decode failures, framing errors, and bus error indications. */
  rxErrors: number;
}

/**
 * Unified interface for the two CAN transports the GUI consumes.
 *
 * The protocol stack above this layer treats either flavour identically and
 * picks the active transport based on the connected drone (direct USB →
 * SLCAN, anything else → MAVLink relay).
 */
export interface CanTransport {
  /**
   * Open the underlying byte channel and bring the bus online at the
   * requested bitrate. Rejects if the channel is unavailable, the bitrate is
   * not supported, or the open handshake fails.
   */
  open(opts: { bitrate: number }): Promise<void>;

  /** Close the channel and tear down any background readers. Idempotent. */
  close(): Promise<void>;

  /**
   * Enqueue a frame for transmission. Resolves once the frame has been
   * handed to the underlying channel. Does not wait for a per-frame ACK
   * from the bus.
   */
  send(frame: CanFrame): Promise<void>;

  /**
   * Subscribe to inbound frames. Returns an unsubscribe function. Multiple
   * subscribers are supported; each receives every frame.
   */
  onFrame(cb: (frame: CanFrame) => void): () => void;

  /**
   * Subscribe to state transitions. Returns an unsubscribe function. The
   * callback fires whenever the transport moves between states.
   */
  onState(cb: (s: CanTransportState) => void): () => void;

  /** Current lifecycle state. */
  getState(): CanTransportState;

  /** Snapshot of the counters. The returned object is a copy. */
  getStats(): CanTransportStats;
}

/**
 * CAN-over-MAVLink transport. Stub placeholder for a later gate.
 *
 * When complete this will translate CanFrame ↔ MAVLink CAN_FRAME (id 386),
 * CANFD_FRAME (id 387), and arbitrate the FC's CAN_FORWARD mode via
 * MAV_CMD_CAN_FORWARD. Today every method throws so callers fail loudly.
 */
export class MavlinkCanForwardTransport implements CanTransport {
  private static readonly NOT_IMPL = "Not implemented in Gate 1; lands in Gate 4";

  async open(_opts: { bitrate: number }): Promise<void> {
    throw new Error(MavlinkCanForwardTransport.NOT_IMPL);
  }

  async close(): Promise<void> {
    throw new Error(MavlinkCanForwardTransport.NOT_IMPL);
  }

  async send(_frame: CanFrame): Promise<void> {
    throw new Error(MavlinkCanForwardTransport.NOT_IMPL);
  }

  onFrame(_cb: (frame: CanFrame) => void): () => void {
    throw new Error(MavlinkCanForwardTransport.NOT_IMPL);
  }

  onState(_cb: (s: CanTransportState) => void): () => void {
    throw new Error(MavlinkCanForwardTransport.NOT_IMPL);
  }

  getState(): CanTransportState {
    throw new Error(MavlinkCanForwardTransport.NOT_IMPL);
  }

  getStats(): CanTransportStats {
    throw new Error(MavlinkCanForwardTransport.NOT_IMPL);
  }
}
