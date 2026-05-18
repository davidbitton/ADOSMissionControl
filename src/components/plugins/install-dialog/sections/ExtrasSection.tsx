/**
 * @module ExtrasSection
 * @description Collapsed-by-default supplementary sections rendered
 * below the primary review surface: required FC parameters, emitted
 * telemetry topics, publisher / signature info, and the plugin's
 * source repository + license. Each section hides when its manifest
 * fields are absent.
 *
 * @license GPL-3.0-only
 */

"use client";

import { useTranslations } from "next-intl";

import { CollapsibleSection } from "@/components/ui/collapsible-section";

import type { InstallManifestSummary } from "../../PluginInstallDialog";

export function RequiredFcParametersSection({
  manifest,
}: {
  manifest: InstallManifestSummary;
}) {
  const t = useTranslations("pluginInstall.review");
  const groups = manifest.requiredFcParameters;
  const hasAny =
    !!groups &&
    !!(
      (groups.ardupilot && groups.ardupilot.length) ||
      (groups.px4 && groups.px4.length) ||
      (groups.inav && groups.inav.length)
    );
  if (!hasAny) return null;
  return (
    <CollapsibleSection title={t("fcParams.title")}>
      <div className="space-y-2 px-3 py-2 text-xs">
        {(["ardupilot", "px4", "inav"] as const).map((firmware) => {
          const rows = groups?.[firmware];
          if (!rows || rows.length === 0) return null;
          return (
            <div key={firmware} className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                {firmware}
              </p>
              <ul className="space-y-0.5 text-text-secondary">
                {rows.map((row, idx) => (
                  <li key={idx} className="font-mono text-[11px]">
                    {row.param}
                    {row.value !== undefined ? ` = ${row.value}` : ""}
                    {row.note ? ` — ${row.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

export function TelemetryFieldsSection({
  fields,
}: {
  fields?: ReadonlyArray<string>;
}) {
  const t = useTranslations("pluginInstall.review");
  if (!fields || fields.length === 0) return null;
  return (
    <CollapsibleSection title={t("telemetry.title")}>
      <ul className="space-y-0.5 px-3 py-2 font-mono text-[11px] text-text-secondary">
        {fields.map((f, idx) => (
          <li key={idx}>{f}</li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}

export function PublisherSection({
  manifest,
}: {
  manifest: InstallManifestSummary;
}) {
  const t = useTranslations("pluginInstall.review");
  return (
    <CollapsibleSection title={t("publisher.title")}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-xs">
        {manifest.author && (
          <Row label={t("publisher.author")} value={manifest.author} />
        )}
        {manifest.signerId ? (
          <Row label={t("publisher.signer")} value={manifest.signerId} mono />
        ) : (
          <Row
            label={t("publisher.signer")}
            value={t("publisher.unsignedNote")}
          />
        )}
      </dl>
    </CollapsibleSection>
  );
}

export function SourceAndLicenseSection({
  manifest,
}: {
  manifest: InstallManifestSummary;
}) {
  const t = useTranslations("pluginInstall.review");
  if (!manifest.license && !manifest.documentationUrl) return null;
  return (
    <CollapsibleSection title={t("sourceLicense.title")}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-xs">
        {manifest.license && (
          <Row label={t("sourceLicense.license")} value={manifest.license} />
        )}
        {manifest.documentationUrl && (
          <Row
            label={t("sourceLicense.docs")}
            value={manifest.documentationUrl}
          />
        )}
      </dl>
    </CollapsibleSection>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-text-tertiary">{label}</dt>
      <dd
        className={
          "truncate text-text-primary " + (mono ? "font-mono text-[11px]" : "")
        }
      >
        {value}
      </dd>
    </>
  );
}
