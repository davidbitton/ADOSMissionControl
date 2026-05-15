"use client";

/**
 * @module CommandPage
 * @description Main layout for the Command tab with fleet sidebar, sub-tab switching, and drone context rail.
 * @license GPL-3.0-only
 */

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useTranslations } from "next-intl";
import {
  Monitor,
  TerminalSquare,
  Wrench,
  Sparkles,
  Zap,
  Cpu,
  Plug,
  Unplug,
  ChevronDown,
  ChevronRight,
  Cloud,
  LayoutGrid,
} from "lucide-react";
import { cn, isDemoMode } from "@/lib/utils";
import { cmdDronesApi } from "@/lib/community-api-drones";
import { communityApi } from "@/lib/community-api";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { useAuthStore } from "@/stores/auth-store";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { usePairingStore, type PairedDrone } from "@/stores/pairing-store";
import { useFreshness } from "@/lib/agent/freshness";
import { useVisibleTabs, type CommandSubTab } from "@/hooks/use-visible-tabs";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { FEATURE_CATALOG } from "@/lib/agent/feature-catalog";
import dynamic from "next/dynamic";
import { FleetSidebar } from "./FleetSidebar";
import { PairingDialog } from "./PairingDialog";
import { AgentDisconnectedPage } from "./AgentDisconnectedPage";
import { CommandFleetOverview } from "./CommandFleetOverview";
import { GroundStationDetailPanel } from "./nodes/ground-station/GroundStationDetailPanel";
import { ComputePanelPlaceholder } from "./nodes/compute/ComputePanelPlaceholder";
import { CommandFleetMqttBridge } from "./CommandFleetMqttBridge";
import { CommandFleetStatusBridge } from "./CommandFleetStatusBridge";
import { DroneContextRail } from "./shared/DroneContextRail";
import { TabErrorBoundary } from "./TabErrorBoundary";

function TabSuspenseFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="text-text-secondary text-sm">Loading...</div>
    </div>
  );
}

const AgentOverviewTab = dynamic(() => import("./AgentOverviewTab").then(m => ({ default: m.AgentOverviewTab })), { ssr: false });
const ScriptsTab = dynamic(() => import("./ScriptsTab").then(m => ({ default: m.ScriptsTab })), { ssr: false });
const FeaturesTab = dynamic(() => import("./FeaturesTab").then(m => ({ default: m.FeaturesTab })), { ssr: false });
const SmartModesTab = dynamic(() => import("./SmartModesTab").then(m => ({ default: m.SmartModesTab })), { ssr: false });
const SystemTab = dynamic(() => import("./SystemTab").then(m => ({ default: m.SystemTab })), { ssr: false });
const RosTab = dynamic(() => import("./ros/RosTab").then(m => ({ default: m.RosTab })), { ssr: false });
const CloudStatusBridge = dynamic(() => import("./CloudStatusBridge").then(m => ({ default: m.CloudStatusBridge })), { ssr: false });
const CloudCommandResultBridge = dynamic(() => import("./CloudCommandResultBridge").then(m => ({ default: m.CloudCommandResultBridge })), { ssr: false });
const MqttBridge = dynamic(() => import("./MqttBridge").then(m => ({ default: m.MqttBridge })), { ssr: false });
// AgentMavlinkBridge moved to CommandShell for cross-tab persistence

export function CommandPage() {
  const t = useTranslations("command");

  const visibleTabs = useVisibleTabs();
  const activeFeatureId = useAgentCapabilitiesStore((s) => s.features.active);
  const activeFeatureName = activeFeatureId ? FEATURE_CATALOG[activeFeatureId]?.name ?? null : null;
  const selectedProfile = useAgentCapabilitiesStore((s) => s.profile);
  const capsLoaded = useAgentCapabilitiesStore((s) => s.loaded);

  // `t` is a fresh function ref per render so the prior useMemo on
  // `[t]` never hit its cache. Compute inline; the object is cheap.
  const tabConfig: Record<CommandSubTab, { label: string; icon: typeof Monitor }> = {
    overview: { label: t("overview"), icon: Monitor },
    features: { label: "Features", icon: Sparkles },
    "smart-modes": { label: "Smart Modes", icon: Zap },
    ros: { label: "ROS", icon: Cpu },
    system: { label: "System", icon: Wrench },
    scripts: { label: t("scripts"), icon: TerminalSquare },
  };

  const [activeTab, setActiveTab] = useState<CommandSubTab>("overview");
  const [viewMode, setViewMode] = useState<"fleet" | "agent">("fleet");

  // Render-safe fallback when active tab becomes unavailable.
  const renderedActiveTab = visibleTabs.includes(activeTab) ? activeTab : "overview";

  // Reconcile activeTab state when the visible-tabs set shrinks (e.g.
  // a profile change drops the "ros" tab). Without this, the stale
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
  const [pairingOpen, setPairingOpen] = useState(false);
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // clientConfig is a public read; auth-gated reads carry an enabled guard.
  const clientConfig = useConvexSkipQuery(communityApi.clientConfig.get);
  const myDrones = useConvexSkipQuery(cmdDronesApi.listMyDrones, {
    enabled: isAuthenticated,
  });

  // Sync Convex fleet data into Zustand store (deduplicate by deviceId, keep newest)
  useEffect(() => {
    if (myDrones && Array.isArray(myDrones)) {
      const deduped = new Map<string, typeof myDrones[number]>();
      for (const d of myDrones) {
        const existing = deduped.get(d.deviceId);
        if (!existing || (d.pairedAt || 0) > (existing.pairedAt || 0)) {
          deduped.set(d.deviceId, d);
        }
      }
      const VALID_PROFILES = new Set([
        "drone",
        "ground-station",
        "compute",
        "lite",
      ]);
      const VALID_ROLES = new Set(["direct", "relay", "receiver"]);
      usePairingStore.getState().setPairedDrones(
        Array.from(deduped.values()).map((d) => {
          const rawProfile = (d as { profile?: unknown }).profile;
          const rawRole = (d as { role?: unknown }).role;
          const profile =
            typeof rawProfile === "string" && VALID_PROFILES.has(rawProfile)
              ? (rawProfile as PairedDrone["profile"])
              : undefined;
          const role =
            typeof rawRole === "string" && VALID_ROLES.has(rawRole)
              ? (rawRole as PairedDrone["role"])
              : rawRole === null
                ? null
                : undefined;
          return {
            _id: d._id,
            userId: d.userId,
            deviceId: d.deviceId,
            name: d.name,
            apiKey: d.apiKey,
            agentVersion: d.agentVersion,
            board: d.board,
            tier: d.tier,
            os: d.os,
            mdnsHost: d.mdnsHost,
            lastIp: d.lastIp,
            lastSeen: d.lastSeen,
            fcConnected: d.fcConnected,
            pairedAt: d.pairedAt,
            profile,
            role,
          };
        })
      );
    }
  }, [myDrones]);

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
    if (pairedDrones.length !== 1) return;
    const only = pairedDrones[0];
    autoRoutedRef.current = true;
    usePairingStore.getState().selectPairedDrone(only._id);
    setViewMode("agent");
    setActiveTab("overview");
    connectCloud(only.deviceId);
  }, [pairedDrones, viewMode, connectCloud]);

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleConnect();
  }

  function handlePaired(deviceId: string, apiKey: string, url: string) {
    setPairingOpen(false);
    setViewMode("agent");
    connect(url, apiKey);
  }

  function handleShowFleet() {
    setViewMode("fleet");
    usePairingStore.getState().selectPairedDrone(null);
    disconnect();
  }

  function handleOpenAgent(deviceId: string) {
    const drone = pairedDrones.find((d) => d.deviceId === deviceId);
    if (drone) {
      usePairingStore.getState().selectPairedDrone(drone._id);
    }
    setViewMode("agent");
    setActiveTab("overview");
    connectCloud(deviceId);
  }

  // Re-resolve the active local node's hostname by re-running the
  // mDNS browse and updating the stored hostname when a fresh entry
  // arrives. Cheap escape hatch for DHCP rotation / stale hostnames.
  // No-op for cloud-paired drones (they don't have a LAN entry).
  async function handleReResolveHost() {
    const selectedPairedId = usePairingStore.getState().selectedPairedId;
    if (!selectedPairedId || !selectedPairedId.startsWith("local:")) return;
    const deviceId = selectedPairedId.slice("local:".length);
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

  const showingFleet = pairedDrones.length > 0 && viewMode === "fleet";

  return (
    <div className="flex h-full">
      <FleetSidebar
        collapsed={sidebarCollapsed}
        fleetSelected={showingFleet}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        onOpenPairing={() => setPairingOpen(true)}
        onShowFleet={handleShowFleet}
        onFocusAgent={() => setViewMode("agent")}
      />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Connection bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border-default bg-bg-secondary">
          {showingFleet ? (
            <>
              <div className="flex items-center gap-2">
                <LayoutGrid size={13} className="text-accent-primary" />
                <span className="text-xs font-medium text-text-primary">
                  {t("allAgents")}
                </span>
                <span className="text-xs text-text-tertiary">
                  {t("pairedCount", { count: pairedDrones.length })}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setPairingOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-accent-primary hover:bg-bg-tertiary rounded transition-colors"
                >
                  <Plug size={12} />
                  {t("pairNode")}
                </button>
              </div>
            </>
          ) : demo && connected && status ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-success" />
              <span className="text-xs text-text-primary font-medium">
                {t("demoAgent")}
              </span>
              <span className="text-xs text-text-tertiary">
                v{status.version}
              </span>
              <span className="text-xs text-text-tertiary">
                {t("tier", { tier: status.board?.tier })}
              </span>
              <span className="text-xs text-text-tertiary">{status.board?.name}</span>
              {cloudMode && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-accent-primary/15 text-accent-primary rounded font-medium">
                  <Cloud size={10} />
                  {t("cloud")}
                </span>
              )}
              {activeFeatureName && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-status-success/15 text-status-success rounded font-medium">
                  <Zap size={10} />
                  {activeFeatureName}
                </span>
              )}
            </div>
          ) : status ? (
            <>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    headerState === "live" && "bg-status-success",
                    headerState === "stale" && "bg-status-warning animate-pulse",
                    headerState === "offline" && "bg-status-error"
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    headerState === "offline" ? "text-text-tertiary" : "text-text-primary"
                  )}
                >
                  {status.board?.name ?? t("agent")}
                </span>
                <span className="text-xs text-text-tertiary">
                  v{status.version}
                </span>
                <span className="text-xs text-text-tertiary">
                  {t("tier", { tier: status.board?.tier })}
                </span>
                {cloudMode && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-accent-primary/15 text-accent-primary rounded font-medium">
                    <Cloud size={10} />
                    {t("cloudBadge")}
                  </span>
                )}
                {activeFeatureName && headerState === "live" && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-status-success/15 text-status-success rounded font-medium">
                    <Zap size={10} />
                    {activeFeatureName}
                  </span>
                )}
                {headerState === "stale" && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-status-warning/15 text-status-warning rounded font-medium uppercase tracking-wide">
                    {t("staleLastSeen", { label: freshness.label })}
                  </span>
                )}
                {headerState === "offline" && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-status-error/15 text-status-error rounded font-medium uppercase tracking-wide">
                    {t("offlineLastSeen", { label: freshness.label })}
                  </span>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {headerState === "offline" && cloudMode && cloudDeviceId && (
                  <button
                    onClick={() => connectCloud(cloudDeviceId)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-accent-primary hover:bg-bg-tertiary rounded transition-colors"
                    title={t("reconnectTooltip")}
                  >
                    <Plug size={12} />
                    {t("reconnectButton")}
                  </button>
                )}
                <button
                  onClick={disconnect}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-status-error hover:bg-bg-tertiary rounded transition-colors"
                >
                  <Unplug size={12} />
                  {t("disconnect")}
                </button>
              </div>
            </>
          ) : (
            <>
              {pairedDrones.length + localNodeCount > 0 ? (
                <span className="text-xs text-text-secondary">
                  {t("selectNode")}
                </span>
              ) : (
                <span className="text-xs text-text-secondary">
                  {t("pairToStart")}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  {t("advanced")}
                  {advancedOpen ? (
                    <ChevronDown size={10} />
                  ) : (
                    <ChevronRight size={10} />
                  )}
                </button>
                {advancedOpen && (
                  <>
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="http://localhost:8080"
                      className="w-56 px-2.5 py-1 text-xs bg-bg-tertiary border border-border-default rounded text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent-primary"
                    />
                    <button
                      onClick={handleConnect}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs bg-accent-primary text-white rounded hover:opacity-90 transition-opacity"
                    >
                      <Plug size={12} />
                      {t("connect")}
                    </button>
                  </>
                )}
                {connectionError && (
                  <span className="text-xs text-status-error">
                    {connectionError}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Top strip with the All Agents return-to-fleet button.
            Rendered above whichever right-pane branch picks below so
            the operator can always go back to fleet view, including
            from inside the ground-station or compute panels. */}
        {!showingFleet &&
          status &&
          pairedDrones.length > 0 &&
          (selectedProfile === "ground-station" ||
            selectedProfile === "compute") && (
            <div className="flex items-center gap-1 px-4 border-b border-border-default bg-bg-secondary">
              <button
                onClick={handleShowFleet}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors self-stretch -mb-px border-b-2 border-transparent text-text-secondary hover:text-text-primary"
              >
                <LayoutGrid size={13} />
                {t("allAgents")}
              </button>
            </div>
          )}

        {showingFleet ? (
          <CommandFleetOverview
            pairedDrones={pairedDrones}
            onOpenAgent={handleOpenAgent}
            onOpenPairing={() => setPairingOpen(true)}
          />
        ) : status && capsLoaded && selectedProfile === "ground-station" ? (
          <GroundStationDetailPanel />
        ) : status && capsLoaded && selectedProfile === "compute" ? (
          <ComputePanelPlaceholder />
        ) : status ? (
          <>
            {/* Sub-tab navigation */}
            <div className="flex items-center gap-1 px-4 border-b border-border-default bg-bg-secondary">
              {pairedDrones.length > 0 && (
                <button
                  onClick={handleShowFleet}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors self-stretch -mb-px border-b-2 border-transparent text-text-secondary hover:text-text-primary"
                >
                  <LayoutGrid size={13} />
                  {t("allAgents")}
                </button>
              )}
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
                        : "text-text-secondary hover:text-text-primary border-transparent"
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
              {renderedActiveTab === "features" && (
                <TabErrorBoundary>
                  <Suspense fallback={<TabSuspenseFallback />}>
                    <FeaturesTab />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {renderedActiveTab === "smart-modes" && (
                <TabErrorBoundary>
                  <Suspense fallback={<TabSuspenseFallback />}>
                    <SmartModesTab />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {renderedActiveTab === "ros" && (
                <TabErrorBoundary>
                  <Suspense fallback={<TabSuspenseFallback />}>
                    <RosTab />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {renderedActiveTab === "system" && (
                <TabErrorBoundary>
                  <Suspense fallback={<TabSuspenseFallback />}>
                    <SystemTab />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {renderedActiveTab === "scripts" && (
                <TabErrorBoundary>
                  <Suspense fallback={<TabSuspenseFallback />}>
                    <ScriptsTab />
                  </Suspense>
                </TabErrorBoundary>
              )}
            </div>
          </>
        ) : viewMode === "agent" && connected ? (
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
                {t("allAgents")}
              </button>
            </div>
          </div>
        ) : (
          <AgentDisconnectedPage onOpenPairing={() => setPairingOpen(true)} />
        )}
      </div>



      <CommandFleetStatusBridge enabled={pairedDrones.length > 0} />
      <CommandFleetMqttBridge
        pairedDrones={pairedDrones}
        mqttBrokerUrl={clientConfig?.mqttBrokerUrl}
      />
      {cloudMode && <CloudStatusBridge />}
      {cloudMode && <CloudCommandResultBridge />}
      {cloudMode && <MqttBridge mqttBrokerUrl={clientConfig?.mqttBrokerUrl} />}
      {/* AgentMavlinkBridge is in CommandShell for cross-tab persistence */}

      <PairingDialog
        open={pairingOpen}
        onClose={() => setPairingOpen(false)}
        onPaired={handlePaired}
      />
    </div>
  );
}
