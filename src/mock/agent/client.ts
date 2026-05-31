/**
 * @module mock/agent/client
 * @description `MockAgentClient` — drop-in replacement for `AgentClient`
 * used in demo mode. Per-domain mock data lives in sibling files; this
 * file owns the lifecycle (delays, mutable script storage, signing
 * counters, setup wizard state).
 * @license GPL-3.0-only
 */

import type {
  AgentStatus,
  ClaimResponse,
  CommandResult,
  HardwareCheckStatus,
  LogEntry,
  MeshNetEnrollment,
  NetworkPeer,
  PairingInfo,
  PeripheralInfo,
  ScriptInfo,
  ScriptRunResult,
  ServiceInfo,
  SetupActionResult,
  SetupStatus,
  SystemResources,
} from "@/lib/agent/types";
import type { AgentCapabilities } from "@/lib/agent/feature-types";
import { delay, jitter, startTime } from "./utils";
import { MOCK_PERIPHERALS } from "./peripherals";
import { MOCK_SCRIPTS } from "./scripts";
import { MOCK_ENROLLMENT, MOCK_PEERS } from "./fleet";
import { getMockCapabilities } from "./capabilities";
import { MOCK_LOGS } from "./logs";
import {
  buildMockHardwareCheck,
  buildMockSetupStatus,
  type MockGroundRole,
  type MockProfile,
} from "./setup-status";

// ── Command Lookup ──────────────────────────────────────────

const commandResponses: Record<string, CommandResult> = {
  arm: { success: true, message: "Vehicle armed" },
  disarm: { success: true, message: "Vehicle disarmed" },
  takeoff: { success: true, message: "Takeoff initiated to 10m" },
  land: { success: true, message: "Landing initiated" },
  rtl: { success: true, message: "Return to launch initiated" },
  mode: { success: true, message: "Flight mode changed" },
  status: { success: true, message: "Agent running, FC connected, 5 services active" },
  help: { success: true, message: "Commands: arm, disarm, takeoff [alt], land, rtl, mode [name], status, help" },
};

// ── CPU History ─────────────────────────────────────────────

const cpuHistoryBuffer: number[] = [];
for (let i = 0; i < 60; i++) {
  cpuHistoryBuffer.push(jitter(34, 8));
}

// ── Script storage ──────────────────────────────────────────

let mockScripts: ScriptInfo[] = [...MOCK_SCRIPTS];

// ── MockAgentClient ─────────────────────────────────────────

export class MockAgentClient {
  async getStatus(): Promise<AgentStatus> {
    await delay(60);
    const uptimeMs = Date.now() - startTime;
    return {
      version: "0.1.0",
      uptime_seconds: Math.floor(uptimeMs / 1000),
      board: {
        name: "Raspberry Pi CM4",
        model: "CM4104032",
        tier: 3,
        ram_mb: 4096,
        cpu_cores: 4,
        vendor: "Raspberry Pi",
        soc: "BCM2711",
        arch: "aarch64",
        hw_video_codecs: ["h264_v4l2m2m"],
      },
      health: {
        cpu_percent: jitter(34, 8),
        memory_percent: jitter(31, 4),
        disk_percent: jitter(42, 2),
        temperature: jitter(45, 3),
        timestamp: new Date().toISOString(),
      },
      fc_connected: true,
      fc_port: "/dev/ttyAMA0",
      fc_baud: 921600,
      kernel_release: "6.1.0-rpi7-rpi-v8",
      wfb_module_source: "prebuilt",
      install_status: "ok",
      install_version: "0.39.0",
      failed_steps: [],
    };
  }

  async getServices(): Promise<ServiceInfo[]> {
    await delay(80);
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    return [
      { name: "mavlink-proxy", status: "running", pid: 1201, cpu_percent: jitter(8, 3), memory_mb: jitter(45, 5), uptime_seconds: uptime },
      { name: "video-pipeline", status: "running", pid: 1202, cpu_percent: jitter(22, 5), memory_mb: jitter(120, 10), uptime_seconds: uptime },
      { name: "mqtt-gateway", status: "running", pid: 1203, cpu_percent: jitter(3, 1.5), memory_mb: jitter(28, 4), uptime_seconds: uptime },
      { name: "suite-runtime", status: "running", pid: 1204, cpu_percent: jitter(5, 2), memory_mb: jitter(64, 8), uptime_seconds: uptime },
      { name: "script-executor", status: "running", pid: 1205, cpu_percent: jitter(1, 0.5), memory_mb: jitter(18, 3), uptime_seconds: uptime },
      { name: "sensor-manager", status: "running", pid: 1206, cpu_percent: jitter(6, 2), memory_mb: jitter(35, 5), uptime_seconds: uptime },
    ];
  }

  async getSystemResources(): Promise<SystemResources> {
    await delay(50);
    const cpu = jitter(34, 8);
    cpuHistoryBuffer.push(cpu);
    if (cpuHistoryBuffer.length > 60) cpuHistoryBuffer.shift();
    const totalMb = 4096;
    const usedMb = jitter(1240, 80);
    const cacheMb = jitter(820, 60);
    const swapTotalMb = 2048;
    const swapUsedMb = jitter(160, 30);
    return {
      cpu_percent: cpu,
      memory_percent: jitter(31, 4),
      memory_used_mb: usedMb,
      memory_total_mb: totalMb,
      memory_available_mb: Math.max(0, totalMb - usedMb),
      memory_cache_mb: cacheMb,
      swap_total_mb: swapTotalMb,
      swap_used_mb: swapUsedMb,
      swap_percent: (swapUsedMb / swapTotalMb) * 100,
      disk_percent: jitter(42, 2),
      disk_used_gb: jitter(13.5, 0.5),
      disk_total_gb: 32,
      temperature: jitter(45, 3),
    };
  }

  getCpuHistory(): number[] {
    return [...cpuHistoryBuffer];
  }

  async getLogs(params?: { level?: string; limit?: number }): Promise<LogEntry[]> {
    await delay(40);
    let logs = MOCK_LOGS;
    if (params?.level) {
      logs = logs.filter((l) => l.level === params.level);
    }
    if (params?.limit) {
      logs = logs.slice(-params.limit);
    }
    return logs;
  }

  async sendCommand(cmd: string): Promise<CommandResult> {
    await delay(100);
    const key = cmd.toLowerCase().split(/\s+/)[0];
    return commandResponses[key] ?? { success: false, message: `Unknown command: ${cmd}` };
  }

  async restartService(name: string): Promise<CommandResult> {
    await delay(300);
    return { success: true, message: `Service '${name}' restarted` };
  }

  // ── Peripherals ─────────────────────────────────────────

  async getPeripherals(): Promise<PeripheralInfo[]> {
    await delay(60);
    return MOCK_PERIPHERALS.map((p) => ({ ...p }));
  }

  async scanPeripherals(): Promise<PeripheralInfo[]> {
    await delay(800);
    return MOCK_PERIPHERALS.map((p) => ({ ...p }));
  }

  // ── Scripts ─────────────────────────────────────────────

  async getScripts(): Promise<ScriptInfo[]> {
    await delay(60);
    return mockScripts.map((s) => ({ ...s }));
  }

  async saveScript(name: string, content: string, suite?: string): Promise<ScriptInfo> {
    await delay(100);
    const existing = mockScripts.find((s) => s.name === name);
    if (existing) {
      existing.content = content;
      existing.lastModified = new Date().toISOString();
      if (suite !== undefined) existing.suite = suite;
      return { ...existing };
    }
    const newScript: ScriptInfo = {
      id: `script-${Date.now()}`,
      name,
      content,
      suite,
      lastModified: new Date().toISOString(),
    };
    mockScripts.push(newScript);
    return { ...newScript };
  }

  async deleteScript(id: string): Promise<CommandResult> {
    await delay(80);
    mockScripts = mockScripts.filter((s) => s.id !== id);
    return { success: true, message: "Script deleted" };
  }

  async runScript(id: string): Promise<ScriptRunResult> {
    await delay(1500);
    const script = mockScripts.find((s) => s.id === id);
    const name = script?.name ?? "unknown";
    return {
      stdout: `[ADOS] Running ${name}...\n[ADOS] Connecting to FC on /dev/ttyAMA0\n[ADOS] FC connected: ArduCopter 4.5.7\n[ADOS] Script completed successfully\n`,
      stderr: "",
      exitCode: 0,
      durationMs: 1420,
    };
  }

  // ── Fleet ───────────────────────────────────────────────

  async getEnrollment(): Promise<MeshNetEnrollment> {
    await delay(60);
    return { ...MOCK_ENROLLMENT };
  }

  async getPeers(): Promise<NetworkPeer[]> {
    await delay(80);
    return MOCK_PEERS.map((p) => ({
      ...p,
      signal_dbm: Math.round(jitter(p.signal_dbm, 3)),
      battery_percent: Math.max(0, Math.min(100, Math.round(jitter(p.battery_percent, 2)))),
      distance_m: Math.max(0, Math.round(jitter(p.distance_m, 15))),
    }));
  }

  // ── Pairing ──────────────────────────────────────────────

  async getPairingInfo(): Promise<PairingInfo> {
    await delay(60);
    return {
      device_id: "ados-alpha-1-cm4",
      name: "ADOS Agent (Alpha-1)",
      version: "0.1.0",
      board: "Raspberry Pi CM4",
      paired: true,
      owner_id: "demo-user",
      paired_at: startTime,
      mdns_host: "ados-alpha-1.local",
    };
  }

  async claimLocally(_userId: string): Promise<ClaimResponse> {
    await delay(200);
    return {
      api_key: "demo-api-key-" + Math.random().toString(36).slice(2, 10),
      device_id: "ados-alpha-1-cm4",
      name: "ADOS Agent (Alpha-1)",
      mdns_host: "ados-alpha-1.local",
    };
  }

  async unpairAgent(): Promise<CommandResult> {
    await delay(150);
    return { success: true, message: "Agent unpaired" };
  }

  // ── Capabilities ────────────────────────────────────────

  async getCapabilities(): Promise<AgentCapabilities> {
    await delay(60);
    return getMockCapabilities();
  }

  // ── MAVLink signing (demo) ───────────────────────────────
  //
  // Simulates an ArduPilot FC with SIGNING_* params exposed. The mock
  // returns capability=supported so the SigningPanel renders all three
  // initial enrollment states (unsupported is unreachable from the default mock
  // drone; set a Betaflight mock drone to exercise that branch).

  async getSigningCapability(): Promise<{
    supported: boolean;
    reason: string;
    firmware_name: string | null;
    firmware_version: string | null;
    signing_params_present: boolean;
  }> {
    await delay(50);
    return {
      supported: true,
      reason: "ok",
      firmware_name: "ArduPilot",
      firmware_version: "4.5.0",
      signing_params_present: true,
    };
  }

  async enrollSigningKey(
    keyHex: string,
    _linkId: number,
  ): Promise<{ success: boolean; key_id: string; enrolled_at: string }> {
    await delay(400);
    // Derive a fake fingerprint from the first 8 hex chars of SHA-256.
    // Using a synchronous pseudo-hash keeps the demo zero-dep.
    const keyId = keyHex.slice(0, 8);
    return {
      success: true,
      key_id: keyId,
      enrolled_at: new Date().toISOString(),
    };
  }

  async disableSigningOnFc(): Promise<{ success: boolean }> {
    await delay(200);
    this._mockRequire = false;
    return { success: true };
  }

  async getSigningRequire(): Promise<{ require: boolean | null }> {
    await delay(40);
    return { require: this._mockRequire };
  }

  async setSigningRequire(require: boolean): Promise<{ success: boolean; require: boolean }> {
    await delay(150);
    this._mockRequire = require;
    return { success: true, require };
  }

  async getSigningCounters(): Promise<{
    tx_signed_count: number;
    rx_signed_count: number;
    last_signed_rx_at: number | null;
  }> {
    await delay(40);
    // Steady trickle so the debug view shows non-zero counters.
    const uptimeSec = (Date.now() - startTime) / 1000;
    return {
      tx_signed_count: Math.floor(uptimeSec * 5),
      rx_signed_count: Math.floor(uptimeSec * 10),
      last_signed_rx_at: Date.now() / 1000,
    };
  }

  private _mockRequire = false;

  // ── Setup wizard ─────────────────────────────────────────
  //
  // Mirrors the agent's universal setup facade. Demo mode lands an
  // already-finalized drone with a clean profile + hardware check so
  // operators can browse the Hardware tab without first walking the
  // wizard. The profile pick + hardware refresh endpoints accept and
  // echo the operator's choice without persisting beyond memory.

  private _mockProfile: MockProfile = "drone";
  private _mockGroundRole: MockGroundRole = "direct";
  private _mockProfileConfirmed = true;

  async getSetupStatus(): Promise<SetupStatus> {
    await delay(40);
    return buildMockSetupStatus({
      profile: this._mockProfile,
      groundRole: this._mockGroundRole,
      profileConfirmed: this._mockProfileConfirmed,
    });
  }

  async getHardwareCheck(): Promise<HardwareCheckStatus> {
    await delay(60);
    return buildMockHardwareCheck(
      this._mockProfile,
      this._mockProfile === "ground_station" ? this._mockGroundRole : "",
    );
  }

  async refreshHardwareCheck(): Promise<HardwareCheckStatus> {
    await delay(150);
    return buildMockHardwareCheck(
      this._mockProfile,
      this._mockProfile === "ground_station" ? this._mockGroundRole : "",
    );
  }

  async postProfileChoice(
    profile: "drone" | "ground_station",
    ground_role?: "direct" | "relay" | "receiver" | null,
  ): Promise<SetupActionResult> {
    await delay(120);
    this._mockProfile = profile;
    if (profile === "ground_station") {
      this._mockGroundRole = (ground_role ?? "direct") as MockGroundRole;
    }
    this._mockProfileConfirmed = true;
    const message =
      profile === "drone"
        ? "Profile set to drone."
        : `Profile set to ground station (${this._mockGroundRole}).`;
    return {
      ok: true,
      message,
      data: {
        profile,
        ground_role: profile === "ground_station" ? this._mockGroundRole : "",
        changed: true,
      },
    };
  }
}
