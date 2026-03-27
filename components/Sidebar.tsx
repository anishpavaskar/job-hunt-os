"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { ShellSummary } from "@/lib/web/types";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Today",
    description: "Daily briefing",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4.5 1.5v2M9.5 1.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M1.5 6h11" stroke="currentColor" strokeWidth="1.2" />
        <rect x="4.5" y="8.5" width="2" height="2" rx="0.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/roles",
    label: "Roles",
    description: "Job table",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M1.5 5h11M5 1.5v11" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7.5 7.5h2.5M7.5 9.5h1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    description: "Applications",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="2.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="2.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="11.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 4h3.5L11.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 10h3.5L11.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/analytics",
    label: "Analytics",
    description: "Stats & funnel",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M1.5 12h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M3.5 12V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7 12V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M10.5 12V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M2.5 6.5L5 4.5L8 6L12 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

interface SidebarProps {
  summary: ShellSummary;
  statusLabel: string;
}

export function Sidebar({ summary, statusLabel }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 bg-surface border-r border-edge flex flex-col">
      {/* Nav section label */}
      <div className="pt-4 pb-1 px-5">
        <span className="font-mono text-[10px] text-fg-4 uppercase tracking-widest">
          Views
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 pb-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href + "/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group relative flex items-center gap-3 px-3 py-2 rounded-sm transition-colors duration-100",
                isActive
                  ? "bg-surface-2 text-fg"
                  : "text-fg-2 hover:bg-surface-2/60 hover:text-fg",
              ].join(" ")}
            >
              {/* Active left-accent bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-blue rounded-r-full" />
              )}

              <span
                className={[
                  "transition-colors duration-100",
                  isActive ? "text-blue" : "text-fg-3 group-hover:text-fg-2",
                ].join(" ")}
              >
                {item.icon}
              </span>

              <span className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium leading-none">
                  {item.label}
                </span>
                <span className="mt-0.5 font-mono text-[10px] text-fg-3 leading-none">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: last sync */}
      <div className="border-t border-edge px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-fg-3 uppercase tracking-wider">
            Last sync
          </span>
          <span className="font-mono text-[10px] text-fg-3">{statusLabel}</span>
        </div>

        <div className="mt-3 flex flex-col gap-1.5 font-mono text-[10px] text-fg-3">
          <div className="flex items-center justify-between">
            <span>sources scanned</span>
            <span className="text-fg tabular-nums">{summary.sourcesScanned}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>follow-ups due</span>
            <span className="text-fg tabular-nums">{summary.followupsDue}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>drafts pending</span>
            <span className="text-fg tabular-nums">{summary.draftsPending}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
