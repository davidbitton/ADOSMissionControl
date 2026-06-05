"use client";

/**
 * @module FleetSidebar
 * @description Sidebar panel for managing paired ADOS drones.
 * Shows paired drones with online/offline status, provides pairing CTA,
 * and context menu for rename/unpair actions.
 * @license GPL-3.0-only
 */

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Plus, Cpu, ChevronLeft, LayoutGrid } from "lucide-react";
import { useMutation } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { cmdDronesApi } from "@/lib/community-api-drones";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePairingStore, type PairedDrone } from "@/stores/pairing-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { unpairLocal } from "@/lib/agent/local-pair-client";
import { useClockTick } from "@/lib/agent/freshness";
import { DroneRowExpanded } from "./fleet/DroneRow";
import { DroneContextMenu } from "./fleet/DroneContextMenu";
import { CollapsedSidebar } from "./fleet/CollapsedSidebar";
import { NodeSidebar } from "./nodes/NodeSidebar";
import { useFleetNodes } from "@/hooks/use-fleet-nodes";
import type {
  RenameDroneMutation,
  UnpairDroneMutation,
} from "./fleet/types";

// Estimated row height in px. DroneRowExpanded renders a single row
// with status dot + name + meta — about 48-56px depending on whether
// the rename input is showing. Virtualizer measures actual heights
// after first render so this is just a starting hint.
const FLEET_ROW_ESTIMATE_PX = 52;
// Overscan keeps a few rows above and below the viewport rendered so
// scroll jitter does not flash empty space.
const FLEET_OVERSCAN = 6;
// Crossover point: below this drone count, the rendering cost is so
// low that the virtualizer adds more weight than it saves.
const VIRTUALIZE_THRESHOLD = 12;

interface FleetSidebarProps {
  collapsed: boolean;
  fleetSelected: boolean;
  onToggleCollapse: () => void;
  onOpenPairing: () => void;
  onShowFleet: () => void;
  onFocusAgent: () => void;
}

export function FleetSidebar({
  collapsed,
  fleetSelected,
  onToggleCollapse,
  onOpenPairing,
  onShowFleet,
  onFocusAgent,
}: FleetSidebarProps) {
  const convexAvailable = useConvexAvailable();
  if (convexAvailable) {
    return (
      <FleetSidebarWithConvex
        collapsed={collapsed}
        fleetSelected={fleetSelected}
        onToggleCollapse={onToggleCollapse}
        onOpenPairing={onOpenPairing}
        onShowFleet={onShowFleet}
        onFocusAgent={onFocusAgent}
      />
    );
  }
  return (
    <FleetSidebarBase
      collapsed={collapsed}
      fleetSelected={fleetSelected}
      onToggleCollapse={onToggleCollapse}
      onOpenPairing={onOpenPairing}
      onShowFleet={onShowFleet}
      onFocusAgent={onFocusAgent}
      renameDroneMutation={null}
      unpairDroneMutation={null}
    />
  );
}

function FleetSidebarWithConvex({
  collapsed,
  fleetSelected,
  onToggleCollapse,
  onOpenPairing,
  onShowFleet,
  onFocusAgent,
}: FleetSidebarProps) {
  const renameDroneMutation = useMutation(cmdDronesApi.renameDrone);
  const unpairDroneMutation = useMutation(cmdDronesApi.unpairDrone);

  return (
    <FleetSidebarBase
      collapsed={collapsed}
      fleetSelected={fleetSelected}
      onToggleCollapse={onToggleCollapse}
      onOpenPairing={onOpenPairing}
      onShowFleet={onShowFleet}
      onFocusAgent={onFocusAgent}
      renameDroneMutation={renameDroneMutation as RenameDroneMutation}
      unpairDroneMutation={unpairDroneMutation as UnpairDroneMutation}
    />
  );
}

function FleetSidebarBase({
  collapsed,
  fleetSelected,
  onToggleCollapse,
  onOpenPairing,
  onShowFleet,
  onFocusAgent,
  renameDroneMutation,
  unpairDroneMutation,
}: FleetSidebarProps & {
  renameDroneMutation: RenameDroneMutation;
  unpairDroneMutation: UnpairDroneMutation;
}) {
  const t = useTranslations("command");
  const pairedDrones = usePairingStore((s) => s.pairedDrones);
  const selectedPairedId = usePairingStore((s) => s.selectedPairedId);
  const selectPairedDrone = usePairingStore((s) => s.selectPairedDrone);
  const removePairedDrone = usePairingStore((s) => s.removePairedDrone);
  const updatePairedDroneName = usePairingStore((s) => s.updatePairedDroneName);
  // Subscribe to the 1Hz shared clock so drone dots transition live, stale,
  // offline without needing an unrelated Convex query to trigger a re-render.
  useClockTick();

  const agentConnectCloud = useAgentConnectionStore((s) => s.connectCloud);
  const agentConnect = useAgentConnectionStore((s) => s.connect);
  const agentConnected = useAgentConnectionStore((s) => s.connected);
  // Subscribe reactively so localStorage rehydration on first mount
  // triggers the auto-reconnect effect once the local-nodes-store
  // has caught up.
  const localNodes = useLocalNodesStore((s) => s.nodes);
  // Used both to suppress the "No nodes paired" empty state when the
  // NodeSidebar below has local-paired nodes to render and to feed the
  // collapsed rail with the merged cloud+local list.
  const fleetNodes = useFleetNodes();
  const fleetNodeCount = fleetNodes.length;

  // One-shot flag: only auto-reconnect on initial page load, not on
  // subsequent watchdog-driven disconnects. Without this, when the agent is
  // offline the watchdog marks connected=false, which triggers this effect,
  // which calls connectCloud() (resetting connected=true), creating an
  // infinite 60s reconnect loop that makes the drone appear online.
  const autoConnectDone = useRef(false);

  const [contextMenu, setContextMenu] = useState<{
    droneId: string;
    x: number;
    y: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copiedIp, setCopiedIp] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Virtualize so 100+ paired drones do not produce 100+ DroneRowExpanded
  // re-renders on every 1Hz useClockTick. For small fleets we still pay
  // the virtualizer overhead, so the render loop below short-circuits to
  // the plain map when the count is under VIRTUALIZE_THRESHOLD.
  const rowVirtualizer = useVirtualizer({
    count: pairedDrones.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => FLEET_ROW_ESTIMATE_PX,
    overscan: FLEET_OVERSCAN,
  });

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  // Focus rename input
  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  // Auto-reconnect on page load if a node was previously selected.
  // Only fires once (autoConnectDone ref) to prevent infinite reconnect
  // loops when the agent is offline. Branches on the selected id
  // prefix: synthetic "local:<deviceId>" ids resolve to the local-
  // nodes store and reconnect directly via REST, otherwise the
  // selection is a Convex-backed cloud pair and goes through the
  // cloud relay.
  useEffect(() => {
    if (autoConnectDone.current) return;
    if (!agentConnected && selectedPairedId) {
      const onHttps =
        typeof window !== "undefined" &&
        window.location.protocol === "https:";
      if (selectedPairedId.startsWith("local:")) {
        const deviceId = selectedPairedId.slice("local:".length);
        const node = localNodes.find((n) => n.deviceId === deviceId);
        if (node) {
          autoConnectDone.current = true;
          // Mirror the click-handler branching: the browser refuses
          // mixed-content fetches to http://*.local from an https
          // origin, so the only reachable path is the cloud relay.
          // On http origins (localhost dev, Electron, on-LAN
          // self-hosters) the direct LAN poll is preferred.
          if (onHttps) {
            agentConnectCloud(node.deviceId);
          } else if (node.hostname && node.apiKey) {
            // Pass the deviceId so nodeDeviceId is set synchronously: the FC's
            // MAVLink session then reconciles to this node's local-<deviceId>
            // card instead of racing to a standalone agent-<timestamp> row.
            void agentConnect(node.hostname, node.apiKey, node.deviceId);
          }
        }
      } else if (pairedDrones.length > 0) {
        const drone = pairedDrones.find((d) => d._id === selectedPairedId);
        if (drone) {
          autoConnectDone.current = true;
          agentConnectCloud(drone.deviceId);
        }
      }
    }
  }, [
    selectedPairedId,
    pairedDrones,
    localNodes,
    agentConnected,
    agentConnect,
    agentConnectCloud,
  ]);

  function handleDroneClick(drone: PairedDrone) {
    selectPairedDrone(drone._id);
    onFocusAgent();
    // Always cloud relay for paired drones. Direct mode is only for
    // manually-entered agent URLs (not fleet sidebar). HTTP localhost dev
    // cannot reach agent LAN IP and would break setCloudStatus wiring.
    agentConnectCloud(drone.deviceId);
  }

  function handleContextAction(
    action: "rename" | "copy-ip" | "unpair",
    drone: PairedDrone
  ) {
    setContextMenu(null);
    switch (action) {
      case "rename":
        setRenaming(drone._id);
        setRenameValue(drone.name);
        break;
      case "unpair":
        removePairedDrone(drone._id);
        // Also delete from Convex so the reactive query removes it
        unpairDroneMutation?.({ droneId: drone._id as never }).catch(() => {});
        // If this cloud drone also has a LAN entry (same deviceId), release the
        // agent's pairing and forget the local credential too, so a node paired
        // both ways doesn't linger as a stale local card after a cloud unpair.
        {
          const shadow = useLocalNodesStore
            .getState()
            .nodes.find((n) => n.deviceId === drone.deviceId);
          if (shadow) {
            void unpairLocal(shadow.hostname, shadow.apiKey).catch(() => {});
            useLocalNodesStore.getState().removeNode(shadow.deviceId);
          }
        }
        break;
      case "copy-ip":
        if (drone.lastIp) {
          navigator.clipboard
            .writeText(drone.lastIp)
            .then(() => {
              setCopiedIp(true);
              setTimeout(() => setCopiedIp(false), 1500);
            })
            .catch(() => {});
        }
        break;
    }
  }

  function handleRenameSubmit(droneId: string) {
    if (renameValue.trim()) {
      updatePairedDroneName(droneId, renameValue.trim());
      // Persist rename to Convex
      renameDroneMutation
        ?.({ droneId: droneId as never, name: renameValue.trim() })
        .catch(() => {});
    }
    setRenaming(null);
  }

  function openContextMenu(droneId: string, coords: { x: number; y: number }) {
    setContextMenu({ droneId, x: coords.x, y: coords.y });
  }

  // Collapsed view
  if (collapsed) {
    return (
      <CollapsedSidebar
        nodes={fleetNodes}
        selectedPairedId={selectedPairedId}
        fleetSelected={fleetSelected}
        onToggleCollapse={onToggleCollapse}
        onOpenPairing={onOpenPairing}
        onShowFleet={onShowFleet}
        onFocusAgent={onFocusAgent}
      />
    );
  }

  // Expanded view
  const activeContextDrone = contextMenu
    ? pairedDrones.find((d) => d._id === contextMenu.droneId) ?? null
    : null;

  return (
    <div className="w-56 shrink-0 flex flex-col h-full border-r border-border-default bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t("pairedNodes")}
        </span>
        <button
          onClick={onToggleCollapse}
          className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
          title={t("collapse")}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Top row: fleet/overview selector + pair action sharing one
          line below the header. Hidden until at least one node exists
          so the empty state owns the initial pair affordance instead. */}
      {(pairedDrones.length > 0 || fleetNodeCount > 0) && (
        <div className="flex items-center gap-1.5 px-2 py-2 border-b border-border-default">
          <button
            type="button"
            onClick={() => {
              selectPairedDrone(null);
              onShowFleet();
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded border px-2 py-1.5 text-xs font-medium transition-colors",
              fleetSelected
                ? "border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
                : "border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
            )}
          >
            <LayoutGrid size={14} className="shrink-0" />
            <span className="truncate">{t("fleet")}</span>
          </button>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 rounded"
            icon={<Plus size={12} />}
            onClick={onOpenPairing}
          >
            {t("pair")}
          </Button>
        </div>
      )}

      {/* Drone list */}
      <div ref={listRef} className="flex-1 overflow-auto p-2">

        {pairedDrones.length === 0 && fleetNodeCount === 0 && (
          <div className="text-center py-8 space-y-3">
            <Cpu size={24} className="mx-auto text-text-tertiary/40" />
            <p className="text-xs text-text-tertiary">{t("noNodesPaired")}</p>
            <button
              onClick={onOpenPairing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-primary text-white rounded hover:opacity-90 transition-opacity"
            >
              <Plus size={12} />
              {t("pairFirstNode")}
            </button>
          </div>
        )}

        {pairedDrones.length > 0 && pairedDrones.length < VIRTUALIZE_THRESHOLD && (
          <div className="space-y-1">
            {pairedDrones.map((drone) => (
              <DroneRowExpanded
                key={drone._id}
                drone={drone}
                selected={selectedPairedId === drone._id}
                renaming={renaming === drone._id}
                renameValue={renameValue}
                renameInputRef={renameInputRef}
                onClick={handleDroneClick}
                onContextMenu={openContextMenu}
                onRenameChange={setRenameValue}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={() => setRenaming(null)}
              />
            ))}
          </div>
        )}

        {pairedDrones.length >= VIRTUALIZE_THRESHOLD && (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const drone = pairedDrones[virtualRow.index];
              if (!drone) return null;
              return (
                <div
                  key={drone._id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: 4,
                  }}
                >
                  <DroneRowExpanded
                    drone={drone}
                    selected={selectedPairedId === drone._id}
                    renaming={renaming === drone._id}
                    renameValue={renameValue}
                    renameInputRef={renameInputRef}
                    onClick={handleDroneClick}
                    onContextMenu={openContextMenu}
                    onRenameChange={setRenameValue}
                    onRenameSubmit={handleRenameSubmit}
                    onRenameCancel={() => setRenaming(null)}
                  />
                </div>
              );
            })}
          </div>
        )}

        <NodeSidebar
          onFocusAgent={onFocusAgent}
          showLeadingDivider={pairedDrones.length > 0}
        />
      </div>

      {/* Context Menu */}
      {contextMenu && activeContextDrone && (
        <DroneContextMenu
          drone={activeContextDrone}
          x={contextMenu.x}
          y={contextMenu.y}
          copiedIp={copiedIp}
          menuRef={contextMenuRef}
          onAction={handleContextAction}
        />
      )}
    </div>
  );
}
