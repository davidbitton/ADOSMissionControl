"use client";

/**
 * @module use-ground-station-subscriptions
 * @description Shared hook that wires both PIC and Uplink WebSocket event
 * subscriptions into the ground-station store for a given agent connection.
 *
 * Extracted from hardware/page.tsx so the GroundStationApi client is built
 * once per (agentUrl, apiKey) tuple via useMemo. The previous inline effects
 * rebuilt the client on every render, which caused short-lived duplicate
 * WebSocket subscriptions during fast re-renders.
 *
 * @license GPL-3.0-only
 */

import { useEffect, useMemo } from "react";
import {
  GroundStationApi,
  groundStationApiFromAgent,
} from "@/lib/api/ground-station-api";
import { useGroundStationStore } from "@/stores/ground-station-store";

export function useGroundStationSubscriptions(
  agentUrl: string | null,
  apiKey: string | null,
): GroundStationApi | null {
  const client = useMemo(
    () => groundStationApiFromAgent(agentUrl, apiKey),
    [agentUrl, apiKey],
  );

  const subscribePicWs = useGroundStationStore((s) => s.subscribePicWs);
  const subscribeUplinkWs = useGroundStationStore((s) => s.subscribeUplinkWs);

  useEffect(() => {
    if (!client) return;
    const unsubPic = subscribePicWs(client);
    const unsubUplink = subscribeUplinkWs(client);
    return () => {
      unsubPic();
      unsubUplink();
    };
  }, [client, subscribePicWs, subscribeUplinkWs]);

  return client;
}
