/**
 * @module SettingsRouteError
 * @description Per-segment error boundary for `/settings/*`. Catches
 * unhandled exceptions inside any settings child route and renders an
 * inline recovery card without unmounting the parent settings layout
 * (top tabs, header). Falls back to the global `app/error.tsx` only
 * when an error escapes this boundary too.
 * @license GPL-3.0-only
 */

"use client";

import { useEffect } from "react";

export default function SettingsRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[settings-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center p-8 min-h-[40vh]">
      <div className="max-w-md w-full text-center space-y-3">
        <div className="text-3xl">⚠</div>
        <h2 className="text-base font-semibold text-text-primary">
          Settings ran into a problem
        </h2>
        <p className="text-sm text-text-secondary">
          {error.message || "Unexpected error in this settings page."}
        </p>
        <button
          onClick={reset}
          className="px-3 py-1.5 text-sm font-medium bg-accent-primary text-bg-primary rounded hover:bg-accent-primary/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
