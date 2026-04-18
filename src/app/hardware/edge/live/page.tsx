"use client";

/**
 * @module HardwareEdgeLivePage
 * @description Live 16-channel monitor route for the ADOS Edge transmitter.
 * @license GPL-3.0-only
 */

import { LiveInputMonitor } from "@/components/hardware/transmitter/LiveInputMonitor";

export default function HardwareEdgeLivePage() {
  return <LiveInputMonitor />;
}
