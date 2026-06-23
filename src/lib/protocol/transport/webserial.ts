/**
 * Web Serial API transport for USB/UART connections.
 * Browser-only — requires Chrome/Edge with Web Serial API support.
 */

/// <reference path="../web-serial.d.ts" />
import type { Transport } from "../types";

type TransportEventMap = {
  data: Uint8Array;
  close: void;
  error: Error;
};

/** Shared guidance when WebSerial open fails — not always a true lock contention. */
export function formatSerialOpenError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const looksBusy =
    lower.includes("already open") ||
    lower.includes("failed to open") ||
    lower.includes("access denied") ||
    lower.includes("networkerror");

  if (!looksBusy) {
    return err instanceof Error ? err : new Error(msg);
  }

  // "Already open" is often misleading: WebSerial reports it when this renderer
  // still holds the handle, another app/tab owns the OS port, OR the operator
  // picked the wrong interface on a multi-port USB device (MAVLink vs SLCAN/CAN).
  return new Error(
    `${msg}\n\n` +
      `Common causes (try in order):\n` +
      `1. Wrong serial interface — many flight controllers enumerate TWO USB serial ports ` +
      `(e.g. MAVLink/telemetry on one, SLCAN/CAN or console on the other). ` +
      `This dialog only speaks MAVLink; pick the other port from the list and try again.\n` +
      `2. Port held elsewhere — another Chrome/Edge tab, Electron window, Mission Planner, ` +
      `QGC, or configurator still has the port open. Disconnect there or fully quit that app.\n` +
      `3. Stale handle in this app — disconnect any existing craft, fully quit Electron ` +
      `(not just reload), then reconnect.`,
  );
}

export class WebSerialTransport implements Transport {
  readonly type = "webserial" as const;

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private _connected = false;
  private _disconnecting = false;
  private listeners: Map<
    keyof TransportEventMap,
    Set<(data: never) => void>
  > = new Map();

  get isConnected(): boolean {
    return this._connected;
  }

  /** Expose the underlying serial port for bootloader mode. */
  getPort(): SerialPort | null {
    return this.port;
  }

  /** Check if Web Serial API is available in this browser. */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  /**
   * Best-effort close before open. Only works if *this* document still owns
   * the open handle; cannot steal a port held by another process/tab.
   */
  private static async ensurePortClosed(port: SerialPort): Promise<void> {
    try {
      if (port.readable || port.writable) {
        await port.close().catch(() => {});
      }
    } catch {
      // open() will surface a clearer error if still locked
    }
  }

  private async openPortStreams(baudRate: number): Promise<void> {
    if (!this.port) throw new Error("No serial port");
    await WebSerialTransport.ensurePortClosed(this.port);
    try {
      await this.port.open({ baudRate });
    } catch (err) {
      throw formatSerialOpenError(err);
    }
    this._connected = true;
    if (this.port.readable) {
      this.reader = this.port.readable.getReader();
    }
    if (this.port.writable) {
      this.writer = this.port.writable.getWriter();
    }
    this.readLoop();
  }

  /**
   * Open the browser serial port picker and connect.
   * @param baudRate — UART baud rate, default 115200 (standard for MAVLink)
   */
  async connect(baudRate: number = 115200): Promise<void> {
    if (this._connected) {
      throw new Error("Already connected");
    }

    if (!WebSerialTransport.isSupported()) {
      throw new Error(
        "Web Serial API not supported — use Chrome or Edge"
      );
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.openPortStreams(baudRate);
    } catch (err) {
      this._connected = false;
      this.port = null;
      throw err instanceof Error ? err : formatSerialOpenError(err);
    }
  }

  /**
   * Connect using an already-permitted SerialPort (no browser picker).
   * Use this with ports from `navigator.serial.getPorts()`.
   */
  async connectToPort(port: SerialPort, baudRate: number = 115200): Promise<void> {
    if (this._connected) {
      throw new Error("Already connected");
    }

    try {
      this.port = port;
      await this.openPortStreams(baudRate);
    } catch (err) {
      this._connected = false;
      this.port = null;
      throw err instanceof Error ? err : formatSerialOpenError(err);
    }
  }

  /** Continuous read loop — runs until disconnect or device removal. */
  private async readLoop(): Promise<void> {
    if (!this.reader) return;

    try {
      while (this._connected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.emit("data", value);
        }
      }
    } catch (err) {
      // Device disconnected or read error
      if (this._connected) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (this._connected && !this._disconnecting) {
        this._connected = false;
        this.emit("close", undefined as never);
      }
    }
  }

  /** Send raw bytes over serial. Fire-and-forget. */
  send(data: Uint8Array): void {
    if (!this._connected || !this.writer) {
      throw new Error("Not connected");
    }
    // Fire and forget — don't await
    this.writer.write(data).catch((err) => {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    });
  }

  /** Disconnect and release the serial port. Idempotent — safe to call multiple times. */
  async disconnect(): Promise<void> {
    if (this._disconnecting) return;
    if (!this._connected && !this.port) return;

    this._disconnecting = true;
    this._connected = false;

    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.writer) {
        await this.writer.close().catch(() => {});
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close().catch(() => {});
        this.port = null;
      }
    } finally {
      this._disconnecting = false;
      this.emit("close", undefined as never);
    }
  }

  on<K extends keyof TransportEventMap>(
    event: K,
    handler: (data: TransportEventMap[K]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as (data: never) => void);
  }

  off<K extends keyof TransportEventMap>(
    event: K,
    handler: (data: TransportEventMap[K]) => void
  ): void {
    this.listeners.get(event)?.delete(handler as (data: never) => void);
  }

  private emit<K extends keyof TransportEventMap>(
    event: K,
    data: TransportEventMap[K]
  ): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        (handler as (data: TransportEventMap[K]) => void)(data);
      } catch {
        // Don't let listener errors crash the transport
      }
    }
  }
}
