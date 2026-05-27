/**
 * Render tests for DroneCard. Covers the local-display pill (SPI LCD).
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "../helpers/intl-wrapper";
import type { FleetDrone } from "@/lib/types";

vi.mock("lucide-react", () =>
  new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === "__esModule") return false;
        return (props: Record<string, unknown>) => (
          <span data-testid={`icon-${String(name)}`} {...props} />
        );
      },
    },
  ),
);

vi.mock("@/stores/drone-metadata-store", () => ({
  useDroneMetadataStore: (sel: (s: unknown) => unknown) =>
    sel({ profiles: {} }),
}));

import { DroneCard } from "@/components/shared/drone-card";

function makeDrone(overrides: Partial<FleetDrone> = {}): FleetDrone {
  return {
    id: "test-drone-1",
    name: "Test Drone",
    status: "online",
    connectionState: "connected",
    flightMode: "STABILIZE",
    armState: "disarmed",
    lastHeartbeat: Date.now(),
    healthScore: 100,
    ...overrides,
  } as FleetDrone;
}

describe("DroneCard", () => {
  it("renders the LCD pill when an SPI LCD is attached", () => {
    renderWithIntl(
      <DroneCard drone={makeDrone({ attachedDisplayType: "spi-lcd" })} />,
    );
    expect(screen.getByText("LCD")).toBeDefined();
  });

  it("does not render the LCD pill when no display is attached", () => {
    renderWithIntl(<DroneCard drone={makeDrone()} />);
    expect(screen.queryByText("LCD")).toBeNull();
  });
});
