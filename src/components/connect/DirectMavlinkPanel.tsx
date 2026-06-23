/**
 * @module DirectMavlinkPanel
 * @description The "Flight Controller (Direct MAVLink)" column of the unified
 * Connect dialog: USB Serial / WebSocket / Bluetooth transports, the
 * connect-new vs add-link mode toggle, save-preset, saved presets, and recent
 * connections. Connects straight to a flight controller over MAVLink (no
 * companion agent).
 * @license GPL-3.0-only
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SerialPanel } from "@/components/connect/SerialPanel";
import { WebSocketPanel } from "@/components/connect/WebSocketPanel";
import { BluetoothPanel } from "@/components/connect/BluetoothPanel";
import { BluetoothTransport } from "@/lib/protocol/transport/ble";
import { ConnectionPresets } from "@/components/connect/ConnectionPresets";
import { RecentConnections } from "@/components/connect/RecentConnections";
import { useDroneManager } from "@/stores/drone-manager";
import { saveRecentConnection } from "@/lib/recent-connections";
import { savePreset, type ConnectionPreset } from "@/lib/connection-presets";
import { randomId } from "@/lib/utils";
import { Usb, Zap, Save, Star, History } from "lucide-react";

export function DirectMavlinkPanel({
  onClose,
  onConnectSuccess,
}: {
  onClose: () => void;
  /** Called after a successful serial/WebSocket/Bluetooth connect (or multi-link attach). */
  onConnectSuccess?: () => void;
}) {
  const t = useTranslations("connect");
  const droneCount = useDroneManager((s) => s.drones.size);
  const drones = useDroneManager((s) => s.drones);
  const router = useRouter();

  const CONNECTION_TABS = [
    { id: "serial", label: t("usbSerial") },
    { id: "websocket", label: t("webSocket") },
    ...(BluetoothTransport.isSupported() ? [{ id: "bluetooth", label: "Bluetooth" }] : []),
  ];

  const [tab, setTab] = useState("serial");
  const [presetsKey, setPresetsKey] = useState(0);
  const [dfuDetected, setDfuDetected] = useState(false);
  const [serialBaudRate, setSerialBaudRate] = useState(115200);
  const [websocketUrl, setWebsocketUrl] = useState("ws://localhost:14550");
  const [connectMode, setConnectMode] = useState<"new" | "link">("new");
  const [selectedTargetDroneId, setSelectedTargetDroneId] = useState<string | null>(null);

  // Reset link target when no drones remain.
  useEffect(() => {
    if (drones.size === 0) {
      setConnectMode("new");
      setSelectedTargetDroneId(null);
    }
  }, [drones.size]);

  // DFU hot-plug detection.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("usb" in navigator)) return;
    if (typeof window !== "undefined" && !window.isSecureContext) return;

    const checkDfu = () => {
      navigator.usb
        .getDevices()
        .then((devices) => {
          const hasDfu = devices.some(
            (d) =>
              (d.vendorId === 0x0483 && d.productId === 0xdf11) ||
              (d.vendorId === 0x2e3c && d.productId === 0x0788) ||
              (d.vendorId === 0x29ac && d.productId === 0x0003) ||
              (d.vendorId === 0x2b04 && d.productId === 0xd058),
          );
          setDfuDetected(hasDfu);
        })
        .catch(() => {});
    };

    checkDfu();

    const onConnect = () => checkDfu();
    const onDisconnect = () => checkDfu();
    navigator.usb.addEventListener("connect", onConnect);
    navigator.usb.addEventListener("disconnect", onDisconnect);
    return () => {
      navigator.usb.removeEventListener("connect", onConnect);
      navigator.usb.removeEventListener("disconnect", onDisconnect);
    };
  }, []);

  const handleConnected = useCallback(
    (name: string, type: "serial" | "websocket" | "ble", detail: string | number) => {
      if (type === "serial" || type === "websocket") {
        void saveRecentConnection({
          type,
          name,
          date: Date.now(),
          ...(type === "serial"
            ? { baudRate: detail as number }
            : { url: detail as string }),
        });
      }
      onConnectSuccess?.();
    },
    [onConnectSuccess],
  );

  function handleSerialConnected(name: string, _type: "serial", baudRate: number) {
    handleConnected(name, "serial", baudRate);
  }

  function handleWsConnected(name: string, _type: "websocket", url: string) {
    handleConnected(name, "websocket", url);
  }

  function handleBleConnected(name: string, _type: "ble", deviceName: string) {
    handleConnected(name, "ble", deviceName);
  }

  async function handleSavePreset() {
    const presetName = prompt("Preset name:");
    if (!presetName) return;

    const preset: ConnectionPreset = {
      id: randomId(),
      name: presetName,
      type: tab as "serial" | "websocket",
      config:
        tab === "serial" ? { baudRate: serialBaudRate } : { url: websocketUrl },
      createdAt: Date.now(),
    };
    await savePreset(preset);
    setPresetsKey((k) => k + 1);
  }

  function handleApplyPreset(preset: ConnectionPreset) {
    setTab(preset.type);
    if (preset.type === "serial" && preset.config.baudRate) {
      setSerialBaudRate(preset.config.baudRate);
    }
    if (preset.type === "websocket" && preset.config.url) {
      setWebsocketUrl(preset.config.url);
    }
  }

  function handleGoToFirmware() {
    onClose();
    router.push("/config/firmware");
  }

  return (
    <div className="space-y-4">
      {/* DFU banner */}
      {dfuDetected && (
        <div className="bg-accent-primary/10 border border-accent-primary/30 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Usb size={14} className="text-accent-primary" />
            <span className="text-xs text-text-primary">{t("dfuDetected")}</span>
          </div>
          <button
            onClick={handleGoToFirmware}
            className="flex items-center gap-1 text-xs text-accent-primary hover:underline shrink-0"
          >
            <Zap size={12} />
            {t("goToFirmware")}
          </button>
        </div>
      )}

      {/* Mode toggle (only when at least one drone is connected) */}
      {droneCount > 0 && (
        <div className="border border-border-default p-3 space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="connect-mode"
                checked={connectMode === "new"}
                onChange={() => {
                  setConnectMode("new");
                  setSelectedTargetDroneId(null);
                }}
                className="accent-accent-primary"
              />
              <span className="text-text-secondary">Connect new drone</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="connect-mode"
                checked={connectMode === "link"}
                onChange={() => setConnectMode("link")}
                className="accent-accent-primary"
              />
              <span className="text-text-secondary">Add link to existing drone</span>
            </label>
          </div>
          {connectMode === "link" && (
            <div className="pt-2">
              <label className="text-[10px] text-text-tertiary uppercase tracking-wider block mb-1">
                Target drone (sysid match required)
              </label>
              <select
                value={selectedTargetDroneId ?? ""}
                onChange={(e) => setSelectedTargetDroneId(e.target.value || null)}
                className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border-default rounded text-text-primary outline-none focus:border-accent-primary"
              >
                <option value="">— Select drone —</option>
                {Array.from(drones.values()).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (sysid {d.vehicleInfo.systemId})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-text-tertiary mt-1">
                The new transport must reach the same sysid as the selected drone, otherwise it will be rejected.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Connection tabs */}
      <div className="border border-border-default">
        <div className="flex items-center justify-between border-b border-border-default px-4">
          <Tabs
            tabs={CONNECTION_TABS}
            activeTab={tab}
            onChange={setTab}
            className="border-b-0"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Save size={12} />}
            onClick={handleSavePreset}
          >
            {t("savePreset")}
          </Button>
        </div>
        <div className="p-4">
          {tab === "serial" ? (
            <SerialPanel
              onConnected={handleSerialConnected}
              baudRate={serialBaudRate}
              onBaudRateChange={setSerialBaudRate}
              targetDroneId={connectMode === "link" ? selectedTargetDroneId : null}
            />
          ) : tab === "websocket" ? (
            <WebSocketPanel
              onConnected={handleWsConnected}
              url={websocketUrl}
              onUrlChange={setWebsocketUrl}
              targetDroneId={connectMode === "link" ? selectedTargetDroneId : null}
            />
          ) : tab === "bluetooth" ? (
            <BluetoothPanel
              onConnected={handleBleConnected}
              targetDroneId={connectMode === "link" ? selectedTargetDroneId : null}
            />
          ) : null}
        </div>
      </div>

      {/* Presets + Recent */}
      <div className="border border-border-default p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-accent-secondary" />
          <h3 className="text-xs font-semibold text-text-primary">
            {t("savedPresets")}
          </h3>
        </div>
        <ConnectionPresets key={presetsKey} onApply={handleApplyPreset} />
      </div>
      <div className="border border-border-default p-3 space-y-2">
        <div className="flex items-center gap-2">
          <History size={14} className="text-text-secondary" />
          <h3 className="text-xs font-semibold text-text-primary">
            {t("recentConnections")}
          </h3>
        </div>
        <RecentConnections />
      </div>
    </div>
  );
}
