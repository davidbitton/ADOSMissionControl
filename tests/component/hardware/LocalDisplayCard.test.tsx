/**
 * @module LocalDisplayCard.test
 * @description Verifies the extended local-display card: pill colors,
 * theme pill, last-touch row, active-page row, and the calibrate
 * button. Also exercises the agent-client invocation on calibrate.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithIntl } from "../../helpers/intl-wrapper";

vi.mock("lucide-react", () => {
  function makeStub(name: string) {
    function StubIcon(props: Record<string, unknown>) {
      return <span data-testid={`icon-${name}`} {...props} />;
    }
    StubIcon.displayName = `StubIcon(${name})`;
    return StubIcon;
  }
  return {
    __esModule: true,
    Monitor: makeStub("Monitor"),
    Loader2: makeStub("Loader2"),
    ImageOff: makeStub("ImageOff"),
    X: makeStub("X"),
  };
});

const mockClient = {
  startDisplayCalibration: vi.fn().mockResolvedValue({ ok: true }),
};

vi.mock("@/stores/agent-connection-store", () => ({
  useAgentConnectionStore: (sel: (s: unknown) => unknown) =>
    sel({ agentUrl: "http://groundnode.local:8080", apiKey: null, client: mockClient }),
}));

const toastFn = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastFn }),
}));

import { LocalDisplayCard } from "@/components/hardware/LocalDisplayCard";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";

const initial = useAgentCapabilitiesStore.getState();

beforeEach(() => {
  toastFn.mockClear();
  mockClient.startDisplayCalibration.mockClear();
  useAgentCapabilitiesStore.setState({ ...initial, loaded: true }, true);
});

afterEach(() => {
  useAgentCapabilitiesStore.setState(initial, true);
});

describe("LocalDisplayCard", () => {
  it("renders nothing when no display is bound", () => {
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      display: { type: "none" },
    });
    const { container } = renderWithIntl(<LocalDisplayCard />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the green calibrated pill when touch is calibrated", () => {
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      display: {
        type: "spi-lcd",
        controller: "ili9486",
        resolution: "480x320",
        rotation: 90,
        hasTouch: true,
        touchCalibrated: true,
      },
    });
    renderWithIntl(<LocalDisplayCard />);
    const pill = screen.getByText("Calibrated");
    expect(pill).toBeDefined();
    expect(pill.className).toMatch(/text-status-success/);
  });

  it("shows the amber not-calibrated pill when hasTouch but not calibrated", () => {
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      display: {
        type: "spi-lcd",
        hasTouch: true,
        touchCalibrated: false,
      },
    });
    renderWithIntl(<LocalDisplayCard />);
    const pill = screen.getByText("Not calibrated");
    expect(pill).toBeDefined();
    expect(pill.className).toMatch(/text-status-warning/);
  });

  it("shows the gray no-touch pill when the panel has no touch", () => {
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      display: {
        type: "spi-lcd",
        hasTouch: false,
      },
    });
    renderWithIntl(<LocalDisplayCard />);
    const pills = screen.getAllByText("No touch");
    expect(pills.length).toBeGreaterThan(0);
  });

  it("renders the theme pill from uiTheme", () => {
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      uiTheme: "light",
      display: { type: "spi-lcd", hasTouch: true, touchCalibrated: true },
    });
    renderWithIntl(<LocalDisplayCard />);
    expect(screen.getByText("Light")).toBeDefined();
  });

  it("renders the last-touch and active-page rows when present", () => {
    const ts = Date.now() - 3_000;
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      display: {
        type: "spi-lcd",
        hasTouch: true,
        touchCalibrated: true,
        lastTouchAt: ts,
        activePage: "dashboard",
      },
    });
    renderWithIntl(<LocalDisplayCard />);
    expect(screen.getByText(/3 s ago/)).toBeDefined();
    expect(screen.getByText("dashboard")).toBeDefined();
  });

  it("hides last-touch row when lastTouchAt is undefined", () => {
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      display: { type: "spi-lcd", hasTouch: true, touchCalibrated: true },
    });
    renderWithIntl(<LocalDisplayCard />);
    expect(screen.queryByText(/Last touch/)).toBeNull();
  });

  it("fires startDisplayCalibration when the calibrate button is clicked", async () => {
    const onStarted = vi.fn();
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      display: { type: "spi-lcd", hasTouch: true, touchCalibrated: false },
    });
    renderWithIntl(<LocalDisplayCard onCalibrationStarted={onStarted} />);
    fireEvent.click(screen.getByText("Calibrate touch"));
    await waitFor(() => {
      expect(mockClient.startDisplayCalibration).toHaveBeenCalledTimes(1);
    });
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(toastFn).toHaveBeenCalledWith(
      "Calibration started on the LCD",
      "info",
    );
  });

  it("does not show the calibrate button when the panel has no touch", () => {
    useAgentCapabilitiesStore.setState({
      ...initial,
      loaded: true,
      display: { type: "spi-lcd", hasTouch: false },
    });
    renderWithIntl(<LocalDisplayCard />);
    expect(screen.queryByText("Calibrate touch")).toBeNull();
  });
});
