/**
 * @license GPL-3.0-only
 *
 * Render tests for the single-page review stage. Covers the identity
 * header, the trust strip, permission categorisation, the install
 * button label updating with the granted count, and the disabled
 * state when the host is incompatible.
 */

import { describe, it, expect, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { render, fireEvent, screen } from "@testing-library/react";

import messages from "../../../../../locales/en.json";
import { ReviewStage } from "../sections/ReviewStage";
import type { InstallManifestSummary } from "../../PluginInstallDialog";
import type { CompatibilityResult } from "../check-compatibility";

vi.mock("lucide-react", async () => {
  // Re-export from the real module so every icon name resolves to a
  // valid component without us having to enumerate every glyph the
  // ReviewStage + section files pull in.
  const actual = await vi.importActual<typeof import("lucide-react")>(
    "lucide-react",
  );
  return actual;
});

function wrap(node: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

const baseManifest: InstallManifestSummary = {
  pluginId: "altnautica.vision-nav",
  version: "0.2.3",
  name: "Vision Nav",
  author: "Altnautica",
  description: "GPS-denied estimator",
  license: "GPL-3.0-or-later",
  risk: "high",
  halves: ["agent", "gcs"],
  signerId: "altnautica-2026-A",
  trustSignals: ["signed", "verified-publisher"],
  permissions: [
    {
      id: "hardware.usb.uvc",
      required: true,
      label: "Read frames from USB UVC cameras",
      category: "hardware",
      risk: "medium",
    },
    {
      id: "mavlink.write",
      required: true,
      label: "Send MAVLink commands to flight controller",
      category: "flight_control",
      risk: "high",
    },
    {
      id: "process.spawn",
      required: true,
      label: "Spawn subprocesses on the agent host",
      category: "compute_process",
      risk: "high",
    },
    {
      id: "cloud.write",
      required: false,
      label: "Publish data to the cloud relay",
      category: "data_network",
      risk: "low",
    },
  ],
  features: ["Optical flow estimator", "VIO fusion"],
  hardwareRequirements: { boards: ["rk3582"] },
  resourceImpact: { ramMb: 1024, cpuPercentPeak: 60 },
};

function compat(boardOk: boolean): CompatibilityResult {
  return {
    boardCompatible: boardOk,
    boardReason: boardOk ? undefined : "rpi4b",
    ramOk: true,
    cpuOk: true,
  };
}

describe("ReviewStage", () => {
  it("renders the plugin identity header and target drone", () => {
    render(
      wrap(
        <ReviewStage
          manifest={baseManifest}
          targetName="skynode"
          boardLabel="rock-5c-lite"
          compatibility={compat(true)}
          firstParty
          granted={new Set(["hardware.usb.uvc", "mavlink.write", "process.spawn"])}
          onTogglePermission={() => {}}
          onCancel={() => {}}
          onInstall={() => {}}
        />,
      ),
    );
    expect(screen.getByText("Vision Nav")).toBeInTheDocument();
    expect(screen.getByText(/by Altnautica/)).toBeInTheDocument();
    expect(screen.getByText(/Installing to: skynode/)).toBeInTheDocument();
  });

  it("renders permissions grouped by category", () => {
    render(
      wrap(
        <ReviewStage
          manifest={baseManifest}
          targetName="skynode"
          boardLabel="rock-5c-lite"
          compatibility={compat(true)}
          firstParty
          granted={new Set(["hardware.usb.uvc", "mavlink.write", "process.spawn"])}
          onTogglePermission={() => {}}
          onCancel={() => {}}
          onInstall={() => {}}
        />,
      ),
    );
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Flight Control")).toBeInTheDocument();
    expect(screen.getByText("Compute & Process")).toBeInTheDocument();
    expect(screen.getByText("Data & Network")).toBeInTheDocument();
    expect(
      screen.getByText("Read frames from USB UVC cameras"),
    ).toBeInTheDocument();
  });

  it("renders a Sensitive pill on high-risk permissions", () => {
    render(
      wrap(
        <ReviewStage
          manifest={baseManifest}
          targetName="skynode"
          boardLabel="rock-5c-lite"
          compatibility={compat(true)}
          firstParty
          granted={new Set()}
          onTogglePermission={() => {}}
          onCancel={() => {}}
          onInstall={() => {}}
        />,
      ),
    );
    // mavlink.write + process.spawn are high-risk → two Sensitive pills.
    const pills = screen.getAllByText(/Sensitive/i);
    expect(pills.length).toBeGreaterThanOrEqual(2);
  });

  it("updates the install button label with the granted count", () => {
    render(
      wrap(
        <ReviewStage
          manifest={baseManifest}
          targetName="skynode"
          boardLabel="rock-5c-lite"
          compatibility={compat(true)}
          firstParty
          granted={new Set(["hardware.usb.uvc", "mavlink.write"])}
          onTogglePermission={() => {}}
          onCancel={() => {}}
          onInstall={() => {}}
        />,
      ),
    );
    expect(
      screen.getByRole("button", { name: /Install with 2 permissions/i }),
    ).toBeInTheDocument();
  });

  it("disables install when the host is incompatible", () => {
    render(
      wrap(
        <ReviewStage
          manifest={baseManifest}
          targetName="skynode"
          boardLabel="rpi4b"
          compatibility={compat(false)}
          firstParty
          granted={new Set(["hardware.usb.uvc"])}
          onTogglePermission={() => {}}
          onCancel={() => {}}
          onInstall={() => {}}
        />,
      ),
    );
    const btn = screen.getByRole("button", {
      name: /Install with 1 permissions/i,
    });
    expect(btn).toBeDisabled();
  });

  it("fires onInstall when the install button is clicked", () => {
    const onInstall = vi.fn();
    render(
      wrap(
        <ReviewStage
          manifest={baseManifest}
          targetName="skynode"
          boardLabel="rock-5c-lite"
          compatibility={compat(true)}
          firstParty
          granted={new Set(["hardware.usb.uvc"])}
          onTogglePermission={() => {}}
          onCancel={() => {}}
          onInstall={onInstall}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Install with 1 permissions/i }),
    );
    expect(onInstall).toHaveBeenCalledOnce();
  });
});
