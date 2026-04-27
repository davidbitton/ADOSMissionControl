// WebSocket subscription helper with exponential-backoff reconnect, used by event streams.

import type { RequestContext } from "./request";

export interface SubscribeOptions<E> {
  ctx: RequestContext;
  path: string;
  onEvent: (event: E) => void;
  onState?: (state: "connected" | "reconnecting" | "closed") => void;
}

export function subscribeWebSocket<E>(opts: SubscribeOptions<E>): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const { ctx, path, onEvent, onState } = opts;
  const httpBase = ctx.baseUrl;
  const wsBase = httpBase.replace(/^http/, "ws");
  const urlObj = new URL(wsBase + path);
  if (ctx.apiKey) {
    urlObj.searchParams.set("api_key", ctx.apiKey);
  }
  const url = urlObj.toString();

  let closed = false;
  let ws: WebSocket | null = null;
  let retryDelay = 500;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let hasConnectedOnce = false;
  let lastReportedState: "connected" | "reconnecting" | "closed" | null = null;

  const reportState = (s: "connected" | "reconnecting" | "closed") => {
    if (lastReportedState === s) return;
    lastReportedState = s;
    try {
      onState?.(s);
    } catch {
      // never propagate a consumer error back into the socket loop
    }
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(url);
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
      connect();
    }, retryDelay);
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
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
