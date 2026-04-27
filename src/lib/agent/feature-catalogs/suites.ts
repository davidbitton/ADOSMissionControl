/**
 * @module FeatureCatalog.Suites
 * @description Mission suite features (sentry, survey, agriculture, cargo, sar, inspection).
 * @license GPL-3.0-only
 */

import type { FeatureDef } from "../feature-types";

export const SUITE_FEATURES: Record<string, FeatureDef> = {
  "suite-sentry": {
    id: "suite-sentry",
    comingSoon: true,
    type: "suite",
    name: "Sentry Suite",
    description: "Patrol and surveillance with perimeter monitoring and intrusion detection",
    icon: "Shield",
    category: "mission",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
      { type: "imu", label: "IMU", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    suiteId: "sentry",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Person detection" },
      { modelId: "vehicle_v1", required: false, purpose: "Vehicle detection" },
    ],
    configSchema: [
      { key: "patrol_speed", label: "Patrol Speed", type: "slider", default: 4, min: 1, max: 10, step: 0.5, unit: "m/s" },
      { key: "patrol_altitude", label: "Patrol Altitude", type: "slider", default: 30, min: 10, max: 80, step: 5, unit: "m" },
      { key: "detection_sensitivity", label: "Detection Sensitivity", type: "slider", default: 0.5, min: 0.2, max: 0.9, step: 0.05 },
    ],
  },

  "suite-survey": {
    id: "suite-survey",
    comingSoon: true,
    type: "suite",
    name: "Survey Suite",
    description: "Aerial mapping, photogrammetry, and 3D reconstruction capture",
    icon: "Map",
    category: "mission",
    tierRequired: 2,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "gps", label: "GPS", required: true },
      { type: "imu", label: "IMU", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    suiteId: "survey",
    configSchema: [
      { key: "overlap_pct", label: "Forward Overlap", type: "slider", default: 75, min: 50, max: 90, step: 5, unit: "%" },
      { key: "sidelap_pct", label: "Side Overlap", type: "slider", default: 65, min: 40, max: 85, step: 5, unit: "%" },
      { key: "target_gsd", label: "Target GSD", type: "slider", default: 3, min: 1, max: 10, step: 0.5, unit: "cm/px" },
    ],
  },

  "suite-agriculture": {
    id: "suite-agriculture",
    comingSoon: true,
    type: "suite",
    name: "Agriculture Suite",
    description: "Crop health monitoring, precision spray control, and field analytics",
    icon: "Sprout",
    category: "mission",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    suiteId: "agriculture",
    requiresNpu: true,
    requiredModels: [
      { modelId: "crop_health_v1", required: true, purpose: "Crop health detection" },
    ],
    configSchema: [
      { key: "spray_rate", label: "Spray Rate", type: "slider", default: 2, min: 0.5, max: 5, step: 0.5, unit: "L/min" },
      { key: "row_width", label: "Row Width", type: "slider", default: 3, min: 1, max: 10, step: 0.5, unit: "m" },
      { key: "flight_altitude", label: "Flight Altitude", type: "slider", default: 5, min: 2, max: 15, step: 1, unit: "m" },
    ],
  },

  "suite-cargo": {
    id: "suite-cargo",
    comingSoon: true,
    type: "suite",
    name: "Cargo Suite",
    description: "Autonomous delivery with precision landing and route optimization",
    icon: "PackageCheck",
    category: "mission",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
      { type: "rangefinder", label: "Rangefinder", required: false },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    suiteId: "cargo",
    requiresNpu: true,
    requiredModels: [
      { modelId: "landing_pad_v1", required: true, purpose: "Drop zone detection" },
    ],
    configSchema: [
      { key: "approach_altitude", label: "Approach Altitude", type: "slider", default: 15, min: 5, max: 30, step: 1, unit: "m" },
      { key: "descent_speed", label: "Descent Speed", type: "slider", default: 0.5, min: 0.2, max: 1.5, step: 0.1, unit: "m/s" },
    ],
  },

  "suite-sar": {
    id: "suite-sar",
    comingSoon: true,
    type: "suite",
    name: "SAR Suite",
    description: "Search and rescue with thermal detection and systematic search patterns",
    icon: "LifeBuoy",
    category: "mission",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
      { type: "thermal", label: "Thermal Camera", required: false },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    suiteId: "sar",
    requiresNpu: true,
    requiredModels: [
      { modelId: "person_v1", required: true, purpose: "Person detection (RGB)" },
      { modelId: "thermal_person_v1", required: false, purpose: "Person detection (thermal)" },
    ],
    configSchema: [
      { key: "search_altitude", label: "Search Altitude", type: "slider", default: 30, min: 10, max: 80, step: 5, unit: "m" },
      { key: "search_speed", label: "Search Speed", type: "slider", default: 5, min: 2, max: 12, step: 0.5, unit: "m/s" },
      { key: "detection_sensitivity", label: "Detection Sensitivity", type: "slider", default: 0.4, min: 0.2, max: 0.8, step: 0.05 },
    ],
  },

  "suite-inspection": {
    id: "suite-inspection",
    comingSoon: true,
    type: "suite",
    name: "Inspection Suite",
    description: "Close-range structural assessment with thermal and defect detection",
    icon: "Search",
    category: "mission",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    suiteId: "inspection",
    requiresNpu: true,
    requiredModels: [
      { modelId: "defect_v1", required: true, purpose: "Defect detection (cracks, corrosion)" },
    ],
    configSchema: [
      { key: "inspection_distance", label: "Inspection Distance", type: "slider", default: 3, min: 1, max: 10, step: 0.5, unit: "m" },
      { key: "flight_speed", label: "Flight Speed", type: "slider", default: 1, min: 0.3, max: 3, step: 0.1, unit: "m/s" },
    ],
  },
};
