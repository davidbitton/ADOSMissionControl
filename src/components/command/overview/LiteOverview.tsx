"use client";

/**
 * @module LiteOverview
 * @description Per-node overview for `runtimeMode === "lite"` agents
 * (the Rust lite-rs binary on low-RAM SBCs like the Luckfox Pico Zero).
 * Hides the plugin host, ROS, scripting, and full service table since
 * the lite runtime does not expose those surfaces. Keeps status,
 * telemetry, battery, and system resources.
 * @license GPL-3.0-only
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { AgentStatusCard } from "../shared/AgentStatusCard";
import { SystemResourceGauges } from "../shared/SystemResourceGauges";
import { CpuSparkline } from "../shared/CpuSparkline";
import { MemorySparkline } from "../shared/MemorySparkline";
import { LogViewer } from "../shared/LogViewer";
import { AgentDisconnectedPage } from "../AgentDisconnectedPage";
import { StaleBanner } from "../shared/StaleBanner";
import { VideoFeedCard } from "../shared/VideoFeedCard";
import { FlightDataCard } from "../shared/FlightDataCard";
import { BatteryCard } from "../shared/BatteryCard";

export function LiteOverview() {
  const t = useTranslations("agent");
  const connected = useAgentConnectionStore((s) => s.connected);
  const status = useAgentSystemStore((s) => s.status);
  const resources = useAgentSystemStore((s) => s.resources);
  const logs = useAgentSystemStore((s) => s.logs);
  const fetchResources = useAgentSystemStore((s) => s.fetchResources);
  const fetchLogs = useAgentSystemStore((s) => s.fetchLogs);

  useEffect(() => {
    if (connected) {
      fetchResources();
      fetchLogs();
    }
  }, [connected, fetchResources, fetchLogs]);

  if (!status) {
    if (!connected) return <AgentDisconnectedPage />;
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">{t("waitingForStatus")}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <StaleBanner />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <AgentStatusCard status={status} />
        </div>

        <div className="xl:row-span-3 space-y-3">
          <VideoFeedCard />
          <FlightDataCard />
          <BatteryCard />
        </div>

        <div className="space-y-4">
          <LogViewer logs={logs} onRefresh={fetchLogs} />
        </div>

        <div className="space-y-4">
          {resources && <SystemResourceGauges resources={resources} />}
          <CpuSparkline />
          <MemorySparkline />
        </div>
      </div>
    </div>
  );
}
