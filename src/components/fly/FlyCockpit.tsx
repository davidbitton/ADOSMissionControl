/**
 * The immersive Fly cockpit: a chromeless, game-like piloting surface composed
 * as a back-to-front layer stack over the singleton video brain.
 *
 *   L0  video            VideoCanvas (object-contain stream + REC/stats)
 *   L1  plugin overlay   the video.overlay slot (inert until a plugin host wraps
 *                        the cockpit; renders nothing today)
 *   L2  instrument HUD   OsdOverlay canvas (horizon / tapes / crosshair)
 *   L3  cockpit chrome   CockpitTopBar, minimap PiP, ProximityRadar,
 *                        TelemetryStrip, and the bottom Skill Bar
 *   L4  transient        the skill confirm host (portal dialogs)
 *
 * Because the cockpit route is short-circuited out of CommandShell — the only
 * place the agent/video/telemetry bridges and the skill registry are mounted —
 * this component mounts those bridges and initializes the registry itself. All
 * of them are route-agnostic, idempotent singletons keyed off global stores, so
 * the cockpit gets live telemetry, a live video stream, and a populated skill
 * bar without the dashboard tab staying mounted, and entering/leaving never
 * tears down the connection.
 *
 * Pointer-event discipline: the instrument HUD and read-only readouts are
 * pointer-events-none so a click falls through to the video; only the Skill
 * Bar, the minimap card, and the exit button opt back to pointer-events-auto.
 *
 * @module fly/FlyCockpit
 * @license GPL-3.0-only
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { VideoCanvas } from "@/components/flight/VideoCanvas";
import { OsdOverlay } from "@/components/flight/OsdOverlay";
import { ProximityRadar } from "@/components/flight/ProximityRadar";
import { VideoOverlayHost } from "@/components/fly/VideoOverlayHost";
import { PluginSkillHost } from "@/components/fly/PluginSkillHost";

import { AgentMavlinkBridge } from "@/components/command/AgentMavlinkBridge";
import { AgentBridges } from "@/components/command/AgentBridges";
import { CloudDroneBridge } from "@/components/dashboard/CloudDroneBridge";
import { LocalDroneBridge } from "@/components/dashboard/LocalDroneBridge";
import { FleetProjectionBridge } from "@/components/dashboard/FleetProjectionBridge";
import { SkillConfirmHost } from "@/components/fly/SkillConfirmHost";
import { SkillBar } from "@/components/fly/SkillBar";
import { SkillBarEditor } from "@/components/fly/SkillBarEditor";
import { CockpitTopBar } from "@/components/fly/CockpitTopBar";
import { TelemetryStrip } from "@/components/fly/TelemetryStrip";
import { FlyExitButton } from "@/components/fly/FlyExitButton";

import { useSkillInput } from "@/hooks/use-skill-input";
import { registerBuiltins, initSkillSubscriptions } from "@/lib/skills";
import {
  startGamepadPolling,
  stopGamepadPolling,
} from "@/lib/input/gamepad-poller";
import { useUiStore } from "@/stores/ui-store";
import { useInputStore } from "@/stores/input-store";
import { useSkillConfirmStore } from "@/stores/skill-confirm-store";
import { useDroneStore } from "@/stores/drone-store";
import { useFlyModeStore } from "@/stores/fly-mode-store";
import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";

// The minimap is a Leaflet view: load it client-only so the cockpit renders on
// the server without pulling Leaflet into the SSR pass (same dynamic import the
// dashboard uses for OverviewMap).
const OverviewMap = dynamic(
  () => import("@/components/flight/OverviewMap").then((m) => m.OverviewMap),
  {
    ssr: false,
    loading: () => <div className="w-full h-full bg-[#0a0a0a]" />,
  },
);

/**
 * Reserved gamepad exit button index (Start on a standard mapping). Named so a
 * stick-only HDMI-kiosk operator always has a way out of the cockpit.
 */
const COCKPIT_EXIT_GAMEPAD_BUTTON = 9;

interface FlyCockpitProps {
  /** Low-power path: video + instrument HUD only (mirrors /hud?layer=minimal). */
  minimal?: boolean;
}

export function FlyCockpit({ minimal = false }: FlyCockpitProps) {
  const router = useRouter();
  const t = useTranslations("skillBindings");
  const containerRef = useRef<HTMLDivElement>(null);

  // A pending skill-confirm modal owns input: pause the dispatcher and defer
  // Escape to the dialog's own onCancel while one is open.
  const confirmPending = useSkillConfirmStore((s) => s.pending !== null);

  // Fly Mode gates the Skill Bar + its editor entry; default off.
  const flyEnabled = useFlyModeStore((s) => s.enabled);

  // While the binding editor is open the dispatcher is paused so a captured
  // key never fires a skill, and the bar is replaced by the editor surface.
  const [editing, setEditing] = useState(false);

  // The currently-selected drone drives the per-drone plugin video overlay
  // host props and the per-drone plugin Skill registration.
  const selectedDroneId = useDroneStore((s) => s.selectedId);

  // Cockpit layout presets (full loadout-preset toggling is a later polish
  // pass). The minimap is on by default; the numeric readout strip is off by
  // default because the instrument HUD canvas already paints alt/speed/heading.
  const [showMinimap] = useState(true);
  const [showStrip] = useState(false);

  // ── Self-sufficiency on a chromeless route ──────────────────────────────
  // Register the built-in skills + start the registry subscriptions once. Both
  // calls are idempotent (internal guard flags), so a remount or strict-mode's
  // double-invoke is safe.
  useEffect(() => {
    registerBuiltins();
    initSkillSubscriptions();
  }, []);

  // Gamepad polling for the cockpit (the dashboard's poller is not mounted on
  // this route). Safe to call repeatedly — the poller is a singleton.
  useEffect(() => {
    startGamepadPolling();
    return () => {
      stopGamepadPolling();
    };
  }, []);

  // Signal immersive mode for parity with the dashboard's full-bleed indicators.
  // Belt-and-suspenders here (the shell chrome is already gone on /fly), but it
  // leaves the dashboard in the expected non-immersive state on return.
  useEffect(() => {
    const ui = useUiStore.getState();
    ui.enterImmersiveMode();
    return () => {
      useUiStore.getState().exitImmersiveMode();
    };
  }, []);

  // Focus the container on mount so window-level keyboard skills fire without a
  // click into the cockpit first.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // The global keyboard + gamepad skill dispatcher. Dormant while a confirm
  // modal is open (so a stray hotkey can never fire a second action mid-confirm)
  // or while the binding editor is open (so a captured key never dispatches).
  useSkillInput({ enabled: !confirmPending && !editing });

  // Leaving Fly Mode while editing closes the editor.
  useEffect(() => {
    if (!flyEnabled && editing) setEditing(false);
  }, [flyEnabled, editing]);

  // ── Exit ────────────────────────────────────────────────────────────────
  const exitCockpit = useCallback(() => {
    // Prefer the back stack so the operator returns to wherever they entered
    // from; fall back to the dashboard when /fly was opened directly (no
    // in-app history entry).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }, [router]);

  // Escape is a reserved, non-bindable key (canonicalChord never matches it, so
  // it can never collide with a bound skill). It defers to an open confirm
  // modal: the dialog owns Escape via its own onCancel, so we bail when one is
  // pending and only exit the cockpit when nothing is confirming.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (useSkillConfirmStore.getState().pending !== null) return;
      // The editor owns Escape while open: close it instead of leaving.
      if (editing) {
        e.preventDefault();
        setEditing(false);
        return;
      }
      e.preventDefault();
      exitCockpit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [exitCockpit, editing]);

  // Reserved gamepad exit chord. Edge-detect off->on on the Start button so a
  // held button never re-fires; seed from the current state to avoid a spurious
  // mount-time edge. Skipped while a confirm modal is open.
  useEffect(() => {
    let prev =
      useInputStore.getState().buttons[COCKPIT_EXIT_GAMEPAD_BUTTON] ?? false;
    const unsubscribe = useInputStore.subscribe((state) => {
      const now = state.buttons[COCKPIT_EXIT_GAMEPAD_BUTTON] ?? false;
      if (now && !prev) {
        if (useSkillConfirmStore.getState().pending === null) {
          exitCockpit();
        }
      }
      prev = now;
    });
    return () => unsubscribe();
  }, [exitCockpit]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative w-full h-full overflow-hidden bg-black outline-none"
    >
      {/* Route-agnostic, idempotent singletons. Render null; they keep
          telemetry / video / MAVLink / fleet live on this chromeless route. */}
      <AgentMavlinkBridge />
      <AgentBridges />
      <CloudDroneBridge />
      <LocalDroneBridge />
      <FleetProjectionBridge />

      {/* Registers plugin-contributed flight skills for the active drone into
          the Skill Bar registry and seeds their default bindings. Renders null. */}
      <PluginSkillHost />

      {/* L0 video + (as VideoCanvas children) L1 plugin overlay, L2 instrument
          HUD, and the native proximity radar. VideoCanvas renders children last
          inside its own stacking context, so they share the video rect exactly
          like the dashboard fly pane. */}
      <VideoCanvas className="absolute inset-0 z-0">
        {/* L1 plugin video overlay slot. A drone-scoped PluginHostProvider
            wraps the slot and the host streams VideoOverlayHostProps
            (rendered rect / stream resolution / attitude / detections) to each
            overlay iframe at detection rate. Renders nothing until a plugin
            contributes to the slot. */}
        {selectedDroneId && <VideoOverlayHost droneId={selectedDroneId} />}

        {/* L2 instrument HUD canvas (its own zIndex:5, pointer-events-none). */}
        <OsdOverlay />

        {/* Native proximity radar; renders null without OBSTACLE_DISTANCE data.
            Hidden on the low-power path. */}
        {!minimal && <ProximityRadar />}
      </VideoCanvas>

      {/* L3 cockpit chrome — viewport-anchored siblings of VideoCanvas. The full
          chrome is dropped on the low-power path (video + HUD only). */}
      {!minimal && (
        <>
          <CockpitTopBar onExit={exitCockpit} />

          {/* Minimap PiP. OverviewMap's container is `isolate`, which traps its
              internal Leaflet z-[1000] controls inside this card so they can
              never escape above the Skill Bar or a dialog. */}
          {showMinimap && (
            <div className="absolute top-12 left-3 z-20 w-[220px] h-[150px] pointer-events-auto">
              <OverviewMap />
            </div>
          )}

          {/* Optional numeric readout strip (off unless a preset opts in). */}
          {showStrip && <TelemetryStrip />}

          {/* EDIT banner — a clear, unmissable indicator that the dispatcher
              is paused and the bar is in binding-edit mode. */}
          {flyEnabled && editing && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center">
              <span className="pointer-events-auto mt-2 border border-accent-primary bg-bg-secondary/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-primary backdrop-blur-sm">
                {t("editBanner")}
              </span>
            </div>
          )}

          {/* Bottom-center: the live Skill Bar with an edit affordance, or the
              binding editor while editing. The bar self-gates to Fly Mode
              (renders null when off); the editor only mounts when Fly Mode is
              on. Both are pointer-events-auto on their own card. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
            {flyEnabled && editing ? (
              <SkillBarEditor onClose={() => setEditing(false)} />
            ) : (
              <div className="pointer-events-auto flex items-end gap-2">
                <SkillBar />
                {flyEnabled && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    aria-label={t("editBar")}
                    className="flex h-9 w-9 items-center justify-center self-center border border-border-default bg-bg-secondary/85 text-text-secondary backdrop-blur-sm transition-colors hover:border-accent-primary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                  >
                    <Settings2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* On the low-power path the top band is gone, so surface a standalone
          exit affordance instead. */}
      {minimal && <FlyExitButton onExit={exitCockpit} />}

      {/* L4 transient surfaces. The confirm host renders the shared dialog (via
          portal at its own high z) for the dispatch pipeline's pending policy. */}
      <SkillConfirmHost />
    </div>
  );
}
