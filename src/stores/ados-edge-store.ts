/**
 * @module stores/ados-edge-store
 * @description Connection state + firmware identity + Edge Link session
 * for the ADOS Edge RC transmitter. Exposes both the legacy `CdcClient`
 * (via `client`) and the higher-level `EdgeLinkClient` (via `link`) so
 * the GCS can migrate to the typed capability-gated API at its own pace.
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import { AdosEdgeTransport } from "@/lib/ados-edge/transport";
import { CdcClient, type VersionInfo } from "@/lib/ados-edge/cdc-client";
import { MockCdcClient } from "@/lib/ados-edge/mock-client";
import { EdgeLinkClient } from "@/lib/ados-edge/edge-link";
import { EdgeLinkSession, type SessionState } from "@/lib/ados-edge/session";
import { isDemoMode } from "@/lib/utils";

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface AdosEdgeState {
  state: ConnectionState;
  transport: AdosEdgeTransport | null;
  client: CdcClient | null;
  link: EdgeLinkClient | null;
  session: SessionState;
  firmware: VersionInfo | null;
  error: string | null;
}

interface AdosEdgeActions {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

type Store = AdosEdgeState & AdosEdgeActions;

let activeSession: EdgeLinkSession | null = null;

/* Timestamp of the most recent disconnect, used to insert a short
 * grace period before re-opening the same port. macOS IOKit can take
 * a beat to fully release a CDC file descriptor after the previous
 * close; a tight reconnect races the release and Chrome surfaces a
 * NetworkError. */
let lastDisconnectAt = 0;
const RECONNECT_GRACE_MS = 500;

/* Window for labelling a close as "unexpected mid-session" vs a
 * normal user-driven disconnect. If the transport fires close within
 * this many ms of a successful connect, the store shows a tailored
 * explanation instead of silently returning to disconnected. */
let lastConnectAt = 0;
const UNEXPECTED_CLOSE_WINDOW_MS = 10_000;

export const useAdosEdgeStore = create<Store>((set, get) => ({
  state: "disconnected",
  transport: null,
  client: null,
  link: null,
  session: { status: "idle" },
  firmware: null,
  error: null,

  async connect() {
    if (get().state === "connecting" || get().state === "connected") return;
    set({ state: "connecting", error: null });

    /* If we disconnected very recently, sleep briefly before touching
     * the port. macOS takes ~300-500 ms to release a CDC file
     * descriptor and an immediate re-open will hit a NetworkError. */
    const sinceDisconnect = Date.now() - lastDisconnectAt;
    if (lastDisconnectAt > 0 && sinceDisconnect < RECONNECT_GRACE_MS) {
      const wait = RECONNECT_GRACE_MS - sinceDisconnect;
      await new Promise((r) => setTimeout(r, wait));
    }

    /* Demo-mode fast path: skip WebSerial entirely and construct a
     * synthetic client that answers every CDC command from a fixture. */
    if (isDemoMode()) {
      const mock = new MockCdcClient();
      const link = new EdgeLinkClient(mock);
      const firmware = await mock.version();
      const session = new EdgeLinkSession(link, {
        onStateChange: (next) => set({ session: next }),
      });
      activeSession = session;
      await session.open();
      set({
        state: "connected",
        transport: null,
        client: mock,
        link,
        firmware,
      });
      return;
    }

    const transport = new AdosEdgeTransport();
    const client = new CdcClient(transport);
    const link = new EdgeLinkClient(client);
    try {
      await transport.connect();
      const firmware = await client.version();
      transport.on({
        close: () => {
          activeSession?.close("transport closed");
          activeSession = null;
          lastDisconnectAt = Date.now();
          /* A close inside the first few seconds of a session is almost
           * always a transient macOS CDC release, not an intentional
           * disconnect. Surface a tailored explanation so the operator
           * knows reconnect will likely work. */
          const withinWindow =
            lastConnectAt > 0 &&
            Date.now() - lastConnectAt < UNEXPECTED_CLOSE_WINDOW_MS;
          set({
            state: "disconnected",
            transport: null,
            client: null,
            link: null,
            session: { status: "closed" },
            firmware: null,
            error: withinWindow
              ? "Connection dropped unexpectedly. This is usually a transient macOS CDC release. Wait a moment, then click Connect again."
              : null,
          });
        },
        error: (err) => {
          set({ state: "error", error: err.message });
        },
      });
      const session = new EdgeLinkSession(link, {
        onStateChange: (next) => set({ session: next }),
      });
      activeSession = session;
      await session.open();
      lastConnectAt = Date.now();
      set({ state: "connected", transport, client, link, firmware });
    } catch (err) {
      await transport.disconnect().catch(() => {});
      lastDisconnectAt = Date.now();
      set({
        state: "error",
        error: err instanceof Error ? err.message : String(err),
        transport: null,
        client: null,
        link: null,
        session: { status: "idle" },
        firmware: null,
      });
    }
  },

  async disconnect() {
    activeSession?.close("user disconnect");
    activeSession = null;
    const { transport, client } = get();
    if (client && client instanceof MockCdcClient) {
      client.shutdown();
    }
    if (transport) {
      await transport.disconnect().catch(() => {});
    }
    lastDisconnectAt = Date.now();
    set({
      state: "disconnected",
      transport: null,
      client: null,
      link: null,
      session: { status: "idle" },
      firmware: null,
    });
  },

  clearError() {
    set({ error: null });
  },
}));
