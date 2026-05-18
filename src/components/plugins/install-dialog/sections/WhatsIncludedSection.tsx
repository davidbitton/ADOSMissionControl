/**
 * @module WhatsIncludedSection
 * @description Surfaces the plugin source license plus any bundled
 * vendor binaries the manifest declares. The section auto-expands
 * when at least one vendor binary is present so the operator sees
 * the closed-source dependency before approving the install.
 *
 * @license GPL-3.0-only
 */

"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { CollapsibleSection } from "@/components/ui/collapsible-section";

import type { InstallManifestSummary } from "../../PluginInstallDialog";

export function WhatsIncludedSection({
  manifest,
}: {
  manifest: InstallManifestSummary;
}) {
  const t = useTranslations("pluginInstall.review");
  const vendors = manifest.vendorAttribution ?? [];
  const hasVendor = vendors.length > 0;
  return (
    <CollapsibleSection title={t("whatsIncluded.title")} defaultOpen={hasVendor}>
      <div className="space-y-1.5 px-3 py-2 text-xs">
        {manifest.license && (
          <p className="text-text-secondary">
            {t("whatsIncluded.pluginSource", { license: manifest.license })}
          </p>
        )}
        {vendors.map((v, idx) => (
          <p
            key={idx}
            className="flex items-start gap-2 text-status-warning"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {t("whatsIncluded.vendorBinary", {
                name: v.name ?? "vendor",
                license: v.license ?? "unknown",
              })}
            </span>
          </p>
        ))}
      </div>
    </CollapsibleSection>
  );
}
