"use client";

/**
 * @module EdgeShell
 * @description Wrapper for every page under /hardware/edge. Renders the
 * PageIntro, then either the connect screen (no transmitter) or the
 * secondary tab strip + page content (transmitter connected).
 * @license GPL-3.0-only
 */

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useAdosEdgeStore } from "@/stores/ados-edge-store";
import { PageIntro } from "@/components/hardware/PageIntro";
import { Badge } from "@/components/ui/badge";
import { EdgeConnectScreen } from "./EdgeConnectScreen";
import { EdgeSecondaryTabs } from "./EdgeSecondaryTabs";

export function EdgeShell({ children }: { children: ReactNode }) {
  const state = useAdosEdgeStore((s) => s.state);
  const firmware = useAdosEdgeStore((s) => s.firmware);
  const t = useTranslations("hardware.intro");
  const tShell = useTranslations("hardware.edge.shell");

  const connected = state === "connected";

  const trailing = connected ? (
    <>
      <Badge variant="warning">{tShell("alpha")}</Badge>
      <Badge variant="success">{tShell("connected")}</Badge>
      {firmware?.firmware ? (
        <span className="text-[11px] text-text-tertiary">
          {tShell("firmwareLabel")} {firmware.firmware}
        </span>
      ) : null}
    </>
  ) : (
    <>
      <Badge variant="warning">{tShell("alpha")}</Badge>
      <Badge variant="neutral">{tShell("disconnected")}</Badge>
    </>
  );

  return (
    <div className="flex flex-col">
      <PageIntro
        title={t("edgeTitle")}
        description={t("edgeDescription")}
        trailing={trailing}
      />

      {connected ? (
        <>
          <EdgeSecondaryTabs />
          {children}
        </>
      ) : (
        <EdgeConnectScreen />
      )}
    </div>
  );
}
