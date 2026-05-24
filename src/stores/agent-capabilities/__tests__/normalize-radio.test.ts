import { describe, it, expect } from "vitest";
import { normalizeRadio } from "../normalizer";

describe("normalizeRadio receive-side metrics", () => {
  it("parses the new RX fields from a camelCase block", () => {
    const radio = normalizeRadio({
      state: "connected",
      snrDb: 28,
      noiseDbm: -90,
      lossPercent: 1.5,
      mcsIndex: 2,
      rxSilentSeconds: 0.3,
    });
    expect(radio).not.toBeNull();
    expect(radio!.snrDb).toBe(28);
    expect(radio!.noiseDbm).toBe(-90);
    expect(radio!.lossPercent).toBe(1.5);
    expect(radio!.mcsIndex).toBe(2);
    expect(radio!.rxSilentSeconds).toBe(0.3);
  });

  it("defaults the new RX fields to null when absent (older agents)", () => {
    const radio = normalizeRadio({ state: "connected" });
    expect(radio).not.toBeNull();
    expect(radio!.snrDb).toBeNull();
    expect(radio!.noiseDbm).toBeNull();
    expect(radio!.lossPercent).toBeNull();
    expect(radio!.mcsIndex).toBeNull();
    expect(radio!.rxSilentSeconds).toBeNull();
  });

  it("coerces non-finite RX values to null", () => {
    const radio = normalizeRadio({
      state: "connected",
      snrDb: "nope",
      rxSilentSeconds: Infinity,
    });
    expect(radio!.snrDb).toBeNull();
    expect(radio!.rxSilentSeconds).toBeNull();
  });
});
