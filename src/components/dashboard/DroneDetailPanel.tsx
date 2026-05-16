"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useFleetStore } from "@/stores/fleet-store";
import { useDroneManager } from "@/stores/drone-manager";
import { useDroneMetadataStore } from "@/stores/drone-metadata-store";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DroneStatusBadge } from "@/components/shared/drone-status-badge";
import { DroneOverviewTab } from "@/components/drone-detail/DroneOverviewTab";
import { DroneFlightsTab } from "@/components/drone-detail/DroneFlightsTab";
import { DroneConfigureTab } from "@/components/drone-detail/DroneConfigureTab";
import { CalibrationPanel } from "@/components/fc/calibration/CalibrationPanel";
import { ParametersPanel } from "@/components/fc/parameters/ParametersPanel";
import { DroneRadioPanel } from "@/components/dashboard/DroneRadioPanel";
import {
  DroneDetailTabHeaders,
  DroneDetailTabBody,
  isPluginTabId,
} from "@/components/plugins/DroneDetailTabHost";
import { X, RotateCcw, Trash2 } from "lucide-react";
import { ConnectionQualityMeter } from "@/components/indicators/ConnectionQualityMeter";
import { NavStatePill } from "@/components/indicators/NavStatePill";
import { TrafficPill } from "@/components/indicators/TrafficPill";
import { useUiStore } from "@/stores/ui-store";
import {
  STATIC_TAB_IDS,
  RADIO_TAB_ID,
  isStaticTab,
  type DroneDetailTab,
} from "@/components/dashboard/drone-detail-tabs";

interface DroneDetailPanelProps {
  droneId: string;
  onClose: () => void;
}

export function DroneDetailPanel({ droneId, onClose }: DroneDetailPanelProps) {
  const t = useTranslations("dronePanel");
  const drones = useFleetStore((s) => s.drones);
  const removeDrone = useFleetStore((s) => s.removeDrone);
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { toast } = useToast();

  const radioPresent = useAgentCapabilitiesStore((s) => s.radio !== null);

  const tabs = useMemo(() => {
    const ids: DroneDetailTab[] = [...STATIC_TAB_IDS];
    if (radioPresent) ids.push(RADIO_TAB_ID);
    return ids.map((id) => ({ id, label: t(id) }));
  }, [t, radioPresent]);

  // If the active tab is the radio tab but the agent stopped
  // advertising a radio block, fall back to overview during render.
  // Computing this during render (instead of in an effect) avoids a
  // setState-in-effect cascade. Plugin-contributed tabs follow the
  // same fall-back: if a plugin uninstalls or disables while its tab
  // is active, the host falls back to overview on the next render.
  const visibleTab =
    activeTab === RADIO_TAB_ID && !radioPresent
      ? "overview"
      : !isStaticTab(activeTab) && !isPluginTabId(activeTab)
        ? "overview"
        : activeTab;

  const drone = drones.find((d) => d.id === droneId);
  const metadata = useDroneMetadataStore((s) => s.profiles[droneId]);
  const managedDrones = useDroneManager((s) => s.drones);
  const isConnected = managedDrones.has(droneId);

  const immersiveMode = useUiStore((s) => s.immersiveMode);
  const exitImmersiveMode = useUiStore((s) => s.exitImmersiveMode);
  const pendingDetailTab = useUiStore((s) => s.pendingDetailTab);
  const setPendingDetailTab = useUiStore((s) => s.setPendingDetailTab);

  const displayName = metadata?.displayName ?? drone?.name ?? droneId;

  // Consume pending detail tab from Cmd+K navigation
  useEffect(() => {
    if (pendingDetailTab) {
      setActiveTab(pendingDetailTab);
      setPendingDetailTab(null);
    }
  }, [pendingDetailTab, setPendingDetailTab]);

  // Exit immersive mode if tab changes away from overview
  useEffect(() => {
    if (immersiveMode && activeTab !== "overview") {
      exitImmersiveMode();
    }
  }, [activeTab, immersiveMode, exitImmersiveMode]);

  // Select this drone in drone-manager so getSelectedProtocol() returns the right protocol
  useEffect(() => {
    if (isConnected) {
      useDroneManager.getState().selectDrone(droneId);
    }
  }, [droneId, isConnected]);

  function handleDelete() {
    // Disconnect if connected
    if (isConnected) {
      useDroneManager.getState().removeDrone(droneId);
    }
    // Remove from fleet
    removeDrone(droneId);
    // Delete metadata
    useDroneMetadataStore.getState().deleteProfile(droneId);
    setDeleteOpen(false);
    toast(`Drone "${displayName}" deleted`, "warning");
    onClose();
  }

  if (!drone) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-text-secondary">
          Drone &quot;{droneId}&quot; not found
        </p>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("backToDashboard")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Merged header + tabs bar */}
      {!immersiveMode && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-default bg-bg-secondary flex-shrink-0">
          <h1 className="text-sm font-semibold text-text-primary shrink-0">{displayName}</h1>
          <DroneStatusBadge status={drone.status} />
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={14} />}
            onClick={onClose}
          />

          <div className="w-px h-5 bg-border-default shrink-0" />

          <div
            role="tablist"
            aria-label="Drone detail"
            className="flex items-center self-stretch"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`drone-tab-${tab.id}`}
                role="tab"
                aria-selected={visibleTab === tab.id}
                aria-controls={`drone-tabpanel-${tab.id}`}
                tabIndex={visibleTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => {
                  // Roving-tabindex + arrow-key nav per WAI-ARIA tab
                  // pattern. Left/Right/Home/End move + activate.
                  const idsArr = tabs.map((tt) => tt.id);
                  const idx = idsArr.indexOf(visibleTab as DroneDetailTab);
                  let nextIdx = idx;
                  if (e.key === "ArrowRight") {
                    nextIdx = (idx + 1) % idsArr.length;
                  } else if (e.key === "ArrowLeft") {
                    nextIdx = (idx - 1 + idsArr.length) % idsArr.length;
                  } else if (e.key === "Home") {
                    nextIdx = 0;
                  } else if (e.key === "End") {
                    nextIdx = idsArr.length - 1;
                  } else {
                    return;
                  }
                  e.preventDefault();
                  const nextId = idsArr[nextIdx];
                  setActiveTab(nextId);
                  requestAnimationFrame(() => {
                    document
                      .getElementById(`drone-tab-${nextId}`)
                      ?.focus();
                  });
                }}
                className={cn(
                  "self-stretch flex items-center px-2.5 text-xs font-medium transition-colors cursor-pointer shrink-0 -mb-px border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                  visibleTab === tab.id
                    ? "text-accent-primary border-accent-primary"
                    : "text-text-secondary hover:text-text-primary border-transparent"
                )}
              >
                {tab.label}
              </button>
            ))}
            {/* Plugin-contributed drone-detail tabs render after the
                static strip, sorted by manifest `order` then pluginId.
                Only the tab headers live here; the body is rendered
                inside the tabpanel switch below so the lazy mount
                stays in sync with the static-tab switcher. */}
            <DroneDetailTabHeaders
              agentId={droneId}
              activeTabId={visibleTab}
              onSelectPluginTab={setActiveTab}
            />
          </div>

          <span className="text-[10px] font-mono text-text-tertiary ml-auto shrink-0">
            ID: {drone.id}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={12} />}
            onClick={() => setDeleteOpen(true)}
            className="text-status-error hover:text-status-error"
          />
          {isConnected && <NavStatePill />}
          {isConnected && <TrafficPill />}
          {isConnected && <ConnectionQualityMeter />}
          {isConnected && (
            <Button
              variant="danger"
              size="sm"
              icon={<RotateCcw size={12} />}
              onClick={() => {
                const protocol = useDroneManager.getState().getSelectedProtocol();
                if (protocol) protocol.reboot();
              }}
            >
              {t("rebootFc")}
            </Button>
          )}
        </div>
      )}

      {/* Tab content. Plugin-contributed tabs render their own
          <div role="tabpanel"> via DroneDetailTabBody so the aria
          association resolves to the plugin's iframe wrapper. Static
          tabs share the panel div below. */}
      {isPluginTabId(visibleTab) ? (
        <DroneDetailTabBody
          agentId={droneId}
          activeTabId={visibleTab}
        />
      ) : (
        <div
          id={`drone-tabpanel-${visibleTab}`}
          role="tabpanel"
          aria-labelledby={`drone-tab-${visibleTab}`}
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
        >
          {visibleTab === "overview" && <DroneOverviewTab drone={drone} />}
          {visibleTab === "flights" && <DroneFlightsTab droneId={droneId} />}
          {visibleTab === "calibrate" && <CalibrationPanel />}
          {visibleTab === "parameters" && <ParametersPanel />}
          {visibleTab === "configure" && (
            <DroneConfigureTab
              droneId={droneId}
              droneName={displayName}
              isConnected={isConnected}
            />
          )}
          {visibleTab === RADIO_TAB_ID && radioPresent && (
            <DroneRadioPanel droneId={droneId} />
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        title={t("deleteDrone")}
        message={t("deleteConfirm", { name: displayName })}
        confirmLabel={t("delete")}
        variant="danger"
      />
    </div>
  );
}
