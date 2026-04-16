"use client";

/**
 * @module RosWorkspace
 * @description Workspace sub-view for the ROS tab.
 * Shows package list, build trigger with SSE log stream, and create-node wizard.
 * @license GPL-3.0-only
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { FolderOpen, Hammer, Plus, Package, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useRosStore } from "@/stores/ros-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";

const TEMPLATE_OPTIONS = [
  { value: "basic", label: "Basic", description: "Minimal talker/listener node" },
  { value: "planner", label: "Planner", description: "Subscribes /odom, publishes /cmd_vel" },
  { value: "perception", label: "Perception", description: "Camera subscriber + detection publisher" },
];

export function RosWorkspace() {
  const workspace = useRosStore((s) => s.workspace);
  const rosState = useRosStore((s) => s.rosState);
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);

  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [buildResult, setBuildResult] = useState<"success" | "failed" | null>(null);
  const [showCreateNode, setShowCreateNode] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeTemplate, setNewNodeTemplate] = useState("basic");
  const [creating, setCreating] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll build log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [buildLog]);

  // Poll workspace info
  useEffect(() => {
    const poll = setInterval(() => {
      if (!document.hidden) {
        useRosStore.getState().pollWorkspace();
      }
    }, 10000);
    useRosStore.getState().pollWorkspace();
    return () => clearInterval(poll);
  }, []);

  const triggerBuild = useCallback(async () => {
    if (!agentUrl || building) return;
    setBuilding(true);
    setBuildLog([]);
    setBuildResult(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["X-ADOS-Key"] = apiKey;

      const res = await fetch(`${agentUrl}/api/ros/workspace/build`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        setBuildResult("failed");
        setBuildLog(["Build request failed: " + res.status]);
        setBuilding(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setBuilding(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.line) {
                setBuildLog((prev) => [...prev, data.line]);
              }
              if (data.status === "success") setBuildResult("success");
              if (data.status === "failed") setBuildResult("failed");
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      setBuildResult("failed");
      setBuildLog((prev) => [...prev, `Error: ${err}`]);
    } finally {
      setBuilding(false);
    }
  }, [agentUrl, apiKey, building]);

  const createNode = useCallback(async () => {
    if (!agentUrl || !newNodeName.trim()) return;
    setCreating(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["X-ADOS-Key"] = apiKey;

      await fetch(`${agentUrl}/api/ros/launch`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          package: newNodeName.trim(),
          executable: "",
          name: newNodeName.trim(),
        }),
      });
      setShowCreateNode(false);
      setNewNodeName("");
      useRosStore.getState().pollWorkspace();
    } catch { /* handled by UI */ }
    finally { setCreating(false); }
  }, [agentUrl, apiKey, newNodeName]);

  if (rosState !== "running") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary text-sm">
        <FolderOpen className="w-8 h-8 mb-2 text-text-tertiary" />
        Start the ROS environment to manage your workspace.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          Workspace {workspace ? `(${workspace.packages.length} packages)` : ""}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateNode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-secondary rounded-lg text-text-primary text-sm hover:bg-surface-tertiary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Node
          </button>
          <button
            onClick={triggerBuild}
            disabled={building}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-primary rounded-lg text-white text-sm hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
          >
            {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />}
            {building ? "Building..." : "Build"}
          </button>
        </div>
      </div>

      {/* Package list */}
      {workspace && workspace.packages.length > 0 ? (
        <div className="bg-surface-secondary rounded-lg border border-border-primary overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary text-text-secondary text-xs">
                <th className="text-left px-4 py-2 font-medium">Package</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Version</th>
              </tr>
            </thead>
            <tbody>
              {workspace.packages.map((pkg) => (
                <tr key={pkg.name} className="border-b border-border-primary/50 hover:bg-surface-tertiary/50">
                  <td className="px-4 py-2 font-mono text-accent-primary flex items-center gap-2">
                    <Package className="w-3.5 h-3.5" />
                    {pkg.name}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{pkg.type}</td>
                  <td className="px-4 py-2 text-text-secondary">{pkg.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface-secondary rounded-lg p-6 border border-border-primary text-center">
          <FolderOpen className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary">No packages yet. Click "New Node" to get started.</p>
        </div>
      )}

      {/* Build log */}
      {(buildLog.length > 0 || building) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">Build Output</h4>
            {buildResult === "success" && <CheckCircle className="w-3.5 h-3.5 text-status-success" />}
            {buildResult === "failed" && <XCircle className="w-3.5 h-3.5 text-status-error" />}
          </div>
          <div
            ref={logRef}
            className="bg-[#0A0A0F] rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-text-secondary border border-border-primary"
          >
            {buildLog.map((line, i) => (
              <div key={i} className="py-0.5">{line}</div>
            ))}
            {building && <div className="py-0.5 text-accent-primary animate-pulse">Building...</div>}
          </div>
        </div>
      )}

      {/* Create node modal */}
      {showCreateNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-primary rounded-xl border border-border-primary p-6 w-96 shadow-xl">
            <h3 className="text-sm font-medium text-text-primary mb-4">Create New ROS Node</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Node Name</label>
                <input
                  type="text"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  placeholder="my_node"
                  className="w-full bg-surface-secondary border border-border-primary rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary"
                />
              </div>
              <Select
                label="Template"
                options={TEMPLATE_OPTIONS}
                value={newNodeTemplate}
                onChange={setNewNodeTemplate}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCreateNode(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createNode}
                disabled={!newNodeName.trim() || creating}
                className="px-4 py-2 bg-accent-primary rounded-lg text-white text-sm hover:bg-accent-primary/90 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
