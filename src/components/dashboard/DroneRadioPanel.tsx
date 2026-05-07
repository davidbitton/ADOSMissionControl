"use client";

/**
 * @module DroneRadioPanel
 * @description Air-side radio view for a single drone. Reads the radio
 * snapshot from the per-drone capability store (populated by the cloud
 * heartbeat) and renders link state, topology, channel, FEC stats, and
 * the TX power slider. The slider commits TX power against the drone's
 * own agent because air-side TX is what's being adjusted.
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import { Radio as RadioIcon, AlertTriangle } from "lucide-react";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { groundStationApiFromAgent } from "@/lib/api/ground-station-api";
import { TxPowerSlider } from "@/components/hardware/TxPowerSlider";
import type {
  RadioLinkState,
  RadioTopology,
  SetTxPowerResult,
} from "@/lib/api/ground-station/types";

const EMPTY = "…";

// RSSI color thresholds. Air-side rarely receives its own beacon so
// rssiDbm may be null on most drones. The note below explains why.
const RSSI_GREEN_DBM = -55;
const RSSI_YELLOW_DBM = -75;

// Brownout warning fires when host-VBUS topology is paired with TX
// power above the soft floor.
const BROWNOUT_TX_FLOOR_DBM = 12;

// Conservative default cap when the agent has not advertised a per-driver
// maximum. Matches the ground-side default for parity.
const DEFAULT_TX_MAX_DBM = 15;

// Default initial slider value when neither the live TX power nor a
// last-seen value is available.
const DEFAULT_INITIAL_TX_DBM = 5;

interface DroneRadioPanelProps {
  droneId: string;
}

function rssiClass(dbm: number | null): string {
  if (dbm == null) return "text-text-tertiary";
  if (dbm >= RSSI_GREEN_DBM) return "text-status-success";
  if (dbm >= RSSI_YELLOW_DBM) return "text-status-warning";
  return "text-status-error";
}

function topologyClass(topology: RadioTopology): string {
  if (topology === "external_5v") {
    return "border-status-success/40 text-status-success";
  }
  if (topology === "powered_hub") {
    return "border-accent-primary/40 text-accent-primary";
  }
  return "border-border-default text-text-secondary";
}

function linkStateLabel(
  t: ReturnType<typeof useTranslations>,
  state: RadioLinkState,
): string {
  const map: Record<RadioLinkState, string> = {
    absent: "linkState.absent",
    disconnected: "linkState.disconnected",
    connecting: "linkState.connecting",
    connected: "linkState.connected",
    degraded: "linkState.degraded",
  };
  return t(map[state]);
}

function topologyLabel(
  t: ReturnType<typeof useTranslations>,
  topology: RadioTopology,
): string {
  if (topology === "host_vbus") return t("topology.hostVbus");
  if (topology === "powered_hub") return t("topology.poweredHub");
  return t("topology.external5v");
}

export function DroneRadioPanel({ droneId }: DroneRadioPanelProps) {
  const t = useTranslations("hardware.radio");
  const tDrone = useTranslations("droneRadio");

  const radio = useAgentCapabilitiesStore((s) => s.radio);
  // The agent URL the panel will hit for TX power apply. In the
  // current architecture this is whichever agent the GCS is connected
  // to; cloud mode reuses the same connection store. A future per-drone
  // URL field on the capability store would let multi-drone control
  // surfaces target each agent independently. See report for the gap.
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);

  if (!radio) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-default bg-bg-secondary text-text-tertiary">
          <RadioIcon size={24} />
        </div>
        <h2 className="text-sm font-display font-semibold text-text-primary">
          {t("notSupported")}
        </h2>
      </div>
    );
  }

  const linkState: RadioLinkState = radio.state;
  const topology: RadioTopology = radio.topology;
  const rssiDbm = radio.rssiDbm;
  const bitrateKbps = radio.bitrateKbps;
  const bitrateMbps = bitrateKbps != null ? bitrateKbps / 1000 : null;
  const channel = radio.channel;
  const freqMhz = radio.freqMhz;
  const bandwidthMhz = radio.bandwidthMhz;
  const fecRecovered = radio.fecRecovered;
  const fecLost = radio.fecLost;
  const driver = radio.driver;
  const iface = radio.iface;
  const txPowerDbm = radio.txPowerDbm;
  const txPowerMaxDbm =
    radio.txPowerMaxDbm > 0 ? radio.txPowerMaxDbm : DEFAULT_TX_MAX_DBM;

  const showBrownoutWarning =
    topology === "host_vbus" &&
    txPowerDbm != null &&
    txPowerDbm > BROWNOUT_TX_FLOOR_DBM;

  // The drone does not typically receive its own RF — the value lives
  // on the ground side. Display a hint so operators do not interpret a
  // null RSSI as a bug.
  const showRssiHint = linkState === "connected" && rssiDbm == null;

  const onApply = async (dbm: number): Promise<SetTxPowerResult> => {
    const api = groundStationApiFromAgent(agentUrl, apiKey);
    if (!api) {
      throw new Error(tDrone("noAgent"));
    }
    return api.setTxPower(dbm);
  };

  const initialSliderValue = txPowerDbm ?? DEFAULT_INITIAL_TX_DBM;
  const safeMax = Math.max(1, txPowerMaxDbm);
  // Hostname for the typed-phrase confirmation. Falls back to the
  // device id for traceability when the agent has not surfaced an mDNS
  // host.
  const confirmHostname = droneId;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      <section className="rounded border border-border-default bg-bg-secondary p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs ${topologyClass(topology)}`}
          >
            <RadioIcon size={12} />
            {topologyLabel(t, topology)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border border-border-default bg-bg-tertiary px-2.5 py-1 text-xs text-text-secondary">
            {linkStateLabel(t, linkState)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border border-border-default bg-bg-tertiary px-2.5 py-1 text-xs text-text-tertiary">
            {tDrone("airSideBadge")}
          </span>
          {showBrownoutWarning ? (
            <span className="inline-flex items-center gap-1.5 rounded border border-status-warning/40 bg-status-warning/10 px-2.5 py-1 text-xs text-status-warning">
              <AlertTriangle size={12} />
              {t("brownoutWarning")}
            </span>
          ) : null}
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <StatRow
            label={t("rssi")}
            value={rssiDbm == null ? EMPTY : `${rssiDbm.toFixed(0)} dBm`}
            valueClass={rssiClass(rssiDbm)}
            hint={showRssiHint ? tDrone("rssiAirNote") : undefined}
          />
          <StatRow
            label={t("bitrate")}
            value={
              bitrateMbps == null ? EMPTY : `${bitrateMbps.toFixed(1)} Mbps`
            }
          />
          <StatRow
            label={t("channel")}
            value={
              channel == null
                ? EMPTY
                : freqMhz == null
                  ? `CH ${channel}`
                  : `CH ${channel} (${freqMhz.toFixed(0)} MHz)`
            }
          />
          <StatRow
            label={t("bandwidth")}
            value={
              bandwidthMhz == null || bandwidthMhz === 0
                ? EMPTY
                : `${bandwidthMhz} MHz`
            }
          />
          <StatRow label={t("fecRecovered")} value={String(fecRecovered)} />
          <StatRow label={t("fecLost")} value={String(fecLost)} />
          {driver ? <StatRow label={t("driver")} value={driver} /> : null}
          {iface ? <StatRow label={t("iface")} value={iface} /> : null}
        </dl>
      </section>

      <section className="rounded border border-border-default bg-bg-secondary p-5">
        <h3 className="mb-1 text-sm font-semibold text-text-primary">
          {t("txPower")}
        </h3>
        <p className="mb-1 text-xs text-text-tertiary">
          {t("txPowerHardCap", { max: safeMax })}
        </p>
        <p className="mb-4 text-xs text-text-tertiary">
          {tDrone("txPowerScopeHint")}
        </p>
        <TxPowerSlider
          currentDbm={txPowerDbm}
          maxDbm={safeMax}
          initialValue={initialSliderValue}
          confirmHostname={confirmHostname}
          onApply={onApply}
          disabled={!agentUrl}
        />
        {!agentUrl ? (
          <p className="mt-3 text-xs text-status-warning">
            {tDrone("noAgent")}
          </p>
        ) : null}
      </section>
    </div>
  );
}

interface StatRowProps {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
}

function StatRow({ label, value, valueClass, hint }: StatRowProps) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border-default py-1.5">
      <div className="flex items-baseline justify-between">
        <dt className="text-xs uppercase tracking-wide text-text-secondary">
          {label}
        </dt>
        <dd
          className={`font-mono text-sm ${valueClass ?? "text-text-primary"}`}
        >
          {value}
        </dd>
      </div>
      {hint ? (
        <p className="text-[10px] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}
