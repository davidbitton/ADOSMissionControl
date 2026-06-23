/**
 * @module recent-connections
 * @description IndexedDB utilities for recent connection history (idb-keyval).
 * @license GPL-3.0-only
 */

import { get, set, del } from "idb-keyval";

export interface RecentConnection {
  type: "serial" | "websocket";
  baudRate?: number;
  url?: string;
  /** USB identity when type is serial — used to pick the right interface on multi-port FCs. */
  portVendorId?: number;
  portProductId?: number;
  name: string;
  date: number;
}

const RECENT_KEY = "command:recent-connections";

/** One-time localStorage → IndexedDB migration */
async function migrateRecentConnections(): Promise<void> {
  if (typeof window === "undefined") return;
  const migrated = await get("command:recent-migrated");
  if (migrated) return;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) {
      await set(RECENT_KEY, JSON.parse(raw));
      localStorage.removeItem(RECENT_KEY);
    }
    await set("command:recent-migrated", true);
  } catch {
    // silent
  }
}

if (typeof window !== "undefined") {
  migrateRecentConnections();
}

export async function saveRecentConnection(conn: RecentConnection) {
  try {
    const existing: RecentConnection[] = (await get(RECENT_KEY)) ?? [];
    existing.unshift(conn);
    await set(RECENT_KEY, existing.slice(0, 10));
  } catch {
    /* ignore */
  }
}

export async function getRecentConnections(): Promise<RecentConnection[]> {
  try {
    return (await get<RecentConnection[]>(RECENT_KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function clearRecentConnections(): Promise<void> {
  await del(RECENT_KEY);
}
