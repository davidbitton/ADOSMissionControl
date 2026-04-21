/**
 * @module EzTunePanel
 * @description iNav EZ Tune configuration editor.
 * Reads and writes the EZ Tune block via the iNav MSP2 extension.
 * EZ Tune provides simplified single-slider tuning that internally
 * scales PID, filter, and rate parameters.
 * @license GPL-3.0-only
 */

"use client";

import { useCallback, useState } from "react";
import { useDroneManager } from "@/stores/drone-manager";
import { PanelHeader } from "../shared/PanelHeader";
import { Sliders } from "lucide-react";
import type { INavEzTune } from "@/lib/protocol/msp/msp-decoders-inav";
import type { MSPAdapter } from "@/lib/protocol/msp-adapter";

// ── Defaults ──────────────────────────────────────────────────

const DEFAULTS: INavEzTune = {
  enabled: false,
  filterHz: 110,
  axisRatio: 100,
  response: 50,
  damping: 50,
  stability: 50,
  aggressiveness: 50,
  rate: 50,
  expo: 50,
  snappiness: 50,
};

// ── Slider fields ─────────────────────────────────────────────

type SliderKey = Exclude<keyof INavEzTune, "enabled">;

const SLIDER_FIELDS: Array<{ key: SliderKey; label: string; min: number; max: number; hint: string }> = [
  { key: "filterHz", label: "Filter cutoff", min: 10, max: 200, hint: "Gyro low-pass filter cutoff in Hz" },
  { key: "axisRatio", label: "Axis ratio", min: 0, max: 150, hint: "Roll-to-pitch rate ratio" },
  { key: "response", label: "Response", min: 0, max: 150, hint: "Overall stick response" },
  { key: "damping", label: "Damping", min: 0, max: 150, hint: "Oscillation suppression" },
  { key: "stability", label: "Stability", min: 0, max: 150, hint: "Position-hold authority" },
  { key: "aggressiveness", label: "Aggressiveness", min: 0, max: 150, hint: "Flip and roll authority" },
  { key: "rate", label: "Rate", min: 0, max: 100, hint: "Maximum rotation rate" },
  { key: "expo", label: "Expo", min: 0, max: 100, hint: "Stick expo curve" },
  { key: "snappiness", label: "Snappiness", min: 0, max: 100, hint: "Quick-stop precision" },
];

// ── Helpers ───────────────────────────────────────────────────

function asAdapter(protocol: unknown): MSPAdapter | null {
  const p = protocol as Record<string, unknown>;
  if (p && typeof p.getEzTune === "function") return protocol as MSPAdapter;
  return null;
}

// ── Component ─────────────────────────────────────────────────

export function EzTunePanel() {
  const getSelectedProtocol = useDroneManager((s) => s.getSelectedProtocol);
  const connected = !!getSelectedProtocol();

  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<INavEzTune>(DEFAULTS);

  const handleRead = useCallback(async () => {
    const protocol = getSelectedProtocol();
    const adapter = asAdapter(protocol);
    if (!adapter) { setError("EZ Tune not available on this firmware"); return; }
    setLoading(true); setError(null);
    try {
      const data = await (adapter as unknown as { getEzTune(): Promise<INavEzTune> }).getEzTune();
      setValues(data);
      setHasLoaded(true);
      setDirty(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [getSelectedProtocol]);

  const handleWrite = useCallback(async () => {
    const protocol = getSelectedProtocol();
    const adapter = asAdapter(protocol);
    if (!adapter) { setError("EZ Tune not available on this firmware"); return; }
    setLoading(true); setError(null);
    try {
      const result = await (adapter as unknown as { setEzTune(cfg: INavEzTune): Promise<{ success: boolean; message: string }> }).setEzTune(values);
      if (!result.success) { setError(result.message); return; }
      setDirty(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [getSelectedProtocol, values]);

  function handleSlider(key: SliderKey, raw: string) {
    setValues((prev) => ({ ...prev, [key]: parseInt(raw, 10) }));
    setDirty(true);
  }

  function handleToggle() {
    setValues((prev) => ({ ...prev, enabled: !prev.enabled }));
    setDirty(true);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-4">
        <PanelHeader
          title="EZ Tune"
          subtitle="Simplified PID and filter tuning via unified sliders."
          icon={<Sliders size={16} />}
          loading={loading}
          loadProgress={null}
          hasLoaded={hasLoaded}
          onRead={handleRead}
          connected={connected}
          error={error}
        />

        {hasLoaded && (
          <div className="border border-border-default rounded p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-secondary">Enable EZ Tune</span>
              <button
                onClick={handleToggle}
                className={`text-[11px] px-3 py-1 rounded border ${
                  values.enabled
                    ? "border-accent-primary bg-accent-primary/20 text-accent-primary"
                    : "border-border-default text-text-secondary"
                }`}
              >
                {values.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            {SLIDER_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-secondary">{f.label}</span>
                  <span className="text-[11px] font-mono text-text-primary">{values[f.key]}</span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  value={values[f.key] as number}
                  onChange={(e) => handleSlider(f.key, e.target.value)}
                  className="w-full"
                />
                <span className="text-[10px] text-text-tertiary">{f.hint}</span>
              </div>
            ))}

            {dirty && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-status-warning">Unsaved changes. Write to FC to apply.</span>
                <button
                  onClick={handleWrite}
                  disabled={loading}
                  className="text-[11px] px-3 py-1 border border-accent-primary text-accent-primary rounded hover:bg-accent-primary/10"
                >
                  Write to FC
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
