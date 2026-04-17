"use client";

/**
 * @module MeshToastBridge
 * @description Subscribes to the mesh + pairing event stream and fires
 * toast notifications for transient changes the operator should notice:
 * receiver unreachable, gateway failover, mesh partitioned, relay revoked.
 * Mounted once at the app shell level so toasts surface from any tab.
 * @license GPL-3.0-only
 */

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/toast";
import { useGroundStationStore } from "@/stores/ground-station-store";

const RECENT_DEDUP_MS = 1500;

export function MeshToastBridge() {
  const t = useTranslations("toast.mesh");
  const { toast } = useToast();
  const meshHealth = useGroundStationStore((s) => s.mesh.health);
  const selectedGateway = useGroundStationStore((s) => s.mesh.selectedGateway);

  const partitionedRef = useRef<boolean>(false);
  const gatewayRef = useRef<string | null>(null);
  const lastTransientTsRef = useRef<number>(0);
  const lastFireRef = useRef<Record<string, number>>({});
  const lastTransient = useGroundStationStore((s) => s.mesh.lastTransientEvent);

  const fire = (key: string, message: string, status: "warning" | "info" | "error") => {
    const now = Date.now();
    if (lastFireRef.current[key] && now - lastFireRef.current[key] < RECENT_DEDUP_MS) {
      return;
    }
    lastFireRef.current[key] = now;
    toast(message, status);
  };

  // Partition status transitions.
  useEffect(() => {
    if (!meshHealth) return;
    if (meshHealth.partition && !partitionedRef.current) {
      fire("partitioned", t("partitioned"), "error");
    }
    partitionedRef.current = meshHealth.partition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshHealth?.partition]);

  // Gateway failover transitions.
  useEffect(() => {
    if (selectedGateway === gatewayRef.current) return;
    const previous = gatewayRef.current;
    gatewayRef.current = selectedGateway;
    if (previous && selectedGateway && previous !== selectedGateway) {
      fire(
        `gw-${selectedGateway}`,
        t("gatewayFailover", { to: selectedGateway }),
        "info",
      );
    }
  }, [selectedGateway, t]);

  // Transient toast-worthy events (receiver_unreachable, relay_revoked).
  useEffect(() => {
    if (!lastTransient) return;
    if (lastTransient.ts <= lastTransientTsRef.current) return;
    lastTransientTsRef.current = lastTransient.ts;
    if (lastTransient.kind === "receiver_unreachable") {
      const last = (lastTransient.payload?.last_receiver as string) || "";
      fire(
        `recv-unreachable-${lastTransient.ts}`,
        t("receiverUnreachable", { id: last || "?" }),
        "warning",
      );
    } else if (lastTransient.kind === "relay_revoked") {
      const id = (lastTransient.payload?.device_id as string) || "?";
      fire(
        `relay-revoked-${lastTransient.ts}`,
        t("relayRevoked", { id }),
        "info",
      );
    } else if (lastTransient.kind === "relay_disconnected") {
      const id = (lastTransient.payload?.relay_mac as string) || "?";
      fire(
        `relay-down-${lastTransient.ts}`,
        t("relayDisconnected", { id }),
        "warning",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTransient]);

  return null;
}
