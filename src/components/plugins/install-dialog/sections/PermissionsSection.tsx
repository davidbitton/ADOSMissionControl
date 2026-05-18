/**
 * @module PermissionsSection
 * @description Renders the plugin's permission catalog grouped by
 * category (Hardware, Flight Control, Data & Network, Compute &
 * Process, UI Slots). Each row carries a plain-language label, the
 * technical id, a `required` pill, an optional `Sensitive` pill for
 * high/critical-risk permissions, and a help icon that reveals the
 * description on hover. Optional permissions render as a toggle that
 * defaults to off until the operator opts in.
 *
 * @license GPL-3.0-only
 */

"use client";

import { useMemo } from "react";
import {
  ArrowUpFromLine,
  Camera,
  Cpu,
  Database,
  HelpCircle,
  Layout,
  Lock,
  Network,
  Plane,
  Radio,
  Shield,
  Usb,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { InstallManifestSummary } from "../../PluginInstallDialog";

type Category = NonNullable<
  InstallManifestSummary["permissions"][number]["category"]
>;

const CATEGORY_ORDER: ReadonlyArray<Category | "other"> = [
  "hardware",
  "flight_control",
  "compute_process",
  "data_network",
  "ui_slot",
  "other",
];

/** Pick an icon per permission id. Falls back to a generic shield. */
function pickIcon(id: string, category?: Category): typeof Shield {
  if (id.startsWith("hardware.usb")) return Usb;
  if (id.startsWith("hardware.camera")) return Camera;
  if (id.startsWith("hardware.")) return Cpu;
  if (id.startsWith("mavlink") || id.startsWith("command.send"))
    return ArrowUpFromLine;
  if (id.startsWith("telemetry")) return Radio;
  if (id.startsWith("mission")) return Plane;
  if (id.startsWith("process") || id.startsWith("compute")) return Cpu;
  if (id.startsWith("network") || id.startsWith("cloud")) return Network;
  if (id.startsWith("ui.slot")) return Layout;
  if (id.startsWith("data") || id.startsWith("recording")) return Database;
  if (category === "hardware") return Cpu;
  if (category === "flight_control") return ArrowUpFromLine;
  if (category === "compute_process") return Cpu;
  if (category === "data_network") return Network;
  if (category === "ui_slot") return Layout;
  return Shield;
}

export function PermissionsSection({
  manifest,
  granted,
  onToggle,
}: {
  manifest: InstallManifestSummary;
  granted: Set<string>;
  onToggle: (id: string, required: boolean) => void;
}) {
  const t = useTranslations("pluginInstall.review");

  // Group permissions by category, preserving declaration order
  // inside each bucket so the manifest's author intent comes through.
  const grouped = useMemo(() => {
    const buckets: Record<string, InstallManifestSummary["permissions"]> = {};
    for (const p of manifest.permissions) {
      const cat = (p.category ?? "other") as string;
      if (!buckets[cat]) buckets[cat] = [];
      (buckets[cat] as unknown as Array<typeof p>).push(p);
    }
    return buckets;
  }, [manifest.permissions]);

  const requiredCount = manifest.permissions.filter((p) => p.required).length;
  const optionalCount = manifest.permissions.length - requiredCount;

  return (
    <CollapsibleSection
      title={t("permissions.title", {
        required: requiredCount,
        optional: optionalCount,
      })}
      defaultOpen
    >
      <div className="space-y-2 px-2 py-2">
        {CATEGORY_ORDER.map((cat) => {
          const list = grouped[cat];
          if (!list || list.length === 0) return null;
          return (
            <div key={cat} className="space-y-1">
              <h4 className="px-2 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                {t(`permissions.category.${cat}`)}
              </h4>
              <ul className="divide-y divide-border-default rounded-md border border-border-default">
                {list.map((perm) => (
                  <PermissionRow
                    key={perm.id}
                    perm={perm}
                    on={granted.has(perm.id)}
                    onToggle={onToggle}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

function PermissionRow({
  perm,
  on,
  onToggle,
}: {
  perm: InstallManifestSummary["permissions"][number];
  on: boolean;
  onToggle: (id: string, required: boolean) => void;
}) {
  const t = useTranslations("pluginInstall.review");
  const Icon = pickIcon(perm.id, perm.category);
  const sensitive = perm.risk === "high" || perm.risk === "critical";

  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm text-text-primary">
            {perm.label ?? perm.id}
          </p>
          {perm.description && (
            <Tooltip content={perm.description} position="top" multiline>
              <HelpCircle
                className="h-3 w-3 cursor-help text-text-tertiary"
                aria-hidden
              />
            </Tooltip>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <code className="font-mono text-[10px] text-text-tertiary">
            {perm.id}
          </code>
          {perm.required && (
            <span className="inline-flex items-center gap-0.5 rounded bg-bg-tertiary px-1 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
              <Lock className="h-2.5 w-2.5" />
              {t("permissions.required")}
            </span>
          )}
          {sensitive && (
            <span className="inline-flex items-center rounded border border-status-warning/40 bg-status-warning/10 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-warning">
              {t("permissions.sensitive")}
            </span>
          )}
          {perm.unknown && (
            <span className="inline-flex items-center rounded border border-status-error/40 bg-status-error/10 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-error">
              {t("permissions.unknown")}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Toggle ${perm.id}`}
        disabled={perm.required}
        onClick={() => onToggle(perm.id, perm.required)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors",
          perm.required
            ? "cursor-not-allowed border-accent-primary/40 bg-accent-primary/40"
            : on
              ? "cursor-pointer border-accent-primary bg-accent-primary"
              : "cursor-pointer border-border-default bg-bg-tertiary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-text-primary transition-all",
            on || perm.required ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </li>
  );
}
