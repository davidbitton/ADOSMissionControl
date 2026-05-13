"use client";

/**
 * @module HardwareRadioPage
 * @description Route-level passthrough. The implementation lives at
 * src/components/command/nodes/ground-station/RadioTab.tsx so the
 * Command-tab node hub and the legacy /hardware/radio URL render
 * the same body during the transition.
 * @license GPL-3.0-only
 */

import { RadioTab } from "@/components/command/nodes/ground-station/RadioTab";

export default function HardwareRadioPage() {
  return <RadioTab />;
}
