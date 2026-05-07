/**
 * @module cmdDroneStatus
 * @description Convex functions for drone cloud status relay.
 * Agent pushes full system status via HTTP action. GCS reads via reactive query.
 * @license GPL-3.0-only
 */

import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireOwnedDroneByDeviceId } from "./cmdDroneAccess";

/**
 * Push status from agent (called via HTTP action, no auth — validated by API key match).
 * Upserts by deviceId.
 */
export const pushStatus = internalMutation({
  args: {
    deviceId: v.string(),
    version: v.string(),
    uptimeSeconds: v.number(),
    boardName: v.optional(v.string()),
    boardTier: v.optional(v.number()),
    boardSoc: v.optional(v.string()),
    boardArch: v.optional(v.string()),
    cpuPercent: v.optional(v.number()),
    memoryPercent: v.optional(v.number()),
    diskPercent: v.optional(v.number()),
    temperature: v.optional(v.float64()),
    fcConnected: v.optional(v.boolean()),
    fcPort: v.optional(v.string()),
    fcBaud: v.optional(v.number()),
    // Absolute resource values
    memoryUsedMb: v.optional(v.number()),
    memoryTotalMb: v.optional(v.number()),
    diskUsedGb: v.optional(v.number()),
    diskTotalGb: v.optional(v.number()),
    cpuCores: v.optional(v.number()),
    boardRamMb: v.optional(v.number()),
    // Process-level totals
    processCpuPercent: v.optional(v.number()),
    processMemoryMb: v.optional(v.number()),
    // History arrays for sparkline charts
    cpuHistory: v.optional(v.array(v.number())),
    memoryHistory: v.optional(v.array(v.number())),
    services: v.optional(v.array(v.object({
      name: v.string(),
      status: v.string(),
      cpuPercent: v.optional(v.number()),
      memoryMb: v.optional(v.number()),
      uptimeSeconds: v.optional(v.number()),
      pid: v.optional(v.number()),
      category: v.optional(v.string()),
    }))),
    lastIp: v.optional(v.string()),
    mdnsHost: v.optional(v.string()),
    setupUrl: v.optional(v.string()),
    apiUrl: v.optional(v.string()),
    missionControlUrl: v.optional(v.string()),
    // Video pipeline status for GCS auto-discovery
    videoState: v.optional(v.string()),
    videoWhepPort: v.optional(v.number()),
    videoWhepUrl: v.optional(v.string()),
    mavlinkWsPort: v.optional(v.number()),
    mavlinkWsUrl: v.optional(v.string()),
    remoteAccess: v.optional(v.any()),
    peripherals: v.optional(v.any()),
    scripts: v.optional(v.any()),
    suites: v.optional(v.any()),
    enrollment: v.optional(v.any()),
    peers: v.optional(v.any()),
    telemetry: v.optional(v.any()),
    logs: v.optional(v.any()),
    runtimeMode: v.optional(v.string()),
    setupState: v.optional(v.string()),
    profileSource: v.optional(v.string()),
    radio: v.optional(v.object({
      state: v.string(),
      iface: v.union(v.string(), v.null()),
      driver: v.union(v.string(), v.null()),
      channel: v.union(v.number(), v.null()),
      freqMhz: v.union(v.number(), v.null()),
      bandwidthMhz: v.number(),
      txPowerDbm: v.union(v.number(), v.null()),
      txPowerMaxDbm: v.number(),
      topology: v.string(),
      rssiDbm: v.union(v.number(), v.null()),
      bitrateKbps: v.union(v.number(), v.null()),
      fecRecovered: v.number(),
      fecLost: v.number(),
      packetsLost: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cmd_droneStatus")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("cmd_droneStatus", { ...args, updatedAt: now });
    }

    // Derive attached display type from peripherals[] for the
    // fleet card pill. The agent reports the SPI LCD as a peripheral
    // entry with category="display"; we cherry-pick the type so the
    // drone card can render an "LCD" badge without re-querying the
    // full status row.
    let attachedDisplayType: string | undefined;
    if (Array.isArray(args.peripherals)) {
      const display = (args.peripherals as Array<Record<string, unknown>>).find(
        (p) => p && (p as { category?: unknown }).category === "display",
      );
      if (display && typeof display.type === "string") {
        attachedDisplayType = display.type;
      }
    }

    // Also update the cmd_drones table lastSeen, fcConnected, lastIp
    const drone = await ctx.db
      .query("cmd_drones")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .first();
    if (drone) {
      await ctx.db.patch(drone._id, {
        lastSeen: now,
        fcConnected: args.fcConnected,
        lastIp: args.lastIp,
        mdnsHost: args.mdnsHost,
        ...(args.runtimeMode !== undefined ? { runtimeMode: args.runtimeMode } : {}),
        ...(attachedDisplayType !== undefined
          ? { attachedDisplayType }
          : {}),
        ...(args.profileSource !== undefined
          ? { profileSource: args.profileSource }
          : {}),
      });
    }

    return { ok: true };
  },
});

/**
 * Get cloud status for a specific drone.
 */
export const getCloudStatus = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    await requireOwnedDroneByDeviceId(ctx, deviceId);
    return await ctx.db
      .query("cmd_droneStatus")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .first();
  },
});

/**
 * List display-safe cloud status rows for every drone paired to the
 * authenticated user. Pair keys are intentionally not returned.
 */
export const listMyCloudStatuses = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const drones = await ctx.db
      .query("cmd_drones")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    return await Promise.all(
      drones.map(async (drone) => {
        const status = await ctx.db
          .query("cmd_droneStatus")
          .withIndex("by_deviceId", (q) => q.eq("deviceId", drone.deviceId))
          .first();

        return {
          drone: {
            _id: drone._id,
            userId: drone.userId,
            deviceId: drone.deviceId,
            name: drone.name,
            agentVersion: drone.agentVersion,
            board: drone.board,
            tier: drone.tier,
            os: drone.os,
            mdnsHost: drone.mdnsHost,
            lastIp: drone.lastIp,
            lastSeen: drone.lastSeen,
            fcConnected: drone.fcConnected,
            pairedAt: drone.pairedAt,
          },
          status,
        };
      }),
    );
  },
});
