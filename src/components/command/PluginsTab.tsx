"use client";

/**
 * @module command/PluginsTab
 * @description Per-drone plugin management surface on the Command page.
 *
 * The Command page's Plugins sub-tab. Renders the install affordance
 * and the list of installed plugins for the currently-connected drone.
 *
 * Why this is its own component rather than a thin re-export of the
 * dashboard's DronePluginsTab: the dashboard version looks up the
 * target drone in `useFleetStore`, which is only populated by demo
 * mode. The Command page connects via cloud relay or LAN-direct and
 * keeps the active drone in `agent-connection-store` +
 * `pairing-store`. This adapter resolves the active drone from those
 * stores and renders the same list + install affordance the dashboard
 * version uses.
 *
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { usePairingStore } from "@/stores/pairing-store";
import { DronePluginsList } from "@/components/dashboard/drone-plugins/DronePluginsList";
import { InstallPluginButton } from "@/components/dashboard/drone-plugins/InstallPluginButton";
import type { FleetDrone } from "@/lib/types";

const LOCAL_PREFIX = "local:";

export function PluginsTab() {
  const t = useTranslations("dronePlugins");
  const cloudMode = useAgentConnectionStore((s) => s.cloudMode);
  const connected = useAgentConnectionStore((s) => s.connected);
  const selectedPairedId = usePairingStore((s) => s.selectedPairedId);
  const pairedDrones = usePairingStore((s) => s.pairedDrones);
  const localNodes = useLocalNodesStore((s) => s.nodes);

  // Resolve the active drone via the same selectedPairedId decoder
  // the rest of the Command page uses. selectedPairedId is either
  // bare Convex _id (cloud-paired) or `local:<deviceId>` (LAN-direct).
  // Build a FleetDrone-shaped object large enough for InstallPluginButton
  // (which only reads id / name / cloudDeviceId) and DronePluginsList
  // (which only reads agentId, passed in via id).
  const activeDrone = useMemo<FleetDrone | null>(() => {
    if (!selectedPairedId) return null;
    if (selectedPairedId.startsWith(LOCAL_PREFIX)) {
      const deviceId = selectedPairedId.slice(LOCAL_PREFIX.length);
      const node = localNodes.find((n) => n.deviceId === deviceId);
      if (!node) return null;
      return {
        id: node.deviceId,
        name: node.name ?? node.deviceId,
        // LocalNode has no cloudDeviceId; the install dialog falls
        // back to targetDevice.id when cloudDeviceId is absent.
      } as FleetDrone;
    }
    const paired = pairedDrones.find((d) => d._id === selectedPairedId);
    if (!paired) return null;
    return {
      id: paired.deviceId,
      name: paired.name ?? paired.deviceId,
      cloudDeviceId: paired.deviceId,
    } as FleetDrone;
  }, [selectedPairedId, pairedDrones, localNodes]);

  if (!connected || activeDrone === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-text-secondary">
          {t("notConnectedTitle")}
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          {cloudMode ? t("notConnectedCloud") : t("notConnectedLocal")}
        </p>
      </div>
    );
  }

  const droneName = activeDrone.name ?? activeDrone.id;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-default bg-bg-secondary px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-text-primary">
            {t("titleForDrone", { drone: droneName })}
          </h2>
          <p className="truncate text-xs text-text-tertiary">
            {t("subtitle")}
          </p>
        </div>
        <InstallPluginButton targetDevice={activeDrone} />
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <DronePluginsList
          agentId={activeDrone.id}
          emptyState={<EmptyState drone={activeDrone} />}
        />
      </div>
    </div>
  );
}

function EmptyState({ drone }: { drone: FleetDrone }) {
  const t = useTranslations("dronePlugins");
  return (
    <div className="rounded-md border border-dashed border-border-default p-8 text-center">
      <p className="text-sm text-text-primary">{t("emptyStateTitle")}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-text-tertiary">
        {t("emptyStateBody")}
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <InstallPluginButton targetDevice={drone} />
      </div>
    </div>
  );
}
