/**
 * @module use-install-handler
 * @description Extracted install-orchestration callback for the plugin
 * install dialog. The orchestrator (`PluginInstallDialog`) owns the
 * stage + error state and the resolved transport/lanTarget; this hook
 * builds the actual install kickoff, demo-mode short-circuit, and
 * registry-vs-file branching that used to live inline in
 * `handleApprove`.
 *
 * Splitting this out keeps the orchestrator under the LOC ceiling
 * without changing behaviour. The hook returns a stable callback that
 * the orchestrator wires to the Install button.
 *
 * @license GPL-3.0-only
 */

import { useCallback, type MutableRefObject } from "react";

import { isDemoMode } from "@/lib/utils";

import {
  installLanDirect,
  shouldFailover,
  LanDirectError,
} from "../transports/lan-direct";
import { installLanDirectFromUrl } from "../transports/lan-direct-url";
import {
  installCloudRelay,
  type CreateJobMutation,
  type GenerateUploadUrlAction,
  type VerifyArchiveAction,
} from "../transports/cloud-relay";
import type {
  InstallKickoffResult,
  InstallTransport,
} from "../transports/types";
import type {
  InstallManifestSummary,
  InstallSource,
  InstallTargetDrone,
} from "./types";

type Stage = "pick" | "loading" | "review" | "installing" | "error";

export interface UseInstallHandlerArgs {
  manifest: InstallManifestSummary | null;
  source: InstallSource | null;
  granted: Set<string>;
  transport: InstallTransport;
  lanTarget: { url: string; apiKey: string } | null;
  targetDevice: InstallTargetDrone;
  convexAvailable: boolean;
  generateUploadUrl: GenerateUploadUrlAction;
  verifyArchive: VerifyArchiveAction;
  createJob: CreateJobMutation;
  manifestHash: string;
  onKickedOff?: (result: InstallKickoffResult) => void;
  /** Close path used on a successful kickoff. The orchestrator passes
   * a variant that bypasses the in-flight close guard so the dialog
   * actually closes once the install has been handed off. */
  onClose: () => void;
  setStage: (stage: Stage) => void;
  setError: (error: string | null) => void;
  /** Flipped to `true` for the lifetime of the install kickoff so the
   * orchestrator's close guard can refuse Esc and the X button while
   * the request is in flight. Cleared in both success and failure
   * branches. */
  installInflightRef: MutableRefObject<boolean>;
}

/**
 * Mint a job id for the install kickoff. The progress toast and the
 * agent both echo this id so the GCS can subscribe to job progress
 * before the upload completes.
 */
function newJobId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the install-kickoff callback. Returns a stable `useCallback` so
 * the orchestrator can hand it straight to the Install button without
 * triggering ReviewStage re-renders on every parent render.
 */
export function useInstallHandler(args: UseInstallHandlerArgs) {
  const {
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
    onClose,
    setStage,
    setError,
    installInflightRef,
  } = args;

  return useCallback(async () => {
    if (!manifest || !source) return;
    setStage("installing");
    setError(null);
    installInflightRef.current = true;
    try {
      const jobId = newJobId();
      const grantedArr = [...granted] as ReadonlyArray<string>;

      // Demo-mode short-circuit. Avoid any real wire traffic.
      if (isDemoMode()) {
        const { mockPluginInstall } = await import(
          "@/mock/mock-plugin-install"
        );
        const ctx =
          source.kind === "file"
            ? {
                file: source.file,
                manifest,
                grantedPermissions: grantedArr,
                deviceId: targetDevice.deviceId,
                deviceName: targetDevice.name,
              }
            : {
                // The mock helper takes a File; for registry sources we
                // fake a small placeholder so the demo flow stays
                // realistic without an actual archive on hand.
                file: new File([new Uint8Array()], "registry.adosplug"),
                manifest,
                grantedPermissions: grantedArr,
                deviceId: targetDevice.deviceId,
                deviceName: targetDevice.name,
              };
        const result = await mockPluginInstall(transport, ctx);
        onKickedOff?.({ ...result, jobId });
        // Clear the in-flight flag before delegating to onClose so the
        // orchestrator's close guard lets the modal actually close.
        installInflightRef.current = false;
        onClose();
        return;
      }

      let result: InstallKickoffResult;

      if (source.kind === "registry") {
        // The agent fetches the archive itself. LAN is the only
        // supported transport here today; cloud-relay-from-URL is a
        // future addition and currently surfaces a clear error.
        if (!lanTarget) {
          throw new Error(
            "Registry installs require a paired drone on the LAN. Pair the drone or connect on the same network and retry.",
          );
        }
        result = await installLanDirectFromUrl({
          agentUrl: lanTarget.url,
          pairingKey: lanTarget.apiKey,
          url: source.url,
          expectedSha256: source.expectedSha256,
          grantedPermissions: grantedArr,
          jobId,
          pluginId: manifest.pluginId,
          pluginName: manifest.name,
          deviceId: targetDevice.deviceId,
          fromCatalog: true,
        });
      } else {
        const ctx = {
          file: source.file,
          manifest,
          grantedPermissions: grantedArr,
          deviceId: targetDevice.deviceId,
          deviceName: targetDevice.name,
        };
        if (transport === "lan" && lanTarget) {
          try {
            result = await installLanDirect({
              ...ctx,
              agentUrl: lanTarget.url,
              pairingKey: lanTarget.apiKey,
              jobId,
            });
          } catch (err) {
            if (err instanceof LanDirectError && shouldFailover(err)) {
              if (!convexAvailable) {
                throw new Error(
                  `${err.message}. Cloud relay unavailable, please retry on the LAN.`,
                );
              }
              result = await installCloudRelay({
                ...ctx,
                generateUploadUrl,
                verifyArchive,
                createJob,
                manifestHash,
              });
              result.notice =
                "LAN upload failed, falling back to cloud relay";
            } else {
              throw err;
            }
          }
        } else {
          if (!convexAvailable) {
            throw new Error(
              "Cloud relay requires the Convex backend. Connect to the agent on the LAN to install a plugin.",
            );
          }
          result = await installCloudRelay({
            ...ctx,
            generateUploadUrl,
            verifyArchive,
            createJob,
            manifestHash,
          });
        }
      }

      onKickedOff?.(result);
      // Clear the in-flight flag before delegating to onClose so the
      // orchestrator's close guard lets the modal actually close.
      installInflightRef.current = false;
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    } finally {
      installInflightRef.current = false;
    }
  }, [
    manifest,
    source,
    granted,
    transport,
    lanTarget,
    targetDevice.deviceId,
    targetDevice.name,
    convexAvailable,
    generateUploadUrl,
    verifyArchive,
    createJob,
    manifestHash,
    onKickedOff,
    onClose,
    setStage,
    setError,
    installInflightRef,
  ]);
}
