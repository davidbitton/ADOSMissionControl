/**
 * Shared full-state shape for the persisted settings store. Slice files
 * import this so their action factories type their `set`/`get` against
 * the whole store and keep cross-field reads working when an action
 * references state outside its own slice.
 *
 * @license GPL-3.0-only
 */

import type {
  AccentColor,
  GuidanceLineType,
  Jurisdiction,
  MapTileSource,
  ParamColumnId,
  ParamColumnVisibility,
  ParameterFilterPreset,
  TelemetryDeckMetricId,
  TelemetryDeckPageId,
  ThemeMode,
  UnitSystem,
} from "../settings-store-types";

export interface SettingsStoreState {
  // display + general preferences
  mapTileSource: MapTileSource;
  units: UnitSystem;
  bannerDismissed: boolean;
  bannerDismissedAt: number | null;
  saveCount: number;
  onboarded: boolean;
  disclaimerAccepted: boolean;
  disclaimerAcceptedAt: number | null;
  disclaimerVersion: number;
  jurisdiction: Jurisdiction | null;
  demoMode: boolean;
  _hasHydrated: boolean;
  paramColumns: ParamColumnVisibility;
  audioEnabled: boolean;
  audioVolume: number;
  favoriteParams: string[];
  alertLowBattery: boolean;
  alertGpsLost: boolean;
  alertRcLost: boolean;
  alertArmDisarm: boolean;
  alertWaypoint: boolean;
  alertFailsafe: boolean;
  batteryWarningPct: number;
  batteryCriticalPct: number;
  alertPopupDuration: string;
  cesiumImageryMode: "dark" | "satellite";
  cesiumBuildingsEnabled: boolean;
  terrainExaggeration: number;
  showPathLabels: boolean;
  showCameraTriggers: boolean;
  seenChangelogIds: string[];
  changelogNotificationsEnabled: boolean;
  autoRecordOnConnect: boolean;
  autoRecordOnArm: boolean;
  showNoFlyZones: boolean;
  offlineTileCaching: boolean;
  locale: string;
  themeMode: ThemeMode;
  accentColor: AccentColor;
  paramFilterPresets: ParameterFilterPreset[];
  guidanceHdgLength: number;
  guidanceHdgWidth: number;
  guidanceHdgLineType: GuidanceLineType;
  guidanceHdgColor: string;
  guidanceTrackWpLength: number;
  guidanceTrackWpWidth: number;
  guidanceTrackWpLineType: GuidanceLineType;
  guidanceTrackWpColor: string;
  guidanceTgtHdgLength: number;
  guidanceTgtHdgWidth: number;
  guidanceTgtHdgLineType: GuidanceLineType;
  guidanceTgtHdgColor: string;
  guidanceHdgEnabled: boolean;
  guidanceTrackWpEnabled: boolean;
  guidanceTgtHdgEnabled: boolean;
  telemetryDeckActivePage: TelemetryDeckPageId;
  telemetryDeckPages: Record<TelemetryDeckPageId, TelemetryDeckMetricId[]>;

  // network preferences
  autoReconnect: boolean;
  autoConnectOnLoad: boolean;
  locationEnabled: boolean;

  // command-tab preferences
  lastActivePanel: string;
  panelScrollPositions: Record<string, number>;

  // video preferences
  videoWhepUrl: string;
  videoTransportMode: "auto" | "lan-whep" | "p2p-mqtt" | "off";
  hudAutoClaimPicOnFirstButton: boolean;

  // display actions
  setMapTileSource: (source: MapTileSource) => void;
  setUnits: (units: UnitSystem) => void;
  dismissBanner: () => void;
  incrementSaveCount: () => void;
  setOnboarded: (onboarded: boolean) => void;
  setDisclaimerAccepted: (version: number) => void;
  setJurisdiction: (jurisdiction: Jurisdiction | null) => void;
  setDemoMode: (demoMode: boolean) => void;
  setParamColumn: (col: ParamColumnId, visible: boolean) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setAudioVolume: (volume: number) => void;
  toggleFavorite: (name: string) => void;
  isFavorite: (name: string) => boolean;
  setAlert: (
    key:
      | "alertLowBattery"
      | "alertGpsLost"
      | "alertRcLost"
      | "alertArmDisarm"
      | "alertWaypoint"
      | "alertFailsafe",
    enabled: boolean,
  ) => void;
  setBatteryWarningPct: (pct: number) => void;
  setBatteryCriticalPct: (pct: number) => void;
  setAlertPopupDuration: (duration: string) => void;
  setCesiumImageryMode: (mode: "dark" | "satellite") => void;
  setCesiumBuildingsEnabled: (enabled: boolean) => void;
  setTerrainExaggeration: (value: number) => void;
  setShowPathLabels: (show: boolean) => void;
  setShowCameraTriggers: (show: boolean) => void;
  markChangelogSeen: (ids: string[]) => void;
  clearSeenChangelog: () => void;
  setChangelogNotificationsEnabled: (enabled: boolean) => void;
  setAutoRecordOnConnect: (enabled: boolean) => void;
  setAutoRecordOnArm: (enabled: boolean) => void;
  setShowNoFlyZones: (show: boolean) => void;
  setOfflineTileCaching: (enabled: boolean) => void;
  saveParamFilterPreset: (preset: ParameterFilterPreset) => void;
  removeParamFilterPreset: (id: string) => void;
  setGuidanceHdgLength: (v: number) => void;
  setGuidanceHdgWidth: (v: number) => void;
  setGuidanceHdgLineType: (v: GuidanceLineType) => void;
  setGuidanceHdgColor: (v: string) => void;
  setGuidanceTrackWpLength: (v: number) => void;
  setGuidanceTrackWpWidth: (v: number) => void;
  setGuidanceTrackWpLineType: (v: GuidanceLineType) => void;
  setGuidanceTrackWpColor: (v: string) => void;
  setGuidanceTgtHdgLength: (v: number) => void;
  setGuidanceTgtHdgWidth: (v: number) => void;
  setGuidanceTgtHdgLineType: (v: GuidanceLineType) => void;
  setGuidanceTgtHdgColor: (v: string) => void;
  setGuidanceHdgEnabled: (v: boolean) => void;
  setGuidanceTrackWpEnabled: (v: boolean) => void;
  setGuidanceTgtHdgEnabled: (v: boolean) => void;
  setTelemetryDeckActivePage: (page: TelemetryDeckPageId) => void;
  setTelemetryDeckPageMetrics: (
    page: TelemetryDeckPageId,
    metrics: TelemetryDeckMetricId[],
  ) => void;
  toggleTelemetryDeckPageMetric: (
    page: TelemetryDeckPageId,
    metric: TelemetryDeckMetricId,
  ) => void;
  moveTelemetryDeckMetric: (
    page: TelemetryDeckPageId,
    fromIndex: number,
    toIndex: number,
  ) => void;
  resetGuidanceDefaults: () => void;
  setLocale: (locale: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (accent: AccentColor) => void;

  // network actions
  setAutoReconnect: (enabled: boolean) => void;
  setAutoConnectOnLoad: (enabled: boolean) => void;
  setLocationEnabled: (enabled: boolean) => void;

  // command-tab actions
  setLastActivePanel: (panelId: string) => void;
  setPanelScrollPosition: (panelId: string, scrollTop: number) => void;

  // video actions
  setVideoWhepUrl: (url: string) => void;
  setVideoTransportMode: (
    mode: "auto" | "lan-whep" | "p2p-mqtt" | "off",
  ) => void;
  setHudAutoClaimPicOnFirstButton: (enabled: boolean) => void;
}

/**
 * Slice action-factory signature shared by every settings slice file. Each
 * factory receives the full `set`/`get` so cross-slice reads keep working.
 */
export type SettingsSliceFactory<TActions> = (
  set: (
    partial:
      | Partial<SettingsStoreState>
      | ((s: SettingsStoreState) => Partial<SettingsStoreState>),
  ) => void,
  get: () => SettingsStoreState,
) => TActions;
