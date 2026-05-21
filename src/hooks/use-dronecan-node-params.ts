"use client";

/**
 * @module use-dronecan-node-params
 * @description Per-node parameter editor hook for DroneCAN.
 *
 * Walks the remote node's parameter index via `paramGet(nodeId, i)` starting
 * at i = 0, advancing until the response carries an empty name (the DroneCAN
 * convention for "no parameter at this index"). Each entry holds the current
 * value, optional default / min / max, and a per-row dirty flag.
 *
 * `setLocal` mutates the local cache only; `saveAllDirty` flushes every
 * dirty row through `paramSet`. `eraseToDefaults` issues
 * `paramExecuteOpcode(ERASE)` and `restartNode` issues a `RestartNode`
 * service request. Callers are expected to follow either with a `refresh()`
 * once the node is back online.
 *
 * The `DroneCanClient` interface is defined inline with the minimum surface
 * the hook needs; once the canonical client lands the type alias swaps for
 * the real import.
 *
 * @license GPL-3.0-only
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Tagged value shape matching `uavcan.protocol.param.Value`. */
export type ParamValue =
  | { tag: "empty" }
  | { tag: "integer"; value: bigint }
  | { tag: "real"; value: number }
  | { tag: "boolean"; value: boolean }
  | { tag: "string"; value: string };

export interface ParamEntry {
  name: string;
  value: ParamValue;
  defaultValue?: ParamValue;
  min?: ParamValue;
  max?: ParamValue;
  dirty: boolean;
}

/** Subset of the DroneCAN client surface this hook depends on. */
export interface DroneCanClient {
  paramGet: (
    nodeId: number,
    index: number,
  ) => Promise<{
    name: string;
    value: ParamValue;
    defaultValue?: ParamValue;
    min?: ParamValue;
    max?: ParamValue;
  }>;
  paramSet: (
    nodeId: number,
    name: string,
    value: ParamValue,
  ) => Promise<{ ok: boolean }>;
  paramExecuteOpcode: (
    nodeId: number,
    opcode: number,
  ) => Promise<{ ok: boolean }>;
  restart: (nodeId: number) => Promise<{ ok: boolean }>;
}

export const PARAM_OPCODE_SAVE = 0;
export const PARAM_OPCODE_ERASE = 1;

const MAX_INDEX_WALK = 1024;

export interface UseDroneCanNodeParamsResult {
  params: Map<string, ParamEntry>;
  loading: boolean;
  error: string | null;
  dirty: Set<string>;
  refresh: () => Promise<void>;
  setLocal: (name: string, value: ParamValue) => void;
  saveAllDirty: () => Promise<{ saved: number; failed: number }>;
  eraseToDefaults: () => Promise<{ ok: boolean }>;
  restartNode: () => Promise<{ ok: boolean }>;
}

export function useDroneCanNodeParams(
  client: DroneCanClient | null,
  nodeId: number,
): UseDroneCanNodeParamsResult {
  const [params, setParams] = useState<Map<string, ParamEntry>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const next = new Map<string, ParamEntry>();
      for (let i = 0; i < MAX_INDEX_WALK; i++) {
        const res = await client.paramGet(nodeId, i);
        if (!res.name || res.name.length === 0) break;
        next.set(res.name, {
          name: res.name,
          value: res.value,
          defaultValue: res.defaultValue,
          min: res.min,
          max: res.max,
          dirty: false,
        });
      }
      if (mountedRef.current) {
        setParams(next);
        setDirty(new Set());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client, nodeId]);

  const setLocal = useCallback((name: string, value: ParamValue) => {
    setParams((prev) => {
      const entry = prev.get(name);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(name, { ...entry, value, dirty: true });
      return next;
    });
    setDirty((prev) => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  }, []);

  const saveAllDirty = useCallback(async () => {
    if (!client) return { saved: 0, failed: 0 };
    let saved = 0;
    let failed = 0;
    const cleared: string[] = [];
    for (const name of dirty) {
      const entry = params.get(name);
      if (!entry) continue;
      try {
        const res = await client.paramSet(nodeId, name, entry.value);
        if (res.ok) {
          cleared.push(name);
          saved++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    if (mountedRef.current && cleared.length > 0) {
      setParams((prev) => {
        const next = new Map(prev);
        for (const name of cleared) {
          const entry = next.get(name);
          if (entry) next.set(name, { ...entry, dirty: false });
        }
        return next;
      });
      setDirty((prev) => {
        const next = new Set(prev);
        for (const name of cleared) next.delete(name);
        return next;
      });
    }
    return { saved, failed };
  }, [client, nodeId, dirty, params]);

  const eraseToDefaults = useCallback(async () => {
    if (!client) return { ok: false };
    return client.paramExecuteOpcode(nodeId, PARAM_OPCODE_ERASE);
  }, [client, nodeId]);

  const restartNode = useCallback(async () => {
    if (!client) return { ok: false };
    return client.restart(nodeId);
  }, [client, nodeId]);

  return {
    params,
    loading,
    error,
    dirty,
    refresh,
    setLocal,
    saveAllDirty,
    eraseToDefaults,
    restartNode,
  };
}
