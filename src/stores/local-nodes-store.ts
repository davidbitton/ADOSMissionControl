/**
 * @module LocalNodesStore
 * @description Browser-local registry of nodes paired over the LAN
 * without going through Convex. A node here is any agent (drone,
 * ground station, future compute) that the operator paired by
 * pasting a hostname into the Add-a-Node card.
 *
 * Independent of the Convex-backed ``pairing-store`` so the GCS
 * works fully offline. Persisted to localStorage with a version /
 * migrate handler per the project convention.
 *
 * THREAT MODEL (local-first credential storage):
 *   - Each ``LocalNode`` stores an ``apiKey`` returned by the
 *     agent's ``/api/pairing/claim``. This key is the credential
 *     for every subsequent REST call to that agent. localStorage is
 *     plaintext: any XSS that runs on the GCS origin reads every
 *     paired agent's apiKey. Browser-extension access and devtools
 *     see the same.
 *   - There is no key derivation, no encryption at rest, no
 *     hardware-backed key isolation. This is the local-first
 *     trade-off and the pragmatic posture for v1.
 *   - If the operator clears browser storage the apiKeys are lost.
 *     Recovery: unpair the agent from its own setup webapp at
 *     ``http://<host>:8080/setup.html``, then re-pair from the GCS.
 *   - See also ``browser-identity-store.ts`` for the per-browser
 *     UUID that acts as pair-owner identifier on the same threat
 *     surface.
 *
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LocalNode {
  /** Stable agent device id from the agent's pairing/info response. */
  deviceId: string;
  /** Human-readable name from the agent (operator can edit later). */
  name: string;
  /** Base URL (no trailing slash) the GCS uses to reach this agent. */
  hostname: string;
  /** API key returned by ``/api/pairing/claim`` for this browser. */
  apiKey: string;
  /** Wire-contract profile from ``/api/pairing/info``. */
  profile: "drone" | "ground-station" | "compute";
  /** Ground-station role when applicable. */
  role?: "direct" | "relay" | "receiver" | null;
  /** Board name from the agent (e.g. "Raspberry Pi 4B"). */
  board?: string;
  /** Agent version string at pair time. */
  version?: string;
  /** mDNS hostname (``ados-<id>.local``) — used as the canonical reach. */
  mdnsHost?: string;
  /** Server-resolved IPv4 captured at pair time. Used as a fallback
   * when the browser stops resolving the .local hostname (Safari,
   * Firefox without permission, Brave strict mode). Undefined for
   * pre-schema-v2 entries — the user re-pairs to populate. */
  ipv4?: string;
  /** When the operator paired this node (epoch ms). */
  pairedAt: number;
  /** Last time the GCS confirmed reachability (epoch ms). */
  lastSeenAt?: number;
}

interface LocalNodesState {
  nodes: LocalNode[];
  addNode: (node: LocalNode) => void;
  removeNode: (deviceId: string) => void;
  renameNode: (deviceId: string, name: string) => void;
  touchLastSeen: (deviceId: string) => void;
  clear: () => void;
}

export const useLocalNodesStore = create<LocalNodesState>()(
  persist(
    (set) => ({
      nodes: [],
      addNode: (node) =>
        set((state) => {
          const existing = state.nodes.findIndex(
            (n) => n.deviceId === node.deviceId,
          );
          if (existing >= 0) {
            const next = state.nodes.slice();
            next[existing] = { ...next[existing], ...node };
            return { nodes: next };
          }
          return { nodes: [...state.nodes, node] };
        }),
      removeNode: (deviceId) =>
        set((state) => ({
          nodes: state.nodes.filter((n) => n.deviceId !== deviceId),
        })),
      renameNode: (deviceId, name) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.deviceId === deviceId ? { ...n, name } : n,
          ),
        })),
      touchLastSeen: (deviceId) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.deviceId === deviceId ? { ...n, lastSeenAt: Date.now() } : n,
          ),
        })),
      clear: () => set({ nodes: [] }),
    }),
    {
      name: "altcmd:local-nodes",
      version: 2,
      // v1 → v2: added optional `ipv4` field. No backfill is possible
      // (we don't know historical IPs); pre-v2 entries simply carry
      // ipv4 = undefined and the connect() fallback skips the retry
      // for those entries. User re-pairs to populate.
      migrate: (persisted, _version) => persisted as LocalNodesState,
    },
  ),
);
