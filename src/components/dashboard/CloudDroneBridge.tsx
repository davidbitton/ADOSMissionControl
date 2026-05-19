"use client";

/**
 * @module CloudDroneBridge
 * @description Bridges cloud-paired ADOS agents into the Dashboard fleet store.
 * Queries Convex for paired drones and their cloud status, then adds them
 * as FleetDrone entries with source="cloud". Handles staleness detection
 * to remove offline agents from the fleet view.
 * @license GPL-3.0-only
 */

import { useEffect, useRef } from "react";
import { useFleetStore } from "@/stores/fleet-store";
import { useAuthStore } from "@/stores/auth-store";
import { cmdDronesApi } from "@/lib/community-api-drones";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import type { FleetDrone } from "@/lib/types";

const CLOUD_STALE_MS = 60_000; // Consider drone offline after 60s without update

export function CloudDroneBridge() {
  const trackedIds = useRef<Set<string>>(new Set());
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const myDrones = useConvexSkipQuery(cmdDronesApi.listMyDrones, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!myDrones || !Array.isArray(myDrones)) return;

    const fleet = useFleetStore.getState();
    const now = Date.now();
    const currentCloudIds = new Set<string>();

    for (const drone of myDrones) {
      const fleetId = `cloud-${drone.deviceId}`;
      currentCloudIds.add(fleetId);

      // Check if drone is online (lastSeen within threshold)
      const lastSeen = drone.lastSeen ?? 0;
      const isOnline = now - lastSeen < CLOUD_STALE_MS;

      if (!isOnline) {
        // Remove stale cloud drone from fleet
        if (trackedIds.current.has(fleetId)) {
          fleet.removeDrone(fleetId);
          trackedIds.current.delete(fleetId);
        }
        continue;
      }

      const attachedDisplayType: FleetDrone["attachedDisplayType"] =
        drone.attachedDisplayType === "spi-lcd" ||
        drone.attachedDisplayType === "hdmi" ||
        drone.attachedDisplayType === "none"
          ? drone.attachedDisplayType
          : undefined;

      const profileSource: FleetDrone["profileSource"] =
        drone.profileSource === "detected" ||
        drone.profileSource === "tiebreaker" ||
        drone.profileSource === "default" ||
        drone.profileSource === "override" ||
        drone.profileSource === "user"
          ? drone.profileSource
          : undefined;

      // Air-side pipeline identity for the fleet-card pill. Sourced
      // from the agent's heartbeat enricher; absent when the legacy
      // bash composition is in force.
      const videoPipelineFlavor =
        typeof (drone as { videoPipelineFlavor?: unknown })
          .videoPipelineFlavor === "string"
          ? ((drone as { videoPipelineFlavor?: string }).videoPipelineFlavor as
              | string
              | undefined)
          : undefined;
      const videoEncoderName =
        typeof (drone as { videoEncoderName?: unknown }).videoEncoderName ===
        "string"
          ? ((drone as { videoEncoderName?: string }).videoEncoderName as
              | string
              | undefined)
          : undefined;
      const videoEncoderHwAccel =
        typeof (drone as { videoEncoderHwAccel?: unknown })
          .videoEncoderHwAccel === "boolean"
          ? ((drone as { videoEncoderHwAccel?: boolean }).videoEncoderHwAccel as
              | boolean
              | undefined)
          : undefined;

      const manualMavlinkWsUrl =
        typeof (drone as { manualMavlinkWsUrl?: unknown })
          .manualMavlinkWsUrl === "string" &&
        ((drone as { manualMavlinkWsUrl: string }).manualMavlinkWsUrl as string)
          .length > 0
          ? ((drone as { manualMavlinkWsUrl: string }).manualMavlinkWsUrl as
              | string
              | undefined)
          : undefined;

      // GPS-denied navigation flag for the fleet-card pill. Denormalized
      // from cmd_drones so we don't need a join against cmd_droneStatus
      // on every render. Undefined when the agent has no nav plugin.
      const navigationGpsDenied =
        typeof (drone as { navigationGpsDenied?: unknown })
          .navigationGpsDenied === "boolean"
          ? ((drone as { navigationGpsDenied?: boolean })
              .navigationGpsDenied as boolean | undefined)
          : undefined;
      // Active estimator mode (free-form string) for the mode-aware
      // pill. Falls back to undefined when the agent's heartbeat
      // doesn't carry the field yet.
      const navigationMode =
        typeof (drone as { navigationMode?: unknown }).navigationMode ===
        "string"
          ? ((drone as { navigationMode?: string }).navigationMode as
              | string
              | undefined)
          : undefined;
      const peerDeviceId =
        typeof (drone as { peerDeviceId?: unknown }).peerDeviceId === "string"
        && ((drone as { peerDeviceId: string }).peerDeviceId).length > 0
          ? ((drone as { peerDeviceId: string }).peerDeviceId)
          : null;
      const peerRssiDbm =
        typeof (drone as { peerRssiDbm?: unknown }).peerRssiDbm === "number"
        && Number.isFinite((drone as { peerRssiDbm: number }).peerRssiDbm)
          ? ((drone as { peerRssiDbm: number }).peerRssiDbm)
          : null;

      const fleetDrone: FleetDrone = {
        id: fleetId,
        name: drone.name || `Agent ${drone.deviceId.slice(0, 8)}`,
        status: isOnline ? "online" : "offline",
        connectionState: isOnline ? "connected" : "disconnected",
        flightMode: "STABILIZE",
        armState: "disarmed",
        lastHeartbeat: lastSeen,
        firmwareVersion: drone.agentVersion,
        healthScore: isOnline ? 80 : 0,
        hasAgent: true,
        source: "cloud",
        cloudDeviceId: drone.deviceId,
        runtimeMode: drone.runtimeMode === "lite" ? "lite" : "full",
        attachedDisplayType,
        profileSource,
        videoPipelineFlavor,
        videoEncoderName,
        videoEncoderHwAccel,
        manualMavlinkWsUrl,
        navigationGpsDenied,
        navigationMode,
        peerDeviceId,
        peerRssiDbm,
      };

      if (trackedIds.current.has(fleetId)) {
        // Update existing cloud drone
        fleet.updateDrone(fleetId, fleetDrone);
      } else {
        // Add new cloud drone
        fleet.addDrone(fleetDrone);
        trackedIds.current.add(fleetId);
      }
    }

    // Remove tracked cloud drones that no longer exist in paired list
    for (const id of trackedIds.current) {
      if (!currentCloudIds.has(id)) {
        fleet.removeDrone(id);
        trackedIds.current.delete(id);
      }
    }
  }, [myDrones]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const fleet = useFleetStore.getState();
      for (const id of trackedIds.current) {
        fleet.removeDrone(id);
      }
      trackedIds.current.clear();
    };
  }, []);

  return null; // Pure bridge, no UI
}
