"use client";

/**
 * @module NodeSidebar
 * @description Flat sidebar list of every node Mission Control
 * knows about: cloud-paired drones, ground stations, relays,
 * receivers, and locally-paired LAN nodes. Each row shows the
 * agent type ("Drone Agent", "Ground Agent", ...) derived from
 * the heartbeat ``profile`` so the operator can distinguish the
 * role at a glance.
 *
 * On HTTPS origins the click handler routes locally-paired nodes
 * through the cloud relay (``connectCloud``) because the browser
 * blocks mixed-content fetches to ``http://<host>:8080``. On HTTP
 * origins (desktop, localhost) the direct REST path is used.
 *
 * At or above ``VIRTUALIZE_THRESHOLD`` total nodes the list
 * switches to ``@tanstack/react-virtual`` rendering with an
 * internal scroll container. Below the threshold the typical
 * inline render is faster than the virtualizer overhead.
 * @license GPL-3.0-only
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation } from "convex/react";
import { Cpu, Radio, Server, Trash2 } from "lucide-react";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { cmdDronesApi } from "@/lib/community-api-drones";
import { useFleetNodes, type FleetNodeEntry } from "@/hooks/use-fleet-nodes";
import { usePairingStore } from "@/stores/pairing-store";
import { selectNode } from "@/lib/agent/node-click-handler";
import { forgetNode, type UnpairDroneMutation } from "@/lib/agent/forget-node";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

const VIRTUALIZE_THRESHOLD = 12;
const NODE_ROW_HEIGHT = 56;
const VIRTUAL_OVERSCAN = 4;

function profileIcon(p: FleetNodeEntry["profile"]) {
  if (p === "ground-station") return Radio;
  if (p === "compute") return Server;
  return Cpu;
}

interface NodeSidebarProps {
  onFocusAgent: () => void;
  /** When false, the section drops its top border + spacing so it
   *  sits flush against whatever's directly above. The caller knows
   *  whether anything precedes us; this prop just respects that. */
  showLeadingDivider?: boolean;
}

export function NodeSidebar({
  onFocusAgent,
  showLeadingDivider = true,
}: NodeSidebarProps) {
  const t = useTranslations("command.nodes");
  // Cloud-paired drones still render through FleetSidebar's full-featured
  // list above (rename inline-edit, context menu, virtualization). This
  // sidebar covers every other node: ground stations, relays, receivers,
  // compute nodes, and locally-paired drones that aren't in the
  // Convex-backed cloud list.
  const nodes = useFleetNodes().filter(
    (n) => n.isLocal || n.profile !== "drone",
  );
  const selectedPairedId = usePairingStore((s) => s.selectedPairedId);
  // Convex unpair mutation for forgetNode (deletes the cloud row so a cloud
  // node doesn't re-feed). A ConvexProvider is always mounted, so useMutation
  // never throws; we only invoke it when Convex is available.
  const convexAvailable = useConvexAvailable();
  const unpairDroneMutation = useMutation(cmdDronesApi.unpairDrone);

  // Pending forget, confirmed via a dialog (parity with the panel + cloud
  // surfaces). Holds the node so the confirm can show its name + route the
  // right convexId.
  const [pendingForget, setPendingForget] = useState<FleetNodeEntry | null>(
    null,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const useVirtual = nodes.length >= VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: useVirtual ? nodes.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => NODE_ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  });

  if (nodes.length === 0) return null;

  function agentTypeLabel(n: FleetNodeEntry): string {
    if (n.profile === "ground-station") {
      if (n.role === "relay") return t("agentLabel.relay");
      if (n.role === "receiver") return t("agentLabel.receiver");
      return t("agentLabel.groundStation");
    }
    if (n.profile === "compute") return t("agentLabel.compute");
    return t("agentLabel.drone");
  }

  function handleSelect(node: FleetNodeEntry) {
    void selectNode(node, { onFocusAgent });
  }

  function requestForget(node: FleetNodeEntry, e: React.MouseEvent) {
    e.stopPropagation();
    setPendingForget(node);
  }

  function confirmForget() {
    const node = pendingForget;
    setPendingForget(null);
    if (!node) return;
    // One atomic forget across every source. For a cloud-paired node this also
    // deletes the Convex row (via the mutation) so listMyDrones stops re-feeding
    // it; for a LAN node it releases the agent pairing + drops the credential.
    forgetNode(node._id, {
      convexId: node.convexId ?? null,
      unpairMutation: convexAvailable
        ? (unpairDroneMutation as UnpairDroneMutation)
        : null,
    });
  }

  function renderNode(n: FleetNodeEntry) {
    const Icon = profileIcon(n.profile);
    const selected = selectedPairedId === n._id;
    const typeLabel = agentTypeLabel(n);
    const subtitle = n.board ? `${typeLabel} · ${n.board}` : typeLabel;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${n.name} ${typeLabel}`}
        onClick={() => void handleSelect(n)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleSelect(n);
          }
        }}
        className={cn(
          "group flex items-start gap-2 rounded border p-2 cursor-pointer transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
          selected
            ? "border-accent-primary/30 bg-accent-primary/10"
            : "border-transparent hover:bg-bg-tertiary",
        )}
      >
        <Icon
          size={14}
          className={cn(
            "mt-0.5 shrink-0",
            selected ? "text-accent-primary" : "text-text-secondary",
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                "truncate text-xs font-medium",
                selected
                  ? "text-accent-primary"
                  : "text-text-primary",
              )}
            >
              {n.name}
            </p>
            {n.isLocal && (
              <Badge variant="neutral" className="text-[9px] px-1 py-0">
                {t("local")}
              </Badge>
            )}
          </div>
          <p className="truncate text-[10px] text-text-tertiary">
            {subtitle}
          </p>
        </div>
        {/* Remove control — always visible (was hover-only) and available for
            cloud rows too (was gated on n.isLocal), so a cloud node can be
            forgotten here, not only via the right-click context menu. */}
        <button
          onClick={(e) => requestForget(n, e)}
          title={t("forgetLocal")}
          aria-label={t("forgetLocal")}
          className="opacity-60 hover:opacity-100 transition-opacity p-1 text-text-tertiary hover:text-status-error shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        showLeadingDivider
          ? "mt-3 border-t border-border-default pt-3"
          : "mt-1",
      )}
    >
      <p className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {t("label")} ({nodes.length})
      </p>
      {useVirtual ? (
        <div
          ref={scrollRef}
          className="max-h-[480px] overflow-auto"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const n = nodes[vi.index];
              if (!n) return null;
              return (
                <div
                  key={n._id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                    paddingBottom: 4,
                  }}
                >
                  {renderNode(n)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {nodes.map((n) => (
            <div key={n._id}>{renderNode(n)}</div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={pendingForget !== null}
        onConfirm={confirmForget}
        onCancel={() => setPendingForget(null)}
        title={t("forgetLocal")}
        message={
          pendingForget
            ? `Remove "${pendingForget.name}"? It will be unpaired and removed from this fleet.`
            : ""
        }
        variant="danger"
      />
    </div>
  );
}
