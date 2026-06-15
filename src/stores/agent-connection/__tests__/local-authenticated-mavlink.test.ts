import { describe, it, expect } from "vitest";
import { resolveLocalAuthenticatedMavlinkWsUrl } from "../authenticated-mavlink-url";

const AGENT_URL = "http://192.168.1.50:8080";
const GATED = "ws://192.168.1.50:8080/api/v1/ground-station/ws/mavlink";

describe("resolveLocalAuthenticatedMavlinkWsUrl", () => {
  it("returns an advertised absolute authenticated URL verbatim", () => {
    expect(
      resolveLocalAuthenticatedMavlinkWsUrl(
        { authenticated_websocket_url: GATED },
        "ground-station",
        AGENT_URL,
      ),
    ).toBe(GATED);
  });

  it("derives the gated URL for a ground-station node that advertises none", () => {
    // The native consolidated status does not carry the mavlink block, but a
    // ground station serves the gated endpoint at a fixed path on its :8080
    // front — so the GCS derives it from the proven-reachable host.
    expect(
      resolveLocalAuthenticatedMavlinkWsUrl(undefined, "ground-station", AGENT_URL),
    ).toBe(GATED);
  });

  it("accepts the underscore profile form", () => {
    expect(
      resolveLocalAuthenticatedMavlinkWsUrl(undefined, "ground_station", AGENT_URL),
    ).toBe(GATED);
  });

  it("returns null for a non-ground-station node with no advertised endpoint", () => {
    expect(
      resolveLocalAuthenticatedMavlinkWsUrl(undefined, "drone", AGENT_URL),
    ).toBeNull();
    expect(
      resolveLocalAuthenticatedMavlinkWsUrl(undefined, "compute", AGENT_URL),
    ).toBeNull();
  });

  it("returns null when there is no agent host to derive from", () => {
    expect(
      resolveLocalAuthenticatedMavlinkWsUrl(undefined, "ground-station", null),
    ).toBeNull();
  });
});
