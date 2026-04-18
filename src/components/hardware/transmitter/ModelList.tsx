"use client";

/**
 * @module ModelList
 * @description Table of 16 model slots. Active slot marked with a
 * trailing star. Clicking a populated row drills into the editor.
 * @license GPL-3.0-only
 */

import { useEffect } from "react";
import Link from "next/link";
import { useAdosEdgeStore } from "@/stores/ados-edge-store";
import { useAdosEdgeModelStore } from "@/stores/ados-edge-model-store";
import { Button } from "@/components/ui/button";

export function ModelList() {
  const connected = useAdosEdgeStore((s) => s.state === "connected");
  const models = useAdosEdgeModelStore((s) => s.models);
  const activeSlot = useAdosEdgeModelStore((s) => s.activeSlot);
  const loading = useAdosEdgeModelStore((s) => s.loading);
  const error = useAdosEdgeModelStore((s) => s.error);
  const loadList = useAdosEdgeModelStore((s) => s.loadList);
  const setActive = useAdosEdgeModelStore((s) => s.setActive);

  useEffect(() => {
    if (connected) void loadList();
  }, [connected, loadList]);

  if (!connected) {
    return (
      <div className="p-6 text-sm text-text-secondary">
        Connect the transmitter first.
      </div>
    );
  }

  const modelsByIndex = new Map(models.map((m) => [m.i, m]));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Models</h2>
        <Button variant="secondary" onClick={() => void loadList()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {error && <p className="text-sm text-status-error">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-surface-secondary">
        <table className="w-full text-sm">
          <thead className="bg-surface-primary text-xs uppercase text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Slot</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Active</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 16 }).map((_, i) => {
              const model = modelsByIndex.get(i);
              const isActive = activeSlot === i;
              return (
                <tr
                  key={i}
                  className="border-t border-border hover:bg-surface-hover"
                >
                  <td className="px-3 py-2 text-text-muted tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 text-text-primary">
                    {model ? model.n : <span className="text-text-muted">(empty)</span>}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {isActive ? "*" : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {model ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void setActive(i)}
                          disabled={isActive}
                        >
                          {isActive ? "Active" : "Activate"}
                        </Button>
                        <Link
                          href={`/hardware/edge/models/${i}`}
                          className="inline-flex h-8 items-center rounded border border-border px-3 text-xs text-text-primary hover:bg-surface-hover"
                        >
                          Open
                        </Link>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
