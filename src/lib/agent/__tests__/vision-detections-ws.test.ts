/**
 * @module vision-detections-ws.test
 * @description Unit tests for the wire → store mapping of the live
 * detection feed: snake_case contract fields onto the store's camelCase
 * shape, defaulting frame dimensions to the engine's normalized size when
 * the wire batch omits them.
 * @license GPL-3.0-only
 */

import { describe, it, expect } from "vitest";
import { mapWireBatch } from "../vision-detections-ws";

describe("mapWireBatch", () => {
  it("maps a full batch onto the camelCase store shape", () => {
    const batch = mapWireBatch({
      model_id: "com.example.weeds",
      camera_id: "uvc-0",
      frame_id: 7,
      ts_ms: 1_700_000_000_000,
      detections: [
        {
          bbox: { x: 12, y: 20, width: 64, height: 32 },
          class_label: "weed",
          confidence: 0.87,
          track_id: 3,
          assoc_confidence: 0.71,
          lock_state: "locked",
        },
      ],
    });
    expect(batch.modelId).toBe("com.example.weeds");
    expect(batch.cameraId).toBe("uvc-0");
    expect(batch.frameId).toBe(7);
    expect(batch.tsMs).toBe(1_700_000_000_000);
    // No frame dims on the wire → engine normalized default.
    expect(batch.frameWidth).toBe(640);
    expect(batch.frameHeight).toBe(480);
    expect(batch.detections).toHaveLength(1);
    const d = batch.detections[0];
    expect(d.classLabel).toBe("weed");
    expect(d.confidence).toBeCloseTo(0.87);
    expect(d.trackId).toBe(3);
    expect(d.assocConfidence).toBeCloseTo(0.71);
    expect(d.lockState).toBe("locked");
    expect(d.bbox).toEqual({ x: 12, y: 20, width: 64, height: 32 });
  });

  it("defaults the lock fields to null when the agent omits them", () => {
    const batch = mapWireBatch({
      model_id: "m",
      camera_id: "c",
      frame_id: 1,
      ts_ms: 0,
      detections: [
        {
          bbox: { x: 0, y: 0, width: 1, height: 1 },
          class_label: "x",
          confidence: 0.5,
          track_id: 9,
        },
      ],
    });
    expect(batch.detections[0].assocConfidence).toBeNull();
    expect(batch.detections[0].lockState).toBeNull();
  });

  it("maps the uncertain lock state and rejects an unknown one", () => {
    const ok = mapWireBatch({
      model_id: "m",
      camera_id: "c",
      frame_id: 1,
      ts_ms: 0,
      detections: [
        {
          bbox: { x: 0, y: 0, width: 1, height: 1 },
          class_label: "x",
          confidence: 0.5,
          lock_state: "uncertain",
        },
        {
          bbox: { x: 0, y: 0, width: 1, height: 1 },
          class_label: "x",
          confidence: 0.5,
          lock_state: "garbage",
        },
      ],
    } as never);
    expect(ok.detections[0].lockState).toBe("uncertain");
    // An unrecognized state coerces to null, never a bad enum value.
    expect(ok.detections[1].lockState).toBeNull();
  });

  it("uses explicit frame dimensions when the agent advertises them", () => {
    const batch = mapWireBatch({
      model_id: "m",
      camera_id: "c",
      frame_id: 1,
      ts_ms: 0,
      frame_width: 1280,
      frame_height: 720,
      detections: [],
    });
    expect(batch.frameWidth).toBe(1280);
    expect(batch.frameHeight).toBe(720);
    expect(batch.detections).toEqual([]);
  });

  it("defaults a missing track_id to null", () => {
    const batch = mapWireBatch({
      model_id: "m",
      camera_id: "c",
      frame_id: 1,
      ts_ms: 0,
      detections: [
        {
          bbox: { x: 0, y: 0, width: 1, height: 1 },
          class_label: "x",
          confidence: 0.5,
        },
      ],
    });
    expect(batch.detections[0].trackId).toBeNull();
  });

  it("tolerates malformed entries without throwing", () => {
    const batch = mapWireBatch({
      detections: [null, 42, { bbox: {}, class_label: "y", confidence: "bad" }],
    } as never);
    // Non-object entries dropped; the one object survives with coerced fields.
    expect(batch.detections).toHaveLength(1);
    expect(batch.detections[0].classLabel).toBe("y");
    expect(batch.detections[0].confidence).toBe(0);
    expect(batch.detections[0].bbox).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect(batch.modelId).toBe("");
    expect(batch.frameWidth).toBe(640);
  });
});
