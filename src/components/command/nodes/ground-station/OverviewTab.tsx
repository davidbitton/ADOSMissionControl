"use client";

/**
 * @module OverviewTab
 * @description Command-tab home for the ground-station Overview.
 * Polls the agent at 2 Hz for /api/v1/ground-station/status and
 * mirrors the tab-visibility pause pattern used by
 * agent-connection-store. Lifted from the prior /hardware (root)
 * route.
 * @license GPL-3.0-only
 */

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import { groundStationApiFromAgent } from "@/lib/api/ground-station-api";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useGroundStationStore } from "@/stores/ground-station-store";
import type { SetupStatus } from "@/lib/agent/types";
import { PairModal } from "@/components/hardware/PairModal";
import { PicWidget } from "@/components/hardware/PicWidget";
import { OverviewUplinkWidget } from "@/components/hardware/OverviewUplinkWidget";
import { PageIntro } from "@/components/hardware/PageIntro";
import { HintChip } from "@/components/hardware/HintChip";
import { Button } from "@/components/ui/button";
import { useGroundStationSubscriptions } from "@/hooks/use-ground-station-subscriptions";
import { SetupAccessCard, type CloudSetupSnapshot } from "@/components/hardware/SetupAccessCard";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import { cmdDroneStatusApi } from "@/lib/community-api-drones";

const POLL_INTERVAL_MS = 500; // 2 Hz
const EMPTY = "\u2026";

function formatRssi(rssi: number | null): string {
  if (rssi == null) return EMPTY;
  return `${rssi.toFixed(0)} dBm`;
}

function formatBitrate(mbps: number | null): string {
  if (mbps == null) return EMPTY;
  return `${mbps.toFixed(1)} Mbps`;
}

function formatChannel(channel: number | null): string {
  if (channel == null) return EMPTY;
  return `CH ${channel}`;
}

function formatRole(role: string | undefined | null): string {
  if (!role) return EMPTY;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

const SETUP_FETCH_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`request timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function OverviewTab() {
  const tProfile = useTranslations("hardware.profileLabels");
  const tOverview = useTranslations("hardware.overviewPage");
  const tCommon = useTranslations("hardware.common");

  const formatProfile = (profile: string): string => {
    if (profile === "ground_station") return tProfile("groundStation");
    if (profile === "drone") return tProfile("drone");
    if (profile === "auto") return tProfile("auto");
    return tProfile("unconfigured");
  };

  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);
  const agentClient = useAgentConnectionStore((s) => s.client);

  const status = useGroundStationStore((s) => s.status);
  const linkHealth = useGroundStationStore((s) => s.linkHealth);
  const loading = useGroundStationStore((s) => s.loading);
  const lastError = useGroundStationStore((s) => s.lastError);
  const lastFetchedAt = useGroundStationStore((s) => s.lastFetchedAt);
  const loadStatus = useGroundStationStore((s) => s.loadStatus);
  const setLoading = useGroundStationStore((s) => s.setLoading);
  const setError = useGroundStationStore((s) => s.setError);

  useGroundStationSubscriptions(agentUrl, apiKey);

  const [pairOpen, setPairOpen] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const client = groundStationApiFromAgent(agentUrl, apiKey);
      if (!client) {
        setLoading(false);
        return;
      }
      if (!useGroundStationStore.getState().lastFetchedAt) {
        setLoading(true);
      }
      try {
        const res = await client.getStatus();
        if (cancelled) return;
        loadStatus(
          {
            paired_drone: res.paired_drone ?? null,
            profile: res.profile ?? "unconfigured",
            uplink_active: res.uplink_active ?? null,
          },
          res.link_health,
        );
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to reach ground station";
        setError(msg);
        setLoading(false);
      }
    };

    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) poll();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [agentUrl, apiKey, loadStatus, setLoading, setError]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pollSetup = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!agentClient) {
        setSetupStatus(null);
        setSetupError(null);
        return;
      }
      try {
        const res = await withTimeout(
          agentClient.getSetupStatus(),
          SETUP_FETCH_TIMEOUT_MS,
        );
        if (!cancelled) {
          setSetupStatus(res);
          setSetupError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        // Keep the last good snapshot visible; surface the error inline.
        setSetupError(msg);
      }
    };

    void pollSetup();
    timer = setInterval(pollSetup, 5000);

    const onVisibility = () => {
      if (!document.hidden) void pollSetup();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [agentClient]);

  // Cloud-side fallback so the disconnected state can still surface a setup
  // URL when the agent has heartbeated through the cloud relay but Mission
  // Control has not paired with it locally yet.
  const cloudStatuses = useConvexSkipQuery(cmdDroneStatusApi.listMyCloudStatuses, {
    enabled: !agentClient,
  });
  const cloudFallback: CloudSetupSnapshot | null = (() => {
    const rows = Array.isArray(cloudStatuses) ? cloudStatuses : null;
    if (!rows || rows.length === 0) return null;
    // Pick the most recently heartbeated drone that advertised a setup URL.
    let best: Record<string, unknown> | null = null;
    let bestUpdatedAt = -Infinity;
    for (const row of rows) {
      const status = (row as { status: Record<string, unknown> | null }).status;
      if (!status) continue;
      const setupUrl = status.setupUrl as string | undefined;
      if (!setupUrl) continue;
      const updatedAt = (status.updatedAt as number | undefined) ?? 0;
      if (updatedAt > bestUpdatedAt) {
        best = status;
        bestUpdatedAt = updatedAt;
      }
    }
    if (!best) return null;
    return {
      setupUrl: (best.setupUrl as string | undefined) ?? null,
      cloudSetupUrl: null,
      mavlinkWsUrl: (best.mavlinkWsUrl as string | undefined) ?? null,
      videoWhepUrl: (best.videoWhepUrl as string | undefined) ?? null,
      missionControlUrl: (best.missionControlUrl as string | undefined) ?? null,
      mavlinkConnected:
        typeof best.fcConnected === "boolean" ? best.fcConnected : null,
      videoState: (best.videoState as string | undefined) ?? null,
      remoteStatus:
        typeof best.remoteAccess === "object" && best.remoteAccess !== null
          ? ((best.remoteAccess as Record<string, unknown>).status as
              | string
              | undefined) ?? null
          : null,
      completionPercent: null,
      nextAction: null,
    };
  })();

  const hasAgent = Boolean(agentUrl);
  const hasData = lastFetchedAt != null && hasAgent;

  return (
    <div className="flex flex-col">
      <div className="m-4 mb-0 rounded-lg border border-accent-primary/20 bg-accent-primary/5 p-3 text-xs text-text-secondary">
        <p className="font-medium text-text-primary">
          Hardware controls are consolidating into the Command tab.
        </p>
        <p className="mt-1 text-text-tertiary">
          The Command tab now hosts the local-first Add-a-Node flow and
          will host every node type (drone agent, ground station, relay,
          receiver, future compute) under one sidebar. Hardware will stay
          available during the transition for deeper sub-views.
        </p>
      </div>

      <PageIntro
        title={tOverview("title")}
        description={tOverview("description")}
        trailing={
          <HintChip>{tOverview("dragHint")}</HintChip>
        }
      />

      <SetupAccessCard
        setupStatus={setupStatus}
        cloudFallback={cloudFallback}
      />

      {!hasAgent ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-default bg-bg-secondary text-text-tertiary">
            <Radio size={24} />
          </div>
          <h2 className="text-sm font-display font-semibold text-text-primary">
            {tOverview("noAgentTitle")}
          </h2>
          <p className="mt-2 max-w-md text-xs text-text-tertiary leading-relaxed">
            {tOverview("noAgentBody")}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {cloudFallback?.setupUrl ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  window.open(cloudFallback.setupUrl!, "_blank", "noopener,noreferrer")
                }
              >
                {tOverview("openSetup")}
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setPairOpen(true)}
            >
              {tOverview("connectGroundStation")}
            </Button>
          </div>
          <PairModal open={pairOpen} onClose={() => setPairOpen(false)} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PicWidget />
            <OverviewUplinkWidget />
          </div>

          <section className="rounded border border-border-default bg-bg-secondary p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                {tOverview("groundStationHeading")}
              </h2>
              <div className="flex items-center gap-3">
                {loading && !hasData && !lastError ? (
                  <span className="text-xs text-text-secondary">{tCommon("loading")}</span>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPairOpen(true)}
                >
                  {tOverview("pairWithDrone")}
                </Button>
              </div>
            </div>

            {lastError && !hasData ? (
              <div className="flex items-start justify-between gap-3 rounded border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                <span>{tOverview("loadFailed", { error: lastError })}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setError(null)}
                >
                  {tCommon("retry")}
                </Button>
              </div>
            ) : null}

            {setupError ? (
              <div className="mt-2 rounded border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
                {tOverview("setupFetchFailed", { error: setupError })}
              </div>
            ) : null}

            {hasData ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <StatRow label={tOverview("rowPairedDrone")} value={status.paired_drone ?? tCommon("none")} />
                <StatRow label={tOverview("rowProfile")} value={formatProfile(status.profile)} />
                {status.profile === "ground_station" ? (
                  <StatRow
                    label={tOverview("rowRole")}
                    value={formatRole(setupStatus?.ground_role)}
                  />
                ) : null}
                <StatRow label={tOverview("rowUplinkActive")} value={status.uplink_active ?? EMPTY} />
                <StatRow label={tOverview("rowLinkRssi")} value={formatRssi(linkHealth.rssi_dbm)} />
                <StatRow label={tOverview("rowBitrate")} value={formatBitrate(linkHealth.bitrate_mbps)} />
                <StatRow label={tOverview("rowChannel")} value={formatChannel(linkHealth.channel)} />
                <StatRow label={tOverview("rowFecRecovered")} value={String(linkHealth.fec_rec)} />
                <StatRow label={tOverview("rowFecLost")} value={String(linkHealth.fec_lost)} />
              </dl>
            ) : null}
          </section>

          <PairModal open={pairOpen} onClose={() => setPairOpen(false)} />
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border-default py-1.5">
      <dt className="text-xs uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd className="font-mono text-sm text-text-primary">{value}</dd>
    </div>
  );
}
