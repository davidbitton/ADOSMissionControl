"use client";

/**
 * @module ClaimPairingCodeCard
 * @description HTTPS-safe pair entry point. The operator types the
 * 6-character code the agent prints in its install banner (and in
 * `ados status`); Mission Control claims the agent's beaconed
 * registration via Convex. No browser fetch to the LAN agent — the
 * entire handshake rides Convex over HTTPS, so this is the canonical
 * path when Mission Control is served on https:// and the browser
 * would otherwise block a plain HTTP probe to a LAN hostname.
 *
 * The reverse direction (Mission Control generates the code, agent
 * claims it during install) lives on `CloudPairingCodeSection`.
 * Both can render side by side.
 * @license GPL-3.0-only
 */

import { useId, useState } from "react";
import { useMutation } from "convex/react";
import { Check, ChevronRight, KeyRound, Loader2 } from "lucide-react";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { useAuthStore } from "@/stores/auth-store";
import { cmdPairingApi } from "@/lib/community-api-drones";

interface ClaimPairingCodeCardProps {
  /** Open the sign-in modal. The card surfaces a sign-in stub when
   * the user is unauthenticated so the "Jump to pair-by-code" CTA
   * on the LAN-direct error block lands on something actionable. */
  onSignIn?: () => void;
}

export function ClaimPairingCodeCard({ onSignIn }: ClaimPairingCodeCardProps) {
  const convexAvailable = useConvexAvailable();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!convexAvailable) return null;
  if (!isAuthenticated) return <ClaimPairingSignInStub onSignIn={onSignIn} />;
  return <ClaimPairingCodeCardInner />;
}

function ClaimPairingSignInStub({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <button
      id="claim-pairing-code-card"
      type="button"
      onClick={() => onSignIn?.()}
      className="w-full text-left p-5 bg-bg-secondary border border-border-default rounded-lg space-y-3 hover:bg-bg-tertiary transition-colors group"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center">
          <KeyRound size={14} className="text-accent-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">
            Pair with a code from your drone
          </p>
          <p className="text-[10px] text-text-tertiary">
            Works over HTTPS. No LAN access required.
          </p>
        </div>
        <ChevronRight
          size={14}
          className="text-text-tertiary group-hover:text-text-secondary transition-colors"
        />
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">
        Sign in to claim the 6-character code your agent shows in{" "}
        <code className="font-mono text-text-primary">ados status</code> or the
        install banner. The cloud relay routes the handshake through Convex so
        the browser never has to reach your LAN.
      </p>
    </button>
  );
}

function ClaimPairingCodeCardInner() {
  const claim = useMutation(cmdPairingApi.claimPairingCode);
  const inputId = useId();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Normalised view of the input. Strip non-alphanumerics and force
  // upper-case so the visible chars match the agent's safe-charset
  // banner (ABCDEFGHJKMNPQRSTUVWXYZ23456789).
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ready = cleaned.length === 6 && !submitting;

  async function handleSubmit() {
    if (!ready) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const result = await claim({ code: cleaned });
      const displayName =
        (result as { name?: string }).name ?? `Drone ${cleaned}`;
      setSuccess(
        `Paired ${displayName}. The drone is appearing in your fleet now.`,
      );
      setCode("");
    } catch (err) {
      // Convex mutations re-throw with the server-side message; surface
      // it as-is so the operator sees "Invalid pairing code", "Pairing
      // code expired", or "Code already claimed" verbatim.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div
      id="claim-pairing-code-card"
      className="p-5 bg-bg-secondary border border-border-default rounded-lg space-y-3"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center">
          <KeyRound size={14} className="text-accent-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">
            Pair with a code from your drone
          </p>
          <p className="text-[10px] text-text-tertiary">
            Works over HTTPS. No LAN access required.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
            setSuccess(null);
          }}
          onKeyDown={handleKey}
          placeholder="6-character code"
          disabled={submitting}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 px-3 py-2 bg-bg-primary border border-border-default rounded text-sm font-mono uppercase tracking-widest text-text-primary placeholder:text-text-tertiary placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-accent-primary disabled:opacity-50"
        />
        <button
          onClick={() => void handleSubmit()}
          disabled={!ready}
          className="px-3 py-2 text-xs font-medium bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {submitting ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Pairing
            </>
          ) : (
            <>
              <Check size={12} />
              Pair
            </>
          )}
        </button>
      </div>

      <p className="text-[10px] text-text-tertiary leading-relaxed">
        Run <code className="font-mono text-text-secondary">ados status</code>{" "}
        on your drone to see its current code, or copy it from the install
        banner.
      </p>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="text-xs text-status-error"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-status-success"
        >
          {success}
        </p>
      )}
    </div>
  );
}
