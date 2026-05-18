"use client";

/**
 * @module RegistryPluginCard
 * @description Inline card rendered on the per-drone Plugins tab for one
 * registry plugin. Surfaces the catalog name, description, license + tier
 * badges, and an Install button that's compatibility-gated against the
 * connected drone. Click Install — the parent grid downloads the signed
 * archive, parses the manifest, and opens the existing
 * `PluginInstallDialog` directly at the `summary` stage so the operator
 * lands in the review → permissions → install flow without the modal
 * detour.
 *
 * Lifted from the modal's now-removed `RegistryStage` so the visual
 * language stays identical with the public marketing page and the old
 * modal browse path.
 *
 * @license GPL-3.0-only
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Package } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { RiskBadge } from "../../plugins/RiskBadge";
import { useRegistryCompatibility } from "../../plugins/install-dialog/use-registry-compatibility";

type RegistryCategory = "drivers" | "ui" | "ai" | "telemetry" | "tools";

export interface RegistryPluginRow {
  _id: string;
  plugin_id: string;
  name: string;
  description: string;
  category: RegistryCategory;
  license: string;
  author_id: string;
  verified_publisher: boolean;
  latest_version: string;
  icon_url?: string;
  tier?: "first_party" | "verified" | "community";
}

type CardState = "loading" | { error: string } | undefined;

export interface RegistryPluginCardProps {
  plugin: RegistryPluginRow;
  /** Whether the plugin already lives on the target drone's install
   * state. When `true` the card disables Install and surfaces an
   * "Installed" pill. */
  installed: boolean;
  /** Transient install state managed by the parent grid. */
  state: CardState;
  onInstall: () => void;
}

export function RegistryPluginCard({
  plugin,
  installed,
  state,
  onInstall,
}: RegistryPluginCardProps) {
  const t = useTranslations("pluginRegistry.browse");

  // `listPlugins` returns the plugin row but not the per-version
  // compatibility envelope. `getPlugin` fills in `agent_min_version`
  // and `supported_boards`; Convex deduplicates the subscription
  // across cards that share an id.
  const detail = useQuery(api.pluginRegistry.getPlugin, {
    pluginId: plugin.plugin_id,
  }) as
    | {
        versions: ReadonlyArray<{
          version: string;
          agent_min_version: string;
          agent_max_version?: string;
          supported_boards?: ReadonlyArray<string>;
        }>;
      }
    | null
    | undefined;

  const latestVersionRow = useMemo(() => {
    if (!detail || detail === null) return null;
    return (
      detail.versions.find((v) => v.version === plugin.latest_version) ?? null
    );
  }, [detail, plugin.latest_version]);

  const compat = useRegistryCompatibility(
    latestVersionRow ?? {
      agent_min_version: plugin.latest_version,
      supported_boards: undefined,
    },
  );

  const isLoading = state === "loading";
  const errMessage =
    state && typeof state === "object" && "error" in state ? state.error : null;

  // Hard blocks: the install genuinely cannot proceed.
  //   * no_agent: no drone to install into
  //   * version: agent version is out of range, the agent will reject
  //   * isLoading: install in flight, debounce
  //   * installed: already on the drone
  // Soft warnings: the install MIGHT not work but the agent re-checks
  // every constraint at archive time and rejects cleanly. Keep the
  // button clickable so the operator can try; surface the warning so
  // they know what to expect.
  //   * !latestVersionRow: registry detail subscription hasn't resolved
  //     (or version row missing from the registry); the manifest still
  //     comes from the downloaded archive itself.
  //   * board mismatch: supported_boards lists are aspirational; the
  //     agent revalidates on install.
  const compatHardBlock =
    !compat.compatible &&
    (compat.reason === "no_agent" || compat.reason === "version");
  const compatSoftWarning =
    !latestVersionRow ||
    (!compat.compatible && compat.reason === "board");

  const disabled = installed || isLoading || compatHardBlock;

  const tooltip = (() => {
    if (installed) return undefined;
    if (compat.reason === "no_agent") {
      return compat.detail ?? t("card.notCompatible.noAgent");
    }
    if (compat.reason === "version") {
      return t("card.notCompatible.version", {
        version: compat.detail ?? "?",
      });
    }
    if (!latestVersionRow) {
      return t("card.notCompatible.loadingDetail");
    }
    if (compat.reason === "board") {
      return t("card.notCompatible.board");
    }
    return undefined;
  })();

  const warningText = (() => {
    if (!compatSoftWarning) return null;
    if (!latestVersionRow) {
      return t("card.notCompatible.loadingDetail");
    }
    if (compat.reason === "board") {
      return t("card.notCompatible.board");
    }
    return null;
  })();

  const tierKey =
    plugin.tier ?? (plugin.verified_publisher ? "verified" : "community");

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border-default bg-bg-secondary p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-tertiary text-base font-semibold text-text-secondary">
          {plugin.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plugin.icon_url} alt="" className="h-10 w-10 rounded-md" />
          ) : (
            <Package className="h-5 w-5 text-text-tertiary" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate text-sm font-medium text-text-primary">
              {plugin.name}
            </h4>
            <RiskBadge level="low" size="sm" />
            {installed && (
              <Badge variant="success" size="sm">
                {t("card.installedPill")}
              </Badge>
            )}
          </div>
          <p className="line-clamp-2 text-xs text-text-tertiary">
            {plugin.description}
          </p>
          <div className="flex flex-wrap items-center gap-1 text-xs text-text-tertiary">
            <span className="truncate">{plugin.author_id}</span>
            <span aria-hidden>·</span>
            <span>v{plugin.latest_version}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="info" size="sm">
              {plugin.license}
            </Badge>
            <Badge
              variant={tierKey === "first_party" ? "success" : "info"}
              size="sm"
            >
              {t(`card.tierBadge.${tierKey}`)}
            </Badge>
          </div>
        </div>
      </div>

      {errMessage && (
        <div
          className="flex items-start justify-between gap-2 rounded border border-status-error/40 bg-status-error/10 px-2 py-1.5 text-xs text-status-error"
          role="alert"
        >
          <div className="min-w-0 flex-1 break-words">
            <p className="font-medium">{t("card.error.title")}</p>
            <p className="mt-0.5 text-[11px] opacity-90">{errMessage}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onInstall}
            className="shrink-0"
          >
            {t("card.error.retry")}
          </Button>
        </div>
      )}

      {warningText && !errMessage && (
        <p
          className="rounded border border-status-warning/40 bg-status-warning/10 px-2 py-1 text-[11px] text-status-warning"
          role="status"
        >
          {warningText}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant={installed || compatHardBlock ? "secondary" : "primary"}
          disabled={disabled}
          onClick={onInstall}
          title={tooltip}
        >
          {installed
            ? t("card.installed")
            : isLoading
              ? t("card.installing")
              : t("card.install")}
        </Button>
      </div>
    </li>
  );
}
