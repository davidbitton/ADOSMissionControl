/**
 * @module FeatureCatalog.Safety
 * @description Safety smart modes (obstacle avoidance, precision landing, terrain following).
 * @license GPL-3.0-only
 */

import type { FeatureDef } from "../feature-types";

export const SAFETY_FEATURES: Record<string, FeatureDef> = {
  "obstacle-avoidance": {
    id: "obstacle-avoidance",
    comingSoon: true,
    type: "smart-mode",
    name: "Obstacle Avoidance",
    description: "Automatic obstacle detection with brake or detour maneuvers",
    icon: "ShieldAlert",
    category: "safety",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
    ],
    servicesRequired: ["video-pipeline"],
    visionBehavior: "obstacle_avoidance",
    requiresNpu: true,
    requiredModels: [
      { modelId: "depth_midas_v3", required: true, purpose: "Depth estimation" },
    ],
    configSchema: [
      { key: "mode", label: "Avoidance Mode", type: "select", default: "brake", options: [
        { value: "brake", label: "Brake (stop on obstacle)" },
        { value: "detour", label: "Detour (fly around)" },
      ]},
      { key: "min_distance", label: "Minimum Distance", type: "slider", default: 3, min: 1, max: 10, step: 0.5, unit: "m" },
      { key: "sensitivity", label: "Sensitivity", type: "select", default: "normal", options: [
        { value: "low", label: "Low (fewer false positives)" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High (more cautious)" },
      ]},
    ],
  },

  "precision-landing": {
    id: "precision-landing",
    comingSoon: true,
    type: "smart-mode",
    name: "Precision Landing",
    description: "Land accurately on an ArUco marker or landing pad using visual guidance",
    icon: "Target",
    category: "safety",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "precision_landing",
    requiresNpu: true,
    requiredModels: [
      { modelId: "landing_pad_v1", required: true, purpose: "Landing pad detection" },
    ],
    configSchema: [
      { key: "marker_type", label: "Marker Type", type: "select", default: "apriltag", options: [
        { value: "apriltag", label: "AprilTag" },
        { value: "h_marker", label: "H-Marker" },
        { value: "circle", label: "Circle pad" },
      ]},
      { key: "approach_altitude", label: "Approach Altitude", type: "slider", default: 10, min: 3, max: 30, step: 1, unit: "m" },
      { key: "descent_speed", label: "Descent Speed", type: "slider", default: 0.5, min: 0.2, max: 1.5, step: 0.1, unit: "m/s" },
    ],
  },

  "terrain-following": {
    id: "terrain-following",
    comingSoon: true,
    type: "smart-mode",
    name: "Terrain Following",
    description: "Maintain constant altitude above ground using downward camera and rangefinder",
    icon: "Mountain",
    category: "safety",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "rangefinder", label: "Rangefinder", required: false },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["mavlink-proxy"],
    visionBehavior: "terrain_following",
    configSchema: [
      { key: "target_agl", label: "Target AGL", type: "slider", default: 10, min: 2, max: 50, step: 1, unit: "m" },
      { key: "max_climb_rate", label: "Max Climb Rate", type: "slider", default: 2, min: 0.5, max: 5, step: 0.5, unit: "m/s" },
      { key: "max_descent_rate", label: "Max Descent Rate", type: "slider", default: 1, min: 0.5, max: 3, step: 0.5, unit: "m/s" },
    ],
  },
};
