"use client";

/**
 * @module HardwarePage
 * @description Hardware tab Overview sub-view. Polls the agent at 2 Hz for
 * /api/v1/ground-station/status and mirrors the tab-visibility pause pattern
 * used by agent-connection-store.
 * @license GPL-3.0-only
 */

import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { groundStationApiFromAgent } from "@/lib/api/ground-station-api";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useGroundStationStore } from "@/stores/ground-station-store";
import { PairModal } from "@/components/hardware/PairModal";
import { PicWidget } from "@/components/hardware/PicWidget";
import { OverviewUplinkWidget } from "@/components/hardware/OverviewUplinkWidget";
import { Button } from "@/components/ui/button";
import { useGroundStationSubscriptions } from "@/hooks/use-ground-station-subscriptions";

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

function formatProfile(profile: string): string {
  if (profile === "ground_station") return "Ground Station";
  if (profile === "drone") return "Drone";
  if (profile === "auto") return "Auto";
  return "Unconfigured";
}

export default function HardwarePage() {
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);

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

  const agentUrlRef = useRef(agentUrl);
  const apiKeyRef = useRef(apiKey);
  agentUrlRef.current = agentUrl;
  apiKeyRef.current = apiKey;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const client = groundStationApiFromAgent(agentUrlRef.current, apiKeyRef.current);
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
  }, [loadStatus, setLoading, setError]);

  const hasAgent = Boolean(agentUrl);
  const hasData = lastFetchedAt != null && hasAgent;

  // No agent connected: single empty state
  if (!hasAgent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border-primary/60 bg-surface-secondary py-16 text-center">
        <Radio className="h-8 w-8 text-text-tertiary" />
        <p className="text-sm font-medium text-text-secondary">
          No ground station connected
        </p>
        <p className="max-w-sm text-xs text-text-tertiary">
          Connect to an ADOS ground station agent to manage hardware, radios,
          and peripherals.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top row: PIC + Uplink side by side */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PicWidget />
        <OverviewUplinkWidget />
      </div>

      {/* Ground Station Overview */}
      <section className="rounded-lg border border-border-primary/60 bg-surface-secondary p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary">
            Ground Station
          </h2>
          <div className="flex items-center gap-3">
            {loading ? (
              <span className="text-xs text-text-secondary">Loading...</span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPairOpen(true)}
            >
              Pair with drone
            </Button>
          </div>
        </div>

        {lastError && !hasData ? (
          <div className="rounded border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
            {lastError}
          </div>
        ) : null}

        {hasData ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <StatRow label="Paired drone" value={status.paired_drone ?? "None"} />
            <StatRow label="Profile" value={formatProfile(status.profile)} />
            <StatRow label="Uplink active" value={status.uplink_active ?? EMPTY} />
            <StatRow label="Link RSSI" value={formatRssi(linkHealth.rssi_dbm)} />
            <StatRow label="Bitrate" value={formatBitrate(linkHealth.bitrate_mbps)} />
            <StatRow label="Channel" value={formatChannel(linkHealth.channel)} />
            <StatRow label="FEC recovered" value={String(linkHealth.fec_rec)} />
            <StatRow label="FEC lost" value={String(linkHealth.fec_lost)} />
          </dl>
        ) : null}
      </section>

      <PairModal open={pairOpen} onClose={() => setPairOpen(false)} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border-primary/40 py-1.5">
      <dt className="text-xs uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd className="font-mono text-sm text-text-primary">{value}</dd>
    </div>
  );
}
