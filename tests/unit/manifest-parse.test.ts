/**
 * @module ManifestParseTest
 * @description Vitest suite covering the client-side manifest preview
 * parser. Focuses on the rich install-dialog content fields (the
 * legacy short-summary fields are covered transitively by the install
 * dialog's own tests).
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect } from "vitest";

import {
  parseManifestYaml,
  toInstallSummary,
} from "@/components/plugins/transports/manifest-parse";

const BASE = `id: com.altnautica.vision-nav
name: ADOS Vision Navigation
version: 0.2.3
description: Short summary
risk: high
`;

const RICH = `${BASE}description_long: |
  Long description line one.
  Long description line two.

  Long description line four after a blank line.
features:
  - Feature one
  - "Feature two with quotes"
hardware_requirements:
  cameras: USB UVC global-shutter
  fc_firmware: ArduPilot 4.5+
  boards: ["cm4", "cm5", "rk3582"]
  optional:
    - "Rangefinder (TF-Luna)"
resource_impact:
  cpu_percent_peak: 80
  ram_mb: 512
  pids: 24
  startup_time_seconds: 5
required_fc_parameters:
  ardupilot:
    - param: EKF_SOURCE_SET
      note: "Select vision pose source"
  px4:
    - param: EKF2_AID_MASK
      note: "Set VISION_POS and VISION_HEADING bits"
  inav:
    - param: opflow_hardware
      value: MAVLINK
    - param: nav_use_optflow_for_poshold
      value: "ON"
telemetry_fields:
  - navigation.feature_count
  - navigation.drift_m
documentation_url: "https://docs.altnautica.com/drone-agent/vision-nav-overview"
`;

describe("parseManifestYaml — rich fields", () => {
  it("parses every rich field round-trip", () => {
    const parsed = parseManifestYaml(RICH);

    expect(parsed.pluginId).toBe("com.altnautica.vision-nav");
    expect(parsed.version).toBe("0.2.3");
    expect(parsed.risk).toBe("high");

    expect(parsed.descriptionLong).toBeDefined();
    expect(parsed.descriptionLong).toContain("Long description line one.");
    expect(parsed.descriptionLong).toContain("Long description line four");

    expect(parsed.features).toEqual([
      "Feature one",
      "Feature two with quotes",
    ]);

    expect(parsed.hardwareRequirements).toBeDefined();
    expect(parsed.hardwareRequirements?.cameras).toBe("USB UVC global-shutter");
    expect(parsed.hardwareRequirements?.fcFirmware).toBe("ArduPilot 4.5+");
    expect(parsed.hardwareRequirements?.boards).toEqual([
      "cm4",
      "cm5",
      "rk3582",
    ]);
    expect(parsed.hardwareRequirements?.optional).toEqual([
      "Rangefinder (TF-Luna)",
    ]);

    expect(parsed.resourceImpact).toBeDefined();
    expect(parsed.resourceImpact?.cpuPercentPeak).toBe(80);
    expect(parsed.resourceImpact?.ramMb).toBe(512);
    expect(parsed.resourceImpact?.pids).toBe(24);
    expect(parsed.resourceImpact?.startupTimeSeconds).toBe(5);

    expect(parsed.requiredFcParameters).toBeDefined();
    expect(parsed.requiredFcParameters?.ardupilot).toEqual([
      { param: "EKF_SOURCE_SET", note: "Select vision pose source" },
    ]);
    expect(parsed.requiredFcParameters?.px4).toEqual([
      {
        param: "EKF2_AID_MASK",
        note: "Set VISION_POS and VISION_HEADING bits",
      },
    ]);
    expect(parsed.requiredFcParameters?.inav).toEqual([
      { param: "opflow_hardware", value: "MAVLINK" },
      { param: "nav_use_optflow_for_poshold", value: "ON" },
    ]);

    expect(parsed.telemetryFields).toEqual([
      "navigation.feature_count",
      "navigation.drift_m",
    ]);

    expect(parsed.documentationUrl).toBe(
      "https://docs.altnautica.com/drone-agent/vision-nav-overview",
    );

    // Screenshots field absent in this manifest — must stay undefined
    // so the modal can decide not to render an empty gallery.
    expect(parsed.screenshots).toBeUndefined();
  });

  it("parses screenshots when present", () => {
    const yaml = `${BASE}screenshots:
  - url: "https://example.com/a.png"
    caption: "A caption"
  - url: "https://example.com/b.png"
`;
    const parsed = parseManifestYaml(yaml);
    expect(parsed.screenshots).toBeDefined();
    expect(parsed.screenshots).toHaveLength(2);
    expect(parsed.screenshots?.[0]).toEqual({
      url: "https://example.com/a.png",
      caption: "A caption",
    });
    expect(parsed.screenshots?.[1]).toEqual({
      url: "https://example.com/b.png",
    });
  });

  it("leaves rich fields undefined for legacy manifests", () => {
    // Legacy manifest that predates the rich-content fields.
    const legacy = `id: com.example.legacy
name: Legacy Plugin
version: 1.0.0
description: A legacy plugin
permissions:
  - hardware.spi
`;
    const parsed = parseManifestYaml(legacy);
    expect(parsed.pluginId).toBe("com.example.legacy");
    expect(parsed.descriptionLong).toBeUndefined();
    expect(parsed.features).toBeUndefined();
    expect(parsed.hardwareRequirements).toBeUndefined();
    expect(parsed.resourceImpact).toBeUndefined();
    expect(parsed.requiredFcParameters).toBeUndefined();
    expect(parsed.telemetryFields).toBeUndefined();
    expect(parsed.documentationUrl).toBeUndefined();
    expect(parsed.screenshots).toBeUndefined();
    // Old permission list must still parse correctly.
    expect(parsed.permissions.map((p) => p.id)).toContain("hardware.spi");
  });
});

describe("toInstallSummary — rich fields", () => {
  it("passes every rich field through to the install summary", () => {
    const parsed = parseManifestYaml(RICH);
    const summary = toInstallSummary(parsed, "deadbeef");

    expect(summary.descriptionLong).toContain("Long description line one.");
    expect(summary.features).toEqual([
      "Feature one",
      "Feature two with quotes",
    ]);

    expect(summary.hardwareRequirements?.cameras).toBe(
      "USB UVC global-shutter",
    );
    expect(summary.hardwareRequirements?.fcFirmware).toBe("ArduPilot 4.5+");
    expect(summary.hardwareRequirements?.boards).toEqual([
      "cm4",
      "cm5",
      "rk3582",
    ]);
    expect(summary.hardwareRequirements?.optional).toEqual([
      "Rangefinder (TF-Luna)",
    ]);

    expect(summary.resourceImpact?.ramMb).toBe(512);
    expect(summary.resourceImpact?.cpuPercentPeak).toBe(80);

    expect(summary.requiredFcParameters?.ardupilot).toHaveLength(1);
    expect(summary.requiredFcParameters?.ardupilot?.[0]?.param).toBe(
      "EKF_SOURCE_SET",
    );
    expect(summary.requiredFcParameters?.inav?.[0]?.value).toBe("MAVLINK");

    expect(summary.telemetryFields).toEqual([
      "navigation.feature_count",
      "navigation.drift_m",
    ]);

    expect(summary.documentationUrl).toBe(
      "https://docs.altnautica.com/drone-agent/vision-nav-overview",
    );
    expect(summary.screenshots).toBeUndefined();
    expect(summary.manifestHash).toBe("deadbeef");
  });

  it("leaves rich fields undefined when the manifest omits them", () => {
    const legacy = `id: com.example.legacy
name: Legacy Plugin
version: 1.0.0
description: A legacy plugin
`;
    const parsed = parseManifestYaml(legacy);
    const summary = toInstallSummary(parsed, "cafebabe");
    expect(summary.descriptionLong).toBeUndefined();
    expect(summary.features).toBeUndefined();
    expect(summary.hardwareRequirements).toBeUndefined();
    expect(summary.resourceImpact).toBeUndefined();
    expect(summary.requiredFcParameters).toBeUndefined();
    expect(summary.telemetryFields).toBeUndefined();
    expect(summary.documentationUrl).toBeUndefined();
    expect(summary.screenshots).toBeUndefined();
    expect(summary.manifestHash).toBe("cafebabe");
  });
});
