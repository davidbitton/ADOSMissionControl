/**
 * @module LanPairProbeRoute
 * @description Server-side proxy for the LAN agent's
 * `/api/pairing/info` endpoint. Lets the browser probe a LAN agent
 * from an HTTPS Mission Control deployment without tripping the
 * browser's mixed-content guard — the cross-protocol step happens
 * server-side from Mission Control's Next.js layer instead of the
 * browser.
 *
 * Only forwards requests to private / mDNS / loopback hosts (SSRF
 * whitelist via `normaliseAndCheckHost`). Body and status are
 * forwarded verbatim so the downstream pair client can treat this
 * route as a drop-in replacement for the direct fetch.
 *
 * @license GPL-3.0-only
 */

import { NextRequest, NextResponse } from "next/server";
import { normaliseAndCheckHost } from "@/lib/agent/host-validation";

export const runtime = "nodejs";

const UPSTREAM_TIMEOUT_MS = 8000;

export async function POST(req: NextRequest) {
  let payload: { host?: string };
  try {
    payload = (await req.json()) as { host?: string };
  } catch {
    return NextResponse.json(
      { error: "bad_json", message: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const target = normaliseAndCheckHost(payload?.host ?? "");
  if ("error" in target) {
    return NextResponse.json(
      { error: target.error, message: target.message },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${target.url}/api/pairing/info`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "upstream_unreachable",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
