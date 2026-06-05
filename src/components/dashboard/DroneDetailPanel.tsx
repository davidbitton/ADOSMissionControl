"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useFleetStore } from "@/stores/fleet-store";
import { useDroneManager } from "@/stores/drone-manager";
import { useDroneMetadataStore } from "@/stores/drone-metadata-store";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { unpairLocal } from "@/lib/agent/local-pair-client";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DroneStatusBadge } from "@/components/shared/drone-status-badge";
import { DroneOverviewTab } from "@/components/drone-detail/DroneOverviewTab";
import { DroneFlightsTab } from "@/components/drone-detail/DroneFlightsTab";
import { DroneConfigureTab } from "@/components/drone-detail/DroneConfigureTab";
import { DroneVisionTab } from "@/components/drone-detail/DroneVisionTab";
import { ParametersPanel } from "@/components/fc/parameters/ParametersPanel";
import { DroneRadioPanel } from "@/components/dashboard/DroneRadioPanel";
import {
  DroneDetailTabHeaders,
  DroneDetailTabBody,
  isPluginTabId,
} from "@/components/plugins/DroneDetailTabHost";
import { X, RotateCcw, Trash2, Lock } from "lucide-react";
import { LinkUpPlaceholder } from "@/components/shared/link-up/LinkUpPlaceholder";
import {
  AGENT_SURFACE_TAB_IDS,
  isAgentSurfaceTab,
} from "@/components/shared/link-up/locked-surfaces";
import { AgentOverviewTab } from "@/components/command/AgentOverviewTab";
import { SystemTab } from "@/components/command/SystemTab";
import { BlackBoxTab } from "@/components/command/BlackBoxTab";
import { PluginsTab } from "@/components/command/PluginsTab";
import { useFleetNodes } from "@/hooks/use-fleet-nodes";
import { selectNode } from "@/lib/agent/node-click-handler";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { isDemoMode } from "@/lib/utils";
import { ConnectionQualityMeter } from "@/components/indicators/ConnectionQualityMeter";
import { NavStatePill } from "@/components/indicators/NavStatePill";
import { RuntimeModeBadge } from "@/components/indicators/RuntimeModeBadge";
import { TrafficPill } from "@/components/indicators/TrafficPill";
import { useUiStore } from "@/stores/ui-store";
import {
  STATIC_TAB_IDS,
  RADIO_TAB_ID,
  VISION_TAB_ID,
  isStaticTab,
  type DroneDetailTab,
} from "@/components/dashboard/drone-detail-tabs";

interface DroneDetailPanelProps {
  droneId: string;
  onClose: () => void;
}

export function DroneDetailPanel({ droneId, onClose }: DroneDetailPanelProps) {
  const t = useTranslations("dronePanel");
  const tLink = useTranslations("linkUp");
  const drones = useFleetStore((s) => s.drones);
  const removeDrone = useFleetStore((s) => s.removeDrone);
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { toast } = useToast();

  const drone = drones.find((d) => d.id === droneId);
  // This drone is backed by a companion-computer agent when the fleet row
  // carries the agent's device id (cloud-paired or LAN-paired projector).
  const agentDeviceId = drone?.cloudDeviceId ?? null;
  const fleetNodes = useFleetNodes();

  const radioPresent = useAgentCapabilitiesStore((s) => s.radio !== null);
  const visionPresent = useAgentCapabilitiesStore(
    (s) => s.visionAvailable === true,
  );

  // Agent tabs render live when this drone has a paired agent (or in demo,
  // where the mock agent stands in); otherwise they render as lock-badged
  // teasers that route to pairing so the operator discovers what unlocks.
  const showAgentTabs = agentDeviceId !== null || isDemoMode();
  const showLockedTabs = !showAgentTabs;

  // Focus the selected drone's agent so the (singleton) agent stores reflect
  // it. Selection is the single driver of the agent connection: switching
  // drones tears down the prior agent and connects the new one; deselecting
  // (panel unmount) releases it. Demo keeps its single mock agent untouched.
  const lastAgentDeviceId = useRef<string | null>(null);
  useEffect(() => {
    if (isDemoMode()) return;
    if (!agentDeviceId) {
      if (lastAgentDeviceId.current) {
        useAgentConnectionStore.getState().disconnect();
        lastAgentDeviceId.current = null;
      }
      return;
    }
    if (lastAgentDeviceId.current === agentDeviceId) return;
    const entry = fleetNodes.find((n) => n.deviceId === agentDeviceId);
    if (!entry) return;
    lastAgentDeviceId.current = agentDeviceId;
    void selectNode(entry, { onFocusAgent: () => {} });
  }, [agentDeviceId, fleetNodes]);
  useEffect(
    () => () => {
      if (!isDemoMode()) {
        useAgentConnectionStore.getState().disconnect();
        lastAgentDeviceId.current = null;
      }
    },
    [],
  );

  const tabs = useMemo(() => {
    const ids: DroneDetailTab[] = [...STATIC_TAB_IDS];
    if (radioPresent) ids.push(RADIO_TAB_ID);
    if (visionPresent) ids.push(VISION_TAB_ID);
    const base = ids.map((id) => ({
      id: id as string,
      label: t(id),
      locked: false,
    }));
    // Companion-computer surface tabs, live or locked-teaser.
    for (const id of AGENT_SURFACE_TAB_IDS) {
      base.push({ id, label: t(id), locked: showLockedTabs });
    }
    return base;
  }, [t, radioPresent, visionPresent, showLockedTabs]);

  // Fall the active tab back to overview when its surface is no longer present
  // (a conditional capability dropped, or a plugin tab unmounted). Computed in
  // render to avoid a setState-in-effect cascade.
  const knownTab =
    isStaticTab(activeTab) ||
    isPluginTabId(activeTab) ||
    isAgentSurfaceTab(activeTab);
  const visibleTab =
    activeTab === RADIO_TAB_ID && !radioPresent
      ? "overview"
      : activeTab === VISION_TAB_ID && !visionPresent
        ? "overview"
        : !knownTab
          ? "overview"
          : activeTab;

  const metadata = useDroneMetadataStore((s) => s.profiles[droneId]);
  const managedDrones = useDroneManager((s) => s.drones);
  const isConnected = managedDrones.has(droneId);
  // The agent advertises an FC on a serial port (heartbeat) before the GCS has
  // finished dialing the live MAVLink session. During that window the Configure
  // tab should read "linking", not the hard "no FC / connect one" placeholder —
  // the agent clearly has a flight controller; we are mid-handshake.
  const agentFcConnected = useAgentSystemStore(
    (s) => s.status?.fc_connected ?? false,
  );
  const fcLinking = !isConnected && agentDeviceId !== null && agentFcConnected;

  const immersiveMode = useUiStore((s) => s.immersiveMode);
  const exitImmersiveMode = useUiStore((s) => s.exitImmersiveMode);
  const pendingDetailTab = useUiStore((s) => s.pendingDetailTab);
  const setPendingDetailTab = useUiStore((s) => s.setPendingDetailTab);

  const displayName = metadata?.displayName ?? drone?.name ?? droneId;

  // Consume pending detail tab from Cmd+K navigation
  useEffect(() => {
    if (pendingDetailTab) {
      setActiveTab(pendingDetailTab);
      setPendingDetailTab(null);
    }
  }, [pendingDetailTab, setPendingDetailTab]);

  // Exit immersive mode if tab changes away from overview
  useEffect(() => {
    if (immersiveMode && activeTab !== "overview") {
      exitImmersiveMode();
    }
  }, [activeTab, immersiveMode, exitImmersiveMode]);

  // Select this drone in drone-manager so getSelectedProtocol() returns the right protocol
  useEffect(() => {
    if (isConnected) {
      useDroneManager.getState().selectDrone(droneId);
    }
  }, [droneId, isConnected]);

  function handleDelete() {
    // Disconnect if connected
    if (isConnected) {
      useDroneManager.getState().removeDrone(droneId);
    }
    // Remove from fleet
    removeDrone(droneId);
    // Delete metadata
    useDroneMetadataStore.getState().deleteProfile(droneId);
    // A local node is the only fleet row backed by persisted storage
    // (local-nodes-store); the fleet + metadata stores above are RAM/IndexedDB
    // for this id but LocalDroneBridge re-creates the row from the persisted
    // node on the next load. Purge it too (and release the agent's pairing)
    // so a deleted local drone does not rehydrate as an offline ghost.
    if (droneId.startsWith("local-")) {
      const deviceId = droneId.slice("local-".length);
      const node = useLocalNodesStore
        .getState()
        .nodes.find((n) => n.deviceId === deviceId);
      if (node) {
        void unpairLocal(node.hostname, node.apiKey).catch(() => {
          // Agent gone / unreachable — local forget proceeds regardless.
        });
      }
      useLocalNodesStore.getState().removeNode(deviceId);
    }
    setDeleteOpen(false);
    toast(`Drone "${displayName}" deleted`, "warning");
    onClose();
  }

  if (!drone) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-text-secondary">
          Drone &quot;{droneId}&quot; not found
        </p>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("backToDashboard")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Merged header + tabs bar */}
      {!immersiveMode && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-default bg-bg-secondary flex-shrink-0">
          <h1 className="text-sm font-semibold text-text-primary shrink-0">{displayName}</h1>
          <DroneStatusBadge status={drone.status} />
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={14} />}
            onClick={onClose}
          />

          <div className="w-px h-5 bg-border-default shrink-0" />

          <div
            role="tablist"
            aria-label="Drone detail"
            className="flex items-center self-stretch"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`drone-tab-${tab.id}`}
                role="tab"
                aria-selected={visibleTab === tab.id}
                aria-controls={`drone-tabpanel-${tab.id}`}
                tabIndex={visibleTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => {
                  // Roving-tabindex + arrow-key nav per WAI-ARIA tab
                  // pattern. Left/Right/Home/End move + activate.
                  const idsArr = tabs.map((tt) => tt.id);
                  const idx = idsArr.indexOf(visibleTab as DroneDetailTab);
                  let nextIdx = idx;
                  if (e.key === "ArrowRight") {
                    nextIdx = (idx + 1) % idsArr.length;
                  } else if (e.key === "ArrowLeft") {
                    nextIdx = (idx - 1 + idsArr.length) % idsArr.length;
                  } else if (e.key === "Home") {
                    nextIdx = 0;
                  } else if (e.key === "End") {
                    nextIdx = idsArr.length - 1;
                  } else {
                    return;
                  }
                  e.preventDefault();
                  const nextId = idsArr[nextIdx];
                  setActiveTab(nextId);
                  requestAnimationFrame(() => {
                    document
                      .getElementById(`drone-tab-${nextId}`)
                      ?.focus();
                  });
                }}
                title={
                  tab.locked
                    ? tLink("locked.title", { surface: tab.label })
                    : undefined
                }
                className={cn(
                  "self-stretch flex items-center gap-1 px-2.5 text-xs font-medium transition-colors cursor-pointer shrink-0 -mb-px border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                  visibleTab === tab.id
                    ? "text-accent-primary border-accent-primary"
                    : tab.locked
                      ? "text-text-tertiary hover:text-text-secondary border-transparent"
                      : "text-text-secondary hover:text-text-primary border-transparent"
                )}
              >
                {tab.locked && <Lock size={10} className="opacity-70" />}
                {tab.label}
              </button>
            ))}
            {/* Plugin-contributed drone-detail tabs render after the
                static strip, sorted by manifest `order` then pluginId.
                Only the tab headers live here; the body is rendered
                inside the tabpanel switch below so the lazy mount
                stays in sync with the static-tab switcher. */}
            <DroneDetailTabHeaders
              agentId={droneId}
              activeTabId={visibleTab}
              onSelectPluginTab={setActiveTab}
            />
          </div>

          <span className="text-[10px] font-mono text-text-tertiary ml-auto shrink-0">
            ID: {drone.id}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={12} />}
            onClick={() => setDeleteOpen(true)}
            className="text-status-error hover:text-status-error"
          />
          <RuntimeModeBadge />
          {isConnected && <NavStatePill />}
          {isConnected && <TrafficPill />}
          {isConnected && <ConnectionQualityMeter />}
          {isConnected && (
            <Button
              variant="danger"
              size="sm"
              icon={<RotateCcw size={12} />}
              onClick={() => {
                const protocol = useDroneManager.getState().getSelectedProtocol();
                if (protocol) protocol.reboot();
              }}
            >
              {t("rebootFc")}
            </Button>
          )}
        </div>
      )}

      {/* Tab content. Plugin-contributed tabs render their own
          <div role="tabpanel"> via DroneDetailTabBody so the aria
          association resolves to the plugin's iframe wrapper. Static
          tabs share the panel div below. */}
      {isPluginTabId(visibleTab) ? (
        <DroneDetailTabBody
          agentId={droneId}
          activeTabId={visibleTab}
        />
      ) : (
        <div
          id={`drone-tabpanel-${visibleTab}`}
          role="tabpanel"
          aria-labelledby={`drone-tab-${visibleTab}`}
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
        >
          {visibleTab === "overview" && <DroneOverviewTab drone={drone} />}
          {visibleTab === "flights" && <DroneFlightsTab droneId={droneId} />}
          {visibleTab === "parameters" &&
            (isConnected ? (
              <ParametersPanel />
            ) : (
              <LinkUpPlaceholder variant="no-fc-direct" droneName={displayName} />
            ))}
          {visibleTab === "configure" && (
            <DroneConfigureTab
              droneId={droneId}
              droneName={displayName}
              isConnected={isConnected}
              fcLinking={fcLinking}
            />
          )}
          {visibleTab === RADIO_TAB_ID && radioPresent && (
            <DroneRadioPanel droneId={droneId} />
          )}
          {visibleTab === VISION_TAB_ID && visionPresent && (
            <DroneVisionTab droneId={droneId} />
          )}
          {isAgentSurfaceTab(visibleTab) &&
            (showLockedTabs ? (
              <LinkUpPlaceholder
                variant="locked"
                surface={t(visibleTab)}
                droneName={displayName}
              />
            ) : visibleTab === "agent" ? (
              <AgentOverviewTab />
            ) : visibleTab === "system" ? (
              <SystemTab />
            ) : visibleTab === "blackbox" ? (
              <BlackBoxTab />
            ) : visibleTab === "plugins" ? (
              <PluginsTab />
            ) : null)}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        title={t("deleteDrone")}
        message={t("deleteConfirm", { name: displayName })}
        confirmLabel={t("delete")}
        variant="danger"
      />
    </div>
  );
}
