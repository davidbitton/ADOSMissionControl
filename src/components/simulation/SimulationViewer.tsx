/**
 * @module SimulationViewer
 * @description Composition root for the mission simulation 3D view.
 * Delegates CesiumJS concerns to focused hooks: useSimClock (clock lifecycle),
 * useSimCamera (camera state machine), useSimCompletion (history recording).
 * Entity components render renderlessly into the CesiumJS viewer.
 * @license GPL-3.0-only
 */

"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import type { Viewer as CesiumViewer } from "cesium";
import type { Waypoint } from "@/lib/types";
import {
  computeFlightPlan,
  createSimulationMissionSignature,
} from "@/lib/simulation-utils";
import { buildSampledProperties } from "@/lib/build-sampled-properties";
import { resolveAGLToAbsolute, type ResolvedPath } from "@/lib/terrain-utils";
import { useSimulationStore } from "@/stores/simulation-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useSimClock } from "@/hooks/use-sim-clock";
import { useSimCamera } from "@/hooks/use-sim-camera";
import { useSimCompletion } from "@/hooks/use-sim-completion";
import { useTerrainReady } from "@/hooks/use-terrain-ready";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { useConvexSkipQuery } from "@/hooks/use-convex-skip-query";
import { communityApi } from "@/lib/community-api";

import { MapPin } from "lucide-react";
import CesiumScene from "./CesiumScene";
import { FlightPathEntity } from "./FlightPathEntity";
import { WaypointEntities } from "./WaypointEntities";
import { DroneEntity } from "./DroneEntity";
import { DroneTrailEntity } from "./DroneTrailEntity";
import { GcsEntity } from "./GcsEntity";
import { CameraTriggerEntities } from "./CameraTriggerEntities";
import { GeofenceEntities } from "./GeofenceEntities";
import { RallyPointEntities } from "./RallyPointEntities";
import { PatternBoundaryEntities } from "./PatternBoundaryEntities";
import { PlaybackControls } from "./PlaybackControls";
import { SimulationHUD } from "./SimulationHUD";
import { MapControlsPanel } from "./MapControlsPanel";

/** Fetches Cesium Ion token from Convex. Only mount when Convex is available. */
function ConvexCesiumToken({ onToken }: { onToken: (token: string | null) => void }) {
  // Parent already mounts this only when Convex is available. Bypass the demo
  // check so simulation in demo mode still pulls the token when the backend
  // is reachable.
  const config = useConvexSkipQuery(communityApi.clientConfig.get, { skipDemoCheck: true });
  useEffect(() => {
    // config is undefined while loading, null if query not found
    if (config !== undefined) {
      onToken((config as { cesiumIonToken?: string } | null)?.cesiumIonToken ?? null);
    }
  }, [config, onToken]);
  return null;
}

interface SimulationViewerProps {
  waypoints: Waypoint[];
  defaultSpeed: number;
}

interface TerrainResultState {
  signature: string;
  path: ResolvedPath | null;
  failed: boolean;
}

export function SimulationViewer({ waypoints, defaultSpeed }: SimulationViewerProps) {
  const t = useTranslations("simulate");
  const [viewer, setViewer] = useState<CesiumViewer | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const convexAvailable = useConvexAvailable();
  const [cesiumToken, setCesiumToken] = useState<string | undefined>(undefined);
  const handleCesiumToken = useCallback((t: string | null) => {
    setCesiumToken(t ?? undefined);
  }, []);

  // Map control settings
  const cesiumImageryMode = useSettingsStore((s) => s.cesiumImageryMode);
  const cesiumBuildingsEnabled = useSettingsStore((s) => s.cesiumBuildingsEnabled);
  const terrainExaggeration = useSettingsStore((s) => s.terrainExaggeration);
  const showPathLabels = useSettingsStore((s) => s.showPathLabels);
  const showCameraTriggers = useSettingsStore((s) => s.showCameraTriggers);

  const missionSignature = useMemo(
    () => createSimulationMissionSignature(waypoints, defaultSpeed),
    [waypoints, defaultSpeed]
  );

  const flightPlan = useMemo(
    () => computeFlightPlan(waypoints, defaultSpeed),
    [waypoints, defaultSpeed]
  );

  // ── Terrain readiness — wait for real provider before sampling ──
  const { isReady: terrainReady, version: terrainVersion } = useTerrainReady(viewer);

  // ── Terrain-resolved positions for 3D flight path ──────────
  const [terrainResult, setTerrainResult] = useState<TerrainResultState | null>(null);

  const resolvedPath =
    terrainResult?.signature === missionSignature && !terrainResult.failed
      ? terrainResult.path
      : null;
  const terrainFailed =
    terrainResult?.signature === missionSignature && terrainResult.failed;
  const terrainResolving =
    !!viewer && !viewer.isDestroyed() && waypoints.length >= 2 && !resolvedPath && !terrainFailed;

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || waypoints.length < 2) {
      return;
    }

    // Don't sample while terrain provider is still the flat ellipsoid —
    // it returns height=0 everywhere, placing the path underground.
    if (!terrainReady) {
      return;
    }

    let cancelled = false;
    const terrainProvider = viewer.scene.globe.terrainProvider;
    const signature = missionSignature;

    resolveAGLToAbsolute(waypoints, terrainProvider)
      .then((result) => {
        if (!cancelled) {
          setTerrainResult({ signature, path: result, failed: false });
        }
      })
      .catch(() => {
        // Terrain sampling failed — FlightPathEntity falls back to clamped path
        if (!cancelled) {
          setTerrainResult({ signature, path: null, failed: true });
        }
      });

    return () => { cancelled = true; };
  }, [viewer, missionSignature, waypoints, terrainReady, terrainVersion]);

  // Extract waypoint-only resolved positions for WaypointEntities + camera
  const waypointPositions = useMemo(() => {
    if (!resolvedPath) return undefined;
    return resolvedPath.waypointIndices.map((idx) => resolvedPath.positions[idx]);
  }, [resolvedPath]);

  const hasAbsolutePositions = !!waypointPositions;

  const sampled = useMemo(
    () => buildSampledProperties(
      waypoints,
      flightPlan,
      waypointPositions,
      resolvedPath?.positions,
      resolvedPath?.waypointIndices
    ),
    [waypoints, flightPlan, waypointPositions, resolvedPath]
  );

  // Reset simulation when waypoints change
  useEffect(() => {
    useSimulationStore.getState().reset();
  }, [missionSignature]);

  // Sync total duration
  useEffect(() => {
    useSimulationStore.getState().setTotalDuration(flightPlan.totalDuration);
  }, [missionSignature, flightPlan.totalDuration]);

  // Hooks handle all CesiumJS lifecycle
  useSimClock(viewer, sampled, flightPlan.totalDuration, hasAbsolutePositions, flightPlan);
  useSimCamera(viewer, waypoints, flightPlan, waypointPositions);
  useSimCompletion(waypoints);

  const handleViewerReady = useCallback((v: CesiumViewer) => setViewer(v), []);

  return (
    <div className="flex-1 relative min-w-0 h-full">
      {convexAvailable && <ConvexCesiumToken onToken={handleCesiumToken} />}
      <CesiumScene
        cesiumToken={cesiumToken}
        onReady={handleViewerReady}
        onError={(e) => setViewerError(e.message)}
        imageryMode={cesiumImageryMode}
        buildingsEnabled={cesiumBuildingsEnabled}
        terrainExaggeration={terrainExaggeration}
      />

      <FlightPathEntity
        viewer={viewer}
        waypoints={waypoints}
        resolvedPositions={resolvedPath?.positions ?? null}
        waypointIndices={resolvedPath?.waypointIndices}
        terrainHeights={resolvedPath?.terrainHeights}
        showLabels={showPathLabels}
        isResolving={terrainResolving}
      />
      <WaypointEntities viewer={viewer} waypoints={waypoints} resolvedPositions={waypointPositions} />
      <DroneEntity
        viewer={viewer}
        positionProperty={sampled?.sampledPosition ?? null}
        headingProperty={sampled?.sampledHeading ?? null}
        useAbsoluteAlt={hasAbsolutePositions}
        visible={!terrainResolving || hasAbsolutePositions}
      />
      <DroneTrailEntity
        viewer={viewer}
        positionProperty={sampled?.sampledPosition ?? null}
      />
      <GcsEntity viewer={viewer} />
      <CameraTriggerEntities viewer={viewer} waypoints={waypoints} visible={showCameraTriggers} />
      <GeofenceEntities viewer={viewer} />
      <RallyPointEntities viewer={viewer} />
      <PatternBoundaryEntities viewer={viewer} />

      <MapControlsPanel hasIonToken={!!cesiumToken} />
      <SimulationHUD />
      <PlaybackControls waypoints={waypoints} totalDuration={flightPlan.totalDuration} />

      {/* Loading state */}
      {!viewer && !viewerError && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">{t("initializing3dView")}</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {viewerError && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-bg-primary/80 backdrop-blur-md rounded-lg px-6 py-4 border border-red-500/30 text-center max-w-sm">
            <p className="text-sm text-red-400">
              {t("viewFailed", { message: viewerError })}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {waypoints.length < 2 && !viewerError && viewer && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-bg-primary/80 backdrop-blur-md rounded-lg px-8 py-6 border border-border-default text-center max-w-xs">
            <MapPin size={32} className="text-text-tertiary mx-auto mb-3" />
            <p className="text-sm font-semibold text-text-primary mb-1">
              {t("noFlightPlanLoaded")}
            </p>
            <p className="text-xs text-text-tertiary">
              {t("addWaypointsOrLoadPlan")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
