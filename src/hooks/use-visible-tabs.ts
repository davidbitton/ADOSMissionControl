/**
 * @module useVisibleTabs
 * @description Derives which Command sub-tabs should be visible based on agent
 *   capabilities. Profile-aware: ground stations drop tabs that only make sense
 *   on a flying node.
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";

export type StaticTab = "overview" | "system" | "scripts";
export type DynamicTab = "ros" | "plugins";
export type CommandSubTab = StaticTab | DynamicTab;

export function useVisibleTabs(): CommandSubTab[] {
  const loaded = useAgentCapabilitiesStore((s) => s.loaded);
  const ros2State = useAgentCapabilitiesStore((s) => s.ros2State);
  const profile = useAgentCapabilitiesStore((s) => s.profile);

  return useMemo(() => {
    const tabs: CommandSubTab[] = ["overview"];

    // Ground stations don't fly. Drop tabs that only make sense on a
    // node that flies a vehicle. Compute nodes get their own panel
    // tree (handled at the panel level, not here).
    const isGroundStation = profile === "ground-station";

    // Show ROS tab when agent reports ROS support (any state except "absent").
    // ROS doesn't run on ground stations.
    if (loaded && !isGroundStation && ros2State !== "absent") {
      tabs.push("ros");
    }

    tabs.push("system");
    if (!isGroundStation) {
      tabs.push("scripts");
    }
    // Plugins surface lives on the Command page so install +
    // enable/disable is one click from the active-drone view.
    // Ground stations do not host drone-side plugins. Always present
    // otherwise so the install affordance is discoverable even on a
    // fresh drone with zero plugins installed.
    if (!isGroundStation) {
      tabs.push("plugins");
    }
    return tabs;
  }, [loaded, ros2State, profile]);
}
