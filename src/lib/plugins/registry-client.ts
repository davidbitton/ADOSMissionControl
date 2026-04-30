/**
 * @module RegistryClient
 * @description HTTP client for the hosted plugin catalog. Wraps the
 * documented REST surface (`/v1/plugins`, `/v1/plugins/:id`,
 * `/v1/plugins/:id/:version`, `/v1/revoked.json`) and returns typed
 * responses for the Browse tab.
 *
 * The base URL comes from `NEXT_PUBLIC_PLUGIN_REGISTRY_URL` and falls
 * back to the canonical hosted endpoint name. Self-hosted deployments
 * point this at their own URL.
 *
 * @license GPL-3.0-only
 */

import type { PluginHalf, PluginRiskLevel } from "@/lib/plugins/types";

export const DEFAULT_REGISTRY_URL = "https://registry.ados.altnautica.com";

export type PluginCategory =
  | "drivers"
  | "vision"
  | "behaviors"
  | "telemetry"
  | "ui"
  | "cloud"
  | "ai"
  | "tools";

export interface RegistryPluginCard {
  pluginId: string;
  name: string;
  shortDescription: string;
  iconUrl: string | null;
  author: string;
  authorVerified: boolean;
  category: PluginCategory;
  license: string;
  latestVersion: string;
  installCount: number;
  risk: PluginRiskLevel;
  signed: boolean;
  firstParty: boolean;
  openSource: boolean;
  publishedAt: number;
  updatedAt: number;
}

export interface RegistryPluginVersion {
  version: string;
  publishedAt: number;
  signedBy: string | null;
  installCount: number;
  changelog: string;
  archiveUrl: string;
  archiveSha256: string;
  agentVersionRange: string | null;
  supportedBoards: string[];
  deprecated: boolean;
  deprecationNote: string | null;
}

export interface RegistryPluginDetail extends RegistryPluginCard {
  description: string;
  readmeMarkdown: string;
  screenshots: string[];
  sourceUrl: string | null;
  homepageUrl: string | null;
  reviewedByMaintainer: boolean;
  versions: RegistryPluginVersion[];
  permissions: Array<{
    id: string;
    required: boolean;
    risk: PluginRiskLevel;
    rationale: string | null;
    degradedBehavior: string | null;
  }>;
  slots: string[];
  halves: PluginHalf[];
  ratingAverage: number | null;
  ratingCount: number;
}

export interface RegistryListQuery {
  search?: string;
  category?: PluginCategory | "all";
  license?: string;
  signedOnly?: boolean;
  verifiedOnly?: boolean;
  firstPartyOnly?: boolean;
  ossOnly?: boolean;
  board?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface RegistryListResponse {
  cards: RegistryPluginCard[];
  nextCursor: string | null;
  total: number;
}

export interface RevocationList {
  /** Revoked signing key ids. */
  keys: string[];
  /** Revoked plugin/version pairs. */
  versions: Array<{ pluginId: string; version: string; reason: string }>;
  publishedAt: number;
}

export class RegistryError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function resolveBaseUrl(): string {
  const env =
    typeof process !== "undefined"
      ? process.env?.NEXT_PUBLIC_PLUGIN_REGISTRY_URL
      : undefined;
  return (env || DEFAULT_REGISTRY_URL).replace(/\/$/, "");
}

export class RegistryClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? resolveBaseUrl()).replace(/\/$/, "");
  }

  get base(): string {
    return this.baseUrl;
  }

  async list(query: RegistryListQuery = {}): Promise<RegistryListResponse> {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.category && query.category !== "all") {
      params.set("category", query.category);
    }
    if (query.license) params.set("license", query.license);
    if (query.signedOnly !== undefined) {
      params.set("signed_only", query.signedOnly ? "1" : "0");
    }
    if (query.verifiedOnly) params.set("verified_only", "1");
    if (query.firstPartyOnly) params.set("first_party", "1");
    if (query.ossOnly) params.set("oss_only", "1");
    if (query.board) params.set("board", query.board);
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    const url = `${this.baseUrl}/v1/plugins${qs ? `?${qs}` : ""}`;
    return this.fetchJson<RegistryListResponse>(url);
  }

  async detail(pluginId: string): Promise<RegistryPluginDetail> {
    const url = `${this.baseUrl}/v1/plugins/${encodeURIComponent(pluginId)}`;
    return this.fetchJson<RegistryPluginDetail>(url);
  }

  async version(
    pluginId: string,
    version: string,
  ): Promise<RegistryPluginVersion> {
    const url = `${this.baseUrl}/v1/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(version)}`;
    return this.fetchJson<RegistryPluginVersion>(url);
  }

  async revocations(): Promise<RevocationList> {
    return this.fetchJson<RevocationList>(`${this.baseUrl}/v1/revoked.json`);
  }

  private async fetchJson<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      throw new RegistryError(
        0,
        "network_error",
        err instanceof Error ? err.message : "Network request failed",
      );
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // fall through; treat as opaque
    }
    if (!res.ok) {
      const b =
        body && typeof body === "object"
          ? (body as { code?: string; message?: string })
          : {};
      throw new RegistryError(
        res.status,
        b.code ?? "registry_error",
        b.message ?? `Registry returned HTTP ${res.status}`,
      );
    }
    return body as T;
  }
}

export function createDefaultRegistryClient(): RegistryClient {
  return new RegistryClient();
}
