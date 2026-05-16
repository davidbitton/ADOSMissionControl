// WebSocket subscription helper with exponential-backoff reconnect, used by event streams.
//
// Browsers cannot set ``X-ADOS-Key`` on a WebSocket handshake, so the
// pairing key cannot ride a request header here. Instead we exchange
// the pairing key (via the normal ``X-ADOS-Key`` REST middleware) for
// a one-shot ticket at ``POST /api/_ws/ticket`` and hand the ticket to
// ``new WebSocket(url, ["ados-ws-ticket", ticket])`` so it rides the
// subprotocol header instead of the URL. URLs end up in DevTools, HAR
// exports, and reverse-proxy access logs; the ticket does not.

import type { RequestContext } from "./request";

/** Subprotocol marker the agent expects as the first entry when a
 *  browser presents a one-shot ticket. The agent echoes this exact
 *  value back in ``websocket.accept(subprotocol=...)`` per RFC 6455. */
const WS_TICKET_PROTOCOL = "ados-ws-ticket";

/** Scope strings the agent accepts at the ticket-mint endpoint. Keep
 *  in sync with ``ALLOWED_SCOPES`` in
 *  ``ADOSDroneAgent/src/ados/api/routes/ws_tickets.py``. */
export type WsAuthScope =
  | "setup.cloudflare_logs"
  | "gs.pic_events"
  | "gs.mavlink_ws"
  | "gs.uplink_events"
  | "gs.mesh_events";

export interface SubscribeOptions<E> {
  ctx: RequestContext;
  path: string;
  /** Scope tag the ticket-mint endpoint should stamp the ticket with.
   *  The agent's WS handler validates the same scope on consume. */
  scope: WsAuthScope;
  onEvent: (event: E) => void;
  onState?: (state: "connected" | "reconnecting" | "closed") => void;
}

interface TicketMintResponse {
  ok: boolean;
  ticket: string;
  scope: string;
  expires_at: number;
}

async function mintWsTicket(
  ctx: RequestContext,
  scope: WsAuthScope,
  signal: AbortSignal,
): Promise<string | null> {
  if (!ctx.apiKey) {
    // Unpaired agent: the WS auth helper takes an open posture, so a
    // ticket is not required. The handshake will succeed without one.
    return null;
  }
  const url = `${ctx.baseUrl.replace(/\/$/, "")}/api/_ws/ticket`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ADOS-Key": ctx.apiKey,
    },
    body: JSON.stringify({ scope }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`ticket mint failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as TicketMintResponse;
  if (!body.ticket) {
    throw new Error("ticket mint response missing ticket");
  }
  return body.ticket;
}

export function subscribeWebSocket<E>(opts: SubscribeOptions<E>): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const { ctx, path, scope, onEvent, onState } = opts;
  const httpBase = ctx.baseUrl;
  const wsBase = httpBase.replace(/^http/, "ws");
  // No ``?api_key=`` query param. The pairing key never reaches the URL.
  const url = wsBase + path;

  let closed = false;
  let ws: WebSocket | null = null;
  let retryDelay = 500;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let hasConnectedOnce = false;
  let lastReportedState: "connected" | "reconnecting" | "closed" | null = null;
  let mintAbort: AbortController | null = null;

  const reportState = (s: "connected" | "reconnecting" | "closed") => {
    if (lastReportedState === s) return;
    lastReportedState = s;
    try {
      onState?.(s);
    } catch {
      // never propagate a consumer error back into the socket loop
    }
  };

  const connect = async () => {
    if (closed) return;
    let ticket: string | null;
    try {
      mintAbort = new AbortController();
      ticket = await mintWsTicket(ctx, scope, mintAbort.signal);
    } catch (err) {
      void err;
      if (closed) return;
      reportState("reconnecting");
      scheduleReconnect();
      return;
    }
    if (closed) return;
    try {
      ws = ticket
        ? new WebSocket(url, [WS_TICKET_PROTOCOL, ticket])
        : new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      retryDelay = 500;
      hasConnectedOnce = true;
      reportState("connected");
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as E;
        onEvent(data);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => {
      // onclose handles reconnection
    };
    ws.onclose = () => {
      ws = null;
      if (!closed) {
        reportState("reconnecting");
      }
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (closed) return;
      retryDelay = Math.min(retryDelay * 2, 10000);
      void connect();
    }, retryDelay);
  };

  void connect();

  return () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (mintAbort) {
      try {
        mintAbort.abort();
      } catch {
        // ignore
      }
      mintAbort = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
    reportState("closed");
    void hasConnectedOnce;
  };
}
