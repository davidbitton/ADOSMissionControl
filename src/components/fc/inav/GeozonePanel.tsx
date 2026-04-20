/**
 * @module GeozonePanel
 * @description iNav geozone editor.
 * Reads up to 15 geozones (with polygon or circular shapes and vertices) from
 * the FC, allows in-place editing, and writes all data back via the protocol.
 * @license GPL-3.0-only
 */

"use client";

import { useCallback } from "react";
import { useDroneManager } from "@/stores/drone-manager";
import { useGeozoneStore, GEOZONE_MAX, GEOZONE_SHAPE, GEOZONE_TYPE } from "@/stores/geozone-store";
import { PanelHeader } from "../shared/PanelHeader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { MapPin, Plus, Trash2, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────

const ZONE_TYPE_OPTIONS = [
  { value: String(GEOZONE_TYPE.EXCLUSIVE), label: "Exclusive (no-fly)" },
  { value: String(GEOZONE_TYPE.INCLUSIVE), label: "Inclusive (must stay inside)" },
];

const ZONE_SHAPE_OPTIONS = [
  { value: String(GEOZONE_SHAPE.POLYGON), label: "Polygon" },
  { value: String(GEOZONE_SHAPE.CIRCULAR), label: "Circular" },
];

const FENCE_ACTION_OPTIONS = [
  { value: "0", label: "0 : None" },
  { value: "1", label: "1 : Avoid" },
  { value: "2", label: "2 : RTH on breach" },
  { value: "3", label: "3 : Poshold indefinite" },
  { value: "4", label: "4 : Poshold timed" },
];

// ── Component ─────────────────────────────────────────────────

export function GeozonePanel() {
  const getSelectedProtocol = useDroneManager((s) => s.getSelectedProtocol);
  const { toast } = useToast();

  const zones = useGeozoneStore((s) => s.zones);
  const vertices = useGeozoneStore((s) => s.vertices);
  const loading = useGeozoneStore((s) => s.loading);
  const error = useGeozoneStore((s) => s.error);
  const dirty = useGeozoneStore((s) => s.dirty);
  const activeId = useGeozoneStore((s) => s.activeId);
  const addZone = useGeozoneStore((s) => s.addZone);
  const removeZone = useGeozoneStore((s) => s.removeZone);
  const updateZone = useGeozoneStore((s) => s.updateZone);
  const setActiveId = useGeozoneStore((s) => s.setActiveId);
  const addVertex = useGeozoneStore((s) => s.addVertex);
  const removeVertex = useGeozoneStore((s) => s.removeVertex);
  const updateVertex = useGeozoneStore((s) => s.updateVertex);
  const loadFromFc = useGeozoneStore((s) => s.loadFromFc);
  const uploadToFc = useGeozoneStore((s) => s.uploadToFc);

  const hasLoaded = zones.length > 0;
  const connected = !!getSelectedProtocol();

  const handleRead = useCallback(async () => {
    const protocol = getSelectedProtocol();
    if (!protocol) {
      toast("Not connected to flight controller", "error");
      return;
    }
    await loadFromFc(protocol);
    const err = useGeozoneStore.getState().error;
    if (err) {
      toast(err, "error");
    } else {
      toast("Geozones loaded from FC", "success");
    }
  }, [getSelectedProtocol, loadFromFc, toast]);

  const handleWrite = useCallback(async () => {
    const protocol = getSelectedProtocol();
    if (!protocol) {
      toast("Not connected to flight controller", "error");
      return;
    }
    await uploadToFc(protocol);
    const err = useGeozoneStore.getState().error;
    if (err) {
      toast(err, "error");
    } else {
      toast("Geozones written to FC", "success");
    }
  }, [getSelectedProtocol, uploadToFc, toast]);

  const formatCoord = (val: number) => val.toFixed(7);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-4">
        <PanelHeader
          title="Geozones"
          subtitle="iNav polygon and circular no-fly or stay-inside zones"
          icon={<MapPin size={16} />}
          loading={loading}
          loadProgress={null}
          hasLoaded={hasLoaded}
          onRead={handleRead}
          connected={connected}
          error={error}
        >
          <div className="flex items-center gap-2">
            {zones.length < GEOZONE_MAX && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Plus size={12} />}
                disabled={!connected}
                onClick={() => addZone()}
              >
                Add zone
              </Button>
            )}
            {hasLoaded && (
              <Button
                variant="primary"
                size="sm"
                icon={<Upload size={12} />}
                loading={loading}
                disabled={!connected || loading}
                onClick={handleWrite}
              >
                Write to FC
              </Button>
            )}
          </div>
        </PanelHeader>

        {dirty && (
          <p className="text-[10px] font-mono text-status-warning">
            Unsaved changes : use Write to FC to persist.
          </p>
        )}

        {zones.length === 0 && hasLoaded === false && (
          <p className="text-xs text-text-tertiary">
            Read from FC to load existing zones, or add a new zone above.
          </p>
        )}

        {zones.map((zone) => {
          const isActive = activeId === zone.number;
          const zoneVerts = vertices.get(zone.number) ?? [];
          const isPolygon = zone.shape === GEOZONE_SHAPE.POLYGON;

          return (
            <div
              key={zone.number}
              className={cn(
                "border border-border-default rounded",
                isActive && "border-accent-primary",
              )}
            >
              {/* Zone header row */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                onClick={() => setActiveId(isActive ? null : zone.number)}
              >
                {isActive ? (
                  <ChevronDown size={12} className="text-text-tertiary shrink-0" />
                ) : (
                  <ChevronRight size={12} className="text-text-tertiary shrink-0" />
                )}
                <span className="text-[10px] font-mono text-text-tertiary w-4">{zone.number}</span>
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded",
                    zone.type === GEOZONE_TYPE.EXCLUSIVE
                      ? "bg-red-500/15 text-red-400"
                      : "bg-green-500/15 text-green-400",
                  )}
                >
                  {zone.type === GEOZONE_TYPE.EXCLUSIVE ? "EXCL" : "INCL"}
                </span>
                <span className="text-[10px] font-mono text-text-secondary">
                  {isPolygon ? `Polygon ${zoneVerts.length}pts` : "Circle"}
                </span>
                <span className="text-[10px] font-mono text-text-tertiary ml-auto">
                  {zone.minAlt / 100}m – {zone.maxAlt / 100}m
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeZone(zone.number);
                  }}
                  className="p-1 text-text-tertiary hover:text-status-error transition-colors"
                  aria-label="Remove zone"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Expanded editor */}
              {isActive && (
                <div
                  className="px-3 pb-4 pt-2 border-t border-border-default space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Zone type and shape */}
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      label="Type"
                      options={ZONE_TYPE_OPTIONS}
                      value={String(zone.type)}
                      onChange={(v) => updateZone(zone.number, { type: Number(v) as 0 | 1 })}
                    />
                    <Select
                      label="Shape"
                      options={ZONE_SHAPE_OPTIONS}
                      value={String(zone.shape)}
                      onChange={(v) => updateZone(zone.number, { shape: Number(v) as 0 | 1 })}
                    />
                  </div>

                  {/* Altitude range (stored in cm, displayed in m) */}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-text-tertiary font-mono">Min altitude (m)</span>
                      <input
                        type="number"
                        step="1"
                        value={zone.minAlt / 100}
                        onChange={(e) =>
                          updateZone(zone.number, {
                            minAlt: Math.round((parseFloat(e.target.value) || 0) * 100),
                          })
                        }
                        className="bg-bg-tertiary border border-border-default rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-primary"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-text-tertiary font-mono">Max altitude (m)</span>
                      <input
                        type="number"
                        step="1"
                        value={zone.maxAlt / 100}
                        onChange={(e) =>
                          updateZone(zone.number, {
                            maxAlt: Math.round((parseFloat(e.target.value) || 0) * 100),
                          })
                        }
                        className="bg-bg-tertiary border border-border-default rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-primary"
                      />
                    </label>
                  </div>

                  {/* Fence action */}
                  <Select
                    label="Fence action"
                    options={FENCE_ACTION_OPTIONS}
                    value={String(zone.fenceAction)}
                    onChange={(v) => updateZone(zone.number, { fenceAction: Number(v) })}
                  />

                  {/* Sea-level reference toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        updateZone(zone.number, { isSeaLevelRef: !zone.isSeaLevelRef })
                      }
                      className={cn(
                        "w-8 h-4 rounded-full relative transition-colors shrink-0",
                        zone.isSeaLevelRef
                          ? "bg-accent-primary"
                          : "bg-bg-tertiary border border-border-default",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                          zone.isSeaLevelRef ? "translate-x-4" : "translate-x-0.5",
                        )}
                      />
                    </button>
                    <span className="text-[10px] text-text-secondary font-mono">
                      Altitudes relative to sea level
                    </span>
                  </div>

                  {/* Polygon vertices */}
                  {isPolygon && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">
                          Vertices ({zoneVerts.length})
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Plus size={10} />}
                          onClick={() => addVertex(zone.number, { lat: 0, lon: 0 })}
                        >
                          Add vertex
                        </Button>
                      </div>
                      {zoneVerts.map((vert) => (
                        <div key={vert.vertexIdx} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-text-tertiary w-4 shrink-0">
                            {vert.vertexIdx}
                          </span>
                          <input
                            type="number"
                            step="0.0000001"
                            value={formatCoord(vert.lat)}
                            onChange={(e) =>
                              updateVertex(
                                zone.number,
                                vert.vertexIdx,
                                parseFloat(e.target.value) || 0,
                                vert.lon,
                              )
                            }
                            placeholder="Lat"
                            className="flex-1 bg-bg-tertiary border border-border-default rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-primary"
                          />
                          <input
                            type="number"
                            step="0.0000001"
                            value={formatCoord(vert.lon)}
                            onChange={(e) =>
                              updateVertex(
                                zone.number,
                                vert.vertexIdx,
                                vert.lat,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            placeholder="Lon"
                            className="flex-1 bg-bg-tertiary border border-border-default rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-primary"
                          />
                          <button
                            onClick={() => removeVertex(zone.number, vert.vertexIdx)}
                            className="p-1 text-text-tertiary hover:text-status-error transition-colors shrink-0"
                            aria-label="Remove vertex"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Circular radius note */}
                  {!isPolygon && (
                    <p className="text-[10px] text-text-tertiary font-mono">
                      Circular zones use param1 on the waypoint as radius. Set via the mission planner.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
