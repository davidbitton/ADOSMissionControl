/**
 * Server-side proxy for the ADOS Agent firmware manifest.
 *
 * Fetches the manifest published as a GitHub Release asset on the public
 * altnautica/ADOSDroneAgent repo. Falls back to an embedded baseline so the
 * Flash Tool stays usable when no release is reachable. 1-hour in-memory cache.
 *
 * @license GPL-3.0-only
 */

import { NextResponse } from "next/server";

import {
  fetchWithTimeout,
  readArrayBufferWithLimit,
} from "@/lib/net/fetch-with-timeout";
import type { AdosAgentManifestData } from "@/lib/protocol/firmware/ados-agent-manifest";

const DEFAULT_MANIFEST_URL =
  "https://github.com/altnautica/ADOSDroneAgent/releases/latest/download/ados-agent-manifest.json";
const CACHE_TTL = 60 * 60 * 1000;
const MAX_BYTES = 1 * 1024 * 1024;

interface CachedData {
  timestamp: number;
  data: AdosAgentManifestData;
}

let cache: CachedData | null = null;

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const manifestUrl = process.env.ADOS_MANIFEST_URL || DEFAULT_MANIFEST_URL;

  try {
    const res = await fetchWithTimeout(manifestUrl, {
      headers: { Accept: "application/json" },
      redirect: "follow",
    });

    if (!res.ok) {
      // 404 is expected before the first release ships. Serve embedded.
      return NextResponse.json(serveEmbedded());
    }

    const buffer = await readArrayBufferWithLimit(res, MAX_BYTES);
    const text = new TextDecoder("utf-8").decode(buffer);
    const json = JSON.parse(text) as AdosAgentManifestData;

    if (!isManifest(json)) {
      return NextResponse.json(serveEmbedded());
    }

    cache = { timestamp: Date.now(), data: json };
    return NextResponse.json(json);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(serveEmbedded());
    }
    return NextResponse.json(serveEmbedded());
  }
}

function isManifest(data: unknown): data is AdosAgentManifestData {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  return (
    typeof m.schemaVersion === "number" &&
    typeof m.agentVersion === "string" &&
    Array.isArray(m.boards)
  );
}

function serveEmbedded(): AdosAgentManifestData {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }
  cache = { timestamp: Date.now(), data: EMBEDDED_FALLBACK };
  return EMBEDDED_FALLBACK;
}

// ── Embedded fallback ────────────────────────────────────────
//
// Used when no GitHub release manifest is reachable. Curl one-liners point
// at the canonical install scripts on the agent repo's main branch. Updated
// alongside the agent's `just release` recipe.

const LITE_INSTALL_CMD =
  "curl -sSL https://raw.githubusercontent.com/altnautica/ADOSDroneAgent/main/scripts/install-lite.sh | sudo bash";
const FULL_INSTALL_CMD =
  "curl -sSL https://raw.githubusercontent.com/altnautica/ADOSDroneAgent/main/scripts/install.sh | sudo bash";
const FULL_INSTALL_GROUND_CMD =
  "curl -sSL https://raw.githubusercontent.com/altnautica/ADOSDroneAgent/main/scripts/install.sh | sudo bash -s -- --profile ground-station";

const EMBEDDED_FALLBACK: AdosAgentManifestData = {
  schemaVersion: 1,
  agentVersion: "lite-v0.1.3",
  generatedAt: "2026-05-06T00:00:00Z",
  boards: [
    {
      id: "luckfox-pico-zero",
      label: "Luckfox Pico Zero",
      soc: "RV1106G3",
      arch: "armv7-musl",
      stacks: ["ados-drone-agent"],
      description: "256 MB DDR3L, 8 GB eMMC, onboard Wi-Fi 6.",
      bootrom: { vendorId: 0x2207, productId: 0x110c },
      installs: {
        "ados-drone-agent": {
          method: "web-flash",
          imageUrl: "",
          sha256: "",
          minisignSignature: "",
          imageSizeBytes: 0,
          notes: [
            "Hold the BOOT button while plugging USB-C into your computer to enter bootrom mode.",
            "Image flash erases the eMMC. Back up any user data first.",
          ],
        },
      },
    },
    {
      id: "pi-zero-2w",
      label: "Raspberry Pi Zero 2 W",
      soc: "BCM2710A1",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent"],
      description: "512 MB LPDDR2, microSD boot, mainline Wi-Fi.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: LITE_INSTALL_CMD,
          notes: [
            "Run on a Pi already booted into Raspberry Pi OS Lite.",
            "Connect to your Wi-Fi network before running the command.",
          ],
        },
      },
    },
    {
      id: "rpi4b",
      label: "Raspberry Pi 4B",
      soc: "BCM2711",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "1-8 GB RAM, microSD boot.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: ["Run on a Pi already booted into Raspberry Pi OS."],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: [
            "Run on a Pi already booted into Raspberry Pi OS.",
            "Plug in your RTL8812EU adapter, OLED display, and buttons before running the installer if you want them auto-detected.",
          ],
        },
      },
    },
    {
      id: "rk3566",
      label: "Radxa CM3 (RK3566)",
      soc: "RK3566",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "2-8 GB RAM, eMMC + microSD options.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: ["Run on a CM3 booted into Radxa OS."],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: ["Run on a CM3 booted into Radxa OS."],
        },
      },
    },
    {
      id: "rk3588s2",
      label: "Radxa CM4 (RK3588S2)",
      soc: "RK3588S2",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "4-32 GB RAM, eMMC + microSD options.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: ["Run on a CM4 booted into Radxa OS."],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: ["Run on a CM4 booted into Radxa OS."],
        },
      },
    },
    {
      id: "rock-5c-lite",
      label: "Radxa Rock 5C Lite",
      soc: "RK3582",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "8-16 GB RAM, NPU + VPU intact for vision workloads.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: ["Run on a Rock 5C Lite booted into Radxa OS."],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: ["Run on a Rock 5C Lite booted into Radxa OS."],
        },
      },
    },
    {
      id: "cubie-a7z",
      label: "Radxa Cubie A7Z",
      soc: "Allwinner A733",
      arch: "aarch64-glibc",
      stacks: ["ados-drone-agent", "ados-ground-agent"],
      description: "Pi-Zero-sized Cortex-A55 SBC, 1 GB RAM.",
      installs: {
        "ados-drone-agent": {
          method: "curl",
          command: FULL_INSTALL_CMD,
          notes: [
            "Run on a Cubie A7Z booted into the BSP image.",
            "Mainline A733 support is incomplete; stick with the BSP kernel.",
          ],
        },
        "ados-ground-agent": {
          method: "curl",
          command: FULL_INSTALL_GROUND_CMD,
          notes: [
            "Run on a Cubie A7Z booted into the BSP image.",
            "Plug in your RTL8812EU adapter, OLED display, and buttons before running so they auto-detect.",
          ],
        },
      },
    },
  ],
};
