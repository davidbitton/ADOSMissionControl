"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BatteryBar } from "./battery-bar";
import { StatusDot } from "@/components/ui/status-dot";
import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDroneMetadataStore } from "@/stores/drone-metadata-store";
import { navigationModeBadge } from "@/lib/agent/navigation-mode-label";
import {
  CAMERA_RECOVERY_ACTIVE_STATES,
  CAMERA_RECOVERY_ATTENTION_STATES,
} from "@/lib/agent/camera-recovery";
import type { FleetDrone, DroneStatus } from "@/lib/types";

interface DroneCardProps {
  drone: FleetDrone;
  selected?: boolean;
  onClick?: (id: string) => void;
}

const statusToBadgeVariant: Record<DroneStatus, "success" | "warning" | "error" | "info" | "neutral"> = {
  online: "success",
  in_mission: "info",
  idle: "neutral",
  returning: "warning",
  maintenance: "error",
  offline: "neutral",
};

const statusToDot: Record<DroneStatus, "online" | "idle" | "warning" | "error" | "offline"> = {
  online: "online",
  in_mission: "online",
  idle: "idle",
  returning: "warning",
  maintenance: "error",
  offline: "offline",
};

const gpsFixLabel: Record<number, string> = {
  0: "No Fix",
  2: "2D",
  3: "3D",
};

export function DroneCard({ drone, selected, onClick }: DroneCardProps) {
  const displayName = useDroneMetadataStore((s) => s.profiles[drone.id]?.displayName) ?? drone.name;
  const sats = drone.gps?.satellites ?? 0;
  const fixType = drone.gps?.fixType ?? 0;
  const lowSats = sats < 6 && fixType > 0;

  return (
    <Card className={cn(selected && "border-accent-primary bg-accent-primary/5")} onClick={() => onClick?.(drone.id)}>
      {/* Row 1: status dot + name (truncates) + the two key state pills,
          pinned right so the name truncates instead of pushing them off-card. */}
      <div className="flex items-center gap-2 mb-1.5">
        <StatusDot status={statusToDot[drone.status]} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {displayName}
        </span>
        <Badge
          variant={drone.armState === "armed" ? "warning" : "neutral"}
          className="shrink-0 px-1 py-0 text-[9px]"
        >
          {drone.armState}
        </Badge>
        <Badge
          variant={statusToBadgeVariant[drone.status]}
          className="shrink-0 px-1 py-0 text-[9px]"
        >
          {drone.status.replace("_", " ")}
        </Badge>
      </div>
      {/* Row 2: secondary status badges — wrap so they never clip the narrow
          sidebar; empty:hidden collapses the row when a node has none. */}
      <div className="mb-2 flex flex-wrap items-center gap-1 empty:mb-0 empty:hidden">
        {drone.source === "cloud" && (
          <Cloud size={12} className="text-accent-primary" />
        )}
          {drone.cloudPosture === "local" && (
            <span title="Cloud posture is local-only. No cloud relay; reach this drone on the LAN.">
              <Badge variant="neutral" className="text-[10px]">
                Local-only
              </Badge>
            </span>
          )}
          {drone.profile === "ground-station" && (
            <span title={drone.role ? `Ground station — ${drone.role}` : "Ground station"}>
              <Badge variant="info" className="text-[10px]">
                GS{drone.role && drone.role !== "direct" ? ` / ${drone.role}` : ""}
              </Badge>
            </span>
          )}
          {drone.profile === "compute" && (
            <span title="Compute node">
              <Badge variant="info" className="text-[10px]">
                CMP
              </Badge>
            </span>
          )}
          {drone.videoPipelineFlavor === "gst-native" && (
            <span
              title={
                drone.videoEncoderName
                  ? `Native GStreamer air pipeline (${drone.videoEncoderName}${drone.videoEncoderHwAccel ? " / HW" : " / SW"})`
                  : "Native GStreamer air pipeline"
              }
            >
              <Badge variant="info" className="text-[10px]">
                GST
              </Badge>
            </span>
          )}
          {drone.attachedDisplayType === "spi-lcd" && (
            <span title='Local SPI LCD attached (Waveshare 3.5" / ILI9486)'>
              <Badge variant="neutral" className="text-[10px]">
                LCD
              </Badge>
            </span>
          )}
          {(() => {
            // Mode-aware pill: shows nothing for off/unknown, "OF" for
            // optical flow, "OF*" for the degraded (rangefinder-free)
            // path, "VIO" for either VIO engine, and "Hybrid" for the
            // combined estimator. Falls back to a generic "GPS-denied"
            // pill when only the boolean is available (older agents).
            const badge = navigationModeBadge(drone.navigationMode);
            if (badge) {
              const variant: "success" | "warning" | "neutral" =
                badge.tone === "ok"
                  ? "success"
                  : badge.tone === "warn"
                    ? "warning"
                    : "neutral";
              return (
                <span title={badge.tooltip}>
                  <Badge variant={variant} className="text-[10px]">
                    {badge.short}
                  </Badge>
                </span>
              );
            }
            if (drone.navigationGpsDenied === true) {
              return (
                <span title="GPS-denied navigation active (optical flow or VIO)">
                  <Badge variant="info" className="text-[10px]">
                    GPS-denied
                  </Badge>
                </span>
              );
            }
            return null;
          })()}
          {drone.manualMavlinkWsUrl && (
            <span
              title={`Direct LAN MAVLink available — ${drone.manualMavlinkWsUrl}\nClick to copy to clipboard.`}
              onClick={(e) => {
                e.stopPropagation();
                if (drone.manualMavlinkWsUrl) {
                  navigator.clipboard?.writeText(drone.manualMavlinkWsUrl);
                }
              }}
              className="cursor-pointer"
            >
              <Badge variant="success" className="text-[10px]">
                Direct
              </Badge>
            </span>
          )}
          {drone.peerDeviceId && (
            <span
              title={`WFB peer seen: ${drone.peerDeviceId}${
                typeof drone.peerRssiDbm === "number" && drone.peerRssiDbm !== 0
                  ? ` (${drone.peerRssiDbm} dBm)`
                  : ""
              }`}
              className="inline-flex"
            >
              <Badge variant="success" className="text-[10px]">
                Peer
              </Badge>
            </span>
          )}
          {drone.cameraState === "missing" && (
            <span
              title="Air-side video pipeline reports no primary camera. Check the USB camera connection."
              className="inline-flex"
            >
              <Badge variant="warning" className="text-[10px]">
                No camera
              </Badge>
            </span>
          )}
          {drone.cameraState === "error" && (
            <span
              title="Air-side camera HAL probe failed. Check ados-video journal."
              className="inline-flex"
            >
              <Badge variant="error" className="text-[10px]">
                Camera err
              </Badge>
            </span>
          )}
          {(() => {
            const recovery = drone.cameraUsbRecovery;
            if (!recovery) return null;
            if (CAMERA_RECOVERY_ACTIVE_STATES.has(recovery.state)) {
              return (
                <span
                  title={`Air-side camera self-heal in progress (${recovery.state}${
                    recovery.maxAttempts > 0
                      ? `, attempt ${recovery.attempts}/${recovery.maxAttempts}`
                      : ""
                  }).`}
                  className="inline-flex"
                >
                  <Badge variant="info" className="text-[10px]">
                    Recovering camera…
                  </Badge>
                </span>
              );
            }
            if (CAMERA_RECOVERY_ATTENTION_STATES.has(recovery.state)) {
              return (
                <span
                  title="Air-side camera recovery needs a physical reseat or power-cycle of the USB camera."
                  className="inline-flex"
                >
                  <Badge variant="warning" className="text-[10px]">
                    Camera: reseat
                  </Badge>
                </span>
              );
            }
            return null;
          })()}
          {drone.cameraUsbRecovery?.powerContention && (
            <span
              title="The camera shares an over-subscribed USB hub with the radio, which can brown it out under load. Move the camera to a separate port or a self-powered hub."
              className="inline-flex"
            >
              <Badge variant="warning" className="text-[10px]">
                Camera: power
              </Badge>
            </span>
          )}
          {(drone.profileSource === "detected" ||
            drone.profileSource === "tiebreaker" ||
            drone.profileSource === "default") && (
            <span
              title={
                drone.profileSource === "detected"
                  ? "Profile auto-detected from hardware fingerprint"
                  : drone.profileSource === "tiebreaker"
                  ? "Profile picked by tiebreaker. Confirm in setup."
                  : "Profile fell back to default. Confirm in setup."
              }
              className="inline-flex h-4 items-center rounded-sm bg-status-warning/20 px-1 font-mono text-[10px] lowercase text-status-warning"
            >
              auto
            </span>
          )}
      </div>
      <BatteryBar percentage={drone.battery?.remaining ?? 0} className="mb-2" />
      <div className="flex items-center justify-between text-[10px] text-text-tertiary">
        <span className="font-mono">{drone.flightMode}</span>
        <div className="flex items-center gap-2">
          {drone.gps && (
            <span className={cn("font-mono", lowSats ? "text-status-warning" : "text-text-tertiary")}>
              {gpsFixLabel[fixType] ?? `Fix ${fixType}`} {sats} sats
            </span>
          )}
          {drone.suiteName && <span className="truncate ml-1">{drone.suiteName}</span>}
        </div>
      </div>
    </Card>
  );
}
