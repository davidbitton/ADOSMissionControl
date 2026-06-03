/**
 * Persisted-store migration ladder.
 *
 * Pure function. Walks every historical version branch in order. Each
 * branch is gated by `if (version < N)` so a stale persisted value runs
 * through every migration that has ever shipped.
 *
 * @license GPL-3.0-only
 */

import type {
  ParamColumnVisibility,
  MapTileSource,
} from "@/stores/settings-store-types";
import type { SettingsStoreState } from "@/stores/settings-store";
import {
  DEFAULT_PARAM_COLUMNS,
  cloneDefaultTelemetryDeckPages,
  normalizeTelemetryDeckPages,
} from "./constants";

export function migrateSettings(
  persisted: unknown,
  version: number,
): SettingsStoreState {
  const state = persisted as Record<string, unknown>;
  if (version < 2) {
    state.onboarded = false;
    state.jurisdiction = null;
    state.demoMode = true;
  }
  if (version < 5) {
    // v5: removed description + default columns, show range + units by default
    state.paramColumns = { ...DEFAULT_PARAM_COLUMNS };
  }
  if (version < 6) {
    // v6: audio alerts + favorite params
    state.audioEnabled = true;
    state.audioVolume = 0.7;
    state.favoriteParams = [];
  }
  if (version < 7) {
    // v7: per-alert toggles + alert thresholds
    state.alertLowBattery = true;
    state.alertGpsLost = true;
    state.alertRcLost = true;
    state.alertArmDisarm = true;
    state.alertWaypoint = true;
    state.alertFailsafe = true;
    state.batteryWarningPct = 30;
    state.batteryCriticalPct = 20;
    state.alertPopupDuration = "5";
  }
  if (version < 8) {
    // v8: auto-reconnect + auto-connect on load
    state.autoReconnect = true;
    state.autoConnectOnLoad = true;
  }
  if (version < 9) {
    // v9: GCS location sharing
    state.locationEnabled = false;
  }
  if (version < 10) {
    // v10: last active FC panel persistence
    state.lastActivePanel = "outputs";
  }
  if (version < 11) {
    // v11: jurisdiction is now nullable, existing users keep their value
    // (no change needed, their persisted value is preserved)
  }
  if (version < 12) {
    // v12: Cesium 3D viewer settings
    state.cesiumImageryMode = "dark";
    state.cesiumBuildingsEnabled = false;
    state.terrainExaggeration = 1;
    state.showPathLabels = false;
  }
  if (version < 13) {
    // v13: Changelog notification tracking
    state.seenChangelogIds = [];
    state.changelogNotificationsEnabled = true;
  }
  if (version < 14) {
    // v14: Auto-start recording on drone connect
    state.autoRecordOnConnect = false;
  }
  if (version < 15) {
    // v15: Panel scroll positions + description column in param grid
    state.panelScrollPositions = {};
    const cols = state.paramColumns as ParamColumnVisibility | undefined;
    if (cols && !("description" in cols)) {
      (cols as Record<string, boolean>).description = false;
    }
  }
  if (version < 16) {
    // v16: No-fly zone overlays + offline tile caching
    state.showNoFlyZones = false;
    state.offlineTileCaching = true;
  }
  if (version < 17) {
    // v17: Demo mode default flipped to false, env var/URL is authoritative
    state.demoMode = false;
  }
  if (version < 18) {
    // v18: display language locale
    state.locale = 'en';
  }
  if (version < 19) {
    // v19: disable offline tile caching by default (IndexedDB can hang), satellite default
    state.offlineTileCaching = false;
    state.mapTileSource = "satellite" as MapTileSource;
  }
  if (version < 20) {
    // v20: global theme mode
    state.themeMode = "dark";
  }
  if (version < 21) {
    // v21: global accent preset
    state.accentColor = "blue";
  }
  if (version < 22) {
    // v22: parameter filter presets
    state.paramFilterPresets = [];
  }
  if (version < 23) {
    // v23: guidance vector line settings
    state.guidanceHdgLength = 100;
    state.guidanceHdgWidth = 2;
    state.guidanceHdgLineType = "solid";
    state.guidanceHdgColor = "#00ff41";
    state.guidanceTrackWpLength = 100;
    state.guidanceTrackWpWidth = 1.5;
    state.guidanceTrackWpLineType = "dashed";
    state.guidanceTrackWpColor = "#3A82FF";
    state.guidanceTgtHdgLength = 100;
    state.guidanceTgtHdgWidth = 1.5;
    state.guidanceTgtHdgLineType = "dashed";
    state.guidanceTgtHdgColor = "#f59e0b";
  }
  if (version < 24) {
    state.guidanceHdgEnabled = true;
    state.guidanceTrackWpEnabled = true;
    state.guidanceTgtHdgEnabled = true;
  }
  // v25: expanded theme + accent palette, widening only, no migration needed
  if (version < 26) {
    // v26: WHEP video endpoint URL for local/SITL video
    state.videoWhepUrl = "";
  }
  if (version < 27) {
    // v27: telemetry deck with per-page metric layouts
    state.telemetryDeckActivePage = "flight";
    state.telemetryDeckPages = cloneDefaultTelemetryDeckPages();
  }
  if (version < 28) {
    state.telemetryDeckPages = normalizeTelemetryDeckPages(state.telemetryDeckPages);
    if (
      state.telemetryDeckActivePage !== "flight" &&
      state.telemetryDeckActivePage !== "link" &&
      state.telemetryDeckActivePage !== "power" &&
      state.telemetryDeckActivePage !== "tuning"
    ) {
      state.telemetryDeckActivePage = "flight";
    }
  }
  if (version < 29) {
    // v29: legal disclaimer acceptance tracking
    state.disclaimerAccepted = false;
    state.disclaimerAcceptedAt = null;
    state.disclaimerVersion = 0;
  }
  if (version < 30) {
    // v30: auto-record on arm
    state.autoRecordOnArm = true;
  }
  if (version < 31) {
    // v31: interactive video transport switcher.
    // Default to "auto" cascade (LAN, then P2P MQTT) for existing users.
    state.videoTransportMode = "auto";
  }
  if (version < 32) {
    // v32: HDMI kiosk PIC auto-claim flag (default off).
    state.hudAutoClaimPicOnFirstButton = false;
  }
  if (version < 33) {
    // v33: theme broadcast at end of onboarding (default on).
    state.pushThemeToAgents = true;
  }
  if (version < 34) {
    // v34: reset the demo toggle. The prior rehydrate hook force-overrode
    // the persisted value with the env+URL check on every page load, which
    // left some installs stuck with the toggle in the wrong state. Reset
    // once so the persisted user choice can take over going forward.
    state.demoMode = false;
  }
  if (version < 35) {
    // v35: default operating region for paired drones (null = unrestricted).
    state.operatorRegion = null;
  }
  return state as unknown as SettingsStoreState;
}
