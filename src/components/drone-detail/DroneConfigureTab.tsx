"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useFirmwareCapabilities } from "@/hooks/use-firmware-capabilities";
import { useFcKeyboardShortcuts } from "@/hooks/use-fc-keyboard-shortcuts";
import { useFcPanelActionsStore } from "@/stores/fc-panel-actions-store";
import { useSettingsStore } from "@/stores/settings-store";
import { FcDisconnectedPlaceholder } from "@/components/fc/shared/FcDisconnectedPlaceholder";
import { FlashCommitBanner } from "@/components/fc/shared/FlashCommitBanner";
import { RebootRequiredBanner } from "@/components/indicators/RebootRequiredBanner";
import { useParamSafetyStore } from "@/stores/param-safety-store";
import { FC_NAV_ITEMS, type FcNavItem } from "./fc-nav-items";
import { FcPanelRouter } from "./FcPanelRouter";

interface DroneConfigureTabProps {
  droneId: string;
  droneName: string;
  isConnected: boolean;
}

export function DroneConfigureTab({ droneId, droneName, isConnected }: DroneConfigureTabProps) {
  const t = useTranslations("fcNav");
  const lastActivePanel = useSettingsStore((s) => s.lastActivePanel);
  const setLastActivePanelSetting = useSettingsStore((s) => s.setLastActivePanel);
  const [activePanel, setActivePanel] = useState(lastActivePanel || "outputs");
  const { supports, firmwareType } = useFirmwareCapabilities();

  const sectionLabels: Record<string, string> = {
    Flight: t("flightSection"),
    Safety: t("safetySection"),
    Sensors: t("sensorsSection"),
    Tuning: t("tuningSection"),
    Display: t("displaySection"),
    System: t("systemSection"),
    Security: "Security",
    Debug: t("debugSection"),
    Programming: "Programming",
  };

  const navLabels: Record<string, string> = {
    outputs: t("outputs"),
    receiver: t("receiver"),
    modes: t("flightModes"),
    "aux-modes": t("auxModes"),
    "bf-motors": t("motorsEsc"),
    frame: t("frameSetup"),
    failsafe: t("failsafe"),
    geofence: t("geofence"),
    health: t("healthCheck"),
    sensors: t("sensors"),
    power: t("power"),
    "gps-config": t("gpsConfig"),
    gimbal: t("gimbal"),
    camera: t("camera"),
    pid: t("pidTuning"),
    "rate-profiles": t("rateProfiles"),
    adjustments: t("adjustments"),
    "sensor-graphs": t("sensorGraphs"),
    osd: t("osdEditor"),
    led: t("ledStrip"),
    vtx: t("vtx"),
    ports: t("ports"),
    radio: t("radioConfig"),
    "bf-config": t("configuration"),
    firmware: t("firmwarePanel"),
    cli: t("cli"),
    mavlink: t("mavlinkInspector"),
    blackbox: t("blackbox"),
    debug: t("debugPanel"),
    diagnostics: t("diagnostics"),
    logs: t("logAnalysis"),
    can: "DroneCAN Monitor",
    signing: "MAVLink Signing",
    safehome: "Safehome",
    geozone: "Geozones",
    "inav-nav-config": "Navigation Config",
    "inav-mission": "iNav Mission",
    "inav-mixer-profile": "Mixer Profiles",
    "inav-output-mapping": "Output Mapping",
    "inav-servos": "Servos (iNav)",
    "inav-failsafe": "Failsafe (iNav)",
    "inav-battery-profile": "Battery Profiles",
    "inav-temp-sensors": "Temp Sensors",
    "inav-control-profile": "Control Profiles",
    "inav-mc-braking": "MC Braking",
    "inav-rate-dynamics": "Rate Dynamics",
    "inav-ez-tune": "EZ Tune",
    "inav-fw-approach": "FW Approach",
    "inav-osd": "OSD (iNav)",
    "inav-custom-osd": "Custom OSD",
    "inav-logic-conditions": "Logic Conditions",
    "inav-global-variables": "Global Variables",
    "inav-programming-pid": "Programming PIDs",
    "inav-nav-pid": "Nav PID",
  };

  useEffect(() => {
    setLastActivePanelSetting(activePanel);
  }, [activePanel, setLastActivePanelSetting]);

  const saveToRam = useFcPanelActionsStore((s) => s.saveToRam);
  const refresh = useFcPanelActionsStore((s) => s.refresh);
  useFcKeyboardShortcuts(saveToRam ?? undefined, refresh ?? undefined);

  const rebootRequiredParams = useParamSafetyStore((s) => s.rebootRequiredParams);
  const rebootParamsList = useMemo(() => Array.from(rebootRequiredParams), [rebootRequiredParams]);

  const visibleItems = useMemo(
    () =>
      FC_NAV_ITEMS.filter(
        (item) => !item.requiredCapability || supports(item.requiredCapability),
      ),
    [supports],
  );

  const sections = useMemo(() => {
    const map = new Map<string, FcNavItem[]>();
    for (const item of visibleItems) {
      const s = item.section ?? "Other";
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(item);
    }
    return map;
  }, [visibleItems]);

  const firmwareLabel = firmwareType
    ? ({
        "ardupilot-copter": "ArduCopter",
        "ardupilot-plane": "ArduPlane",
        "ardupilot-rover": "ArduRover",
        "ardupilot-sub": "ArduSub",
        px4: "PX4",
        betaflight: "Betaflight",
        inav: "iNav",
        unknown: "Unknown",
      } as Record<string, string>)[firmwareType] ?? firmwareType
    : null;

  useEffect(() => {
    if (!visibleItems.find((i) => i.id === activePanel) && visibleItems.length > 0) {
      setActivePanel(visibleItems[0].id);
    }
  }, [visibleItems, activePanel]);

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <nav className="w-[200px] border-r border-border-default bg-bg-secondary flex-shrink-0 overflow-y-auto">
        <div className="px-3 py-3 border-b border-border-default">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t("flightController")}
          </h2>
          {firmwareLabel && (
            <span className="mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-primary/15 text-accent-primary">
              {firmwareLabel}
            </span>
          )}
          {firmwareType === "px4" && (
            <span className="mt-1 block text-[10px] text-text-tertiary">
              Some panels (OSD, LED) are not available for PX4.
            </span>
          )}
          {firmwareType === "betaflight" && (
            <span className="mt-1 block text-[10px] text-text-tertiary">
              Betaflight firmware. Some panels differ from ArduPilot.
            </span>
          )}
        </div>
        <div className="flex flex-col py-1">
          {[...sections.entries()].map(([section, items]) => (
            <div key={section}>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {sectionLabels[section] ?? section}
                </span>
              </div>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => isConnected && setActivePanel(item.id)}
                  disabled={!isConnected}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer w-full",
                    !isConnected && "opacity-40 cursor-not-allowed",
                    isConnected && activePanel === item.id
                      ? "text-accent-primary bg-accent-primary/10 border-l-2 border-l-accent-primary"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border-l-2 border-l-transparent",
                    !isConnected && "hover:bg-transparent hover:text-text-secondary",
                  )}
                >
                  {item.icon}
                  {(firmwareType && item.labelOverride?.[firmwareType]) ?? navLabels[item.id] ?? item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        {!isConnected ? (
          <FcDisconnectedPlaceholder droneName={droneName} />
        ) : (
          <>
            <FlashCommitBanner />
            <RebootRequiredBanner rebootParams={rebootParamsList} />
            <FcPanelRouter activePanel={activePanel} firmwareType={firmwareType} />
          </>
        )}
      </div>
    </div>
  );
}
