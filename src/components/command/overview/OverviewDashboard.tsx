/**
 * @module OverviewDashboard
 * @description Rich widget dashboard for the Command > Overview sub-tab.
 * Uses plain CSS Grid for layout (Tailwind `grid-cols-12`). 5 presets
 * give operators pre-built layouts for different phases of flight.
 *
 * Note: drag-and-drop widget rearrangement was removed from v1.0
 * because the react-grid-layout v2 ESM rewrite dropped WidthProvider,
 * breaking the render. Returning drag-and-drop requires picking a
 * stable grid library; preset-based layouts cover the real use case.
 *
 * @license GPL-3.0-only
 */
"use client";

import { useMemo } from "react";
import { useOverviewDashboardStore, type OverviewPreset } from "@/stores/overview-dashboard-store";
import { cn } from "@/lib/utils";

import { StatusCard } from "./widgets/StatusCard";
import { BatteryWidget } from "./widgets/BatteryWidget";
import { GpsWidget } from "./widgets/GpsWidget";
import { AltitudeWidget } from "./widgets/AltitudeWidget";
import { SpeedWidget } from "./widgets/SpeedWidget";
import { LinkWidget } from "./widgets/LinkWidget";
import { ModeWidget } from "./widgets/ModeWidget";
import { MiniMapWidget } from "./widgets/MiniMapWidget";
import { EventStreamWidget } from "./widgets/EventStreamWidget";
import { ServiceHealthWidget } from "./widgets/ServiceHealthWidget";
import { MissionProgressWidget } from "./widgets/MissionProgressWidget";

interface WidgetSlot {
  i: string;
  colSpan: number;
  rowSpan: number;
}

const PRESETS: Record<OverviewPreset, WidgetSlot[]> = {
  "quick-pilot": [
    { i: "status", colSpan: 3, rowSpan: 1 },
    { i: "battery", colSpan: 2, rowSpan: 1 },
    { i: "gps", colSpan: 2, rowSpan: 1 },
    { i: "mode", colSpan: 2, rowSpan: 1 },
    { i: "link", colSpan: 3, rowSpan: 1 },
    { i: "altitude", colSpan: 2, rowSpan: 1 },
    { i: "speed", colSpan: 2, rowSpan: 1 },
    { i: "minimap", colSpan: 4, rowSpan: 2 },
    { i: "events", colSpan: 4, rowSpan: 2 },
  ],
  "ground-crew": [
    { i: "status", colSpan: 4, rowSpan: 1 },
    { i: "battery", colSpan: 4, rowSpan: 1 },
    { i: "link", colSpan: 4, rowSpan: 1 },
    { i: "services", colSpan: 6, rowSpan: 2 },
    { i: "minimap", colSpan: 6, rowSpan: 2 },
  ],
  "survey": [
    { i: "status", colSpan: 3, rowSpan: 1 },
    { i: "gps", colSpan: 3, rowSpan: 1 },
    { i: "altitude", colSpan: 3, rowSpan: 1 },
    { i: "speed", colSpan: 3, rowSpan: 1 },
    { i: "mission", colSpan: 4, rowSpan: 2 },
    { i: "minimap", colSpan: 4, rowSpan: 2 },
    { i: "battery", colSpan: 4, rowSpan: 1 },
    { i: "events", colSpan: 4, rowSpan: 1 },
  ],
  "inspection": [
    { i: "status", colSpan: 3, rowSpan: 1 },
    { i: "battery", colSpan: 3, rowSpan: 1 },
    { i: "gps", colSpan: 3, rowSpan: 1 },
    { i: "link", colSpan: 3, rowSpan: 1 },
    { i: "minimap", colSpan: 6, rowSpan: 2 },
    { i: "events", colSpan: 6, rowSpan: 2 },
  ],
  "developer": [
    { i: "status", colSpan: 3, rowSpan: 1 },
    { i: "services", colSpan: 9, rowSpan: 2 },
    { i: "battery", colSpan: 3, rowSpan: 1 },
    { i: "link", colSpan: 3, rowSpan: 1 },
    { i: "events", colSpan: 12, rowSpan: 2 },
  ],
};

const WIDGET_COMPONENTS: Record<string, React.ComponentType> = {
  status: StatusCard,
  battery: BatteryWidget,
  gps: GpsWidget,
  altitude: AltitudeWidget,
  speed: SpeedWidget,
  link: LinkWidget,
  mode: ModeWidget,
  minimap: MiniMapWidget,
  events: EventStreamWidget,
  services: ServiceHealthWidget,
  mission: MissionProgressWidget,
};

const WIDGET_LABELS: Record<string, string> = {
  status: "Status",
  battery: "Battery",
  gps: "GPS",
  altitude: "Altitude",
  speed: "Speed",
  link: "Link",
  mode: "Mode",
  minimap: "Map",
  events: "Events",
  services: "Services",
  mission: "Mission",
};

const PRESET_LABELS: Record<OverviewPreset, string> = {
  "quick-pilot": "Quick Pilot",
  "ground-crew": "Ground Crew",
  "survey": "Survey",
  "inspection": "Inspection",
  "developer": "Developer",
};

interface OverviewDashboardProps {
  droneId?: string;
}

export function OverviewDashboard({ droneId = "default" }: OverviewDashboardProps) {
  const getLayout = useOverviewDashboardStore((s) => s.getLayout);
  const setPreset = useOverviewDashboardStore((s) => s.setPreset);

  const { preset } = getLayout(droneId);
  const slots = useMemo(() => PRESETS[preset] ?? PRESETS["quick-pilot"], [preset]);

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Preset selector */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-primary bg-surface-secondary overflow-x-auto">
        <span className="text-xs text-text-tertiary mr-1 flex-shrink-0">Preset:</span>
        {(Object.keys(PRESETS) as OverviewPreset[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(droneId, p)}
            className={cn(
              "px-3 py-1 rounded text-xs transition-colors flex-shrink-0 font-medium",
              preset === p
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-tertiary"
            )}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Widget grid */}
      <div className="flex-1 overflow-auto p-3">
        <div
          className="grid grid-cols-12 gap-3"
          style={{ gridAutoRows: "110px" }}
        >
          {slots.map((slot) => {
            const Widget = WIDGET_COMPONENTS[slot.i];
            if (!Widget) return null;
            return (
              <div
                key={slot.i}
                className="bg-surface-secondary border border-border-primary rounded-lg overflow-hidden flex flex-col min-w-0"
                style={{
                  gridColumn: `span ${slot.colSpan}`,
                  gridRow: `span ${slot.rowSpan}`,
                }}
              >
                <div className="flex-shrink-0 px-3 py-1 bg-surface-tertiary/30 border-b border-border-primary/50">
                  <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-medium">
                    {WIDGET_LABELS[slot.i] ?? slot.i}
                  </span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Widget />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
