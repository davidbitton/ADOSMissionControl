/**
 * @module FeatureCatalog
 * @description Static registry of all known ADOS features (smart modes, suites, utilities).
 * The GCS intersects this catalog with agent-reported capabilities to determine
 * what the user can enable, configure, and activate.
 *
 * Aggregator: per-category catalogs live under `feature-catalogs/`. This file
 * re-exports the merged catalog and the helper queries so existing imports keep
 * working unchanged.
 * @license GPL-3.0-only
 */

import type { FeatureDef } from "./feature-types";
import { TRACKING_FEATURES } from "./feature-catalogs/tracking";
import { CINEMATOGRAPHY_FEATURES } from "./feature-catalogs/cinematography";
import { SAFETY_FEATURES } from "./feature-catalogs/safety";
import { UTILITY_FEATURES } from "./feature-catalogs/utility";
import { SUITE_FEATURES } from "./feature-catalogs/suites";

export {
  TRACKING_FEATURES,
  CINEMATOGRAPHY_FEATURES,
  SAFETY_FEATURES,
  UTILITY_FEATURES,
  SUITE_FEATURES,
};

export const FEATURE_CATALOG: Record<string, FeatureDef> = {
  ...TRACKING_FEATURES,
  ...CINEMATOGRAPHY_FEATURES,
  ...SAFETY_FEATURES,
  ...UTILITY_FEATURES,
  ...SUITE_FEATURES,
};

/** Get all features of a specific type. */
export function getFeaturesByType(type: FeatureDef["type"]): FeatureDef[] {
  return Object.values(FEATURE_CATALOG).filter((f) => f.type === type);
}

/** Get all features of a specific category. */
export function getFeaturesByCategory(category: FeatureDef["category"]): FeatureDef[] {
  return Object.values(FEATURE_CATALOG).filter((f) => f.category === category);
}

/** Get the list of unique model IDs required by a set of features. */
export function getRequiredModels(featureIds: string[]): string[] {
  const models = new Set<string>();
  for (const id of featureIds) {
    const feat = FEATURE_CATALOG[id];
    if (feat?.requiredModels) {
      for (const m of feat.requiredModels) {
        if (m.required) models.add(m.modelId);
      }
    }
  }
  return Array.from(models);
}
