/**
 * @module FeatureCatalog.Utility
 * @description Utility features (gesture recognition, panorama capture).
 * @license GPL-3.0-only
 */

import type { FeatureDef } from "../feature-types";

export const UTILITY_FEATURES: Record<string, FeatureDef> = {
  "gesture-recognition": {
    id: "gesture-recognition",
    comingSoon: true,
    type: "utility",
    name: "Gesture Control",
    description: "Control the drone with hand gestures detected by the camera",
    icon: "Hand",
    category: "utility",
    tierRequired: 3,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "npu", label: "NPU", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "gesture_recognition",
    requiresNpu: true,
    requiredModels: [
      { modelId: "gesture_v1", required: true, purpose: "Gesture detection" },
    ],
    configSchema: [
      { key: "gesture_sensitivity", label: "Sensitivity", type: "slider", default: 0.7, min: 0.3, max: 0.95, step: 0.05 },
    ],
  },

  panorama: {
    id: "panorama",
    comingSoon: true,
    type: "utility",
    name: "Panorama",
    description: "Capture a 360-degree panorama or wide-angle composite automatically",
    icon: "Maximize2",
    category: "utility",
    tierRequired: 2,
    sensorsRequired: [
      { type: "camera", label: "Camera", required: true },
      { type: "gps", label: "GPS", required: true },
    ],
    servicesRequired: ["video-pipeline", "mavlink-proxy"],
    visionBehavior: "panorama_capture",
    configSchema: [
      { key: "pano_type", label: "Panorama Type", type: "select", default: "sphere", options: [
        { value: "sphere", label: "Full sphere (360 x 180)" },
        { value: "wide", label: "Wide angle (180)" },
        { value: "vertical", label: "Vertical (top to bottom)" },
      ]},
    ],
  },
};
