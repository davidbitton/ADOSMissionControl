/**
 * ADOS Agent firmware manifest client.
 *
 * Fetches the per-board catalog of supported install methods (curl one-liner
 * for boards running stock vendor OS, browser WebUSB image flash for boards
 * that need a baked image). Mirrors the ArduPilotManifest pattern: server-side
 * proxy at /api/ados-manifest with 1-hour in-memory cache.
 *
 * @module protocol/firmware/ados-agent-manifest
 */

const PROXY_URL = "/api/ados-manifest";
const CACHE_TTL = 60 * 60 * 1000;

// ── Schema types ──────────────────────────────────────────

export type AdosAgentArch = "armv7-musl" | "aarch64-musl" | "aarch64-glibc";

export type AdosAgentStack = "ados-drone-agent" | "ados-ground-agent";

export interface AdosAgentCurlInstall {
  method: "curl";
  /** Single shell line the operator copy-pastes onto the board. */
  command: string;
  /** Optional pre-flight notes shown above the command block. */
  notes?: string[];
}

export interface AdosAgentWebFlashInstall {
  method: "web-flash";
  /** URL of the .img.gz to flash via WebUSB. */
  imageUrl: string;
  /** SHA256 of the compressed image (lowercase hex). */
  sha256: string;
  /** Base64-encoded minisign signature for the image. */
  minisignSignature: string;
  /** Compressed image size in bytes (drives the progress bar). */
  imageSizeBytes: number;
  /** Optional pre-flight notes (e.g., bootrom-mode entry instructions). */
  notes?: string[];
}

export type AdosAgentInstall = AdosAgentCurlInstall | AdosAgentWebFlashInstall;

export interface AdosAgentBoard {
  /** Stable identifier, kebab-case (e.g. "luckfox-pico-zero"). */
  id: string;
  /** Human-readable label shown in the picker. */
  label: string;
  /** SoC family, e.g. "RV1106G3", "BCM2710A1", "RK3588S2". */
  soc: string;
  /** Binary architecture + libc. */
  arch: AdosAgentArch;
  /** Which stacks this board is allowed to run. */
  stacks: AdosAgentStack[];
  /** Per-stack install configuration. */
  installs: Partial<Record<AdosAgentStack, AdosAgentInstall>>;
  /** USB IDs reported in bootrom mode (web-flash boards only). */
  bootrom?: { vendorId: number; productId: number };
  /** Optional short description (RAM, storage, target use case). */
  description?: string;
}

export interface AdosAgentManifestData {
  schemaVersion: number;
  /** Lite agent release this manifest pins. */
  agentVersion: string;
  /** ISO 8601 timestamp the manifest was generated. */
  generatedAt: string;
  boards: AdosAgentBoard[];
}

// ── Client ────────────────────────────────────────────────

export class AdosAgentManifest {
  private manifest: AdosAgentManifestData | null = null;
  private fetchedAt = 0;

  async getManifest(): Promise<AdosAgentManifestData> {
    if (this.manifest && Date.now() - this.fetchedAt < CACHE_TTL) {
      return this.manifest;
    }
    const fresh = await this.fetchManifest();
    this.manifest = fresh;
    this.fetchedAt = Date.now();
    return fresh;
  }

  /** Boards this stack can target. */
  async getBoardsForStack(stack: AdosAgentStack): Promise<AdosAgentBoard[]> {
    const manifest = await this.getManifest();
    return manifest.boards.filter((b) => b.stacks.includes(stack));
  }

  async getBoardById(id: string): Promise<AdosAgentBoard | null> {
    const manifest = await this.getManifest();
    return manifest.boards.find((b) => b.id === id) ?? null;
  }

  /** Resolve install config for a specific board+stack pair. */
  async getInstall(
    boardId: string,
    stack: AdosAgentStack,
  ): Promise<AdosAgentInstall | null> {
    const board = await this.getBoardById(boardId);
    if (!board) return null;
    return board.installs[stack] ?? null;
  }

  async getAgentVersion(): Promise<string> {
    const manifest = await this.getManifest();
    return manifest.agentVersion;
  }

  clearCache(): void {
    this.manifest = null;
    this.fetchedAt = 0;
  }

  private async fetchManifest(): Promise<AdosAgentManifestData> {
    const response = await fetch(PROXY_URL);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Manifest proxy returned ${response.status}`);
    }
    const json = await response.json();
    if (json.error) throw new Error(json.error);
    return json as AdosAgentManifestData;
  }
}
