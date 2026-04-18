"use client";

/**
 * @module HardwareEdgeMixerPage
 * @description Mixer editor route. Renders the section-tabbed
 * MixerEditor which drives `MIXER GET / SET` against the firmware for
 * each supported section (setup, mixes, gvs, flight_modes). Unsupported
 * tabs stay visible but disabled until schema v2 lands.
 * @license GPL-3.0-only
 */

import { MixerEditor } from "@/components/hardware/transmitter/MixerEditor";

export default function HardwareEdgeMixerPage() {
  return <MixerEditor />;
}
