/**
 * @module LogicConditionsPanel
 * @description iNav Logic Conditions editor.
 * Reads up to 16 logic condition rules from the FC, allows in-place editing,
 * and writes all rules back. Displays live condition status when armed.
 * @license GPL-3.0-only
 */

"use client";

import { useCallback, useEffect } from "react";
import { useDroneManager } from "@/stores/drone-manager";
import { useProgrammingStore, LOGIC_CONDITION_MAX } from "@/stores/programming-store";
import { PanelHeader } from "../../shared/PanelHeader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useArmedLock } from "@/hooks/use-armed-lock";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { GitBranch, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Operation labels ──────────────────────────────────────────

const OPERATION_LABELS: Record<number, string> = {
  0: "TRUE",
  1: "EQUAL",
  2: "GREATER_THAN",
  3: "LOWER_THAN",
  4: "LOW",
  5: "MID",
  6: "HIGH",
  7: "AND",
  8: "OR",
  9: "XOR",
  10: "NEGATE",
  11: "FLIGHT_MODE",
  12: "FLYMODE",
  13: "LATCH",
  14: "STICKY",
};

const OPERAND_TYPE_LABELS: Record<number, string> = {
  0: "VALUE",
  1: "RC_CHANNEL",
  2: "FLIGHT",
  3: "FLIGHT_MODE",
  4: "LC",
  5: "TIMER",
  6: "GVAR",
};

const OPERATION_OPTIONS = Object.entries(OPERATION_LABELS).map(([k, v]) => ({ value: k, label: v }));
const OPERAND_TYPE_OPTIONS = Object.entries(OPERAND_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }));

// ── Component ─────────────────────────────────────────────────

export function LogicConditionsPanel() {
  const getSelectedProtocol = useDroneManager((s) => s.getSelectedProtocol);
  const { toast } = useToast();
  const { isArmed } = useArmedLock();

  const conditions = useProgrammingStore((s) => s.conditions);
  const conditionsStatus = useProgrammingStore((s) => s.conditionsStatus);
  const loading = useProgrammingStore((s) => s.loading);
  const error = useProgrammingStore((s) => s.error);
  const conditionsDirty = useProgrammingStore((s) => s.conditionsDirty);
  useUnsavedGuard(conditionsDirty);
  const setCondition = useProgrammingStore((s) => s.setCondition);
  const loadFromFc = useProgrammingStore((s) => s.loadFromFc);
  const uploadConditions = useProgrammingStore((s) => s.uploadConditions);
  const startPolling = useProgrammingStore((s) => s.startPolling);
  const stopPolling = useProgrammingStore((s) => s.stopPolling);

  const connected = !!getSelectedProtocol();
  const hasLoaded = conditions.some((c) => c.enabled);

  // Live status polling while armed
  useEffect(() => {
    const protocol = getSelectedProtocol();
    if (!protocol) return;
    if (isArmed) {
      startPolling(protocol);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [isArmed, getSelectedProtocol, startPolling, stopPolling]);

  const handleRead = useCallback(async () => {
    const protocol = getSelectedProtocol();
    if (!protocol) {
      toast("Not connected to flight controller", "error");
      return;
    }
    await loadFromFc(protocol);
    const err = useProgrammingStore.getState().error;
    if (err) {
      toast(err, "error");
    } else {
      toast("Logic conditions loaded from FC", "success");
    }
  }, [getSelectedProtocol, loadFromFc, toast]);

  const handleWrite = useCallback(async () => {
    const protocol = getSelectedProtocol();
    if (!protocol) {
      toast("Not connected to flight controller", "error");
      return;
    }
    await uploadConditions(protocol);
    const err = useProgrammingStore.getState().error;
    if (err) {
      toast(err, "error");
    } else {
      toast("Logic conditions written to FC", "success");
    }
  }, [getSelectedProtocol, uploadConditions, toast]);

  const statusFor = (idx: number) => conditionsStatus.find((s) => s.id === idx);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl space-y-4">
        <PanelHeader
          title="Logic Conditions"
          subtitle={`Up to ${LOGIC_CONDITION_MAX} programmable boolean/arithmetic rules`}
          icon={<GitBranch size={16} />}
          loading={loading}
          loadProgress={null}
          hasLoaded={hasLoaded}
          onRead={handleRead}
          connected={connected}
          error={error}
        >
          {hasLoaded && (
            <Button
              variant="primary"
              size="sm"
              icon={<Upload size={12} />}
              loading={loading}
              disabled={!connected || loading || isArmed}
              onClick={handleWrite}
            >
              Write to FC
            </Button>
          )}
        </PanelHeader>

        {isArmed && (
          <p className="text-[10px] font-mono text-status-warning">
            Armed: edits disabled. Live status visible below.
          </p>
        )}

        {conditionsDirty && !isArmed && (
          <p className="text-[10px] font-mono text-status-warning">
            Unsaved changes: use Write to FC to persist.
          </p>
        )}

        {hasLoaded && (
          <div className="space-y-1">
            {conditions.map((cond, idx) => {
              const st = statusFor(idx);
              return (
                <div
                  key={idx}
                  className={cn(
                    "border border-border-default rounded px-3 py-2 flex items-center gap-3",
                    cond.enabled ? "bg-surface-primary" : "bg-bg-secondary opacity-60",
                  )}
                >
                  {/* Index */}
                  <span className="text-[10px] font-mono text-text-tertiary w-5 shrink-0">{idx}</span>

                  {/* Enable toggle */}
                  <button
                    disabled={isArmed}
                    onClick={() => setCondition(idx, { enabled: !cond.enabled })}
                    className={cn(
                      "w-8 h-4 rounded-full relative transition-colors shrink-0",
                      cond.enabled ? "bg-accent-primary" : "bg-bg-tertiary border border-border-default",
                    )}
                    aria-label={cond.enabled ? "Disable" : "Enable"}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                        cond.enabled ? "translate-x-4" : "translate-x-0.5",
                      )}
                    />
                  </button>

                  {/* Operation */}
                  <div className="w-32 shrink-0">
                    <Select
                      label=""
                      options={OPERATION_OPTIONS}
                      value={String(cond.operation)}
                      onChange={(v) => setCondition(idx, { operation: parseInt(v) })}
                      disabled={isArmed}
                    />
                  </div>

                  {/* Operand A */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-text-tertiary">A:</span>
                    <div className="w-24">
                      <Select
                        label=""
                        options={OPERAND_TYPE_OPTIONS}
                        value={String(cond.operandAType)}
                        onChange={(v) => setCondition(idx, { operandAType: parseInt(v) })}
                        disabled={isArmed}
                      />
                    </div>
                    <input
                      disabled={isArmed}
                      type="number"
                      value={cond.operandAValue}
                      onChange={(e) => setCondition(idx, { operandAValue: parseInt(e.target.value) || 0 })}
                      className="w-16 text-[10px] font-mono bg-bg-tertiary border border-border-default rounded px-1 py-0.5 text-text-primary"
                    />
                  </div>

                  {/* Operand B */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-text-tertiary">B:</span>
                    <div className="w-24">
                      <Select
                        label=""
                        options={OPERAND_TYPE_OPTIONS}
                        value={String(cond.operandBType)}
                        onChange={(v) => setCondition(idx, { operandBType: parseInt(v) })}
                        disabled={isArmed}
                      />
                    </div>
                    <input
                      disabled={isArmed}
                      type="number"
                      value={cond.operandBValue}
                      onChange={(e) => setCondition(idx, { operandBValue: parseInt(e.target.value) || 0 })}
                      className="w-16 text-[10px] font-mono bg-bg-tertiary border border-border-default rounded px-1 py-0.5 text-text-primary"
                    />
                  </div>

                  {/* Live status dot */}
                  {st !== undefined && (
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full",
                          st.value !== 0 ? "bg-status-success" : "bg-bg-tertiary",
                        )}
                        title={`Value: ${st.value}`}
                      />
                      <span className="text-[9px] font-mono text-text-tertiary">{st.value}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
