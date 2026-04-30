"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface InnerTab {
  label: string;
  href: string;
  /** Active when the pathname is exactly this href. */
  exact?: boolean;
}

const innerTabs: ReadonlyArray<InnerTab> = [
  { label: "Installed", href: "/settings/plugins", exact: true },
  { label: "Browse", href: "/settings/plugins/browse" },
];

export default function PluginsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  // Detail pages under `/settings/plugins/[id]` and
  // `/settings/plugins/browse/[id]` should highlight the parent tab,
  // not collapse to "Installed". Resolve activeness explicitly so the
  // Browse detail page does not flicker the Installed tab.
  const onBrowse = pathname.startsWith("/settings/plugins/browse");
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border-default bg-bg-tertiary/40 px-4">
        <nav
          className="flex gap-1"
          aria-label="Plugins section navigation"
        >
          {innerTabs.map((tab) => {
            const isActive =
              tab.href === "/settings/plugins/browse"
                ? onBrowse
                : !onBrowse;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "border-b-2 px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "border-accent-primary text-text-primary"
                    : "border-transparent text-text-tertiary hover:text-text-primary",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
