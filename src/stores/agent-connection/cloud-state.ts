/**
 * @module AgentConnectionCloudStateSlice
 * @description Cloud-mode connection state: device ID, MQTT readiness, last
 * cloud heartbeat timestamp, and the cloud command relay channel that the
 * MQTT bridge component listens on.
 * @license GPL-3.0-only
 */

import { useAgentSystemStore } from "../agent-system-store";
import { usePairingStore } from "../pairing-store";
import type {
  CloudStateSlice,
  AgentConnectionSliceCreator,
} from "./types";
import { MAX_CPU_HISTORY } from "./types";

/** Build a LAN URL from a paired-drone record when the agent's hostname or
 * cached IP is known. Returns null when no usable host is available; callers
 * fall back to the Convex heartbeat metadata. */
function resolveLanAgentUrl(deviceId: string): string | null {
  const pairedDrones = usePairingStore.getState().pairedDrones;
  const match = pairedDrones.find((d) => d.deviceId === deviceId);
  if (!match) return null;
  const host = match.mdnsHost || match.lastIp;
  if (!host) return null;
  return `http://${host}:8080`;
}

/** Look up the paired drone's API key for direct LAN HTTP calls. */
function resolvePairedApiKey(deviceId: string): string | null {
  const match = usePairingStore
    .getState()
    .pairedDrones.find((d) => d.deviceId === deviceId);
  return match?.apiKey ?? null;
}

export const cloudStateSlice: AgentConnectionSliceCreator<CloudStateSlice> = (
  set,
  get,
) => ({
  cloudMode: false,
  cloudDeviceId: null,
  mqttConnected: false,
  lastCloudUpdate: null,

  connectCloud(deviceId) {
    get().stopPolling();
    // Pre-populate the LAN agent URL from the cached paired-drone record so
    // every downstream consumer (video-latency poll, clock-offset probe,
    // transport cascade, WHEP fallback) can attempt the agent directly
    // before relying on the Convex heartbeat. The Convex subscription stays
    // active as a fallback when the agent isn't reachable on the LAN.
    const lanUrl = resolveLanAgentUrl(deviceId);
    const lanKey = resolvePairedApiKey(deviceId);
    set({
      cloudMode: true,
      cloudDeviceId: deviceId,
      connected: true,
      connectionError: null,
      agentUrl: lanUrl,
      apiKey: lanKey,
      client: null,
      mavlinkUrl: null,
      // Give the watchdog a grace period so it doesn't immediately re-flip
      // the header to offline against the old stale timestamp.
      lastCloudUpdate: Date.now(),
      consecutiveFailures: 0,
    });
    // Reset the freshness clock to "unknown" so the UI stops showing
    // stale/offline treatment while we wait for the first fresh heartbeat.
    // getFreshness(null) returns state: "unknown" which every consumer
    // treats as live-neutral (no dim, no banner, no "last seen Xm ago" chip).
    // The next heartbeat (or the watchdog at t+STALE_THRESHOLD_MS) will
    // reinstate the correct state.
    useAgentSystemStore.setState({ lastUpdatedAt: null, stale: false });
  },

  sendCloudCommand(command, args) {
    const { cloudDeviceId } = get();
    if (!cloudDeviceId) return;
    window.dispatchEvent(new CustomEvent("cloud-command", {
      detail: { deviceId: cloudDeviceId, command, args },
    }));
  },

  setCloudStatus(status, dataTimestamp) {
    const systemStore = useAgentSystemStore.getState();
    systemStore.setStatus(status);
    const cpuHistory = [...systemStore.cpuHistory, status.health.cpu_percent];
    if (cpuHistory.length > MAX_CPU_HISTORY) cpuHistory.shift();
    const memoryHistory = [
      ...systemStore.memoryHistory,
      status.health.memory_percent,
    ];
    if (memoryHistory.length > MAX_CPU_HISTORY) memoryHistory.shift();
    useAgentSystemStore.setState({ cpuHistory, memoryHistory });
    // Use the actual data timestamp (when the agent last pushed) instead of
    // Date.now(). This ensures the staleness watchdog in CloudStatusBridge
    // correctly detects offline agents whose Convex row is stale.
    set({ lastCloudUpdate: dataTimestamp ?? Date.now() });
  },

  setMqttConnected(connected) {
    set({ mqttConnected: connected });
  },
});
