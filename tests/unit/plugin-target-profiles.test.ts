/**
 * Verifies pluginMatchesProfile() — the predicate that lets the
 * Plugins tab + the future plugin-backed catalog filter out plugins
 * the paired node cannot host.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect } from "vitest";
import { pluginMatchesProfile } from "@/lib/plugins/types";

describe("pluginMatchesProfile", () => {
  it("treats undefined target_profiles as drone-only (legacy default)", () => {
    expect(pluginMatchesProfile(undefined, "drone")).toBe(true);
    expect(pluginMatchesProfile(undefined, "ground-station")).toBe(false);
  });

  it("treats null target_profiles as drone-only", () => {
    expect(pluginMatchesProfile(null, "drone")).toBe(true);
    expect(pluginMatchesProfile(null, "ground-station")).toBe(false);
  });

  it("treats empty target_profiles as drone-only", () => {
    expect(pluginMatchesProfile([], "drone")).toBe(true);
    expect(pluginMatchesProfile([], "ground-station")).toBe(false);
  });

  it("matches a single explicit profile", () => {
    expect(pluginMatchesProfile(["ground-station"], "ground-station")).toBe(
      true,
    );
    expect(pluginMatchesProfile(["ground-station"], "drone")).toBe(false);
  });

  it("matches any entry in a multi-target list", () => {
    const list: ("drone" | "ground-station")[] = ["drone", "ground-station"];
    expect(pluginMatchesProfile(list, "drone")).toBe(true);
    expect(pluginMatchesProfile(list, "ground-station")).toBe(true);
  });

  it("never matches a compute node, even when target list includes drone", () => {
    expect(pluginMatchesProfile(["drone"], "compute")).toBe(false);
    expect(pluginMatchesProfile(undefined, "compute")).toBe(false);
  });
});
