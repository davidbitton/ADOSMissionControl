/**
 * @module InstallDialogTypes
 * @description Shared types used by the per-drone plugin install
 * dialog. Split out of `PluginInstallDialog.tsx` so the orchestrator
 * file stays under the 300 LOC soft ceiling. These shapes are imported
 * by transports, sections, and the registry-card grid; keep them
 * forward-compatible — older agents and manifests may omit any of the
 * rich content fields, and the modal falls back to the legacy short
 * summary.
 *
 * @license GPL-3.0-only
 */

import type { PluginHalf, PluginRiskLevel } from "@/lib/plugins/types";

import type { TrustSignal } from "../TrustBadge";

/** Manifest summary the dialog needs to render the pre-install screen. */
export interface InstallManifestSummary {
  pluginId: string;
  version: string;
  name: string;
  description?: string;
  author?: string;
  license?: string;
  risk: PluginRiskLevel;
  halves: ReadonlyArray<PluginHalf>;
  signerId?: string;
  trustSignals: ReadonlyArray<TrustSignal>;
  permissions: ReadonlyArray<{
    id: string;
    required: boolean;
    /** Plain-language sentence rendered as the permission row title. */
    label?: string;
    /** Body paragraph describing what the permission unlocks. */
    description?: string;
    /** Coarse grouping the dialog can use for section headers. */
    category?:
      | "hardware"
      | "flight_control"
      | "data_network"
      | "compute_process"
      | "ui_slot";
    /** Per-permission risk classification rendered as a small badge. */
    risk?: "low" | "medium" | "high" | "critical";
    /** One-line explanation rendered next to the per-permission badge. */
    risk_reason?: string;
    /** True when the permission id is not in the catalog the dialog
     * knows about. The agent's REST gate refuses such manifests
     * outright; this flag only fires on the local-file client-side
     * preview path when the GCS has no agent-side catalog to ask. */
    unknown?: boolean;
  }>;
  /** Optional vendor-attribution entries the agent-half manifest
   * declares. Used to detect NPU vendor SDKs when deriving the NPU
   * capability chip. Absent for first-party plugins that don't bundle
   * vendor binaries. */
  vendorAttribution?: ReadonlyArray<{ name?: string; license?: string }>;
  /** Long-form paragraph that supplements the short ``description``. */
  descriptionLong?: string;
  /** Bullet list of headline features the plugin ships. */
  features?: ReadonlyArray<string>;
  /** Hardware-side requirements the operator should verify. */
  hardwareRequirements?: {
    cameras?: string;
    fcFirmware?: string;
    boards?: ReadonlyArray<string>;
    optional?: ReadonlyArray<string>;
  };
  /** Forecast runtime impact. The supervisor still enforces the hard
   * limits declared under the agent's ``resources`` block; these
   * numbers are pure copy. */
  resourceImpact?: {
    cpuPercentPeak?: number;
    ramMb?: number;
    pids?: number;
    startupTimeSeconds?: number;
  };
  /** Per-firmware FC parameter hints the operator should set after
   * install. Each firmware bucket is optional so a plugin can ship
   * guidance for only the firmware it actually targets. */
  requiredFcParameters?: {
    ardupilot?: ReadonlyArray<{
      param: string;
      note?: string;
      value?: string | number;
    }>;
    px4?: ReadonlyArray<{
      param: string;
      note?: string;
      value?: string | number;
    }>;
    inav?: ReadonlyArray<{
      param: string;
      note?: string;
      value?: string | number;
    }>;
  };
  /** Telemetry topic paths the plugin will publish once running. */
  telemetryFields?: ReadonlyArray<string>;
  /** Public-docs URL (https:// only). */
  documentationUrl?: string;
  /** Screenshot URLs rendered as a gallery in the modal. */
  screenshots?: ReadonlyArray<{ url: string; caption?: string }>;
}

/** Origin of the archive being installed. Drives transport selection
 * inside the dialog: a `file` source uses the multipart endpoint (or
 * Convex storage on failover); a `registry` source hands the canonical
 * URL + SHA-256 pin to the agent's install-from-URL endpoint. */
export type InstallSource =
  | { kind: "file"; file: File; manifestHash: string }
  | {
      kind: "registry";
      url: string;
      expectedSha256: string;
      pluginId: string;
      version: string;
    };

/** Minimal shape the dialog needs from its target. Accepts both
 * `PairedDrone` from the pairing store and `FleetDrone` when the
 * caller maps one into the other. */
export interface InstallTargetDrone {
  /** Convex row id when the drone is paired through the cloud store,
   * or a stable client-side id when it isn't. */
  _id: string;
  /** Wire-level device id used by the agent and the cloud relay. */
  deviceId: string;
  /** Display name shown in the modal chrome. */
  name: string;
}
