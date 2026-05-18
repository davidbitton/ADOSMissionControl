/**
 * @module TrustStrip
 * @description Three-chip horizontal strip beneath the modal header
 * showing risk, signature, and compatibility status. The chips read
 * directly from the manifest (no card-level hardcoding) so the
 * displayed risk matches what the plugin author actually declared.
 *
 * @license GPL-3.0-only
 */

"use client";

import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import type { InstallManifestSummary } from "../../PluginInstallDialog";
import type { PluginRiskLevel } from "@/lib/plugins/types";

const RISK_CLASS: Record<PluginRiskLevel, string> = {
  low: "border-status-success/40 bg-status-success/10 text-status-success",
  medium:
    "border-accent-primary/40 bg-accent-primary/10 text-accent-primary",
  high: "border-status-warning/40 bg-status-warning/10 text-status-warning",
  critical: "border-status-error/40 bg-status-error/10 text-status-error",
};

export function TrustStrip({
  manifest,
  firstParty,
  compatible,
}: {
  manifest: InstallManifestSummary;
  firstParty: boolean;
  compatible: boolean;
}) {
  const t = useTranslations("pluginInstall.review");

  const signerChip = (() => {
    if (manifest.signerId) {
      return (
        <Chip
          icon={<CheckCircle2 className="h-3 w-3" />}
          className="border-status-success/40 bg-status-success/10 text-status-success"
        >
          {t("trust.signedBy", { signerId: manifest.signerId })}
        </Chip>
      );
    }
    if (firstParty) {
      return (
        <Chip
          icon={<Sparkles className="h-3 w-3" />}
          className="border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
        >
          {t("trust.firstParty")}
        </Chip>
      );
    }
    return null;
  })();

  const verifiedChip = manifest.trustSignals.includes("verified-publisher") ? (
    <Chip
      icon={<BadgeCheck className="h-3 w-3" />}
      className="border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
    >
      {t("trust.verifiedPublisher")}
    </Chip>
  ) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
      <Chip className={RISK_CLASS[manifest.risk]}>
        {t(`trust.risk.${manifest.risk}`)}
      </Chip>
      {signerChip}
      {verifiedChip}
      {compatible ? (
        <Chip
          icon={<Check className="h-3 w-3" />}
          className="border-status-success/40 bg-status-success/10 text-status-success"
        >
          {t("trust.compatible")}
        </Chip>
      ) : (
        <Chip
          icon={<X className="h-3 w-3" />}
          className="border-status-error/40 bg-status-error/10 text-status-error"
        >
          {t("trust.notCompatible")}
        </Chip>
      )}
    </div>
  );
}

function Chip({
  children,
  icon,
  className,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium " +
        (className ?? "")
      }
    >
      {icon}
      {children}
    </span>
  );
}
