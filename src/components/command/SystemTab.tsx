"use client";

/**
 * @module SystemTab
 * @description Unified system view composing Hardware, Services, and Fleet
 * Network sub-panels.
 * @license GPL-3.0-only
 */

import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { AgentDisconnectedPage } from "./AgentDisconnectedPage";
import { HardwareStatusPanel } from "./system/HardwareStatusPanel";
import { ServicesPanel } from "./system/ServicesPanel";
import { FleetNetworkPanel } from "./system/FleetNetworkPanel";

export function SystemTab() {
  const connected = useAgentConnectionStore((s) => s.connected);

  if (!connected) return <AgentDisconnectedPage />;

  return (
    <div className="p-4 space-y-4 max-w-5xl overflow-y-auto">
      <HardwareStatusPanel />
      <ServicesPanel />
      <FleetNetworkPanel />
    </div>
  );
}
