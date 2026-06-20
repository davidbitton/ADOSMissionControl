/**
 * @license GPL-3.0-only
 *
 * Tests for the pure node-registry → FleetDrone projection. Covers the four
 * behaviors the cutover depends on: one physical node yields one row (dedupe),
 * an FC-less node hides arm/mode/battery (no fabricated telemetry), liveness is
 * the freshest of presence / FC / cloud-status, and a cloud presence tick never
 * overwrites live FC flight state.
 */

import { describe, it, expect } from "vitest";

import {
  selectFleetDrones,
  nodeEntryToFleetDrone,
} from "../node-registry/select-fleet-drones";
import type { NodeEntry } from "../node-registry/types";
import type { CommandCloudStatus } from "../command-fleet-store";
import { STALE_THRESHOLD_MS, OFFLINE_THRESHOLD_MS } from "@/lib/agent/freshness";

const NOW = 1_000_000_000_000;

function entry(over: Partial<NodeEntry> = {}): NodeEntry {
  return {
    nodeId: "node:dev",
    presence: {
      deviceId: "dev",
      name: "Skynode",
      profile: "drone",
      sources: ["local"],
      lastHeartbeat: NOW,
      ...over.presence,
    },
    connection: { fcConnected: false, ...over.connection },
    fc: { managedId: null, ...over.fc },
    ...over,
  };
}

describe("nodeEntryToFleetDrone — FC gating (no fabricated telemetry)", () => {
  it("hides arm/mode/battery/gps/position when no FC is attached", () => {
    const row = nodeEntryToFleetDrone(entry(), undefined, NOW);
    expect(row.fcAttached).toBe(false);
    expect(row.battery).toBeUndefined();
    expect(row.gps).toBeUndefined();
    expect(row.position).toBeUndefined();
    // armState defaults to disarmed but the card hides it via fcAttached.
    expect(row.armState).toBe("disarmed");
    expect(row.status).toBe("online");
  });

  it("surfaces real FC telemetry when an FC is attached", () => {
    const row = nodeEntryToFleetDrone(
      entry({
        fc: {
          managedId: "node:dev",
          armState: "armed",
          flightMode: "LOITER",
          status: "in_mission",
          lastHeartbeat: NOW,
          battery: {
            timestamp: NOW,
            voltage: 16,
            current: 12,
            remaining: 73,
            consumed: 100,
          },
        },
      }),
      undefined,
      NOW,
    );
    expect(row.fcAttached).toBe(true);
    expect(row.armState).toBe("armed");
    expect(row.flightMode).toBe("LOITER");
    expect(row.status).toBe("in_mission");
    expect(row.battery?.remaining).toBe(73);
  });
});

describe("nodeEntryToFleetDrone — liveness", () => {
  it("is online when the freshest of presence / fc / cloud is within stale window", () => {
    // Stale presence, but a fresh cloud status keeps it online.
    const row = nodeEntryToFleetDrone(
      entry({ presence: { ...entry().presence, lastHeartbeat: NOW - OFFLINE_THRESHOLD_MS } }),
      { deviceId: "dev", updatedAt: NOW } as CommandCloudStatus,
      NOW,
    );
    expect(row.status).toBe("online");
  });

  it("is offline only when every source is past the offline threshold", () => {
    const old = NOW - OFFLINE_THRESHOLD_MS - 1;
    const row = nodeEntryToFleetDrone(
      entry({ presence: { ...entry().presence, lastHeartbeat: old } }),
      undefined,
      NOW,
    );
    expect(row.status).toBe("offline");
  });

  it("a fresh FC heartbeat keeps an otherwise-stale presence online", () => {
    const row = nodeEntryToFleetDrone(
      entry({
        presence: { ...entry().presence, lastHeartbeat: NOW - STALE_THRESHOLD_MS - 5000 },
        fc: { managedId: "node:dev", lastHeartbeat: NOW },
      }),
      undefined,
      NOW,
    );
    expect(row.status).not.toBe("offline");
  });
});

describe("selectFleetDrones — dedupe + cloud merge", () => {
  it("projects one row per node (both transports already collapsed)", () => {
    const nodes: Record<string, NodeEntry> = {
      "node:a": entry({
        nodeId: "node:a",
        presence: {
          deviceId: "a",
          name: "A",
          profile: "drone",
          sources: ["local", "cloud"],
          lastHeartbeat: NOW,
        },
      }),
    };
    const rows = selectFleetDrones({ nodes, cloudStatuses: {}, now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("node:a");
    // Seen on cloud → source reads "cloud".
    expect(rows[0].source).toBe("cloud");
  });

  it("merges cloud-only display pills by deviceId without touching FC state", () => {
    const nodes: Record<string, NodeEntry> = {
      "node:b": entry({
        nodeId: "node:b",
        presence: { deviceId: "b", name: "B", profile: "drone", sources: ["local"], lastHeartbeat: NOW },
        fc: {
          managedId: "node:b",
          armState: "armed",
          flightMode: "AUTO",
          lastHeartbeat: NOW,
        },
      }),
    };
    const cloudStatuses: Record<string, CommandCloudStatus> = {
      b: {
        deviceId: "b",
        videoPipelineFlavor: "gst-native",
        navigationMode: "vio",
        updatedAt: NOW,
      },
    };
    const rows = selectFleetDrones({ nodes, cloudStatuses, now: NOW });
    // Pills merged in...
    expect(rows[0].videoPipelineFlavor).toBe("gst-native");
    expect(rows[0].navigationMode).toBe("vio");
    // ...while the live FC flight state is untouched (the cloud row carried no
    // arm/mode, so a cloud tick can never overwrite it).
    expect(rows[0].armState).toBe("armed");
    expect(rows[0].flightMode).toBe("AUTO");
  });
});
