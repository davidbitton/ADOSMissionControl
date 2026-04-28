/**
 * @module INavOsdPanel
 * @description iNav OSD configuration panel.
 * Three collapsible sections: layout summary, alarms editor, preferences editor.
 * Alarms and preferences live in dedicated sub-components.
 * @license GPL-3.0-only
 */

"use client";

import { useCallback, useState } from "react";
import { useDroneManager } from "@/stores/drone-manager";
import { useArmedLock } from "@/hooks/use-armed-lock";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { PanelHeader } from "../shared/PanelHeader";
import { Button } from "@/components/ui/button";
import { Monitor, ChevronDown, ChevronRight, Upload } from "lucide-react";
import { AlarmFieldsEditor } from "./AlarmFieldsEditor";
import { OsdPreferencesEditor } from "./OsdPreferencesEditor";
import type {
  INavOsdLayoutsHeader,
  INavOsdAlarms,
  INavOsdPreferences,
} from "@/lib/protocol/msp/msp-decoders-inav";

type OsdAdapter = {
  getOsdLayoutsHeader(): Promise<INavOsdLayoutsHeader>;
  getOsdAlarms(): Promise<INavOsdAlarms>;
  setOsdAlarms(a: INavOsdAlarms): Promise<{ success: boolean; message: string }>;
  getOsdPreferences(): Promise<INavOsdPreferences>;
  setOsdPreferences(p: INavOsdPreferences): Promise<{ success: boolean; message: string }>;
};

function asAdapter(protocol: unknown): OsdAdapter | null {
  const p = protocol as Record<string, unknown>;
  if (p && typeof p.getOsdAlarms === "function") return protocol as OsdAdapter;
  return null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border-default rounded">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-text-primary hover:bg-bg-tertiary"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

export function INavOsdPanel() {
  const getSelectedProtocol = useDroneManager((s) => s.getSelectedProtocol);
  const connected = !!getSelectedProtocol();

  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [layoutsHeader, setLayoutsHeader] = useState<INavOsdLayoutsHeader | null>(null);
  const [alarms, setAlarms] = useState<INavOsdAlarms | null>(null);
  const [preferences, setPreferences] = useState<INavOsdPreferences | null>(null);
  const [alarmsDirty, setAlarmsDirty] = useState(false);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const { isArmed, lockMessage } = useArmedLock();
  useUnsavedGuard(alarmsDirty || prefsDirty);

  const handleRead = useCallback(async () => {
    const protocol = getSelectedProtocol();
    const adapter = asAdapter(protocol);
    if (!adapter) {
      setError("OSD config not available on this firmware");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [header, al, pref] = await Promise.all([
        adapter.getOsdLayoutsHeader(),
        adapter.getOsdAlarms(),
        adapter.getOsdPreferences(),
      ]);
      setLayoutsHeader(header);
      setAlarms(al);
      setPreferences(pref);
      setHasLoaded(true);
      setAlarmsDirty(false);
      setPrefsDirty(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [getSelectedProtocol]);

  const handleSaveAlarms = useCallback(async () => {
    if (!alarms) return;
    const adapter = asAdapter(getSelectedProtocol());
    if (!adapter) return;
    setSaving(true);
    setError(null);
    try {
      const result = await adapter.setOsdAlarms(alarms);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setAlarmsDirty(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [getSelectedProtocol, alarms]);

  const handleSavePrefs = useCallback(async () => {
    if (!preferences) return;
    const adapter = asAdapter(getSelectedProtocol());
    if (!adapter) return;
    setSaving(true);
    setError(null);
    try {
      const result = await adapter.setOsdPreferences(preferences);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setPrefsDirty(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [getSelectedProtocol, preferences]);

  function updateAlarm<K extends keyof INavOsdAlarms>(key: K, value: INavOsdAlarms[K]) {
    if (!alarms) return;
    setAlarms({ ...alarms, [key]: value });
    setAlarmsDirty(true);
  }

  function updatePref<K extends keyof INavOsdPreferences>(
    key: K,
    value: INavOsdPreferences[K],
  ) {
    if (!preferences) return;
    setPreferences({ ...preferences, [key]: value });
    setPrefsDirty(true);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-4">
        <PanelHeader
          title="OSD (iNav)"
          subtitle="OSD layout summary, alarms, and display preferences."
          icon={<Monitor size={16} />}
          loading={loading}
          loadProgress={null}
          hasLoaded={hasLoaded}
          onRead={handleRead}
          connected={connected}
          error={error}
        >
          {hasLoaded && alarmsDirty && (
            <Button
              variant="primary"
              size="sm"
              icon={<Upload size={12} />}
              loading={saving}
              disabled={!connected || saving || isArmed}
              title={isArmed ? lockMessage : undefined}
              onClick={handleSaveAlarms}
            >
              Save alarms
            </Button>
          )}
          {hasLoaded && prefsDirty && (
            <Button
              variant="primary"
              size="sm"
              icon={<Upload size={12} />}
              loading={saving}
              disabled={!connected || saving || isArmed}
              title={isArmed ? lockMessage : undefined}
              onClick={handleSavePrefs}
            >
              Save prefs
            </Button>
          )}
        </PanelHeader>

        {hasLoaded && (
          <div className="space-y-3">
            {(alarmsDirty || prefsDirty) && (
              <p className="text-[10px] font-mono text-status-warning">
                Unsaved changes : use the Save buttons above to persist.
              </p>
            )}

            <Section title="Layouts">
              {layoutsHeader ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Layout count</span>
                    <span className="font-mono text-text-primary">{layoutsHeader.layoutCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Items per layout</span>
                    <span className="font-mono text-text-primary">{layoutsHeader.itemCount}</span>
                  </div>
                  <p className="text-[10px] text-text-tertiary pt-1">
                    Full layout editor coming in a future update. Use the CLI for fine-grained control today.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-text-tertiary">No layout data.</p>
              )}
            </Section>

            <Section title="Alarms">
              <AlarmFieldsEditor alarms={alarms} onUpdate={updateAlarm} />
            </Section>

            <Section title="Preferences">
              <OsdPreferencesEditor preferences={preferences} onUpdate={updatePref} />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
