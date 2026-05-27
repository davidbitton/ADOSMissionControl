/**
 * @module hardware/radio/labels
 * @description Locale-aware label resolvers for the radio sub-panels.
 * Kept separate from the React components so they can be unit-tested
 * without spinning up the i18n provider.
 * @license GPL-3.0-only
 */

import type { useTranslations } from "next-intl";
import type {
  RadioLinkState,
  RadioTopology,
  RadioPeerLink,
  RadioHopState,
  RadioAcquireState,
} from "@/lib/api/ground-station/types";

export function linkStateLabel(
  t: ReturnType<typeof useTranslations>,
  state: RadioLinkState,
): string {
  const map: Record<RadioLinkState, string> = {
    absent: "linkState.absent",
    disconnected: "linkState.disconnected",
    unpaired: "linkState.unpaired",
    auto_pairing: "linkState.auto_pairing",
    binding: "linkState.binding",
    connecting: "linkState.connecting",
    connected: "linkState.connected",
    degraded: "linkState.degraded",
  };
  return t(map[state]);
}

export function topologyLabel(
  t: ReturnType<typeof useTranslations>,
  topology: RadioTopology,
): string {
  if (topology === "host_vbus") return t("topology.hostVbus");
  if (topology === "powered_hub") return t("topology.poweredHub");
  return t("topology.external5v");
}

export function peerLinkLabel(
  t: ReturnType<typeof useTranslations>,
  peerLink: RadioPeerLink,
): string {
  const map: Record<RadioPeerLink, string> = {
    linked: "peerLinkState.linked",
    searching: "peerLinkState.searching",
    no_peer: "peerLinkState.no_peer",
  };
  return t(map[peerLink]);
}

export function hopStateLabel(
  t: ReturnType<typeof useTranslations>,
  hopState: RadioHopState,
): string {
  const map: Record<RadioHopState, string> = {
    idle: "hopState.idle",
    searching: "hopState.searching",
    locked: "hopState.locked",
    hopping: "hopState.hopping",
  };
  return t(map[hopState]);
}

export function acquireStateLabel(
  t: ReturnType<typeof useTranslations>,
  acquireState: RadioAcquireState,
): string {
  const map: Record<RadioAcquireState, string> = {
    idle: "acquireState.idle",
    searching: "acquireState.searching",
    locked: "acquireState.locked",
    "no-peer": "acquireState.no_peer",
  };
  return t(map[acquireState]);
}

// Friendly band label. The agent emits the U-NII band slug; render a
// human label, falling back to the raw value for any future band.
export function bandLabel(
  t: ReturnType<typeof useTranslations>,
  band: string,
): string {
  if (band === "u-nii-1") return t("bandState.unii1");
  if (band === "u-nii-3") return t("bandState.unii3");
  if (band === "all") return t("bandState.all");
  return band;
}
