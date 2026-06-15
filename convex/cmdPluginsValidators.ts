/**
 * @module cmdPluginsValidators
 * @description Shared Convex value-validators for the plugin registry
 * mutations in `cmdPlugins.ts`. This module defines no registered
 * functions, so it is not part of the generated API surface; it exists
 * to keep the registry module under the file-size budget.
 *
 * @license GPL-3.0-only
 */

import { v } from "convex/values";

export const riskValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

export const sourceValidator = v.union(
  v.literal("local_file"),
  v.literal("git_url"),
  v.literal("registry"),
  v.literal("builtin"),
);

export const statusValidator = v.union(
  v.literal("installed"),
  v.literal("enabled"),
  v.literal("running"),
  v.literal("disabled"),
  v.literal("crashed"),
  v.literal("removed"),
);

export const halfValidator = v.union(v.literal("agent"), v.literal("gcs"));

export const eventTypeValidator = v.union(
  v.literal("installed"),
  v.literal("enabled"),
  v.literal("disabled"),
  v.literal("removed"),
  v.literal("started"),
  v.literal("stopped"),
  v.literal("crashed"),
  v.literal("permission_granted"),
  v.literal("permission_revoked"),
  v.literal("permission_denied"),
  v.literal("update_available"),
  v.literal("update_applied"),
  v.literal("operator_note"),
);

export const severityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("error"),
);
