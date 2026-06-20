"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BatteryBar } from "./battery-bar";
import { StatusDot } from "@/components/ui/status-dot";
import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDroneMetadataStore } from "@/stores/drone-metadata-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
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
  // Control-plane RTT is connection-scoped (the focused agent only), so show it
  // on this card only when it IS the focused node.
  const focusedDeviceId = useAgentConnectionStore((s) => s.nodeDeviceId);
  const controlRttMs = useAgentConnectionStore((s) => s.controlRttMs);
  const isFocusedNode =
    !!drone.cloudDeviceId && focusedDeviceId === drone.cloudDeviceId;
  const sats = drone.gps?.satellites ?? 0;
  const fixType = drone.gps?.fixType ?? 0;
  const lowSats = sats < 6 && fixType > 0;
  // When no FC is attached, arm / mode / battery are NOT real telemetry — the
  // node registry projection leaves them at benign defaults that would read as
  // a fabricated "disarmed / STABILIZE / 0%" reading. Hide those rather than
  // lie. `fcAttached === undefined` (legacy rows) is treated as attached.
  const fcAttached = drone.fcAttached !== false;

  return (
    <Card className={cn(selected && "border-accent-primary bg-accent-primary/5")} onClick={() => onClick?.(drone.id)}>
      {/* Row 1: status dot + name (truncates) + the two key state pills,
          pinned right so the name truncates instead of pushing them off-card. */}
      <div className="flex items-center gap-2 mb-1.5">
        <StatusDot status={statusToDot[drone.status]} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {displayName}
        </span>
        {/* Arm state is FC telemetry: only show it when an FC is attached, else
            the registry default ("disarmed") would read as a real reading. */}
        {fcAttached && (
          <Badge
            variant={drone.armState === "armed" ? "warning" : "neutral"}
            className="shrink-0 px-1 py-0 text-[9px]"
          >
            {drone.armState}
          </Badge>
        )}
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
          {isFocusedNode && controlRttMs != null && (
            <span
              title="Control-plane round-trip time to the agent"
              className="inline-flex"
            >
              <Badge
                variant={
                  controlRttMs < 80
                    ? "success"
                    : controlRttMs < 250
                      ? "warning"
                      : "error"
                }
                className="text-[10px] font-mono"
              >
                {controlRttMs}ms
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
          {/* USB power contention is a STATIC topology hint (the camera shares a
              hub with the radio), not a fault — surfacing it on a healthy,
              streaming camera is noise. Only show it when another signal
              corroborates an actual camera problem (missing / error), where the
              shared hub is a plausible cause worth flagging. */}
          {(drone.cameraState === "missing" || drone.cameraState === "error") &&
            drone.cameraUsbRecovery?.powerContention && (
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
      {/* Battery is FC telemetry; with no FC the registry leaves it undefined
          (a "0%" bar would be a lie). Show a neutral "no FC" line instead. */}
      {fcAttached ? (
        <BatteryBar percentage={drone.battery?.remaining ?? 0} className="mb-2" />
      ) : (
        <p className="mb-2 text-[10px] text-text-tertiary">
          No flight controller connected
        </p>
      )}
      <div className="flex items-center justify-between text-[10px] text-text-tertiary">
        {/* Flight mode is FC telemetry — hidden without an attached FC. */}
        <span className="font-mono">{fcAttached ? drone.flightMode : ""}</span>
        <div className="flex items-center gap-2">
          {fcAttached && drone.gps && (
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
