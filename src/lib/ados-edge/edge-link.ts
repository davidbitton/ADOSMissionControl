/**
 * @module ados-edge/edge-link
 * @description Typed client for the ADOS Edge protocol. Wraps the
 * transport-level CDC client with a stable API for routes and stores:
 * capability-gated `call()` / `subscribe()`, session info, and typed
 * command helpers per group (`system.*`, `models.*`, `settings.*`,
 * `mixer.*`, `elrs.*`, ...).
 *
 * Today the wrapper delegates to `CdcClient` using the flat command
 * surface the firmware ships. When the firmware grows the envelope
 * dispatcher it can advertise capabilities via `system.hello`; this
 * client already reads the capability array and exposes `has(cap)` so
 * GCS surfaces can feature-gate against it without a rewrite.
 *
 * @license GPL-3.0-only
 */

import { CdcClient, type VersionInfo, type CdcResponse, type StreamListener } from "./cdc-client";
import { AdosEdgeTransport } from "./transport";

/** One operation on an Edge Link session. */
export type EdgeLinkCapability =
  | "system"
  | "factory"
  | "settings"
  | "models"
  | "mixer"
  | "calibration"
  | "telemetry"
  | "firmware"
  | "backup"
  | "elrs"
  | "diag"
  | "hid"
  | "metrics"
  | "logs"
  | "input"
  | "channels"
  | "crsf-telemetry"
  | "system-events";

export interface SessionInfo {
  linkVersion: number;
  firmware: string;
  board: string;
  mcu: string;
  chipId: string;
  /** Capabilities the connected firmware advertises. Empty array when
   * the firmware does not yet ship the envelope dispatcher; in that
   * case callers should assume the legacy flat command surface. */
  caps: EdgeLinkCapability[];
}

/** Expanded device info from the firmware `SYSTEM INFO` command. Extends
 * `SessionInfo` with fields that are not part of the hello handshake:
 * flash capacity, the last-reset classification, and uptime. */
export interface SystemInfo extends SessionInfo {
  flashKb: number;
  resetReason:
    | "por"
    | "nrst"
    | "iwdg"
    | "wwdg"
    | "soft"
    | "bor"
    | "lpwr"
    | "unknown";
  uptimeMs: number;
}

const LEGACY_DEFAULT_CAPS: EdgeLinkCapability[] = [
  "system",
  "models",
  "settings",
  "calibration",
  "telemetry",
  "firmware",
  "backup",
  "diag",
  "hid",
  "input",
  "channels",
  "crsf-telemetry",
];

/**
 * Higher-level client used by stores, routes, and wizards. Prefer this
 * over `CdcClient` in new code. Legacy `CdcClient` methods continue to
 * work while the migration lands.
 */
export class EdgeLinkClient {
  private cdc: CdcClient;
  private _session: SessionInfo | null = null;

  constructor(input: AdosEdgeTransport | CdcClient) {
    this.cdc = input instanceof CdcClient ? input : new CdcClient(input);
  }

  /** Low-level CDC client for methods that have not migrated yet. */
  get legacy(): CdcClient {
    return this.cdc;
  }

  get session(): SessionInfo | null {
    return this._session;
  }

  /**
   * Handshake against the connected firmware. Reads firmware identity,
   * normalises it into a `SessionInfo`, and caches it so capability
   * gating is synchronous after first call.
   */
  async hello(): Promise<SessionInfo> {
    /* Firmware today responds to `VERSION` with a flat JSON object. No
     * envelope yet. Fold what we get into a v1-shaped `SessionInfo` so
     * downstream code can treat the two uniformly. */
    const v: VersionInfo = await this.cdc.version();
    const session: SessionInfo = {
      linkVersion: 1,
      firmware: v.firmware || "unknown",
      board: v.board || "unknown",
      mcu: v.mcu || "unknown",
      chipId: v.chipId || "",
      caps: LEGACY_DEFAULT_CAPS.slice(),
    };
    this._session = session;
    return session;
  }

  /** True when the connected firmware supports the named capability. */
  has(cap: EdgeLinkCapability): boolean {
    return this._session?.caps.includes(cap) ?? false;
  }

  /** Ping the firmware. Returns true on any successful reply. */
  async ping(): Promise<boolean> {
    return this.cdc.ping();
  }

  /** Query the expanded device identity. Firmware v0.0.21+ ships the
   * `SYSTEM INFO` command; older builds return `unknown command` and
   * this method throws. Callers should treat a thrown error as a signal
   * to fall back to the cached `SessionInfo` from hello(). */
  async systemInfo(): Promise<SystemInfo> {
    const resp = await this.cdc.sendCommand("SYSTEM INFO", { timeoutMs: 3000 });
    if (!resp.ok) throw new Error(resp.error || "SYSTEM INFO failed");
    const session = this._session;
    return {
      linkVersion: session?.linkVersion ?? 1,
      firmware: String(resp.firmware ?? session?.firmware ?? "unknown"),
      board: String(resp.board ?? session?.board ?? "unknown"),
      mcu: String(resp.mcu ?? session?.mcu ?? "unknown"),
      chipId: String(resp.chip_id ?? session?.chipId ?? ""),
      caps: session?.caps ?? [],
      flashKb: typeof resp.flash_kb === "number" ? resp.flash_kb : 0,
      resetReason: (resp.reset_reason as SystemInfo["resetReason"]) ?? "unknown",
      uptimeMs: typeof resp.uptime_ms === "number" ? resp.uptime_ms : 0,
    };
  }

  /** Wipe the radio and reboot. Requires the exact confirm phrase the
   * firmware enforces; any other value returns "confirm mismatch". */
  async factoryReset(confirmPhrase: string): Promise<void> {
    const escaped = confirmPhrase.trim();
    const resp = await this.cdc.sendCommand(`FACTORY RESET ${escaped}`, { timeoutMs: 5000 });
    if (!resp.ok) throw new Error(resp.error || "factory reset failed");
  }

  /* ── mixer.* ──────────────────────────────────────────── */

  /** Read one section of the active model as YAML. Firmware v0.0.22+
   * supports `setup`, `mixes`, `gvs`, and `flight_modes`; other section
   * names return a rejection until schema v2 ships. */
  async mixerGet(section: MixerSectionSlug): Promise<string> {
    const resp = await this.cdc.sendCommand(`MIXER GET ${section}`, { timeoutMs: 3000 });
    if (!resp.ok) throw new Error(resp.error || `MIXER GET ${section} failed`);
    const yaml = resp.yaml;
    if (typeof yaml !== "string") {
      throw new Error(`MIXER GET ${section} returned no yaml field`);
    }
    return yaml;
  }

  /** Write one section of the active model. The firmware merges the
   * payload into the current model, emits + persists the full YAML to
   * flash, and flips the in-memory active model so the next MIXER GET
   * reflects the write. `yaml` is raw (real newlines); the wire
   * encoding escapes newlines + backslashes so the CDC line parser
   * can carry a multiline payload on one line. */
  async mixerSet(section: MixerSectionSlug, yaml: string): Promise<void> {
    const encoded = yaml.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    const resp = await this.cdc.sendCommand(
      `MIXER SET ${section} ${encoded}`,
      { timeoutMs: 5000 },
    );
    if (!resp.ok) throw new Error(resp.error || `MIXER SET ${section} failed`);
  }

  /** Streaming frame subscription. Returns an unsubscribe. */
  onStream(listener: StreamListener): () => void {
    return this.cdc.onStream(listener);
  }

  /* ── system.* ──────────────────────────────────────────── */

  async reboot(): Promise<void> {
    await this.cdc.reboot();
  }

  async dfu(): Promise<void> {
    await this.cdc.dfu();
  }

  /* ── models.* ──────────────────────────────────────────── */

  async modelsList() {
    return this.cdc.modelList();
  }

  async modelsSelect(slot: number): Promise<number> {
    return this.cdc.modelSelect(slot);
  }

  async modelGet(): Promise<string> {
    return this.cdc.modelGet();
  }

  async modelSet(yaml: string): Promise<void> {
    return this.cdc.modelSet(yaml);
  }

  async modelRename(slot: number, name: string): Promise<void> {
    return this.cdc.modelRename(slot, name);
  }

  async modelDelete(slot: number): Promise<void> {
    return this.cdc.modelDelete(slot);
  }

  async modelSave(): Promise<void> {
    return this.cdc.modelSave();
  }

  /* ── settings.* ────────────────────────────────────────── */

  async settingsGet() {
    return this.cdc.settingsGet();
  }

  async settingsSet(s: Parameters<CdcClient["settingsSet"]>[0]) {
    return this.cdc.settingsSet(s);
  }

  /* ── calibration.* ─────────────────────────────────────── */

  async calStart(axis: number | "ALL" = "ALL") {
    return this.cdc.calStart(axis);
  }

  async calCenter() {
    return this.cdc.calCenter();
  }

  async calMin() {
    return this.cdc.calMin();
  }

  async calMax() {
    return this.cdc.calMax();
  }

  async calSave() {
    return this.cdc.calSave();
  }

  /* ── diag.* (pin probes) ───────────────────────────────── */

  async probeSwitches() {
    return this.cdc.probeSwitches();
  }

  async probeTrims() {
    return this.cdc.probeTrims();
  }

  /* ── Streams ───────────────────────────────────────────── */

  async startChannelsStream(): Promise<void> {
    return this.cdc.channelMonitor(true);
  }

  async stopChannelsStream(): Promise<void> {
    return this.cdc.channelMonitor(false);
  }

  async startInputStream(): Promise<void> {
    return this.cdc.inputMonitor(true);
  }

  async stopInputStream(): Promise<void> {
    return this.cdc.inputMonitor(false);
  }

  async startTelemetryStream(): Promise<void> {
    return this.cdc.telem(true);
  }

  async stopTelemetryStream(): Promise<void> {
    return this.cdc.telem(false);
  }

  /* ── Escape hatch for not-yet-typed commands ───────────── */

  /**
   * Send a raw CDC line and return the parsed response. Useful for the
   * Advanced-page raw console and for new commands that have not yet
   * earned typed wrappers.
   */
  async sendRaw(line: string, timeoutMs = 1500): Promise<CdcResponse> {
    return this.cdc.sendCommand(line, { timeoutMs });
  }
}

/** Section identifiers accepted by the firmware `MIXER GET / SET`
 * commands. These mirror the `model_section_from_slug` dictionary in
 * the firmware so additions stay in lock-step. */
export type MixerSectionSlug =
  | "setup"
  | "mixes"
  | "gvs"
  | "flight_modes"
  /* Planned for schema v2 on the firmware side. Using one of these
   * against v0.0.22 firmware returns `unknown section`. */
  | "inputs"
  | "outputs"
  | "curves"
  | "ls"
  | "sf"
  | "failsafe"
  | "trims"
  | "timers"
  | "telemetry"
  | "gvars";

/** Sections the firmware currently supports. The UI uses this to
 * feature-gate tabs until schema v2. */
export const SUPPORTED_MIXER_SECTIONS: ReadonlyArray<MixerSectionSlug> = [
  "setup",
  "mixes",
  "gvs",
  "flight_modes",
];
