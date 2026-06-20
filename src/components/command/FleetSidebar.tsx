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
import { forgetNode, type UnpairDroneMutation as ForgetUnpairMutation } from "@/lib/agent/forget-node";
import { useClockTick } from "@/lib/agent/freshness";
import { deviceIdFromNodeId } from "@/lib/agent/node-id";
import { DroneRowExpanded } from "./fleet/DroneRow";
import { DroneContextMenu } from "./fleet/DroneContextMenu";
import { CollapsedSidebar } from "./fleet/CollapsedSidebar";
import { NodeSidebar } from "./nodes/NodeSidebar";
import { useFleetNodesFromRegistry } from "@/hooks/use-fleet-nodes";
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
  // The unified, deduped node list. A node paired both ways collapses to one
  // entry here (the local shadow), so rendering the cloud-drone list from this
  // (instead of the raw `pairedDrones`) means a cloud+local node renders ONCE:
  // its local form falls to NodeSidebar below; only cloud-ONLY drones list here.
  const fleetNodes = useFleetNodesFromRegistry();
  const fleetNodeCount = fleetNodes.length;
  // Cloud-paired DRONES with no local shadow. `_id` is the canonical
  // `node:<deviceId>` (selection compare), `convexId` carries the Convex doc id
  // for the rename / unpair mutations.
  const cloudDroneNodes = fleetNodes.filter(
    (n) => !n.isLocal && n.profile === "drone",
  );

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
    count: cloudDroneNodes.length,
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
  // loops when the agent is offline. The selection id is the canonical
  // `node:<deviceId>` for every node; we recover the device id and prefer the
  // LAN-paired local node (direct REST on http, cloud relay on https) and
  // fall back to a Convex-backed cloud pair matched by device id.
  useEffect(() => {
    if (autoConnectDone.current) return;
    if (!agentConnected && selectedPairedId) {
      const onHttps =
        typeof window !== "undefined" &&
        window.location.protocol === "https:";
      const deviceId = deviceIdFromNodeId(selectedPairedId);
      if (!deviceId) return;
      const node = localNodes.find((n) => n.deviceId === deviceId);
      if (node) {
        autoConnectDone.current = true;
        // Mirror the click-handler branching: the browser refuses
        // mixed-content fetches to http://*.local from an https origin, so the
        // only reachable path is the cloud relay. On http origins (localhost
        // dev, Electron, on-LAN self-hosters) the direct LAN poll is preferred.
        if (onHttps) {
          agentConnectCloud(node.deviceId);
        } else if (node.hostname && node.apiKey) {
          // Pass the deviceId so nodeDeviceId is set synchronously: the FC's
          // MAVLink session then reconciles to this node's `node:<deviceId>`
          // registry row instead of racing to a standalone row.
          void agentConnect(node.hostname, node.apiKey, node.deviceId);
        }
        return;
      }
      const drone = pairedDrones.find((d) => d.deviceId === deviceId);
      if (drone) {
        autoConnectDone.current = true;
        agentConnectCloud(drone.deviceId);
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
    // `_id` is the canonical `node:<deviceId>` selection id.
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
    // The Convex mutations + the pairing-store row key on the Convex doc id,
    // carried on `convexId` (the `_id` is now the canonical node id). Recover
    // it from the unified list; fall back to `_id` for older shapes.
    const entry = cloudDroneNodes.find((d) => d._id === drone._id);
    const convexId = entry?.convexId ?? drone._id;
    switch (action) {
      case "rename":
        setRenaming(drone._id);
        setRenameValue(drone.name);
        break;
      case "unpair":
        // One atomic forget across every source: disconnects, deletes the
        // Convex row (so listMyDrones stops re-feeding), releases any LAN
        // shadow pairing, and drops registry presence so the projected card
        // does not flash back. `drone._id` is the canonical `node:<deviceId>`.
        forgetNode(drone._id, {
          convexId,
          unpairMutation: unpairDroneMutation as ForgetUnpairMutation,
        });
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

  function handleRenameSubmit(nodeId: string) {
    const drone = cloudDroneNodes.find((d) => d._id === nodeId);
    const convexId = drone?.convexId ?? nodeId;
    if (renameValue.trim() && drone) {
      // The pairing-store row keys on the Convex doc id.
      updatePairedDroneName(convexId, renameValue.trim());
      // Persist rename to Convex
      renameDroneMutation
        ?.({ droneId: convexId as never, name: renameValue.trim() })
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
    ? cloudDroneNodes.find((d) => d._id === contextMenu.droneId) ?? null
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
      {fleetNodeCount > 0 && (
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

        {fleetNodeCount === 0 && (
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

        {cloudDroneNodes.length > 0 && cloudDroneNodes.length < VIRTUALIZE_THRESHOLD && (
          <div className="space-y-1">
            {cloudDroneNodes.map((drone) => (
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

        {cloudDroneNodes.length >= VIRTUALIZE_THRESHOLD && (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const drone = cloudDroneNodes[virtualRow.index];
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
          showLeadingDivider={cloudDroneNodes.length > 0}
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
