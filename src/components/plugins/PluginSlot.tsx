"use client";

import { useTranslations } from "next-intl";

import { useToast } from "@/components/ui/toast";
import { slotToCapability, type PluginSlotName } from "@/lib/plugins/types";

import {
  useSlotContributions,
  type PluginSlotContribution,
} from "./PluginHostProvider";
import { PluginIframeHost } from "./PluginIframeHost";

// Module-scoped dedupe set so the operator sees one toast per
// (plugin, slot) pair across the whole session. Without this the
// same denial would re-fire on every render of the host page.
const droppedNotified = new Set<string>();

interface PluginSlotProps {
  name: PluginSlotName;
  /**
   * Optional explicit contributions list. When omitted, the slot
   * reads from the surrounding `<PluginHostProvider>`. Tests and
   * Storybook stories pass the list directly to skip the context.
   */
  contributions?: ReadonlyArray<PluginSlotContribution>;
  /**
   * Optional fallback when no plugin contributes to this slot. Hosts
   * pass operator-relevant copy; the slot itself stays mute by default.
   */
  emptyState?: React.ReactNode;
  /** Class applied to the wrapper around the iframe stack. */
  className?: string;
  /** Class applied to each iframe child. Slot owners control sizing. */
  iframeClassName?: string;
  /**
   * Optional security-event sink, forwarded to every iframe host the
   * slot mounts. Caller typically writes these to the plugin events
   * log so denial telemetry stays visible.
   */
  onSecurityEvent?: React.ComponentProps<
    typeof PluginIframeHost
  >["onSecurityEvent"];
}

/**
 * Mount point for plugin contributions at a well-known slot. Wires
 * each contribution to its own sandboxed `<PluginIframeHost>`. The
 * slot is presentational: contributions flow in from the provider
 * (or via the `contributions` prop for testing).
 */
export function PluginSlot({
  name,
  contributions,
  emptyState,
  className,
  iframeClassName,
  onSecurityEvent,
}: PluginSlotProps) {
  const t = useTranslations("plugins");
  const { toast } = useToast();
  const fromContext = useSlotContributions(name);
  const raw = contributions ?? fromContext;
  // Capability gate: a contribution can only mount when its
  // grantedCapabilities include the slot's matching ui.slot.<id>
  // capability. Contributions that fail the check are dropped
  // silently with a console warning, and the operator gets a
  // one-shot toast per (plugin, slot) so the denial does not
  // disappear into the dev console. Plugins missing the cap
  // never had it granted at install time, so the install record
  // is the source of truth.
  const requiredCap = slotToCapability(name);
  const list = raw.filter((c) => {
    if (c.grantedCapabilities.has(requiredCap)) return true;
    if (typeof console !== "undefined") {
      console.warn(
        `Plugin ${c.pluginId} cannot mount in slot ${name}: missing ${requiredCap}`,
      );
    }
    const key = `${c.pluginId}::${name}`;
    if (!droppedNotified.has(key)) {
      droppedNotified.add(key);
      toast(
        t("slotDroppedToast", { name: c.pluginId, slot: name }),
        "warning",
      );
    }
    return false;
  });
  if (list.length === 0) return <>{emptyState}</>;
  return (
    <div data-plugin-slot={name} className={className}>
      {list.map((c) => (
        <PluginIframeHost
          key={`${c.pluginId}::${c.panelId}`}
          pluginId={c.pluginId}
          slot={name}
          bundleUrl={c.bundleUrl}
          grantedCapabilities={c.grantedCapabilities}
          handlers={c.handlers}
          themeVars={c.themeVars}
          title={c.title ?? `${c.pluginId} ${c.panelId}`}
          className={c.iframeClassName ?? iframeClassName}
          onSecurityEvent={onSecurityEvent}
        />
      ))}
    </div>
  );
}
