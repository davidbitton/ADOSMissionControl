"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Suppress the click-on-backdrop dismissal. The X button and the
   * Escape key still close. Defaults to false so existing modals keep
   * the standard behaviour. */
  disableBackdropClose?: boolean;
  /** When true, suppress the default `p-4` body padding so the child can
   * own its own layout (e.g. an internal flex column with its own
   * sticky header + scrollable middle + sticky footer). */
  noBodyPadding?: boolean;
  /** When true, suppress BOTH the Escape-key dismissal and the X close
   * button click. Useful while a destructive in-flight operation is
   * running (an install kickoff that's already in flight on the agent
   * shouldn't be discardable just because the dialog gets closed). The
   * backdrop click is independently gated by `disableBackdropClose`. */
  closeBlocked?: boolean;
  /** Hide the chrome title bar entirely. The child renders its own
   * header (e.g. a sticky strip with its own title + close affordance). */
  hideTitleBar?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  disableBackdropClose,
  noBodyPadding,
  closeBlocked,
  hideTitleBar,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (closeBlocked) return;
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, closeBlocked]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (disableBackdropClose || closeBlocked) return;
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={cn("bg-bg-secondary border border-border-default w-full mx-4", className)}>
        {!hideTitleBar && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <button
              onClick={() => {
                if (closeBlocked) return;
                onClose();
              }}
              disabled={closeBlocked}
              aria-disabled={closeBlocked}
              className={cn(
                "transition-colors",
                closeBlocked
                  ? "text-text-tertiary/40 cursor-not-allowed"
                  : "text-text-tertiary hover:text-text-primary",
              )}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className={noBodyPadding ? undefined : "p-4"}>{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
