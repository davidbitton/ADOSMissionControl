"use client";

/**
 * @module HardwareEdgeSystemPage
 * @license GPL-3.0-only
 */

import { SystemSettings } from "@/components/hardware/transmitter/SystemSettings";
import { ProbePanel } from "@/components/hardware/transmitter/ProbePanel";

export default function HardwareEdgeSystemPage() {
  return (
    <div className="flex flex-col gap-6">
      <SystemSettings />
      <ProbePanel />
    </div>
  );
}
