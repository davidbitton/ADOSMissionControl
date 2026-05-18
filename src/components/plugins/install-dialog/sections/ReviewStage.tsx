/**
 * @module ReviewStage
 * @description Single-page composition of the plugin install review
 * surface. Replaces the previous summary + permissions wizard. The
 * stage is presentation-only: the orchestrator owns the granted-set
 * state, the compatibility result, and the install callback; the
 * stage only renders the layout.
 *
 * @license GPL-3.0-only
 */

"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import type { InstallManifestSummary } from "../../PluginInstallDialog";
import type { CompatibilityResult } from "../check-compatibility";

import { CompatibilitySection } from "./CompatibilitySection";
import { PermissionsSection } from "./PermissionsSection";
import { ReviewHeader } from "./ReviewHeader";
import { TrustStrip } from "./TrustStrip";
import { WhatItDoesSection } from "./WhatItDoesSection";
import { WhatsIncludedSection } from "./WhatsIncludedSection";
import {
  PublisherSection,
  RequiredFcParametersSection,
  SourceAndLicenseSection,
  TelemetryFieldsSection,
} from "./ExtrasSection";

export interface ReviewStageProps {
  manifest: InstallManifestSummary;
  iconUrl?: string;
  targetName: string;
  boardLabel: string;
  compatibility: CompatibilityResult;
  firstParty: boolean;
  granted: Set<string>;
  onTogglePermission: (id: string, required: boolean) => void;
  onCancel: () => void;
  onInstall: () => void;
}

export function ReviewStage({
  manifest,
  iconUrl,
  targetName,
  boardLabel,
  compatibility,
  firstParty,
  granted,
  onTogglePermission,
  onCancel,
  onInstall,
}: ReviewStageProps) {
  const t = useTranslations("pluginInstall.review");

  const installDisabled = !compatibility.boardCompatible;
  const grantedCount = granted.size;

  return (
    <div className="relative max-h-[85vh] overflow-y-auto bg-bg-secondary">
      <ReviewHeader
        manifest={manifest}
        iconUrl={iconUrl}
        targetName={targetName}
        boardLabel={boardLabel}
      />

      <div>
        <TrustStrip
          manifest={manifest}
          firstParty={firstParty}
          compatible={compatibility.boardCompatible}
        />

        {manifest.description && (
          <p className="px-4 pt-1 text-sm text-text-secondary">
            {manifest.description}
          </p>
        )}

        {manifest.descriptionLong && (
          <p className="whitespace-pre-line px-4 pb-3 pt-2 text-xs leading-relaxed text-text-secondary">
            {manifest.descriptionLong}
          </p>
        )}

        <div className="border-t border-border-default">
          <CompatibilitySection
            result={compatibility}
            boardLabel={boardLabel}
          />
          <WhatItDoesSection features={manifest.features} />
          <PermissionsSection
            manifest={manifest}
            granted={granted}
            onToggle={onTogglePermission}
          />
          <WhatsIncludedSection manifest={manifest} />
          <RequiredFcParametersSection manifest={manifest} />
          <TelemetryFieldsSection fields={manifest.telemetryFields} />
          <PublisherSection manifest={manifest} />
          <SourceAndLicenseSection manifest={manifest} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border-default bg-bg-secondary px-4 py-3 shadow-[0_-1px_0_0_var(--color-border-default)]">
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          onClick={onInstall}
          disabled={installDisabled}
          title={
            installDisabled
              ? t("installDisabledNotCompatible")
              : undefined
          }
        >
          {t("installWithPermissions", { n: grantedCount })}
        </Button>
      </div>
    </div>
  );
}
