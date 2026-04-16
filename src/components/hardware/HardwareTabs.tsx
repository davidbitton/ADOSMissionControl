"use client";

/**
 * @module HardwareTabs
 * @description Secondary nav for the Hardware tab: Overview, Network,
 * Physical UI, Controllers (agent-side device list + browser calibration),
 * Peripherals.
 * @license GPL-3.0-only
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABS: { href: string; key: string }[] = [
  { href: "/hardware", key: "overview" },
  { href: "/hardware/network", key: "network" },
  { href: "/hardware/ui", key: "physicalUi" },
  { href: "/hardware/controllers", key: "controllers" },
  { href: "/hardware/peripherals", key: "peripherals" },
];

export function HardwareTabs() {
  const pathname = usePathname();
  const t = useTranslations("hardware.tabs");

  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b border-border-primary/60">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-2 text-sm transition-colors border-b-2 -mb-px",
              active
                ? "border-accent-primary text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
