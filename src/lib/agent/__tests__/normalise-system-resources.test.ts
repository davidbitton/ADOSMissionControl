/**
 * @module normalise-system-resources.test
 * @description Unit tests for the `/api/system` → `SystemResources`
 * normalizer, covering the memory breakdown and swap fields plus the
 * older-agent default-to-zero behaviour.
 * @license GPL-3.0-only
 */

import { describe, it, expect } from "vitest";
import { normaliseSystemResources } from "../agent-client/system";

describe("normaliseSystemResources", () => {
  it("coerces the full memory breakdown + swap fields", () => {
    const res = normaliseSystemResources({
      cpu_percent: 12.5,
      memory_percent: 30,
      memory_used_mb: 1200,
      memory_total_mb: 4096,
      memory_available_mb: 2400,
      memory_cache_mb: 820,
      swap_total_mb: 2048,
      swap_used_mb: 160,
      swap_percent: 7.8,
      disk_percent: 42,
      disk_used_gb: 13.5,
      disk_total_gb: 32,
      temperature: 45,
    });

    expect(res.memory_available_mb).toBe(2400);
    expect(res.memory_cache_mb).toBe(820);
    expect(res.swap_total_mb).toBe(2048);
    expect(res.swap_used_mb).toBe(160);
    expect(res.swap_percent).toBeCloseTo(7.8);
  });

  it("defaults the new fields to 0 on agents that predate them", () => {
    const res = normaliseSystemResources({
      cpu_percent: 5,
      memory_percent: 20,
      memory_used_mb: 800,
      memory_total_mb: 4096,
      disk_percent: 40,
    });

    expect(res.memory_available_mb).toBe(0);
    expect(res.memory_cache_mb).toBe(0);
    expect(res.swap_total_mb).toBe(0);
    expect(res.swap_used_mb).toBe(0);
    expect(res.swap_percent).toBe(0);
    // Pre-existing fields stay intact.
    expect(res.memory_used_mb).toBe(800);
    expect(res.memory_total_mb).toBe(4096);
  });

  it("coerces string-valued numbers (NumberLike seam)", () => {
    const res = normaliseSystemResources({
      memory_available_mb: "1536",
      swap_used_mb: "64",
    } as Record<string, unknown>);

    expect(res.memory_available_mb).toBe(1536);
    expect(res.swap_used_mb).toBe(64);
  });
});
