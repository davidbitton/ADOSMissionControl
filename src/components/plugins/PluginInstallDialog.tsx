"use client";

/**
 * @module PluginInstallDialog
 * @description Per-drone plugin install dialog. Composes the local-file
 * pick screen, the single-page review surface, and the install
 * kickoff. Two install sources flow through the same orchestrator:
 *
 *   - `kind: "file"` — operator drag-dropped a `.adosplug` archive. The
 *     dialog parses it client-side and the cloud-relay path uploads
 *     it via Convex storage. LAN-direct uses the multipart
 *     `/api/plugins/install` endpoint.
 *   - `kind: "registry"` — operator clicked Install on a registry
 *     card. The parent grid pre-resolves the manifest and hands a URL
 *     + SHA-256 pin to this dialog. Install kickoff calls the agent's
 *     `POST /api/plugins/install_from_url` endpoint over the LAN; no
 *     Convex hop is needed, so the operator does not have to be
 *     signed in to the cloud.
 *
 * Transport policy:
 *   - `resolveLanTarget()` returns the LAN URL + pairing key for the
 *     target drone, or null when HTTPS / unpaired / unreachable.
 *   - For the file path, `installLanDirect()` posts multipart to
 *     `/api/plugins/install`; `installCloudRelay()` walks the
 *     `generateUploadUrl → verifyArchive → createJob` chain on
 *     failover.
 *   - For the registry path, `installLanDirectFromUrl()` posts JSON to
 *     `/api/plugins/install_from_url`. Cloud-relay-from-URL falls back
 *     to a clear "LAN unavailable" error since the URL install does
 *     not need cloud storage.
 *
 * @license GPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useTranslations } from "next-intl";

import { Modal } from "@/components/ui/modal";
import { useConvexAvailable } from "@/app/ConvexClientProvider";
import { communityApi } from "@/lib/community-api";
import { useAgentSystemStore } from "@/stores/agent-system-store";

import {
  extractManifestYaml,
  parseManifestYaml,
  toInstallSummary,
} from "./transports/manifest-parse";
import { resolveLanTarget } from "./transports/resolve-lan-url";
import type {
  CreateJobMutation,
  GenerateUploadUrlAction,
  VerifyArchiveAction,
} from "./transports/cloud-relay";
import type {
  InstallKickoffResult,
  InstallTransport,
} from "./transports/types";
import { ErrorStage, PickStage, TransportChrome } from "./install-dialog/stages";
import { ReviewStage } from "./install-dialog/sections/ReviewStage";
import { checkCompatibility } from "./install-dialog/check-compatibility";
import { useInstallHandler } from "./install-dialog/use-install-handler";
import type {
  InstallManifestSummary,
  InstallSource,
  InstallTargetDrone,
} from "./install-dialog/types";

// Re-export the public types so existing callers can keep importing
// them from this orchestrator file; the canonical definitions live in
// `./install-dialog/types.ts` to keep this file under the LOC ceiling.
export type {
  InstallManifestSummary,
  InstallSource,
  InstallTargetDrone,
} from "./install-dialog/types";

interface PluginInstallDialogProps {
  open: boolean;
  onClose: () => void;
  /** Drone the plugin is being installed on. */
  targetDevice: InstallTargetDrone;
  /** Pre-populated manifest + source from a registry card or a
   * stored upload. When omitted, the dialog opens on the local-file
   * pick stage. */
  initialManifest?: InstallManifestSummary;
  initialManifestHash?: string;
  /** Source discriminator that drives transport selection. Required
   * alongside `initialManifest`. */
  initialSource?: InstallSource;
  /** Fired after the install is kicked off so the parent can mount a
   * progress toast. */
  onKickedOff?: (result: InstallKickoffResult) => void;
}

type Stage = "pick" | "loading" | "review" | "installing" | "error";

const verifyArchiveRef = makeFunctionReference<
  "action",
  Parameters<VerifyArchiveAction>[0],
  Awaited<ReturnType<VerifyArchiveAction>>
>("cmdPluginArchivesVerify:verifyArchive");

export function PluginInstallDialog({
  open,
  onClose,
  targetDevice,
  initialManifest,
  initialManifestHash,
  initialSource,
  onKickedOff,
}: PluginInstallDialogProps) {
  const t = useTranslations("pluginInstall.dialog");
  const convexAvailable = useConvexAvailable();
  const generateUploadUrl = useAction(
    communityApi.pluginArchives.generateUploadUrl,
  ) as unknown as GenerateUploadUrlAction;
  const verifyArchive = useAction(
    verifyArchiveRef,
  ) as unknown as VerifyArchiveAction;
  const createJob = useMutation(
    communityApi.pluginInstallJobs.createJob,
  ) as unknown as CreateJobMutation;

  // Host board info — drives the compatibility check.
  const boardModel = useAgentSystemStore((s) => s.status?.board.model);
  const boardName = useAgentSystemStore((s) => s.status?.board.name);
  const boardSoc = useAgentSystemStore((s) => s.status?.board.soc);
  const ramTotalMb = useAgentSystemStore((s) => s.status?.board.ram_mb);

  const seedFromInitial = initialManifest !== undefined && initialSource !== undefined;
  const [stage, setStage] = useState<Stage>(seedFromInitial ? "review" : "pick");
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<InstallManifestSummary | null>(
    seedFromInitial ? initialManifest : null,
  );
  const [source, setSource] = useState<InstallSource | null>(
    seedFromInitial ? initialSource ?? null : null,
  );
  const [manifestHash, setManifestHash] = useState<string>(
    seedFromInitial ? initialManifestHash ?? "" : "",
  );
  const [granted, setGranted] = useState<Set<string>>(() => {
    if (seedFromInitial && initialManifest) {
      return new Set(
        initialManifest.permissions.filter((p) => p.required).map((p) => p.id),
      );
    }
    return new Set();
  });
  const [dragActive, setDragActive] = useState(false);

  const lanTarget = useMemo(
    () => (open ? resolveLanTarget(targetDevice.deviceId) : null),
    [open, targetDevice.deviceId],
  );
  const transport: InstallTransport = lanTarget ? "lan" : "cloud";

  const reset = useCallback(() => {
    setStage("pick");
    setError(null);
    setManifest(null);
    setSource(null);
    setManifestHash("");
    setGranted(new Set());
    setDragActive(false);
  }, []);

  // True from the moment the install kickoff fires until the agent
  // either resolves or rejects it. Tracked on a ref so the close guard
  // sees the live value regardless of React batching, and so the hook
  // can clear it inside the success branch before delegating back to
  // `handleClose` (closing the modal once the kickoff is handed off).
  const installInflightRef = useRef(false);

  const handleClose = useCallback(() => {
    if (installInflightRef.current) {
      // The install kickoff is already on its way to the agent. Closing
      // the dialog mid-flight would drop the operator's only handle on
      // the in-flight job and reset state below it. Refuse silently;
      // the spinner copy tells the operator why the X is inert.
      return;
    }
    reset();
    onClose();
  }, [reset, onClose]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (initialManifest && initialSource) {
      setStage("review");
      setManifest(initialManifest);
      setSource(initialSource);
      setManifestHash(initialManifestHash ?? "");
      setGranted(
        new Set(
          initialManifest.permissions
            .filter((p) => p.required)
            .map((p) => p.id),
        ),
      );
    }
  }, [open, reset, initialManifest, initialSource, initialManifestHash]);

  const parseFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await extractManifestYaml(file);
      const parsed = parseManifestYaml(text);
      const hashBytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      );
      const hash = Array.from(new Uint8Array(hashBytes))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const summary = toInstallSummary(parsed, hash);
      setManifest(summary);
      setSource({ kind: "file", file, manifestHash: hash });
      setManifestHash(hash);
      setGranted(
        new Set(
          summary.permissions.filter((p) => p.required).map((p) => p.id),
        ),
      );
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void parseFile(file);
    },
    [parseFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void parseFile(file);
    },
    [parseFile],
  );

  const togglePermission = useCallback((id: string, required: boolean) => {
    if (required) return;
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Compute the compatibility result reactively so the review surface
  // can disable the install button when the host is incompatible.
  const compatibility = useMemo(() => {
    if (!manifest) {
      return {
        boardCompatible: true,
        ramOk: true,
        cpuOk: true,
      };
    }
    return checkCompatibility(manifest, {
      boardModel,
      boardName,
      boardSoc,
      ramTotalMb,
    });
  }, [manifest, boardModel, boardName, boardSoc, ramTotalMb]);

  const boardLabel = boardModel ?? boardName ?? boardSoc ?? "unknown";

  // First-party hint until signing ships everywhere. The registry
  // tier comes through on the card; the dialog doesn't have that
  // signal directly, so we derive the same hint from a stable signer
  // prefix.
  const firstParty = !!manifest?.signerId?.startsWith("altnautica-");

  const handleApprove = useInstallHandler({
    manifest,
    source,
    granted,
    transport,
    lanTarget,
    targetDevice,
    convexAvailable,
    generateUploadUrl,
    verifyArchive,
    createJob,
    manifestHash,
    onKickedOff,
    onClose: handleClose,
    setStage,
    setError,
    installInflightRef,
  });

  const title =
    stage === "pick"
      ? t("title.pick", { drone: targetDevice.name })
      : stage === "loading"
        ? t("title.loading")
        : stage === "review"
          ? t("title.review")
          : stage === "installing"
            ? t("title.installing")
            : t("title.error");

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      className="max-w-2xl"
      disableBackdropClose
      closeBlocked={stage === "installing"}
      noBodyPadding={stage === "review"}
    >
      {stage !== "review" && (
        <TransportChrome
          targetName={targetDevice.name}
          transport={transport}
          lanAvailable={!!lanTarget}
        />
      )}

      {stage === "pick" && (
        <PickStage
          dragActive={dragActive}
          setDragActive={setDragActive}
          onDrop={onDrop}
          onPick={onPick}
        />
      )}

      {stage === "loading" && (
        <p className="px-4 py-6 text-center text-sm text-text-secondary">
          {t("loading")}
        </p>
      )}

      {stage === "review" && manifest && (
        <ReviewStage
          manifest={manifest}
          targetName={targetDevice.name}
          boardLabel={boardLabel}
          compatibility={compatibility}
          firstParty={firstParty}
          granted={granted}
          onTogglePermission={togglePermission}
          onCancel={handleClose}
          onInstall={handleApprove}
        />
      )}

      {stage === "installing" && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-text-secondary">
            {t("installingVia", {
              drone: targetDevice.name,
              transport:
                transport === "lan"
                  ? t("transport.lan")
                  : t("transport.cloud"),
            })}
          </p>
          <p className="mt-2 text-xs text-text-tertiary">
            {t("closingDisabled")}
          </p>
        </div>
      )}

      {stage === "error" && (
        <ErrorStage
          error={error}
          onClose={handleClose}
          onRetry={() => reset()}
        />
      )}
    </Modal>
  );
}
