"use client";

/**
 * @module AgentOverviewTab
 * @description Default tab in the Command-tab agent view. Defers to
 * `NodeOverviewRouter` which picks a per-profile overview component
 * (drone / ground-station / lite / compute) based on the connected
 * agent's `profile` + `runtimeMode`.
 *
 * The drone overview body (video, flight, RC, battery, services,
 * resources, logs) lives in `overview/DroneOverview.tsx` — this file
 * only delegates.
 * @license GPL-3.0-only
 */

import { NodeOverviewRouter } from "./overview/NodeOverviewRouter";

export function AgentOverviewTab() {
  return <NodeOverviewRouter />;
}
