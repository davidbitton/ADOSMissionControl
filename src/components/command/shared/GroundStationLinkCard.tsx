"use client";

/**
 * @module GroundStationLinkCard
 * @description Compact RX-link health card for the GroundStationOverview.
 * Surfaces RSSI, bitrate, FEC ratio, and channel for the WFB-ng radio.
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import { useGroundStationStore } from "@/stores/ground-station-store";

function rssiTone(dbm: number | null): string {
  if (dbm === null) return "text-text-tertiary";
  if (dbm > -65) return "text-status-success";
  if (dbm > -78) return "text-status-warning";
  return "text-status-error";
}

export function GroundStationLinkCard() {
  const t = useTranslations("groundStationOverview.link");
  const health = useGroundStationStore((s) => s.linkHealth);
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
    </div>
  );
}
