/**
 * Display slice for the persisted settings store. Owns visual + theme +
 * locale + map + Cesium + alerts + onboarding + guidance-line + telemetry-
 * deck preferences. Default residence for general user-preference fields
 * that do not fit the network, command-tab, or video buckets.
 *
 * @license GPL-3.0-only
 */

import {
  DEFAULT_PARAM_COLUMNS,
  cloneDefaultTelemetryDeckPages,
} from "../settings-store/constants";
import type { SettingsSliceFactory, SettingsStoreState } from "./types";

export const displayDefaults: Partial<SettingsStoreState> = {
  mapTileSource: "satellite",
  units: "metric",
  bannerDismissed: false,
  bannerDismissedAt: null,
  saveCount: 0,
  onboarded: false,
  disclaimerAccepted: false,
  disclaimerAcceptedAt: null,
  disclaimerVersion: 0,
  jurisdiction: null,
  demoMode: false,
  _hasHydrated: false,
  paramColumns: { ...DEFAULT_PARAM_COLUMNS },
  audioEnabled: false,
  audioVolume: 0.7,
  favoriteParams: [],
  alertLowBattery: true,
  alertGpsLost: true,
  alertRcLost: true,
  alertArmDisarm: true,
  alertWaypoint: true,
  alertFailsafe: true,
  batteryWarningPct: 30,
  batteryCriticalPct: 20,
  alertPopupDuration: "5",
  cesiumImageryMode: "dark",
  cesiumBuildingsEnabled: false,
  terrainExaggeration: 1,
  showPathLabels: false,
  showCameraTriggers: true,
  seenChangelogIds: [],
  changelogNotificationsEnabled: true,
  autoRecordOnConnect: false,
  autoRecordOnArm: true,
  showNoFlyZones: false,
  offlineTileCaching: false,
  locale: "en",
  themeMode: "dark",
  accentColor: "blue",
  paramFilterPresets: [],
  guidanceHdgLength: 100,
  guidanceHdgWidth: 2,
  guidanceHdgLineType: "solid",
  guidanceHdgColor: "#00ff41",
  guidanceTrackWpLength: 100,
  guidanceTrackWpWidth: 1.5,
  guidanceTrackWpLineType: "dashed",
  guidanceTrackWpColor: "#3A82FF",
  guidanceTgtHdgLength: 100,
  guidanceTgtHdgWidth: 1.5,
  guidanceTgtHdgLineType: "dashed",
  guidanceTgtHdgColor: "#f59e0b",
  guidanceHdgEnabled: true,
  guidanceTrackWpEnabled: true,
  guidanceTgtHdgEnabled: true,
  telemetryDeckActivePage: "flight",
  telemetryDeckPages: cloneDefaultTelemetryDeckPages(),
};

export const createDisplayActions: SettingsSliceFactory<
  Pick<
    SettingsStoreState,
    | "setMapTileSource"
    | "setUnits"
    | "dismissBanner"
    | "incrementSaveCount"
    | "setOnboarded"
    | "setDisclaimerAccepted"
    | "setJurisdiction"
    | "setDemoMode"
    | "setParamColumn"
    | "setAudioEnabled"
    | "setAudioVolume"
    | "toggleFavorite"
    | "isFavorite"
    | "setAlert"
    | "setBatteryWarningPct"
    | "setBatteryCriticalPct"
    | "setAlertPopupDuration"
    | "setCesiumImageryMode"
    | "setCesiumBuildingsEnabled"
    | "setTerrainExaggeration"
    | "setShowPathLabels"
    | "setShowCameraTriggers"
    | "markChangelogSeen"
    | "clearSeenChangelog"
    | "setChangelogNotificationsEnabled"
    | "setAutoRecordOnConnect"
    | "setAutoRecordOnArm"
    | "setShowNoFlyZones"
    | "setOfflineTileCaching"
    | "saveParamFilterPreset"
    | "removeParamFilterPreset"
    | "setGuidanceHdgLength"
    | "setGuidanceHdgWidth"
    | "setGuidanceHdgLineType"
    | "setGuidanceHdgColor"
    | "setGuidanceTrackWpLength"
    | "setGuidanceTrackWpWidth"
    | "setGuidanceTrackWpLineType"
    | "setGuidanceTrackWpColor"
    | "setGuidanceTgtHdgLength"
    | "setGuidanceTgtHdgWidth"
    | "setGuidanceTgtHdgLineType"
    | "setGuidanceTgtHdgColor"
    | "setGuidanceHdgEnabled"
    | "setGuidanceTrackWpEnabled"
    | "setGuidanceTgtHdgEnabled"
    | "setTelemetryDeckActivePage"
    | "setTelemetryDeckPageMetrics"
    | "toggleTelemetryDeckPageMetric"
    | "moveTelemetryDeckMetric"
    | "resetGuidanceDefaults"
    | "setLocale"
    | "setThemeMode"
    | "setAccentColor"
  >
> = (set, get) => ({
  setMapTileSource: (mapTileSource) => set({ mapTileSource }),
  setUnits: (units) => set({ units }),
  dismissBanner: () => set({ bannerDismissed: true, bannerDismissedAt: Date.now() }),
  incrementSaveCount: () => set((s) => ({ saveCount: s.saveCount + 1 })),
  setOnboarded: (onboarded) => set({ onboarded }),
  setDisclaimerAccepted: (version) =>
    set({
      disclaimerAccepted: true,
      disclaimerAcceptedAt: Date.now(),
      disclaimerVersion: version,
    }),
  setJurisdiction: (jurisdiction) => set({ jurisdiction }),
  setDemoMode: (demoMode) => set({ demoMode }),
  setParamColumn: (col, visible) =>
    set((s) => ({ paramColumns: { ...s.paramColumns, [col]: visible } })),
  setAudioEnabled: (audioEnabled) => set({ audioEnabled }),
  setAudioVolume: (audioVolume) => set({ audioVolume }),
  toggleFavorite: (name) =>
    set((s) => ({
      favoriteParams: s.favoriteParams.includes(name)
        ? s.favoriteParams.filter((n) => n !== name)
        : [...s.favoriteParams, name],
    })),
  isFavorite: (name) => get().favoriteParams.includes(name),
  setAlert: (key, enabled) => set({ [key]: enabled } as Partial<SettingsStoreState>),
  setBatteryWarningPct: (batteryWarningPct) => set({ batteryWarningPct }),
  setBatteryCriticalPct: (batteryCriticalPct) => set({ batteryCriticalPct }),
  setAlertPopupDuration: (alertPopupDuration) => set({ alertPopupDuration }),
  setCesiumImageryMode: (cesiumImageryMode) => set({ cesiumImageryMode }),
  setCesiumBuildingsEnabled: (cesiumBuildingsEnabled) =>
    set({ cesiumBuildingsEnabled }),
  setTerrainExaggeration: (value) =>
    set({ terrainExaggeration: Math.max(0.1, Math.min(10, value)) }),
  setShowPathLabels: (showPathLabels) => set({ showPathLabels }),
  setShowCameraTriggers: (showCameraTriggers) => set({ showCameraTriggers }),
  markChangelogSeen: (ids) =>
    set((s) => ({
      seenChangelogIds: [...new Set([...s.seenChangelogIds, ...ids])],
    })),
  clearSeenChangelog: () => set({ seenChangelogIds: [] }),
  setChangelogNotificationsEnabled: (changelogNotificationsEnabled) =>
    set({ changelogNotificationsEnabled }),
  setAutoRecordOnConnect: (autoRecordOnConnect) => set({ autoRecordOnConnect }),
  setAutoRecordOnArm: (autoRecordOnArm) => set({ autoRecordOnArm }),
  setShowNoFlyZones: (showNoFlyZones) => set({ showNoFlyZones }),
  setOfflineTileCaching: (offlineTileCaching) => set({ offlineTileCaching }),
  saveParamFilterPreset: (preset) =>
    set((s) => ({
      paramFilterPresets: [
        ...s.paramFilterPresets.filter((p) => p.id !== preset.id),
        preset,
      ],
    })),
  removeParamFilterPreset: (id) =>
    set((s) => ({
      paramFilterPresets: s.paramFilterPresets.filter((p) => p.id !== id),
    })),
  setGuidanceHdgLength: (v) => set({ guidanceHdgLength: v }),
  setGuidanceHdgWidth: (v) => set({ guidanceHdgWidth: v }),
  setGuidanceHdgLineType: (v) => set({ guidanceHdgLineType: v }),
  setGuidanceHdgColor: (v) => set({ guidanceHdgColor: v }),
  setGuidanceTrackWpLength: (v) => set({ guidanceTrackWpLength: v }),
  setGuidanceTrackWpWidth: (v) => set({ guidanceTrackWpWidth: v }),
  setGuidanceTrackWpLineType: (v) => set({ guidanceTrackWpLineType: v }),
  setGuidanceTrackWpColor: (v) => set({ guidanceTrackWpColor: v }),
  setGuidanceTgtHdgLength: (v) => set({ guidanceTgtHdgLength: v }),
  setGuidanceTgtHdgWidth: (v) => set({ guidanceTgtHdgWidth: v }),
  setGuidanceTgtHdgLineType: (v) => set({ guidanceTgtHdgLineType: v }),
  setGuidanceTgtHdgColor: (v) => set({ guidanceTgtHdgColor: v }),
  setGuidanceHdgEnabled: (v) => set({ guidanceHdgEnabled: v }),
  setGuidanceTrackWpEnabled: (v) => set({ guidanceTrackWpEnabled: v }),
  setGuidanceTgtHdgEnabled: (v) => set({ guidanceTgtHdgEnabled: v }),
  setTelemetryDeckActivePage: (page) => set({ telemetryDeckActivePage: page }),
  setTelemetryDeckPageMetrics: (page, metrics) =>
    set((s) => ({
      telemetryDeckPages: {
        ...s.telemetryDeckPages,
        [page]: [...new Set(metrics)],
      },
    })),
  toggleTelemetryDeckPageMetric: (page, metric) =>
    set((s) => {
      const current = s.telemetryDeckPages[page] ?? [];
      if (current.includes(metric)) {
        if (current.length <= 1) return {};
        return {
          telemetryDeckPages: {
            ...s.telemetryDeckPages,
            [page]: current.filter((m) => m !== metric),
          },
        };
      }
      return {
        telemetryDeckPages: {
          ...s.telemetryDeckPages,
          [page]: [...current, metric],
        },
      };
    }),
  moveTelemetryDeckMetric: (page, fromIndex, toIndex) =>
    set((s) => {
      const current = [...(s.telemetryDeckPages[page] ?? [])];
      if (
        fromIndex < 0
        || toIndex < 0
        || fromIndex >= current.length
        || toIndex >= current.length
        || fromIndex === toIndex
      ) {
        return {};
      }
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      return {
        telemetryDeckPages: {
          ...s.telemetryDeckPages,
          [page]: current,
        },
      };
    }),
  resetGuidanceDefaults: () =>
    set({
      guidanceHdgLength: 100,
      guidanceHdgWidth: 2,
      guidanceHdgLineType: "solid",
      guidanceHdgColor: "#00ff41",
      guidanceHdgEnabled: true,
      guidanceTrackWpLength: 100,
      guidanceTrackWpWidth: 1.5,
      guidanceTrackWpLineType: "dashed",
      guidanceTrackWpColor: "#3A82FF",
      guidanceTrackWpEnabled: true,
      guidanceTgtHdgLength: 100,
      guidanceTgtHdgWidth: 1.5,
      guidanceTgtHdgLineType: "dashed",
      guidanceTgtHdgColor: "#f59e0b",
      guidanceTgtHdgEnabled: true,
    }),
  setLocale: (locale) => set({ locale }),
  setThemeMode: (themeMode) => set({ themeMode }),
  setAccentColor: (accentColor) => set({ accentColor }),
});
