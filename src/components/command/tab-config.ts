/**
 * @module command/tab-config
 * @description Typed tab descriptor list for the Command page sub-tabs.
 * Pulled out of CommandPage so the orchestrator stays focused on
 * routing + state and the descriptor stays trivially testable.
 * @license GPL-3.0-only
 */

import type { ComponentType } from "react";
import {
  Cpu,
  Monitor,
  Plug,
  Sparkles,
  TerminalSquare,
  Wrench,
  Zap,
} from "lucide-react";
import type { useTranslations } from "next-intl";
import type { CommandSubTab } from "@/hooks/use-visible-tabs";

type LucideIcon = ComponentType<{ size?: number | string; className?: string }>;

export interface CommandTabDescriptor {
  label: string;
  icon: LucideIcon;
}

export type CommandTabConfig = Record<CommandSubTab, CommandTabDescriptor>;

/**
 * Build the per-tab descriptor map. Takes the live translator so the
 * labels rebuild on locale change.
 *
 * `t` is a fresh function ref per render so memoising on `[t]` never
 * hits the cache; callers can call this inline cheaply.
 */
export function buildCommandTabConfig(
  t: ReturnType<typeof useTranslations>,
): CommandTabConfig {
  return {
    overview: { label: t("overview"), icon: Monitor },
    features: { label: "Features", icon: Sparkles },
    "smart-modes": { label: "Smart Modes", icon: Zap },
    ros: { label: "ROS", icon: Cpu },
    system: { label: "System", icon: Wrench },
    scripts: { label: t("scripts"), icon: TerminalSquare },
    plugins: { label: "Plugins", icon: Plug },
  };
}
