/**
 * @module CompatibilitySection
 * @description Renders the compatibility breakdown — board, RAM, CPU —
 * as a top-of-modal "Compatibility" card. Defaults to expanded because
 * an incompatible host disables the install button and the operator
 * deserves to see why before scrolling.
 *
 * @license GPL-3.0-only
 */

"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { CollapsibleSection } from "@/components/ui/collapsible-section";

import type { CompatibilityResult } from "../check-compatibility";

export function CompatibilitySection({
  result,
  boardLabel,
}: {
  result: CompatibilityResult;
  boardLabel: string;
}) {
  const t = useTranslations("pluginInstall.review");

  return (
    <CollapsibleSection title={t("compatibility.title")} defaultOpen>
      <ul className="space-y-1.5 px-3 py-2 text-xs">
        <Row
          ok={result.boardCompatible}
          okText={t("compatibility.boardOk", { board: boardLabel })}
          failText={t("compatibility.boardFail", {
            board: result.boardReason ?? boardLabel,
          })}
        />
        <Row
          ok={result.ramOk}
          okText={t("compatibility.ramOk")}
          failText={result.ramReason ?? t("compatibility.ramOk")}
        />
        <Row
          ok={result.cpuOk}
          okText={t("compatibility.cpuOk")}
          failText={result.cpuReason ?? t("compatibility.cpuOk")}
        />
      </ul>
    </CollapsibleSection>
  );
}

function Row({
  ok,
  okText,
  failText,
}: {
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
      ) : (
        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-error" />
      )}
      <span className={ok ? "text-text-secondary" : "text-status-error"}>
        {ok ? okText : failText}
      </span>
    </li>
  );
}
