/**
 * @module AgentConnectionClientManagerSlice
 * @description Client lifecycle: AgentClient construction, polling loop with
 * tab-visibility pause, consolidated-endpoint preference with parallel
 * fallback, and full disconnect that clears every dependent store.
 * @license GPL-3.0-only
 */

import { AgentClient } from "@/lib/agent/client";
import type { AgentStatus } from "@/lib/agent/types";
import { inferCapabilities } from "@/lib/agent/infer-capabilities";
import { useAgentSystemStore } from "../agent-system-store";
import { useAgentPeripheralsStore } from "../agent-peripherals-store";
import { useAgentScriptsStore } from "../agent-scripts-store";
import { useVideoStore } from "../video-store";
import { useAgentCapabilitiesStore } from "../agent-capabilities-store";
import type {
  ClientManagerSlice,
  AgentConnectionSliceCreator,
} from "./types";

// Module-level cleanup function for the tab visibility listener. Lives outside
// the store because Zustand's strict typing doesn't allow ad-hoc extra fields.
let _visibilityCleanup: (() => void) | undefined;

export const clientManagerSlice: AgentConnectionSliceCreator<
  ClientManagerSlice
> = (set, get) => ({
  async connect(url, apiKey) {
    let client: AgentClient;
    const resolvedKey = apiKey ?? get().apiKey;
    if (url === "mock://demo") {
      const { MockAgentClient } = await import("@/mock/mock-agent");
      client = new MockAgentClient() as unknown as AgentClient;
    } else {
      client = new AgentClient(url, resolvedKey);
    }
    set({ agentUrl: url, apiKey: resolvedKey, client, connectionError: null });
    try {
      const status = await client.getStatus();
      set({ connected: true });
      // Derive MAVLink WebSocket URL from agent REST URL.
      // Agent REST is on :8080, MAVLink WebSocket is on :8765.
      try {
        const agentUrlObj = new URL(url);
        const mavWsUrl = `ws://${agentUrlObj.hostname}:8765/`;
        set({ mavlinkUrl: mavWsUrl });
      } catch { /* ignore invalid URL */ }
      useAgentSystemStore.getState().setStatus(status);
      // Fetch initial data immediately so tabs aren't empty for 3s.
      useAgentSystemStore.getState().fetchServices();
      useAgentSystemStore.getState().fetchResources();
      useAgentSystemStore.getState().fetchLogs();
      // Populate capabilities (mock or real, with inference fallback).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyClient = client as any;
      let capsLoaded = false;
      if (typeof anyClient.getCapabilities === "function") {
        try {
          const caps = await anyClient.getCapabilities();
          if (caps) {
            useAgentCapabilitiesStore.getState().setCapabilities(caps);
            capsLoaded = true;
          }
        } catch { /* capabilities optional */ }
      }
      if (!capsLoaded) {
        // Agent doesn't have capabilities API; infer from board SoC + peripherals.
        const peripherals = useAgentPeripheralsStore.getState().peripherals;
        const inferred = inferCapabilities(status, peripherals);
        if (inferred) useAgentCapabilitiesStore.getState().setCapabilities(inferred);
      }
      get().startPolling();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      set({ connected: false, connectionError: msg, client: null, agentUrl: null });
    }
  },

  disconnect() {
    get().stopPolling();
    set({
      connected: false,
      client: null,
      agentUrl: null,
      apiKey: null,
      connectionError: null,
      cloudMode: false,
      cloudDeviceId: null,
      mqttConnected: false,
      lastCloudUpdate: null,
      pollInterval: null,
      mavlinkUrl: null,
      consecutiveFailures: 0,
    });
    // Clear all other stores.
    useAgentSystemStore.getState().clear();
    useAgentPeripheralsStore.getState().clear();
    useAgentScriptsStore.getState().clear();
  },

  startPolling() {
    get().stopPolling();

    // Track whether the consolidated endpoint is available (newer agents).
    // Once confirmed, skip the 4-request fallback path.
    let useFullEndpoint: boolean | null = null; // null = untried

    const poll = async () => {
      // Pause polling when browser tab is hidden to save bandwidth/battery.
      if (typeof document !== "undefined" && document.hidden) return;

      const client = get().client;
      if (!client) return;

      try {
        // Try consolidated endpoint first (1 request instead of 4).
        if (useFullEndpoint !== false && typeof client.getFullStatus === "function") {
          const full = await client.getFullStatus();
          if (full) {
            useFullEndpoint = true;
            // Map consolidated response to the same stores as the 4-endpoint path.
            const status = {
              version: full.version,
              uptime_seconds: full.uptime_seconds,
              board: full.board,
              health: full.health,
              fc_connected: full.fc_connected,
              fc_port: full.fc_port,
              fc_baud: full.fc_baud,
            };
            useAgentSystemStore.getState().setStatus(status as AgentStatus);
            if (full.services) {
              // Map service state field name for compatibility.
              const mapped = full.services.map((s: { name: string; state: string; task_done: boolean; uptimeSeconds: number }) => ({
                ...s,
                status: s.state,
              }));
              useAgentSystemStore.setState({ services: mapped as never[] });
            }
            if (full.resources) {
              useAgentSystemStore.setState({
                resources: full.resources as never,
                lastUpdatedAt: Date.now(),
                stale: false,
              });
            }
            if (full.video) {
              useVideoStore.getState().setAgentVideoStatus(
                full.video.state,
                full.video.whep_url,
              );
            }
            // Populate capabilities from consolidated response or infer from legacy data.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fullAny = full as any;
            if (fullAny.capabilities) {
              // Agent has capabilities API; normalize and store (handles shape differences).
              useAgentCapabilitiesStore.getState().setCapabilities(fullAny.capabilities);
            } else {
              // Agent doesn't have capabilities API; infer from board SoC + peripherals.
              const peripherals = useAgentPeripheralsStore.getState().peripherals;
              const inferred = inferCapabilities(status as AgentStatus, peripherals);
              if (inferred) {
                useAgentCapabilitiesStore.getState().setCapabilities(inferred);
              }
            }
            // Fallback: if capabilities store still has no cameras but we know board SoC,
            // re-infer on every poll to pick up peripherals that loaded after first poll.
            const capState = useAgentCapabilitiesStore.getState();
            if (capState.cameras.length === 0 && (status as AgentStatus)?.board?.soc) {
              const peripherals = useAgentPeripheralsStore.getState().peripherals;
              if (peripherals.length > 0) {
                const inferred = inferCapabilities(status as AgentStatus, peripherals);
                if (inferred && inferred.cameras.length > 0) {
                  useAgentCapabilitiesStore.getState().setCapabilities(inferred);
                }
              }
            }
            get().noteFetchSuccess();
            return;
          }
          // 404 or null = agent doesn't support it.
          useFullEndpoint = false;
        }

        // Fallback: parallel requests for older agents.
        await Promise.all([
          useAgentSystemStore.getState().fetchStatus(),
          useAgentSystemStore.getState().fetchServices(),
          useAgentSystemStore.getState().fetchResources(),
        ]);

        // Video status (may not exist on all agents).
        if (typeof client.getVideoStatus === "function") {
          client.getVideoStatus().then((video) => {
            if (video) {
              const deps = video.dependencies
                ? Object.fromEntries(
                    Object.entries(video.dependencies).map(([k, v]) => [k, { found: v.found }]),
                  )
                : undefined;
              useVideoStore.getState().setAgentVideoStatus(video.state, video.whep_url, deps);
            }
          }).catch(() => {});
        }
        get().noteFetchSuccess();
      } catch {
        get().noteFetchFailure();
      }
    };

    // Run first poll immediately, then every 3s.
    poll();
    const interval = setInterval(poll, 3000);
    set({ pollInterval: interval });

    // Pause/resume on tab visibility change.
    if (typeof document !== "undefined") {
      const onVisibility = () => {
        if (!document.hidden) {
          // Tab became visible: poll immediately for fresh data.
          poll();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      // Store the cleanup function.
      _visibilityCleanup = () => {
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
  },

  stopPolling() {
    const { pollInterval } = get();
    if (pollInterval) {
      clearInterval(pollInterval);
      set({ pollInterval: null });
    }
    // Clean up visibility listener.
    if (_visibilityCleanup) {
      _visibilityCleanup();
      _visibilityCleanup = undefined;
    }
  },

  clear() {
    get().disconnect();
  },
});
