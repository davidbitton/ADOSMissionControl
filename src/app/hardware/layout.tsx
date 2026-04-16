"use client";

/**
 * @module HardwareLayout
 * @description Shared layout for all Hardware sub-pages. Renders page title,
 * subtitle, and tab navigation once. Sub-pages render their content below.
 * @license GPL-3.0-only
 */

import { HardwareTabs } from "@/components/hardware/HardwareTabs";

export default function HardwareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-auto bg-surface-primary p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-2xl font-semibold text-text-primary">
          Hardware
        </h1>
        <p className="mb-5 text-sm text-text-secondary">
          Ground station, radios, and physical peripherals.
        </p>

        <HardwareTabs />

        {children}
      </div>
    </div>
  );
}
