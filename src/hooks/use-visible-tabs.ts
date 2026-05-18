/**
 * @module useVisibleTabs
 * @description Derives which Command sub-tabs should be visible based on agent
 *   capabilities. Profile-aware: ground stations drop tabs that only make sense
 *   on a flying node; the lite backend drops plugin / scripting / ROS surfaces.
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
  const runtimeMode = useAgentCapabilitiesStore((s) => s.runtimeMode);
  const profile = useAgentCapabilitiesStore((s) => s.profile);

  return useMemo(() => {
    const tabs: CommandSubTab[] = ["overview"];

    // Lite-mode agents do not ship the plugin host, peripheral
    // manager, scripting tier, or ROS integration. Drop the
    // corresponding sub-tabs so the operator is not offered surfaces
    // the running backend cannot serve.
    const isLite = runtimeMode === "lite";

    // Ground stations don't fly. Drop tabs that only make sense on a
    // node that flies a vehicle. Compute nodes get their own panel
    // tree (handled at the panel level, not here).
    const isGroundStation = profile === "ground-station";

    // Show ROS tab when agent reports ROS support (any state except "absent")
    // and is not the lite backend. ROS doesn't run on ground stations.
    if (loaded && !isLite && !isGroundStation && ros2State !== "absent") {
      tabs.push("ros");
    }

    tabs.push("system");
    if (!isLite && !isGroundStation) {
      tabs.push("scripts");
    }
    // Plugins surface lives on the Command page so install +
    // enable/disable is one click from the active-drone view.
    // Lite agents have no plugin host; ground stations do not host
    // drone-side plugins. Always present otherwise so the install
    // affordance is discoverable even on a fresh drone with zero
    // plugins installed.
    if (!isLite && !isGroundStation) {
      tabs.push("plugins");
    }
    return tabs;
  }, [loaded, ros2State, runtimeMode, profile]);
}
