"use client";

/**
 * @module PairingDialog
 * @description Modal dialog for pairing a new ADOS Drone Agent. Hosts the
 * dialog chrome and copy-to-clipboard helpers; lifecycle state machine lives
 * in `usePairingFlow`, per-stage UI lives in `./pairing/`.
 * @license GPL-3.0-only
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Loader2, X } from "lucide-react";
import { useMutation } from "convex/react";
import { cn } from "@/lib/utils";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { cmdPairingApi } from "@/lib/community-api-drones";
import { useAuthStore } from "@/stores/auth-store";
import { usePairingStore } from "@/stores/pairing-store";
import { SignInModal } from "@/components/auth/SignInModal";
import { Tabs } from "@/components/ui/tabs";
import { PairingPrompt } from "./pairing/PairingPrompt";
import { PairingConfirm } from "./pairing/PairingConfirm";
import { PairingResult } from "./pairing/PairingResult";
import {
  usePairingFlow,
  buildInstallCommand,
  type ClaimCodeMutation,
  type PreGenerateMutation,
} from "./pairing/use-pairing-flow";

type DialogTab = "enter" | "generate";

interface PairingDialogProps {
  open: boolean;
  onClose: () => void;
  onPaired?: (deviceId: string, apiKey: string, url: string) => void;
  /** Deep-link supplied code. When set, the dialog claims this code
   *  instead of generating a new one. */
  initialCode?: string | null;
}

export function PairingDialog(props: PairingDialogProps) {
  const convexAvailable = useConvexAvailable();
  if (convexAvailable) {
    return <PairingDialogWithConvex {...props} />;
  }
  return (
    <PairingDialogBase
      {...props}
      claimCode={null}
      preGenerate={null}
      requiresSignIn={false}
    />
  );
}

function PairingDialogWithConvex(props: PairingDialogProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const claimCode = useMutation(cmdPairingApi.claimPairingCode);
  const preGenerate = useMutation(cmdPairingApi.preGenerateCode);

  return (
    <PairingDialogBase
      {...props}
      claimCode={isAuthenticated ? (claimCode as ClaimCodeMutation) : null}
      preGenerate={isAuthenticated ? (preGenerate as PreGenerateMutation) : null}
      requiresSignIn={!isAuthenticated && !isAuthLoading}
    />
  );
}

interface BaseProps extends PairingDialogProps {
  claimCode: ClaimCodeMutation;
  preGenerate: PreGenerateMutation;
  requiresSignIn: boolean;
}

function PairingDialogBase({
  open,
  onClose,
  onPaired,
  claimCode,
  preGenerate,
  requiresSignIn,
  initialCode,
}: BaseProps) {
  const t = useTranslations("command");
  const tCommon = useTranslations("common");
  const [signInOpen, setSignInOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  // The modal opens on the code-entry tab by default. Operators with a
  // paired rig already advertising a code in `ados status` pick that
  // up immediately; the generate-code path is one click away for
  // zero-touch installs.
  const [activeTab, setActiveTab] = useState<DialogTab>("enter");

  const onCodeReset = useCallback(() => {
    setCopiedCode(false);
    setCopiedInstall(false);
  }, []);

  // Reset the tab to the default when the dialog reopens, unless an
  // initialCode (deep-link) is in play — that path skips the tabs
  // entirely and renders straight into the claim state machine.
  useEffect(() => {
    if (open && !initialCode) {
      setActiveTab("enter");
    }
  }, [open, initialCode]);

  const flow = usePairingFlow({
    open,
    requiresSignIn,
    claimCode,
    preGenerate,
    onPaired,
    onCodeReset,
    initialCode,
    // Only auto-generate when the operator has already chosen the
    // generate-code tab; the enter-code tab uses claimDiscovered with
    // an operator-typed code instead.
    autoGenerate: activeTab === "generate",
  });

  const discoveredAgents = usePairingStore((s) => s.discoveredAgents);

  // When the operator switches to the generate-code tab and we haven't
  // generated a code yet (state still "setup"), kick off generation.
  // Stays a no-op when an initialCode is in play.
  useEffect(() => {
    if (!open || initialCode || requiresSignIn) return;
    if (activeTab === "generate" && flow.state === "setup") {
      flow.generateCode();
    }
  }, [activeTab, open, initialCode, requiresSignIn, flow]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleCopyCode = useCallback(() => {
    if (!flow.preGenCode) return;
    navigator.clipboard
      .writeText(flow.preGenCode)
      .then(() => {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      })
      .catch(() => {});
  }, [flow.preGenCode]);

  const handleCopyInstall = useCallback(() => {
    if (!flow.preGenCode) return;
    navigator.clipboard
      .writeText(buildInstallCommand(flow.preGenCode))
      .then(() => {
        setCopiedInstall(true);
        setTimeout(() => setCopiedInstall(false), 2000);
      })
      .catch(() => {});
  }, [flow.preGenCode]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-secondary border border-border-default rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("pairNewDrone")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
            title={tCommon("close")}
            aria-label={tCommon("close")}
          >
            <X size={16} />
          </button>
        </div>

        {/* Sign-in prompt sits outside the tabs because neither tab can
            do anything until the user is authenticated. */}
        {requiresSignIn ? (
          <div className="px-5 py-5">
            <PairingPrompt variant="sign-in" onSignIn={() => setSignInOpen(true)} />
          </div>
        ) : initialCode ? (
          // Deep-link entry runs the claim state machine without tabs.
          <div className="px-5 py-5 space-y-5">
            {flow.state === "success" && flow.pairedInfo && (
              <PairingResult variant="success" info={flow.pairedInfo} />
            )}
            {flow.state === "error" && (
              <PairingResult
                variant="error"
                message={flow.errorMessage}
                onRetry={flow.generateCode}
              />
            )}
          </div>
        ) : (
          <>
            <Tabs
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as DialogTab)}
              tabs={[
                { id: "enter", label: t("pairing.tab.enterCode") },
                { id: "generate", label: t("pairing.tab.generateCode") },
              ]}
              className="px-4"
            />
            <div className="px-5 py-5 space-y-5">
              {activeTab === "enter" && (
                <EnterPairCodeTab
                  onClaim={flow.claimDiscovered}
                  state={flow.state}
                  errorMessage={flow.errorMessage}
                  pairedInfo={flow.pairedInfo}
                />
              )}
              {activeTab === "generate" && (
                <>
                  {flow.state === "setup" && <PairingPrompt variant="setup" />}
                  {flow.state === "waiting" && flow.preGenCode && (
                    <PairingConfirm
                      code={flow.preGenCode}
                      secondsLeft={flow.secondsLeft}
                      copiedCode={copiedCode}
                      copiedInstall={copiedInstall}
                      installCommand={buildInstallCommand(flow.preGenCode)}
                      discoveredAgents={discoveredAgents}
                      onCopyCode={handleCopyCode}
                      onCopyInstall={handleCopyInstall}
                      onDiscoveredPair={flow.claimDiscovered}
                    />
                  )}
                  {flow.state === "success" && flow.pairedInfo && (
                    <PairingResult variant="success" info={flow.pairedInfo} />
                  )}
                  {flow.state === "error" && (
                    <PairingResult
                      variant="error"
                      message={flow.errorMessage}
                      onRetry={flow.generateCode}
                    />
                  )}
                  {flow.state === "expired" && (
                    <PairingResult variant="expired" onRetry={flow.generateCode} />
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}

/**
 * Tab body that lets the operator type the 6-character pair code the
 * agent already advertises (in `ados status`, the install banner, or
 * the setup webapp) and claim the agent via the cloud relay. Uses the
 * existing usePairingFlow claimDiscovered handler so error mapping
 * stays consistent with the rest of the modal.
 */
function EnterPairCodeTab({
  onClaim,
  state,
  errorMessage,
  pairedInfo,
}: {
  onClaim: (agent: { pairingCode: string }) => Promise<void>;
  state: ReturnType<typeof usePairingFlow>["state"];
  errorMessage: string;
  pairedInfo: ReturnType<typeof usePairingFlow>["pairedInfo"];
}) {
  const t = useTranslations("command.pairing");
  const [code, setCode] = useState("");
  const submitting = state === "waiting";

  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ready = cleaned.length === 6 && !submitting;

  async function handleSubmit() {
    if (!ready) return;
    await onClaim({ pairingCode: cleaned });
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  }

  if (state === "success" && pairedInfo) {
    return <PairingResult variant="success" info={pairedInfo} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center">
          <KeyRound size={14} className="text-accent-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">
            {t("enterCodeTitle")}
          </p>
          <p className="text-[10px] text-text-tertiary">
            {t("enterCodeSubtitle")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKey}
          placeholder="------"
          disabled={submitting}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          className="flex-1 px-3 py-2 bg-bg-primary border border-border-default rounded text-sm font-mono uppercase tracking-widest text-text-primary placeholder:text-text-tertiary/40 placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-accent-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!ready}
          className="px-3 py-2 text-xs font-medium bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {submitting ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              {t("pairing")}
            </>
          ) : (
            t("pair")
          )}
        </button>
      </div>

      <p className="text-[10px] text-text-tertiary leading-relaxed">
        {t("enterCodeHint")}
      </p>

      {state === "error" && errorMessage && (
        <p
          role="alert"
          aria-live="polite"
          className="text-xs text-status-error"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

/**
 * Inline pairing code input for embedding in other pages. Same 6-char input
 * logic without the modal wrapper.
 */
export function PairingCodeInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (code: string) => void;
  disabled?: boolean;
}) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(value: string) {
    const cleaned = value
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6);
    setCode(cleaned);
    if (cleaned.length === 6) {
      onSubmit(cleaned);
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={code}
      onChange={(e) => handleChange(e.target.value)}
      maxLength={6}
      disabled={disabled}
      placeholder="------"
      className={cn(
        "w-52 text-center text-xl font-mono font-bold tracking-[0.4em] bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-text-primary placeholder:text-text-tertiary/40 outline-none focus:border-accent-primary transition-colors uppercase",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      autoComplete="off"
      spellCheck={false}
    />
  );
}
