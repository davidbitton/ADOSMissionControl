/**
 * @module AgentConnectionClientManagerSlice
 * @description Client lifecycle: AgentClient construction, polling loop with
 * tab-visibility pause, consolidated-endpoint preference with parallel
 * fallback, and full disconnect that clears every dependent store.
 * @license GPL-3.0-only
 */

import { AgentClient, normaliseSystemResources } from "@/lib/agent/client";
import type { AgentStatus, ServiceInfo } from "@/lib/agent/types";
import { inferCapabilities } from "@/lib/agent/infer-capabilities";
import { useAgentSystemStore } from "../agent-system-store";
import { useAgentPeripheralsStore } from "../agent-peripherals-store";
import { useAgentScriptsStore } from "../agent-scripts-store";
import { useVideoStore } from "../video-store";
import { useAgentCapabilitiesStore } from "../agent-capabilities-store";
import { useLocalNodesStore } from "../local-nodes-store";
import type {
  ClientManagerSlice,
  AgentConnectionSliceCreator,
} from "./types";

/** Build an `http://<ipv4>:<port>` URL from a base URL by swapping the
 * hostname. Returns null if the input URL or the IPv4 candidate is
 * unusable. */
function buildIpv4Fallback(baseUrl: string, ipv4: string): string | null {
  if (!ipv4 || !/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) return null;
  try {
    const u = new URL(baseUrl);
    if (u.hostname === ipv4) return null; // same address — no fallback gain
    u.hostname = ipv4;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

// Module-level cleanup function for the tab visibility listener. Lives outside
// the store because Zustand's strict typing doesn't allow ad-hoc extra fields.
let _visibilityCleanup: (() => void) | undefined;

export const clientManagerSlice: AgentConnectionSliceCreator<
  ClientManagerSlice
> = (set, get) => ({
  async connect(url, apiKey) {
    const resolvedKey = apiKey ?? get().apiKey;

    // Attempt a real-agent connect at the given URL. Returns null on
    // success (state is set and polling started); returns the error
    // message string on failure so the caller can decide whether to
    // try a fallback.
    async function attempt(
      attemptUrl: string,
    ): Promise<string | null> {
      let client: AgentClient;
      if (attemptUrl === "mock://demo") {
        const { MockAgentClient } = await import("@/mock/mock-agent");
        client = new MockAgentClient() as unknown as AgentClient;
      } else {
        client = new AgentClient(attemptUrl, resolvedKey);
      }
      set({
        agentUrl: attemptUrl,
        apiKey: resolvedKey,
        client,
        connectionError: null,
      });
      try {
        const status = await client.getStatus();
        set({ connected: true });
        try {
          const agentUrlObj = new URL(attemptUrl);
          const mavWsUrl = `ws://${agentUrlObj.hostname}:8765/`;
          set({ mavlinkUrl: mavWsUrl });
        } catch { /* ignore invalid URL */ }
        useAgentSystemStore.getState().setStatus(status);
        useAgentSystemStore.getState().fetchServices();
        useAgentSystemStore.getState().fetchResources();
        useAgentSystemStore.getState().fetchLogs();
        const clientWithCaps = client as unknown as {
          getCapabilities?: () => Promise<unknown>;
        };
        let capsLoaded = false;
        if (typeof clientWithCaps.getCapabilities === "function") {
          try {
            const caps = await clientWithCaps.getCapabilities();
            if (caps && typeof caps === "object") {
              useAgentCapabilitiesStore
                .getState()
                .setCapabilities(caps as Record<string, unknown>);
              capsLoaded = true;
            }
          } catch { /* capabilities optional */ }
        }
        if (!capsLoaded) {
          const peripherals = useAgentPeripheralsStore.getState().peripherals;
          const inferred = inferCapabilities(status, peripherals);
          if (inferred)
            useAgentCapabilitiesStore.getState().setCapabilities(inferred);
        }
        get().startPolling();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Connection failed";
      }
    }

    const firstError = await attempt(url);
    if (firstError === null) return; // success

    // First attempt failed. If this URL corresponds to a LAN-paired
    // node that has a server-resolved IPv4 hint stored, try that
    // address once before surfacing the error. The browser can fail
    // to resolve .local hostnames even when the agent is reachable.
    let local = useLocalNodesStore
      .getState()
      .nodes.find((n) => n.hostname === url);
    let fallbackUrl =
      local?.ipv4 != null ? buildIpv4Fallback(url, local.ipv4) : null;

    // Backfill: pre-schema-v2 pair entries don't carry an `ipv4`. If
    // the failure left us without a fallback target but we DO have a
    // local node entry, ask the server-side mDNS browse for the
    // device's IPv4 and try it. Successful backfills are persisted
    // so subsequent clicks skip the failed round-trip.
    if (!fallbackUrl && local) {
      try {
        const expectedHost = new URL(url).hostname.replace(/\.$/, "");
        const expectedMdns = (local.mdnsHost ?? "").replace(/\.$/, "");
        const r = await fetch("/api/lan-pair/discover");
        if (r.ok) {
          const data = (await r.json()) as {
            agents?: Array<{ host: string; ipv4?: string }>;
          };
          const match = data.agents?.find(
            (a) => a.host === expectedHost || a.host === expectedMdns,
          );
          if (match?.ipv4) {
            useLocalNodesStore
              .getState()
              .addNode({ ...local, ipv4: match.ipv4 });
            local = useLocalNodesStore
              .getState()
              .nodes.find((n) => n.deviceId === local!.deviceId);
            fallbackUrl = buildIpv4Fallback(url, match.ipv4);
          }
        }
      } catch { /* discover failed; surface firstError below */ }
    }

    if (fallbackUrl) {
      const secondError = await attempt(fallbackUrl);
      if (secondError === null) {
        // Persist the working URL back to the store so future clicks
        // hit it directly without paying the failed-mDNS round-trip.
        useLocalNodesStore.getState().addNode({
          ...local!,
          hostname: fallbackUrl,
          lastSeenAt: Date.now(),
        });
        return;
      }
      // Both attempts failed. Surface the second (more informative)
      // error, which describes the IPv4 attempt.
      set({
        connected: false,
        connectionError: `${firstError} (also tried ${fallbackUrl}: ${secondError})`,
        client: null,
        agentUrl: null,
      });
      return;
    }

    // No fallback available — surface the original error.
    set({
      connected: false,
      connectionError: firstError,
      client: null,
      agentUrl: null,
    });
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
              // Map the consolidated service shape (`state` + camelCase
              // metric fields) into the canonical ServiceInfo the rest
              // of the GCS consumes (`status` + snake_case fields).
              // Defensive on each field so a partial agent response
              // never produces NaN.toFixed() crashes downstream.
              type RawService = {
                name?: unknown;
                state?: unknown;
                pid?: unknown;
                cpu_percent?: unknown;
                cpuPercent?: unknown;
                memory_mb?: unknown;
                memoryMb?: unknown;
                uptime_seconds?: unknown;
                uptimeSeconds?: unknown;
                category?: unknown;
              };
              const mapped: ServiceInfo[] = (full.services as RawService[]).map((s) => ({
                name: typeof s.name === "string" ? s.name : "unknown",
                status: (typeof s.state === "string"
                  ? s.state
                  : "stopped") as ServiceInfo["status"],
                pid: typeof s.pid === "number" ? s.pid : null,
                cpu_percent:
                  typeof s.cpu_percent === "number"
                    ? s.cpu_percent
                    : typeof s.cpuPercent === "number"
                      ? s.cpuPercent
                      : 0,
                memory_mb:
                  typeof s.memory_mb === "number"
                    ? s.memory_mb
                    : typeof s.memoryMb === "number"
                      ? s.memoryMb
                      : 0,
                uptime_seconds:
                  typeof s.uptime_seconds === "number"
                    ? s.uptime_seconds
                    : typeof s.uptimeSeconds === "number"
                      ? s.uptimeSeconds
                      : 0,
                category:
                  typeof s.category === "string"
                    ? (s.category as ServiceInfo["category"])
                    : undefined,
              }));
              useAgentSystemStore.setState({ services: mapped });
            }
            if (full.resources) {
              // /api/status/full returns ONLY percentages (no
              // memory_used_mb / disk_used_gb / etc.) on current
              // agents. Normalise via the same helper the per-endpoint
              // path uses so consumers always see the full shape with
              // 0-defaulted fields instead of `undefined`.
              useAgentSystemStore.setState({
                resources: normaliseSystemResources(
                  full.resources as Record<string, unknown>,
                ),
                lastUpdatedAt: Date.now(),
                stale: false,
              });
            }
            if (full.video && typeof full.video.state === "string") {
              useVideoStore.getState().setAgentVideoStatus(
                full.video.state,
                typeof full.video.whep_url === "string"
                  ? full.video.whep_url
                  : null,
              );
            }
            // Populate capabilities from consolidated response or infer from legacy data.
            // FullStatusResponse.capabilities is optional (older agents omit it).
            if (full.capabilities) {
              // Agent has capabilities API; normalize and store (handles shape differences).
              useAgentCapabilitiesStore.getState().setCapabilities(full.capabilities);
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
