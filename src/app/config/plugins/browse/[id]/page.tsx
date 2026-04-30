"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { RiskBadge } from "@/components/plugins/RiskBadge";
import { TrustBadge } from "@/components/plugins/TrustBadge";
import {
  RegistryClient,
  type RegistryPluginDetail,
} from "@/lib/plugins/registry-client";
import { cn } from "@/lib/utils";

type Tab = "overview" | "permissions" | "versions" | "compatibility";

export default function RegistryPluginDetailPage() {
  const t = useTranslations("plugins.browse");
  const params = useParams<{ id: string }>();
  const pluginId = params?.id ? decodeURIComponent(params.id) : null;
  const [tab, setTab] = useState<Tab>("overview");
  const [detail, setDetail] = useState<RegistryPluginDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const client = useMemo(() => new RegistryClient(), []);

  useEffect(() => {
    if (!pluginId) return;
    let cancelled = false;
    client
      .detail(pluginId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
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
  }, [client, pluginId]);

  if (!pluginId) {
    return <p className="p-4 text-sm text-text-tertiary">{t("notFound")}</p>;
  }

  if (loading) {
    return <p className="p-4 text-sm text-text-tertiary">{t("loading")}</p>;
  }

  if (error || !detail) {
    return (
      <div className="p-4 text-sm text-text-tertiary">
        <p>{error ?? t("notFound")}</p>
        <Link
          href="/config/plugins/browse"
          className="text-accent-primary underline"
        >
          {t("backToBrowse")}
        </Link>
      </div>
    );
  }

  const handleInstall = () => {
    toast(t("installPlaceholder"), "info");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Link
        href="/config/plugins/browse"
        className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> {t("backToBrowse")}
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-text-primary">
              {detail.name}
            </h1>
            <span className="text-xs text-text-tertiary">v{detail.latestVersion}</span>
            <RiskBadge level={detail.risk} size="sm" />
          </div>
          <code className="text-xs text-text-tertiary">{detail.pluginId}</code>
          <div className="flex flex-wrap gap-1 pt-1">
            {detail.signed && <TrustBadge signal="signed" />}
            {detail.firstParty && <TrustBadge signal="verified-publisher" />}
            {detail.openSource && <TrustBadge signal="open-source" />}
            {!detail.signed && <TrustBadge signal="unsigned" />}
          </div>
        </div>
        <Button
          icon={<Download className="h-3 w-3" />}
          onClick={handleInstall}
        >
          {t("installLatest")}
        </Button>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border-default bg-bg-secondary p-3 text-xs md:grid-cols-4">
        <Field label={t("author")} value={detail.author} />
        <Field label={t("license")} value={detail.license} />
        <Field
          label={t("installCount")}
          value={detail.installCount.toLocaleString()}
        />
        <Field
          label={t("lastUpdated")}
          value={new Date(detail.updatedAt).toLocaleDateString()}
        />
      </dl>

      <nav className="flex gap-1 border-b border-border-default" aria-label={t("tabsAria")}>
        {(["overview", "permissions", "versions", "compatibility"] as const).map(
          (k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm",
                tab === k
                  ? "border-accent-primary text-text-primary"
                  : "border-transparent text-text-tertiary hover:text-text-primary",
              )}
            >
              {t(`tab.${k}`)}
            </button>
          ),
        )}
      </nav>

      {tab === "overview" && <OverviewTab detail={detail} />}
      {tab === "permissions" && <PermissionsTab detail={detail} />}
      {tab === "versions" && <VersionsTab detail={detail} />}
      {tab === "compatibility" && <CompatibilityTab detail={detail} />}
    </div>
  );
}

function OverviewTab({ detail }: { detail: RegistryPluginDetail }) {
  const t = useTranslations("plugins.browse");
  const text = detail.readmeMarkdown || detail.description;
  return (
    <section className="space-y-3">
      <p className="whitespace-pre-wrap text-sm text-text-primary">{text}</p>
      {detail.sourceUrl && (
        <p className="text-xs text-text-tertiary">
          {t("source")}:{" "}
          <a
            href={detail.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent-primary underline"
          >
            {detail.sourceUrl}
          </a>
        </p>
      )}
    </section>
  );
}

function PermissionsTab({ detail }: { detail: RegistryPluginDetail }) {
  const t = useTranslations("plugins.browse");
  if (detail.permissions.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">{t("noPermissions")}</p>
    );
  }
  return (
    <ul className="divide-y divide-border-default rounded-md border border-border-default">
      {detail.permissions.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <code className="font-mono text-sm text-text-primary">{p.id}</code>
            {p.required && (
              <span className="ml-2 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] uppercase text-text-tertiary">
                {t("required")}
              </span>
            )}
            {p.rationale && (
              <p className="mt-0.5 text-xs text-text-secondary">{p.rationale}</p>
            )}
          </div>
          <RiskBadge level={p.risk} size="sm" />
        </li>
      ))}
    </ul>
  );
}

function VersionsTab({ detail }: { detail: RegistryPluginDetail }) {
  const t = useTranslations("plugins.browse");
  const [expanded, setExpanded] = useState<string | null>(null);
  if (detail.versions.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("noVersions")}</p>;
  }
  return (
    <ul className="space-y-1">
      {detail.versions.map((v) => {
        const isOpen = expanded === v.version;
        return (
          <li
            key={v.version}
            className="rounded-md border border-border-default bg-bg-secondary"
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : v.version)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm text-text-primary">
                  v{v.version}
                </span>
                {v.deprecated && (
                  <span className="rounded bg-status-warning/10 px-1.5 py-0.5 text-[10px] uppercase text-status-warning">
                    {t("deprecated")}
                  </span>
                )}
              </span>
              <span className="text-xs text-text-tertiary">
                {new Date(v.publishedAt).toLocaleDateString()}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border-default px-3 py-2 text-xs text-text-secondary">
                {v.changelog && (
                  <p className="whitespace-pre-wrap">{v.changelog}</p>
                )}
                <p className="mt-2 text-text-tertiary">
                  {t("installs")}: {v.installCount.toLocaleString()}
                  {v.signedBy && ` · ${t("signedBy")}: ${v.signedBy}`}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CompatibilityTab({ detail }: { detail: RegistryPluginDetail }) {
  const t = useTranslations("plugins.browse");
  const latest = detail.versions[0];
  return (
    <dl className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
      <Field
        label={t("agentVersionRange")}
        value={latest?.agentVersionRange ?? t("any")}
      />
      <Field label={t("halves")} value={detail.halves.join(", ")} capitalize />
      <div className="md:col-span-2">
        <dt className="text-text-tertiary">{t("supportedBoards")}</dt>
        <dd className="mt-1 flex flex-wrap gap-1">
          {(latest?.supportedBoards ?? []).length === 0 ? (
            <span className="text-text-secondary">{t("any")}</span>
          ) : (
            (latest?.supportedBoards ?? []).map((b) => (
              <span
                key={b}
                className="rounded border border-border-default bg-bg-tertiary px-1.5 py-0.5 text-text-secondary"
              >
                {b}
              </span>
            ))
          )}
        </dd>
      </div>
    </dl>
  );
}

function Field({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className={cn("text-text-primary", capitalize && "capitalize")}>
        {value}
      </dd>
    </div>
  );
}
