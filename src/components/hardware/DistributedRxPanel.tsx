"use client";

/**
 * @module DistributedRxPanel
 * @description Role-aware container for the Distributed RX page. On
 * receiver nodes it renders the relay list, combined stream stats, and
 * pairing window. On relay nodes it renders the relay forwarder status.
 * On direct nodes it renders an empty-state prompt.
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import { useGroundStationStore } from "@/stores/ground-station-store";
import { RelayCard } from "./RelayCard";
import { ReceiverCard } from "./ReceiverCard";
import { PairingStatusCard } from "./PairingStatusCard";
import { CombinedStreamStats } from "./CombinedStreamStats";

export function DistributedRxPanel() {
  const t = useTranslations("hardware.distributedRx");
  const role = useGroundStationStore((s) => s.role.info?.current ?? "direct");
  const distRx = useGroundStationStore((s) => s.distributedRx);

  if (role === "direct") {
    return (
      <div className="p-6 text-center text-text-secondary">
        {t("emptyDirect")}
      </div>
    );
  }

  if (role === "unset") {
    return (
      <div className="p-6 text-center text-text-secondary">
        {t("emptyUnset")}
      </div>
    );
  }

  if (role === "relay") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-text-primary">{t("titleRelay")}</h2>
        <ReceiverCard />
        {distRx.error ? (
          <div className="text-sm text-status-error">{distRx.error}</div>
        ) : null}
      </div>
    );
  }

  // receiver
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">{t("titleReceiver")}</h2>
      <PairingStatusCard />
      <CombinedStreamStats />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">
          {t("relays")} ({distRx.receiverRelays.length})
        </h3>
        {distRx.receiverRelays.length === 0 ? (
          <div className="text-sm text-text-tertiary italic">{t("noRelays")}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {distRx.receiverRelays.map((relay) => (
              <RelayCard key={relay.mac} relay={relay} />
            ))}
          </div>
        )}
      </div>
      {distRx.error ? (
        <div className="text-sm text-status-error">{distRx.error}</div>
      ) : null}
    </div>
  );
}
