"use client";

/**
 * @module RosNodeGraph
 * @description Node graph visualization for ROS 2 nodes and topic connections.
 * Uses a simple custom layout (no React Flow dependency yet to keep bundle small).
 * Phase 5 will upgrade to React Flow with dagre for automatic layout.
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import { Box, ArrowRight } from "lucide-react";
import { useRosStore } from "@/stores/ros-store";
import type { RosNodeInfo } from "@/lib/agent/ros-types";

export function RosNodeGraph() {
  const nodes = useRosStore((s) => s.nodes);
  const topics = useRosStore((s) => s.topics);

  // Build connection map: which nodes publish/subscribe to which topics.
  // Uses a topic->subscribers map for O(n) instead of O(n^2) lookup.
  const connections = useMemo(() => {
    // Build topic -> subscriber node names map
    const topicSubscribers = new Map<string, string[]>();
    for (const node of nodes) {
      for (const sub of node.subscribes) {
        const existing = topicSubscribers.get(sub);
        if (existing) {
          existing.push(node.name);
        } else {
          topicSubscribers.set(sub, [node.name]);
        }
      }
    }

    // For each publisher, look up subscribers via the map
    const conns: { from: string; to: string; topic: string }[] = [];
    for (const node of nodes) {
      for (const pub of node.publishes) {
        const subs = topicSubscribers.get(pub);
        if (!subs) continue;
        for (const subName of subs) {
          if (subName !== node.name) {
            conns.push({ from: node.name, to: subName, topic: pub });
          }
        }
      }
    }

    return conns;
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary text-sm">
        <Box className="w-8 h-8 mb-2 text-text-tertiary" />
        No ROS nodes running. Start the environment to see the node graph.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-text-primary">
        Node Graph ({nodes.length} nodes, {connections.length} connections)
      </h3>

      {/* Node cards */}
      <div className="grid grid-cols-2 gap-3">
        {nodes.map((node) => (
          <NodeCard key={node.name} node={node} />
        ))}
      </div>

      {/* Connections */}
      {connections.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Topic Connections
          </h4>
          {connections.map((conn, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs bg-surface-secondary rounded px-3 py-2 border border-border-primary"
            >
              <span className="text-accent-primary font-mono">{conn.from}</span>
              <ArrowRight className="w-3 h-3 text-text-tertiary shrink-0" />
              <span className="text-text-secondary font-mono truncate">{conn.topic}</span>
              <ArrowRight className="w-3 h-3 text-text-tertiary shrink-0" />
              <span className="text-accent-primary font-mono">{conn.to}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeCard({ node }: { node: RosNodeInfo }) {
  return (
    <div className="bg-surface-secondary rounded-lg p-3 border border-border-primary">
      <div className="flex items-center gap-2 mb-2">
        <Box className="w-4 h-4 text-accent-primary" />
        <span className="text-sm font-medium text-text-primary font-mono">{node.name}</span>
      </div>

      {node.publishes.length > 0 && (
        <div className="mb-1.5">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Publishes</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {node.publishes.map((topic) => (
              <span
                key={topic}
                className="text-[10px] font-mono bg-status-success/10 text-status-success px-1.5 py-0.5 rounded"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {node.subscribes.length > 0 && (
        <div>
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Subscribes</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {node.subscribes.map((topic) => (
              <span
                key={topic}
                className="text-[10px] font-mono bg-accent-primary/10 text-accent-primary px-1.5 py-0.5 rounded"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
