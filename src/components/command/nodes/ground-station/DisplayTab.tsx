"use client";

/**
 * @module DisplayTab
 * @description Command-tab home for the LCD-related cards: status,
 * live preview, remote control, theme toggle, calibration wizard,
 * camera switch, recording monitor. Lifted from the prior
 * /hardware/display route.
 * @license GPL-3.0-only
 */

import { useState } from "react";
import { Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocalDisplayCard } from "@/components/hardware/LocalDisplayCard";
import { LcdPagePreview } from "@/components/hardware/LcdPagePreview";
import { LcdRemoteControl } from "@/components/hardware/LcdRemoteControl";
import { LcdThemeToggle } from "@/components/hardware/LcdThemeToggle";
import { LcdCalibrationDialog } from "@/components/hardware/LcdCalibrationDialog";
import { LcdCameraSwitch } from "@/components/hardware/LcdCameraSwitch";
import { LcdRecordingMonitor } from "@/components/hardware/LcdRecordingMonitor";
import { PageIntro } from "@/components/hardware/PageIntro";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";

export function DisplayTab() {
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const t = useTranslations("hardware.displayPage");
  const tOverview = useTranslations("hardware.overviewPage");

  const [calibrationOpen, setCalibrationOpen] = useState(false);

  if (!agentUrl) {
    return (
      <div className="flex flex-col">
        <PageIntro title={t("title")} description={t("description")} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-default bg-bg-secondary text-text-tertiary">
            <Monitor size={24} />
          </div>
          <h2 className="text-sm font-display font-semibold text-text-primary">
            {tOverview("noAgentTitle")}
          </h2>
          <p className="mt-2 max-w-md text-xs text-text-tertiary leading-relaxed">
            {tOverview("noAgentBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <PageIntro title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LocalDisplayCard
              onCalibrationStarted={() => setCalibrationOpen(true)}
            />
          </div>
          <div>
            <LcdPagePreview />
          </div>
        </div>

        <LcdRemoteControl />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LcdThemeToggle />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LcdCameraSwitch />
          </div>
          <div>
            <LcdRecordingMonitor />
          </div>
        </div>
      </div>

      <LcdCalibrationDialog
        open={calibrationOpen}
        onClose={() => setCalibrationOpen(false)}
      />
    </div>
  );
}
