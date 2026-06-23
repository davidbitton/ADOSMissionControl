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

/**
 * Track which transport owns which SerialPort in this renderer.
 * Reconnect/recent-connect creates a *new* WebSerialTransport while the old
 * instance still holds reader/writer locks; `port.close()` from the new
 * instance cannot succeed until those locks are released via the owner.
 */
const portOwners = new WeakMap<SerialPort, WebSerialTransport>();

/** Shared guidance when WebSerial open fails after we already tried to reclaim. */
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

  return new Error(
    `${msg}\n\n` +
      `Could not open this serial port. Usually one of:\n` +
      `1. Still held in this app — disconnect the craft (or wait for reconnect cleanup), then try again.\n` +
      `2. Held by another app/tab — close other Chrome/Electron/Mission Planner/QGC/configurator instances.\n` +
      `3. Wrong interface on a multi-port USB device — try the other permitted port (MAVLink vs SLCAN/console).`,
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
   * Fully release any transport in this renderer that owns `port`, then try
   * a best-effort port.close() if streams are still present without locks.
   */
  static async releasePort(port: SerialPort): Promise<void> {
    const owner = portOwners.get(port);
    if (owner) {
      await owner.disconnect().catch(() => {});
    }
    try {
      if (port.readable || port.writable) {
        await port.close().catch(() => {});
      }
    } catch {
      // open() will throw if still unavailable
    }
  }

  private async openPortStreams(baudRate: number): Promise<void> {
    if (!this.port) throw new Error("No serial port");

    // Reclaim if we (or another transport instance) already own this port
    const prior = portOwners.get(this.port);
    if (prior && prior !== this) {
      await prior.disconnect().catch(() => {});
    } else if (prior === this) {
      await this.releaseStreamsOnly();
    } else {
      // No registered owner but port may still look open (orphan / incomplete disconnect)
      try {
        if (this.port.readable || this.port.writable) {
          await this.port.close().catch(() => {});
        }
      } catch {
        // continue to open attempt
      }
    }

    // Small yield so the browser finishes releasing locks after disconnect
    await new Promise<void>((r) => setTimeout(r, 50));

    try {
      await this.port.open({ baudRate });
    } catch (err) {
      // One more reclaim attempt (race with removeDrone/close handler)
      await WebSerialTransport.releasePort(this.port);
      await new Promise<void>((r) => setTimeout(r, 80));
      try {
        await this.port.open({ baudRate });
      } catch (err2) {
        throw formatSerialOpenError(err2);
      }
    }

    this._connected = true;
    portOwners.set(this.port, this);
    if (this.port.readable) {
      this.reader = this.port.readable.getReader();
    }
    if (this.port.writable) {
      this.writer = this.port.writable.getWriter();
    }
    this.readLoop();
  }

  /** Drop reader/writer without emitting close (used when re-opening same instance). */
  private async releaseStreamsOnly(): Promise<void> {
    this._connected = false;
    if (this.reader) {
      await this.reader.cancel().catch(() => {});
      try {
        this.reader.releaseLock();
      } catch {
        /* already released */
      }
      this.reader = null;
    }
    if (this.writer) {
      await this.writer.close().catch(() => {});
      try {
        this.writer.releaseLock();
      } catch {
        /* already released */
      }
      this.writer = null;
    }
    if (this.port) {
      await this.port.close().catch(() => {});
    }
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
      if (this.port) portOwners.delete(this.port);
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
      if (this.port) portOwners.delete(this.port);
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
        if (this.port) portOwners.delete(this.port);
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
    const ownedPort = this.port;

    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        try {
          this.reader.releaseLock();
        } catch {
          /* ignore */
        }
        this.reader = null;
      }
      if (this.writer) {
        await this.writer.close().catch(() => {});
        try {
          this.writer.releaseLock();
        } catch {
          /* ignore */
        }
        this.writer = null;
      }
      if (this.port) {
        await this.port.close().catch(() => {});
        this.port = null;
      }
    } finally {
      if (ownedPort) portOwners.delete(ownedPort);
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
