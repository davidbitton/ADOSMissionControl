/**
 * @module FeatureCatalog.Cinematography
 * @description Cinematic smart modes (orbit, dronie, rocket, circle, helix, boomerang).
 * @license GPL-3.0-only
 */

import type { FeatureDef } from "../feature-types";

export const CINEMATOGRAPHY_FEATURES: Record<string, FeatureDef> = {
  orbit: {
    id: "orbit",
    comingSoon: true,
    type: "smart-mode",
    name: "Orbit",
    description: "Circle a point of interest at a configurable radius, speed, and altitude",
    icon: "CircleDot",
    category: "cinematography",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: false },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["mavlink-proxy"],
    visionBehavior: "orbit_poi",
    configSchema: [
      { key: "radius", label: "Orbit Radius", type: "slider", default: 15, min: 5, max: 100, step: 1, unit: "m" },
      { key: "speed", label: "Orbit Speed", type: "slider", default: 3, min: 0.5, max: 8, step: 0.5, unit: "m/s" },
      { key: "altitude", label: "Altitude", type: "slider", default: 20, min: 5, max: 100, step: 1, unit: "m" },
      { key: "direction", label: "Direction", type: "select", default: "cw", options: [
        { value: "cw", label: "Clockwise" },
        { value: "ccw", label: "Counter-clockwise" },
      ]},
    ],
  },

  "quickshot-dronie": {
    id: "quickshot-dronie",
    comingSoon: true,
    type: "smart-mode",
    name: "Dronie",
    description: "Fly backward and upward from the target for a dramatic reveal shot",
    icon: "MoveUpRight",
    category: "cinematography",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "quickshot_dronie",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Subject tracking" },
    ],
    configSchema: [
      { key: "distance", label: "Flight Distance", type: "slider", default: 30, min: 10, max: 60, step: 5, unit: "m" },
      { key: "max_altitude", label: "Max Altitude", type: "slider", default: 30, min: 10, max: 60, step: 5, unit: "m" },
      { key: "speed", label: "Speed", type: "slider", default: 4, min: 1, max: 8, step: 0.5, unit: "m/s" },
    ],
  },

  "quickshot-rocket": {
    id: "quickshot-rocket",
    comingSoon: true,
    type: "smart-mode",
    name: "Rocket",
    description: "Fly straight up while the camera points down at the subject",
    icon: "ArrowUp",
    category: "cinematography",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "quickshot_rocket",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Subject tracking" },
    ],
    configSchema: [
      { key: "max_altitude", label: "Max Altitude", type: "slider", default: 40, min: 10, max: 80, step: 5, unit: "m" },
      { key: "speed", label: "Ascent Speed", type: "slider", default: 3, min: 1, max: 6, step: 0.5, unit: "m/s" },
    ],
  },

  "quickshot-circle": {
    id: "quickshot-circle",
    comingSoon: true,
    type: "smart-mode",
    name: "Circle Shot",
    description: "Complete a 360-degree orbit around the subject while filming",
    icon: "RotateCw",
    category: "cinematography",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "quickshot_circle",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Subject tracking" },
    ],
    configSchema: [
      { key: "radius", label: "Circle Radius", type: "slider", default: 10, min: 5, max: 30, step: 1, unit: "m" },
      { key: "speed", label: "Speed", type: "slider", default: 2, min: 0.5, max: 5, step: 0.5, unit: "m/s" },
    ],
  },

  "quickshot-helix": {
    id: "quickshot-helix",
    comingSoon: true,
    type: "smart-mode",
    name: "Helix",
    description: "Spiral upward around the subject while filming from above",
    icon: "Orbit",
    category: "cinematography",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "quickshot_helix",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Subject tracking" },
    ],
    configSchema: [
      { key: "radius", label: "Helix Radius", type: "slider", default: 10, min: 5, max: 30, step: 1, unit: "m" },
      { key: "max_altitude", label: "Max Altitude", type: "slider", default: 30, min: 10, max: 60, step: 5, unit: "m" },
      { key: "speed", label: "Speed", type: "slider", default: 2, min: 0.5, max: 5, step: 0.5, unit: "m/s" },
    ],
  },

  "quickshot-boomerang": {
    id: "quickshot-boomerang",
    comingSoon: true,
    type: "smart-mode",
    name: "Boomerang",
    description: "Arc away from the subject and return in a smooth boomerang path",
    icon: "Undo2",
    category: "cinematography",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "quickshot_boomerang",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Subject tracking" },
    ],
    configSchema: [
      { key: "distance", label: "Arc Distance", type: "slider", default: 30, min: 10, max: 60, step: 5, unit: "m" },
      { key: "speed", label: "Speed", type: "slider", default: 4, min: 1, max: 8, step: 0.5, unit: "m/s" },
    ],
  },
};
