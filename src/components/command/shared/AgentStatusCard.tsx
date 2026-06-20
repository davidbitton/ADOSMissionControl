"use client";

import { useTranslations } from "next-intl";
import {
  Cpu,
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";
import type { AgentStatus } from "@/lib/agent/types";
import type { AgentCapabilities } from "@/lib/agent/feature-types";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useFreshness } from "@/lib/agent/freshness";
import { deriveMavlinkLink, heartbeatAgeLabel } from "@/lib/agent/mavlink-link";

type RadioStackState = NonNullable<AgentCapabilities["radioStackState"]>;

// Whether a given radio-stack state is a degraded reading worth a
// diagnostic line. "ok" and "unpaired" are healthy-stack states (an
// unpaired drone is normal and already shown by the pairing surface),
// so only the broken-install states surface a warning here.
const RADIO_STACK_DEGRADED: ReadonlySet<RadioStackState> = new Set([
  "no_injection",
  "no_bind_artifacts",
  "stack_incomplete",
]);

interface AgentStatusCardProps {
  status: AgentStatus;
}

export function AgentStatusCard({ status }: AgentStatusCardProps) {
  const t = useTranslations("agent");
  // Read dynamic values directly from system store — the status prop may be stale
  // due to cross-store Zustand update batching issues
  const resources = useAgentSystemStore((s) => s.resources);
  const services = useAgentSystemStore((s) => s.services);
  const cpuHistory = useAgentSystemStore((s) => s.cpuHistory);
  const radioStackState = useAgentCapabilitiesStore((s) => s.radioStackState);
  // Control-plane RTT to the agent (LAN-direct poll). Null in cloud-relay mode
  // or before the first measurement.
  const controlRttMs = useAgentConnectionStore((s) => s.controlRttMs);
  const freshness = useFreshness();
  const isStale = freshness.state !== "live" && freshness.state !== "unknown";
  const cpuPct = resources?.cpu_percent ?? status.health?.cpu_percent ?? 0;
  const memPct = resources?.memory_percent ?? status.health?.memory_percent ?? 0;
  const diskPct = resources?.disk_percent ?? status.health?.disk_percent ?? 0;
  const temp = resources?.temperature ?? status.health?.temperature ?? null;
  // FC link: derive the GATED truth from the agent's transport_open /
  // mavlink_alive / heartbeat_age_s fields (newer agents). A bare fc_connected
  // only means "transport open" — a port can be open with zero MAVLink flowing,
  // which historically rendered a false "FC Connected". The three states read
  // distinctly: alive (real link), silent ("Port open · no MAVLink", amber),
  // down (red). Older agents fall back to fc_connected (alive/down only).
  const link = deriveMavlinkLink(status);
  const fcConnected = link.state === "alive";
  const fcSilent = link.state === "silent";
  // Uptime: estimate from cpuHistory length (each entry ~5s) if status.uptime_seconds is 0
  const uptimeSeconds = status.uptime_seconds || (cpuHistory.length * 5);
  // Surface a radio-stack diagnostic only when the agent reports a
  // degraded install (no injection-capable adapter, missing bind
  // artifacts, incomplete stack). "ok" / "unpaired" / undefined stay
  // silent so this reads distinctly from a plain "not paired".
  const radioStackDegraded =
    radioStackState !== undefined &&
    RADIO_STACK_DEGRADED.has(radioStackState as RadioStackState);
  return (
    <div
      className={cn(
        "border border-border-default rounded-lg p-4 space-y-3 transition-opacity",
        isStale && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">{t("status")}</h3>
        <span className="text-xs font-mono text-text-tertiary">
          v{status.version}
        </span>
      </div>

      {isStale && (
        <div
          className={cn(
            "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded",
            freshness.state === "offline"
              ? "bg-status-error/10 text-status-error"
              : "bg-status-warning/10 text-status-warning"
          )}
        >
          <AlertTriangle size={12} />
          <span>
            {freshness.state === "offline" ? "Agent offline" : "Stale data"} ·
            last update {freshness.label}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <InfoRow icon={Cpu} label={t("board")} value={status.board?.name ?? t("unknown")} />
        <InfoRow label={t("tier")} value={String(status.board?.tier ?? "?")} />
        <InfoRow
          icon={Clock}
          label={t("uptime")}
          value={formatDuration(uptimeSeconds)}
        />
        <InfoRow label={t("arch")} value={status.board?.arch ?? t("unknown")} />
        <InfoRow label={t("version")} value={`v${status.version}`} />
        <InfoRow label={t("soc")} value={status.board?.soc ?? t("unknown")} />
      </div>

      {/* Health stats */}
      <div className="flex items-center gap-4 text-xs text-text-secondary border-t border-border-default pt-2">
        <span>CPU {cpuPct.toFixed(0)}%</span>
        <span>MEM {memPct.toFixed(0)}%</span>
        <span>DISK {diskPct.toFixed(0)}%</span>
        {temp != null && (
          <span>{temp.toFixed(0)}°C</span>
        )}
        {/* Control-plane RTT to the agent — the "diagnose output ping"
            surface. Colored by latency band so a slow link is obvious. */}
        {controlRttMs != null && (
          <span
            className={cn(
              "ml-auto font-mono",
              controlRttMs < 80
                ? "text-status-success"
                : controlRttMs < 250
                  ? "text-status-warning"
                  : "text-status-error",
            )}
            title="Control-plane round-trip time to the agent"
          >
            {controlRttMs} ms
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-border-default">
        <div className="flex items-center gap-1.5">
          {fcConnected ? (
            <Wifi
              size={12}
              className={isStale ? "text-status-warning" : "text-status-success"}
            />
          ) : fcSilent ? (
            <AlertTriangle size={12} className="text-status-warning" />
          ) : (
            <WifiOff size={12} className="text-status-error" />
          )}
          <span
            className={cn(
              "text-xs",
              fcConnected
                ? isStale
                  ? "text-status-warning"
                  : "text-status-success"
                : fcSilent
                  ? "text-status-warning"
                  : "text-status-error"
            )}
          >
            {fcConnected
              ? t("fcConnected")
              : fcSilent
                ? "Port open · no MAVLink"
                : t("fcDisconnected")}
            {isStale && fcConnected && (
              <span className="text-text-tertiary"> (unverified)</span>
            )}
          </span>
        </div>
        {/* Heartbeat age — the real liveness proof. Shown whenever the agent
            ships the gated truth, so a silent port reads "no heartbeat" and a
            live link reads "MAVLink 1.2s ago" instead of a bare badge. */}
        {link.hasGatedTruth && (
          <span
            className={cn(
              "text-xs",
              link.mavlinkAlive ? "text-text-tertiary" : "text-status-warning",
            )}
            title="Time since the last decoded MAVLink HEARTBEAT"
          >
            {link.mavlinkAlive
              ? `MAVLink ${heartbeatAgeLabel(link.heartbeatAgeS)}`
              : "MAVLink: no heartbeat"}
          </span>
        )}
        {link.transportOpen && status.fc_port && (
          <span className="text-xs text-text-tertiary">
            {status.fc_port} @ {status.fc_baud}
          </span>
        )}
      </div>

      {radioStackDegraded && (
        <div
          className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-status-error/10 text-status-error"
          title={t("radioStack.hint")}
        >
          <Radio size={12} />
          <span>
            {t("radioStack.label")}:{" "}
            {t(`radioStack.state.${radioStackState as RadioStackState}`)}
          </span>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={12} className="text-text-tertiary" />}
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className="text-xs text-text-primary font-mono ml-auto">
        {value}
      </span>
    </div>
  );
}
