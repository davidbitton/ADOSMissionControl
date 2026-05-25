"use client";

/**
 * @module AgentFeedTile
 * @description One multi-agent Command overview tile with video and telemetry.
 * @license GPL-3.0-only
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  Battery,
  Cpu,
  Expand,
  Gauge,
  Loader2,
  MapPin,
  Pause,
  Pin,
  PinOff,
  Play,
  Radio,
  RefreshCw,
  Satellite,
  SignalHigh,
  Thermometer,
  TrendingDown,
  Video,
  VideoOff,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCommandAge,
  type CommandAgentSummary,
} from "@/hooks/use-command-agent-fleet";
import { useAgentVideoSession } from "@/hooks/use-agent-video-session";

interface AgentFeedTileProps {
  agent: CommandAgentSummary;
  pinned: boolean;
  paused: boolean;
  onOpen: (deviceId: string) => void;
  onTogglePin: (deviceId: string) => void;
  onTogglePause: (deviceId: string) => void;
}

// A tile that has been "connecting" longer than this is wedged. Force a
// fresh session attempt rather than spinning the placeholder forever.
const TILE_CONNECT_TIMEOUT_MS = 15_000;

function pct(value: number | null): string {
  return value == null ? "--" : `${Math.round(value)}%`;
}

function fixed(value: number | null, digits = 0, suffix = ""): string {
  return value == null ? "--" : `${value.toFixed(digits)}${suffix}`;
}

function livenessClass(liveness: CommandAgentSummary["liveness"]): string {
  if (liveness === "live") return "bg-status-success text-bg-primary";
  if (liveness === "stale") return "bg-status-warning text-bg-primary";
  return "bg-bg-tertiary text-text-tertiary border border-border-default";
}

export function AgentFeedTile({
  agent,
  pinned,
  paused,
  onOpen,
  onTogglePin,
  onTogglePause,
}: AgentFeedTileProps) {
  const t = useTranslations("commandFleet");
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const videoEnabled = agent.video.active && !!agent.video.whepUrl;
  const session = useAgentVideoSession({
    whepUrl: agent.video.whepUrl,
    enabled: videoEnabled,
    videoEl,
    retryKey,
  });

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);

  const hasVideo = session.state === "connected";
  const connecting = session.state === "connecting";
  const failed = session.state === "failed";

  // Connect-timeout guard. A session stuck in "connecting" past the
  // window almost certainly lost its SDP answer or stalled ICE; bump the
  // retry key to start a fresh session instead of spinning forever.
  useEffect(() => {
    if (!connecting) return;
    const handle = setTimeout(() => {
      setRetryKey((k) => k + 1);
    }, TILE_CONNECT_TIMEOUT_MS);
    return () => clearTimeout(handle);
  }, [connecting]);

  // Profile-aware surfaces. A ground station has no flight controller,
  // battery, GPS, or flight mode — it receives a downlink over the radio.
  // Swap the FC/armed badges and the top metric row for link-centric data.
  const isGround = agent.profile === "ground-station";
  const radio = agent.radio;
  const linkUp = radio?.state === "connected";
  const roleLabel =
    agent.role === "direct"
      ? t("roleDirect")
      : agent.role === "relay"
        ? t("roleRelay")
        : agent.role === "receiver"
          ? t("roleReceiver")
          : null;
  const pairedShort = radio?.pairedWithDeviceId
    ? radio.pairedWithDeviceId.slice(0, 8)
    : null;

  return (
    <article
      className={cn(
        "group overflow-hidden rounded border bg-bg-secondary transition-colors",
        agent.liveness === "live"
          ? "border-border-default hover:border-accent-primary/50"
          : "border-border-default opacity-80",
      )}
    >
      <div className="relative aspect-video bg-bg-primary">
        <video
          ref={setVideoRef}
          autoPlay
          muted
          playsInline
          className={cn(
            "absolute inset-0 h-full w-full object-cover bg-black",
            !hasVideo && "hidden",
          )}
        />

        {!hasVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-tertiary">
            {connecting ? (
              <>
                <Loader2 size={24} className="text-accent-primary animate-spin" />
                <span className="text-[10px] font-mono tracking-widest">
                  {t("connecting")}
                </span>
              </>
            ) : failed ? (
              <>
                <VideoOff size={26} className="text-status-error" />
                <span className="max-w-[80%] truncate text-[10px] font-mono text-status-error">
                  {session.error ?? t("videoFailed")}
                </span>
              </>
            ) : agent.video.queued ? (
              <>
                <Video size={26} className="text-accent-primary" />
                <span className="text-[10px] font-mono tracking-widest">
                  {t("queued")}
                </span>
              </>
            ) : paused ? (
              <>
                <Pause size={26} />
                <span className="text-[10px] font-mono tracking-widest">
                  {t("paused")}
                </span>
              </>
            ) : (
              <>
                <VideoOff size={26} />
                <span className="text-[10px] font-mono tracking-widest">
                  {agent.liveness === "offline" ? t("offline") : t("noVideo")}
                </span>
              </>
            )}
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase", livenessClass(agent.liveness))}>
            {t(agent.liveness)}
          </span>
          <span className="rounded bg-accent-primary/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
            {isGround ? t("profileGround") : t("profileDrone")}
          </span>
          {isGround ? (
            <>
              {roleLabel && (
                <span className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-text-primary">
                  {roleLabel}
                </span>
              )}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                  linkUp
                    ? "bg-status-success text-bg-primary"
                    : "bg-black/55 text-text-primary",
                )}
              >
                {linkUp ? t("linked") : t("noLink")}
              </span>
              {pairedShort && (
                <span className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-mono uppercase text-text-secondary">
                  {t("paired")} {pairedShort}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-text-primary">
                {agent.system.fcConnected ? t("fcOn") : t("fcOff")}
              </span>
              {agent.telemetry.armed != null && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                    agent.telemetry.armed
                      ? "bg-status-error text-bg-primary"
                      : "bg-black/55 text-text-primary",
                  )}
                >
                  {agent.telemetry.armed ? t("armed") : t("disarmed")}
                </span>
              )}
            </>
          )}
        </div>

        <div className="absolute right-2 top-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(agent.identity.deviceId);
            }}
            className="rounded bg-black/55 p-1 text-text-secondary hover:text-text-primary"
            title={pinned ? t("unpin") : t("pin")}
          >
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePause(agent.identity.deviceId);
            }}
            className="rounded bg-black/55 p-1 text-text-secondary hover:text-text-primary"
            title={paused ? t("resume") : t("pause")}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRetryKey((k) => k + 1);
            }}
            className="rounded bg-black/55 p-1 text-text-secondary hover:text-text-primary"
            title={t("retry")}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(agent.identity.deviceId);
            }}
            className="rounded bg-accent-primary p-1 text-white hover:opacity-90"
            title={t("open")}
          >
            <Expand size={13} />
          </button>
        </div>

        {hasVideo && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-black/60 px-2 py-1 text-[10px] font-mono text-text-secondary">
            <span>{session.stats.fps > 0 ? `${session.stats.fps} FPS` : "-- FPS"}</span>
            <span>{session.stats.bitrateKbps > 0 ? `${session.stats.bitrateKbps} kbps` : "-- kbps"}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onOpen(agent.identity.deviceId)}
        className="block w-full p-3 text-left"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {agent.identity.name}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
              {agent.identity.board ?? t("unknownBoard")}
              {agent.identity.tier ? ` · T${agent.identity.tier}` : ""}
              {agent.identity.version ? ` · v${agent.identity.version}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-[10px] text-text-tertiary">
            {formatCommandAge(agent.lastSeen)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-text-secondary sm:grid-cols-4">
          {isGround ? (
            <>
              <Metric icon={<SignalHigh size={12} />} label={t("rssi")} value={radio?.rssiDbm == null ? "--" : `${Math.round(radio.rssiDbm)} dBm`} />
              <Metric icon={<Activity size={12} />} label={t("snr")} value={radio?.snrDb == null ? "--" : `${Math.round(radio.snrDb)} dB`} />
              <Metric icon={<TrendingDown size={12} />} label={t("loss")} value={radio?.lossPercent == null ? "--" : `${radio.lossPercent.toFixed(1)}%`} />
              <Metric icon={<Wifi size={12} />} label={t("link")} value={radio?.bitrateKbps == null ? "--" : `${(radio.bitrateKbps / 1000).toFixed(1)} Mbps`} />
            </>
          ) : (
            <>
              <Metric icon={<Battery size={12} />} label={t("battery")} value={pct(agent.telemetry.batteryRemaining)} />
              <Metric icon={<Satellite size={12} />} label={t("gps")} value={agent.telemetry.gpsSatellites == null ? "--" : `${agent.telemetry.gpsSatellites}`} />
              <Metric icon={<MapPin size={12} />} label={t("alt")} value={fixed(agent.telemetry.altitudeRel, 0, "m")} />
              <Metric icon={<Gauge size={12} />} label={t("mode")} value={agent.telemetry.mode ?? "--"} />
            </>
          )}
          <Metric icon={<Cpu size={12} />} label={t("cpu")} value={pct(agent.system.cpuPercent)} />
          <Metric icon={<Radio size={12} />} label={t("mem")} value={pct(agent.system.memoryPercent)} />
          <Metric icon={<Thermometer size={12} />} label={t("temp")} value={fixed(agent.system.temperature, 0, "C")} />
          <Metric icon={<Video size={12} />} label={t("video")} value={t(agent.video.state)} />
        </div>
      </button>
    </article>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded bg-bg-primary px-2 py-1.5">
      <div className="flex items-center gap-1 text-text-tertiary">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 truncate font-mono text-text-primary">{value}</div>
    </div>
  );
}
