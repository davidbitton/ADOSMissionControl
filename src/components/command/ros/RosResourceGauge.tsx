"use client";

/**
 * @module RosResourceGauge
 * @description CPU/RAM/disk gauge widget for the ROS container.
 * Displays resource usage from the ROS status endpoint.
 * @license GPL-3.0-only
 */

import { Cpu, HardDrive, MemoryStick } from "lucide-react";

interface ResourceGaugeProps {
  cpuPercent?: number;
  ramUsedMb?: number;
  ramLimitMb?: number;
  diskUsedMb?: number;
  diskLimitMb?: number;
}

function GaugeBar({
  icon: Icon,
  label,
  value,
  max,
  unit,
  color,
}: {
  icon: typeof Cpu;
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor = pct > 90 ? "bg-status-error" : pct > 70 ? "bg-status-warning" : color;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Icon className="w-3 h-3" />
          {label}
        </div>
        <span className="text-text-primary font-mono">
          {value.toFixed(0)}{unit} / {max.toFixed(0)}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RosResourceGauge({
  cpuPercent = 0,
  ramUsedMb = 0,
  ramLimitMb = 4096,
  diskUsedMb = 0,
  diskLimitMb = 8000,
}: ResourceGaugeProps) {
  return (
    <div className="bg-surface-secondary rounded-lg p-3 border border-border-primary space-y-2.5">
      <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        Container Resources
      </h4>
      <GaugeBar
        icon={Cpu}
        label="CPU"
        value={cpuPercent}
        max={100}
        unit="%"
        color="bg-accent-primary"
      />
      <GaugeBar
        icon={MemoryStick}
        label="RAM"
        value={ramUsedMb}
        max={ramLimitMb}
        unit=" MB"
        color="bg-accent-secondary"
      />
      <GaugeBar
        icon={HardDrive}
        label="Disk"
        value={diskUsedMb}
        max={diskLimitMb}
        unit=" MB"
        color="bg-accent-primary"
      />
    </div>
  );
}
