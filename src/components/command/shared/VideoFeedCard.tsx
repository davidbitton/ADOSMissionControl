"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  CameraOff,
  Maximize2,
  Minimize2,
  Loader2,
  RefreshCw,
  Camera,
  Circle,
  Square,
  PictureInPicture2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/stores/video-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
// Static import for webrtc-client. Dynamic
// imports inside useEffect were causing Turbopack to HMR-reload the
// module on every unrelated edit, wiping module-level stats state and
// orphaning the active RTCPeerConnection. Static import puts the module
// in the parent's import graph so HMR only invalidates it on direct
// edits to webrtc-client.ts itself.
import {
  setVideoElement,
  captureScreenshot,
  startRecording,
  stopRecording,
} from "@/lib/video/webrtc-client";
// Cascade hook + interactive transport switcher.
// Replaces the inline transport-selection useEffect that previously lived
// in this component.
import { useVideoTransportCascade } from "@/hooks/use-video-transport-cascade";
import { VideoTransportSwitcher } from "./VideoTransportSwitcher";
import { VideoLatencyBreakdown } from "./VideoLatencyBreakdown";
import { useVideoLatencyPoll } from "@/hooks/use-video-latency-poll";
import { useDroneClockOffset } from "@/hooks/use-drone-clock-offset";

interface VideoFeedCardProps {
  className?: string;
  onPopOut?: () => void;
}

// Auto-recovery backoff. The base delay doubles per attempt and is
// clamped at the ceiling, then keeps retrying at the ceiling forever — a
// stalled link that comes back hours later still reconnects without any
// operator action. There is no attempt cap: silently giving up leaves the
// operator staring at a frozen frame with no indication anything is wrong.
const RETRY_BASE_DELAY_SEC = 3;
const RETRY_MAX_DELAY_SEC = 30;

export function VideoFeedCard({ className, onPopOut }: VideoFeedCardProps) {
  const agentWhepUrl = useVideoStore((s) => s.agentWhepUrl);
  const agentVideoState = useVideoStore((s) => s.agentVideoState);
  const isStreaming = useVideoStore((s) => s.isStreaming);
  const fps = useVideoStore((s) => s.fps);
  const latencyMs = useVideoStore((s) => s.latencyMs);
  const resolution = useVideoStore((s) => s.resolution);
  // Extended stats + transport indicator
  const codec = useVideoStore((s) => s.codec);
  const bitrateKbps = useVideoStore((s) => s.bitrateKbps);
  const packetsLost = useVideoStore((s) => s.packetsLost);
  const isRecording = useVideoStore((s) => s.isRecording);
  // Rich breakdown — used in the bottom strip chip and the popover.
  const airLatencyMs = useVideoStore((s) => s.latency.airLatencyMs);
  const trueG2GMs = useVideoStore((s) => s.latency.trueG2GMs);
  const cloudDeviceId = useAgentConnectionStore((s) => s.cloudDeviceId);
  // Frozen-stream signal from the stats watchdog. A bump means the active
  // stream silently stalled while still "connected"; drive auto-recovery.
  const videoStallSignal = useVideoStore((s) => s.videoStallSignal);
  // User transport preference (persisted to IndexedDB)
  const transportMode = useSettingsStore((s) => s.videoTransportMode);

  // Air-side SEI poll (1Hz) + drone↔browser clock-offset poll (30s).
  // Both are no-ops when the agent isn't paired / video isn't running,
  // and they synthesise values in demo mode so the popover always
  // renders.
  useVideoLatencyPoll();
  useDroneClockOffset();

  // Callback ref for the video element. The previous useRef-only pattern
  // caused the cascade hook to receive `videoEl: null` on first render
  // and never re-trigger when the ref attached, because refs don't cause
  // re-renders. The callback ref calls setState when the element mounts,
  // which DOES trigger a re-render and lets the cascade hook see the
  // element on the next pass.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);
  const [retryKey, setRetryKey] = useState(0);

  // Exponential backoff state. Tracks how many automatic retries have
  // happened since last successful connect or user action. Manual retry
  // resets the counter.
  const retryAttemptRef = useRef(0);
  const [retryDelaySec, setRetryDelaySec] = useState(0);

  const handleRetry = useCallback(() => {
    retryAttemptRef.current = 0;
    setRetryDelaySec(0);
    setRetryKey((k) => k + 1);
  }, []);

  // Video action buttons. The actual capture/record/PiP logic already
  // exists in webrtc-client.ts (captureScreenshot, startRecording,
  // stopRecording). These handlers just wire UI buttons to those helpers
  // and add fullscreen / picture-in-picture using the standard browser
  // APIs on the underlying <video> element.

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Listen for fullscreenchange events so we keep our state in sync if the
  // user presses ESC or otherwise exits fullscreen outside our buttons.
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleSnapshot = useCallback(() => {
    try {
      captureScreenshot();
    } catch (err) {
      console.warn("[VideoFeedCard] snapshot failed", err);
    }
  }, []);

  const handleRecordToggle = useCallback(() => {
    try {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    } catch (err) {
      console.warn("[VideoFeedCard] record toggle failed", err);
    }
  }, [isRecording]);

  const handleFullscreenToggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      console.warn("[VideoFeedCard] fullscreen toggle failed", err);
    }
  }, []);

  const handlePip = useCallback(async () => {
    if (!videoEl) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoEl.requestPictureInPicture) {
        await videoEl.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("[VideoFeedCard] picture-in-picture failed", err);
    }
  }, [videoEl]);

  // Bind the video element to the webrtc-client helper
  // (used by snapshot/recording). Re-binds when the element changes.
  useEffect(() => {
    setVideoElement(videoEl);
    return () => setVideoElement(null);
  }, [videoEl]);

  // Live-edge catch-up removed: WebRTC manages its own playout timing via
  // the jitter buffer. The previous timer did video.currentTime seeks and
  // playbackRate changes that broke the H.264 decoder chain, causing video
  // freezes. mediamtx's built-in test page (no catchup logic) streams
  // indefinitely without issues — confirming the timer was the problem.

  // Stabilize the enabled flag so a single flaky agent poll doesn't kill
  // a healthy WebRTC session. Requires 3 consecutive non-"running" polls
  // (~9 seconds at 3s interval) before disabling the cascade. A single
  // transient mediamtx probe timeout on the agent was causing
  // agentVideoState to flap "running" → "not_initialized" → "running",
  // which triggered the cascade cleanup (stopStream + srcObject=null)
  // every time, destroying a perfectly healthy WebRTC connection.
  const nonRunningCountRef = useRef(0);
  const stableEnabled = useMemo(() => {
    if (agentVideoState === "running") {
      nonRunningCountRef.current = 0;
      return true;
    }
    nonRunningCountRef.current += 1;
    return nonRunningCountRef.current < 3;
  }, [agentVideoState]);

  // Cascade hook owns all transport selection + connection logic. The
  // hook respects the user's `transportMode` preference: in Auto mode it
  // cascades LAN → P2P MQTT, in pinned mode it tries only that mode.
  // Cloud WHEP / Cloud MSE are deferred.
  const cascade = useVideoTransportCascade({
    agentWhepUrl,
    cloudDeviceId,
    transportMode,
    videoEl,
    retryKey,
    enabled: stableEnabled,
  });

  // Reset the backoff counter on a healthy connect or manual retry.
  useEffect(() => {
    if (cascade.state === "connected") {
      retryAttemptRef.current = 0;
      setRetryDelaySec(0);
    }
  }, [cascade.state]);

  // The frozen-stream watchdog raised the stall signal: the link looked
  // "connected" but stopped delivering frames. Re-cascade immediately so
  // the WHEP offer is re-fetched (WHEP cannot renegotiate in place). The
  // re-cascade either reconnects (resetting the backoff) or transitions
  // to "failed", which the indefinite-retry effect below then handles.
  const lastHandledStallRef = useRef(videoStallSignal);
  useEffect(() => {
    if (videoStallSignal === lastHandledStallRef.current) return;
    lastHandledStallRef.current = videoStallSignal;
    if (agentVideoState !== "running") return;
    setRetryDelaySec(0);
    setRetryKey((k) => k + 1);
  }, [videoStallSignal, agentVideoState]);

  // Indefinite auto-retry with exponential backoff capped at the ceiling.
  // Never stops while the agent reports the video service running, so the
  // feed self-heals whenever the link recovers. Manual retry resets the
  // attempt counter to start the backoff over from the base delay.
  useEffect(() => {
    if (cascade.state !== "failed" || agentVideoState !== "running") {
      return;
    }
    const attempt = retryAttemptRef.current;
    const delaySec = Math.min(
      RETRY_BASE_DELAY_SEC * Math.pow(2, attempt),
      RETRY_MAX_DELAY_SEC,
    );
    setRetryDelaySec(delaySec);
    const retryHandle = setTimeout(() => {
      retryAttemptRef.current += 1;
      setRetryDelaySec(0);
      setRetryKey((k) => k + 1);
    }, delaySec * 1000);
    return () => {
      clearTimeout(retryHandle);
    };
  }, [cascade.state, agentVideoState]);

  const hasVideo = isStreaming;
  const showConnecting = cascade.state === "connecting" || agentVideoState === "starting";
  const showNoSignal = !hasVideo && !showConnecting && cascade.state !== "failed";
  const error = cascade.state === "failed" ? cascade.error : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative border border-border-default rounded-lg overflow-hidden bg-bg-secondary",
        // In fullscreen the container expands to fill the
        // screen; switch to flex layout so the 16:9 aspect inner div can
        // scale up properly.
        isFullscreen && "flex items-center justify-center bg-black",
        className
      )}
    >
      {/* 16:9 aspect ratio container */}
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        {/* Video element (always rendered, hidden when no signal) */}
        <video
          ref={setVideoRef}
          autoPlay
          muted
          playsInline
          className={cn(
            "absolute inset-0 w-full h-full object-cover bg-black",
            !hasVideo && "hidden"
          )}
        />

        {/* Interactive transport switcher (always rendered, not gated on
            hasVideo so users can pin a mode before video starts). Surfaces
            agentVideoState so the dropdown can show "Agent video stopped"
            instead of a misleading mode label. Surfaces retryDelaySec so
            the pill can show "retrying in Xs" instead of flickering between
            FAILED and CONNECTING. */}
        <VideoTransportSwitcher
          activeTransport={cascade.activeTransport}
          cascadeState={cascade.state}
          cascadeError={cascade.error}
          onRetry={handleRetry}
          hasPairedAgent={!!cloudDeviceId}
          hasLanWhep={!!agentWhepUrl}
          agentVideoState={agentVideoState}
          retryDelaySec={retryDelaySec}
        />


        {/* Video stats overlay (bottom) with codec, bitrate, packet loss
            when available. The latency chip is the trigger for the
            breakdown popover; hover/click expands the full attribution
            (capture, encode, network, decode, present). Color bucket is
            computed over the largest available value so an unhealthy
            air leg can't be masked by a healthy link leg. */}
        {hasVideo && (() => {
          const link = latencyMs;
          const air =
            airLatencyMs != null && airLatencyMs > 0
              ? Math.round(airLatencyMs)
              : null;
          const g2g =
            trueG2GMs != null && trueG2GMs > 0
              ? Math.round(trueG2GMs)
              : null;
          const worst = Math.max(link, air ?? 0, g2g ?? 0);
          const colorClass =
            worst === 0
              ? "text-text-tertiary"
              : worst < 100
                ? "text-green-400"
                : worst < 300
                  ? "text-yellow-400"
                  : worst < 600
                    ? "text-orange-400"
                    : "text-red-400";
          return (
            <div className="absolute bottom-0 left-0 right-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-1 bg-black/60 backdrop-blur-sm text-[10px] font-mono text-text-secondary">
              <span>{fps > 0 ? `${fps} FPS` : "-- FPS"}</span>
              <VideoLatencyBreakdown
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-1 -mx-1",
                  "hover:bg-white/5 transition-colors",
                  colorClass,
                )}
              >
                <span>{link > 0 ? `LINK ${link}ms` : "LINK --"}</span>
                {air !== null && (
                  <span className="text-text-tertiary">
                    \u00B7 AIR <span className={colorClass}>{air}ms</span>
                  </span>
                )}
                {g2g !== null && (
                  <span className="text-text-tertiary">
                    \u00B7 G2G <span className={colorClass}>{g2g}ms</span>
                  </span>
                )}
              </VideoLatencyBreakdown>
              <span>{resolution || "--\u00D7--"}</span>
              {codec && <span className="text-text-tertiary">{codec}</span>}
              {bitrateKbps > 0 && (
                <span className="text-text-tertiary">
                  {bitrateKbps >= 1000
                    ? `${(bitrateKbps / 1000).toFixed(1)} Mbps`
                    : `${bitrateKbps} kbps`}
                </span>
              )}
              {packetsLost > 0 && (
                <span className="text-orange-400">{packetsLost} pkts lost</span>
              )}
            </div>
          );
        })()}

        {/* No signal placeholder — z-10 so transport switcher (z-20) stays on top */}
        {showNoSignal && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0a0a0f]">
            <CameraOff className="w-8 h-8 text-text-tertiary" />
            <span className="text-xs text-text-tertiary font-mono tracking-widest">
              NO SIGNAL
            </span>
          </div>
        )}

        {/* Connecting state — z-10 so transport switcher (z-20) stays on top */}
        {showConnecting && !hasVideo && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0a0a0f]">
            <Loader2 className="w-6 h-6 text-accent-primary animate-spin" />
            <span className="text-xs text-text-tertiary font-mono tracking-widest">
              CONNECTING...
            </span>
          </div>
        )}

        {/* Error state with retry — z-10 so the transport switcher
            (z-20) stays clickable on top of this overlay. */}
        {error && !hasVideo && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0a0a0f]">
            <CameraOff className="w-8 h-8 text-status-error" />
            <span className="text-xs text-status-error font-mono">
              {error}
            </span>
            <button
              onClick={handleRetry}
              className="mt-1 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-text-secondary bg-white/10 hover:bg-white/20 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              RETRY
            </button>
          </div>
        )}

      </div>

      {/* REC indicator (top-center, inside the video frame) */}
      {hasVideo && isRecording && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-mono font-semibold text-red-400 tracking-widest">
            REC
          </span>
        </div>
      )}

      {/* Top-right action buttons: snapshot, record, PiP, fullscreen,
          reconnect, popout. */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {hasVideo && (
          <>
            <button
              onClick={handleSnapshot}
              className="p-1 rounded bg-black/50 hover:bg-black/70 text-text-tertiary hover:text-text-primary transition-colors"
              title="Capture screenshot"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRecordToggle}
              className={cn(
                "p-1 rounded bg-black/50 hover:bg-black/70 transition-colors",
                isRecording
                  ? "text-red-400 hover:text-red-300"
                  : "text-text-tertiary hover:text-text-primary"
              )}
              title={isRecording ? "Stop recording" : "Start recording"}
            >
              {isRecording ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Circle className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={handlePip}
              className="p-1 rounded bg-black/50 hover:bg-black/70 text-text-tertiary hover:text-text-primary transition-colors"
              title="Picture in picture"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFullscreenToggle}
              className="p-1 rounded bg-black/50 hover:bg-black/70 text-text-tertiary hover:text-text-primary transition-colors"
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </>
        )}
        <button
          onClick={handleRetry}
          className="p-1 rounded bg-black/50 hover:bg-black/70 text-text-tertiary hover:text-text-primary transition-colors"
          title="Reconnect video"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        {onPopOut && (
          <button
            onClick={onPopOut}
            className="p-1 rounded bg-black/50 hover:bg-black/70 text-text-tertiary hover:text-text-primary transition-colors"
            title="Pop out video"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
