"use client";

/**
 * @module RosNotInitialized
 * @description Landing card shown when ROS 2 environment has not been initialized.
 * Displays what ROS integration provides, requirements, and an initialize button.
 * @license GPL-3.0-only
 */

import { useState } from "react";
import { Box, Cpu, Eye, Play, Terminal } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useRosStore } from "@/stores/ros-store";

const PROFILE_OPTIONS = [
  { value: "minimal", label: "Minimal", description: "Bridge + foxglove only" },
  { value: "vio", label: "VIO", description: "Camera + VINS-Fusion visual-inertial odometry" },
  { value: "mapping", label: "Mapping", description: "Octomap + Nav2 lite" },
];

const MIDDLEWARE_OPTIONS = [
  { value: "zenoh", label: "Zenoh", description: "NAT-friendly, WAN-capable" },
  { value: "cyclonedds", label: "Cyclone DDS", description: "LAN only, lower latency" },
];

const FEATURES = [
  {
    icon: Box,
    title: "MAVLink Bridge",
    desc: "Real-time flight data published as standard ROS 2 topics. Compatible with mavros message types.",
  },
  {
    icon: Eye,
    title: "Foxglove Studio",
    desc: "Visualize IMU, GPS, camera, and custom topics in your browser or the Foxglove desktop app.",
  },
  {
    icon: Terminal,
    title: "Developer Workspace",
    desc: "Write ROS 2 nodes in Python or C++. Auto-build on save. Full ros2 CLI inside the container.",
  },
  {
    icon: Cpu,
    title: "VIO Ready",
    desc: "Optional VINS-Fusion profile for GPS-denied flight using camera and IMU sensor fusion.",
  },
];

export function RosNotInitialized() {
  const initialize = useRosStore((s) => s.initialize);
  const rosState = useRosStore((s) => s.rosState);
  const [profile, setProfile] = useState("minimal");
  const [middleware, setMiddleware] = useState("zenoh");

  const notSupported = rosState === "not_supported";

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text-primary mb-2">ROS 2 Integration</h2>
      <p className="text-sm text-text-secondary mb-6 text-center">
        Add a full ROS 2 Jazzy environment to your drone. Runs inside a Docker container alongside
        the agent, with zero impact when disabled.
      </p>

      {/* Feature cards */}
      <div className="grid grid-cols-2 gap-3 w-full mb-6">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-surface-secondary rounded-lg p-3 border border-border-primary">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-medium text-text-primary">{title}</span>
            </div>
            <p className="text-xs text-text-secondary">{desc}</p>
          </div>
        ))}
      </div>

      {/* Requirements */}
      <div className="bg-surface-secondary rounded-lg p-4 w-full mb-6 border border-border-primary">
        <h3 className="text-sm font-medium text-text-primary mb-2">Requirements</h3>
        <ul className="text-xs text-text-secondary space-y-1">
          <li>Docker installed on the companion computer</li>
          <li>At least 2 GB free disk space (800 MB image + workspace)</li>
          <li>MAVLink service running (ados-mavlink)</li>
          <li>Board profile with ros.supported = true</li>
        </ul>
      </div>

      {/* Config selectors */}
      {!notSupported && (
        <div className="flex gap-4 mb-4 w-full">
          <div className="flex-1">
            <Select
              label="Profile"
              options={PROFILE_OPTIONS}
              value={profile}
              onChange={setProfile}
            />
          </div>
          <div className="flex-1">
            <Select
              label="Middleware"
              options={MIDDLEWARE_OPTIONS}
              value={middleware}
              onChange={setMiddleware}
            />
          </div>
        </div>
      )}

      {/* Initialize button */}
      {notSupported ? (
        <div className="bg-status-warning/10 border border-status-warning/30 rounded-lg p-3 text-center w-full">
          <p className="text-sm text-status-warning">
            This board does not support ROS 2. Check the board profile or upgrade to a board with 4+ GB RAM.
          </p>
        </div>
      ) : (
        <button
          onClick={() => initialize(profile, middleware)}
          className="flex items-center gap-2 px-6 py-2.5 bg-accent-primary rounded-lg text-white font-medium hover:bg-accent-primary/90 transition-colors"
        >
          <Play className="w-4 h-4" />
          Initialize ROS Environment
        </button>
      )}
    </div>
  );
}
