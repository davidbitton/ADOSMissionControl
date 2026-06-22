/**
 * One hotbar slot in the Fly Mode Skill Bar. A square button that renders a
 * skill's icon, its bound hotkey label, and a state ring (idle / active /
 * cooldown / disabled). Every state carries a redundant non-colour cue so a
 * colour-blind operator distinguishes ready / active / cooldown / disabled by
 * shape and motion, not hue. The slot is a pure view of the registry's derived
 * state — it never asserts a state the drone is not in.
 *
 * @module fly/SkillSlot
 * @license GPL-3.0-only
 */

"use client";

import { useId, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Power,
  ArrowUpFromLine,
  ArrowDownToLine,
  Home,
  Pause,
  Play,
  XOctagon,
  Skull,
  LocateFixed,
  MoveVertical,
  Crosshair,
  Navigation,
  Route,
  Lock,
  CircleSlash,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Skill, SkillState } from "@/lib/skills/types";
import { skillDisplayLabel, skillEffectText } from "@/lib/skills/skill-label";
import { formatChord } from "@/lib/skills/chord";

/**
 * Built-in skill icons by lucide name. Plugin skills supply their own icon
 * name; an unknown name falls back to a generic glyph rather than crashing.
 */
const ICONS: Record<string, LucideIcon> = {
  Power,
  ArrowUpFromLine,
  ArrowDownToLine,
  Home,
  Pause,
  Play,
  XOctagon,
  Skull,
  LocateFixed,
  MoveVertical,
  Crosshair,
  Navigation,
  Route,
};

interface SkillSlotProps {
  index: number;
  /** The skill bound to this slot, or null for an empty slot. */
  skill: Skill | null;
  /** The skill's live state (idle fallback for an empty/uncomputed slot). */
  state: SkillState;
  /** The bound keyboard chord, displayed in the corner. */
  hotkey: string | null;
  /** The bound gamepad button index, displayed in the tooltip. */
  gamepadButton: number | null;
  /** Whether this skill is destructive (danger treatment). */
  danger: boolean;
  /** Fire the slot's skill through the dispatcher. */
  onActivate: () => void;
}

export function SkillSlot({
  index,
  skill,
  state,
  hotkey,
  gamepadButton,
  danger,
  onActivate,
}: SkillSlotProps) {
  const t = useTranslations();
  const descId = useId();

  const isDisabled = state.kind === "disabled" || skill === null;
  const isActive = state.kind === "active";
  const isCooldown = state.kind === "cooldown";
  const isToggle = skill?.toggle ?? false;

  // Built-in skill.label is a key root ("skills.arm") with display + effect at
  // "<root>.label"/"<root>.effect"; a plugin skill's label is a literal.
  const label = skill
    ? skillDisplayLabel(skill, t)
    : t("skills.bar.empty", { index: index + 1 });

  const Icon: LucideIcon | null = useMemo(() => {
    if (!skill) return null;
    return ICONS[skill.icon] ?? Sparkles;
  }, [skill]);

  const stateLabel = useMemo(() => {
    switch (state.kind) {
      case "active":
        return t("skills.state.active");
      case "cooldown":
        return t("skills.state.cooldown");
      case "disabled":
        return state.reason
          ? safeReason(t, state.reason)
          : t("skills.state.disabled");
      default:
        return t("skills.state.ready");
    }
  }, [state.kind, state.reason, t]);

  const hotkeyLabel = hotkey ? formatChord(hotkey) : null;

  // Accessible name carries everything the tooltip shows (label + hotkey +
  // state), so nothing is pointer-hover-only.
  const accessibleName = hotkeyLabel
    ? t("skills.bar.slotName", { label, hotkey: hotkeyLabel, state: stateLabel })
    : t("skills.bar.slotNameNoKey", { label, state: stateLabel });

  // Reason for a disabled slot, surfaced via a hidden description element
  // referenced by aria-describedby so a screen reader announces why the slot
  // is unavailable.
  const ariaDescription =
    isDisabled && skill && state.reason
      ? safeReason(t, state.reason)
      : undefined;

  const cooldownPct =
    isCooldown && typeof state.progress === "number"
      ? Math.max(0, Math.min(1, state.progress))
      : 0;

  const tooltipContent = (
    <div className="flex flex-col gap-0.5 text-left">
      <span className="text-text-primary font-medium">{label}</span>
      {skill && skillEffectText(skill, t) ? (
        <span className="text-text-tertiary">{skillEffectText(skill, t)}</span>
      ) : null}
      <span className="text-text-secondary">{stateLabel}</span>
      <span className="text-text-tertiary">
        {t("skills.tooltip.hotkey")}: {hotkeyLabel ?? t("skills.tooltip.none")}
        {gamepadButton !== null
          ? ` / ${t("skills.tooltip.gamepad", { button: gamepadButton })}`
          : ""}
      </span>
    </div>
  );

  return (
    <Tooltip content={tooltipContent} position="top">
      <button
        type="button"
        // A disabled slot stays focusable (aria-disabled, not the native
        // disabled attribute) so a keyboard / screen-reader pilot can land on
        // it and hear why it is unavailable; the click is gated below.
        onClick={() => {
          if (isDisabled) return;
          onActivate();
        }}
        aria-label={accessibleName}
        aria-describedby={ariaDescription ? descId : undefined}
        aria-pressed={isToggle ? isActive : undefined}
        aria-disabled={isDisabled}
        data-skill-id={skill?.id}
        className={cn(
          "relative h-14 w-14 shrink-0 flex items-center justify-center",
          "border bg-bg-tertiary transition-colors select-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
          // Idle / ready: thin steady neutral ring.
          !isActive && !isCooldown && !isDisabled && !danger && "border-border-default",
          // Active: bright ring + glow + a "latched" inset (redundant non-colour cue).
          isActive && !danger && "border-accent-primary ring-1 ring-accent-primary/60 shadow-[0_0_12px_rgba(58,130,255,0.45)] motion-safe:animate-pulse",
          // Cooldown: dimmed icon; the sweep arc (shape/motion) is the cue.
          isCooldown && "border-accent-primary/40 opacity-80",
          // Disabled: reduced opacity, muted border (the lock glyph is the cue).
          isDisabled && "border-border-default/40 opacity-40 cursor-not-allowed",
          // Danger ring (secondary cue alongside the glyph + the confirm gate).
          danger && !isDisabled && !isActive && "border-status-error/60",
          danger && isActive && "border-status-error ring-1 ring-status-error/60 shadow-[0_0_12px_rgba(239,68,68,0.45)]",
        )}
      >
        {/* Cooldown radial sweep — a shape cue, not a hue cue. Respects
            prefers-reduced-motion by rendering a static arc fill. */}
        {isCooldown ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: `conic-gradient(rgba(58,130,255,0.35) ${
                cooldownPct * 360
              }deg, transparent 0deg)`,
            }}
          />
        ) : null}

        {Icon ? (
          <Icon
            size={20}
            className={cn(
              danger ? "text-status-error" : "text-text-primary",
              isDisabled && "text-text-tertiary",
            )}
          />
        ) : (
          <span className="text-text-tertiary text-lg leading-none">+</span>
        )}

        {/* Active "latched" filled-corner dot (non-colour redundant cue). */}
        {isActive ? (
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1 right-1 h-1.5 w-1.5 rounded-full",
              danger ? "bg-status-error" : "bg-accent-primary",
            )}
          />
        ) : null}

        {/* Disabled lock glyph (non-colour redundant cue). */}
        {isDisabled && skill ? (
          <Lock
            aria-hidden="true"
            size={10}
            className="absolute top-1 right-1 text-text-tertiary"
          />
        ) : null}

        {/* Danger strike glyph when a destructive skill is unfireable. */}
        {danger && isDisabled && skill ? (
          <CircleSlash
            aria-hidden="true"
            size={10}
            className="absolute bottom-1 right-1 text-status-error/70"
          />
        ) : null}

        {/* Hotkey label, bottom-left corner. */}
        {hotkeyLabel ? (
          <span className="absolute bottom-0.5 left-1 text-[9px] font-mono leading-none text-text-tertiary">
            {hotkeyLabel}
          </span>
        ) : (
          <span className="absolute bottom-0.5 left-1 text-[9px] font-mono leading-none text-text-tertiary/50">
            {index + 1}
          </span>
        )}

        {/* Optional state badge (e.g. a locked target id). */}
        {state.badge ? (
          <span className="absolute bottom-0.5 right-1 text-[9px] font-mono leading-none text-accent-primary">
            {state.badge}
          </span>
        ) : null}

        {/* Hidden reason for assistive tech (the why-disabled line). */}
        {ariaDescription ? (
          <span id={descId} className="sr-only">
            {ariaDescription}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}

/**
 * A disabled reason is a fully-qualified i18n key under "skills"
 * (e.g. "skills.reason.noFcLink"). Fall back to the raw string when a plugin
 * supplies a non-key reason so the slot never renders a key.
 */
function safeReason(
  t: ReturnType<typeof useTranslations>,
  reason: string,
): string {
  if (reason.startsWith("skills.")) {
    return t(reason);
  }
  return reason;
}
