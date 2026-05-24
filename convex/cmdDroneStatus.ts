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
    videoRestartAttempts: v.optional(v.number()),
    // Air-side in-process GStreamer pipeline identity. Absent when the
    // agent is on the legacy bash air pipeline.
    videoPipelineFlavor: v.optional(v.string()),
    videoEncoderName: v.optional(v.string()),
    videoEncoderHwAccel: v.optional(v.boolean()),
    videoCameraSource: v.optional(v.string()),
    videoPipelineState: v.optional(v.string()),
    mavlinkWsPort: v.optional(v.number()),
    mavlinkWsUrl: v.optional(v.string()),
    mavlinkWsUrlPrev: v.optional(v.string()),
    manualConnectionUrls: v.optional(
      v.object({
        mavlinkTcp: v.optional(v.union(v.string(), v.null())),
        mavlinkWs: v.optional(v.union(v.string(), v.null())),
        videoViewer: v.optional(v.union(v.string(), v.null())),
        videoWhep: v.optional(v.union(v.string(), v.null())),
      }),
    ),
    cloudRelayUrl: v.optional(v.union(v.string(), v.null())),
    cloudflareUrl: v.optional(v.union(v.string(), v.null())),
    cloudPosture: v.optional(v.string()),
    pluginInventory: v.optional(
      v.array(
        v.object({
          plugin_id: v.string(),
          version: v.optional(v.union(v.string(), v.null())),
          status: v.optional(v.union(v.string(), v.null())),
        }),
      ),
    ),
    peripheralStates: v.optional(
      v.array(
        v.object({
          id: v.string(),
          connected: v.boolean(),
          last_seen: v.optional(v.union(v.number(), v.null())),
        }),
      ),
    ),
    remoteAccess: v.optional(v.any()),
    peripherals: v.optional(v.any()),
    scripts: v.optional(v.any()),
    // Tombstone — see schema.ts cmd_droneStatus comment.
    suites: v.optional(v.any()),
    enrollment: v.optional(v.any()),
    peers: v.optional(v.any()),
    telemetry: v.optional(v.any()),
    logs: v.optional(v.any()),
    runtimeMode: v.optional(v.string()),
    // Wire-contract identity for the Command-tab node hub. "profile"
    // is "drone" or "ground-station"; "role" is "direct" | "relay" |
    // "receiver" on a ground station, null on a drone. Older agents
    // that don't emit these fields default the GCS to "drone".
    profile: v.optional(v.string()),
    role: v.optional(v.string()),
    foxgloveBindFailed: v.optional(v.boolean()),
    wfbFailoverState: v.optional(v.string()),
    setupState: v.optional(v.string()),
    profileSource: v.optional(v.string()),
    radio: v.optional(v.object({
      state: v.string(),
      iface: v.union(v.string(), v.null()),
      driver: v.union(v.string(), v.null()),
      channel: v.union(v.number(), v.null()),
      freqMhz: v.union(v.number(), v.null()),
      bandwidthMhz: v.union(v.number(), v.null()),
      txPowerDbm: v.union(v.number(), v.null()),
      txPowerMaxDbm: v.union(v.number(), v.null()),
      topology: v.union(v.string(), v.null()),
      rssiDbm: v.union(v.number(), v.null()),
      bitrateKbps: v.union(v.number(), v.null()),
      fecRecovered: v.union(v.number(), v.null()),
      fecLost: v.union(v.number(), v.null()),
      packetsLost: v.union(v.number(), v.null()),
      snrDb: v.optional(v.union(v.number(), v.null())),
      noiseDbm: v.optional(v.union(v.number(), v.null())),
      lossPercent: v.optional(v.union(v.number(), v.null())),
      mcsIndex: v.optional(v.union(v.number(), v.null())),
      rxSilentSeconds: v.optional(v.union(v.number(), v.null())),
      paired: v.optional(v.boolean()),
      pairedWithDeviceId: v.optional(v.union(v.string(), v.null())),
      pairedAt: v.optional(v.union(v.string(), v.null())),
      publicKeyFingerprint: v.optional(v.union(v.string(), v.null())),
      autoPairEnabled: v.optional(v.union(v.boolean(), v.null())),
    })),
    // Local SPI LCD surface state (matches schema.ts cmd_droneStatus).
    lcdActivePage: v.optional(v.string()),
    lcdTouchCalibrated: v.optional(v.boolean()),
    lcdRotation: v.optional(v.number()),
    lcdSnapshotUrl: v.optional(v.string()),
    lcdLastTouchAt: v.optional(v.number()),
    lcdLastGesture: v.optional(v.string()),
    // Local on-board video surface (LCD video page tap + recording).
    videoLocalDecoderActive: v.optional(v.boolean()),
    videoLocalDecoderType: v.optional(v.string()),
    videoLocalDecoderFps: v.optional(v.number()),
    videoRecording: v.optional(v.boolean()),
    // Operator-selected UI theme on the agent.
    uiTheme: v.optional(v.string()),
    // Effective primary local-display path resolved each heartbeat
    // ("hdmi" | "lcd" | "none"). Reflects the ground_station.display.type
    // config when explicit; resolved by HDMI / LCD probe when "auto".
    displayType: v.optional(v.string()),
    // Epoch ms of the last plugin-update registry sweep on the agent.
    last_plugin_update_check_at: v.optional(v.number()),
    // Inter-rig peer presence — sourced from the agent's HopListener
    // peer cache (WFB-radio PresenceBeacon stream). Drone heartbeats
    // carry the GS's identity; GS heartbeats carry the drone's.
    peerDeviceId: v.optional(v.union(v.string(), v.null())),
    peerRole: v.optional(v.union(v.string(), v.null())),
    peerChannel: v.optional(v.union(v.number(), v.null())),
    peerRssiDbm: v.optional(v.union(v.number(), v.null())),
    peerSeenAtUnix: v.optional(v.union(v.number(), v.null())),
    // Primary camera discovery state — "ready" | "missing" | "error".
    cameraState: v.optional(v.union(v.string(), v.null())),
    // FC CAN bus configuration harvested from the persisted parameter
    // cache. The agent emits an array of {port, driver, bitrate,
    // protocol} entries once the cache holds at least one CAN_P*_*
    // value. Absent during the warmup window between FC connect and
    // the first parameter download finishing. Forwarded straight to
    // the cloud row so the GCS can render the per-port configuration
    // on the drone card without re-querying the FC.
    canBuses: v.optional(v.array(v.object({
      port: v.number(),
      driver: v.number(),
      bitrate: v.number(),
      protocol: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cmd_droneStatus")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .first();

    const now = Date.now();

    // Local display + theme fields are forwarded through the same args
    // spread, but pinned here explicitly so a future refactor that
    // narrows the spread cannot silently drop the LCD/theme surface.
    const localSurfaceFields = {
      lcdActivePage: args.lcdActivePage,
      lcdTouchCalibrated: args.lcdTouchCalibrated,
      lcdRotation: args.lcdRotation,
      lcdSnapshotUrl: args.lcdSnapshotUrl,
      lcdLastTouchAt: args.lcdLastTouchAt,
      lcdLastGesture: args.lcdLastGesture,
      videoLocalDecoderActive: args.videoLocalDecoderActive,
      videoLocalDecoderType: args.videoLocalDecoderType,
      videoLocalDecoderFps: args.videoLocalDecoderFps,
      videoRecording: args.videoRecording,
      uiTheme: args.uiTheme,
      displayType: args.displayType,
      last_plugin_update_check_at: args.last_plugin_update_check_at,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        ...localSurfaceFields,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("cmd_droneStatus", {
        ...args,
        ...localSurfaceFields,
        updatedAt: now,
      });
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

    // Direct LAN MAVLink URL denormalized onto cmd_drones so the
    // fleet card can render a "Direct" pill without joining
    // cmd_droneStatus on every render.
    let manualMavlinkWsUrl: string | undefined;
    if (args.manualConnectionUrls && typeof args.manualConnectionUrls === "object") {
      const ws = (args.manualConnectionUrls as { mavlinkWs?: unknown }).mavlinkWs;
      if (typeof ws === "string" && ws.length > 0) {
        manualMavlinkWsUrl = ws;
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
        ...(args.profile !== undefined ? { profile: args.profile } : {}),
        ...(args.role !== undefined ? { role: args.role } : {}),
        ...(manualMavlinkWsUrl !== undefined ? { manualMavlinkWsUrl } : {}),
        ...(args.peerDeviceId !== undefined
          ? { peerDeviceId: args.peerDeviceId }
          : {}),
        ...(args.peerRssiDbm !== undefined
          ? { peerRssiDbm: args.peerRssiDbm }
          : {}),
        ...(args.cameraState !== undefined
          ? { cameraState: args.cameraState }
          : {}),
        ...(args.cloudPosture !== undefined
          ? { cloudPosture: args.cloudPosture }
          : {}),
        // (cameraState + cloudPosture denormalized above for the fleet card)
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
