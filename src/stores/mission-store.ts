/**
 * @module mission-store
 * @description Zustand store for mission waypoint state, undo/redo history,
 * and mission upload/download via the drone protocol abstraction.
 *
 * Undo/redo uses a bounded stack (max 50 entries). Each mutation pushes the
 * current waypoints array onto the undo stack and clears the redo stack.
 * Undo pops from undo → sets waypoints → pushes to redo (and vice versa).
 *
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Mission, Waypoint, MissionState } from "@/lib/types";
import type { MissionItem } from "@/lib/protocol/types";
import { useDroneManager } from "./drone-manager";
import { usePlannerStore } from "./planner-store";
import { indexedDBStorage } from "@/lib/storage";
// Shared MAVLink command maps. Single source of truth so the upload (cmdMap)
// and download (reverseCmd) directions can never drift out of sync.
import { cmdMap, reverseCmd } from "@/lib/mission-io-formats";

/** Maximum undo/redo history depth. */
const MAX_UNDO = 50;

interface MissionStoreState {
  activeMission: Mission | null;
  waypoints: Waypoint[];
  progress: number;
  currentWaypoint: number;
  uploadState: "idle" | "uploading" | "uploaded" | "error";
  downloadState: "idle" | "downloading" | "downloaded" | "error";
  undoStack: Waypoint[][];
  redoStack: Waypoint[][];

  setMission: (mission: Mission | null) => void;
  setWaypoints: (waypoints: Waypoint[]) => void;
  addWaypoint: (waypoint: Waypoint) => void;
  insertWaypoint: (waypoint: Waypoint, atIndex: number) => void;
  removeWaypoint: (id: string) => void;
  updateWaypoint: (id: string, update: Partial<Waypoint>) => void;
  reorderWaypoints: (fromIndex: number, toIndex: number) => void;
  setProgress: (progress: number, currentWaypoint: number) => void;
  setMissionState: (state: MissionState) => void;
  setUploadState: (state: "idle" | "uploading" | "uploaded" | "error") => void;
  setDownloadState: (state: "idle" | "downloading" | "downloaded" | "error") => void;
  createMission: (name: string, droneId: string) => void;
  clearMission: () => void;
  /** Upload the mission to the FC. Resolves true on success, false on failure. */
  uploadMission: () => Promise<boolean>;
  downloadMission: () => Promise<Waypoint[]>;
  undo: () => void;
  redo: () => void;
}

function pushUndo(state: { undoStack: Waypoint[][]; waypoints: Waypoint[] }) {
  const stack = [...state.undoStack, [...state.waypoints]];
  if (stack.length > MAX_UNDO) stack.shift();
  return { undoStack: stack, redoStack: [] as Waypoint[][] };
}

export const useMissionStore = create<MissionStoreState>()(
  persist(
    (set, get) => ({
  activeMission: null,
  waypoints: [],
  progress: 0,
  currentWaypoint: 0,
  uploadState: "idle",
  downloadState: "idle",
  undoStack: [],
  redoStack: [],

  setMission: (activeMission) => set({
    activeMission,
    waypoints: activeMission?.waypoints ?? [],
    progress: activeMission?.progress ?? 0,
    currentWaypoint: activeMission?.currentWaypoint ?? 0,
  }),

  setWaypoints: (waypoints) => set((s) => ({
    ...pushUndo(s),
    waypoints,
  })),

  addWaypoint: (waypoint) =>
    set((s) => ({
      ...pushUndo(s),
      waypoints: [...s.waypoints, waypoint],
    })),

  insertWaypoint: (waypoint, atIndex) =>
    set((s) => {
      const wps = [...s.waypoints];
      wps.splice(atIndex, 0, waypoint);
      return { ...pushUndo(s), waypoints: wps };
    }),

  removeWaypoint: (id) =>
    set((s) => ({
      ...pushUndo(s),
      waypoints: s.waypoints.filter((w) => w.id !== id),
    })),

  updateWaypoint: (id, update) =>
    set((s) => ({
      ...pushUndo(s),
      waypoints: s.waypoints.map((w) =>
        w.id === id ? { ...w, ...update } : w
      ),
    })),

  reorderWaypoints: (fromIndex, toIndex) =>
    set((s) => {
      const wps = [...s.waypoints];
      const [moved] = wps.splice(fromIndex, 1);
      wps.splice(toIndex, 0, moved);
      return { ...pushUndo(s), waypoints: wps };
    }),

  setProgress: (progress, currentWaypoint) =>
    set({ progress, currentWaypoint }),

  setMissionState: (state) =>
    set((s) =>
      s.activeMission
        ? { activeMission: { ...s.activeMission, state } }
        : {}
    ),

  setUploadState: (uploadState) => set({ uploadState }),
  setDownloadState: (downloadState) => set({ downloadState }),

  createMission: (name, droneId) =>
    set({
      activeMission: {
        id: Math.random().toString(36).substring(2, 10),
        name,
        droneId,
        waypoints: [],
        state: "planning",
        progress: 0,
        currentWaypoint: 0,
      },
      waypoints: [],
      progress: 0,
      currentWaypoint: 0,
      uploadState: "idle",
      undoStack: [],
      redoStack: [],
    }),

  clearMission: () =>
    set((s) => ({
      ...pushUndo(s),
      activeMission: null,
      waypoints: [],
      progress: 0,
      currentWaypoint: 0,
      uploadState: "idle",
    })),

  undo: () =>
    set((s) => {
      if (s.undoStack.length === 0) return s;
      const stack = [...s.undoStack];
      const prev = stack.pop();
      if (!prev) return s;
      return {
        undoStack: stack,
        redoStack: [...s.redoStack, [...s.waypoints]].slice(-MAX_UNDO),
        waypoints: prev,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.redoStack.length === 0) return s;
      const stack = [...s.redoStack];
      const next = stack.pop();
      if (!next) return s;
      return {
        redoStack: stack,
        undoStack: [...s.undoStack, [...s.waypoints]].slice(-MAX_UNDO),
        waypoints: next,
      };
    }),

  uploadMission: async () => {
    const protocol = useDroneManager.getState().getSelectedProtocol();
    if (!protocol) return false;
    const { waypoints } = get();
    if (waypoints.length === 0) return false;

    set({ uploadState: "uploading" });

    const frameMap: Record<string, number> = { relative: 3, absolute: 0, terrain: 10 };
    const altFrame = frameMap[usePlannerStore.getState().defaultFrame] ?? 3;

    const items: MissionItem[] = waypoints.map((wp, i) => ({
      seq: i,
      frame: altFrame,
      command: cmdMap[wp.command ?? "WAYPOINT"] ?? 16,
      current: i === 0 ? 1 : 0,
      autocontinue: 1,
      param1: wp.holdTime ?? 0,
      param2: wp.param1 ?? 0,
      param3: wp.param2 ?? 0,
      param4: wp.param3 ?? 0,
      x: Math.round(wp.lat * 1e7),
      y: Math.round(wp.lon * 1e7),
      z: wp.alt,
    }));

    try {
      const result = await protocol.uploadMission(items);
      set({ uploadState: result.success ? "uploaded" : "error" });
      return result.success;
    } catch {
      set({ uploadState: "error" });
      return false;
    }
  },

  downloadMission: async () => {
    const protocol = useDroneManager.getState().getSelectedProtocol();
    if (!protocol) return [];

    set({ downloadState: "downloading" });

    try {
      const items = await protocol.downloadMission();
      const waypoints: Waypoint[] = items.map((item) => ({
        id: Math.random().toString(36).substring(2, 10),
        lat: item.x / 1e7,
        lon: item.y / 1e7,
        alt: item.z,
        holdTime: item.param1 || undefined,
        param1: item.param2 || undefined,
        param2: item.param3 || undefined,
        param3: item.param4 || undefined,
        command: (reverseCmd[item.command] ?? "WAYPOINT") as Waypoint["command"],
      }));
      set({ waypoints, downloadState: "downloaded" });
      return waypoints;
    } catch {
      set({ downloadState: "error" });
      return [];
    }
  },
    }),
    {
      name: "altcmd:mission-store",
      storage: createJSONStorage(indexedDBStorage.storage),
      version: 2,
      partialize: (state) => ({
        waypoints: state.waypoints,
        activeMission: state.activeMission,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // v2 retired the suite framework. Strip the dropped
          // ``suiteType`` field off ``activeMission`` so the
          // persisted shape matches the TypeScript interface
          // verbatim rather than relying on excess-property
          // tolerance.
          const active = state.activeMission as Record<string, unknown> | null;
          if (active && "suiteType" in active) {
            delete active.suiteType;
            state.activeMission = active;
          }
        }
        return state as unknown as MissionStoreState;
      },
    }
  )
);
