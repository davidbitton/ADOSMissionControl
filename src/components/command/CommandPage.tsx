"use client";

/**
 * DEPRECATED / UNUSED. Agent management was unified into the Dashboard
 * drone-detail view (DroneDetailPanel); the `/command` route now redirects to
 * `/` and nothing imports this component, so it never renders. Its bridge and
 * pairing-dialog mounts below are superseded by CommandShell (AgentBridges,
 * CloudDroneBridge, LocalDroneBridge) and ShellPairingDialog. Safe to delete
 * along with its now-orphaned sidebar sub-components in a follow-up cleanup.
 *
 * @module CommandPage
 * @description Main layout for the Command tab with fleet sidebar, sub-tab switching, and drone context rail.
 * @license GPL-3.0-only
 */

import { useState, useEffect, useRef, Suspense } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, Plug } from "lucide-react";
import { cn, isDemoMode } from "@/lib/utils";
import { communityApi } from "@/lib/community-api";
import { setMqttBrokerCredential } from "@/lib/mqtt-broker-credential";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { usePairingStore } from "@/stores/pairing-store";
import { useFreshness } from "@/lib/agent/freshness";
import { useVisibleTabs, type CommandSubTab } from "@/hooks/use-visible-tabs";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { useFleetNodes } from "@/hooks/use-fleet-nodes";
import { selectNode, connectLocalNode } from "@/lib/agent/node-click-handler";
import { deviceIdFromNodeId } from "@/lib/agent/node-id";
import dynamic from "next/dynamic";
import { FleetSidebar } from "./FleetSidebar";
import { PairingDialog } from "./PairingDialog";
import { usePairDialogStore } from "@/stores/pair-dialog-store";
import { AgentDisconnectedPage } from "./AgentDisconnectedPage";
import { CommandFleetOverview } from "./CommandFleetOverview";
import { GroundStationDetailPanel } from "./nodes/ground-station/GroundStationDetailPanel";
import { ComputePanelPlaceholder } from "./nodes/compute/ComputePanelPlaceholder";
import { CommandFleetMqttBridge } from "./CommandFleetMqttBridge";
import { CommandFleetStatusBridge } from "./CommandFleetStatusBridge";
import { CommandFleetLocalBridge } from "./CommandFleetLocalBridge";
import { TabErrorBoundary } from "./TabErrorBoundary";
import { CommandConnectionBar } from "./CommandConnectionBar";
import { useFleetSync } from "./use-fleet-sync";
import { buildCommandTabConfig } from "./tab-config";

function TabSuspenseFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="text-text-secondary text-sm">Loading...</div>
    </div>
  );
}

const AgentOverviewTab = dynamic(() => import("./AgentOverviewTab").then(m => ({ default: m.AgentOverviewTab })), { ssr: false });
const PluginsTab = dynamic(() => import("./PluginsTab").then(m => ({ default: m.PluginsTab })), { ssr: false });
const SystemTab = dynamic(() => import("./SystemTab").then(m => ({ default: m.SystemTab })), { ssr: false });
const CloudStatusBridge = dynamic(() => import("./CloudStatusBridge").then(m => ({ default: m.CloudStatusBridge })), { ssr: false });
const CloudCommandResultBridge = dynamic(() => import("./CloudCommandResultBridge").then(m => ({ default: m.CloudCommandResultBridge })), { ssr: false });
const MqttBridge = dynamic(() => import("./MqttBridge").then(m => ({ default: m.MqttBridge })), { ssr: false });
// AgentMavlinkBridge moved to CommandShell for cross-tab persistence

export function CommandPage() {
  const t = useTranslations("command");

  const visibleTabs = useVisibleTabs();
  const selectedProfile = useAgentCapabilitiesStore((s) => s.profile);
  const capsLoaded = useAgentCapabilitiesStore((s) => s.loaded);

  const tabConfig = buildCommandTabConfig(t);

  const [activeTab, setActiveTab] = useState<CommandSubTab>("overview");
  const [viewMode, setViewMode] = useState<"fleet" | "agent">("fleet");

  // Render-safe fallback when active tab becomes unavailable.
  const renderedActiveTab = visibleTabs.includes(activeTab) ? activeTab : "overview";

  // Reconcile activeTab state when the visible-tabs set shrinks (e.g.
  // a profile change drops a drone-only tab). Without this, the stale
  // id sits in state and re-flips the render the moment the tab set
  // grows again, causing a UI race. `renderedActiveTab` is omitted
  // from deps because it's derived from `visibleTabs + activeTab`;
  // including it would re-run the effect on every activeTab change.
  // Skip reconciliation when visibleTabs is momentarily empty
  // (mid-disconnect, capabilities clearing) so we don't churn the
  // operator's last tab choice to overview permanently.
  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [visibleTabs, activeTab]);
  const [urlInput, setUrlInput] = useState("http://localhost:8080");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pairingOpen = usePairDialogStore((s) => s.open);
  const openPairing = usePairDialogStore((s) => s.openDialog);
  const closePairing = usePairDialogStore((s) => s.closeDialog);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const connected = useAgentConnectionStore((s) => s.connected);
  const connectionError = useAgentConnectionStore((s) => s.connectionError);
  const cloudDeviceId = useAgentConnectionStore((s) => s.cloudDeviceId);
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const status = useAgentSystemStore((s) => s.status);
  const connect = useAgentConnectionStore((s) => s.connect);
  const disconnect = useAgentConnectionStore((s) => s.disconnect);
  const connectCloud = useAgentConnectionStore((s) => s.connectCloud);
  const cloudMode = useAgentConnectionStore((s) => s.cloudMode);
  const localNodeCount = useLocalNodesStore((s) => s.nodes.length);
  const freshness = useFreshness();
  // When we have a status object but the watchdog has flagged the feed as
  // stale/offline, render the dimmed/offline header rather than the live one.
  const headerState: "live" | "stale" | "offline" =
    !connected || freshness.state === "offline"
      ? "offline"
      : freshness.state === "stale"
        ? "stale"
        : "live";

  const demo = isDemoMode();
  const pairedDrones = usePairingStore((s) => s.pairedDrones);
  // Merged cloud + local nodes. The fleet overview gate and the
  // auto-route effect both fire on this list so LAN-only operators
  // (no Convex sign-in, no cloud pairs) land on the overview grid
  // instead of the pair-a-node marketing screen.
  const fleetNodes = useFleetNodes();

  // clientConfig is a public read; auth-gated reads carry an enabled guard.
  const clientConfig = useConvexSkipQuery(communityApi.clientConfig.get);
  // Sync Convex fleet data into Zustand store (deduplicate by deviceId, keep newest).
  useFleetSync();

  // Populate the process-level MQTT broker credential singleton so
  // non-React modules (MqttMavlinkTransport, WebRTC signaling) can
  // authenticate against the production broker without prop drilling.
  useEffect(() => {
    setMqttBrokerCredential({
      username: clientConfig?.mqttViewerUsername ?? null,
      password: clientConfig?.mqttViewerPassword ?? null,
    });
  }, [clientConfig?.mqttViewerUsername, clientConfig?.mqttViewerPassword]);

  useEffect(() => {
    return () => {
      useAgentConnectionStore.getState().stopPolling();
    };
  }, []);

  // Auto-route to the single paired node on first load so the operator
  // lands on a useful surface instead of an empty fleet sidebar. Fires
  // once per session: subsequent fleet returns (via `handleShowFleet`)
  // are sticky and not overridden. Multi-node fleets stay on the fleet
  // overview by default — the operator picks.
  const autoRoutedRef = useRef(false);
  useEffect(() => {
    if (autoRoutedRef.current) return;
    if (viewMode !== "fleet") return;
    if (fleetNodes.length !== 1) return;
    const only = fleetNodes[0];
    autoRoutedRef.current = true;
    setActiveTab("overview");
    void selectNode(only, { onFocusAgent: () => setViewMode("agent") });
  }, [fleetNodes, viewMode]);

  // Cloud-relay watchdog. When the user clicks a node and we route through
  // cloud relay, the click handler sets cloudMode + connected synchronously
  // but the agent heartbeat only lands once Convex receives it. If the agent
  // isn't cloud-paired or the GCS isn't authenticated, the heartbeat never
  // arrives and the page sits on the spinner indefinitely. After 15 seconds
  // without a status update, flip to an actionable error.
  useEffect(() => {
    if (viewMode !== "agent" || !cloudMode || !connected || status) return;
    const timer = setTimeout(() => {
      if (!useAgentSystemStore.getState().status) {
        useAgentConnectionStore.setState({
          cloudMode: false,
          connected: false,
          cloudDeviceId: null,
          connectionError: t("cloudRelayTimeout"),
        });
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [viewMode, cloudMode, connected, status, t]);

  function handleConnect() {
    if (urlInput.trim()) {
      connect(urlInput.trim());
    }
  }

  function handlePaired(deviceId: string, apiKey: string, url: string) {
    closePairing();
    setViewMode("agent");
    const isLocal = useLocalNodesStore
      .getState()
      .nodes.some((n) => n.deviceId === deviceId);
    if (isLocal) {
      // LAN pair: the host + apiKey are already persisted in the
      // local-nodes store (the onPaired args are empty by design), so route
      // through the unified local-connect path which reads them and branches
      // LAN-vs-cloud. Calling connect("","") here was the "paired but
      // offline" bug.
      connectLocalNode(deviceId, { onFocusAgent: () => setViewMode("agent") });
      return;
    }
    // Cloud pair (generate-code): connect with the relay url/key provided.
    if (url) {
      connect(url, apiKey);
    } else {
      connectCloud(deviceId);
    }
  }

  function handleShowFleet() {
    setViewMode("fleet");
    usePairingStore.getState().selectPairedDrone(null);
    disconnect();
  }

  function handleOpenAgent(deviceId: string) {
    const node = fleetNodes.find((n) => n.deviceId === deviceId);
    setActiveTab("overview");
    if (!node) {
      // Defensive: fall back to cloud relay if a tile click races a
      // fleet refresh that drops the row.
      setViewMode("agent");
      connectCloud(deviceId);
      return;
    }
    void selectNode(node, { onFocusAgent: () => setViewMode("agent") });
  }

  // Re-resolve the active local node's hostname by re-running the
  // mDNS browse and updating the stored hostname when a fresh entry
  // arrives. Cheap escape hatch for DHCP rotation / stale hostnames.
  // No-op for cloud-paired drones (they don't have a LAN entry).
  async function handleReResolveHost() {
    const selectedPairedId = usePairingStore.getState().selectedPairedId;
    const deviceId = deviceIdFromNodeId(selectedPairedId);
    // Only a LAN-paired node has a hostname to re-resolve; bail if the
    // selection isn't a known local node.
    if (!deviceId) return;
    const localStore = useLocalNodesStore.getState();
    const local = localStore.nodes.find((n) => n.deviceId === deviceId);
    if (!local) return;
    try {
      const res = await fetch("/api/lan-pair/discover");
      if (!res.ok) return;
      const data = (await res.json()) as {
        agents: Array<{ host: string; ipv4?: string; port: number; txt: Record<string, string> }>;
      };
      const match = data.agents.find(
        (a) => a.txt?.did === deviceId || a.host === local.mdnsHost,
      );
      if (!match) {
        useAgentConnectionStore.setState({
          connectionError: `${t("agentUnreachable")}. mDNS did not return a fresh host for ${deviceId}.`,
        });
        return;
      }
      const newHostname = `http://${match.host}:${match.port}`;
      localStore.addNode({ ...local, hostname: newHostname });
      await connect(newHostname, local.apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useAgentConnectionStore.setState({ connectionError: msg });
    }
  }

  const showingFleet = fleetNodes.length > 0 && viewMode === "fleet";

  return (
    <div className="flex h-full">
      <FleetSidebar
        collapsed={sidebarCollapsed}
        fleetSelected={showingFleet}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        onOpenPairing={openPairing}
        onShowFleet={handleShowFleet}
        onFocusAgent={() => setViewMode("agent")}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <CommandConnectionBar
          t={t}
          showingFleet={showingFleet}
          pairedCount={pairedDrones.length}
          localNodeCount={localNodeCount}
          demo={demo}
          connected={connected}
          status={status}
          cloudMode={cloudMode}
          cloudDeviceId={cloudDeviceId}
          headerState={headerState}
          freshnessLabel={freshness.label}
          connectionError={connectionError}
          urlInput={urlInput}
          onUrlInputChange={setUrlInput}
          advancedOpen={advancedOpen}
          onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
          onConnect={handleConnect}
          onDisconnect={disconnect}
          onConnectCloud={connectCloud}
          onOpenPairing={openPairing}
        />

        {showingFleet ? (
          <CommandFleetOverview
            fleetNodes={fleetNodes}
            onOpenAgent={handleOpenAgent}
            onOpenPairing={openPairing}
          />
        ) : fleetNodes.length === 0 && agentUrl !== "mock://demo" ? (
          // No real paired nodes and not a live mock session: render the
          // pairing-first empty state. Without this gate, a lingering
          // status object (e.g. from a stale mock session) would render a
          // detail panel that contradicts the sidebar empty state.
          <AgentDisconnectedPage
            onOpenPairing={openPairing}
            onPaired={(deviceId) => handlePaired(deviceId, "", "")}
          />
        ) : status && capsLoaded && selectedProfile === "ground-station" ? (
          <GroundStationDetailPanel />
        ) : status && capsLoaded && selectedProfile === "compute" ? (
          <ComputePanelPlaceholder />
        ) : status ? (
          <>
            {/* Sub-tab navigation */}
            <div className="flex items-center gap-1 px-4 border-b border-border-default bg-bg-secondary">
              {visibleTabs.map((tabId) => {
                const config = tabConfig[tabId];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <button
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors self-stretch -mb-px border-b-2",
                      renderedActiveTab === tabId
                        ? "text-accent-primary border-accent-primary"
                        : "text-text-secondary hover:text-text-primary border-transparent",
                    )}
                  >
                    <Icon size={13} />
                    {config.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content — Overview is always mounted (hidden via CSS when
                inactive) so that VideoFeedCard's WebRTC connection persists
                across tab switches. Other tabs mount/unmount normally since
                they have no long-lived connections. */}
            <div className="flex-1 overflow-y-auto">
              <div className={renderedActiveTab !== "overview" ? "hidden" : undefined}>
                <TabErrorBoundary>
                  <Suspense fallback={<TabSuspenseFallback />}>
                    <AgentOverviewTab />
                  </Suspense>
                </TabErrorBoundary>
              </div>
              {renderedActiveTab === "system" && (
                <TabErrorBoundary>
                  <Suspense fallback={<TabSuspenseFallback />}>
                    <SystemTab />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {renderedActiveTab === "plugins" && (
                <TabErrorBoundary>
                  <Suspense fallback={<TabSuspenseFallback />}>
                    <PluginsTab />
                  </Suspense>
                </TabErrorBoundary>
              )}
            </div>
          </>
        ) : viewMode === "agent" && (connected || agentUrl) ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">{t("waitingForAgent")}</p>
          </div>
        ) : viewMode === "agent" && connectionError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 max-w-md mx-auto text-center px-6">
            <p className="text-sm text-status-error font-medium">
              {cloudMode ? t("cloudRelayUnreachable") : t("agentUnreachable")}
            </p>
            <p className="text-xs text-text-tertiary leading-relaxed">
              {connectionError}
            </p>
            {!cloudMode && agentUrl && (
              <p className="text-[11px] text-text-tertiary leading-relaxed">
                {t("agentUnreachableHint", { url: agentUrl })}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              {!cloudMode && (
                <button
                  onClick={handleReResolveHost}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-primary border border-accent-primary/30 rounded hover:bg-accent-primary/10 transition-colors"
                >
                  <Plug size={12} />
                  {t("reResolveHost")}
                </button>
              )}
              <button
                onClick={handleShowFleet}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-primary border border-accent-primary/30 rounded hover:bg-accent-primary/10 transition-colors"
              >
                <LayoutGrid size={12} />
                {t("fleet")}
              </button>
            </div>
          </div>
        ) : (
          <AgentDisconnectedPage
            onOpenPairing={openPairing}
            onPaired={(deviceId) => handlePaired(deviceId, "", "")}
          />
        )}
      </div>



      <CommandFleetStatusBridge enabled={pairedDrones.length > 0} />
      <CommandFleetLocalBridge enabled={fleetNodes.length > 0} />
      <CommandFleetMqttBridge
        pairedDrones={pairedDrones}
        mqttBrokerUrl={clientConfig?.mqttBrokerUrl}
        mqttViewerUsername={clientConfig?.mqttViewerUsername}
        mqttViewerPassword={clientConfig?.mqttViewerPassword}
      />
      {cloudMode && <CloudStatusBridge />}
      {cloudMode && <CloudCommandResultBridge />}
      {cloudMode && (
        <MqttBridge
          mqttBrokerUrl={clientConfig?.mqttBrokerUrl}
          mqttViewerUsername={clientConfig?.mqttViewerUsername}
          mqttViewerPassword={clientConfig?.mqttViewerPassword}
        />
      )}
      {/* AgentMavlinkBridge is in CommandShell for cross-tab persistence */}

      <PairingDialog
        open={pairingOpen}
        onClose={closePairing}
        onPaired={handlePaired}
      />
    </div>
  );
}
