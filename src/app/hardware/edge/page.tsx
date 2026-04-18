"use client";

/**
 * @module HardwareEdgePage
 * @description ADOS Edge dashboard. Shown when the transmitter is connected.
 * EdgeShell handles the disconnected fallback, so this page renders only the
 * connected dashboard view.
 * @license GPL-3.0-only
 */

import { DashboardPanel } from "@/components/hardware/transmitter/DashboardPanel";

export default function HardwareEdgePage() {
  return <DashboardPanel />;
}
