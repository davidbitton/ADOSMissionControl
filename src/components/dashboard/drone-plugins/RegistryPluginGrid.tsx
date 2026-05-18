"use client";

/**
 * @module RegistryPluginGrid
 * @description Inline registry catalog rendered on the per-drone Plugins
 * tab below the installed list. Surfaces every published first-party
 * plugin via Convex `pluginRegistry.listPlugins`, applies client-side
 * search + category filtering, and on Install click reads the version
 * row's manifest YAML, parses it for the dialog preview, and opens
 * `<PluginInstallDialog>` directly at the `review` stage. The dialog
 * then hands the URL + SHA256 pin to the agent's
 * `POST /api/plugins/install_from_url` endpoint so the archive is never
 * pulled through the browser.
 *
 * Already-installed plugins (read from `cmdPlugins:listForDevice`)
 * render with an Installed pill and a disabled Install button. The
 * compat hook gates Install on each card against the connected drone's
 * agent version + board.
 *
 * @license GPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useTranslations } from "next-intl";
import { Package, Search } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import { isDemoMode, cn } from "@/lib/utils";
import type { FleetDrone } from "@/lib/types";

import {
  PluginInstallDialog,
  type InstallTargetDrone,
  type InstallManifestSummary,
  type InstallSource,
} from "@/components/plugins/PluginInstallDialog";
import {
  parseManifestYaml,
  toInstallSummary,
} from "@/components/plugins/transports/manifest-parse";

import {
  RegistryPluginCard,
  type RegistryPluginRow,
} from "./RegistryPluginCard";

type RegistryCategory = "drivers" | "ui" | "ai" | "telemetry" | "tools";
type CategoryFilter = "all" | RegistryCategory;

const CATEGORIES: ReadonlyArray<RegistryCategory> = [
  "drivers",
  "ui",
  "ai",
  "telemetry",
  "tools",
];

interface ListPluginsResult {
  items: ReadonlyArray<RegistryPluginRow>;
  nextCursor: string | null;
  total: number;
}

/** Subset of the version row the install path needs. The full row
 * carries signing + analysis metadata the registry uses to render
 * trust signals; we just need the manifest YAML, the canonical
 * download URL, and the SHA-256 pin so the agent can verify the
 * archive bytes after pulling them. */
interface RegistryVersionLite {
  manifest_yaml: string;
  download_url: string;
  archive_sha256: string;
}

const getVersionRef = makeFunctionReference<
  "query",
  { pluginId: string; version: string },
  RegistryVersionLite | null
>("pluginRegistry:getVersion");

/** Per-device install row shape (subset). Only needs `pluginId` so the
 * grid can mark installed plugins on their card. */
interface InstallRowForDevice {
  pluginId: string;
}

const listForDeviceRef = makeFunctionReference<
  "query",
  { deviceId: string },
  InstallRowForDevice[]
>("cmdPlugins:listForDevice");

type CardState = "loading" | { error: string } | undefined;

interface PendingInstall {
  manifest: InstallManifestSummary;
  manifestHash: string;
  source: Extract<InstallSource, { kind: "registry" }>;
}

export interface RegistryPluginGridProps {
  drone: FleetDrone;
}

export function RegistryPluginGrid({ drone }: RegistryPluginGridProps) {
  const t = useTranslations("pluginRegistry.browse");
  const convexAvailable = useConvexAvailable();

  const catalog = useQuery(
    api.pluginRegistry.listPlugins,
    convexAvailable && !isDemoMode() ? {} : "skip",
  ) as ListPluginsResult | undefined;

  // Already-installed plugin ids on this drone so we can mark cards.
  // Run unconditionally (modulo demo mode); the Convex query returns
  // an empty list for unauthenticated callers, which is the correct
  // behaviour for LAN-only mode where the operator may not be signed
  // in to the cloud relay but still wants to see and install plugins
  // on their paired drone.
  const installs = useConvexSkipQuery(listForDeviceRef, {
    args: { deviceId: drone.cloudDeviceId ?? drone.id },
    enabled: !isDemoMode(),
  });
  const installedIds = useMemo(() => {
    if (!installs) return new Set<string>();
    return new Set(installs.map((row) => row.pluginId));
  }, [installs]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [cardState, setCardState] = useState<Record<string, CardState>>({});
  const [pending, setPending] = useState<PendingInstall | null>(null);
  const [pendingFetch, setPendingFetch] = useState<{
    pluginId: string;
    version: string;
  } | null>(null);

  // Drive the version lookup reactively so the install handler can
  // wait for the result without an action hop. Convex deduplicates
  // overlapping subscriptions across cards that share an id.
  const versionRow = useQuery(
    getVersionRef,
    pendingFetch && convexAvailable
      ? { pluginId: pendingFetch.pluginId, version: pendingFetch.version }
      : "skip",
  ) as RegistryVersionLite | null | undefined;

  const installTarget = useMemo<InstallTargetDrone>(
    () => ({
      _id: drone.cloudDeviceId ?? drone.id,
      deviceId: drone.cloudDeviceId ?? drone.id,
      name: drone.name ?? drone.id,
    }),
    [drone],
  );

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const needle = search.trim().toLowerCase();
    return catalog.items.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (needle) {
        const haystack = `${p.name} ${p.description}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [catalog, search, category]);

  // Once the version row resolves, parse its embedded manifest yaml
  // and open the dialog with a registry-source descriptor.
  useEffect(() => {
    if (!pendingFetch || versionRow === undefined) return;
    const key = pendingFetch.pluginId;
    const targetVersion = pendingFetch.version;
    setPendingFetch(null);
    if (!versionRow) {
      setCardState((prev) => ({
        ...prev,
        [key]: { error: `[registry.lookup] version row missing` },
      }));
      return;
    }
    (async () => {
      try {
        const yaml = versionRow.manifest_yaml;
        const parsed = parseManifestYaml(yaml);
        const hashBytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(yaml),
        );
        const manifestHash = Array.from(new Uint8Array(hashBytes))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const summary = toInstallSummary(parsed, manifestHash);

        setCardState((prev) => ({ ...prev, [key]: undefined }));
        setPending({
          manifest: summary,
          manifestHash,
          source: {
            kind: "registry",
            url: versionRow.download_url,
            expectedSha256: versionRow.archive_sha256,
            pluginId: key,
            version: targetVersion,
          },
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        console.error("[plugin install]", key, "manifest.parse", err);
        setCardState((prev) => ({
          ...prev,
          [key]: { error: `[manifest.parse] ${raw}` },
        }));
      }
    })();
  }, [pendingFetch, versionRow]);

  const handleInstall = useCallback((plugin: RegistryPluginRow) => {
    const key = plugin.plugin_id;
    setCardState((prev) => ({ ...prev, [key]: "loading" }));
    setPendingFetch({ pluginId: key, version: plugin.latest_version });
  }, []);

  if (!convexAvailable || isDemoMode()) {
    return (
      <section className="space-y-2">
        <SectionHeader t={t} />
        <ErrorMessage text={t("error.unavailable")} />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <SectionHeader t={t} />
      <Toolbar
        search={search}
        setSearch={setSearch}
        category={category}
        setCategory={setCategory}
        t={t}
      />

      {catalog === undefined && <SkeletonList />}

      {catalog !== undefined && filtered.length === 0 && <EmptyState t={t} />}

      {catalog !== undefined && filtered.length > 0 && (
        <ul className="flex flex-col gap-3">
          {filtered.map((plugin) => (
            <RegistryPluginCard
              key={plugin._id}
              plugin={plugin}
              installed={installedIds.has(plugin.plugin_id)}
              state={cardState[plugin.plugin_id]}
              onInstall={() => handleInstall(plugin)}
            />
          ))}
        </ul>
      )}

      <PluginInstallDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        targetDevice={installTarget}
        initialManifest={pending?.manifest}
        initialManifestHash={pending?.manifestHash}
        initialSource={pending?.source}
      />
    </section>
  );
}

type T = ReturnType<typeof useTranslations>;

function SectionHeader({ t }: { t: T }) {
  return (
    <header className="space-y-0.5">
      <h3 className="text-base font-semibold text-text-primary">
        {t("title")}
      </h3>
      <p className="text-xs text-text-tertiary">{t("subtitle")}</p>
    </header>
  );
}

function Toolbar({
  search,
  setSearch,
  category,
  setCategory,
  t,
}: {
  search: string;
  setSearch: (v: string) => void;
  category: CategoryFilter;
  setCategory: (v: CategoryFilter) => void;
  t: T;
}) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-md border border-border-default bg-bg-secondary py-1.5 pl-7 pr-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          aria-label={t("searchPlaceholder")}
        />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
        <CategoryChip
          active={category === "all"}
          onClick={() => setCategory("all")}
          label={t("category.all")}
        />
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            active={category === c}
            onClick={() => setCategory(c)}
            label={t(`category.${c}`)}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2 py-0.5 text-xs transition-colors",
        active
          ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
          : "border-border-default bg-bg-secondary text-text-secondary hover:border-border-strong",
      )}
    >
      {label}
    </button>
  );
}

function EmptyState({ t }: { t: T }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-default p-6 text-center">
      <Package className="h-6 w-6 text-text-tertiary" aria-hidden />
      <p className="text-sm text-text-primary">{t("empty.title")}</p>
      <p className="text-xs text-text-tertiary">{t("empty.subtitle")}</p>
    </div>
  );
}

function ErrorMessage({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
      {text}
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-[120px] animate-pulse rounded-md border border-border-default bg-bg-secondary"
        />
      ))}
    </ul>
  );
}
