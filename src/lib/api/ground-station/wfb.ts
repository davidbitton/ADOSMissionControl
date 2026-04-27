// WFB-ng radio config plus distributed receive (relay and receiver) status.

import type { WfbConfig } from "@/stores/ground-station-store";
import type {
  PairResult,
  UnpairResult,
  WfbReceiverCombined,
  WfbReceiverRelay,
  WfbRelayStatus,
} from "./types";
import { gsRequest, type RequestContext } from "./request";

export function getWfb(ctx: RequestContext): Promise<WfbConfig> {
  return gsRequest<WfbConfig>(ctx, "/api/v1/ground-station/wfb");
}

export function setWfb(ctx: RequestContext, partial: Partial<WfbConfig>): Promise<WfbConfig> {
  return gsRequest<WfbConfig>(ctx, "/api/v1/ground-station/wfb", {
    method: "PUT",
    body: JSON.stringify(partial),
  });
}

export function pairDrone(
  ctx: RequestContext,
  pairKey: string,
  droneId?: string,
): Promise<PairResult> {
  const body: Record<string, string> = { pair_key: pairKey };
  if (droneId) body.drone_device_id = droneId;
  return gsRequest<PairResult>(ctx, "/api/v1/ground-station/wfb/pair", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function unpairDrone(ctx: RequestContext): Promise<UnpairResult> {
  return gsRequest<UnpairResult>(ctx, "/api/v1/ground-station/wfb/pair", {
    method: "DELETE",
  });
}

/** Relay-side WFB fragment counters plus receiver reachability. */
export function getWfbRelayStatus(ctx: RequestContext): Promise<WfbRelayStatus> {
  return gsRequest<WfbRelayStatus>(ctx, "/api/v1/ground-station/wfb/relay/status");
}

/** Per-relay fragment counters on the receiver. */
export function getWfbReceiverRelays(
  ctx: RequestContext,
): Promise<{ relays: WfbReceiverRelay[] }> {
  return gsRequest(ctx, "/api/v1/ground-station/wfb/receiver/relays");
}

/** Combined FEC output stats on the receiver. */
export function getWfbReceiverCombined(ctx: RequestContext): Promise<WfbReceiverCombined> {
  return gsRequest<WfbReceiverCombined>(ctx, "/api/v1/ground-station/wfb/receiver/combined");
}
