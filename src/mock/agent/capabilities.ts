/**
 * @module mock/agent/capabilities
 * @description Mock capability snapshot used by the demo agent.
 * Reflects an active follow-target run on a tier-4 drone with a small
 * person-detection model loaded on the NPU, plus a fully-populated
 * vision-nav navigation block so demo-mode renders every Navigation
 * tab surface without hardware. Tests and screenshot fixtures can
 * call ``getMockCapabilities("vio_openvins")`` etc. to render the
 * non-default mode states.
 * @license GPL-3.0-only
 */

import type {
  AgentCapabilities,
  NavigationCapability,
} from "@/lib/agent/feature-types";
import type { RadioState } from "@/lib/api/ground-station/types";
import { jitter } from "./utils";

/** Demo air-side radio snapshot so the Radio / Network Health panel renders
 * its live indicators in `npm run demo`: a US-domain link locked on its home
 * channel (so it reads "pinned"), TX active with a ground decode, and an
 * injection-capable adapter. The normalizer fills any field omitted here. */
const MOCK_RADIO: Partial<RadioState> = {
  state: "connected",
  iface: "wlan1",
  driver: "rtl88x2eu",
  channel: 149,
  freqMhz: 5745,
  homeChannel: 149,
  band: "u-nii-3",
  regDomain: "US",
  monitorActive: true,
  txActive: true,
  peerLink: "linked",
  acquireState: "locked",
  channelLocked: true,
  adapterChipset: "RTL8812EU",
  adapterInjectionOk: true,
  rssiDbm: -44,
  paired: true,
};

type MockNavigationMode =
  | "off"
  | "optical_flow"
  | "optical_flow_degraded"
  | "vio_openvins"
  | "vio_vins_fusion"
  | "hybrid_of_plus_vio";

const AVAILABLE_ESTIMATORS: string[] = [
  "off",
  "optical_flow",
  "optical_flow_degraded",
  "vio_openvins",
  "vio_vins_fusion",
  "hybrid_of_plus_vio",
];

function mockNavigationFor(mode: MockNavigationMode): NavigationCapability {
  // Per-mode realism: the values mirror what the agent's HealthPublisher
  // would emit at steady state for that mode. The numbers jitter on each
  // call so the live demo's sparklines have movement.
  const base: NavigationCapability = {
    opticalFlowSupported: true,
    vioSupported: mode.startsWith("vio_") || mode === "hybrid_of_plus_vio",
    rangefinderTopology: mode === "optical_flow_degraded" ? null : "companion",
    recommendedCameraId: "/dev/video0",
    companionState: "active",
    mode,
    availableEstimators: AVAILABLE_ESTIMATORS,
    estimatorState: "converged",
    imuSource: "mavlink-scaled-imu2",
    imuRateHz: 100,
    cameraIntrinsicsLoaded: mode === "off" ? false : true,
    cameraImuSyncOffsetMs: jitter(4.2, 1.0),
  };

  if (mode === "off") {
    return {
      ...base,
      estimatorState: "off",
      flowQuality: undefined,
      flowRateHz: undefined,
      flowDistanceM: undefined,
      flowScaleSource: null,
      estimatorFeatureCount: undefined,
      estimatorDriftEstimateM: undefined,
    };
  }
  if (mode === "optical_flow") {
    return {
      ...base,
      flowQuality: Math.round(jitter(185, 12)),
      flowRateHz: jitter(29.5, 0.5),
      flowDistanceM: jitter(1.25, 0.05),
      flowScaleSource: "rangefinder",
    };
  }
  if (mode === "optical_flow_degraded") {
    return {
      ...base,
      rangefinderTopology: null,
      flowQuality: Math.round(jitter(120, 15)),
      flowRateHz: jitter(29.5, 0.5),
      flowDistanceM: jitter(1.5, 0.1),
      flowScaleSource: "baro",
      estimatorState: "degraded",
    };
  }
  if (mode === "vio_openvins") {
    return {
      ...base,
      flowQuality: undefined,
      flowRateHz: undefined,
      flowDistanceM: null,
      flowScaleSource: null,
      estimatorFeatureCount: Math.round(jitter(78, 8)),
      estimatorDriftEstimateM: jitter(0.18, 0.04),
      vioState: "active",
      vioQuality: Math.round(jitter(220, 10)),
      vioResetCounter: 0,
    };
  }
  if (mode === "vio_vins_fusion") {
    return {
      ...base,
      flowQuality: undefined,
      flowRateHz: undefined,
      flowDistanceM: null,
      flowScaleSource: null,
      estimatorFeatureCount: Math.round(jitter(120, 12)),
      estimatorDriftEstimateM: jitter(0.12, 0.03),
      vioState: "active",
      vioQuality: Math.round(jitter(240, 8)),
      vioResetCounter: 0,
    };
  }
  // hybrid_of_plus_vio: both halves contribute. Slightly higher CPU
  // posture is implied by the fixed compute block above.
  return {
    ...base,
    flowQuality: Math.round(jitter(180, 15)),
    flowRateHz: jitter(29.5, 0.5),
    flowDistanceM: jitter(1.25, 0.05),
    flowScaleSource: "rangefinder",
    estimatorFeatureCount: Math.round(jitter(78, 8)),
    estimatorDriftEstimateM: jitter(0.15, 0.04),
    vioState: "active",
    vioQuality: Math.round(jitter(220, 10)),
    vioResetCounter: 0,
  };
}

export function getMockCapabilities(
  mode: MockNavigationMode = "optical_flow",
): AgentCapabilities {
  // `radio` is read loosely off the raw payload by the capability
  // normalizer (it is not a declared AgentCapabilities field), so attach it
  // alongside the typed block. `radioStackState` + `macStability` ARE
  // declared, so they sit in the typed object directly.
  const caps: AgentCapabilities & { radio: Partial<RadioState> } = {
    radio: MOCK_RADIO,
    radioStackState: "ok",
    macStability: {
      adapters: [
        {
          name: "wlan0",
          vidpid: "a69c:8d81",
          state: "pinned",
          source: "learned",
          pinnedMac: "02:c6:75:83:1a:3e",
          lastSeenMac: "02:c6:75:83:1a:3e",
        },
      ],
    },
    // A degraded link (up but no data path) exercises the amber card path.
    managementLink: {
      state: "degraded",
      iface: "eth0",
      transport: "ethernet",
      backend: "networkd",
      carrier: true,
      hasLease: true,
      gatewayReachable: false,
      repairing: true,
      lastRung: "renew_dhcp",
      lastRepairAt: null,
      repairsInWindow: 1,
    },
    // On the WiFi heartbeat reach-back exercises the amber degraded banner.
    mgmtLinkMode: "wifi_heartbeat",
    mgmtFailoverIface: "wlan0",
    mgmtFailoverReason: "primary_carrier_down",
    // Mid-rehome exercises the USB-rehome indicator.
    usbRehomeState: "rehoming",
    usbRehomeAttempts: 1,
    usbRehomeLastResult: "retry",
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
    navigation: mockNavigationFor(mode),
    // Demo agent reports the native runtime so the RuntimeModeBadge
    // renders in `npm run demo`.
    runtimeMode: "native",
  };
  return caps;
}
