/**
 * @module api/ground-station/types/radio
 * @description Radio link snapshot, normalized to camelCase. The agent
 * emits the equivalent block as snake_case on the wire; the cloud relay
 * HTTP action and the local heartbeat decoder remap keys before this
 * shape reaches Mission Control state.
 *
 * @license GPL-3.0-only
 */

export type RadioLinkState =
  | "absent"
  | "disconnected"
  | "unpaired"
  | "auto_pairing"
  | "binding"
  | "connecting"
  | "connected"
  | "degraded";

export type RadioTopology = "host_vbus" | "powered_hub" | "external_5v";

export interface RadioState {
  state: RadioLinkState;
  iface: string | null;
  driver: string | null;
  channel: number | null;
  freqMhz: number | null;
  bandwidthMhz: number;
  txPowerDbm: number | null;
  txPowerMaxDbm: number;
  topology: RadioTopology;
  rssiDbm: number | null;
  bitrateKbps: number | null;
  fecRecovered: number;
  fecLost: number;
  packetsLost: number;
  // Receive-side link quality. Forwarded by newer agents on both the
  // transmit and receive sides; on a ground station these describe the
  // downlink it decodes. Null on older agents (the normalizer defaults
  // missing/non-finite values to null).
  snrDb: number | null;
  noiseDbm: number | null;
  lossPercent: number | null;
  mcsIndex: number | null;
  rxSilentSeconds: number | null;
  // Pair-state surface added in agent v0.16. Older agents omit
  // these fields; the normalizer falls back to safe defaults so
  // older heartbeats render as "unpaired" without crashes.
  paired: boolean;
  pairedWithDeviceId: string | null;
  pairedAt: string | null;
  publicKeyFingerprint: string | null;
  autoPairEnabled: boolean;
}

/** Response shape from PUT /api/wfb/tx-power. */
export interface SetTxPowerResult {
  requested_dbm: number;
  effective_dbm: number | null;
  tx_power_max_dbm: number;
}
