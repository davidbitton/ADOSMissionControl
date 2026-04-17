"use client";

/**
 * Small pill that shows the MAVLink signing state for a drone.
 *
 * Phase 1 states:
 *   - Signed   (green, lock icon)      — browser key present, FC enrolled
 *   - Unsigned (muted gray)            — firmware supports signing but it is off
 *   - N/A      (muted, different icon) — firmware does not support signing
 *
 * Phase 2 will add "Signed + required" (enforcement on), "Key missing"
 * (FC requires but this browser lacks the key), and "Mismatch" states.
 *
 * Always carries an aria-label so assistive tech reads the state rather
 * than the emoji/icon alone.
 */

import { Lock, Unlock, MinusCircle } from "lucide-react";
import { useSigningStore } from "@/stores/signing-store";

interface Props {
  droneId: string;
  /** Hide the text label and only show the icon. */
  compact?: boolean;
}

type Variant = "signed" | "unsigned" | "na" | "loading";

export function SigningStatusBadge({ droneId, compact = false }: Props) {
  const state = useSigningStore((s) => s.drones[droneId]);
  const variant = classify(state);

  const config = VARIANTS[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium ${config.className}`}
      role="status"
      aria-label={config.ariaLabel}
      title={config.tooltip}
    >
      <config.Icon size={11} aria-hidden="true" />
      {!compact && <span>{config.label}</span>}
    </span>
  );
}

function classify(
  state:
    | { capability: { supported: boolean } | null; hasBrowserKey: boolean; enrollmentState?: string }
    | undefined,
): Variant {
  if (!state || state.capability === null) return "loading";
  if (!state.capability.supported) return "na";
  if (state.hasBrowserKey && state.enrollmentState === "enrolled") return "signed";
  return "unsigned";
}

const VARIANTS: Record<Variant, {
  label: string;
  ariaLabel: string;
  tooltip: string;
  className: string;
  Icon: typeof Lock;
}> = {
  signed: {
    label: "Signed",
    ariaLabel: "MAVLink signing enabled",
    tooltip: "Every command to this drone is signed with HMAC-SHA256.",
    className: "text-status-success",
    Icon: Lock,
  },
  unsigned: {
    label: "Unsigned",
    ariaLabel: "MAVLink signing supported but not enabled",
    tooltip: "This drone supports MAVLink signing but it is not enabled.",
    className: "text-text-tertiary",
    Icon: Unlock,
  },
  na: {
    label: "No signing",
    ariaLabel: "MAVLink signing not supported on this firmware",
    tooltip: "This firmware does not expose a signing key store.",
    className: "text-text-tertiary opacity-70",
    Icon: MinusCircle,
  },
  loading: {
    label: "…",
    ariaLabel: "MAVLink signing state loading",
    tooltip: "Checking signing capability...",
    className: "text-text-tertiary opacity-50",
    Icon: Unlock,
  },
};
