"use client";

/**
 * @module NodeOverviewRouter
 * @description Picks the per-node overview component for the currently
 * selected agent based on its profile.
 *
 * Routing matrix:
 *   profile=ground-station                -> GroundStationOverview
 *   profile=compute                       -> ComputeOverview
 *   profile=drone                         -> DroneOverview
 *   anything else (forward-compat)        -> DroneOverview
 *
 * Mounted by `AgentOverviewTab`, which itself is the default tab in the
 * Command-tab agent view.
 * @license GPL-3.0-only
 */

import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { DroneOverview } from "./DroneOverview";
import { GroundStationOverview } from "./GroundStationOverview";
import { ComputeOverview } from "./ComputeOverview";

export function NodeOverviewRouter() {
  const profile = useAgentCapabilitiesStore((s) => s.profile);

  if (profile === "ground-station") return <GroundStationOverview />;
  if (profile === "compute") return <ComputeOverview />;
  return <DroneOverview />;
}
