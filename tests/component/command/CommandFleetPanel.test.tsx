/**
 * Render smoke test for CommandFleetPanel. Mocks the fleet store and the
 * drone manager so the panel can render without live state.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock lucide-react with explicit named exports for every icon the
// component imports. Earlier revisions used a Proxy-trap mock; vitest
// 4.x no longer evaluates Proxy-based module mocks and threw "No <name>
// export is defined" at render time, which masked as a worker hang on
// 4.0.18 and as a fast failure on 4.1.x. Stick to the explicit-named
// pattern that the rest of the Command suite uses (see
// CommandFleetOverview.test.tsx).
vi.mock("lucide-react", () => {
  const Icon =
    (name: string) =>
    (props: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
  return {
    Search: Icon("Search"),
    ChevronLeft: Icon("ChevronLeft"),
    ChevronRight: Icon("ChevronRight"),
  };
});

vi.mock("@/stores/fleet-store", () => ({
  useFleetStore: (sel: (s: unknown) => unknown) => sel({ drones: [] }),
}));

vi.mock("@/stores/drone-manager", () => ({
  useDroneManager: (sel: (s: unknown) => unknown) =>
    sel({
      selectedDroneId: null,
      selectDrone: vi.fn(),
    }),
}));

vi.mock("@/components/shared/drone-card", () => ({
  DroneCard: () => <div data-testid="drone-card" />,
}));

vi.mock("@/components/shared/drone-tile", () => ({
  DroneTile: () => <div data-testid="drone-tile" />,
}));

import { CommandFleetPanel } from "@/components/command/CommandFleetPanel";

describe("CommandFleetPanel", () => {
  it("renders the expanded panel without crashing", () => {
    const { container } = render(
      <CommandFleetPanel collapsed={false} onToggleCollapse={() => {}} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("renders the collapsed panel without crashing", () => {
    const { container } = render(
      <CommandFleetPanel collapsed onToggleCollapse={() => {}} />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
