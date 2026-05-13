"use client";

/**
 * @module ProbeResultCard
 * @description Confirmation card shown after a successful agent
 * probe. Renders the agent identity (device id, name, board,
 * profile, role) plus a Pair locally button. On pair, the local
 * nodes store is updated and the parent dismisses the flow.
 * @license GPL-3.0-only
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Radio, X } from "lucide-react";
import {
  pairLocally,
  AgentAlreadyPairedError,
  type ProbeResult,
} from "@/lib/agent/local-pair-client";
import { useLocalNodesStore } from "@/stores/local-nodes-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";

interface ProbeResultCardProps {
  probe: ProbeResult;
  onPaired: (deviceId: string) => void;
  onCancel: () => void;
}

function profileLabel(profile: string): string {
  switch (profile) {
    case "ground-station":
      return "Ground station";
    case "compute":
      return "Compute";
    case "lite":
      return "Drone (lite)";
    default:
      return "Drone";
  }
}

export function ProbeResultCard({ probe, onPaired, onCancel }: ProbeResultCardProps) {
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addNode = useLocalNodesStore((s) => s.addNode);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function handlePair() {
    if (pairing) return;
    setPairing(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const claim = await pairLocally(probe.hostname, ctrl.signal);
      if (!mountedRef.current) return;
      addNode({
        deviceId: claim.deviceId,
        name: claim.name,
        hostname: probe.hostname,
        apiKey: claim.apiKey,
        profile: probe.profile,
        role: probe.role ?? null,
        board: probe.board,
        version: probe.version,
        mdnsHost: claim.mdnsHost,
        pairedAt: Date.now(),
        lastSeenAt: Date.now(),
      });
      // Activate this node immediately. Await so connect failures
      // surface here instead of behind onPaired().
      try {
        await useAgentConnectionStore
          .getState()
          .connect(probe.hostname, claim.apiKey);
      } catch (connectErr) {
        if (!mountedRef.current) return;
        const msg =
          connectErr instanceof Error ? connectErr.message : String(connectErr);
        setError(
          `Paired, but could not establish a live connection: ${msg}. The node is saved — retry from the sidebar.`,
        );
        return;
      }
      if (!mountedRef.current) return;
      onPaired(claim.deviceId);
    } catch (e) {
      if (!mountedRef.current) return;
      if (e instanceof AgentAlreadyPairedError) {
        setError(
          "This agent is already paired to another browser. Unpair from the agent's setup page, then try again.",
        );
      } else if (e instanceof DOMException && e.name === "AbortError") {
        // Component unmounted or user navigated away. No-op.
        return;
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (mountedRef.current) setPairing(false);
    }
  }

  return (
    <div className="p-5 bg-bg-secondary border border-border-default rounded-lg space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-status-success/10 flex items-center justify-center shrink-0">
          <Radio size={18} className="text-status-success" />
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-text-primary">{probe.name}</p>
            <p className="text-xs text-text-tertiary font-mono">
              {probe.deviceId}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary font-medium">
              {profileLabel(probe.profile)}
            </span>
            {probe.role && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono lowercase">
                {probe.role}
              </span>
            )}
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary">
              {probe.board}
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary font-mono">
              v{probe.version}
            </span>
          </div>
          <p className="text-xs text-text-tertiary">
            {probe.hostname}
          </p>
        </div>
      </div>

      {probe.paired && (
        <div className="flex items-start gap-2 p-2 bg-status-warning/10 border border-status-warning/30 rounded text-xs text-status-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            This agent is already paired. Pair locally to attempt to take
            ownership — the agent will respond with a clear error if it can&apos;t.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-2 bg-status-error/10 border border-status-error/30 rounded text-xs text-status-error">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handlePair}
          disabled={pairing}
          className="flex-1 px-4 py-2 text-xs font-medium bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {pairing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Pairing
            </>
          ) : (
            <>
              <Check size={14} />
              Pair locally
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={pairing}
          className="px-3 py-2 text-xs font-medium bg-bg-tertiary border border-border-default text-text-secondary rounded hover:bg-bg-primary transition-colors disabled:opacity-50 inline-flex items-center gap-1"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
