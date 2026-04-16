"use client";

/**
 * @module RosTab
 * @description Top-level ROS 2 tab component under Command.
 * Renders one of five states: not-initialized, initializing, ready, running, error.
 * Sub-views: Overview, Node Graph, Topics, Workspace, Recordings, Settings.
 * @license GPL-3.0-only
 */

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  LayoutGrid,
  GitBranch,
  Radio,
  FolderOpen,
  Circle,
  Settings,
  AlertTriangle,
  RefreshCw,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRosStore, type RosSubView } from "@/stores/ros-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { RosNotInitialized } from "./RosNotInitialized";
import { RosInitWizard } from "./RosInitWizard";
import { RosOverview } from "./RosOverview";
import { RosNodeGraph } from "./RosNodeGraph";
import { RosTopics } from "./RosTopics";

const SUB_VIEWS: { id: RosSubView; icon: typeof LayoutGrid; label: string }[] = [
  { id: "overview", icon: LayoutGrid, label: "Overview" },
  { id: "node-graph", icon: GitBranch, label: "Node Graph" },
  { id: "topics", icon: Radio, label: "Topics" },
  { id: "workspace", icon: FolderOpen, label: "Workspace" },
  { id: "recordings", icon: Circle, label: "Recordings" },
  { id: "settings", icon: Settings, label: "Settings" },
];

export function RosTab() {
  const rosState = useRosStore((s) => s.rosState);
  const error = useRosStore((s) => s.error);
  const activeSubView = useRosStore((s) => s.activeSubView);
  const setActiveSubView = useRosStore((s) => s.setActiveSubView);
  const initInProgress = useRosStore((s) => s.initInProgress);

  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);

  // Set up client when agent URL is available
  useEffect(() => {
    if (agentUrl) {
      useRosStore.getState().setClient(agentUrl, apiKey || "");
    }
  }, [agentUrl, apiKey]);

  // Polling intervals - use getState() for stable callbacks (no dep churn)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Initial poll
    useRosStore.getState().pollStatus();

    // 3s interval for status + nodes + topics
    pollRef.current = setInterval(() => {
      if (document.hidden) return;
      const store = useRosStore.getState();
      store.pollStatus();
      store.pollNodes();
      store.pollTopics();
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Not initialized state
  if (rosState === "not_initialized" || rosState === "not_supported" || rosState === "stopped") {
    if (initInProgress) {
      return <RosInitWizard />;
    }
    return <RosNotInitialized />;
  }

  // Initializing state
  if (rosState === "initializing" || initInProgress) {
    return <RosInitWizard />;
  }

  // Error state
  if (rosState === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <AlertTriangle className="w-12 h-12 text-status-error" />
        <h2 className="text-lg font-semibold text-text-primary">ROS Environment Error</h2>
        <p className="text-sm text-text-secondary max-w-md text-center">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => useRosStore.getState().pollStatus()}
            className="flex items-center gap-2 px-4 py-2 bg-surface-secondary rounded-lg text-text-primary hover:bg-surface-tertiary transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <button
            onClick={() => useRosStore.getState().stop()}
            className="flex items-center gap-2 px-4 py-2 bg-status-error/20 rounded-lg text-status-error hover:bg-status-error/30 transition-colors"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        </div>
      </div>
    );
  }

  // Ready / Running state - show sub-views
  return (
    <div className="flex h-full">
      {/* Sub-view sidebar */}
      <div className="w-48 border-r border-border-primary flex flex-col py-2">
        {SUB_VIEWS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveSubView(id)}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
              activeSubView === id
                ? "bg-accent-primary/10 text-accent-primary border-r-2 border-accent-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Sub-view content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeSubView === "overview" && <RosOverview />}
        {activeSubView === "node-graph" && <RosNodeGraph />}
        {activeSubView === "topics" && <RosTopics />}
        {activeSubView === "workspace" && (
          <div className="text-text-secondary text-sm">Workspace management coming in Phase 4.</div>
        )}
        {activeSubView === "recordings" && (
          <div className="text-text-secondary text-sm">MCAP recording management coming in Phase 4.</div>
        )}
        {activeSubView === "settings" && (
          <div className="text-text-secondary text-sm">ROS settings coming in Phase 5.</div>
        )}
      </div>
    </div>
  );
}
