"use client";

/**
 * @module SystemTab
 * @description Unified system view composing Hardware, Services, and Fleet
 * Network sub-panels.
 * @license GPL-3.0-only
 */

import { useSurfaceGate } from "@/hooks/use-surface-gate";
import { agentGateFallback } from "./shared/agent-gate-fallback";
import { HardwareStatusPanel } from "./system/HardwareStatusPanel";
import { MemoryPanel } from "./system/MemoryPanel";
import { ServicesPanel } from "./system/ServicesPanel";
import { FleetNetworkPanel } from "./system/FleetNetworkPanel";
import { AdapterStabilityCard } from "@/components/hardware/network/AdapterStabilityCard";
import { RadioNetworkHealthPanel } from "./system/RadioNetworkHealthPanel";
import { RegulatoryRegionPanel } from "./system/RegulatoryRegionPanel";

export function SystemTab() {
  const gate = useSurfaceGate("agent-online");

  const blocked = agentGateFallback(gate);
  if (blocked) return blocked;

  return (
    <div className="p-4 space-y-4 max-w-5xl overflow-y-auto">
      <HardwareStatusPanel />
      <MemoryPanel />
      <ServicesPanel />
      <FleetNetworkPanel />
      <AdapterStabilityCard />
      <RadioNetworkHealthPanel />
      <RegulatoryRegionPanel />
    </div>
  );
}
