"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { AgentClient } from "@/lib/agent/client";
import {
  ChannelHistoryChart,
  type HoppingState,
} from "@/components/hardware/ChannelHistoryChart";

type VideoConfigRadio = {
  channel: number | null;
  band: string | null;
  mcs_index: number | null;
  fec_k: number | null;
  fec_n: number | null;
  tx_power_dbm: number | null;
  preset: string | null;
};

type VideoConfigEncoder = {
  bitrate_kbps: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
};

type AdaptiveTier = {
  idx: number;
  name: string;
  bitrate_kbps: number;
  fec_k: number;
  fec_n: number;
};

type VideoConfigAdaptive = {
  available: boolean;
  enabled?: boolean;
  auto?: boolean;
  tier_idx?: number;
  tier_name?: string;
  bitrate_kbps?: number;
  fec_k?: number;
  fec_n?: number;
  bad_streak?: number;
  clean_streak?: number;
  last_action_reason?: string;
  tiers?: AdaptiveTier[];
};

type VideoConfig = {
  radio: VideoConfigRadio;
  encoder: VideoConfigEncoder;
  adaptive: VideoConfigAdaptive;
  hopping?: HoppingState;
  warnings?: string[];
};

type VideoLatency = {
  latency_ms: number | null;
  ewma_ms?: number | null;
  pipeline_latency_ms?: number | null;
  samples?: number | null;
  source?: string;
};

const _POLL_INTERVAL_MS = 1000;

/**
 * Live operator surface for the closed-loop video bitrate / FEC
 * controller. Polls /api/video/config + /api/video/latency at 1 Hz
 * and surfaces the controller's tier ladder, the current radio
 * config, and the SEI-probe glass-to-glass latency. Manual override
 * controls let an operator pin a specific tier or toggle the
 * controller into manual mode.
 *
 * Renders nothing when the agent doesn't expose /api/video/config
 * (older agent build) — fail-quiet so the Hardware tab still loads
 * on older firmware.
 */
export function VideoLinkPanel() {
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);

  const [config, setConfig] = useState<VideoConfig | null>(null);
  const [latency, setLatency] = useState<VideoLatency | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    if (!agentUrl) return null;
    return new AgentClient(agentUrl, apiKey);
  }, [agentUrl, apiKey]);

  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const [cfg, lat] = await Promise.all([
        client.getVideoConfig() as Promise<VideoConfig | null>,
        client.getVideoLatency() as Promise<VideoLatency | null>,
      ]);
      if (cfg) setConfig(cfg);
      if (lat) setLatency(lat);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    void refresh();
    pollRef.current = window.setInterval(() => {
      void refresh();
    }, _POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [client, refresh]);

  const onSetAuto = useCallback(
    async (next: boolean) => {
      if (!client) return;
      setBusy(true);
      try {
        await client.setVideoConfig({ auto: next });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [client, refresh],
  );

  const onPinTier = useCallback(
    async (idx: number) => {
      if (!client) return;
      setBusy(true);
      try {
        await client.setVideoConfig({ tier_idx: idx });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [client, refresh],
  );

  if (!client || !config) {
    return null;
  }

  const { radio, encoder, adaptive } = config;
  const tiers = adaptive.tiers ?? [];
  const activeTierIdx = adaptive.tier_idx ?? -1;
  const auto = adaptive.auto ?? true;

  return (
    <>
    <section className="rounded border border-border-default bg-surface-primary">
      <header className="flex items-center justify-between border-b border-border-default px-3 py-2">
        <div className="text-xs font-mono uppercase tracking-widest text-text-primary">
          Video Link
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-text-tertiary">
          {adaptive.available
            ? auto
              ? "Adaptive"
              : "Manual"
            : "Static"}
        </div>
      </header>
      <div className="grid grid-cols-2 gap-2 p-3 text-[11px] font-mono">
        <ReadoutRow
          label="Latency"
          value={
            latency?.latency_ms != null
              ? `${Math.round(latency.latency_ms)} ms`
              : "—"
          }
          hint={
            latency?.ewma_ms != null
              ? `ewma ${Math.round(latency.ewma_ms)} ms`
              : undefined
          }
        />
        <ReadoutRow
          label="Encoder"
          value={
            encoder.bitrate_kbps != null
              ? `${encoder.bitrate_kbps} kbps`
              : "—"
          }
          hint={
            encoder.codec
              ? `${encoder.codec.toUpperCase()} ${encoder.width ?? "?"}x${
                  encoder.height ?? "?"
                }@${encoder.fps ?? "?"}`
              : undefined
          }
        />
        <ReadoutRow
          label="Radio FEC"
          value={
            radio.fec_k != null && radio.fec_n != null
              ? `${radio.fec_k}/${radio.fec_n}`
              : "—"
          }
          hint={
            radio.mcs_index != null ? `MCS ${radio.mcs_index}` : undefined
          }
        />
        <ReadoutRow
          label="Channel"
          value={radio.channel != null ? String(radio.channel) : "—"}
          hint={radio.tx_power_dbm != null ? `${radio.tx_power_dbm} dBm` : undefined}
        />
      </div>

      {adaptive.available && tiers.length > 0 ? (
        <div className="border-t border-border-default px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-text-tertiary">
              Tier ladder
            </span>
            <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-text-primary">
              <input
                type="checkbox"
                checked={auto}
                disabled={busy}
                onChange={(e) => onSetAuto(e.target.checked)}
              />
              auto
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            {tiers.map((tier) => {
              const active = tier.idx === activeTierIdx;
              return (
                <button
                  key={tier.idx}
                  type="button"
                  disabled={busy}
                  onClick={() => onPinTier(tier.idx)}
                  className={`px-2 py-1 text-[10px] font-mono uppercase tracking-widest rounded border transition-colors ${
                    active
                      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                      : "border-border-default text-text-secondary hover:border-accent-primary/50"
                  }`}
                  title={`${tier.bitrate_kbps} kbps · FEC ${tier.fec_k}/${tier.fec_n}`}
                >
                  {tier.name}
                </button>
              );
            })}
          </div>
          {adaptive.last_action_reason ? (
            <div className="mt-2 text-[10px] font-mono text-text-tertiary">
              last: {adaptive.last_action_reason}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="border-t border-border-default px-3 py-2 text-[10px] font-mono text-status-error">
          {error}
        </div>
      ) : null}
    </section>
    <ChannelHistoryChart
      hopping={config.hopping}
      currentChannel={radio.channel}
    />
    </>
  );
}

function ReadoutRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-text-tertiary">
        {label}
      </span>
      <span className="text-text-primary">{value}</span>
      {hint ? <span className="text-text-tertiary">{hint}</span> : null}
    </div>
  );
}
