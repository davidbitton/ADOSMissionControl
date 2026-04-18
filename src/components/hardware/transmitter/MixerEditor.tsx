"use client";

/**
 * @module MixerEditor
 * @description Section-tabbed editor for the active ADOS Edge model.
 * Each tab fetches its YAML via `MIXER GET <section>`, lets the
 * operator edit it, and writes it back via `MIXER SET <section>`.
 * Tabs for sections the firmware does not yet support are rendered
 * disabled with a tooltip. Per-section dirty tracking: a tab label
 * grows a dot when its textarea differs from the last loaded YAML.
 *
 * This is the Wave 2 GCS shape. Richer form editors (mixer table with
 * reorder, curve graph editor, logical-switch expression builder)
 * layer on top of the YAML round-trip in Wave 3+.
 *
 * @license GPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdosEdgeStore } from "@/stores/ados-edge-store";
import { useAdosEdgeModelStore } from "@/stores/ados-edge-model-store";
import {
  SUPPORTED_MIXER_SECTIONS,
  type MixerSectionSlug,
} from "@/lib/ados-edge/edge-link";
import { Button } from "@/components/ui/button";

/** The full set of sections the GCS exposes as tabs. The four listed
 * in SUPPORTED_MIXER_SECTIONS are enabled; the rest are rendered
 * disabled with a schema-v2 tooltip. */
const ALL_SECTIONS: MixerSectionSlug[] = [
  "setup",
  "mixes",
  "gvs",
  "flight_modes",
  "inputs",
  "outputs",
  "curves",
  "ls",
  "sf",
  "failsafe",
  "trims",
  "timers",
  "telemetry",
  "gvars",
];

const SECTION_LABELS: Record<MixerSectionSlug, string> = {
  setup: "Setup",
  mixes: "Mixes",
  gvs: "Global vars",
  flight_modes: "Flight modes",
  inputs: "Inputs",
  outputs: "Outputs",
  curves: "Curves",
  ls: "Logical switches",
  sf: "Special functions",
  failsafe: "Failsafe",
  trims: "Trims",
  timers: "Timers",
  telemetry: "Telemetry sensors",
  gvars: "GVARs",
};

interface SectionState {
  /** Last YAML the firmware returned. Null while loading / on error. */
  loaded: string | null;
  /** Current draft in the textarea. Starts equal to `loaded`. */
  draft: string;
  /** Load-time error, if any. */
  error: string | null;
  /** Save-time error, if any. */
  saveError: string | null;
  /** True while a request is in flight. */
  busy: boolean;
}

const EMPTY_STATE: SectionState = {
  loaded: null,
  draft: "",
  error: null,
  saveError: null,
  busy: false,
};

export function MixerEditor() {
  const connected = useAdosEdgeStore((s) => s.state === "connected");
  const link = useAdosEdgeStore((s) => s.link);
  const models = useAdosEdgeModelStore((s) => s.models);
  const activeSlot = useAdosEdgeModelStore((s) => s.activeSlot);

  const [section, setSection] = useState<MixerSectionSlug>("setup");
  const [states, setStates] = useState<Record<string, SectionState>>({});

  const current = states[section] ?? EMPTY_STATE;

  const supported = useMemo(() => {
    return new Set(SUPPORTED_MIXER_SECTIONS);
  }, []);

  const activeModel = useMemo(() => {
    return activeSlot !== null ? models.find((m) => m.i === activeSlot) : null;
  }, [models, activeSlot]);

  const load = useCallback(
    async (target: MixerSectionSlug) => {
      if (!link) return;
      if (!supported.has(target)) return;
      setStates((prev) => ({
        ...prev,
        [target]: { ...(prev[target] ?? EMPTY_STATE), busy: true, error: null, saveError: null },
      }));
      try {
        const yaml = await link.mixerGet(target);
        setStates((prev) => ({
          ...prev,
          [target]: {
            loaded: yaml,
            draft: yaml,
            error: null,
            saveError: null,
            busy: false,
          },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStates((prev) => ({
          ...prev,
          [target]: {
            ...(prev[target] ?? EMPTY_STATE),
            error: message,
            busy: false,
          },
        }));
      }
    },
    [link, supported],
  );

  /* Autoload the current section when the user switches tabs. Reload
   * when the active slot changes so edits always target the right
   * model. */
  useEffect(() => {
    if (!connected || !supported.has(section)) return;
    const s = states[section];
    if (!s || (s.loaded === null && !s.busy && !s.error)) {
      void load(section);
    }
    /* States is intentionally omitted from deps to avoid a reload
     * every keystroke. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, section, load, activeSlot]);

  const onDraftChange = (value: string) => {
    setStates((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] ?? EMPTY_STATE),
        draft: value,
        saveError: null,
      },
    }));
  };

  const onDiscard = () => {
    setStates((prev) => {
      const cur = prev[section];
      if (!cur) return prev;
      return {
        ...prev,
        [section]: {
          ...cur,
          draft: cur.loaded ?? "",
          saveError: null,
        },
      };
    });
  };

  const onSave = async () => {
    if (!link) return;
    const cur = states[section] ?? EMPTY_STATE;
    if (cur.draft === cur.loaded) return;
    setStates((prev) => ({
      ...prev,
      [section]: { ...(prev[section] ?? EMPTY_STATE), busy: true, saveError: null },
    }));
    try {
      await link.mixerSet(section, cur.draft);
      setStates((prev) => ({
        ...prev,
        [section]: {
          loaded: cur.draft,
          draft: cur.draft,
          error: null,
          saveError: null,
          busy: false,
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStates((prev) => ({
        ...prev,
        [section]: {
          ...(prev[section] ?? EMPTY_STATE),
          saveError: message,
          busy: false,
        },
      }));
    }
  };

  if (!connected) {
    return (
      <div className="p-6 text-sm text-text-secondary">
        Connect the transmitter to edit the mixer.
      </div>
    );
  }

  const dirtySections = new Set(
    Object.entries(states)
      .filter(([, s]) => s.loaded !== null && s.draft !== s.loaded)
      .map(([key]) => key),
  );
  const dirty = dirtySections.has(section);

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Mixer</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Editing active model: {" "}
            <span className="font-mono text-text-primary">
              {activeModel ? `${activeModel.n} (slot ${activeModel.i + 1})` : "(none)"}
            </span>
          </p>
        </div>
        {dirtySections.size > 0 && (
          <span className="text-xs text-accent-secondary">
            {dirtySections.size} section{dirtySections.size === 1 ? "" : "s"} with unsaved changes
          </span>
        )}
      </header>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-border-default pb-1"
        role="tablist"
      >
        {ALL_SECTIONS.map((slug) => {
          const isSupported = supported.has(slug);
          const isActive = slug === section;
          const hasDirty = dirtySections.has(slug);
          return (
            <button
              key={slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={!isSupported}
              onClick={() => setSection(slug)}
              title={
                isSupported
                  ? undefined
                  : "Available in a later firmware release. Schema v2."
              }
              className={tabClass(isActive, isSupported)}
            >
              <span>{SECTION_LABELS[slug]}</span>
              {hasDirty && (
                <span
                  aria-hidden
                  className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent-secondary"
                />
              )}
              {!isSupported && (
                <span aria-hidden className="ml-1 text-[10px] text-text-tertiary">
                  v2
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <SectionPanel
        section={section}
        state={current}
        onDraftChange={onDraftChange}
        onReload={() => void load(section)}
        onDiscard={onDiscard}
        onSave={() => void onSave()}
        dirty={dirty}
      />
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function SectionPanel({
  section,
  state,
  onDraftChange,
  onReload,
  onDiscard,
  onSave,
  dirty,
}: {
  section: MixerSectionSlug;
  state: SectionState;
  onDraftChange: (v: string) => void;
  onReload: () => void;
  onDiscard: () => void;
  onSave: () => void;
  dirty: boolean;
}) {
  return (
    <section
      role="tabpanel"
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-secondary p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          {SECTION_LABELS[section]}
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onReload} disabled={state.busy}>
            {state.busy ? "Loading..." : "Reload"}
          </Button>
        </div>
      </header>

      {state.error && (
        <p className="text-xs text-status-error">{state.error}</p>
      )}

      {state.loaded === null && state.busy && (
        <p className="text-xs text-text-muted">Reading section from firmware...</p>
      )}

      {state.loaded !== null && (
        <>
          <textarea
            value={state.draft}
            onChange={(e) => onDraftChange(e.target.value)}
            spellCheck={false}
            rows={Math.max(8, Math.min(24, state.draft.split("\n").length + 1))}
            className="rounded border border-border-default bg-bg-primary p-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
          />
          {state.saveError && (
            <p className="text-xs text-status-error">Save failed: {state.saveError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={!dirty || state.busy}
            >
              Discard changes
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty || state.busy}>
              {state.busy ? "Saving..." : "Save to device"}
            </Button>
          </div>
        </>
      )}

      <p className="text-[11px] text-text-muted">
        Edit the YAML directly. The firmware validates the section schema
        on save; invalid YAML or cross-section keys are rejected and the
        on-device model is left untouched.
      </p>
    </section>
  );
}

/* ─────────────── helpers ─────────────── */

function tabClass(active: boolean, supported: boolean): string {
  const base = "inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs transition-colors";
  if (active) return `${base} bg-bg-tertiary text-text-primary`;
  if (!supported) {
    return `${base} text-text-tertiary opacity-50 cursor-not-allowed`;
  }
  return `${base} text-text-secondary hover:bg-bg-tertiary hover:text-text-primary`;
}
