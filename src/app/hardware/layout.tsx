"use client";

/**
 * @module HardwareLayout
 * @description Two-pane layout for the Hardware tab. Left primary nav
 * (HardwareSidebar) lists every hardware category. The content area renders
 * the active sub-page with a shared header and the mesh banner.
 * @license GPL-3.0-only
 */

import { HardwareSidebar } from "@/components/hardware/HardwareSidebar";
import { MeshWsBanner } from "@/components/hardware/MeshWsBanner";

export default function HardwareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 overflow-hidden bg-bg-primary">
      <HardwareSidebar />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <MeshWsBanner />
          {children}
        </div>
      </div>
    </div>
  );
}
