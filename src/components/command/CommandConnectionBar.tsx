"use client";

/**
 * @module command/CommandConnectionBar
 * @description Top connection bar for the Command page. Renders one of
 * five branches depending on whether the operator is on the fleet
 * overview, in demo mode with a live agent, on a real connected agent
 * (live / stale / offline header states), or has no agent selected.
 * @license GPL-3.0-only
 */

import {
  ChevronDown,
  ChevronRight,
  Cloud,
  LayoutGrid,
  Plug,
  Unplug,
} from "lucide-react";
import type { useTranslations } from "next-intl";
import type { AgentStatus } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

type HeaderState = "live" | "stale" | "offline";

export interface CommandConnectionBarProps {
  t: ReturnType<typeof useTranslations>;
  showingFleet: boolean;
  pairedCount: number;
  localNodeCount: number;
  demo: boolean;
  connected: boolean;
  status: AgentStatus | null;
  cloudMode: boolean;
  cloudDeviceId: string | null;
  headerState: HeaderState;
  freshnessLabel: string;
  connectionError: string | null;
  urlInput: string;
  onUrlInputChange: (value: string) => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onConnectCloud: (deviceId: string) => void;
  onOpenPairing: () => void;
}

export function CommandConnectionBar(props: CommandConnectionBarProps) {
  const {
    t,
    showingFleet,
    pairedCount,
    localNodeCount,
    demo,
    connected,
    status,
    cloudMode,
    cloudDeviceId,
    headerState,
    freshnessLabel,
    connectionError,
    urlInput,
    onUrlInputChange,
    advancedOpen,
    onToggleAdvanced,
    onConnect,
    onDisconnect,
    onConnectCloud,
    onOpenPairing,
  } = props;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") onConnect();
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border-default bg-bg-secondary">
      {showingFleet ? (
        <>
          <div className="flex items-center gap-2">
            <LayoutGrid size={13} className="text-accent-primary" />
            <span className="text-xs font-medium text-text-primary">
              {t("allAgents")}
            </span>
            <span className="text-xs text-text-tertiary">
              {t("pairedCount", { count: pairedCount })}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onOpenPairing}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-accent-primary hover:bg-bg-tertiary rounded transition-colors"
            >
              <Plug size={12} />
              {t("pairNode")}
            </button>
          </div>
        </>
      ) : demo && connected && status ? (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-status-success" />
          <span className="text-xs text-text-primary font-medium">
            {t("demoAgent")}
          </span>
          <span className="text-xs text-text-tertiary">
            v{status.version}
          </span>
          <span className="text-xs text-text-tertiary">
            {t("tier", { tier: status.board?.tier })}
          </span>
          <span className="text-xs text-text-tertiary">{status.board?.name}</span>
          {cloudMode && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-accent-primary/15 text-accent-primary rounded font-medium">
              <Cloud size={10} />
              {t("cloud")}
            </span>
          )}
        </div>
      ) : status ? (
        <>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                headerState === "live" && "bg-status-success",
                headerState === "stale" && "bg-status-warning animate-pulse",
                headerState === "offline" && "bg-status-error",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium",
                headerState === "offline" ? "text-text-tertiary" : "text-text-primary",
              )}
            >
              {status.board?.name ?? t("agent")}
            </span>
            <span className="text-xs text-text-tertiary">
              v{status.version}
            </span>
            <span className="text-xs text-text-tertiary">
              {t("tier", { tier: status.board?.tier })}
            </span>
            {cloudMode && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-accent-primary/15 text-accent-primary rounded font-medium">
                <Cloud size={10} />
                {t("cloudBadge")}
              </span>
            )}
            {headerState === "stale" && (
              <span className="text-[10px] px-1.5 py-0.5 bg-status-warning/15 text-status-warning rounded font-medium uppercase tracking-wide">
                {t("staleLastSeen", { label: freshnessLabel })}
              </span>
            )}
            {headerState === "offline" && (
              <span className="text-[10px] px-1.5 py-0.5 bg-status-error/15 text-status-error rounded font-medium uppercase tracking-wide">
                {t("offlineLastSeen", { label: freshnessLabel })}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {headerState === "offline" && cloudMode && cloudDeviceId && (
              <button
                onClick={() => onConnectCloud(cloudDeviceId)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-accent-primary hover:bg-bg-tertiary rounded transition-colors"
                title={t("reconnectTooltip")}
              >
                <Plug size={12} />
                {t("reconnectButton")}
              </button>
            )}
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-status-error hover:bg-bg-tertiary rounded transition-colors"
            >
              <Unplug size={12} />
              {t("disconnect")}
            </button>
          </div>
        </>
      ) : (
        <>
          {pairedCount + localNodeCount > 0 ? (
            <span className="text-xs text-text-secondary">
              {t("selectNode")}
            </span>
          ) : (
            <span className="text-xs text-text-secondary">
              {t("pairToStart")}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onToggleAdvanced}
              className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {t("advanced")}
              {advancedOpen ? (
                <ChevronDown size={10} />
              ) : (
                <ChevronRight size={10} />
              )}
            </button>
            {advancedOpen && (
              <>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => onUrlInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="http://localhost:8080"
                  className="w-56 px-2.5 py-1 text-xs bg-bg-tertiary border border-border-default rounded text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent-primary"
                />
                <button
                  onClick={onConnect}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs bg-accent-primary text-white rounded hover:opacity-90 transition-opacity"
                >
                  <Plug size={12} />
                  {t("connect")}
                </button>
              </>
            )}
            {connectionError && (
              <span className="text-xs text-status-error">
                {connectionError}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
