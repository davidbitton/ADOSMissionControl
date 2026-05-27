"use client";

/**
 * @module DroneOverview
 * @description Per-node overview for the `drone` profile.
 * Renders flight-relevant cards: video, flight data, RC input, battery,
 * compute metrics, sensor status, plus the shared status / services /
 * resources / logs surface.
 *
 * Picked by `NodeOverviewRouter` when `profile === "drone"`. Ground
 * stations route to `GroundStationOverview`.
 * @license GPL-3.0-only
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { AgentStatusCard } from "../shared/AgentStatusCard";
import { ServiceTable } from "../shared/ServiceTable";
import { SystemResourceGauges } from "../shared/SystemResourceGauges";
import { CpuSparkline } from "../shared/CpuSparkline";
import { MemorySparkline } from "../shared/MemorySparkline";
import { LogViewer } from "../shared/LogViewer";
import { AgentDisconnectedPage } from "../AgentDisconnectedPage";
import { StaleBanner } from "../shared/StaleBanner";
import { VideoRestartBanner } from "../shared/VideoRestartBanner";
import { VideoFeedCard } from "../shared/VideoFeedCard";
import { BatteryCard } from "../shared/BatteryCard";
import { RcInputCard } from "../shared/RcInputCard";
import { FlightDataCard } from "../shared/FlightDataCard";
import { SensorStatusCard } from "../shared/SensorStatusCard";
import { ComputeMetricsCard } from "../shared/ComputeMetricsCard";

export function DroneOverview() {
  const t = useTranslations("agent");
  const connected = useAgentConnectionStore((s) => s.connected);
  const status = useAgentSystemStore((s) => s.status);
  const services = useAgentSystemStore((s) => s.services);
  const resources = useAgentSystemStore((s) => s.resources);
  const logs = useAgentSystemStore((s) => s.logs);
  const processCpu = useAgentSystemStore((s) => s.processCpuPercent);
  const processMemMb = useAgentSystemStore((s) => s.processMemoryMb);
  const fetchServices = useAgentSystemStore((s) => s.fetchServices);
  const fetchResources = useAgentSystemStore((s) => s.fetchResources);
  const fetchLogs = useAgentSystemStore((s) => s.fetchLogs);
  const restartService = useAgentSystemStore((s) => s.restartService);

  useEffect(() => {
    if (connected) {
      fetchServices();
      fetchResources();
      fetchLogs();
    }
  }, [connected, fetchServices, fetchResources, fetchLogs]);

  if (!status) {
    if (!connected) {
      return <AgentDisconnectedPage />;
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">{t("waitingForStatus")}</p>
        <p className="text-xs text-text-tertiary">{t("shouldReportShortly")}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <StaleBanner />
      <VideoRestartBanner />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          {status && <AgentStatusCard status={status} />}
        </div>

        <div className="xl:row-span-3 space-y-3">
          <VideoFeedCard />
          <FlightDataCard />
          <RcInputCard />
        </div>

        <div className="space-y-4">
          <LogViewer logs={logs} onRefresh={fetchLogs} />
          <ServiceTable
            services={services}
            onRestart={restartService}
            onRestartAll={() => restartService("ados-supervisor")}
            processCpu={processCpu}
            processMemoryMb={processMemMb}
          />
        </div>

        <div className="space-y-4">
          {resources && <SystemResourceGauges resources={resources} />}
          <CpuSparkline />
          <MemorySparkline />
          <BatteryCard />
          <ComputeMetricsCard />
          <SensorStatusCard />
        </div>
      </div>
    </div>
  );
}
