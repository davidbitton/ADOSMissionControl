/**
 * @license GPL-3.0-only
 */
"use client";

import { useState, useEffect } from "react";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AssistBanner() {
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!agentUrl) return;
    const headers: Record<string, string> = apiKey ? { "X-ADOS-Key": apiKey } : {};
    const poll = async () => {
      try {
        const resp = await fetch(`${agentUrl}/api/assist/suggestions`, { headers });
        if (resp.ok) {
          const data = await resp.json();
          setCount(Array.isArray(data) ? data.filter((s: any) => !s.dismissed_at).length : 0);
        }
      } catch {
        // silent
      }
    };
    const interval = setInterval(poll, 30_000);
    poll();
    return () => clearInterval(interval);
  }, [agentUrl, apiKey]);

  if (count === 0) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 text-xs",
      "bg-status-warning/10 border-b border-status-warning/20 text-status-warning"
    )}>
      <AlertTriangle size={11} />
      <span>Assist: {count} suggestion{count !== 1 ? "s" : ""} pending</span>
    </div>
  );
}
