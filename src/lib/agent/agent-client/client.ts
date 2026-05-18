/**
 * @module agent/agent-client/client
 * @description The `AgentClient` class. Thin orchestrator that holds
 * the (baseUrl, apiKey) context and delegates each method to the
 * per-domain helper modules under this folder.
 * @license GPL-3.0-only
 */

import type {
  AgentStatus,
  AgentVersionInfo,
  ClaimResponse,
  CommandResult,
  FullStatusResponse,
  HardwareCheckStatus,
  LogEntry,
  MeshNetEnrollment,
  NetworkPeer,
  PairingInfo,
  PeripheralInfo,
  ScriptInfo,
  ScriptRunResult,
  SetupActionResult,
  SetupStatus,
  SystemResources,
  TelemetrySnapshot,
  VideoStatus,
} from "../types";
import * as system from "./system";
import * as setup from "./setup";
import * as extras from "./extras";
import type { RequestContext } from "./transport";
import { agentSupports, fetchVersionInfo } from "./version-cache";
import type {
  CameraListResponse,
  RecordingControlResponse,
  RecordingListResponse,
  SigningCapability,
  SigningCounters,
  SigningEnrollResult,
} from "./types";

export class AgentClient {
  private ctx: RequestContext;

  constructor(baseUrl: string, apiKey?: string | null) {
    this.ctx = {
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey: apiKey ?? null,
    };
  }

  // ── Status / system / services / logs / params / commands ──────

  getStatus(): Promise<AgentStatus> {
    return system.getStatus(this.ctx);
  }

  /**
   * Fetch the agent's wire-protocol version + capability flags.
   * Returns null when the agent is older than 0.8.6 (does not have
   * the endpoint). Cached for 5 minutes per baseUrl+apiKey.
   */
  getVersion(opts?: { force?: boolean }): Promise<AgentVersionInfo | null> {
    return fetchVersionInfo(this.ctx, opts);
  }

  /** Convenience: does the agent advertise the named capability? */
  async supports(capability: string): Promise<boolean> {
    const info = await this.getVersion();
    return agentSupports(info, capability);
  }

  getTelemetry(): Promise<TelemetrySnapshot> {
    return system.getTelemetry(this.ctx);
  }

  getServices(agentUptimeHint?: number): ReturnType<typeof system.getServices> {
    return system.getServices(this.ctx, agentUptimeHint);
  }

  getSystemResources(): Promise<SystemResources> {
    return system.getSystemResources(this.ctx);
  }

  getLogs(params?: { level?: string; limit?: number }): Promise<LogEntry[]> {
    return system.getLogs(this.ctx, params);
  }

  getParams(): Promise<Record<string, number>> {
    return system.getParams(this.ctx);
  }

  sendCommand(cmd: string, args?: unknown[]): Promise<CommandResult> {
    return system.sendCommand(this.ctx, cmd, args);
  }

  getConfig(): Promise<Record<string, unknown>> {
    return system.getConfig(this.ctx);
  }

  /**
   * Write a single config value via PUT /api/config. Dot-separated
   * key paths are supported (e.g. `ground_station.display.type`). The
   * agent coerces the string value to the underlying field type.
   */
  setConfigValue(
    key: string,
    value: string,
  ): Promise<{ status?: string; key?: string; value?: unknown; error?: string }> {
    return system.setConfigValue(this.ctx, key, value);
  }

  restartService(name: string): Promise<CommandResult> {
    return system.restartService(this.ctx, name);
  }

  getFullStatus(): Promise<FullStatusResponse | null> {
    return system.getFullStatus(this.ctx);
  }

  // ── Setup wizard + LCD display ─────────────────────────────────

  getSetupStatus(): Promise<SetupStatus> {
    return setup.getSetupStatus(this.ctx);
  }

  postProfileChoice(
    profile: "drone" | "ground_station",
    ground_role?: "direct" | "relay" | "receiver" | null,
  ): Promise<SetupActionResult> {
    return setup.postProfileChoice(this.ctx, profile, ground_role);
  }

  getHardwareCheck(): Promise<HardwareCheckStatus> {
    return setup.getHardwareCheck(this.ctx);
  }

  refreshHardwareCheck(): Promise<HardwareCheckStatus> {
    return setup.refreshHardwareCheck(this.ctx);
  }

  setDisplayPage(
    page: string,
  ): Promise<{ ok?: boolean; activePage?: string }> {
    return setup.setDisplayPage(this.ctx, page);
  }

  startDisplayCalibration(): Promise<{ ok?: boolean; current_step?: number }> {
    return setup.startDisplayCalibration(this.ctx);
  }

  getDisplayCalibrationStatus(): Promise<{
    current_step?: number;
    complete?: boolean;
    rms_residual_px?: number;
    skipped?: boolean;
  }> {
    return setup.getDisplayCalibrationStatus(this.ctx);
  }

  skipDisplayCalibration(): Promise<{ ok?: boolean }> {
    return setup.skipDisplayCalibration(this.ctx);
  }

  applySetup(update: Record<string, unknown>): Promise<{ ok?: boolean }> {
    return setup.applySetup(this.ctx, update);
  }

  // ── Peripherals ────────────────────────────────────────────────

  getPeripherals(): Promise<PeripheralInfo[]> {
    return extras.getPeripherals(this.ctx);
  }

  scanPeripherals(): Promise<PeripheralInfo[]> {
    return extras.scanPeripherals(this.ctx);
  }

  // ── Scripts ────────────────────────────────────────────────────

  getScripts(): Promise<ScriptInfo[]> {
    return extras.getScripts(this.ctx);
  }

  saveScript(name: string, content: string, suite?: string): Promise<ScriptInfo> {
    return extras.saveScript(this.ctx, name, content, suite);
  }

  deleteScript(id: string): Promise<CommandResult> {
    return extras.deleteScript(this.ctx, id);
  }

  runScript(id: string): Promise<ScriptRunResult> {
    return extras.runScript(this.ctx, id);
  }

  // ── Fleet ──────────────────────────────────────────────────────

  getEnrollment(): Promise<MeshNetEnrollment> {
    return extras.getEnrollment(this.ctx);
  }

  getPeers(): Promise<NetworkPeer[]> {
    return extras.getPeers(this.ctx);
  }

  // ── Video ──────────────────────────────────────────────────────

  getVideoStatus(): Promise<VideoStatus | null> {
    return extras.getVideoStatus(this.ctx);
  }

  listCameras(): Promise<CameraListResponse> {
    return extras.listCameras(this.ctx);
  }

  switchCamera(
    role: "primary" | "secondary",
    devicePath: string,
  ): Promise<{ ok?: boolean; restarting?: boolean }> {
    return extras.switchCamera(this.ctx, role, devicePath);
  }

  getVideoConfig(): Promise<unknown | null> {
    return extras.getVideoConfig(this.ctx);
  }

  setVideoConfig(
    body: Partial<{
      bitrate_kbps: number;
      fec_k: number;
      fec_n: number;
      mcs: number;
      auto: boolean;
      tier_idx: number;
    }>,
  ): Promise<unknown | null> {
    return extras.setVideoConfig(this.ctx, body);
  }

  getVideoLatency(): Promise<unknown | null> {
    return extras.getVideoLatency(this.ctx);
  }

  getTime(): Promise<
    { time_ns: number; monotonic_ns: number; ntp_synced: boolean } | null
  > {
    return extras.getTime(this.ctx);
  }

  // ── Recording ──────────────────────────────────────────────────

  startRecording(): Promise<RecordingControlResponse> {
    return extras.startRecording(this.ctx);
  }

  stopRecording(): Promise<RecordingControlResponse> {
    return extras.stopRecording(this.ctx);
  }

  listRecordings(): Promise<RecordingListResponse> {
    return extras.listRecordings(this.ctx);
  }

  // ── Pairing ────────────────────────────────────────────────────

  getPairingInfo(): Promise<PairingInfo> {
    return extras.getPairingInfo(this.ctx);
  }

  claimLocally(userId: string): Promise<ClaimResponse> {
    return extras.claimLocally(this.ctx, userId);
  }

  unpairAgent(): Promise<CommandResult> {
    return extras.unpairAgent(this.ctx);
  }

  // ── MAVLink signing ────────────────────────────────────────────

  getSigningCapability(): Promise<SigningCapability> {
    return extras.getSigningCapability(this.ctx);
  }

  enrollSigningKey(keyHex: string, linkId: number): Promise<SigningEnrollResult> {
    return extras.enrollSigningKey(this.ctx, keyHex, linkId);
  }

  disableSigningOnFc(): Promise<{ success: boolean }> {
    return extras.disableSigningOnFc(this.ctx);
  }

  getSigningRequire(): Promise<{ require: boolean | null }> {
    return extras.getSigningRequire(this.ctx);
  }

  setSigningRequire(
    require: boolean,
  ): Promise<{ success: boolean; require: boolean }> {
    return extras.setSigningRequire(this.ctx, require);
  }

  getSigningCounters(): Promise<SigningCounters> {
    return extras.getSigningCounters(this.ctx);
  }
}
