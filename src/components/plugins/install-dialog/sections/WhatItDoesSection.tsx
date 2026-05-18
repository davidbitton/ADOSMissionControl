/**
 * @module WhatItDoesSection
 * @description Renders the manifest's feature bullets under the
 * "What it does" header. Hidden when the manifest carries no features
 * list.
 *
 * @license GPL-3.0-only
 */

"use client";

import { useTranslations } from "next-intl";

import { CollapsibleSection } from "@/components/ui/collapsible-section";

export function WhatItDoesSection({
  features,
}: {
  features?: ReadonlyArray<string>;
}) {
  const t = useTranslations("pluginInstall.review");
  if (!features || features.length === 0) return null;
  return (
    <CollapsibleSection title={t("whatItDoes.title")} defaultOpen>
      <ul className="list-disc space-y-1 px-6 py-2 text-xs text-text-secondary">
        {features.map((f, idx) => (
          <li key={idx}>{f}</li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}
