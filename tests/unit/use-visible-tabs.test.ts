/**
 * Verifies the Command sub-tab visibility hook. Ground stations drop
 * tabs that only make sense on a flying node.
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
  it("returns overview + system + scripts + plugins for a loaded drone agent", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
    });
    const { result } = renderHook(() => useVisibleTabs());
    expect(result.current).toEqual([
      "overview",
      "system",
      "scripts",
      "plugins",
    ]);
  });

  it("includes the ROS sub-tab when the agent reports ROS support", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
      ros2State: "available",
    });
    const { result } = renderHook(() => useVisibleTabs());
    expect(result.current).toContain("ros");
    expect(result.current).toContain("scripts");
  });

  it("drops scripts, ros, and plugins for a ground station", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
      profile: "ground-station",
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

  it("keeps overview and system visible for a ground station", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
      profile: "ground-station",
    });
    const { result } = renderHook(() => useVisibleTabs());
    expect(result.current).toEqual(["overview", "system"]);
  });

  it("shows plugins for a drone agent and hides it on a ground station", () => {
    useAgentCapabilitiesStore.setState({
      loaded: true,
    });
    expect(renderHook(() => useVisibleTabs()).result.current).toContain(
      "plugins",
    );
    useAgentCapabilitiesStore.setState({
      loaded: true,
      profile: "ground-station",
    });
    expect(
      renderHook(() => useVisibleTabs()).result.current,
    ).not.toContain("plugins");
  });
});
