"use client";

/**
 * @module AgentDisconnectedPage
 * @description Pairing-first page shown when no agent is selected.
 * Local-first by design: the Add-a-Node card lets the operator
 * pair any agent on the LAN without signing in. The cloud
 * pairing-code card is available behind the "Sign in for remote
 * access" branch but is never a gate.
 * @license GPL-3.0-only
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { useAuthStore } from "@/stores/auth-store";
import { SignInModal } from "@/components/auth/SignInModal";
import { AddNodeCard } from "./disconnected/AddNodeCard";
import { ClaimPairingCodeCard } from "./disconnected/ClaimPairingCodeCard";
import { CloudPairingCodeSection } from "./disconnected/CloudPairingCodeSection";
import { FeatureGrid } from "./disconnected/FeatureGrid";
import { RequirementsFooter } from "./disconnected/RequirementsFooter";

interface AgentDisconnectedPageProps {
  onOpenPairing?: () => void;
}

export function AgentDisconnectedPage({
  onOpenPairing,
}: AgentDisconnectedPageProps) {
  const t = useTranslations("disconnectedPage");
  const convexAvailable = useConvexAvailable();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [signInOpen, setSignInOpen] = useState(false);

  function handlePaired(_deviceId: string) {
    // The local-nodes-store has the new entry. Notify the parent
    // so it can refresh the fleet sidebar selection if needed.
    onOpenPairing?.();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 text-sm font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full">
            <AlertTriangle size={12} />
            {t("alpha")}
          </div>
          <h1 className="text-3xl font-display font-bold text-text-primary">
            {t("pairYourDrone")}
          </h1>
          <p className="text-text-secondary text-base max-w-lg mx-auto">
            {t("installAndConnect")}
          </p>
        </div>

        {/* Add a node — local first, no auth gate */}
        <div className="max-w-md mx-auto">
          <AddNodeCard
            cloudAvailable={convexAvailable}
            onSignIn={() => setSignInOpen(true)}
            onPaired={handlePaired}
          />
        </div>

        {/* Pair-by-code — HTTPS-safe entry point that claims the
            agent's beaconed pairing code via Convex. Mounted only
            when signed in to the cloud; the card self-gates and
            renders null when convex/auth is missing. */}
        {convexAvailable && isAuthenticated && (
          <div className="max-w-md mx-auto">
            <ClaimPairingCodeCard />
          </div>
        )}

        {/* Cloud pair code — only when signed in. Optional path. */}
        {convexAvailable && isAuthenticated && (
          <div className="max-w-md mx-auto">
            <CloudPairingCodeSection />
          </div>
        )}

        <FeatureGrid />

        <RequirementsFooter />
      </div>
      <SignInModal
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
      />
    </div>
  );
}
