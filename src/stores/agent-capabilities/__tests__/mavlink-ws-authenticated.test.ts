/**
 * @license GPL-3.0-only
 *
 * Tests that the capability store populates `mavlinkWsAuthenticated` (a
 * single resolved absolute URL or null) so the MAVLink bridge can prefer
 * the ticket-gated endpoint. Covers:
 *   - the cloud path: the resolved URL is carried on the top-level
 *     `mavlinkWsAuthenticated` payload field and the nested
 *     `manualConnectionUrls.mavlinkWsAuthenticated` sibling round-trips;
 *   - the local path: the URL resolves from the agent's `/api/status`
 *     `authenticated_websocket_url` / `authenticated_websocket_path`;
 *   - a legacy payload that omits the field leaves the store null.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { useAgentCapabilitiesStore } from "@/stores/agent-capabilities-store";
import {
  deriveMavlinkWsAuthenticated,
  deriveManualConnectionUrls,
} from "../derivers";
import { resolveMavlinkUrl } from "@/components/command/bridges/status-mapper/urls";

beforeEach(() => {
  useAgentCapabilitiesStore.getState().clear();
});

describe("deriveMavlinkWsAuthenticated", () => {
  it("returns the resolved absolute URL string when present", () => {
    expect(
      deriveMavlinkWsAuthenticated({
        mavlinkWsAuthenticated: "ws://10.0.0.5:8080/v1/ground-station/ws/mavlink",
      }),
    ).toBe("ws://10.0.0.5:8080/v1/ground-station/ws/mavlink");
  });

  it("returns undefined (keep prior) when the field is absent", () => {
    expect(deriveMavlinkWsAuthenticated({ tier: 4 })).toBeUndefined();
  });

  it("returns null (explicit clear) when the field is null", () => {
    expect(
      deriveMavlinkWsAuthenticated({ mavlinkWsAuthenticated: null }),
    ).toBeNull();
  });

  it("returns undefined for a non-string, non-null value", () => {
    expect(
      deriveMavlinkWsAuthenticated({ mavlinkWsAuthenticated: 42 }),
    ).toBeUndefined();
    expect(
      deriveMavlinkWsAuthenticated({ mavlinkWsAuthenticated: "" }),
    ).toBeUndefined();
  });
});

describe("agent-capabilities store — mavlinkWsAuthenticated", () => {
  it("defaults to null on a freshly cleared store", () => {
    expect(
      useAgentCapabilitiesStore.getState().mavlinkWsAuthenticated,
    ).toBeNull();
  });

  it("populates from the resolved top-level payload field (cloud path)", () => {
    useAgentCapabilitiesStore.getState().setCapabilities({
      tier: 4,
      mavlinkWsAuthenticated:
        "ws://10.0.0.5:8080/v1/ground-station/ws/mavlink",
    });
    expect(useAgentCapabilitiesStore.getState().mavlinkWsAuthenticated).toBe(
      "ws://10.0.0.5:8080/v1/ground-station/ws/mavlink",
    );
  });

  it("leaves the field null for a legacy payload that omits it", () => {
    useAgentCapabilitiesStore.getState().setCapabilities({ tier: 4 });
    expect(
      useAgentCapabilitiesStore.getState().mavlinkWsAuthenticated,
    ).toBeNull();
  });

  it("keeps the prior value when a sparse payload omits the field", () => {
    useAgentCapabilitiesStore.getState().setCapabilities({
      tier: 4,
      mavlinkWsAuthenticated: "ws://10.0.0.5:8080/v1/ws/mavlink",
    });
    // A later capabilities-only tick without the field keeps the prior URL.
    useAgentCapabilitiesStore.getState().setCapabilities({ tier: 4 });
    expect(useAgentCapabilitiesStore.getState().mavlinkWsAuthenticated).toBe(
      "ws://10.0.0.5:8080/v1/ws/mavlink",
    );
  });

  it("clears the field when the payload sets it to null", () => {
    useAgentCapabilitiesStore.getState().setCapabilities({
      tier: 4,
      mavlinkWsAuthenticated: "ws://10.0.0.5:8080/v1/ws/mavlink",
    });
    useAgentCapabilitiesStore
      .getState()
      .setCapabilities({ tier: 4, mavlinkWsAuthenticated: null });
    expect(
      useAgentCapabilitiesStore.getState().mavlinkWsAuthenticated,
    ).toBeNull();
  });
});

describe("manualConnectionUrls.mavlinkWsAuthenticated (cloud sibling)", () => {
  it("round-trips the nested authenticated URL through the deriver", () => {
    const block = deriveManualConnectionUrls({
      manualConnectionUrls: {
        mavlinkTcp: "tcp://10.0.0.5:5760",
        mavlinkWs: "ws://10.0.0.5:8765/",
        mavlinkWsAuthenticated: "ws://10.0.0.5:8080/v1/ws/mavlink",
        videoViewer: null,
        videoWhep: "http://10.0.0.5:8889/main/whep",
      },
    });
    expect(block?.mavlinkWsAuthenticated).toBe(
      "ws://10.0.0.5:8080/v1/ws/mavlink",
    );
  });

  it("resolves the nested sibling into an absolute dialable URL", () => {
    // The heartbeat carries the gated endpoint inside the manual block,
    // mirroring the legacy mavlinkWs. The resolver prefers the top-level
    // value, then the nested sibling, and builds the absolute URL.
    const { authenticatedUrl } = resolveMavlinkUrl(
      {
        manualConnectionUrls: {
          mavlinkWs: "ws://drone.local:8765/",
          mavlinkWsAuthenticated: "/v1/ground-station/ws/mavlink",
        },
        lastIp: "10.0.0.5",
      },
      "drone.local",
    );
    expect(authenticatedUrl).toBe(
      "ws://10.0.0.5:8080/v1/ground-station/ws/mavlink",
    );
  });

  it("a top-level value wins over the nested sibling", () => {
    const { authenticatedUrl } = resolveMavlinkUrl(
      {
        mavlinkWsAuthenticated: "wss://gw.example/top",
        manualConnectionUrls: {
          mavlinkWsAuthenticated: "/nested",
        },
        lastIp: "10.0.0.5",
      },
      "drone.local",
    );
    expect(authenticatedUrl).toBe("wss://gw.example/top");
  });
});

describe("local path — authenticated_websocket_url / _path resolution", () => {
  // Mirrors how client-manager.ts resolves the agent's /api/status mavlink
  // block against the proven-reachable agent host before merging the store.
  it("resolves an absolute authenticated_websocket_url verbatim", () => {
    const { authenticatedUrl } = resolveMavlinkUrl(
      {
        mavlinkWsAuthenticated: "ws://drone.local:8080/v1/ws/mavlink",
        lastIp: "10.0.0.5",
      },
      "drone.local",
    );
    expect(authenticatedUrl).toBe("ws://10.0.0.5:8080/v1/ws/mavlink");
  });

  it("resolves an authenticated_websocket_path against the agent host", () => {
    const { authenticatedUrl } = resolveMavlinkUrl(
      {
        mavlinkWsAuthenticated: "/api/v1/ground-station/ws/mavlink",
        lastIp: "10.0.0.5",
      },
      "10.0.0.5",
    );
    expect(authenticatedUrl).toBe(
      "ws://10.0.0.5:8080/api/v1/ground-station/ws/mavlink",
    );
  });
});
