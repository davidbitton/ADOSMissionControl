"use client";

/**
 * @module DashboardPanel
 * @description ADOS Edge transmitter landing view after connect. Shows
 * device info, active model summary, and a quick-action row.
 * @license GPL-3.0-only
 */

import { useEffect } from "react";
import Link from "next/link";
import { useAdosEdgeStore } from "@/stores/ados-edge-store";
import { useAdosEdgeModelStore } from "@/stores/ados-edge-model-store";
import { useAdosEdgeTelemetryStore } from "@/stores/ados-edge-telemetry-store";
import { Button } from "@/components/ui/button";

export function DashboardPanel() {
  const firmware = useAdosEdgeStore((s) => s.firmware);
  const disconnect = useAdosEdgeStore((s) => s.disconnect);

  const models = useAdosEdgeModelStore((s) => s.models);
  const activeSlot = useAdosEdgeModelStore((s) => s.activeSlot);
  const loadList = useAdosEdgeModelStore((s) => s.loadList);

  const link = useAdosEdgeTelemetryStore((s) => s.link);
  const battery = useAdosEdgeTelemetryStore((s) => s.battery);
  const mode = useAdosEdgeTelemetryStore((s) => s.mode);
  const startTelem = useAdosEdgeTelemetryStore((s) => s.startStream);
  const stopTelem = useAdosEdgeTelemetryStore((s) => s.stopStream);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    /* Start the TELEM stream on the dashboard so battery / link / mode
     * tiles are populated for any operator that opens the page. The
     * TelemetryDashboard sub-route calls startStream too, but the store
     * guards against double-start so there is no harm. */
    void startTelem();
    return () => {
      void stopTelem();
    };
  }, [startTelem, stopTelem]);

  const activeModel =
    activeSlot !== null ? models.find((m) => m.i === activeSlot) : undefined;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">ADOS Edge</h1>
        <Button variant="secondary" onClick={() => void disconnect()}>
          Disconnect
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-secondary p-4">
          <h3 className="text-sm font-semibold text-text-secondary">Device</h3>
          <p className="mt-2 text-lg text-text-primary">
            {firmware ? `v${firmware.firmware}` : "--"}
          </p>
          {firmware?.board && (
            <p className="text-xs text-text-muted">{firmware.board}</p>
          )}
          {firmware?.mcu && (
            <p className="text-xs text-text-muted">{firmware.mcu}</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface-secondary p-4">
          <h3 className="text-sm font-semibold text-text-secondary">Active model</h3>
          <p className="mt-2 text-lg text-text-primary">
            {activeModel ? activeModel.n : "(none)"}
          </p>
          {activeSlot !== null && (
            <p className="text-xs text-text-muted">Slot {activeSlot + 1}</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface-secondary p-4">
          <h3 className="text-sm font-semibold text-text-secondary">Models stored</h3>
          <p className="mt-2 text-lg text-text-primary">{models.length} / 16</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-secondary p-4">
          <h3 className="text-sm font-semibold text-text-secondary">Battery</h3>
          <p className="mt-2 text-lg tabular-nums text-text-primary">
            {battery ? `${(battery.voltageDv / 10).toFixed(1)} V` : "--"}
          </p>
          <p className="text-xs text-text-muted">
            {battery ? `${battery.pct}% / ${battery.mah} mAh` : "no telemetry"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-secondary p-4">
          <h3 className="text-sm font-semibold text-text-secondary">Link</h3>
          <p className="mt-2 text-lg tabular-nums text-text-primary">
            {link ? `${link.rssi1} dBm` : "--"}
          </p>
          <p className="text-xs text-text-muted">
            {link ? `LQ ${link.lq}% / SNR ${link.snr} dB` : "no telemetry"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-secondary p-4">
          <h3 className="text-sm font-semibold text-text-secondary">Flight mode</h3>
          <p className="mt-2 text-lg text-text-primary">
            {mode ? mode.name : "--"}
          </p>
          <p className="text-xs text-text-muted">
            {mode ? "reported from receiver" : "waiting for receiver"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          { label: "Models", href: "/hardware/edge/models" },
          { label: "Live input", href: "/hardware/edge/live" },
          { label: "Telemetry", href: "/hardware/edge/telemetry" },
          { label: "Calibrate", href: "/hardware/edge/calibrate" },
          { label: "Firmware update", href: "/hardware/edge/firmware" },
          { label: "Backup + restore", href: "/hardware/edge/backup" },
          { label: "System settings", href: "/hardware/edge/system" },
          { label: "Advanced editors", href: "/hardware/edge/advanced" },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="inline-flex h-9 items-center rounded border border-border bg-surface-secondary px-4 text-sm text-text-primary hover:bg-surface-hover"
          >
            {action.label}
          </Link>
        ))}
      </div>

      <p className="text-xs text-text-muted">
        All sub-routes are live end-to-end. Calibration, backup / restore,
        system settings, and pin probe write through the firmware CDC
        surface. Advanced editors (visual mixer, curve drag, LS builder)
        land in v0.0.21.
      </p>
    </div>
  );
}
