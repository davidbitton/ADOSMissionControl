"use client";

/**
 * @module HardwareSidebar
 * @description Vertical primary navigation for the Hardware tab. Eight
 * categories with optional ground-station-only entries. Collapsible to a
 * 56px icon rail. State persists to localStorage so the layout sticks
 * across page navigations and reloads.
 * @license GPL-3.0-only
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  Antenna,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  LayoutDashboard,
  MonitorSmartphone,
  Network,
  Plug,
  Radio,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGroundStationStore } from "@/stores/ground-station-store";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";

const COLLAPSE_KEY = "ados.hardware.sidebar.collapsed";

type CategoryKey =
  | "overview"
  | "network"
  | "physicalUi"
  | "controllers"
  | "edge"
  | "peripherals"
  | "distributedRx"
  | "mesh";

interface Category {
  key: CategoryKey;
  href: string;
  icon: LucideIcon;
  matchPaths: string[];
  requiresAgent: boolean;
  requiresMesh: boolean;
}

const CATEGORIES: Category[] = [
  {
    key: "overview",
    href: "/hardware",
    icon: LayoutDashboard,
    matchPaths: ["/hardware"],
    requiresAgent: false,
    requiresMesh: false,
  },
  {
    key: "network",
    href: "/hardware/network",
    icon: Wifi,
    matchPaths: ["/hardware/network"],
    requiresAgent: true,
    requiresMesh: false,
  },
  {
    key: "physicalUi",
    href: "/hardware/ui",
    icon: MonitorSmartphone,
    matchPaths: ["/hardware/ui"],
    requiresAgent: true,
    requiresMesh: false,
  },
  {
    key: "controllers",
    href: "/hardware/controllers",
    icon: Gamepad2,
    matchPaths: ["/hardware/controllers"],
    requiresAgent: false,
    requiresMesh: false,
  },
  {
    key: "edge",
    href: "/hardware/edge",
    icon: Radio,
    matchPaths: ["/hardware/edge", "/hardware/controllers/transmitter"],
    requiresAgent: false,
    requiresMesh: false,
  },
  {
    key: "peripherals",
    href: "/hardware/peripherals",
    icon: Plug,
    matchPaths: ["/hardware/peripherals"],
    requiresAgent: true,
    requiresMesh: false,
  },
  {
    key: "distributedRx",
    href: "/hardware/distributed-rx",
    icon: Antenna,
    matchPaths: ["/hardware/distributed-rx"],
    requiresAgent: true,
    requiresMesh: true,
  },
  {
    key: "mesh",
    href: "/hardware/mesh",
    icon: Network,
    matchPaths: ["/hardware/mesh"],
    requiresAgent: true,
    requiresMesh: true,
  },
];

function isActive(pathname: string, matchPaths: string[]): boolean {
  for (const path of matchPaths) {
    if (pathname === path) return true;
    if (pathname.startsWith(`${path}/`)) return true;
  }
  return false;
}

export function HardwareSidebar() {
  const pathname = usePathname();
  const t = useTranslations("hardware.tabs");
  const tSidebar = useTranslations("hardware.sidebar");

  const profile = useGroundStationStore((s) => s.status.profile);
  const meshCapable = useGroundStationStore(
    (s) => s.role.info?.mesh_capable ?? false,
  );
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const hasAgent = Boolean(agentUrl);

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  const visible = useMemo(() => {
    return CATEGORIES.filter((c) => {
      if (c.requiresMesh && !(profile === "ground_station" && meshCapable)) {
        return false;
      }
      return true;
    });
  }, [profile, meshCapable]);

  if (collapsed) {
    return (
      <aside className="flex h-full w-14 shrink-0 flex-col border-r border-border-default bg-bg-secondary">
        <div className="flex justify-center border-b border-border-default py-2">
          <button
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            title={tSidebar("expand")}
            aria-label={tSidebar("expand")}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto py-2">
          {visible.map((cat) => {
            const active = isActive(pathname, cat.matchPaths);
            const dimmed = cat.requiresAgent && !hasAgent;
            const Icon = cat.icon;
            return (
              <Link
                key={cat.key}
                href={cat.href}
                title={t(cat.key)}
                aria-label={t(cat.key)}
                className={cn(
                  "mx-auto flex h-9 w-9 items-center justify-center rounded transition-colors",
                  active
                    ? "bg-accent-primary/15 text-accent-primary"
                    : dimmed
                      ? "text-text-tertiary/60 hover:bg-bg-tertiary hover:text-text-secondary"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                )}
              >
                <Icon size={16} />
              </Link>
            );
          })}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border-default bg-bg-secondary">
      <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {tSidebar("heading")}
        </span>
        <button
          onClick={toggle}
          className="p-1 text-text-tertiary transition-colors hover:text-text-primary"
          title={tSidebar("collapse")}
          aria-label={tSidebar("collapse")}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {visible.map((cat) => {
          const active = isActive(pathname, cat.matchPaths);
          const dimmed = cat.requiresAgent && !hasAgent;
          const Icon = cat.icon;
          return (
            <Link
              key={cat.key}
              href={cat.href}
              className={cn(
                "group flex items-center gap-2.5 rounded border-l-2 px-2.5 py-2 text-sm transition-colors",
                active
                  ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                  : "border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                dimmed && !active && "opacity-60",
              )}
            >
              <Icon
                size={15}
                className={cn(
                  active ? "text-accent-primary" : "text-text-tertiary group-hover:text-text-secondary",
                )}
              />
              <span className="flex-1 truncate">{t(cat.key)}</span>
              {dimmed ? (
                <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-text-tertiary">
                  {tSidebar("localOnly")}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border-default px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-text-tertiary">
          {hasAgent ? tSidebar("agentConnected") : tSidebar("agentOffline")}
        </p>
      </div>
    </aside>
  );
}
