"use client";

/**
 * @module DronePluginsList
 * @description The list body of the per-drone Plugins tab. Renders one
 * `<DronePluginCard>` per install row scoped to this drone. Reads from
 * `cmdPlugins:listForDevice` in connected operation; in demo mode it
 * surfaces fixture installs from `mock-plugins.ts`.
 *
 * Empty-state, loading, and disconnected states render inline. The
 * Convex query is wrapped in the skip guard so a missing deployment,
 * demo mode, or a query that 404s at runtime never crashes the host
 * panel; the operator simply sees the empty state.
 *
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { makeFunctionReference } from "convex/server";

import { isDemoMode } from "@/lib/utils";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import {
  getDemoDronePluginSummaries,
  getDemoDronePluginInstalls,
} from "@/mock/mock-plugins";
import type {
  PluginInstallStatus,
  PluginRiskLevel,
  PluginSource,
} from "@/lib/plugins/types";
import { useAgentPluginInventoryStore } from "@/stores/agent-plugin-inventory-store";

import {
  DronePluginCard,
  type DronePluginCardData,
} from "./DronePluginCard";

interface DronePluginsListProps {
  /** Drone the list is scoped to. */
  agentId: string;
  /** Optional class on the list wrapper. */
  className?: string;
  /** Render fallback when the list is empty. */
  emptyState?: React.ReactNode;
}

/**
 * Convex install row shape returned by `cmdPlugins:listForDevice`.
 * Mirrors the schema in `convex/schema.ts` plus the cloud-relay
 * identifier the card needs to enqueue commands.
 */
interface InstallRowForDevice {
  _id: string;
  pluginId: string;
  name: string;
  version: string;
  risk: PluginRiskLevel;
  source: PluginSource;
  signerId?: string;
  status: PluginInstallStatus;
  halves: Array<"agent" | "gcs">;
  deviceId: string;
}

const listForDeviceRef = makeFunctionReference<
  "query",
  { deviceId: string },
  InstallRowForDevice[]
>("cmdPlugins:listForDevice");

export function DronePluginsList({
  agentId,
  className,
  emptyState,
}: DronePluginsListProps) {
  const t = useTranslations("dronePlugins");

  // Run the Convex listForDevice query unconditionally (modulo demo
  // mode + a real agentId). The query already returns an empty list
  // for unauthenticated callers, which is the correct UX for LAN-only
  // mode where the operator has no Convex identity but still needs
  // the empty-state to surface instead of a perpetual loading spinner.
  // Cloud-relay sessions with a real auth identity still get their
  // proper install list.
  const installs = useConvexSkipQuery(listForDeviceRef, {
    args: { deviceId: agentId },
    enabled: Boolean(agentId) && !isDemoMode(),
  });

  // Webapp-side installs the agent reported via heartbeat. The Convex
  // table stays the authority; this surfaces only entries that the
  // GCS-side query did not yet see (the operator installed straight
  // from the agent dashboard at port 8080 with no cloud account).
  const inventory = useAgentPluginInventoryStore(
    (s) => s.byDevice[agentId],
  );

  // In demo mode the list reads from a static fixture set so the per-
  // drone tab is observable without Convex. The mock module exposes a
  // shape compatible with the production card.
  const cards = useMemo<DronePluginCardData[]>(() => {
    if (isDemoMode()) {
      const summaries = getDemoDronePluginSummaries(agentId);
      const rows = getDemoDronePluginInstalls(agentId);
      return summaries.map((s, i) => ({
        ...s,
        installId: rows[i]?.installId ?? `demo-install-${i}`,
        deviceId: agentId,
      }));
    }
    const convexRows = installs ?? [];
    const fromConvex: DronePluginCardData[] = convexRows.map((row) => ({
      pluginId: row.pluginId,
      version: row.version,
      name: row.name,
      risk: row.risk,
      source: row.source,
      signerId: row.signerId,
      status: row.status,
      halves: row.halves,
      installId: String(row._id),
      deviceId: row.deviceId,
    }));
    // Merge agent-reported inventory entries that the Convex query
    // did not return. These are typically webapp installs done on
    // the drone itself before the GCS knew about them.
    const seen = new Set(fromConvex.map((c) => c.pluginId));
    const fromAgent: DronePluginCardData[] = (inventory ?? [])
      .filter((entry) => entry.plugin_id && !seen.has(entry.plugin_id))
      .map((entry) => ({
        pluginId: entry.plugin_id,
        version: entry.version ?? "—",
        name: entry.plugin_id,
        // Webapp installs report no GCS-side metadata. Fall back to
        // safe defaults; the card already renders a status pill from
        // ``status`` so the operator sees what the agent reports.
        risk: "low" as PluginRiskLevel,
        source: "agent_webapp" as PluginSource,
        signerId: undefined,
        status: (entry.status ?? "unknown") as PluginInstallStatus,
        halves: ["agent"] as Array<"agent" | "gcs">,
        installId: `agent:${entry.plugin_id}`,
        deviceId: agentId,
      }));
    return [...fromConvex, ...fromAgent];
  }, [agentId, installs, inventory]);

  if (!isDemoMode() && installs === undefined) {
    return (
      <p className="py-8 text-center text-xs text-text-tertiary">
        {t("loading")}
      </p>
    );
  }

  if (cards.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <ul
      data-testid="drone-plugins-list"
      className={className ?? "flex flex-col gap-2"}
    >
      {cards.map((c) => (
        <li key={c.installId}>
          <DronePluginCard install={c} />
        </li>
      ))}
    </ul>
  );
}
