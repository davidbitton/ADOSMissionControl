/**
 * Tests for the GCS-side capability catalog.
 *
 * Pins three invariants:
 *  1. Every id in `GCS_CAPABILITIES` has a `CAPABILITY_CATALOG` entry,
 *     and every catalog entry is also declared on the canonical id
 *     list (no orphan entries).
 *  2. Helper lookups behave correctly for known and unknown ids.
 *  3. `getMergedCapabilityMeta` returns the local entry for GCS-side
 *     ids and `undefined` for ids that are not in the local catalog
 *     (agent-side ids fall into this bucket on purpose; the dialog
 *     reads server-inlined metadata for those).
 */

import { describe, expect, it } from "vitest";

import {
  CAPABILITY_CATALOG,
  GCS_CAPABILITIES,
  getCapabilityMeta,
  getMergedCapabilityMeta,
  isKnownCapability,
  isKnownGcsCapability,
} from "../capabilities";

describe("GCS capability catalog completeness", () => {
  it("every GCS_CAPABILITIES entry has a CAPABILITY_CATALOG entry", () => {
    const known = new Set(Object.keys(CAPABILITY_CATALOG));
    const missing = GCS_CAPABILITIES.filter((id) => !known.has(id));
    expect(missing).toEqual([]);
  });

  it("CAPABILITY_CATALOG has no entries outside GCS_CAPABILITIES", () => {
    const declared = new Set<string>(GCS_CAPABILITIES);
    const orphan = Object.keys(CAPABILITY_CATALOG).filter(
      (id) => !declared.has(id),
    );
    expect(orphan).toEqual([]);
  });

  it("every catalog entry has the required fields", () => {
    const allowedCategories = new Set([
      "hardware",
      "flight_control",
      "data_network",
      "compute_process",
      "ui_slot",
    ]);
    const allowedRisks = new Set(["low", "medium", "high", "critical"]);
    for (const [id, meta] of Object.entries(CAPABILITY_CATALOG)) {
      expect(meta.label.length, `${id} label`).toBeGreaterThan(0);
      expect(meta.label.length, `${id} label too long`).toBeLessThanOrEqual(
        120,
      );
      expect(
        meta.description.length,
        `${id} description too terse`,
      ).toBeGreaterThanOrEqual(20);
      expect(allowedCategories.has(meta.category), `${id} category`).toBe(true);
      expect(allowedRisks.has(meta.risk), `${id} risk`).toBe(true);
      expect(meta.risk_reason.length, `${id} risk_reason`).toBeGreaterThan(0);
    }
  });
});

describe("Helper lookups", () => {
  it("isKnownGcsCapability returns true for declared ids", () => {
    expect(isKnownGcsCapability("telemetry.subscribe")).toBe(true);
    expect(isKnownGcsCapability("ui.slot.fc-tab")).toBe(true);
  });

  it("isKnownGcsCapability returns false for unknown ids", () => {
    expect(isKnownGcsCapability("not.a.real.capability")).toBe(false);
    // Agent-side ids are not declared on the GCS catalog by design.
    expect(isKnownGcsCapability("mavlink.read")).toBe(false);
  });

  it("isKnownCapability mirrors the catalog", () => {
    expect(isKnownCapability("command.send")).toBe(true);
    expect(isKnownCapability("not.a.real.capability")).toBe(false);
  });

  it("getCapabilityMeta returns the entry for known ids", () => {
    const meta = getCapabilityMeta("telemetry.subscribe");
    expect(meta).toBeDefined();
    expect(meta?.category).toBe("data_network");
    expect(meta?.risk).toBe("low");
  });

  it("getCapabilityMeta returns undefined for unknown ids", () => {
    expect(getCapabilityMeta("not.a.real.capability")).toBeUndefined();
  });
});

describe("getMergedCapabilityMeta", () => {
  it("resolves GCS-side ids through the local catalog", () => {
    const meta = getMergedCapabilityMeta("mission.write");
    expect(meta).toBeDefined();
    expect(meta?.risk).toBe("high");
    expect(meta?.category).toBe("flight_control");
  });

  it("returns undefined for ids not on the local catalog", () => {
    // Agent-side id; the dialog should read the server-inlined entry
    // when one is present, but the merged lookup itself returns
    // undefined here because the local catalog deliberately does not
    // mirror agent-side ids.
    expect(getMergedCapabilityMeta("mavlink.read")).toBeUndefined();
    expect(getMergedCapabilityMeta("not.a.real.capability")).toBeUndefined();
  });
});

describe("Risk classification spot checks", () => {
  it("mission.write is high risk", () => {
    expect(CAPABILITY_CATALOG["mission.write"].risk).toBe("high");
  });

  it("command.send is at least medium risk", () => {
    expect(["medium", "high", "critical"]).toContain(
      CAPABILITY_CATALOG["command.send"].risk,
    );
  });

  it("read-only telemetry and mission reads are low risk", () => {
    expect(CAPABILITY_CATALOG["telemetry.subscribe"].risk).toBe("low");
    expect(CAPABILITY_CATALOG["mission.read"].risk).toBe("low");
  });

  it("every ui.slot.* entry lives in the ui_slot category", () => {
    for (const id of GCS_CAPABILITIES) {
      if (id.startsWith("ui.slot.")) {
        expect(CAPABILITY_CATALOG[id].category).toBe("ui_slot");
      }
    }
  });
});
