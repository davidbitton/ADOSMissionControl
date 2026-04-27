/**
 * Render smoke test for CommandFleetPanel. Mocks the fleet store and the
 * drone manager so the panel can render without live state.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Currently excluded from vitest runs via vitest.config.ts. The runner
// hangs at module-load on this file under vitest 4.0.18; the test bodies
// themselves are still valid and the file is preserved for restoration.

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
