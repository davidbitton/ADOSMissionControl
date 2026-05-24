"use client";

/**
 * @module hardware/radio/RadioPanel
 * @description Hardware sub-view body for the WFB-ng radio link.
 * Composes link-health, pairing, TX power, and bench-test cards while
 * owning the polling loops and the pair-flow callbacks.
 * @license GPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Radio as RadioIcon } from "lucide-react";
import { useGroundStationStore } from "@/stores/ground-station-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { groundStationApiFromAgent } from "@/lib/api/ground-station-api";
import { useToast } from "@/components/ui/toast";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import { cmdDroneStatusApi } from "@/lib/community-api-drones";
import {
  fetchPairStatus,
  setAutoPairOnRig,
  startLocalBind,
  unpairRig,
} from "@/lib/api/radio-pairing";
import type {
  LocalBindSession,
  PairStatusResponse,
  RadioLinkState,
  RadioTopology,
  SetTxPowerResult,
} from "@/lib/api/ground-station/types";
import {
  BROWNOUT_TX_FLOOR_DBM,
  DEFAULT_TX_MAX_DBM,
  PAIR_POLL_INTERVAL_MS,
  POLL_INTERVAL_MS,
} from "./constants";
import { pickRadioFromCloud } from "./cloud-radio";
import { LinkHealthCard } from "./LinkHealthCard";
import { PairingCard } from "./PairingCard";
import { TxPowerCard } from "./TxPowerCard";
import { BenchTestCard } from "./BenchTestCard";

export function RadioPanel() {
  const t = useTranslations("hardware.radio");

  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);
  const hasAgent = Boolean(agentUrl);

  const linkHealth = useGroundStationStore((s) => s.linkHealth);
  const loadStatus = useGroundStationStore((s) => s.loadStatus);

  const [wfbTxPowerDbm, setWfbTxPowerDbm] = useState<number | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pairStatus, setPairStatus] = useState<PairStatusResponse | null>(null);
  const [bindSession, setBindSession] = useState<LocalBindSession | null>(null);
  const [bindBusy, setBindBusy] = useState(false);
  const [unpairBusy, setUnpairBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);

  const wfbFailoverState = useAgentCapabilitiesStore(
    (s) => s.wfbFailoverState,
  );

  const { toast } = useToast();

  const cloudStatuses = useConvexSkipQuery(cmdDroneStatusApi.listMyCloudStatuses, {
    enabled: hasAgent,
  });
  const { radio: cloudRadio, hostname } = useMemo(
    () => pickRadioFromCloud(cloudStatuses),
    [cloudStatuses],
  );

  // Effective values: prefer the cloud `radio` block (authoritative
  // air-side snapshot), fall back to local link_health and the WFB
  // config endpoint.
  const linkState: RadioLinkState = cloudRadio?.state
    ? (cloudRadio.state as RadioLinkState)
    : linkHealth.rssi_dbm != null
      ? "connected"
      : "disconnected";
  const topology: RadioTopology = cloudRadio?.topology
    ? (cloudRadio.topology as RadioTopology)
    : "host_vbus";
  const rssiDbm = cloudRadio?.rssiDbm ?? linkHealth.rssi_dbm;
  const bitrateKbps = cloudRadio?.bitrateKbps;
  const bitrateMbps =
    bitrateKbps != null
      ? bitrateKbps / 1000
      : linkHealth.bitrate_mbps;
  const channel = cloudRadio?.channel ?? linkHealth.channel;
  const freqMhz = cloudRadio?.freqMhz ?? null;
  const bandwidthMhz = cloudRadio?.bandwidthMhz ?? null;
  const fecRecovered = cloudRadio?.fecRecovered ?? linkHealth.fec_rec;
  const fecLost = cloudRadio?.fecLost ?? linkHealth.fec_lost;
  const driver = cloudRadio?.driver ?? null;
  const iface = cloudRadio?.iface ?? null;
  const snrDb = cloudRadio?.snrDb ?? null;
  const noiseDbm = cloudRadio?.noiseDbm ?? null;
  const lossPercent = cloudRadio?.lossPercent ?? null;
  const mcsIndex = cloudRadio?.mcsIndex ?? null;
  const rxSilentSeconds = cloudRadio?.rxSilentSeconds ?? null;
  const txPowerDbm = cloudRadio?.txPowerDbm ?? wfbTxPowerDbm;
  const txPowerMaxDbm = cloudRadio?.txPowerMaxDbm ?? DEFAULT_TX_MAX_DBM;

  // Brownout: VBUS topology + above 12 dBm. Agent firmware caps the
  // slider in hardware; this is just an informational pill.
  const showBrownoutWarning =
    topology === "host_vbus" &&
    txPowerDbm != null &&
    txPowerDbm > BROWNOUT_TX_FLOOR_DBM;

  useEffect(() => {
    const api = groundStationApiFromAgent(agentUrl, apiKey);
    if (!api) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || (typeof document !== "undefined" && document.hidden)) return;
      try {
        const status = await api.getStatus();
        if (cancelled) return;
        loadStatus(
          {
            paired_drone: status.paired_drone ?? null,
            profile: status.profile ?? "unconfigured",
            uplink_active: status.uplink_active ?? null,
          },
          status.link_health,
        );
        try {
          const wfb = await api.getWfb();
          if (cancelled) return;
          setWfbTxPowerDbm(
            typeof wfb.tx_power_dbm === "number" ? wfb.tx_power_dbm : null,
          );
        } catch {
          // WFB endpoint missing on this agent profile is fine.
        }
        setPollError(null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "poll failed";
        setPollError(msg);
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [agentUrl, apiKey, loadStatus]);

  // Pair-state poller. Cheap (single GET against /api/wfb/pair); the
  // 2 Hz cadence is fine and matches the link-health poll above.
  useEffect(() => {
    if (!agentUrl) return;
    const ctx = { baseUrl: agentUrl, apiKey };
    let cancelled = false;
    const poll = async () => {
      if (cancelled || (typeof document !== "undefined" && document.hidden)) return;
      try {
        const status = await fetchPairStatus(ctx);
        if (!cancelled) setPairStatus(status);
      } catch {
        // Older agents lack the /api/wfb/pair endpoint; treat as
        // "unpaired, not auto-pairing" without spamming a toast.
        if (!cancelled) setPairStatus(null);
      }
    };
    void poll();
    const timer = setInterval(poll, PAIR_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [agentUrl, apiKey]);

  // Local-bind action. Synchronous: the agent runs the upstream
  // protocol to completion (≤60s) and returns the terminal session.
  const handleOpenLocalBind = useCallback(async () => {
    if (bindBusy) return;
    if (!agentUrl) return;
    setBindBusy(true);
    setBindSession({
      session_id: "pending",
      role: "gs",
      state: "opening_tunnel",
      started_at: new Date().toISOString(),
      finished_at: null,
      error: null,
      fingerprint: null,
      peer_device_id: null,
      source: "operator",
    });
    toast(t("pairing.progressOpening"), "info");
    try {
      const session = await startLocalBind({ baseUrl: agentUrl, apiKey }, {});
      setBindSession(session);
      if (session.state === "paired") {
        toast(t("pairing.progressDone"), "success");
        // Force a fresh pair-status read so the UI flips immediately.
        try {
          const status = await fetchPairStatus({ baseUrl: agentUrl, apiKey });
          setPairStatus(status);
        } catch {
          /* swallow */
        }
      } else {
        toast(
          t("pairing.errorAgentError", {
            message: session.error ?? session.state,
          }),
          "error",
        );
      }
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : String(exc);
      setBindSession((prev) =>
        prev ? { ...prev, state: "failed", error: msg } : null,
      );
      toast(t("pairing.errorAgentError", { message: msg }), "error");
    } finally {
      setBindBusy(false);
    }
  }, [agentUrl, apiKey, bindBusy, toast, t]);

  const handleUnpair = useCallback(async () => {
    if (unpairBusy) return;
    if (!agentUrl) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(t("pairing.confirmUnpairBody"));
      if (!confirmed) return;
    }
    setUnpairBusy(true);
    try {
      await unpairRig({ baseUrl: agentUrl, apiKey });
      toast(t("pairing.statusUnpaired"), "info");
      try {
        const status = await fetchPairStatus({ baseUrl: agentUrl, apiKey });
        setPairStatus(status);
      } catch {
        /* swallow */
      }
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : String(exc);
      toast(t("pairing.errorAgentError", { message: msg }), "error");
    } finally {
      setUnpairBusy(false);
    }
  }, [agentUrl, apiKey, unpairBusy, toast, t]);

  // Re-arm the auto-pair supervisor on the rig when the heartbeat
  // says the local link has failed over to the cloud relay path. The
  // supervisor turns on local pairing again, and the next heartbeat
  // tick should clear the cloud_relay state.
  const handleRetryLocal = useCallback(async () => {
    if (retryBusy) return;
    if (!agentUrl) return;
    setRetryBusy(true);
    try {
      await setAutoPairOnRig({ baseUrl: agentUrl, apiKey }, true);
      toast(t("pairing.failover.retrySuccess"), "success");
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : String(exc);
      toast(t("pairing.errorAgentError", { message: msg }), "error");
    } finally {
      setRetryBusy(false);
    }
  }, [agentUrl, apiKey, retryBusy, toast, t]);

  if (!hasAgent) {
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

  const onApply = async (dbm: number): Promise<SetTxPowerResult> => {
    const api = groundStationApiFromAgent(agentUrl, apiKey);
    if (!api) {
      throw new Error("agent not connected");
    }
    return api.setTxPower(dbm);
  };

  return (
    <div className="flex flex-col gap-4">
      <LinkHealthCard
        topology={topology}
        linkState={linkState}
        showBrownoutWarning={showBrownoutWarning}
        pollError={pollError}
        rssiDbm={rssiDbm}
        bitrateMbps={bitrateMbps}
        channel={channel}
        freqMhz={freqMhz}
        bandwidthMhz={bandwidthMhz}
        fecRecovered={fecRecovered}
        fecLost={fecLost}
        driver={driver}
        iface={iface}
        snrDb={snrDb}
        noiseDbm={noiseDbm}
        lossPercent={lossPercent}
        mcsIndex={mcsIndex}
        rxSilentSeconds={rxSilentSeconds}
      />

      <PairingCard
        pairStatus={pairStatus}
        bindSession={bindSession}
        bindBusy={bindBusy}
        unpairBusy={unpairBusy}
        onOpenLocalBind={handleOpenLocalBind}
        onUnpair={handleUnpair}
        wfbFailoverState={wfbFailoverState}
        onRetryLocal={handleRetryLocal}
        retryBusy={retryBusy}
      />

      <TxPowerCard
        txPowerDbm={txPowerDbm}
        txPowerMaxDbm={txPowerMaxDbm}
        hostname={hostname}
        onApply={onApply}
      />

      <BenchTestCard />
    </div>
  );
}
