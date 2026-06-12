/**
 * Smoke tests for the uplink slice of the ground-station store. Asserts
 * the initial-state defaults for wifiScan, modem, uplink, and ethernet
 * config and verifies a couple of resetAll pathways. Async uplink flows
 * that require an api client (scan, join, leave) are out of scope.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect, beforeEach } from "vitest";

import { useGroundStationStore } from "@/stores/ground-station-store";

describe("ground-station uplink slice", () => {
  beforeEach(() => {
    useGroundStationStore.getState().resetAll();
  });

  it("has correct initial state", () => {
    const s = useGroundStationStore.getState();
    expect(s.modem).toBeNull();
    expect(s.ethernetConfig).toBeNull();
    expect(s.wifiScan).toEqual({
      results: [],
      scanning: false,
      scannedAt: null,
      error: null,
    });
    expect(s.uplink).toEqual({
      active: null,
      priority: [],
      health: "ok",
      failover_log: [],
      data_cap: null,
      cloud_relay: null,
      loading: false,
      error: null,
    });
  });

  it("resetAll clears scan results back to empty", () => {
    useGroundStationStore.setState({
      wifiScan: {
        results: [{ ssid: "test", signal: -50 } as never],
        scanning: false,
        scannedAt: 1700000000,
        error: null,
      },
    });
    useGroundStationStore.getState().resetAll();
    expect(useGroundStationStore.getState().wifiScan.results).toEqual([]);
    expect(useGroundStationStore.getState().wifiScan.scannedAt).toBeNull();
  });

  it("resetAll restores uplink priority to its empty default", () => {
    useGroundStationStore.setState({
      uplink: {
        active: "wifi",
        priority: ["wifi", "ethernet", "modem"],
        health: "degraded",
        failover_log: [],
        data_cap: null,
        cloud_relay: null,
        loading: false,
        error: null,
      },
    });
    useGroundStationStore.getState().resetAll();
    expect(useGroundStationStore.getState().uplink.active).toBeNull();
    expect(useGroundStationStore.getState().uplink.priority).toEqual([]);
    expect(useGroundStationStore.getState().uplink.health).toBe("ok");
  });
});
