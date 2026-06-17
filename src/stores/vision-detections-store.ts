/**
 * @module VisionDetectionsStore
 * @description Per-drone store of the latest vision detection batch the
 * GCS knows about. The video overlay reads the active drone's batch and
 * draws bounding boxes scaled to the video element.
 *
 * A detection batch carries pixel-space boxes in the frame's own
 * resolution (origin top-left). Each batch declares its source frame
 * width/height so the overlay can map frame pixels onto the rendered
 * video rectangle regardless of the element's display size.
 *
 * TRANSPORT (live detections):
 *   The agent publishes detections on the `vision.detection` topic, and
 *   the engine re-broadcasts every per-frame `DetectionBatch` (model_id,
 *   camera_id, frame_id, ts_ms, detections[]) onto a Unix socket the
 *   agent's API process forwards to the browser over a WebSocket. The LAN
 *   client at `@/lib/agent/vision-detections-ws` opens that WebSocket for a
 *   paired drone, maps each batch onto the shape below, and calls
 *   `setBatch()`. A demo/test injector can also call `setBatch()` directly.
 *   The cloud-relay path for a remote drone (a vision/detection MQTT topic
 *   via `ados-cloud`) is a documented follow-up; it feeds the same
 *   `setBatch()`, so adding it stays purely additive.
 *
 * @license GPL-3.0-only
 */

import { create } from "zustand";

/** Pixel-space bounding box (origin top-left), in the frame's own
 * resolution. Mirrors the vision-contract `BoundingBox`. */
export interface DetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Discrete identity-lock state of a track this frame. Mirrors the
 * vision-contract `LockState` (lowercase string on the wire). `locked` = the
 * tracker is confident the identity held; `uncertain` = a weak association
 * (e.g. a box held on prediction through a miss) so the identity is
 * provisional; `lost` = the track could not be re-associated. Carrying it lets
 * the overlay show identity uncertainty instead of a silent swap. */
export type LockState = "locked" | "uncertain" | "lost";

/** One detection from a model. Mirrors the vision-contract `Detection`. */
export interface VisionDetection {
  bbox: DetectionBox;
  classLabel: string;
  confidence: number;
  /** Stable track id across frames (tracking models only). */
  trackId?: number | null;
  /** How confident the tracker is that this detection is the same object as
   * its `trackId` (0..1). Absent when the source does not score association.
   * Distinct from `confidence` (the class/object detection itself). */
  assocConfidence?: number | null;
  /** Discrete identity-lock state this frame. Absent when the source does not
   * report a lock state. */
  lockState?: LockState | null;
}

/** A batch of detections for one frame. Carries the source frame
 * dimensions so overlays can scale boxes to the rendered video. Mirrors
 * the vision-contract `DetectionBatch` plus the frame size the boxes are
 * expressed in. */
export interface VisionDetectionBatch {
  modelId: string;
  cameraId: string;
  frameId: number;
  tsMs: number;
  /** Resolution the detection coordinates are expressed in. The overlay
   * scales by (renderedWidth / frameWidth). */
  frameWidth: number;
  frameHeight: number;
  detections: VisionDetection[];
  /** Epoch ms the GCS received the batch. Used to age out stale boxes
   * so an overlay does not pin the last detection forever after the
   * feed stops. */
  receivedAt: number;
}

interface VisionDetectionsState {
  /** Latest batch per drone (keyed by drone/device id). */
  batches: Record<string, VisionDetectionBatch>;
  /** Replace the latest batch for a drone. `receivedAt` is stamped here
   * so callers do not have to. */
  setBatch: (
    droneId: string,
    batch: Omit<VisionDetectionBatch, "receivedAt">,
  ) => void;
  /** Drop a drone's batch (on disconnect or feed stop). */
  clearBatch: (droneId: string) => void;
  /** Reset everything. */
  clear: () => void;
}

export const useVisionDetectionsStore = create<VisionDetectionsState>(
  (set) => ({
    batches: {},
    setBatch: (droneId, batch) =>
      set((state) => ({
        batches: {
          ...state.batches,
          [droneId]: { ...batch, receivedAt: Date.now() },
        },
      })),
    clearBatch: (droneId) =>
      set((state) => {
        if (!(droneId in state.batches)) return state;
        const next = { ...state.batches };
        delete next[droneId];
        return { batches: next };
      }),
    clear: () => set({ batches: {} }),
  }),
);
