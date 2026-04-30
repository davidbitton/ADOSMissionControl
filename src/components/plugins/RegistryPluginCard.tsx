"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { RiskBadge } from "@/components/plugins/RiskBadge";
import { TrustBadge } from "@/components/plugins/TrustBadge";
import type { RegistryPluginCard } from "@/lib/plugins/registry-client";

export function RegistryPluginCardItem({ card }: { card: RegistryPluginCard }) {
  const t = useTranslations("plugins.browse");
  return (
    <Link
      href={`/config/plugins/browse/${encodeURIComponent(card.pluginId)}`}
      className="block h-full rounded-md border border-border-default bg-bg-secondary p-3 transition-colors hover:border-accent-primary/50 hover:bg-bg-tertiary"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-tertiary text-base font-semibold text-text-secondary">
          {card.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.iconUrl} alt="" className="h-10 w-10 rounded-md" />
          ) : (
            card.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-text-primary">
              {card.name}
            </h3>
            <RiskBadge level={card.risk} size="sm" />
          </div>
          <p className="line-clamp-2 text-xs text-text-tertiary">
            {card.shortDescription}
          </p>
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            <span className="truncate">{card.author}</span>
            {card.authorVerified && (
              <span
                className="text-accent-primary"
                title={t("verifiedAuthor")}
                aria-label={t("verifiedAuthor")}
              >
                &#10003;
              </span>
            )}
            <span aria-hidden>&middot;</span>
            <span>{formatInstallCount(card.installCount)}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {card.signed && <TrustBadge signal="signed" />}
            {card.firstParty && <TrustBadge signal="verified-publisher" />}
            {card.openSource && <TrustBadge signal="open-source" />}
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatInstallCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
