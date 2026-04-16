"use client";

/**
 * @module RosRecordings
 * @description Recordings sub-view for the ROS tab.
 * Shows MCAP recording list, start/stop controls, and download links.
 * @license GPL-3.0-only
 */

import { useState, useEffect, useCallback } from "react";
import { Circle, Download, Play, Square, Trash2, FileAudio } from "lucide-react";
import { useRosStore } from "@/stores/ros-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import type { RosRecording } from "@/lib/agent/ros-types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function RosRecordings() {
  const recordings = useRosStore((s) => s.recordings);
  const rosState = useRosStore((s) => s.rosState);
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);

  const [recording, setRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // Poll recordings
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        useRosStore.getState().pollRecordings();
      }
    }, recording ? 5000 : 10000);
    useRosStore.getState().pollRecordings();
    return () => clearInterval(interval);
  }, [recording]);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) h["X-ADOS-Key"] = apiKey;
    return h;
  }, [apiKey]);

  const startRecording = useCallback(async () => {
    if (!agentUrl) return;
    try {
      const res = await fetch(`${agentUrl}/api/ros/recording/start`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ topics: [], max_size_mb: 500, max_duration_s: 3600 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecording(true);
        setRecordingId(data.recording_id || null);
      }
    } catch { /* handled by UI state */ }
  }, [agentUrl, headers]);

  const stopRecording = useCallback(async () => {
    if (!agentUrl || !recordingId) return;
    try {
      await fetch(`${agentUrl}/api/ros/recording/stop`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ recording_id: recordingId }),
      });
    } catch { /* handled */ }
    finally {
      setRecording(false);
      setRecordingId(null);
      useRosStore.getState().pollRecordings();
    }
  }, [agentUrl, recordingId, headers]);

  if (rosState !== "running") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary text-sm">
        <FileAudio className="w-8 h-8 mb-2 text-text-tertiary" />
        Start the ROS environment to manage recordings.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          MCAP Recordings ({recordings.length})
        </h3>
        {recording ? (
          <button
            onClick={stopRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-status-error/20 rounded-lg text-status-error text-sm hover:bg-status-error/30 transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
            Stop Recording
          </button>
        ) : (
          <button
            onClick={startRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-status-error rounded-lg text-white text-sm hover:bg-status-error/90 transition-colors"
          >
            <Circle className="w-3.5 h-3.5 fill-current" />
            Start Recording
          </button>
        )}
      </div>

      {/* Recording indicator */}
      {recording && (
        <div className="bg-status-error/10 border border-status-error/30 rounded-lg p-3 flex items-center gap-3">
          <Circle className="w-3 h-3 fill-status-error text-status-error animate-pulse" />
          <span className="text-sm text-status-error">Recording in progress...</span>
        </div>
      )}

      {/* Recordings table */}
      {recordings.length > 0 ? (
        <div className="bg-surface-secondary rounded-lg border border-border-primary overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary text-text-secondary text-xs">
                <th className="text-left px-4 py-2 font-medium">Recording</th>
                <th className="text-left px-4 py-2 font-medium">Started</th>
                <th className="text-right px-4 py-2 font-medium">Duration</th>
                <th className="text-right px-4 py-2 font-medium">Size</th>
                <th className="text-center px-4 py-2 font-medium">Topics</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((rec: RosRecording) => (
                <tr key={rec.id} className="border-b border-border-primary/50 hover:bg-surface-tertiary/50">
                  <td className="px-4 py-2 font-mono text-accent-primary text-xs truncate max-w-40">
                    {rec.id}
                  </td>
                  <td className="px-4 py-2 text-text-secondary text-xs">
                    {new Date(rec.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-text-primary text-xs">
                    {formatDuration(rec.duration_s)}
                  </td>
                  <td className="px-4 py-2 text-right text-text-primary text-xs">
                    {formatBytes(rec.size_bytes)}
                  </td>
                  <td className="px-4 py-2 text-center text-text-secondary text-xs">
                    {rec.topics_recorded.length}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1 rounded hover:bg-surface-tertiary transition-colors text-text-secondary"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-surface-tertiary transition-colors text-text-secondary"
                        title="Play in Foxglove"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface-secondary rounded-lg p-6 border border-border-primary text-center">
          <FileAudio className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary">No recordings yet. Click "Start Recording" to capture topic data.</p>
        </div>
      )}
    </div>
  );
}
