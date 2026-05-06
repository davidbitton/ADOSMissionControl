"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HardDrive, RefreshCw, Copy, Check, Terminal, Usb, Info, Zap, X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type {
  AdosAgentBoard,
  AdosAgentStack,
  AdosAgentWebFlashInstall,
} from "@/lib/protocol/firmware/ados-agent-manifest";
import type { FlashProgress } from "@/lib/protocol/firmware/types";
import {
  RockchipBootromFlasher,
  ROCKCHIP_USB_VID,
} from "@/lib/protocol/firmware/rockchip-bootrom";
import { usbDeviceManager, type UsbDeviceInfo } from "@/lib/usb-device-manager";
import { FirmwareFlashProgress } from "./FirmwareFlashProgress";

interface Props {
  stack: AdosAgentStack;
  boards: AdosAgentBoard[];
  loading: boolean;
  error: string;
  agentVersion: string;
  selectedBoardId: string;
  setSelectedBoardId: (id: string) => void;
  onRetry: () => void;
  /**
   * Pre-flight checklist signal from the parent panel. Optional so
   * existing call sites (and tests) that rendered the section without
   * a checklist gate keep compiling; the live Flash Tool always passes
   * the real value.
   */
  allChecked?: boolean;
  /** WebUSB availability gate (already computed in parent). */
  usbSupported?: boolean;
}

export function AdosAgentSection({
  stack, boards, loading, error, agentVersion,
  selectedBoardId, setSelectedBoardId, onRetry,
  allChecked = false, usbSupported = false,
}: Props) {
  const t = useTranslations("flashTool.ados");
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Rockchip bootrom devices currently visible to the browser. Updated
  // on mount via getKnownDevices() and live via hot-plug listeners.
  const [rockchipDevices, setRockchipDevices] = useState<UsbDeviceInfo[]>([]);

  // Flash lifecycle state. Local to this section so the FC flash flow
  // (FlashManager + ParsedFirmware) stays untouched.
  const [progress, setProgress] = useState<FlashProgress | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const flasherRef = useRef<RockchipBootromFlasher | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const eligibleBoards = useMemo(
    () => boards.filter((b) => b.stacks.includes(stack)),
    [boards, stack],
  );

  const selectedBoard = useMemo(
    () => eligibleBoards.find((b) => b.id === selectedBoardId) ?? null,
    [eligibleBoards, selectedBoardId],
  );

  const install = selectedBoard?.installs[stack] ?? null;
  const webFlashInstall =
    install && install.method === "web-flash"
      ? (install as AdosAgentWebFlashInstall)
      : null;

  // Reset the copy-feedback state when the board changes so the green
  // copy-confirmation pip from a prior board doesn't bleed onto a new command.
  useEffect(() => {
    setCopied(false);
  }, [selectedBoardId, stack]);

  // Subscribe to USB hot-plug for Rockchip devices. Mirrors the DFU
  // hook in useFirmwareState but scoped to the Rockchip vendor id. The
  // global manager is initialised by the parent FC flow on mount, so
  // we just attach connect/disconnect handlers here and filter for
  // Rockchip devices on each event.
  useEffect(() => {
    if (!usbSupported) return;
    let cancelled = false;
    usbDeviceManager.init();
    RockchipBootromFlasher.getKnownDevices()
      .then((devs) => {
        if (!cancelled) setRockchipDevices(devs);
      })
      .catch(() => {});
    const unsubConnect = usbDeviceManager.onConnect((info) => {
      if (info.isRockchip) {
        setRockchipDevices((prev) => [
          ...prev.filter((d) => d.label !== info.label),
          info,
        ]);
      }
    });
    const unsubDisconnect = usbDeviceManager.onDisconnect((info) => {
      if (info.isRockchip) {
        setRockchipDevices((prev) => prev.filter((d) => d.label !== info.label));
      }
    });
    return () => {
      cancelled = true;
      unsubConnect();
      unsubDisconnect();
    };
  }, [usbSupported]);

  // Tear down any in-flight flash when the section unmounts (e.g. user
  // switches stacks mid-flash).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      flasherRef.current?.dispose().catch(() => {});
    };
  }, []);

  const stackLabel = stack === "ados-drone-agent" ? t("stack.drone") : t("stack.ground");

  const copyCommand = useCallback(async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write can fail in non-secure contexts. The textarea
      // below stays selectable as a manual fallback.
    }
  }, []);

  const handleScanForBoard = useCallback(async () => {
    try {
      const device = await RockchipBootromFlasher.requestDevice();
      const info = usbDeviceManager.buildDeviceInfo(device);
      setRockchipDevices((prev) => [
        ...prev.filter((d) => d.label !== info.label),
        info,
      ]);
      setStatusMessage(`Board detected: ${info.label}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") {
        setStatusMessage(
          "No board selected. Hold BOOT, plug USB-C, then try again.",
        );
      } else {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (!msg.includes("cancelled") && !msg.includes("aborted")) {
          setStatusMessage(`Detection failed: ${msg}`);
        }
      }
    }
  }, []);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    flasherRef.current?.abort();
  }, []);

  const handleFlash = useCallback(async () => {
    if (!webFlashInstall || !webFlashInstall.imageUrl) {
      toast("No image URL available for this board.", "error");
      return;
    }
    if (rockchipDevices.length === 0) {
      toast("Connect the board in bootrom mode first.", "warning");
      return;
    }

    setIsFlashing(true);
    setStatusMessage("");
    setProgress({ phase: "idle", percent: 0, message: "Preparing..." });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // 1. Download the image with progress.
      setProgress({
        phase: "bootloader_init",
        percent: 0,
        message: "Downloading image...",
      });
      const res = await fetch(webFlashInstall.imageUrl, {
        signal: abort.signal,
      });
      if (!res.ok) {
        throw new Error(`Image download failed: HTTP ${res.status}`);
      }
      const total =
        webFlashInstall.imageSizeBytes > 0
          ? webFlashInstall.imageSizeBytes
          : Number(res.headers.get("Content-Length") ?? "0");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Image response had no readable body.");
      const chunks: Uint8Array[] = [];
      let received = 0;
      // Stream the download so the progress bar stays useful for a
      // 50 MB image on a slow link.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) {
          const pct = Math.min(4, Math.floor((received / total) * 5));
          setProgress({
            phase: "bootloader_init",
            percent: pct,
            message: `Downloading image... ${(received / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB`,
            bytesWritten: received,
            bytesTotal: total,
          });
        }
      }
      const compressed = concatBytes(chunks);

      // 2. SHA-256 verification before we touch the device.
      setProgress({
        phase: "verifying",
        percent: 4,
        message: "Verifying image checksum...",
      });
      if (webFlashInstall.sha256) {
        const actual = await sha256Hex(compressed);
        if (actual.toLowerCase() !== webFlashInstall.sha256.toLowerCase()) {
          throw new Error(
            `Image checksum mismatch. Expected ${webFlashInstall.sha256}, got ${actual}.`,
          );
        }
      }

      // 3. Pick / claim the Rockchip device. Prefer one already
      //    visible; fall back to the picker.
      let device: USBDevice;
      if (rockchipDevices.length === 1) {
        device = rockchipDevices[0].device;
      } else {
        device = await RockchipBootromFlasher.requestDevice();
      }

      const flasher = new RockchipBootromFlasher(device);
      flasherRef.current = flasher;

      // 4. Prepare. Without a SoC-specific loader blob in the manifest
      //    today, prepare() will assume the device is already in
      //    loader stage. That is the right behavior for boards that
      //    ship a stock loader on eMMC; it surfaces a clear error if
      //    the device is still in pure maskrom mode and needs a blob
      //    we don't yet have.
      setProgress({
        phase: "bootloader_init",
        percent: 5,
        message: "Connecting to board...",
      });
      await flasher.prepare();

      // 5. Stream the image into eMMC.
      await flasher.flash(compressed, (p) => setProgress(p), abort.signal);

      toast("Flash complete. Unplug and re-plug the board.", "success");
    } catch (err) {
      let userMessage = err instanceof Error ? err.message : "Unknown error";
      if (err instanceof DOMException) {
        if (err.name === "NotFoundError") {
          userMessage = "No board selected. Hold BOOT, plug USB-C, then try again.";
        } else if (err.name === "SecurityError") {
          userMessage = "WebUSB blocked. Serve Mission Control over HTTPS or localhost.";
        } else if (err.name === "NetworkError") {
          userMessage = "USB device disconnected during flash. Reconnect and retry.";
        } else if (err.name === "AbortError") {
          userMessage = "Flash aborted.";
        }
      }
      if (!userMessage.toLowerCase().includes("aborted")) {
        toast("Flash failed", "error");
        setProgress({ phase: "error", percent: 0, message: userMessage });
      } else {
        setProgress({ phase: "idle", percent: 0, message: userMessage });
      }
    } finally {
      setIsFlashing(false);
      const f = flasherRef.current;
      flasherRef.current = null;
      abortRef.current = null;
      if (f) {
        f.dispose().catch(() => {});
      }
    }
  }, [webFlashInstall, rockchipDevices, toast]);

  const flashDisabled =
    isFlashing ||
    !allChecked ||
    !usbSupported ||
    !webFlashInstall ||
    !webFlashInstall.imageUrl ||
    rockchipDevices.length === 0;

  return (
    <>
      <div className="bg-bg-secondary border border-border-default p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-text-primary flex items-center gap-2">
            <HardDrive size={14} />
            {t("targetBoard.title")}
          </h2>
          <div className="flex items-center gap-3">
            {agentVersion && (
              <span className="text-[10px] text-text-tertiary">{t("targetBoard.version", { version: agentVersion })}</span>
            )}
            {loading && (
              <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                <RefreshCw size={10} className="animate-spin" /> {t("targetBoard.loadingManifest")}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="text-[10px] text-status-danger flex items-center justify-between">
            <span>{error}</span>
            <button onClick={onRetry} className="underline cursor-pointer">{t("common.retry")}</button>
          </div>
        )}

        <Select
          value={selectedBoardId}
          onChange={setSelectedBoardId}
          disabled={loading || eligibleBoards.length === 0}
          placeholder={loading ? t("targetBoard.loadingBoards") : t("targetBoard.noBoards", { stack: stackLabel })}
          searchable
          options={eligibleBoards.map((b) => ({
            value: b.id,
            label: b.label,
            description: b.soc,
          }))}
        />

        {selectedBoard && (
          <div className="text-[10px] text-text-tertiary space-y-0.5">
            <p><span className="text-text-secondary">{t("targetBoard.soc")}</span> {selectedBoard.soc} · <span className="text-text-secondary">{t("targetBoard.arch")}</span> {selectedBoard.arch}</p>
            {selectedBoard.description && <p>{selectedBoard.description}</p>}
          </div>
        )}
      </div>

      {install && install.method === "curl" && (
        <div className="bg-bg-secondary border border-border-default p-4 space-y-3">
          <h2 className="text-xs font-semibold text-text-primary flex items-center gap-2">
            <Terminal size={14} />
            {t("curl.title")}
          </h2>

          {install.notes && install.notes.length > 0 && (
            <ul className="space-y-1 text-[10px] text-text-tertiary list-disc list-inside">
              {install.notes.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          )}

          <div className="relative">
            <pre className="bg-bg-tertiary border border-border-default p-3 pr-12 text-[11px] text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {install.command}
            </pre>
            <button
              onClick={() => copyCommand(install.command)}
              className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-secondary cursor-pointer transition-colors">
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>

          <div className="flex items-start gap-2 text-[10px] text-text-tertiary">
            <Info size={11} className="mt-0.5 flex-shrink-0" />
            <p>
              {t("curl.setupHintBefore")}<code className="text-text-secondary">http://&lt;board-ip&gt;:8080</code>{t("curl.setupHintAfter")}
            </p>
          </div>
        </div>
      )}

      {webFlashInstall && (
        <div className="bg-bg-secondary border border-border-default p-4 space-y-3">
          <h2 className="text-xs font-semibold text-text-primary flex items-center gap-2">
            <Usb size={14} />
            {t("webFlash.title")}
          </h2>

          {webFlashInstall.notes && webFlashInstall.notes.length > 0 && (
            <ul className="space-y-1 text-[10px] text-text-tertiary list-disc list-inside">
              {webFlashInstall.notes.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          )}

          {webFlashInstall.imageUrl ? (
            <div className="text-[10px] text-text-tertiary space-y-1">
              <p><span className="text-text-secondary">{t("webFlash.imageSizeLabel")}</span> {(webFlashInstall.imageSizeBytes / (1024 * 1024)).toFixed(1)} MB</p>
              <p className="font-mono break-all"><span className="text-text-secondary not-italic">{t("webFlash.sha256")}</span> {webFlashInstall.sha256}</p>
            </div>
          ) : (
            <p className="text-[10px] text-status-warning">
              {t("webFlash.noImage")}
            </p>
          )}

          {/* Connection panel */}
          <RockchipConnectionPanel
            devices={rockchipDevices}
            usbSupported={usbSupported}
            isFlashing={isFlashing}
            onScan={handleScanForBoard}
          />

          {statusMessage && !progress && (
            <p className="text-[10px] text-text-tertiary font-mono">{statusMessage}</p>
          )}

          {progress && (
            <FirmwareFlashProgress
              progress={progress}
              isFlashing={isFlashing}
              onAbort={handleAbort}
            />
          )}

          <button
            onClick={handleFlash}
            disabled={flashDisabled}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold border border-accent-primary bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {isFlashing ? (
              <>
                <X size={12} /> Flashing...
              </>
            ) : (
              <>
                <Zap size={12} /> Flash via browser
              </>
            )}
          </button>

          {!allChecked && webFlashInstall.imageUrl && (
            <p className="text-[10px] text-text-tertiary">
              Confirm the safety checklist above to enable the Flash button.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ── Connection panel ─────────────────────────────────────────

function RockchipConnectionPanel({
  devices, usbSupported, isFlashing, onScan,
}: {
  devices: UsbDeviceInfo[];
  usbSupported: boolean;
  isFlashing: boolean;
  onScan: () => void;
}) {
  if (devices.length > 0) {
    return (
      <div className="border border-status-success/40 bg-status-success/5 p-3 space-y-1">
        <p className="text-[11px] text-status-success font-semibold">Board connected</p>
        <p className="text-[10px] text-text-secondary">
          {devices.map((d) => d.label).join(", ")} — ready to flash.
        </p>
      </div>
    );
  }
  return (
    <div className="border border-border-default bg-bg-tertiary p-3 space-y-2">
      <p className="text-[11px] text-text-secondary font-semibold">No board connected</p>
      <p className="text-[10px] text-text-tertiary">
        Hold the BOOT button while plugging USB-C into your computer. The board enumerates as a Rockchip USB device (vendor {hex(ROCKCHIP_USB_VID)}). Click Scan to authorize it.
      </p>
      {usbSupported && (
        <button
          onClick={onScan}
          disabled={isFlashing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Usb size={12} /> Scan for board
        </button>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer; some browsers reject views backed
  // by SharedArrayBuffer (which can occur when chunks come off a fetch
  // stream) when fed directly to subtle.digest.
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hex(n: number): string {
  return "0x" + n.toString(16).toUpperCase().padStart(4, "0");
}
