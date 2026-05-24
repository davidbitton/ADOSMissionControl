"use client";

/**
 * @module GroundStationLinkCard
 * @description Compact RX-link health card for the GroundStationOverview.
 * Surfaces RSSI, bitrate, FEC ratio, and channel for the WFB-ng radio.
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import { useGroundStationStore } from "@/stores/ground-station-store";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";

function rssiTone(dbm: number | null): string {
  if (dbm === null) return "text-text-tertiary";
  if (dbm > -65) return "text-status-success";
  if (dbm > -78) return "text-status-warning";
  return "text-status-error";
}

function snrTone(db: number | null): string {
  if (db === null) return "text-text-tertiary";
  if (db >= 20) return "text-status-success";
  if (db >= 10) return "text-status-warning";
  return "text-status-error";
}

// RX-liveness: the receiver stamps this ~0 while frames flow. A growing
// value (or a stalled link) means the downlink has gone quiet.
function rxIdleTone(seconds: number | null): string {
  if (seconds === null) return "text-text-tertiary";
  if (seconds < 3) return "text-status-success";
  if (seconds < 10) return "text-status-warning";
  return "text-status-error";
}

export function GroundStationLinkCard() {
  const t = useTranslations("groundStationOverview.link");
  const health = useGroundStationStore((s) => s.linkHealth);
  const radio = useAgentCapabilitiesStore((s) => s.radio);
  const fecTotal = health.fec_rec + health.fec_lost;
  const fecRatio = fecTotal > 0 ? (health.fec_lost / fecTotal) * 100 : 0;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-secondary p-3 space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-text-tertiary">
        {t("title")}
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-tertiary">{t("rssi")}</dt>
        <dd className={`${rssiTone(health.rssi_dbm)} tabular-nums`}>
          {health.rssi_dbm !== null ? `${health.rssi_dbm} dBm` : "—"}
        </dd>

        <dt className="text-text-tertiary">{t("bitrate")}</dt>
        <dd className="text-text-primary tabular-nums">
          {health.bitrate_mbps !== null
            ? `${health.bitrate_mbps.toFixed(1)} Mbps`
            : "—"}
        </dd>

        <dt className="text-text-tertiary">{t("fecLost")}</dt>
        <dd
          className={
            fecRatio > 5
              ? "text-status-warning tabular-nums"
              : "text-text-secondary tabular-nums"
          }
        >
          {fecTotal > 0 ? `${fecRatio.toFixed(1)}%` : "—"}
        </dd>

        <dt className="text-text-tertiary">{t("channel")}</dt>
        <dd className="text-text-primary tabular-nums">
          {health.channel ?? "—"}
        </dd>
      </dl>

      {radio && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs border-t border-border-subtle pt-2">
          <dt className="text-text-tertiary">{t("snr")}</dt>
          <dd className={`${snrTone(radio.snrDb)} tabular-nums`}>
            {radio.snrDb !== null ? `${radio.snrDb.toFixed(0)} dB` : "—"}
          </dd>

          <dt className="text-text-tertiary">{t("loss")}</dt>
          <dd
            className={
              radio.lossPercent !== null && radio.lossPercent > 5
                ? "text-status-warning tabular-nums"
                : "text-text-secondary tabular-nums"
            }
          >
            {radio.lossPercent !== null
              ? `${radio.lossPercent.toFixed(1)}%`
              : "—"}
          </dd>

          <dt className="text-text-tertiary">{t("freq")}</dt>
          <dd className="text-text-primary tabular-nums">
            {radio.freqMhz !== null ? `${radio.freqMhz} MHz` : "—"}
          </dd>

          <dt className="text-text-tertiary">{t("mcs")}</dt>
          <dd className="text-text-primary tabular-nums">
            {radio.mcsIndex ?? "—"}
          </dd>

          <dt className="text-text-tertiary">{t("noise")}</dt>
          <dd className="text-text-secondary tabular-nums">
            {radio.noiseDbm !== null ? `${radio.noiseDbm} dBm` : "—"}
          </dd>

          <dt className="text-text-tertiary">{t("rxIdle")}</dt>
          <dd className={`${rxIdleTone(radio.rxSilentSeconds)} tabular-nums`}>
            {radio.rxSilentSeconds !== null
              ? `${radio.rxSilentSeconds.toFixed(1)} s`
              : "—"}
          </dd>
        </dl>
      )}
    </div>
  );
}
