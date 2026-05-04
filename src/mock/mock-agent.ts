// Exempt from 300 LOC soft rule: self-contained simulation engine, splitting hurts readability
/**
 * @module MockAgentClient
 * @description Mock implementation of AgentClient for demo mode.
 * @license GPL-3.0-only
 */

import type {
  AgentStatus,
  ServiceInfo,
  SystemResources,
  LogEntry,
  CommandResult,
  PeripheralInfo,
  ScriptInfo,
  ScriptRunResult,
  SuiteInfo,
  MeshNetEnrollment,
  NetworkPeer,
  PairingInfo,
  ClaimResponse,
  SetupStatus,
  SetupActionResult,
  HardwareCheckStatus,
} from "@/lib/agent/types";
import type { AgentCapabilities } from "@/lib/agent/feature-types";

const jitter = (base: number, range: number) =>
  base + (Math.random() - 0.5) * 2 * range;

const startTime = Date.now();

// ── Mock Peripherals ────────────────────────────────────────

export const MOCK_PERIPHERALS: PeripheralInfo[] = [
  { name: "BME280", type: "barometer", category: "sensor", bus: "I2C-1", address: "0x76", rate_hz: 50, status: "ok", last_reading: "101325 Pa / 24.3C" },
  { name: "MPU6050", type: "imu", category: "sensor", bus: "I2C-1", address: "0x68", rate_hz: 1000, status: "ok", last_reading: "ax=0.02 ay=-0.01 az=9.81" },
  { name: "BN-880", type: "gps", category: "sensor", bus: "UART-2", address: "115200", rate_hz: 10, status: "ok", last_reading: "3D Fix, 17 sats, HDOP 0.8" },
  { name: "TFMini-S", type: "rangefinder", category: "sensor", bus: "UART-3", address: "115200", rate_hz: 100, status: "ok", last_reading: "2.34 m" },
  { name: "PMW3901", type: "optical_flow", category: "sensor", bus: "SPI-0", address: "CS0", rate_hz: 80, status: "warning", last_reading: "dx=12 dy=-3 quality=142" },
  { name: "Pi Camera v3", type: "camera", category: "camera", bus: "CSI-0", address: "N/A", rate_hz: 30, status: "ok", last_reading: "1920x1080 @ 30fps H.264" },
  { name: "RTL8812EU", type: "video_tx", category: "video", bus: "USB-C", address: "wlan1", rate_hz: 0, status: "ok", last_reading: "29 dBm, ch165 (5825 MHz), 4.2 Mbps" },
  { name: "SimpleBGC", type: "gimbal_controller", category: "gimbal", bus: "UART-4", address: "115200", rate_hz: 50, status: "ok", last_reading: "pitch=-15.2 roll=0.3 yaw=142.8" },
];

// ── Mock Scripts ────────────────────────────────────────────

export const MOCK_SCRIPTS: ScriptInfo[] = [
  {
    id: "script-1",
    name: "patrol_grid.py",
    suite: "Sentry",
    lastModified: "2026-03-05T14:30:00+05:30",
    content: `"""Sentry patrol grid pattern."""
from ados import drone

async def main():
    await drone.arm()
    await drone.takeoff(50)

    # Define patrol waypoints
    waypoints = [
        (0.0, 0.0, 50),
        (0.001, 0.0, 50),
        (0.001, 0.001, 50),
        (0.0, 0.001, 50),
    ]

    for lat, lon, alt in waypoints:
        await drone.goto(lat, lon, alt)
        await drone.hover(5)

    await drone.rtl()

main()
`,
  },
  {
    id: "script-2",
    name: "hover_test.py",
    lastModified: "2026-03-04T10:15:00+05:30",
    content: `"""Simple hover test at 10m for 30 seconds."""
from ados import drone

async def main():
    await drone.arm()
    await drone.takeoff(10)
    await drone.hover(30)
    await drone.land()

main()
`,
  },
  {
    id: "script-3",
    name: "sensor_check.py",
    lastModified: "2026-03-03T18:00:00+05:30",
    content: `"""Pre-flight sensor validation."""
from ados import drone, sensors

async def main():
    status = await sensors.check_all()
    for name, result in status.items():
        print(f"{name}: {'OK' if result.ok else 'FAIL'} - {result.message}")

    if all(r.ok for r in status.values()):
        print("All sensors OK, ready for flight")
    else:
        print("SENSOR CHECK FAILED")

main()
`,
  },
  {
    id: "script-4",
    name: "survey_pattern.py",
    suite: "Survey",
    lastModified: "2026-03-02T09:45:00+05:30",
    content: `"""Automated survey with camera triggers."""
from ados import drone, camera

async def main():
    await drone.arm()
    await drone.takeoff(80)
    await camera.start_capture(interval_m=10)

    # Survey grid generated from mission plan
    grid = drone.load_mission("survey_area_01")
    await drone.execute_mission(grid)

    await camera.stop_capture()
    print(f"Captured {camera.photo_count} images")
    await drone.rtl()

main()
`,
  },
  {
    id: "script-5",
    name: "quick_test.py",
    lastModified: "2026-03-06T08:00:00+05:30",
    content: `"""Quick arm/disarm test."""
from ados import drone

async def main():
    print("Arming...")
    await drone.arm()
    print(f"Armed: {drone.armed}")
    print(f"Mode: {drone.mode}")
    print(f"Battery: {drone.battery_percent}%")
    await drone.disarm()
    print("Disarmed")

main()
`,
  },
];

// ── Mock Suites ─────────────────────────────────────────────

export const MOCK_SUITES: SuiteInfo[] = [
  {
    id: "suite-sentry",
    name: "Sentry",
    description: "Security patrol, perimeter surveillance, and intrusion detection with real-time alerts",
    icon: "Shield",
    sensorsRequired: ["camera", "gps", "imu"],
    tierRequired: 2,
    version: "1.0.0",
    installed: true,
    active: true,
    category: "security",
  },
  {
    id: "suite-survey",
    name: "Survey",
    description: "Aerial mapping, photogrammetry, LiDAR scanning, and gaussian splatting capture",
    icon: "Map",
    sensorsRequired: ["camera", "gps", "imu", "barometer"],
    tierRequired: 2,
    version: "1.0.0",
    installed: true,
    active: false,
    category: "mapping",
  },
  {
    id: "suite-inspection",
    name: "Inspection",
    description: "Close-range structural assessment with thermal imaging and zoom photography",
    icon: "Search",
    sensorsRequired: ["camera", "gps", "rangefinder"],
    tierRequired: 2,
    version: "0.9.0",
    installed: false,
    active: false,
    category: "inspection",
  },
  {
    id: "suite-agriculture",
    name: "Agriculture",
    description: "Crop health monitoring, NDVI mapping, precision spray, and field analytics",
    icon: "Sprout",
    sensorsRequired: ["camera", "gps", "imu", "barometer"],
    tierRequired: 2,
    version: "0.9.0",
    installed: false,
    active: false,
    category: "agriculture",
  },
  {
    id: "suite-cargo",
    name: "Cargo",
    description: "Autonomous delivery, payload management, drop-zone targeting, and route optimization",
    icon: "PackageCheck",
    sensorsRequired: ["gps", "imu", "rangefinder", "barometer"],
    tierRequired: 3,
    version: "0.8.0",
    installed: false,
    active: false,
    category: "logistics",
  },
  {
    id: "suite-sar",
    name: "SAR",
    description: "Search and rescue with thermal detection, area coverage patterns, and beacon homing",
    icon: "LifeBuoy",
    sensorsRequired: ["camera", "gps", "imu", "rangefinder"],
    tierRequired: 3,
    version: "0.8.0",
    installed: false,
    active: false,
    category: "rescue",
  },
];

// ── Mock Enrollment ─────────────────────────────────────────

export const MOCK_ENROLLMENT: MeshNetEnrollment = {
  enrolled: true,
  droneId: "ados-alpha-1-cm4",
  fleetName: "Alpha Fleet",
  tier: 3,
  enrolledSince: "2026-02-28T10:00:00+05:30",
};

// ── Mock Modules ────────────────────────────────────────────

export interface MockModule {
  name: string;
  version: string;
  installed: boolean;
  description: string;
}

export const MOCK_MODULES: MockModule[] = [
  { name: "mavlink-proxy", version: "1.0.0", installed: true, description: "MAVLink message forwarding and multiplexing" },
  { name: "video-pipeline", version: "1.0.0", installed: true, description: "WFB-ng video stream management" },
  { name: "mqtt-gateway", version: "1.0.0", installed: true, description: "MQTT telemetry bridge to cloud" },
  { name: "suite-runtime", version: "1.0.0", installed: true, description: "Suite YAML manifest loader and executor" },
  { name: "script-executor", version: "1.0.0", installed: true, description: "Python and text command execution engine" },
  { name: "sensor-manager", version: "1.0.0", installed: true, description: "Sensor discovery, configuration, and data routing" },
  { name: "obstacle-avoidance", version: "0.9.0", installed: false, description: "Depth camera obstacle detection and path replanning" },
  { name: "precision-landing", version: "0.8.0", installed: false, description: "ArUco marker and IR beacon precision landing" },
  { name: "swarm-coordinator", version: "0.7.0", installed: false, description: "Multi-drone formation and task distribution" },
];

// ── Mock Network ────────────────────────────────────────────

export const MOCK_PEERS: NetworkPeer[] = [
  { id: "bravo-2", name: "Bravo-2", signal_dbm: -62, last_seen: "2s ago", battery_percent: 78, distance_m: 142, tier: 3, link_type: "WiFi Direct" },
  { id: "echo-5", name: "Echo-5", signal_dbm: -78, last_seen: "5s ago", battery_percent: 45, distance_m: 380, tier: 2, link_type: "LoRa" },
  { id: "delta-3", name: "Delta-3", signal_dbm: -71, last_seen: "3s ago", battery_percent: 92, distance_m: 210, tier: 3, link_type: "WiFi Direct" },
];

export interface MockNetwork {
  mqtt: { connected: boolean; broker: string; messages_sent: number; messages_received: number };
  mesh: { lora: { installed: boolean }; wifi_direct: { enabled: boolean } };
  peers: NetworkPeer[];
}

export const MOCK_NETWORK: MockNetwork = {
  mqtt: { connected: true, broker: "mqtt://fleet.altnautica.com:8883", messages_sent: 14832, messages_received: 9217 },
  mesh: { lora: { installed: false }, wifi_direct: { enabled: false } },
  peers: MOCK_PEERS,
};

// ── Mock Capabilities ──────────────────────────────────────

export function getMockCapabilities(): AgentCapabilities {
  return {
    tier: 4,
    cameras: [
      { name: "USB Camera", type: "usb", device: "/dev/video0", resolution: "1920x1080", fps: 30, streaming: true },
    ],
    compute: {
      npu_available: true,
      npu_runtime: "rknn",
      npu_tops: 6.0,
      npu_utilization_pct: jitter(68, 12),
      gpu_available: false,
    },
    vision: {
      engine_state: "active",
      active_behavior: "follow_target",
      behavior_state: "tracking",
      fps: jitter(18, 2),
      inference_ms: jitter(55, 8),
      model_loaded: "person_v1_small",
      track_count: 2,
      target_locked: true,
      target_confidence: 0.94,
      obstacle_mode: "brake",
      nearest_obstacle_m: 8.2,
      threat_level: "green",
    },
    models: {
      installed: [
        { id: "person_v1", variant: "small", format: "rknn", size_mb: 12, loaded: true },
        { id: "depth_midas_v3", variant: "small", format: "rknn", size_mb: 15, loaded: true },
      ],
      cache_used_mb: 27,
      cache_max_mb: 500,
      registry_url: "https://raw.githubusercontent.com/altnautica/ADOSMissionControl/main/public/models/registry.json",
    },
    features: {
      enabled: ["follow-me", "obstacle-avoidance"],
      active: "follow-me",
    },
  };
}

// ── Mock Logs ───────────────────────────────────────────────

function generateMockLogs(): LogEntry[] {
  const now = new Date();
  const entries: LogEntry[] = [];
  const bootMessages: [string, string, LogEntry["level"]][] = [
    ["agent", "ADOS Drone Agent v0.1.0 starting", "info"],
    ["agent", "Board: Raspberry Pi CM4 (4GB)", "info"],
    ["agent", "OS: Raspberry Pi OS Lite (Bookworm)", "info"],
    ["mavlink-proxy", "Connecting to FC on /dev/ttyAMA0 @ 921600", "info"],
    ["mavlink-proxy", "Heartbeat received: ArduCopter 4.5.7", "info"],
    ["mavlink-proxy", "Parameter sync complete: 1042 params", "info"],
    ["video-pipeline", "WFB-ng initializing on wlan1", "info"],
    ["video-pipeline", "TX power: 29 dBm, channel: 165 (5825 MHz)", "info"],
    ["video-pipeline", "Video pipeline active: 1280x720@30fps H.264", "info"],
    ["mqtt-gateway", "Connecting to mqtt://fleet.altnautica.com:8883", "info"],
    ["mqtt-gateway", "TLS handshake complete, authenticated", "info"],
    ["mqtt-gateway", "Subscribed to fleet/alpha-1/cmd/#", "info"],
    ["suite-runtime", "Loading suite: Sentry — Security Patrol", "info"],
    ["suite-runtime", "Suite manifest validated, 3 sensors required", "info"],
    ["sensor-manager", "Discovered 5 sensors on I2C-1, UART-2, UART-3, SPI-0", "info"],
    ["sensor-manager", "BME280 barometer OK @ 50 Hz", "info"],
    ["sensor-manager", "MPU6050 IMU OK @ 1000 Hz", "info"],
    ["sensor-manager", "BN-880 GPS OK @ 10 Hz, 3D fix", "info"],
    ["sensor-manager", "TFMini-S rangefinder OK @ 100 Hz", "info"],
    ["sensor-manager", "PMW3901 optical flow — quality low (142/255)", "warning"],
    ["script-executor", "Command interface ready on :8080", "info"],
    ["agent", "All services started, uptime monitoring active", "info"],
    ["mavlink-proxy", "Mode changed: STABILIZE -> AUTO", "info"],
    ["mavlink-proxy", "Vehicle armed", "info"],
    ["suite-runtime", "Mission started: patrol_grid_01", "info"],
    ["mqtt-gateway", "Telemetry publishing at 2 Hz", "info"],
    ["sensor-manager", "Rangefinder AGL: 50.2 m", "info"],
    ["video-pipeline", "Stream bitrate: 4.2 Mbps, latency: 42ms", "info"],
    ["mavlink-proxy", "Waypoint 3/12 reached", "info"],
    ["suite-runtime", "Sentry alert: motion detected sector B-4", "warning"],
    ["mqtt-gateway", "Alert published to fleet/alpha-1/alerts", "info"],
    ["agent", "System temp: 45.2C (normal)", "info"],
    ["agent", "CPU: 34%, RAM: 1.2 GB / 4.0 GB", "info"],
    ["mavlink-proxy", "Waypoint 6/12 reached", "info"],
    ["video-pipeline", "Recording: 00:14:32, 3.8 GB", "info"],
    ["sensor-manager", "PMW3901 quality improved (198/255)", "info"],
    ["mavlink-proxy", "Waypoint 9/12 reached", "info"],
    ["mqtt-gateway", "Messages sent: 14832, received: 9217", "info"],
    ["agent", "Battery: 82%, estimated remaining: 18 min", "info"],
  ];

  bootMessages.forEach(([service, message, level], i) => {
    const ts = new Date(now.getTime() - (bootMessages.length - i) * 2000);
    entries.push({ timestamp: ts.toISOString(), level, service, message });
  });

  return entries;
}

const cachedLogs = generateMockLogs();

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

let mockScripts = [...MOCK_SCRIPTS];
let mockSuites = MOCK_SUITES.map((s) => ({ ...s }));

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
    };
  }

  async getServices(): Promise<ServiceInfo[]> {
    await delay(80);
    return [
      { name: "mavlink-proxy", status: "running", pid: 1201, cpu_percent: jitter(8, 3), memory_mb: jitter(45, 5), uptime_seconds: Math.floor((Date.now() - startTime) / 1000) },
      { name: "video-pipeline", status: "running", pid: 1202, cpu_percent: jitter(22, 5), memory_mb: jitter(120, 10), uptime_seconds: Math.floor((Date.now() - startTime) / 1000) },
      { name: "mqtt-gateway", status: "running", pid: 1203, cpu_percent: jitter(3, 1.5), memory_mb: jitter(28, 4), uptime_seconds: Math.floor((Date.now() - startTime) / 1000) },
      { name: "suite-runtime", status: "running", pid: 1204, cpu_percent: jitter(5, 2), memory_mb: jitter(64, 8), uptime_seconds: Math.floor((Date.now() - startTime) / 1000) },
      { name: "script-executor", status: "running", pid: 1205, cpu_percent: jitter(1, 0.5), memory_mb: jitter(18, 3), uptime_seconds: Math.floor((Date.now() - startTime) / 1000) },
      { name: "sensor-manager", status: "running", pid: 1206, cpu_percent: jitter(6, 2), memory_mb: jitter(35, 5), uptime_seconds: Math.floor((Date.now() - startTime) / 1000) },
    ];
  }

  async getSystemResources(): Promise<SystemResources> {
    await delay(50);
    const cpu = jitter(34, 8);
    cpuHistoryBuffer.push(cpu);
    if (cpuHistoryBuffer.length > 60) cpuHistoryBuffer.shift();
    return {
      cpu_percent: cpu,
      memory_percent: jitter(31, 4),
      memory_used_mb: jitter(1240, 80),
      memory_total_mb: 4096,
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
    let logs = cachedLogs;
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

  // ── Suites ──────────────────────────────────────────────

  async getSuites(): Promise<SuiteInfo[]> {
    await delay(60);
    return mockSuites.map((s) => ({ ...s }));
  }

  async installSuite(id: string): Promise<CommandResult> {
    await delay(600);
    const suite = mockSuites.find((s) => s.id === id);
    if (suite) suite.installed = true;
    return { success: true, message: `Suite ${id} installed` };
  }

  async uninstallSuite(id: string): Promise<CommandResult> {
    await delay(400);
    const suite = mockSuites.find((s) => s.id === id);
    if (suite) {
      suite.installed = false;
      suite.active = false;
    }
    return { success: true, message: `Suite ${id} uninstalled` };
  }

  async activateSuite(id: string): Promise<CommandResult> {
    await delay(200);
    mockSuites.forEach((s) => (s.active = s.id === id));
    return { success: true, message: `Suite ${id} activated` };
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

  private _mockProfile: "drone" | "ground_station" = "drone";
  private _mockGroundRole: "direct" | "relay" | "receiver" = "direct";
  private _mockProfileConfirmed = true;

  async getSetupStatus(): Promise<SetupStatus> {
    await delay(40);
    const profile = this._mockProfile;
    const groundRole = profile === "ground_station" ? this._mockGroundRole : "";
    const isDrone = profile === "drone";
    return {
      version: "0.10.1",
      device_id: "demo-0001",
      device_name: "Demo Drone",
      profile,
      ground_role: groundRole,
      setup_complete: true,
      setup_finalized: true,
      completion_percent: 100,
      next_action: "Open Mission Control or revisit any setup step.",
      steps: [
        { id: "welcome", label: "Welcome", state: "complete", detail: "Device identity available", action_label: "", href: "" },
        { id: "profile", label: "Profile", state: "complete", detail: `Confirmed as ${profile}`, action_label: "Choose profile", href: "/setup.html?step=profile" },
        { id: "network", label: "Network", state: "complete", detail: "Local access is available", action_label: "Open Network", href: "/network.html" },
        { id: "hardware_check", label: "Hardware check", state: "complete", detail: "All required components detected.", action_label: "Open hardware check", href: "/setup.html?step=hardware_check" },
        { id: "cloud_choice", label: "Cloud posture", state: "complete", detail: "Connected to https://demo.altnautica.com", action_label: "Choose cloud posture", href: "/setup.html?step=cloud_choice" },
        { id: "pair", label: "Pair with Mission Control", state: "complete", detail: "Device is paired.", action_label: "Enter pairing code", href: "/setup.html?step=pair" },
        ...(isDrone ? [{ id: "mavlink", label: "Flight controller", state: "complete" as const, detail: "MAVLink telemetry is live", action_label: "Open MAVLink", href: "/mavlink.html" }] : []),
        { id: "video", label: "Video", state: "complete", detail: "WHEP video is available", action_label: "Open Video", href: "/video.html" },
        ...(!isDrone ? [{ id: "ground_receiver", label: "Ground receiver", state: "complete" as const, detail: "WFB receiver and mesh role configuration", action_label: "Open Ground station", href: "/ground.html" }] : []),
        { id: "remote_access", label: "Remote access", state: "optional", detail: "Optional cloud or tunnel link", action_label: "Open Remote access", href: "/remote.html" },
        { id: "finish", label: "Finish", state: "complete", detail: "Open Mission Control when local telemetry or video is ready", action_label: "Open Mission Control", href: "" },
      ],
      access_urls: [
        { kind: "setup", label: "Setup webapp", url: "http://demo-drone.local", source: "local", primary: true },
        { kind: "api", label: "Local API", url: "http://demo-drone.local/api", source: "local", primary: false },
      ],
      network: {
        hostname: "demo-drone",
        mdns_host: "ados-demo-0001.local",
        api_port: 8080,
        hotspot_enabled: false,
        hotspot_ssid: "",
        local_ips: ["192.168.4.1"],
      },
      mavlink: {
        connected: isDrone,
        port: isDrone ? "/dev/ttyAMA0" : null,
        baud: isDrone ? 921600 : null,
        websocket_url: "ws://demo-drone.local:8765/",
        public_websocket_url: null,
      },
      video: {
        state: "running",
        whep_url: "http://demo-drone.local:8889/main/whep",
        public_whep_url: null,
        recording: false,
      },
      remote_access: {
        provider: "none",
        enabled: false,
        configured: false,
        status: "disabled",
        public_urls: [],
        error: "",
      },
      services: [],
      telemetry: {},
      cloud_choice: {
        mode: "cloud",
        paired: true,
        pair_code_required: true,
        backend_url: "https://demo.altnautica.com",
        backend_reachable: true,
        last_checked: new Date().toISOString(),
      },
      profile_suggestion: {
        detected: profile,
        ground_role_hint: groundRole === "" ? "direct" : (groundRole as "direct" | "relay" | "receiver"),
        ground_score: profile === "ground_station" ? 7 : 0,
        air_score: isDrone ? 5 : 0,
        mesh_capable: false,
        signals: isDrone
          ? { mavlink_serial: true, oled_i2c: false, buttons_gpio: false, rtl8812: false, uplink: true }
          : { mavlink_serial: false, oled_i2c: true, buttons_gpio: true, rtl8812: true, uplink: true },
        confirmed: this._mockProfileConfirmed,
        detected_at: new Date().toISOString(),
      },
      hardware_check: this._mockHardwareCheck(profile, groundRole),
      skipped_steps: [],
    };
  }

  async getHardwareCheck(): Promise<HardwareCheckStatus> {
    await delay(60);
    return this._mockHardwareCheck(
      this._mockProfile,
      this._mockProfile === "ground_station" ? this._mockGroundRole : "",
    );
  }

  async refreshHardwareCheck(): Promise<HardwareCheckStatus> {
    await delay(150);
    return this._mockHardwareCheck(
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
      this._mockGroundRole = (ground_role ?? "direct") as
        | "direct"
        | "relay"
        | "receiver";
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

  private _mockHardwareCheck(
    profile: "drone" | "ground_station",
    groundRole: string,
  ): HardwareCheckStatus {
    const lastRun = new Date().toISOString();
    if (profile === "drone") {
      return {
        profile: "drone",
        ground_role: "",
        items: [
          { id: "board", label: "Companion compute", required: true, state: "ok", detail: "Raspberry Pi CM4 (CM4104032). 4 cores, 4096 MB RAM, tier 3.", fix_hint: "" },
          { id: "fc", label: "Flight controller (MAVLink)", required: true, state: "ok", detail: "ArduPilot 4.5.7 on /dev/ttyAMA0 @ 921600 baud", fix_hint: "" },
          { id: "camera", label: "Camera", required: true, state: "ok", detail: "1 detected (1 csi). Primary: Pi Camera v3 at /dev/video0", fix_hint: "" },
          { id: "radio_wfb", label: "WFB radio adapter", required: false, state: "ok", detail: "1 adapter(s) detected: RTL8812EU WiFi (Video Link)", fix_hint: "" },
          { id: "radio_4g", label: "4G LTE modem", required: false, state: "missing", detail: "No cellular modem detected by ModemManager.", fix_hint: "Optional. Plug in a USB LTE modem if you need cellular fallback." },
          { id: "gps", label: "GPS receiver", required: false, state: "warning", detail: "GPS auto-detection is best-effort. Trust MAVLink GPS_RAW once FC is connected.", fix_hint: "" },
        ],
        last_run: lastRun,
      };
    }
    const isMesh = groundRole === "relay" || groundRole === "receiver";
    return {
      profile: "ground_station",
      ground_role: groundRole,
      items: [
        { id: "board", label: "Companion compute", required: true, state: "ok", detail: "Raspberry Pi 4B. 4 cores, 4096 MB RAM, tier 3.", fix_hint: "" },
        { id: "radio_wfb", label: "WFB radio adapter", required: true, state: "ok", detail: "1 adapter(s) detected: RTL8812EU WiFi (Video Link)", fix_hint: "" },
        { id: "mesh_dongle", label: "Mesh second-radio dongle", required: isMesh, state: isMesh ? "missing" : "warning", detail: "No second USB wireless adapter detected.", fix_hint: "Mesh roles need a second USB WiFi adapter for batman-adv carrier." },
        { id: "oled", label: "OLED display", required: false, state: "ok", detail: "SSD1306/SH1106 detected on I2C bus 1.", fix_hint: "" },
        { id: "buttons", label: "Front-panel buttons", required: false, state: "ok", detail: "Four buttons read idle-high on default GPIOs.", fix_hint: "" },
        { id: "hdmi", label: "HDMI output", required: false, state: "warning", detail: "HDMI port present but no display connected.", fix_hint: "Optional. Plug in an HDMI display for the kiosk view." },
        { id: "joystick", label: "Joystick / gamepad", required: false, state: "warning", detail: "No /dev/input/js* devices detected.", fix_hint: "Optional. Plug in a USB gamepad or RC controller." },
        { id: "uplink", label: "Uplink to internet", required: false, state: "ok", detail: "Active via ethernet/USB.", fix_hint: "" },
      ],
      last_run: lastRun,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
