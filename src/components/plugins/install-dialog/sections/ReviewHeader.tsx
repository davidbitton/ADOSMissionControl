/**
 * @module ReviewHeader
 * @description Sticky identity strip for the plugin install review page.
 * Shows the plugin icon (or a letter avatar), name, "by {author} ·
 * v{version}", and the target drone with its board id so the operator
 * always knows where the install is about to land.
 *
 * @license GPL-3.0-only
 */

"use client";

import { Package } from "lucide-react";
import { useTranslations } from "next-intl";

import type { InstallManifestSummary } from "../../PluginInstallDialog";

export function ReviewHeader({
  manifest,
  iconUrl,
  targetName,
  boardLabel,
}: {
  manifest: InstallManifestSummary;
  iconUrl?: string;
  targetName: string;
  boardLabel: string;
}) {
  const t = useTranslations("pluginInstall.review");
  return (
    <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border-default bg-bg-secondary px-4 py-3 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-tertiary">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className="h-10 w-10 rounded-md" />
        ) : manifest.name ? (
          <span className="text-lg font-semibold uppercase text-text-secondary">
            {manifest.name.slice(0, 1)}
          </span>
        ) : (
          <Package className="h-5 w-5 text-text-tertiary" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <h3 className="truncate text-sm font-semibold text-text-primary">
          {manifest.name}
        </h3>
        <p className="text-xs text-text-tertiary">
          {manifest.author
            ? t("byAuthorVersion", {
                author: manifest.author,
                version: manifest.version,
              })
            : `v${manifest.version}`}
        </p>
        <p className="text-xs text-text-secondary">
          {t("installingTo", { drone: targetName, board: boardLabel })}
        </p>
      </div>
    </div>
  );
}
