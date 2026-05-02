import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock cesium before importing the store
vi.mock('cesium', () => {
  class JulianDate {
    static clone = vi.fn((d: any) => d ?? new JulianDate());
    static addSeconds = vi.fn((_d: any, _s: number, result: any) => result ?? new JulianDate());
    static secondsDifference = vi.fn(() => 0);
  }
  return { JulianDate, Viewer: vi.fn() };
});

import { useSimulationStore } from '@/stores/simulation-store';
import type { PlaybackState, CameraMode } from '@/stores/simulation-store';

describe('simulation-store', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useSimulationStore.getState().reset();
  });

  it('initial state is stopped', () => {
    const state = useSimulationStore.getState();
    expect(state.playbackState).toBe('stopped');
    expect(state.playbackSpeed).toBe(1);
    expect(state.elapsed).toBe(0);
    expect(state.totalDuration).toBe(0);
    expect(state.cameraMode).toBe('topdown');
    expect(state.syncedPosition).toBeNull();
    expect(state.followHeadingLocked).toBe(true);
  });

  it('play() does not transition without a bound viewer', () => {
    // Without a Cesium viewer bound, play() early-returns
    useSimulationStore.getState().play();
    expect(useSimulationStore.getState().playbackState).toBe('stopped');
  });

  it('pause() transitions to paused', () => {
    useSimulationStore.getState().pause();
    expect(useSimulationStore.getState().playbackState).toBe('paused');
  });

  it('stop() transitions to stopped and resets elapsed', () => {
    // Simulate some elapsed time
    useSimulationStore.setState({ playbackState: 'playing', elapsed: 30 });
    useSimulationStore.getState().stop();

    const state = useSimulationStore.getState();
    expect(state.playbackState).toBe('stopped');
    expect(state.elapsed).toBe(0);
  });

  it('seek() clamps to valid range', () => {
    useSimulationStore.setState({ totalDuration: 100 });

    useSimulationStore.getState().seek(50);
    expect(useSimulationStore.getState().elapsed).toBe(50);

    // Clamps to max
    useSimulationStore.getState().seek(200);
    expect(useSimulationStore.getState().elapsed).toBe(100);

    // Clamps to min
    useSimulationStore.getState().seek(-10);
    expect(useSimulationStore.getState().elapsed).toBe(0);
  });

  it('setSpeed() updates playback speed', () => {
    useSimulationStore.getState().setSpeed(2);
    expect(useSimulationStore.getState().playbackSpeed).toBe(2);

    useSimulationStore.getState().setSpeed(0.5);
    expect(useSimulationStore.getState().playbackSpeed).toBe(0.5);
  });

  it('setCameraMode() updates camera mode', () => {
    useSimulationStore.getState().setCameraMode('follow');
    expect(useSimulationStore.getState().cameraMode).toBe('follow');

    useSimulationStore.getState().setCameraMode('orbit');
    expect(useSimulationStore.getState().cameraMode).toBe('orbit');
  });

  it('setTotalDuration() updates total duration', () => {
    useSimulationStore.getState().setTotalDuration(300);
    expect(useSimulationStore.getState().totalDuration).toBe(300);
  });

  it('stepForward() advances by 1 second', () => {
    useSimulationStore.setState({ totalDuration: 100, elapsed: 10 });
    useSimulationStore.getState().stepForward();
    expect(useSimulationStore.getState().elapsed).toBe(11);
  });

  it('stepBack() retreats by 1 second', () => {
    useSimulationStore.setState({ totalDuration: 100, elapsed: 10 });
    useSimulationStore.getState().stepBack();
    expect(useSimulationStore.getState().elapsed).toBe(9);
  });

  it('stepForward() does not exceed total duration', () => {
    useSimulationStore.setState({ totalDuration: 10, elapsed: 10 });
    useSimulationStore.getState().stepForward();
    expect(useSimulationStore.getState().elapsed).toBe(10);
  });

  it('stepBack() does not go below zero', () => {
    useSimulationStore.setState({ totalDuration: 100, elapsed: 0 });
    useSimulationStore.getState().stepBack();
    expect(useSimulationStore.getState().elapsed).toBe(0);
  });

  it('syncPosition() stores synced position', () => {
    const pos = { lat: 12.97, lon: 77.59, altAgl: 50, heading: 180, speed: 5, waypointIndex: 2 };
    useSimulationStore.getState().syncPosition(pos);
    expect(useSimulationStore.getState().syncedPosition).toEqual(pos);
  });

  it('syncPosition() throttles high-frequency same-waypoint updates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const first = { lat: 12.97, lon: 77.59, altAgl: 50, heading: 180, speed: 5, waypointIndex: 2 };
    const second = { lat: 12.971, lon: 77.591, altAgl: 51, heading: 181, speed: 6, waypointIndex: 2 };

    useSimulationStore.getState().syncPosition(first);
    vi.setSystemTime(1_050);
    useSimulationStore.getState().syncPosition(second);
    expect(useSimulationStore.getState().syncedPosition).toEqual(first);

    vi.setSystemTime(1_101);
    useSimulationStore.getState().syncPosition(second);
    expect(useSimulationStore.getState().syncedPosition).toEqual(second);
  });

  it('syncPosition() allows immediate waypoint-index changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);

    const first = { lat: 12.97, lon: 77.59, altAgl: 50, heading: 180, speed: 5, waypointIndex: 2 };
    const second = { lat: 12.971, lon: 77.591, altAgl: 51, heading: 181, speed: 6, waypointIndex: 3 };

    useSimulationStore.getState().syncPosition(first);
    vi.setSystemTime(2_001);
    useSimulationStore.getState().syncPosition(second);
    expect(useSimulationStore.getState().syncedPosition).toEqual(second);
  });

  it('toggleFollowHeading() toggles the lock', () => {
    expect(useSimulationStore.getState().followHeadingLocked).toBe(true);
    useSimulationStore.getState().toggleFollowHeading();
    expect(useSimulationStore.getState().followHeadingLocked).toBe(false);
    useSimulationStore.getState().toggleFollowHeading();
    expect(useSimulationStore.getState().followHeadingLocked).toBe(true);
  });

  it('reset() restores all defaults', () => {
    useSimulationStore.setState({
      playbackState: 'playing',
      playbackSpeed: 4,
      elapsed: 55,
      totalDuration: 200,
      cameraMode: 'orbit',
      sourceLibraryPlanId: 'plan-123',
      syncedPosition: { lat: 0, lon: 0, altAgl: 0, heading: 0, speed: 0, waypointIndex: 0 },
      followHeadingLocked: false,
    });

    useSimulationStore.getState().reset();

    const state = useSimulationStore.getState();
    expect(state.playbackState).toBe('stopped');
    expect(state.playbackSpeed).toBe(1);
    expect(state.elapsed).toBe(0);
    expect(state.totalDuration).toBe(0);
    expect(state.cameraMode).toBe('topdown');
    expect(state.sourceLibraryPlanId).toBeNull();
    expect(state.syncedPosition).toBeNull();
    expect(state.followHeadingLocked).toBe(true);
  });
});
