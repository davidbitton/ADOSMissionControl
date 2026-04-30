"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RegistryPluginCardItem } from "@/components/plugins/RegistryPluginCard";
import {
  RegistryClient,
  type PluginCategory,
  type RegistryListQuery,
  type RegistryListResponse,
} from "@/lib/plugins/registry-client";
import { useFleetStore } from "@/stores/fleet-store";
import { cn } from "@/lib/utils";

const CATEGORIES: ReadonlyArray<PluginCategory | "all"> = [
  "all",
  "drivers",
  "ui",
  "ai",
  "telemetry",
  "tools",
];

export default function PluginsBrowsePage() {
  const t = useTranslations("plugins.browse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<PluginCategory | "all">("all");
  const [signedOnly, setSignedOnly] = useState(true);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [ossOnly, setOssOnly] = useState(false);
  const [board, setBoard] = useState<string | null>(null);
  const [resp, setResp] = useState<RegistryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  // Auto-suggest the connected drone's frame type so the operator
  // sees compatible plugins first. Falls back to null when no drone
  // is connected; the registry then returns the global catalog. We
  // resolve the suggested board lazily in the effective filter so we
  // never write to state inside a render or an effect.
  const detectedBoard = useFleetStore((s) => {
    const drones = s.drones;
    if (!drones || drones.length === 0) return null;
    return drones[0].frameType ?? null;
  });
  // `board === ""` is the operator's explicit "clear" signal; `null`
  // means we fall back to the auto-detected board.
  const effectiveBoard = board === null ? detectedBoard : board || null;

  const client = useMemo(() => new RegistryClient(), []);

  useEffect(() => {
    let cancelled = false;
    const query: RegistryListQuery = {
      search: search || undefined,
      category,
      signedOnly,
      verifiedOnly,
      ossOnly,
      board: effectiveBoard,
      cursor,
      limit: 24,
    };
    client
      .list(query)
      .then((r) => {
        if (cancelled) return;
        setResp(r);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    search,
    category,
    signedOnly,
    verifiedOnly,
    ossOnly,
    effectiveBoard,
    cursor,
  ]);

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setSignedOnly(true);
    setVerifiedOnly(false);
    setOssOnly(false);
    setBoard(null);
    setCursor(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">{t("title")}</h1>
        <p className="text-xs text-text-tertiary">{t("subtitle")}</p>
      </header>

      <section className="space-y-3 rounded-md border border-border-default bg-bg-secondary p-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-text-tertiary" aria-hidden />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(null);
            }}
            className="font-sans"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategory(c);
                setCursor(null);
              }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs capitalize transition-colors",
                category === c
                  ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                  : "border-border-default text-text-tertiary hover:text-text-primary",
              )}
            >
              {t(`category.${c}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <FilterToggle
            label={t("signedOnly")}
            checked={signedOnly}
            onChange={(v) => {
              setSignedOnly(v);
              setCursor(null);
            }}
          />
          <FilterToggle
            label={t("verifiedOnly")}
            checked={verifiedOnly}
            onChange={(v) => {
              setVerifiedOnly(v);
              setCursor(null);
            }}
          />
          <FilterToggle
            label={t("ossOnly")}
            checked={ossOnly}
            onChange={(v) => {
              setOssOnly(v);
              setCursor(null);
            }}
          />
          {effectiveBoard && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border-default bg-bg-tertiary px-2 py-0.5 text-text-secondary">
              {t("compatibleWith", { board: effectiveBoard })}
              <button
                type="button"
                className="text-text-tertiary hover:text-text-primary"
                onClick={() => setBoard("")}
                aria-label={t("clearBoard")}
              >
                &times;
              </button>
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t("clearFilters")}
          </Button>
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-status-error/40 bg-status-error/10 p-3 text-sm text-status-error">
          {t("registryUnreachable")}: {error}
        </p>
      ) : loading && !resp ? (
        <p className="py-12 text-center text-sm text-text-tertiary">
          {t("loading")}
        </p>
      ) : !resp || resp.cards.length === 0 ? (
        <EmptyState message={t("emptyState")} />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {resp.cards.map((card) => (
              <li key={card.pluginId}>
                <RegistryPluginCardItem card={card} />
              </li>
            ))}
          </ul>
          {resp.nextCursor && (
            <div className="flex justify-center pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCursor(resp.nextCursor)}
                disabled={loading}
              >
                {loading ? t("loading") : t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-text-secondary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-border-default p-8 text-center">
      <p className="text-sm text-text-primary">{message}</p>
    </div>
  );
}

