/**
 * Verifies the Command sub-tab visibility hook. Drones running the
 * lightweight backend should not be offered scripting or ROS surfaces
 * because the binary does not ship those subsystems. Ground stations
 * drop tabs that only make sense on a flying node.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useVisibleTabs } from "@/hooks/use-visible-tabs";
import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";

const initialState = useAgentCapabilitiesStore.getState();

beforeEach(() => {
  useAgentCapabilitiesStore.setState(
    {
      ...initialState,
      tier: 0,
      cameras: [],
      compute: { ...initialState.compute, npu_available: false },
      vision: initialState.vision,
      models: initialState.models,
      ros2State: "absent",
      runtimeMode: "full",
      display: undefined,
      loaded: false,
    },
    true,
  );
});

afterEach(() => {
  useAgentCapabilitiesStore.setState(initialState, true);
});

describe("useVisibleTabs", () => {
  it("returns overview + system + scripts + plugins for a loaded full drone agent", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
      runtimeMode: "full",
    });
    const { result } = renderHook(() => useVisibleTabs());
    expect(result.current).toEqual([
      "overview",
      "system",
      "scripts",
      "plugins",
    ]);
  });

  it("includes the ROS sub-tab when the full agent reports ROS support", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
      runtimeMode: "full",
      ros2State: "available",
    });
    const { result } = renderHook(() => useVisibleTabs());
    expect(result.current).toContain("ros");
    expect(result.current).toContain("scripts");
  });

  it("drops scripts, ros, and plugins for a lite agent", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
      runtimeMode: "lite",
      cameras: [
        {
          name: "uvc-cam",
          type: "usb",
          device: "/dev/video0",
          resolution: "1280x720",
          streaming: true,
        },
      ],
      compute: { ...initialState.compute, npu_available: true },
      tier: 4,
      ros2State: "running",
    });
    const { result } = renderHook(() => useVisibleTabs());
    expect(result.current).not.toContain("scripts");
    expect(result.current).not.toContain("ros");
    expect(result.current).not.toContain("plugins");
  });

  it("keeps overview and system visible for a lite agent", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
      runtimeMode: "lite",
    });
    const { result } = renderHook(() => useVisibleTabs());
    expect(result.current).toEqual(["overview", "system"]);
  });

  it("treats an undefined runtimeMode as full backend", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
    });
    const { result } = renderHook(() => useVisibleTabs());
    expect(result.current).toContain("scripts");
    expect(result.current).toContain("plugins");
  });

  it("shows plugins for a full drone agent and hides it on a ground station", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
      runtimeMode: "full",
    });
    expect(renderHook(() => useVisibleTabs()).result.current).toContain(
      "plugins",
    );
    useAgentCapabilitiesStore.setState({
      loaded: true,
      runtimeMode: "full",
      profile: "ground-station",
    });
    expect(
      renderHook(() => useVisibleTabs()).result.current,
    ).not.toContain("plugins");
  });
});
