"use client";

/**
 * @module EdgeConnectScreen
 * @description Composition rendered inside the ADOS Edge category when no
 * transmitter is connected. Three blocks: slim Connect card, Pocket
 * onboarding callout (coming soon), and a help block linking to docs.
 * @license GPL-3.0-only
 */

import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Plug2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AdosEdgeTransport } from "@/lib/ados-edge/transport";
import { useAdosEdgeStore } from "@/stores/ados-edge-store";
import { isDemoMode } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function EdgeConnectScreen() {
  const state = useAdosEdgeStore((s) => s.state);
  const error = useAdosEdgeStore((s) => s.error);
  const connect = useAdosEdgeStore((s) => s.connect);
  const clearError = useAdosEdgeStore((s) => s.clearError);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (state === "error") {
      const t = setTimeout(() => clearError(), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state, clearError]);

  const t = useTranslations("hardware.edge.connect");
  const tHelp = useTranslations("hardware.edge.help");
  const tAlpha = useTranslations("hardware.edge.alpha");

  const supported = mounted ? AdosEdgeTransport.isSupported() : true;
  const demo = mounted && isDemoMode();

  return (
    <div className="flex flex-col gap-4">
      <section
        className="flex items-start gap-3 rounded border border-status-warning/40 bg-status-warning/10 p-4"
        role="status"
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-warning" />
        <div className="min-w-0 flex-1 text-xs leading-relaxed text-text-secondary">
          <span className="font-semibold text-status-warning">{tAlpha("title")}</span>{" "}
          {tAlpha("body")}
        </div>
      </section>

      <section className="rounded border border-border-default bg-bg-secondary p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent-primary/10 text-accent-primary">
            <Plug2 size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-text-primary">
                {t("title")}
              </h3>
              {demo ? <Badge variant="info">{t("demoBadge")}</Badge> : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {t("body")}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void connect()}
                disabled={(!demo && !supported) || state === "connecting"}
                size="sm"
              >
                {state === "connecting"
                  ? t("buttonConnecting")
                  : demo
                    ? t("buttonDemo")
                    : t("buttonConnect")}
              </Button>

              {!supported && !demo ? (
                <p className="text-xs text-status-warning">{t("webserialWarning")}</p>
              ) : null}
            </div>

            {error && state === "error" ? (
              <p className="mt-2 text-xs text-status-error">{error}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded border border-border-default bg-bg-secondary p-4">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-text-tertiary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {tHelp("heading")}
          </h3>
        </div>
        <ul className="mt-3 space-y-2 text-xs">
          <HelpRow label={tHelp("overview")} comingSoonLabel={tHelp("comingSoon")} />
          <HelpRow label={tHelp("flashing")} comingSoonLabel={tHelp("comingSoon")} />
          <HelpRow label={tHelp("protocol")} comingSoonLabel={tHelp("comingSoon")} />
        </ul>
      </section>
    </div>
  );
}

function HelpRow({
  label,
  comingSoonLabel,
}: {
  label: string;
  comingSoonLabel: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-text-tertiary">{label}</span>
      <Badge variant="neutral">{comingSoonLabel}</Badge>
    </li>
  );
}
