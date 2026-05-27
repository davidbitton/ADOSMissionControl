"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BatteryBar } from "./battery-bar";
import { StatusDot } from "@/components/ui/status-dot";
import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDroneMetadataStore } from "@/stores/drone-metadata-store";
import { navigationModeBadge } from "@/lib/agent/navigation-mode-label";
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
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusDot status={statusToDot[drone.status]} />
          <span className="text-sm font-semibold text-text-primary">{displayName}</span>
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
        <div className="flex items-center gap-1.5">
          <Badge variant={drone.armState === "armed" ? "warning" : "neutral"}>
            {drone.armState}
          </Badge>
          <Badge variant={statusToBadgeVariant[drone.status]}>{drone.status.replace("_", " ")}</Badge>
        </div>
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
