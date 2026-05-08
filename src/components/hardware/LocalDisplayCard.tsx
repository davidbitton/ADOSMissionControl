"use client";

/**
 * @module LocalDisplayCard
 * @description Renders the SPI LCD attached to the ground-station
 * companion board (e.g. Waveshare 3.5" RPi LCD on Cubie A7Z or Rock 5C).
 * Hidden when no display is bound on the agent side. Surfaces touch
 * calibration state, theme, last-touch age, active page, and a button
 * that fires the agent's 5-point calibration wizard.
 * @license GPL-3.0-only
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor } from "lucide-react";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

/** Format an absolute epoch ms into a short relative string. */
function formatLastTouch(ts: number | undefined): string | null {
  if (!ts) return null;
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs} s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `${days} d`;
}

interface LocalDisplayCardProps {
  /** Optional. Fires after the agent accepts a calibration-start
   * request. The Display sub-view uses this to open
   * `LcdCalibrationDialog`; pages that don't need the wizard can
   * leave it unset and the toast alone tells the operator the LCD
   * is now in calibration mode. */
  onCalibrationStarted?: () => void;
}

export function LocalDisplayCard({
  onCalibrationStarted,
}: LocalDisplayCardProps = {}) {
  const display = useAgentCapabilitiesStore((s) => s.display);
  const uiTheme = useAgentCapabilitiesStore((s) => s.uiTheme);
  const loaded = useAgentCapabilitiesStore((s) => s.loaded);
  const client = useAgentConnectionStore((s) => s.client);
  const t = useTranslations("hardware.localDisplay");
  const { toast } = useToast();

  const [calibrating, setCalibrating] = useState(false);

  // Wait for at least one capability payload before rendering.
  if (!loaded) return null;

  // No display attached on the agent side: render nothing.
  if (!display || display.type === "none") {
    return null;
  }

  const typeLabel =
    display.type === "spi-lcd"
      ? t("spiLcd")
      : display.type === "hdmi"
        ? t("hdmi")
        : display.type;

  const lastTouchStr = formatLastTouch(display.lastTouchAt);

  const calibrationPill = (() => {
    if (!display.hasTouch) {
      return (
        <Tooltip content={t("noTouch")}>
          <span className="rounded bg-text-tertiary/15 px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
            {t("noTouch")}
          </span>
        </Tooltip>
      );
    }
    if (display.touchCalibrated === true) {
      return (
        <Tooltip content={t("calibratedTooltip")}>
          <span className="rounded bg-status-success/15 px-2 py-0.5 text-[11px] font-medium text-status-success">
            {t("calibrated")}
          </span>
        </Tooltip>
      );
    }
    return (
      <Tooltip content={t("uncalibratedTooltip")}>
        <span className="rounded bg-status-warning/15 px-2 py-0.5 text-[11px] font-medium text-status-warning">
          {t("uncalibrated")}
        </span>
      </Tooltip>
    );
  })();

  const themePill =
    uiTheme === "light" || uiTheme === "dark" ? (
      <span className="rounded bg-bg-tertiary px-2 py-0.5 text-[11px] font-medium text-text-secondary">
        {uiTheme === "light" ? t("themeLight") : t("themeDark")}
      </span>
    ) : null;

  const onCalibrate = async () => {
    if (!client || calibrating) return;
    setCalibrating(true);
    try {
      await client.startDisplayCalibration();
      toast(t("calibrateStarted"), "info");
      onCalibrationStarted?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("calibrateError");
      toast(msg, "error");
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <section className="mb-4 rounded border border-border-default bg-bg-secondary">
      <header className="flex items-center justify-between gap-2 border-b border-border-default px-4 py-3">
        <div className="flex items-center gap-2">
          <Monitor size={16} className="text-accent-primary" />
          <h2 className="text-sm font-display font-semibold text-text-primary">
            {t("title")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              display.hasTouch
                ? "rounded bg-status-success/15 px-2 py-0.5 text-[11px] font-medium text-status-success"
                : "rounded bg-text-tertiary/15 px-2 py-0.5 text-[11px] font-medium text-text-secondary"
            }
          >
            {display.hasTouch ? t("touchEnabled") : t("touchDisabled")}
          </span>
          {calibrationPill}
          {themePill}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-xs text-text-secondary sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
            {t("typeLabel")}
          </dt>
          <dd className="mt-0.5 text-text-primary">{typeLabel}</dd>
        </div>
        {display.controller ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              {t("controller")}
            </dt>
            <dd className="mt-0.5 text-text-primary">{display.controller}</dd>
          </div>
        ) : null}
        {display.resolution ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              {t("resolution")}
            </dt>
            <dd className="mt-0.5 text-text-primary">{display.resolution}</dd>
          </div>
        ) : null}
        {display.rotation !== undefined ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              {t("rotation")}
            </dt>
            <dd className="mt-0.5 text-text-primary">
              {display.rotation}&deg;
            </dd>
          </div>
        ) : null}
        {lastTouchStr ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              {t("lastTouch")}
            </dt>
            <dd className="mt-0.5 text-text-primary">
              {t("lastTouchAgo", { value: lastTouchStr })}
            </dd>
          </div>
        ) : null}
        {display.activePage ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              {t("activePage")}
            </dt>
            <dd className="mt-0.5 font-mono text-text-primary">
              {display.activePage}
            </dd>
          </div>
        ) : null}
      </dl>

      {display.hasTouch ? (
        <footer className="flex items-center justify-end border-t border-border-default px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCalibrate}
            disabled={!client || calibrating}
          >
            {t("calibrateButton")}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
