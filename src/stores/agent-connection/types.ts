/**
 * @module AgentConnectionStoreTypes
 * @description Shared types for the agent connection store slices.
 * @license GPL-3.0-only
 */

import type { StateCreator } from "zustand";
import type { AgentClient } from "@/lib/agent/client";
import type { AgentStatus } from "@/lib/agent/types";

/**
 * Local agent state: REST URL, API key, polling lifecycle, failure cascade.
 */
export interface LocalState {
  agentUrl: string | null;
  apiKey: string | null;
  connected: boolean;
  client: AgentClient | null;
  connectionError: string | null;
  pollInterval: ReturnType<typeof setInterval> | null;
  /** Consecutive poll failures. Used by the local-mode staleness cascade. */
  consecutiveFailures: number;
  /** MAVLink WebSocket URL derived from agent heartbeat or direct connection. */
  mavlinkUrl: string | null;
}

/**
 * Cloud-mode state: device ID, MQTT readiness, last cloud heartbeat.
 */
export interface CloudState {
  cloudMode: boolean;
  cloudDeviceId: string | null;
  mqttConnected: boolean;
  lastCloudUpdate: number | null;
}

/**
 * Local-state setters and the staleness cascade callbacks.
 */
export interface LocalActions {
  setApiKey: (key: string | null) => void;
  setMavlinkUrl: (url: string | null) => void;
  noteFetchSuccess: () => void;
  noteFetchFailure: () => void;
}

/**
 * Cloud-mode setters and command relay.
 */
export interface CloudActions {
  connectCloud: (deviceId: string) => void;
  sendCloudCommand: (command: string, args?: Record<string, unknown>) => void;
  setCloudStatus: (status: AgentStatus, dataTimestamp?: number) => void;
  setMqttConnected: (connected: boolean) => void;
}

/**
 * Connection lifecycle: client construction, polling, teardown.
 */
export interface ClientManagerActions {
  connect: (url: string, apiKey?: string | null) => Promise<void>;
  disconnect: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  clear: () => void;
}

export type LocalStateSlice = LocalState & LocalActions;
export type CloudStateSlice = CloudState & CloudActions;
export type ClientManagerSlice = ClientManagerActions;

export type AgentConnectionStore =
  & LocalStateSlice
  & CloudStateSlice
  & ClientManagerSlice;

export type AgentConnectionSliceCreator<T> = StateCreator<
  AgentConnectionStore,
  [],
  [],
  T
>;

/** Cap for CPU/memory ring history buffers in the system store. */
export const MAX_CPU_HISTORY = 60;
