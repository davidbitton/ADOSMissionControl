/**
 * @module RosStore
 * @description Zustand store for ADOS ROS 2 integration state.
 * Manages ROS environment lifecycle, polling, nodes, topics, and VIO health.
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import type {
  RosState,
  RosStatusResponse,
  RosNodeInfo,
  RosTopicInfo,
  RosVioHealth,
  RosWorkspaceInfo,
  RosRecording,
} from "@/lib/agent/ros-types";
import { RosClient } from "@/lib/agent/ros-client";

interface RosStoreState {
  // Connection
  client: RosClient | null;
  polling: boolean;

  // Environment state
  rosState: RosState;
  error: string | null;
  distro: string;
  middleware: string;
  profile: string;
  foxglovePort: number;
  foxgloveUrl: string | null;
  containerId: string | null;
  uptimeS: number | null;

  // Node graph
  nodes: RosNodeInfo[];
  nodesCount: number;

  // Topics
  topics: RosTopicInfo[];
  topicsCount: number;

  // VIO health
  vio: RosVioHealth | null;

  // Workspace
  workspace: RosWorkspaceInfo | null;

  // Recordings
  recordings: RosRecording[];

  // Init progress
  initProgress: { step: string; message: string }[];
  initInProgress: boolean;

  // Active sub-view
  activeSubView: RosSubView;
}

export type RosSubView =
  | "overview"
  | "node-graph"
  | "topics"
  | "workspace"
  | "recordings"
  | "settings";

interface RosStoreActions {
  setClient: (baseUrl: string, apiKey: string) => void;
  clearClient: () => void;

  // Polling
  pollStatus: () => Promise<void>;
  pollNodes: () => Promise<void>;
  pollTopics: () => Promise<void>;

  // Workspace + recording polling
  pollWorkspace: () => Promise<void>;
  pollRecordings: () => Promise<void>;

  // Actions
  initialize: (profile: string, middleware: string) => Promise<void>;
  stop: () => Promise<void>;

  // UI
  setActiveSubView: (view: RosSubView) => void;

  // Cleanup
  clear: () => void;
}

const INITIAL_STATE: RosStoreState = {
  client: null,
  polling: false,
  rosState: "not_initialized",
  error: null,
  distro: "jazzy",
  middleware: "zenoh",
  profile: "minimal",
  foxglovePort: 8766,
  foxgloveUrl: null,
  containerId: null,
  uptimeS: null,
  nodes: [],
  nodesCount: 0,
  topics: [],
  topicsCount: 0,
  vio: null,
  workspace: null,
  recordings: [],
  initProgress: [],
  initInProgress: false,
  activeSubView: "overview",
};

export const useRosStore = create<RosStoreState & RosStoreActions>((set, get) => ({
  ...INITIAL_STATE,

  setClient: (baseUrl, apiKey) => {
    set({ client: new RosClient(baseUrl, apiKey) });
  },

  clearClient: () => {
    set({ client: null, polling: false });
  },

  pollStatus: async () => {
    const { client } = get();
    if (!client) return;

    try {
      const status: RosStatusResponse = await client.getStatus();
      set({
        rosState: status.state,
        error: status.error,
        distro: status.distro,
        middleware: status.middleware,
        profile: status.profile,
        foxglovePort: status.foxglove_port,
        foxgloveUrl: status.foxglove_url,
        containerId: status.container_id,
        uptimeS: status.uptime_s,
        nodesCount: status.nodes_count,
        topicsCount: status.topics_count,
        vio: status.vio || null,
        polling: true,
      });
    } catch {
      // Agent might not support ROS yet
      set({ rosState: "not_supported", polling: false });
    }
  },

  pollNodes: async () => {
    const { client, rosState } = get();
    if (!client || rosState !== "running") return;

    try {
      const nodes = await client.getNodes();
      set({ nodes, nodesCount: nodes.length });
    } catch {
      // Non-fatal
    }
  },

  pollTopics: async () => {
    const { client, rosState } = get();
    if (!client || rosState !== "running") return;

    try {
      const topics = await client.getTopics();
      set({ topics, topicsCount: topics.length });
    } catch {
      // Non-fatal
    }
  },

  pollWorkspace: async () => {
    const { client, rosState } = get();
    if (!client || rosState !== "running") return;

    try {
      const workspace = await client.getWorkspace();
      set({ workspace });
    } catch {
      // Non-fatal, Phase 4 endpoints may not be live yet
    }
  },

  pollRecordings: async () => {
    const { client, rosState } = get();
    if (!client || rosState !== "running") return;

    try {
      const recordings = await client.getRecordings();
      set({ recordings });
    } catch {
      // Non-fatal
    }
  },

  initialize: async (profile, middleware) => {
    const { client } = get();
    if (!client) return;

    set({ initInProgress: true, initProgress: [], error: null });

    try {
      await client.initializeStream(
        { profile, middleware, delivery_mode: "online" },
        (event) => {
          const { initProgress } = get();
          const step = (event.data.step as string) || "";
          const message = (event.data.message as string) || "";

          if (event.type === "step" || event.type === "progress") {
            set({
              initProgress: [...initProgress, { step, message }],
            });
          } else if (event.type === "done") {
            set({
              rosState: "running",
              initInProgress: false,
              initProgress: [...initProgress, { step: "done", message }],
            });
          } else if (event.type === "error") {
            set({
              rosState: "error",
              error: message,
              initInProgress: false,
              initProgress: [...initProgress, { step: "error", message }],
            });
          }
        },
      );
    } catch (err) {
      set({
        rosState: "error",
        error: err instanceof Error ? err.message : "Unknown error",
        initInProgress: false,
      });
    }
  },

  stop: async () => {
    const { client } = get();
    if (!client) return;

    try {
      await client.stop();
      set({ rosState: "stopped", nodes: [], topics: [], nodesCount: 0, topicsCount: 0 });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to stop" });
    }
  },

  setActiveSubView: (view) => {
    set({ activeSubView: view });
  },

  clear: () => {
    set(INITIAL_STATE);
  },
}));
