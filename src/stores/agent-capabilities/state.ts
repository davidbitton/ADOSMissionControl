/**
 * @module AgentCapabilities/State
 * @description Zustand store body for the per-drone agent-capabilities slice.
 * The normalizer + per-field derivers live in `./normalizer`; this file only
 * holds the create() call, the initial state, and the action implementations.
 *
 * @license GPL-3.0-only
 */

import { create } from "zustand";

import type { AgentCapabilities } from "@/lib/agent/feature-types";

import {
  DEFAULT_COMPUTE,
  DEFAULT_MODELS,
  DEFAULT_VISION,
  normalizeCapabilities,
  normalizeRadio,
} from "./normalizer";
import {
  deriveCloudRelayUrl,
  deriveCloudflareUrl,
  deriveFoxgloveBindFailed,
  deriveManualConnectionUrls,
  deriveMavlinkWsUrlPrev,
  derivePairingCodeExpiresAt,
  deriveProfile,
  deriveProfileSource,
  deriveRole,
  deriveRos2State,
  deriveSetupState,
  deriveVideoRestartAttempts,
  deriveWfbFailoverState,
} from "./derivers";
import type {
  AgentCapabilitiesState,
  AgentCapabilitiesStore,
} from "./types";

const INITIAL_STATE: AgentCapabilitiesState = {
  tier: 0,
  cameras: [],
  compute: DEFAULT_COMPUTE,
  vision: DEFAULT_VISION,
  models: DEFAULT_MODELS,
  ros2State: "absent",
  setupState: undefined,
  profileSource: undefined,
  profile: "drone",
  role: undefined,
  display: undefined,
  displayType: undefined,
  videoLocalTap: undefined,
  videoRecording: undefined,
  uiTheme: undefined,
  videoPipeline: undefined,
  radio: null,
  videoRestartAttempts: 0,
  foxgloveBindFailed: false,
  pairingCodeExpiresAt: null,
  mavlinkWsUrlPrev: null,
  wfbFailoverState: "local",
  manualConnectionUrls: null,
  cloudRelayUrl: null,
  cloudflareUrl: null,
  navigation: undefined,
  peerDeviceId: null,
  peerRole: null,
  peerChannel: null,
  peerRssiDbm: null,
  peerSeenAtUnix: null,
  cameraState: null,
  canBuses: undefined,
  loaded: false,
};

export const useAgentCapabilitiesStore = create<AgentCapabilitiesStore>(
  (set) => ({
    ...INITIAL_STATE,

    setCapabilities(caps: AgentCapabilities | Record<string, unknown>) {
      const normalized = normalizeCapabilities(caps);

      // Wire-contract identity + ROS environment derive cleanly from
      // the raw payload.
      const ros2State = deriveRos2State(caps);
      const setupState = deriveSetupState(caps);
      const profileSource = deriveProfileSource(caps);
      const profile = deriveProfile(caps);
      const role = deriveRole(caps);

      // Air-side radio snapshot. Field name is camelCase here. The cloud
      // relay action remaps the agent's snake_case wire keys before the
      // payload reaches Mission Control state, so the store accepts the
      // already-camelCased shape directly.
      const rawRadio = (caps as { radio?: unknown }).radio;
      const radio = normalizeRadio(rawRadio);

      // Heartbeat health surfaces. Each is forward-permissive: the
      // store keeps the prior value when the heartbeat omits a field
      // (so a single sparse capabilities payload can't reset a count
      // back to zero). The full cloud heartbeat in CloudStatusBridge
      // always sets all four explicitly, so this branch only matters
      // when an /api/capabilities call lands without them.
      const videoRestartAttempts = deriveVideoRestartAttempts(caps);
      const foxgloveBindFailed = deriveFoxgloveBindFailed(caps);
      const pairingCodeExpiresAt = derivePairingCodeExpiresAt(caps);
      const mavlinkWsUrlPrev = deriveMavlinkWsUrlPrev(caps);
      const manualConnectionUrls = deriveManualConnectionUrls(caps);
      const cloudRelayUrl = deriveCloudRelayUrl(caps);
      const cloudflareUrl = deriveCloudflareUrl(caps);
      const wfbFailoverState = deriveWfbFailoverState(caps);

      set((state) => ({
        tier: normalized.tier,
        cameras: normalized.cameras,
        compute: normalized.compute,
        vision: normalized.vision,
        models: normalized.models,
        ros2State,
        setupState,
        profileSource,
        profile,
        role: role === undefined ? state.role : role,
        display: normalized.display,
        // Forward-permissive: a sparse payload that omits the field
        // keeps whatever the store had. CloudStatusBridge sets this
        // every tick when the agent emits the enrichment, so the prior
        // value only carries when an /api/capabilities call lands
        // without it.
        displayType:
          normalized.displayType === undefined
            ? state.displayType
            : normalized.displayType,
        videoLocalTap: normalized.videoLocalTap,
        videoRecording: normalized.videoRecording,
        uiTheme: normalized.uiTheme,
        videoPipeline: normalized.videoPipeline,
        // Forward-permissive: a sparse heartbeat that omits the
        // navigation block keeps whatever the store had on the prior
        // tick. CloudStatusBridge always passes the freshest block when
        // the agent emits one, so the prior value only survives when an
        // /api/capabilities call lands without it.
        navigation: normalized.navigation ?? state.navigation,
        radio,
        // Forward-permissive merges: keep the prior value when the
        // payload omits the field. CloudStatusBridge always sets all
        // four explicitly, so prior values only carry over when an
        // /api/capabilities call lands without them.
        videoRestartAttempts:
          videoRestartAttempts ?? state.videoRestartAttempts,
        foxgloveBindFailed:
          foxgloveBindFailed ?? state.foxgloveBindFailed,
        pairingCodeExpiresAt:
          pairingCodeExpiresAt === undefined
            ? state.pairingCodeExpiresAt
            : pairingCodeExpiresAt,
        mavlinkWsUrlPrev:
          mavlinkWsUrlPrev === undefined
            ? state.mavlinkWsUrlPrev
            : mavlinkWsUrlPrev,
        wfbFailoverState:
          wfbFailoverState === undefined
            ? state.wfbFailoverState
            : wfbFailoverState,
        manualConnectionUrls:
          manualConnectionUrls === undefined
            ? state.manualConnectionUrls
            : manualConnectionUrls,
        cloudRelayUrl:
          cloudRelayUrl === undefined ? state.cloudRelayUrl : cloudRelayUrl,
        cloudflareUrl:
          cloudflareUrl === undefined ? state.cloudflareUrl : cloudflareUrl,
        // Peer presence — sparse heartbeats preserve the prior value
        // until the agent's 60s staleness window drops it explicitly.
        peerDeviceId:
          normalized.peerDeviceId === undefined
            ? state.peerDeviceId
            : normalized.peerDeviceId,
        peerRole:
          normalized.peerRole === undefined
            ? state.peerRole
            : normalized.peerRole,
        peerChannel:
          normalized.peerChannel === undefined
            ? state.peerChannel
            : normalized.peerChannel,
        peerRssiDbm:
          normalized.peerRssiDbm === undefined
            ? state.peerRssiDbm
            : normalized.peerRssiDbm,
        peerSeenAtUnix:
          normalized.peerSeenAtUnix === undefined
            ? state.peerSeenAtUnix
            : normalized.peerSeenAtUnix,
        cameraState:
          normalized.cameraState === undefined
            ? state.cameraState
            : normalized.cameraState,
        // Forward-permissive: a sparse heartbeat that omits the
        // canBuses block keeps whatever the store had on the prior
        // tick. The agent only emits the field once it has cached at
        // least one CAN_P*_DRIVER / CAN_P*_BITRATE / CAN_D*_PROTOCOL
        // value, so the warmup window naturally falls back to "no
        // CAN data yet" via `undefined`.
        canBuses:
          normalized.canBuses === undefined
            ? state.canBuses
            : normalized.canBuses,
        loaded: true,
      }));
    },

    clear() {
      set({ ...INITIAL_STATE });
    },
  }),
);
