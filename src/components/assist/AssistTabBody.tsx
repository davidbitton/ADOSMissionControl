/**
 * @module AssistTabBody
 * @description Shared Assist component. Parametrized by agentUrl and agentProfile.
 * Mounted in Command > Assist (drone profile) and Hardware > Assist (ground_station profile).
 * @license GPL-3.0-only
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAssistStore } from "@/stores/assist-store";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle, Clock, RefreshCw, ThumbsUp, X, Wrench,
  GitPullRequest, Eye, Activity, Settings,
} from "lucide-react";

interface AssistTabBodyProps {
  agentUrl: string | null;
  apiKey: string | null;
  agentProfile?: "drone" | "ground_station";
}

type AssistPanel = "diagnostics" | "suggestions" | "repairs" | "settings";

const PANELS: { id: AssistPanel; label: string; icon: typeof Activity }[] = [
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "suggestions", label: "Suggestions", icon: AlertTriangle },
  { id: "repairs", label: "Repairs", icon: Wrench },
  { id: "settings", label: "Settings", icon: Settings },
];

interface ApiSuggestion {
  id: string;
  rule_id: string;
  summary: string;
  confidence: number;
  safety_class: string;
  acknowledged_at: number | null;
  dismissed_at: number | null;
}

interface ApiRepair {
  id: string;
  action: string;
  origin: string;
  safety_class: string;
  state: string;
  proposed_at: number;
  applied_at: number | null;
}

export function AssistTabBody({ agentUrl, apiKey, agentProfile = "drone" }: AssistTabBodyProps) {
  const [activePanel, setActivePanel] = useState<AssistPanel>("suggestions");
  const [suggestions, setSuggestions] = useState<ApiSuggestion[]>([]);
  const [repairs, setRepairs] = useState<ApiRepair[]>([]);
  const [assistStatus, setAssistStatus] = useState<{ enabled: boolean; active_suggestions: number; pending_repairs: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (apiKey) h["X-ADOS-Key"] = apiKey;
    return h;
  }, [apiKey]);

  const apiBase = agentUrl ? `${agentUrl}/api/assist` : null;

  const load = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    try {
      const [statusResp, sugResp, repResp] = await Promise.all([
        fetch(`${apiBase}/status`, { headers: authHeaders() }),
        fetch(`${apiBase}/suggestions`, { headers: authHeaders() }),
        fetch(`${apiBase}/repairs`, { headers: authHeaders() }),
      ]);
      if (statusResp.ok) setAssistStatus(await statusResp.json());
      if (sugResp.ok) setSuggestions(await sugResp.json());
      if (repResp.ok) setRepairs(await repResp.json());
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAcknowledge = async (id: string) => {
    if (!apiBase) return;
    await fetch(`${apiBase}/suggestions/${id}/acknowledge`, { method: "POST", headers: authHeaders() });
    await load();
  };

  const handleDismiss = async (id: string) => {
    if (!apiBase) return;
    await fetch(`${apiBase}/suggestions/${id}/dismiss`, { method: "POST", headers: authHeaders() });
    await load();
  };

  const handleApproveRepair = async (id: string) => {
    if (!apiBase) return;
    await fetch(`${apiBase}/repairs/${id}/approve`, { method: "POST", headers: authHeaders() });
    await load();
  };

  const handleRejectRepair = async (id: string) => {
    if (!apiBase) return;
    await fetch(`${apiBase}/repairs/${id}/reject`, { method: "POST", headers: authHeaders() });
    await load();
  };

  if (!agentUrl) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        Connect to a drone to use Assist
      </div>
    );
  }

  const serviceAvailable = assistStatus?.enabled !== false;

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border-primary bg-surface-secondary text-xs">
        <div className={cn("flex items-center gap-1.5", serviceAvailable ? "text-status-success" : "text-text-tertiary")}>
          <div className={cn("w-1.5 h-1.5 rounded-full", serviceAvailable ? "bg-status-success" : "bg-text-tertiary")} />
          {serviceAvailable ? "Assist active" : "Assist disabled"}
        </div>
        {assistStatus && serviceAvailable && (
          <>
            <span className="text-text-tertiary">
              {assistStatus.active_suggestions} suggestion{assistStatus.active_suggestions !== 1 ? "s" : ""}
            </span>
            <span className="text-text-tertiary">
              {assistStatus.pending_repairs} pending repair{assistStatus.pending_repairs !== 1 ? "s" : ""}
            </span>
          </>
        )}
        <button onClick={load} disabled={loading} className="ml-auto p-1 text-text-tertiary hover:text-text-primary">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Sub-panel selector */}
      <div className="flex items-stretch gap-0 border-b border-border-primary bg-surface-primary px-4">
        {PANELS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors -mb-px border-b-2",
              activePanel === id
                ? "text-accent-primary border-accent-primary"
                : "text-text-secondary hover:text-text-primary border-transparent"
            )}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {activePanel === "diagnostics" && (
          <div className="p-4">
            <p className="text-xs text-text-tertiary mb-3">
              Real-time event correlation from {agentProfile === "ground_station" ? "ground station" : "drone"} services.
              No LLM required — pure rule-based pattern matching.
            </p>
            <div className="text-xs text-text-secondary space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle size={12} className="text-status-success" />
                <span>10 event collectors active</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={12} className="text-status-success" />
                <span>10 rules loaded</span>
              </div>
            </div>
          </div>
        )}

        {activePanel === "suggestions" && (
          <div>
            {suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-tertiary">
                <CheckCircle size={24} className="opacity-30" />
                <p className="text-sm">No active suggestions</p>
                <p className="text-xs opacity-60">All systems nominal</p>
              </div>
            ) : (
              suggestions
                .filter((s) => !s.dismissed_at)
                .sort((a, b) => b.confidence - a.confidence)
                .map((s) => (
                  <div key={s.id} className={cn("px-4 py-3 border-b border-border-primary/30", s.acknowledged_at ? "opacity-70" : "")}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        size={12}
                        className={cn(
                          "mt-0.5 flex-shrink-0",
                          s.confidence > 0.8 ? "text-status-error" : s.confidence > 0.6 ? "text-status-warning" : "text-text-tertiary"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary">{s.summary}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
                          <span>{s.rule_id}</span>
                          <span>{(s.confidence * 100).toFixed(0)}% confidence</span>
                          <span className="bg-surface-tertiary px-1 rounded">{s.safety_class}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!s.acknowledged_at && (
                          <button onClick={() => handleAcknowledge(s.id)} className="p-1 text-text-tertiary hover:text-status-success" title="Acknowledge">
                            <ThumbsUp size={11} />
                          </button>
                        )}
                        <button onClick={() => handleDismiss(s.id)} className="p-1 text-text-tertiary hover:text-status-error" title="Dismiss">
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {activePanel === "repairs" && (
          <div>
            {repairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-tertiary">
                <Wrench size={24} className="opacity-30" />
                <p className="text-sm">No repairs</p>
              </div>
            ) : (
              repairs.map((r) => (
                <div key={r.id} className="px-4 py-3 border-b border-border-primary/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded",
                      r.state === "pending_confirm" ? "bg-status-warning/20 text-status-warning" :
                      r.state === "applied" ? "bg-status-success/20 text-status-success" :
                      r.state === "rejected" ? "bg-status-error/20 text-status-error" :
                      "bg-surface-tertiary text-text-tertiary"
                    )}>
                      {r.state}
                    </span>
                    <span className="text-sm text-text-primary">{r.action}</span>
                  </div>
                  <div className="text-xs text-text-tertiary mb-2">
                    {r.origin} · {r.safety_class}
                  </div>
                  {r.state === "pending_confirm" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveRepair(r.id)}
                        className="px-2 py-1 text-xs bg-status-success/20 text-status-success rounded hover:bg-status-success/30 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectRepair(r.id)}
                        className="px-2 py-1 text-xs bg-status-error/20 text-status-error rounded hover:bg-status-error/30 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activePanel === "settings" && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-text-secondary">
              Assist is controlled via <code className="text-accent-secondary">assist.enabled</code> and
              per-feature flags in the agent config (<code>/etc/ados/config.yaml</code>).
            </p>
            <div className="text-xs text-text-tertiary space-y-1">
              <div>diagnostics: {assistStatus?.enabled ? "on" : "off"}</div>
              <div>suggestions: {assistStatus?.enabled ? "on" : "off"}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
