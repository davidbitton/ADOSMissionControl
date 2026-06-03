"use client";

/**
 * @module command/system/RadioNetworkHealthPanel
 * @description Curated per-drone radio + onboard-network health surface for
 * field RCA. Live indicators (regulatory domain + pin, channel + lock,
 * onboard-WiFi health, RF-unverified flag, adapter health, radio-stack
 * state) come from the heartbeat-backed agent-capabilities store; a compact
 * recent-activity feed of the radio/network events (reg re-asserts, bind
 * failures, RF-unverified entry/clear, WiFi self-heals) comes from the
 * durable on-device store via `client.logging`. Degrades gracefully: an
 * older agent or cloud mode shows the live indicators with an empty,
 * muted-note feed instead of crashing.
 * @license GPL-3.0-only
 */

import { useEffect } from "react";
import { Radio, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { useRadioNetworkHealthStore } from "@/stores/radio-network-health-store";
import type { RadioEventSeverity } from "@/lib/agent/radio-network-events";
import { formatLogTime } from "../shared/LogViewer";

const SEVERITY_DOT: Record<RadioEventSeverity, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
};

const SEVERITY_TEXT: Record<RadioEventSeverity, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  error: "text-status-error",
};

const STACK_LABEL: Record<string, string> = {
  ok: "OK",
  no_injection: "No injection",
  unpaired: "Unpaired",
  no_bind_artifacts: "No bind artifacts",
  stack_incomplete: "Stack incomplete",
};

/** One live indicator pill: a label, a value, and a status color. */
function Indicator({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "error" | "muted";
}) {
  const valueClass =
    tone === "muted"
      ? "text-text-secondary"
      : tone === "success"
        ? "text-status-success"
        : tone === "warning"
          ? "text-status-warning"
          : "text-status-error";
  return (
    <div className="rounded border border-border-default/60 bg-bg-tertiary/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-sm", valueClass)}>{value}</div>
    </div>
  );
}

export function RadioNetworkHealthPanel() {
  const radio = useAgentCapabilitiesStore((s) => s.radio);
  const radioStackState = useAgentCapabilitiesStore((s) => s.radioStackState);
  const macStability = useAgentCapabilitiesStore((s) => s.macStability);

  const recentEvents = useRadioNetworkHealthStore((s) => s.recentEvents);
  const wifiReassocRecent = useRadioNetworkHealthStore(
    (s) => s.wifiReassocRecent,
  );
  const available = useRadioNetworkHealthStore((s) => s.available);
  const loading = useRadioNetworkHealthStore((s) => s.loading);
  const refresh = useRadioNetworkHealthStore((s) => s.refresh);
  const clear = useRadioNetworkHealthStore((s) => s.clear);

  // Load on mount; clear on unmount so a freshly-focused drone never shows
  // the previous one's activity feed.
  useEffect(() => {
    void refresh();
    return () => clear();
  }, [refresh, clear]);

  // Omit the whole panel when the agent advertises no radio surface at all
  // (a compute node, or a drone with no air-side adapter). Nothing useful
  // to show; the radio-aware panels above already cover the rest.
  const hasRadioSurface =
    radio !== null || radioStackState !== undefined;
  if (!hasRadioSurface) return null;

  // ── Live indicators ──────────────────────────────────────────────────

  // Operating region + whether the link is pinned to its home channel.
  // The agent ships UNRESTRICTED out of the box (no region pinned); pinning
  // a region restores the strict regulatory gate. Prefer the explicit
  // posture fields, falling back to the legacy regDomain so an older agent
  // (regDomain only) still renders the right state.
  const regDomain = radio?.regDomain ?? null;
  const pinnedRegion = radio?.pinnedRegion ?? regDomain;
  const regUnrestricted =
    radio?.regPosture === "unrestricted" ||
    (radio?.regPosture == null && !pinnedRegion);
  const homeChannel = radio?.homeChannel ?? null;
  const channel = radio?.channel ?? null;
  const pinned =
    homeChannel != null && channel != null && homeChannel === channel;
  const regValue = regUnrestricted
    ? "Unrestricted"
    : pinned
      ? `${pinnedRegion} (pinned)`
      : (pinnedRegion ?? "Unrestricted");

  // Channel + lock state.
  const freq = radio?.freqMhz ?? null;
  const acquire = radio?.acquireState ?? null;
  const channelLocked = radio?.channelLocked ?? null;
  const channelLabel =
    channel != null
      ? `Ch ${channel}${freq != null ? ` (${freq} MHz)` : ""}`
      : "n/a";
  const locked = channelLocked === true || acquire === "locked";
  const searching = acquire === "searching";
  const channelValue = `${channelLabel} / ${
    locked ? "Lock OK" : searching ? "Searching" : "No lock"
  }`;
  const channelTone: "success" | "warning" | "muted" = locked
    ? "success"
    : searching
      ? "warning"
      : "muted";

  // RF-unverified: TX advancing but no received-side signal. Derive from
  // the live heartbeat (txActive true, no acquire lock) and reinforce from
  // the most recent rf_unverified event in the feed.
  const txActive = radio?.txActive === true;
  const liveUnverified = txActive && acquire !== "locked" && channelLocked !== true;
  const lastRfEvent = recentEvents.find((e) => e.kind === "radio.rf_unverified");
  const eventUnverified =
    lastRfEvent != null && lastRfEvent.severity === "error";
  const rfUnverified = liveUnverified || eventUnverified;

  // PHY muted: the adapter is at the muted txpower floor, injecting frames
  // yet radiating nothing. The agent advances tx_bytes so the link reads
  // alive while no RF leaves the antenna. Surface it as its own loud pill.
  const phyMuted = radio?.phyMuted === true;

  // Onboard-WiFi self-heal recency is derived in the store (it reads the
  // freshness clock there, keeping this render body pure).

  // Adapter health from the MAC-stability surface + radio-stack state.
  const chipset = radio?.adapterChipset ?? null;
  const injectionOk = radio?.adapterInjectionOk;
  const pinnedAdapter = macStability?.adapters?.find(
    (a) => a.state === "pinned",
  );
  const adapterValue = chipset
    ? injectionOk === false
      ? `${chipset} (no injection)`
      : pinnedAdapter
        ? `${chipset} (MAC pinned)`
        : chipset
    : injectionOk === false
      ? "No injection adapter"
      : "n/a";
  const adapterTone: "success" | "error" | "muted" =
    injectionOk === false ? "error" : chipset ? "success" : "muted";

  const stackValue =
    radioStackState != null
      ? (STACK_LABEL[radioStackState] ?? radioStackState)
      : "n/a";
  const stackTone: "success" | "warning" =
    radioStackState === "ok" ? "success" : "warning";

  return (
    <section className="rounded border border-border-default bg-bg-secondary p-5">
      <div className="mb-3 flex items-center gap-2">
        <Radio size={16} className="text-accent-primary" />
        <h2 className="text-lg font-medium text-text-primary">
          Radio / Network health
        </h2>
        <div className="flex-1" />
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-text-primary cursor-pointer"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : undefined} />
          Refresh
        </button>
      </div>

      {/* Live indicators */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Indicator
          label="Operating region"
          value={regValue}
          tone={regUnrestricted ? "warning" : "success"}
        />
        <Indicator label="Channel / lock" value={channelValue} tone={channelTone} />
        <Indicator
          label="Onboard WiFi"
          value={wifiReassocRecent ? "Re-associating" : "Stable"}
          tone={wifiReassocRecent ? "warning" : "success"}
        />
        <Indicator
          label="RF link"
          value={rfUnverified ? "Unverified" : txActive ? "TX + reception" : "Idle"}
          tone={rfUnverified ? "error" : txActive ? "success" : "muted"}
        />
        <Indicator
          label="PHY status"
          value={
            phyMuted ? "Muted (no RF)" : txActive ? "Transmitting" : "Idle"
          }
          tone={phyMuted ? "error" : txActive ? "success" : "muted"}
        />
        <Indicator label="Adapter" value={adapterValue} tone={adapterTone} />
        <Indicator label="Radio stack" value={stackValue} tone={stackTone} />
      </div>

      {/* Recent activity */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="text-xs font-medium text-text-primary">
            Recent activity
          </span>
          <span className="font-mono text-[10px] text-text-tertiary">
            {recentEvents.length} {recentEvents.length === 1 ? "event" : "events"}
          </span>
        </div>
        <div className="max-h-[200px] overflow-y-auto rounded border border-border-default/60">
          {recentEvents.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-tertiary">
              {available
                ? "No recent radio or network events."
                : "Activity history unavailable (agent may not support the durable log store)."}
            </p>
          ) : (
            recentEvents.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary/40"
              >
                <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
                  {formatLogTime(e.ts)}
                </span>
                <span
                  className={cn(
                    "shrink-0 h-1.5 w-1.5 rounded-full",
                    SEVERITY_DOT[e.severity],
                  )}
                />
                <span className={cn("flex-1 text-xs", SEVERITY_TEXT[e.severity])}>
                  {e.summary}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
