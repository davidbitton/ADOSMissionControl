/**
 * Canonical capability catalog for ADOS plugin GCS halves.
 *
 * Authoritative list of named capabilities the GCS half of a plugin
 * manifest may declare. The install dialog surfaces these in the
 * permission summary and risk badge. Today only `ui.slot.*`
 * registration is enforced by the slot whitelist; the rest are
 * recorded in the install record and shown to the operator at install
 * time, with runtime gates landing per surface as it ships.
 *
 * Every id in `GCS_CAPABILITIES` also has a `CapabilityMeta` entry in
 * `CAPABILITY_CATALOG`. The catalog supplies the human-readable label,
 * description, category, and risk classification rendered by the
 * install dialog. Agent-side capability ids come back from the agent
 * `/api/plugins/parse` and `/api/plugins/install` endpoints with the
 * same metadata fields already inlined, so the GCS does not need to
 * mirror the agent's catalog. `getMergedCapabilityMeta()` is the
 * lookup helper the dialog uses when a server response did not carry
 * inlined metadata for a particular id.
 */

export const GCS_CAPABILITIES = [
  // ui slots (13, one per PLUGIN_SLOTS entry; registration is gated
  // by the slot whitelist via slotToCapability in ./types.ts).
  // The drone-detail-tab slot is per-drone scoped and follows the
  // pause/resume + LRU lifecycle in the GCS slot lifecycle spec.
  "ui.slot.fc-tab",
  "ui.slot.command-tab",
  "ui.slot.hardware-tab",
  "ui.slot.suite-widget",
  "ui.slot.mission-template",
  "ui.slot.map-overlay",
  "ui.slot.video-overlay",
  "ui.slot.notification-channel",
  "ui.slot.smart-function",
  "ui.slot.settings-section",
  "ui.slot.connection-protocol",
  "ui.slot.recording-processor",
  "ui.slot.drone-detail-tab",
  // telemetry and command
  "telemetry.subscribe",
  "command.send",
  "recording.write",
  // mission
  "mission.read",
  "mission.write",
  // cloud
  "cloud.read",
  "cloud.write",
] as const;

export type GcsCapability = (typeof GCS_CAPABILITIES)[number];

export type CapabilityCategory =
  | "hardware"
  | "flight_control"
  | "data_network"
  | "compute_process"
  | "ui_slot";

export type CapabilityRisk = "low" | "medium" | "high" | "critical";

export interface CapabilityMeta {
  /** Short action-verb sentence (6-10 words) for the dialog row title. */
  label: string;
  /** One-paragraph what-it-does + why-it-matters body. */
  description: string;
  category: CapabilityCategory;
  risk: CapabilityRisk;
  /** One-line explanation rendered next to the risk badge. */
  risk_reason: string;
}

export const CAPABILITY_CATALOG: Record<string, CapabilityMeta> = {
  // ---- ui slots --------------------------------------------------
  "ui.slot.fc-tab": {
    label: "Add a tab to the flight controller panel",
    description:
      "Lets the plugin add a tab to the per-drone flight controller area. The tab renders inside a sandboxed iframe with no host DOM access.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Sandboxed iframe; no host DOM access.",
  },
  "ui.slot.command-tab": {
    label: "Add a tab to the command page",
    description:
      "Lets the plugin add a top-level tab in the Command area for fleet-wide tools. The tab renders inside a sandboxed iframe.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Sandboxed iframe; fleet-scoped read-only by default.",
  },
  "ui.slot.hardware-tab": {
    label: "Add a tab to the hardware page",
    description:
      "Lets the plugin add a tab on the Hardware page so the operator can inspect or configure devices the plugin manages.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Sandboxed iframe inside the Hardware page.",
  },
  "ui.slot.suite-widget": {
    label: "Add a widget to a mission suite",
    description:
      "Lets the plugin contribute a widget to a mission suite layout (Agriculture, Survey, Inspection, etc.) for in-mission readouts and controls.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Sandboxed iframe inside a suite layout.",
  },
  "ui.slot.mission-template": {
    label: "Register a mission template",
    description:
      "Lets the plugin add a new entry to the mission template picker so the operator can start missions with the plugin's parameters.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Template metadata only; missions still need approval.",
  },
  "ui.slot.map-overlay": {
    label: "Draw an overlay on the map",
    description:
      "Lets the plugin draw geometry on the map view (polygons, markers, heatmaps). The overlay is rendered in a sandboxed canvas.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Visual layer only; no flight-control effect.",
  },
  "ui.slot.video-overlay": {
    label: "Draw an overlay on the live video",
    description:
      "Lets the plugin draw overlays on top of the live video feed (detection boxes, telemetry HUDs). The overlay is rendered above the player.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Visual layer above the video element.",
  },
  "ui.slot.notification-channel": {
    label: "Show notifications in the GCS",
    description:
      "Lets the plugin push notifications into the GCS notification center so it can surface alerts and status changes to the operator.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Toasts only; the operator can mute or dismiss any channel.",
  },
  "ui.slot.smart-function": {
    label: "Register a smart function",
    description:
      "Lets the plugin add an entry to the Smart Functions list so the operator can trigger a plugin-driven action from the GCS toolbar.",
    category: "ui_slot",
    risk: "medium",
    risk_reason:
      "Smart functions can chain commands; the operator must approve each invocation.",
  },
  "ui.slot.settings-section": {
    label: "Add a section to the Settings page",
    description:
      "Lets the plugin add its own section to the GCS Settings page so the operator can configure the plugin from a single place.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Sandboxed iframe inside the Settings page.",
  },
  "ui.slot.connection-protocol": {
    label: "Register a custom connection protocol",
    description:
      "Lets the plugin offer a new connection protocol in the Connect dialog (for example a vendor radio or a custom transport).",
    category: "ui_slot",
    risk: "medium",
    risk_reason:
      "Connection protocols sit on the path between the GCS and the aircraft.",
  },
  "ui.slot.recording-processor": {
    label: "Process recordings after a flight",
    description:
      "Lets the plugin run a post-flight processing step over recordings (transcoding, analysis, upload). Runs inside a sandboxed worker.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Operates on stored recordings; no live flight effect.",
  },
  "ui.slot.drone-detail-tab": {
    label: "Add a tab to the drone detail panel",
    description:
      "Lets the plugin add a per-drone tab inside the drone detail panel. The tab is scoped to the currently selected drone.",
    category: "ui_slot",
    risk: "low",
    risk_reason: "Sandboxed iframe scoped to one drone.",
  },
  // ---- telemetry / command --------------------------------------
  "telemetry.subscribe": {
    label: "Read live telemetry from drones",
    description:
      "Lets the plugin subscribe to live telemetry streams (attitude, GPS, battery, mode) for the drones the operator has paired with the GCS.",
    category: "data_network",
    risk: "low",
    risk_reason: "Read-only on the telemetry stream.",
  },
  "command.send": {
    label: "Send commands to drones from the GCS",
    description:
      "Lets the plugin send commands to a paired drone through the GCS bridge (arm, takeoff, mode change). The operator approves each install but in-flight commands fire without further prompts.",
    category: "flight_control",
    risk: "medium",
    risk_reason: "Commands take effect immediately during a flight.",
  },
  "recording.write": {
    label: "Save recordings to the GCS library",
    description:
      "Lets the plugin write recordings (video, telemetry CSV, analysis output) into the GCS recording library so the operator can replay them later.",
    category: "data_network",
    risk: "low",
    risk_reason: "Writes are scoped to the recording library.",
  },
  // ---- mission --------------------------------------------------
  "mission.read": {
    label: "Read mission plans loaded in the GCS",
    description:
      "Lets the plugin read the active mission, waypoints, fences, and rally points that the operator has loaded into the GCS planner.",
    category: "flight_control",
    risk: "low",
    risk_reason: "Read-only on mission data.",
  },
  "mission.write": {
    label: "Edit mission plans in the GCS",
    description:
      "Lets the plugin upload, edit, or replace missions in the GCS planner. Used by pattern generators and mission-template plugins.",
    category: "flight_control",
    risk: "high",
    risk_reason: "Mission changes drive autonomous flight paths.",
  },
  // ---- cloud ----------------------------------------------------
  "cloud.read": {
    label: "Read fleet data from the cloud",
    description:
      "Lets the plugin read shared fleet data from the cloud backend (drone status rows, paired devices, fleet roster).",
    category: "data_network",
    risk: "low",
    risk_reason: "Read-only on the cloud rows the user is authorised for.",
  },
  "cloud.write": {
    label: "Write fleet data to the cloud",
    description:
      "Lets the plugin write fleet data to the cloud backend. Used by plugins that synchronise mission outputs or sensor catalogues across operators.",
    category: "data_network",
    risk: "medium",
    risk_reason: "Cloud writes can affect other operators on the same fleet.",
  },
};

// Build-time consistency check: every id in `GCS_CAPABILITIES` must
// have a catalog entry, and the catalog must not carry orphan ids.
// Module load fails loudly on drift.
{
  const known = new Set(Object.keys(CAPABILITY_CATALOG));
  const missing = GCS_CAPABILITIES.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(
      `GCS_CAPABILITIES missing CAPABILITY_CATALOG entries: ${missing.join(", ")}`,
    );
  }
  const declared = new Set<string>(GCS_CAPABILITIES);
  const orphan = Object.keys(CAPABILITY_CATALOG).filter(
    (id) => !declared.has(id),
  );
  if (orphan.length > 0) {
    throw new Error(
      `CAPABILITY_CATALOG has entries not in GCS_CAPABILITIES: ${orphan.join(
        ", ",
      )}`,
    );
  }
}

export function isKnownGcsCapability(cap: string): cap is GcsCapability {
  return (GCS_CAPABILITIES as readonly string[]).includes(cap);
}

/** Return the GCS-side catalog entry for `id`, or `undefined` if the
 * id is not declared on the GCS half. Agent-side ids are not
 * resolved here — they arrive from the agent with metadata already
 * inlined by the parse + install endpoints. */
export function getCapabilityMeta(id: string): CapabilityMeta | undefined {
  return CAPABILITY_CATALOG[id];
}

/** Equivalent to `getCapabilityMeta(id) !== undefined`. Exposed for
 * symmetry with the agent-side helper. */
export function isKnownCapability(id: string): boolean {
  return id in CAPABILITY_CATALOG;
}

/**
 * Merged lookup for the install dialog.
 *
 * The dialog renders both halves' permissions side-by-side. Agent-side
 * ids come back from the server response with the agent catalog
 * inlined; GCS-side ids resolve through the local catalog. This helper
 * returns the local catalog entry when the id is GCS-side, and
 * `undefined` otherwise — callers should prefer the server-inlined
 * metadata when present and fall back to this lookup only when the
 * server response did not carry metadata for the id.
 */
export function getMergedCapabilityMeta(
  id: string,
): CapabilityMeta | undefined {
  return getCapabilityMeta(id);
}
