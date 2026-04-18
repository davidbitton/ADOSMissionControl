"use client";

/**
 * @module HardwareEdgeLayout
 * @description Wraps every /hardware/edge sub-route with the EdgeShell:
 * page intro + connect screen when disconnected, secondary tab strip
 * + page content when connected.
 * @license GPL-3.0-only
 */

import { EdgeShell } from "@/components/hardware/edge/EdgeShell";

export default function HardwareEdgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EdgeShell>{children}</EdgeShell>;
}
