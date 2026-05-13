"use client";

/**
 * @module AddNodeCard
 * @description Local-first entry point for adding any ADOS node
 * (drone agent, ground station, future compute) to the GCS.
 * Replaces the previous sign-in-gated pairing card. Three branches:
 *
 *  1. Paste hostname / URL → probe → confirm → pair locally.
 *  2. Install agent (copy the install one-liner).
 *  3. Sign in for cloud / remote access (opt-in, never blocking).
 * @license GPL-3.0-only
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ChevronRight,
  CloudOff,
  Copy,
  Check,
  Loader2,
  Plus,
  Radio,
  Search,
  X,
} from "lucide-react";
import {
  probeAgent,
  PairClientError,
  type ProbeResult,
} from "@/lib/agent/local-pair-client";
import { useBrowserIdentityStore } from "@/stores/browser-identity-store";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { usePairingStore } from "@/stores/pairing-store";
import { useDiscoveredAgents } from "@/hooks/use-discovered-agents";
import { DiscoveredAgentsList } from "./DiscoveredAgentsList";
import { ProbeResultCard } from "./ProbeResultCard";

const INSTALL_URL =
  "https://raw.githubusercontent.com/altnautica/ADOSDroneAgent/main/scripts/install.sh";
const INSTALL_COMMAND = `curl -sSL ${INSTALL_URL} | sudo bash`;

interface AddNodeCardProps {
  /** Whether to show the sign-in branch (cloud features available). */
  cloudAvailable: boolean;
  /** Opens the cloud sign-in modal. */
  onSignIn: () => void;
  /** Fired after a successful local pair. Parent can navigate. */
  onPaired?: (deviceId: string) => void;
}

export function AddNodeCard({
  cloudAvailable,
  onSignIn,
  onPaired,
}: AddNodeCardProps) {
  const t = useTranslations("command.addNode");
  const [host, setHost] = useState("");
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeErrorCode, setProbeErrorCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Tauri path only — populates pairing-store.discoveredAgents on a
  // 5s poll. Inside the browser GCS the hook returns immediately.
  useDiscoveredAgents();
  const discoveredAgents = usePairingStore((s) => s.discoveredAgents);

  async function handleProbeHost(rawHost: string) {
    setProbeError(null);
    setProbeErrorCode(null);
    setProbe(null);
    setProbing(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await probeAgent(rawHost, ctrl.signal);
      setProbe(result);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      let msg: string;
      if (e instanceof PairClientError) {
        // Map the pair-client's structured error code to its
        // translated message. Falls back to the dev-readable
        // message on a key miss. `e.details` is already filtered
        // to string | number values at PairClientError construction.
        try {
          msg = t(e.code, e.details);
        } catch {
          msg = e.message;
        }
        setProbeErrorCode(e.code);
      } else if (e instanceof Error) {
        msg = e.message;
      } else {
        msg = t("probeFailedError");
      }
      setProbeError(msg);
    } finally {
      if (!ctrl.signal.aborted) setProbing(false);
    }
  }

  function handleScrollToCodeCard() {
    const el = document.getElementById("claim-pairing-code-card");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = el.querySelector<HTMLInputElement>('input[type="text"]');
    if (input) {
      // Defer focus so the smooth-scroll lands first; otherwise
      // some browsers cancel the scroll on focus.
      setTimeout(() => input.focus(), 250);
    }
  }

  async function handleProbe() {
    if (!host.trim() || probing) return;
    await handleProbeHost(host);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleProbe();
    }
  }

  function handleDiscoveredSelect(agent: { mdnsHost?: string; localIp?: string; name: string }) {
    // Prefer the mDNS hostname (more portable than IPs that change
    // on DHCP). The agent listens on 8080 by default; normaliseHost
    // will fill that in.
    const target = agent.mdnsHost || agent.localIp;
    if (!target) return;
    setHost(target);
    void handleProbeHost(target);
  }

  async function handleCopyInstall() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard rejection is non-fatal
    }
  }

  const localNodeCount = useLocalNodesStore((s) => s.nodes.length);
  const warningDismissedAt = useBrowserIdentityStore(
    (s) => s.localPairWarningDismissedAt,
  );
  const dismissWarning = useBrowserIdentityStore(
    (s) => s.dismissLocalPairWarning,
  );
  const showFirstPairWarning =
    localNodeCount === 0 && warningDismissedAt === 0;

  if (probe) {
    return (
      <ProbeResultCard
        probe={probe}
        onPaired={(deviceId) => {
          setProbe(null);
          setHost("");
          onPaired?.(deviceId);
        }}
        onCancel={() => {
          setProbe(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {showFirstPairWarning && (
        <div className="flex items-start gap-3 p-3 bg-status-warning/10 border border-status-warning/30 rounded-lg text-xs text-text-secondary">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-status-warning" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-text-primary">
              {t("firstPairWarning.title")}
            </p>
            <p className="text-text-tertiary leading-relaxed">
              {t("firstPairWarning.body")}
            </p>
          </div>
          <button
            onClick={dismissWarning}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            {t("firstPairWarning.dismiss")}
            <X size={10} />
          </button>
        </div>
      )}

      {/* Tauri mDNS auto-discovery. The list stays hidden in the
          browser GCS (the hook short-circuits in non-Tauri runtimes
          and discoveredAgents stays empty). Inside the Tauri build
          it polls every 5s and one-click pairs an agent on the LAN. */}
      {discoveredAgents.length > 0 && (
        <DiscoveredAgentsList
          agents={discoveredAgents}
          onSelect={handleDiscoveredSelect}
        />
      )}

      {/* Pair-by-link branch */}
      <div className="p-5 bg-bg-secondary border border-border-default rounded-lg space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center">
            <Radio size={14} className="text-accent-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">{t("pairOnLan")}</p>
            <p className="text-[10px] text-text-tertiary">
              {t("noAccountRequired")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t("hostnamePlaceholder")}
            disabled={probing}
            className="flex-1 px-3 py-2 bg-bg-primary border border-border-default rounded text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary disabled:opacity-50"
            autoFocus
          />
          <button
            onClick={handleProbe}
            disabled={probing || !host.trim()}
            className="px-3 py-2 text-xs font-medium bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {probing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                {t("probingButton")}
              </>
            ) : (
              <>
                <Search size={12} />
                {t("probeButton")}
              </>
            )}
          </button>
        </div>

        {probeError && (
          <div role="alert" aria-live="polite" className="space-y-2">
            <p className="text-xs text-status-error">{probeError}</p>
            {probeErrorCode === "mixedContentError" && (
              <button
                type="button"
                onClick={handleScrollToCodeCard}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:text-accent-primary/80 transition-colors"
              >
                Jump to the pair-by-code card
                <ChevronRight size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Install-a-new-agent branch */}
      <div className="p-5 bg-bg-secondary border border-border-default rounded-lg space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center">
            <Plus size={14} className="text-text-secondary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">{t("installAgent")}</p>
            <p className="text-[10px] text-text-tertiary">
              {t("installAgentDescription")}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 bg-bg-primary border border-border-default rounded">
          <code className="flex-1 text-xs font-mono text-text-secondary leading-relaxed break-all select-all">
            {INSTALL_COMMAND}
          </code>
          <button
            onClick={handleCopyInstall}
            className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors shrink-0"
            title={t("copyInstallCommand")}
          >
            {copied ? (
              <Check size={14} className="text-status-success" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Cloud sign-in branch — optional, never blocking */}
      <button
        onClick={onSignIn}
        disabled={!cloudAvailable}
        className="w-full p-4 bg-bg-secondary border border-border-default rounded-lg text-left hover:bg-bg-tertiary transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center">
            <CloudOff size={14} className="text-text-secondary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">
              {t("signInForRemote")}
            </p>
            <p className="text-[10px] text-text-tertiary">
              {t("signInDescription")}
            </p>
          </div>
          <ChevronRight
            size={14}
            className="text-text-tertiary group-hover:text-text-secondary transition-colors"
          />
        </div>
      </button>
    </div>
  );
}
