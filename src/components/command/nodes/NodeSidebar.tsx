"use client";

/**
 * @module NodeSidebar
 * @description Profile-grouped sidebar for every node Mission
 * Control knows about: cloud-paired drones, ground stations,
 * relays, receivers, and locally-paired LAN nodes. Replaces the
 * old single-list "Paired drones" surface with a unified node
 * hub.
 *
 * Cloud and local nodes are merged via ``useFleetNodes`` and
 * grouped by ``profile`` + ``role``. Local nodes carry an
 * ``isLocal`` flag and render a small chip; clicking activates
 * the agent through the local REST direct path.
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import { Cpu, Radio, Server, Trash2 } from "lucide-react";
import { useFleetNodes, type FleetNodeEntry } from "@/hooks/use-fleet-nodes";
import { usePairingStore } from "@/stores/pairing-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type GroupKey = "drones" | "groundStations" | "relays" | "receivers" | "compute";

function groupFor(node: FleetNodeEntry): GroupKey {
  if (node.profile === "compute") return "compute";
  if (node.profile === "ground-station") {
    if (node.role === "relay") return "relays";
    if (node.role === "receiver") return "receivers";
    return "groundStations";
  }
  return "drones";
}

function profileIcon(p: FleetNodeEntry["profile"]) {
  if (p === "ground-station") return Radio;
  if (p === "compute") return Server;
  return Cpu;
}

interface NodeSidebarProps {
  onFocusAgent: () => void;
}

export function NodeSidebar({ onFocusAgent }: NodeSidebarProps) {
  const t = useTranslations("command.nodes");
  const groupLabels: Record<GroupKey, string> = {
    drones: t("drones"),
    groundStations: t("groundStations"),
    relays: t("relays"),
    receivers: t("receivers"),
    compute: t("compute"),
  };

  // Cloud-paired drones still render through FleetSidebar's full-featured
  // list above (rename inline-edit, context menu, virtualization). This
  // sidebar groups LAN-paired nodes by profile so the operator can see
  // ground stations, relays, receivers, and compute nodes at a glance
  // even when there's no cloud account.
  const nodes = useFleetNodes().filter((n) => n.isLocal);
  const selectedPairedId = usePairingStore((s) => s.selectedPairedId);
  const selectPairedDrone = usePairingStore((s) => s.selectPairedDrone);
  const removeNode = useLocalNodesStore((s) => s.removeNode);
  const connect = useAgentConnectionStore((s) => s.connect);
  const disconnect = useAgentConnectionStore((s) => s.disconnect);
  const activeUrl = useAgentConnectionStore((s) => s.agentUrl);
  const agentConnectCloud = useAgentConnectionStore((s) => s.connectCloud);

  if (nodes.length === 0) return null;

  // The wrapper divider is conditional on this component rendering
  // anything at all — early return above avoids a dangling divider
  // when there are zero local nodes.

  // Group nodes by profile + role.
  const groups: Record<GroupKey, FleetNodeEntry[]> = {
    drones: [],
    groundStations: [],
    relays: [],
    receivers: [],
    compute: [],
  };
  for (const n of nodes) {
    groups[groupFor(n)].push(n);
  }

  async function handleSelect(node: FleetNodeEntry) {
    selectPairedDrone(node._id);
    onFocusAgent();
    if (node.isLocal) {
      // Local nodes connect directly via the agent's REST URL.
      const hostname =
        useLocalNodesStore
          .getState()
          .nodes.find((n) => n.deviceId === node.deviceId)?.hostname;
      if (hostname && node.apiKey) {
        await connect(hostname, node.apiKey);
      }
    } else {
      // Cloud-paired nodes go through the cloud relay.
      agentConnectCloud(node.deviceId);
    }
  }

  function handleRemoveLocal(deviceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    // Only disconnect if the node being removed is the active one;
    // removing an idle local node shouldn't tear down a live link.
    const node = useLocalNodesStore
      .getState()
      .nodes.find((n) => n.deviceId === deviceId);
    if (node && activeUrl === node.hostname) disconnect();
    removeNode(deviceId);
  }

  const orderedKeys: GroupKey[] = [
    "drones",
    "groundStations",
    "relays",
    "receivers",
    "compute",
  ];

  return (
    <div className="mt-3 border-t border-border-default pt-3 space-y-3">
      {orderedKeys.map((key) => {
        const groupNodes = groups[key];
        if (groupNodes.length === 0) return null;
        return (
          <div key={key}>
            <p className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              {groupLabels[key]} ({groupNodes.length})
            </p>
            <div className="space-y-1">
              {groupNodes.map((n) => {
                const Icon = profileIcon(n.profile);
                const selected = selectedPairedId === n._id;
                return (
                  <div
                    key={n._id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void handleSelect(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        void handleSelect(n);
                    }}
                    className={cn(
                      "group flex items-start gap-2 rounded border p-2 cursor-pointer transition-colors",
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
                          <Badge
                            variant="neutral"
                            className="text-[9px] px-1 py-0"
                          >
                            {t("local")}
                          </Badge>
                        )}
                        {n.role && n.profile === "ground-station" && n.role !== "direct" && (
                          <Badge
                            variant="info"
                            className="text-[9px] px-1 py-0"
                          >
                            {n.role}
                          </Badge>
                        )}
                      </div>
                      {n.board && (
                        <p className="truncate text-[10px] text-text-tertiary">
                          {n.board}
                        </p>
                      )}
                    </div>
                    {n.isLocal && (
                      <button
                        onClick={(e) =>
                          handleRemoveLocal(n.deviceId, e)
                        }
                        title={t("forgetLocal")}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-text-tertiary hover:text-status-error"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
