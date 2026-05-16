/**
 * @module useVisibleTabs
 * @description Derives which Command sub-tabs should be visible based on agent capabilities.
 * The Smart Modes tab only appears when vision features are enabled and hardware supports them.
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { FEATURE_CATALOG } from "@/lib/agent/feature-catalog";

export type StaticTab = "overview" | "features" | "system" | "scripts";
export type DynamicTab = "smart-modes" | "ros" | "plugins";
export type CommandSubTab = StaticTab | DynamicTab;

export function useVisibleTabs(): CommandSubTab[] {
  const loaded = useAgentCapabilitiesStore((s) => s.loaded);
  const tier = useAgentCapabilitiesStore((s) => s.tier);
  const enabledFeatures = useAgentCapabilitiesStore((s) => s.features.enabled);
  const cameras = useAgentCapabilitiesStore((s) => s.cameras);
  const npuAvailable = useAgentCapabilitiesStore((s) => s.compute.npu_available);
  const ros2State = useAgentCapabilitiesStore((s) => s.ros2State);
  const runtimeMode = useAgentCapabilitiesStore((s) => s.runtimeMode);
  const profile = useAgentCapabilitiesStore((s) => s.profile);

  return useMemo(() => {
    const tabs: CommandSubTab[] = ["overview", "features"];

    // Lite-mode agents do not ship the plugin host, peripheral
    // manager, scripting tier, or ROS integration. Drop the
    // corresponding sub-tabs so the operator is not offered surfaces
    // the running backend cannot serve.
    const isLite = runtimeMode === "lite";

    // Ground stations don't fly. Drop tabs that only make sense on a
    // node that flies a vehicle. Compute nodes get their own panel
    // tree (handled at the panel level, not here).
    const isGroundStation = profile === "ground-station";

    // Show Smart Modes tab when:
    // 1. At least one smart-mode or vision-requiring feature is enabled
    // 2. Camera is detected
    // 3. NPU or sufficient tier exists
    if (loaded && !isLite && !isGroundStation) {
      const hasSmartMode = enabledFeatures.some((id) => {
        const feat = FEATURE_CATALOG[id];
        return feat?.type === "smart-mode" || feat?.visionBehavior;
      });
      const hasCamera = cameras.length > 0;
      const hasCompute = npuAvailable || tier >= 3;

      if (hasSmartMode && hasCamera && hasCompute) {
        tabs.push("smart-modes");
      }
    }

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
  }, [loaded, tier, enabledFeatures, cameras, npuAvailable, ros2State, runtimeMode, profile]);
}
