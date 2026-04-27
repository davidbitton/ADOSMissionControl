/**
 * @module FeatureCatalog.Tracking
 * @description Tracking smart modes (follow-me, multi-target tracking).
 * @license GPL-3.0-only
 */

import type { FeatureDef } from "../feature-types";

export const TRACKING_FEATURES: Record<string, FeatureDef> = {
  "follow-me": {
    id: "follow-me",
    type: "smart-mode",
    name: "Follow Me",
    description: "Drone autonomously follows a designated target using visual tracking",
    icon: "UserRound",
    category: "tracking",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
      { type: "imu", label: "IMU", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "follow_target",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Target detection" },
    ],
    configSchema: [
      { key: "follow_distance", label: "Follow Distance", type: "slider", default: 10, min: 3, max: 30, step: 1, unit: "m" },
      { key: "follow_altitude", label: "Altitude", type: "slider", default: 15, min: 5, max: 50, step: 1, unit: "m" },
      { key: "max_speed", label: "Max Speed", type: "slider", default: 8, min: 1, max: 15, step: 0.5, unit: "m/s" },
      { key: "loss_action", label: "On Target Lost", type: "select", default: "hover", options: [
        { value: "hover", label: "Hover and wait" },
        { value: "rtl", label: "Return to launch" },
        { value: "land", label: "Land in place" },
      ]},
      { key: "obstacle_mode", label: "Obstacle Avoidance", type: "select", default: "brake", options: [
        { value: "off", label: "Off" },
        { value: "brake", label: "Brake (stop on obstacle)" },
        { value: "detour", label: "Detour (fly around)" },
      ]},
    ],
  },

  "active-track": {
    id: "active-track",
    comingSoon: true,
    type: "smart-mode",
    name: "ActiveTrack",
    description: "Multi-target aware tracking with automatic re-acquisition after occlusion",
    icon: "Crosshair",
    category: "tracking",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "active_track",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Target detection" },
      { modelId: "vehicle_v1", required: false, purpose: "Vehicle tracking" },
    ],
    configSchema: [
      { key: "max_targets", label: "Max Tracked Targets", type: "slider", default: 4, min: 1, max: 10, step: 1 },
      { key: "follow_distance", label: "Follow Distance", type: "slider", default: 10, min: 3, max: 30, step: 1, unit: "m" },
      { key: "follow_altitude", label: "Altitude", type: "slider", default: 15, min: 5, max: 50, step: 1, unit: "m" },
    ],
  },
};
