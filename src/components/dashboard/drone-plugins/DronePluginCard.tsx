"use client";

/**
 * @module DronePluginCard
 * @description Single plugin row inside the per-drone Plugins list.
 * Renders the plugin name + version + risk + trust badges + status
 * pill, an Enable/Disable toggle, a Configure link, and a three-dot
 * overflow menu. Enable/Disable enqueues `plugin.enable` or
 * `plugin.disable` against the drone's agent via the existing
 * `cmd_droneCommands` queue. The card stays transport-agnostic; the
 * agent picks the right transport per the management-actions matrix
 * in `product/specs/ados-plugin-system/18-ux-plugin-management.md`
 * Section 6.
 *
 * @license GPL-3.0-only
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  MoreHorizontal,
  Settings,
  Trash2,
  FileText,
  ShieldCheck,
  Power,
  RotateCw,
} from "lucide-react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { cn, isDemoMode } from "@/lib/utils";
import { RiskBadge } from "@/components/plugins/RiskBadge";
import {
  TrustBadge,
  type TrustSignal,
} from "@/components/plugins/TrustBadge";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { PluginInstallSummary } from "@/lib/plugins/types";
import { api } from "../../../../convex/_generated/api";

import {
  DronePluginStatusPill,
  type DronePluginStatusLabel,
} from "./DronePluginStatusPill";
import { UpdateAvailableBadge } from "./UpdateAvailableBadge";
import { PluginUpdateSettings } from "./PluginUpdateSettings";

export interface DronePluginCardData extends PluginInstallSummary {
  /** Convex install row id, used to drive enable/disable mutations. */
  installId: string;
  /** Cloud device id for this drone, used to enqueue commands. */
  deviceId: string;
}

interface DronePluginCardProps {
  install: DronePluginCardData;
  /** Optional class on the card root. */
  className?: string;
}

export function DronePluginCard({ install, className }: DronePluginCardProps) {
  const t = useTranslations("dronePlugins");
  const { toast } = useToast();

  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [updateSettingsOpen, setUpdateSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Convex mutations. These resolve through `api.*` to keep the
  // typed-api guard rails on. In demo mode they are not called at all.
  const enqueueCommand = useMutation(api.cmdDroneCommands.enqueueCommand);
  const setStatus = useMutation(api.cmdPlugins.setStatus);
  const removeInstall = useMutation(api.cmdPlugins.removeInstall);

  const trustSignals = useMemo<TrustSignal[]>(() => {
    const out: TrustSignal[] = [];
    if (install.source === "local_file" || install.source === "registry") {
      out.push(install.signerId ? "signed" : "unsigned");
    } else if (install.source === "builtin") {
      out.push("signed");
    }
    if (
      install.signerId &&
      /^altnautica-\d{4}-[A-Z]$/.test(install.signerId)
    ) {
      out.push("verified-publisher");
    }
    return out;
  }, [install.signerId, install.source]);

  const statusLabel: DronePluginStatusLabel =
    install.status === "running"
      ? "running"
      : install.status === "enabled"
        ? "enabled"
        : install.status === "crashed"
          ? "crashed"
          : install.status === "disabled"
            ? "disabled"
            : "installed";

  const isEnabled =
    install.status === "running" || install.status === "enabled";

  const handleToggleEnable = useCallback(async () => {
    if (isDemoMode()) {
      toast(t("demoActionDisabled"), "info");
      return;
    }
    setBusy(true);
    try {
      const nextStatus = isEnabled ? "disabled" : "enabled";
      await enqueueCommand({
        deviceId: install.deviceId,
        command: isEnabled ? "plugin.disable" : "plugin.enable",
        args: { pluginId: install.pluginId },
      });
      await setStatus({
        installId: install.installId as Id<"cmd_pluginInstalls">,
        status: nextStatus,
      });
      toast(
        isEnabled
          ? t("disableQueued", { name: install.name })
          : t("enableQueued", { name: install.name }),
        "info",
      );
    } catch (err) {
      toast(
        t("actionFailed", {
          action: isEnabled ? t("disable") : t("enable"),
          error: err instanceof Error ? err.message : String(err),
        }),
        "warning",
      );
    } finally {
      setBusy(false);
    }
  }, [
    enqueueCommand,
    install,
    isEnabled,
    setStatus,
    t,
    toast,
  ]);

  const handleOverflow = useCallback(
    async (id: string) => {
      if (id === "logs") {
        toast(t("logsPending"), "info");
        return;
      }
      if (id === "permissions") {
        toast(t("permissionsLinkPending"), "info");
        return;
      }
      if (id === "uninstall") {
        setConfirmRemoveOpen(true);
        return;
      }
    },
    [t, toast],
  );

  const handleRemove = useCallback(async () => {
    if (isDemoMode()) {
      toast(t("demoActionDisabled"), "info");
      setConfirmRemoveOpen(false);
      return;
    }
    setBusy(true);
    try {
      await enqueueCommand({
        deviceId: install.deviceId,
        command: "plugin.uninstall",
        args: { pluginId: install.pluginId },
      });
      await removeInstall({
        installId: install.installId as Id<"cmd_pluginInstalls">,
      });
      toast(t("uninstallQueued", { name: install.name }), "info");
    } catch (err) {
      toast(
        t("actionFailed", {
          action: t("uninstall"),
          error: err instanceof Error ? err.message : String(err),
        }),
        "warning",
      );
    } finally {
      setBusy(false);
      setConfirmRemoveOpen(false);
    }
  }, [enqueueCommand, install, removeInstall, t, toast]);

  return (
    <div
      data-testid={`drone-plugin-card-${install.pluginId}`}
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border-default bg-bg-secondary p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-text-primary">
              {install.name}
            </span>
            <span className="text-xs text-text-tertiary">
              v{install.version}
            </span>
          </div>
          <code className="block truncate text-xs text-text-tertiary">
            {install.pluginId}
          </code>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <UpdateAvailableBadge
            deviceId={install.deviceId}
            pluginId={install.pluginId}
            onClick={() => setUpdateSettingsOpen(true)}
          />
          <DronePluginStatusPill label={statusLabel} />
          <RiskBadge level={install.risk} size="sm" />
          {trustSignals.map((s) => (
            <TrustBadge key={s} signal={s} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant={isEnabled ? "secondary" : "primary"}
          size="sm"
          icon={
            busy ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )
          }
          disabled={busy}
          onClick={handleToggleEnable}
        >
          {isEnabled ? t("disable") : t("enable")}
        </Button>
        <Link href={`/config/plugins/${install.installId}`} passHref>
          <Button
            variant="ghost"
            size="sm"
            icon={<Settings className="h-3.5 w-3.5" />}
          >
            {t("configure")}
          </Button>
        </Link>
        <DropdownMenu
          align="right"
          trigger={
            <Button
              variant="ghost"
              size="sm"
              icon={<MoreHorizontal className="h-3.5 w-3.5" />}
            />
          }
          items={[
            {
              id: "logs",
              label: t("viewLogs"),
              icon: <FileText className="h-3.5 w-3.5" />,
            },
            {
              id: "permissions",
              label: t("viewPermissions"),
              icon: <ShieldCheck className="h-3.5 w-3.5" />,
            },
            { id: "divider", label: "", divider: true },
            {
              id: "uninstall",
              label: t("uninstall"),
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
            },
          ]}
          onSelect={handleOverflow}
        />
      </div>

      <ConfirmDialog
        open={confirmRemoveOpen}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemoveOpen(false)}
        title={t("uninstallConfirmTitle")}
        message={t("uninstallConfirmMessage", { name: install.name })}
        confirmLabel={t("uninstall")}
        variant="danger"
      />

      {updateSettingsOpen ? (
        <PluginUpdateSettings
          deviceId={install.deviceId}
          pluginId={install.pluginId}
          pluginName={install.name}
          currentVersion={install.version}
          autoUpdate={true}
          pinnedVersion={null}
          lastUpdateCheckAt={null}
          onClose={() => setUpdateSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

