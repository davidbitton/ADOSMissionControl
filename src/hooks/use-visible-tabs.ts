/**
 * @module useVisibleTabs
 * @description Derives which Command sub-tabs should be visible based on agent capabilities.
 * The Smart Modes tab only appears when vision features are enabled and hardware supports them.
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { FEATURE_CATALOG } from "@/lib/agent/feature-catalog";

// Existing tabs (pre-v1.0 design)
export type StaticTab = "overview" | "features" | "system" | "scripts";
export type DynamicTab = "smart-modes" | "ros";

// New tabs added in v1.0 (11-subtab redesign)
// Live Ops group
export type LiveOpsTab = "perception" | "views" | "control";
// Data and Analysis group
export type DataAnalysisTab = "world-model" | "studio" | "foxglove" | "rerun";
// Management group
export type ManagementTab = "mcp" | "assist";

export type CommandSubTab =
  | StaticTab
  | DynamicTab
  | LiveOpsTab
  | DataAnalysisTab
  | ManagementTab;

export function useVisibleTabs(): CommandSubTab[] {
  // All 11 new Command sub-tabs are always visible. Each tab's content
  // handles offline/capability-missing state internally with an empty
  // state message, so operators always know what exists.
  //
  // Legacy tabs (smart-modes, ros) still follow capability gating because
  // they're surfaced only when the underlying hardware/software is present.
  const loaded = useAgentCapabilitiesStore((s) => s.loaded);
  const tier = useAgentCapabilitiesStore((s) => s.tier);
  const enabledFeatures = useAgentCapabilitiesStore((s) => s.features.enabled);
  const cameras = useAgentCapabilitiesStore((s) => s.cameras);
  const npuAvailable = useAgentCapabilitiesStore((s) => s.compute.npu_available);
  const ros2State = useAgentCapabilitiesStore((s) => s.ros2State);

  return useMemo(() => {
    // Live Ops group
    const tabs: CommandSubTab[] = ["overview", "perception", "views", "control"];

    // Data and Analysis group
    tabs.push("world-model", "studio", "foxglove", "rerun");

    // Management group
    tabs.push("mcp", "assist", "system");

    // Legacy tabs (still gated on capabilities)
    tabs.push("features");

    if (loaded) {
      const hasSmartMode = enabledFeatures.some((id) => {
        const feat = FEATURE_CATALOG[id];
        return feat?.type === "smart-mode" || feat?.visionBehavior;
      });
      const hasCamera = cameras.length > 0;
      const hasCompute = npuAvailable || tier >= 3;
      if (hasSmartMode && hasCamera && hasCompute) tabs.push("smart-modes");
    }

    if (loaded && ros2State !== "absent") tabs.push("ros");

    tabs.push("scripts");

    return tabs;
  }, [loaded, tier, enabledFeatures, cameras, npuAvailable, ros2State]);
}
