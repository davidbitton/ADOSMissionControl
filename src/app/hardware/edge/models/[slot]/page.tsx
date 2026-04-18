"use client";

/**
 * @module HardwareEdgeModelSlotPage
 * @description Model editor route for one slot.
 * @license GPL-3.0-only
 */

import { useParams } from "next/navigation";
import { ModelEditor } from "@/components/hardware/transmitter/ModelEditor";

export default function HardwareEdgeModelSlotPage() {
  const params = useParams<{ slot: string }>();
  const slotNum = Number.parseInt(params?.slot ?? "0", 10);
  const slot = Number.isFinite(slotNum) ? slotNum : 0;
  return <ModelEditor slot={slot} />;
}
