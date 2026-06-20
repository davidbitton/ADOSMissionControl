"use client";

/**
 * @module node-detail/NodeDetailPanel
 * @description The unified per-node detail panel for the Dashboard, central
 * command for every agent profile (drone / ground-station / compute / future).
 * The header chrome + tab strip are profile-agnostic; the visible surfaces are
 * resolved from the node's profile + role + capabilities via the surface
 * registry (./surfaces). Built-in surfaces and plugin-contributed tabs share
 * one render path. Renamed from DroneDetailPanel; the old path re-exports this.
 * @license GPL-3.0-only
 */

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "convex/react";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { cmdDronesApi } from "@/lib/community-api-drones";
import { useFleetStore } from "@/stores/fleet-store";
import { useDroneManager } from "@/stores/drone-manager";
import { useDroneMetadataStore } from "@/stores/drone-metadata-store";
import { forgetNode, type UnpairDroneMutation } from "@/lib/agent/forget-node";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DroneStatusBadge } from "@/components/shared/drone-status-badge";
import { LinkUpPlaceholder } from "@/components/shared/link-up/LinkUpPlaceholder";
import {
  DroneDetailTabHeaders,
  DroneDetailTabBody,
  isPluginTabId,
} from "@/components/plugins/DroneDetailTabHost";
import { X, RotateCcw, Trash2, Lock } from "lucide-react";
import { useFleetNodes } from "@/hooks/use-fleet-nodes";
import { selectNode } from "@/lib/agent/node-click-handler";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { isDemoMode } from "@/lib/utils";
import { ConnectionQualityMeter } from "@/components/indicators/ConnectionQualityMeter";
import { NavStatePill } from "@/components/indicators/NavStatePill";
import { RuntimeModeBadge } from "@/components/indicators/RuntimeModeBadge";
import { TrafficPill } from "@/components/indicators/TrafficPill";
import { useUiStore } from "@/stores/ui-store";
import { resolveSurfaces } from "./surfaces";
import type { SurfaceContext } from "./surface-types";

interface NodeDetailPanelProps {
  droneId: string;
  onClose: () => void;
}

export function NodeDetailPanel({ droneId, onClose }: NodeDetailPanelProps) {
  const t = useTranslations("dronePanel");
  const tLink = useTranslations("linkUp");
  // Namespace-less translator so a surface can reuse any existing key
  // (drone labels live under dronePanel.*, ground-station labels under
  // command.groundStation.tabs.*).
  const tRoot = useTranslations();
  const drones = useFleetStore((s) => s.drones);
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { toast } = useToast();

  // Convex unpair mutation, used by forgetNode to delete the cloud row so the
  // reactive listMyDrones query stops re-feeding a removed cloud drone. A
  // ConvexProvider is always mounted (local-only uses a non-resolving client),
  // so useMutation never throws; we only INVOKE it when Convex is available.
  const convexAvailable = useConvexAvailable();
  const unpairDroneMutation = useMutation(cmdDronesApi.unpairDrone);

  const drone = drones.find((d) => d.id === droneId);
  // This drone is backed by a companion-computer agent when the fleet row
  // carries the agent's device id (cloud-paired or LAN-paired projector).
  const agentDeviceId = drone?.cloudDeviceId ?? null;
  const fleetNodes = useFleetNodes();

  const radioPresent = useAgentCapabilitiesStore((s) => s.radio !== null);
  const visionPresent = useAgentCapabilitiesStore(
    (s) => s.visionAvailable === true,
  );
  // Ground-station role of the focused agent. The selected node IS the
  // focused agent (selection drives the connection), so the capabilities
  // store is authoritative; the fleet row's role is the synchronous fallback.
  const capRole = useAgentCapabilitiesStore((s) => s.role);

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
    // One atomic forget across every source (agent connection + managed FC +
    // Convex cloud row + LAN credential + registry presence). This is the fix
    // for the "removed drone instantly reconnects" bug: the old path poked the
    // cosmetic fleet-store (overwritten by the projection on the next tick) and
    // gated the durable removal on a LAN entry a cloud-only drone never has, so
    // the Convex row survived and listMyDrones re-fed it. forgetNode deletes the
    // Convex row + drops registry presence so the projection re-run finds
    // nothing. `convexId` is the cloud doc id when this node is cloud-paired.
    const convexId = fleetNodes.find((n) => n._id === droneId)?.convexId ?? null;
    forgetNode(droneId, {
      convexId,
      unpairMutation: convexAvailable
        ? (unpairDroneMutation as UnpairDroneMutation)
        : null,
    });
    setDeleteOpen(false);
    toast(`Drone "${displayName}" removed`, "warning");
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

  // Resolve the visible surfaces from the node's profile + role + caps. Plain
  // computation (not a hook) so it can sit after the guard; resolveSurfaces is
  // a cheap filter over the profile's descriptor list.
  const ctx: SurfaceContext = {
    droneId,
    drone,
    displayName,
    isConnected,
    agentDeviceId,
    fcLinking,
    radioPresent,
    visionPresent,
    role: capRole ?? drone.role ?? null,
    showLockedTabs,
  };
  const surfaces = resolveSurfaces(ctx);
  const surfaceIds = surfaces.map((s) => s.id);

  // Fall the active tab back to the first surface when its surface is no
  // longer present (a conditional capability dropped, a role flipped, or a
  // plugin tab unmounted). Plugin tabs keep their own active id.
  const visibleTab = surfaceIds.includes(activeTab)
    ? activeTab
    : isPluginTabId(activeTab)
      ? activeTab
      : (surfaces[0]?.id ?? "overview");

  const tabs = surfaces.map((s) => ({
    id: s.id,
    label: tRoot(s.labelKey),
    locked: s.locked ? s.locked(ctx) : false,
  }));

  const activeSurface = isPluginTabId(visibleTab)
    ? undefined
    : surfaces.find((s) => s.id === visibleTab);
  const activeBody = activeSurface
    ? activeSurface.locked?.(ctx)
      ? (
        <LinkUpPlaceholder
          variant="locked"
          surface={tRoot(activeSurface.labelKey)}
          droneName={displayName}
        />
      )
      : activeSurface.render(ctx)
    : null;

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
            aria-label="Node detail"
            className="flex items-center self-stretch overflow-x-auto scrollbar-hide"
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
                  const idx = idsArr.indexOf(visibleTab);
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
            className="text-status-error hover:text-status-error shrink-0"
            title="Remove this node"
          >
            {t("delete")}
          </Button>
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
          association resolves to the plugin's iframe wrapper. Built-in
          surfaces share the panel div below. */}
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
          {activeBody}
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
