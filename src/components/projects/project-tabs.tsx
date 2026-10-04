"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "tasks", label: "Tasks" },
  { slug: "timeline", label: "Timeline" },
  { slug: "logs", label: "Logs" },
  { slug: "remarks", label: "Remarks" },
  { slug: "files", label: "Files" },
  { slug: "blockers", label: "Blockers" },
  { slug: "decisions", label: "Decisions" },
];

/**
 * Project sections. `unlocked` (slugs) lists the tabs that have had something in
 * them; the rest wait under "More" until they do (calm redesign spec, Phase 03).
 */
export function ProjectTabs({ projectId, counts, unlocked }: { projectId: string; counts: Partial<Record<string, number>>; unlocked?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/projects/${projectId}`;
  const hrefs = TABS.map((t) => (t.slug ? `${base}/${t.slug}` : base));
  const current = TABS.findIndex((t) => (t.slug ? pathname.startsWith(`${base}/${t.slug}`) : pathname === base));

  // [ and ] move between tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable) return;
      if (document.querySelector("[role=dialog]")) return;
      if (e.key === "]" && current < hrefs.length - 1) router.push(hrefs[current + 1]);
      if (e.key === "[" && current > 0) router.push(hrefs[current - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, hrefs, router]);
  const visible = TABS.filter((t, i) => !unlocked || unlocked.includes(t.slug) || i === current);
  const later = TABS.filter((t) => !visible.includes(t));

  return (
    <nav aria-label="Project sections" data-tour="project-tabs" className="-mx-4 mb-6 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {visible.map((tab) => {
          const href = tab.slug ? `${base}/${tab.slug}` : base;
          const active = tab.slug ? pathname.startsWith(href) : pathname === base;
          const count = counts[tab.slug];
          return (
            <li key={tab.slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                data-tour={`tab-${tab.slug || "overview"}`}
                className={cn(
                  "relative flex h-9 items-center gap-1.5 px-2.5 text-[13px] transition-colors",
                  active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular",
                      tab.slug === "blockers" ? "font-semibold text-danger" : tab.slug === "remarks" ? "font-semibold text-warning" : "text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                )}
                {active && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden />}
              </Link>
            </li>
          );
        })}
        {later.length > 0 && (
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-9 items-center gap-1 px-2.5 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground">
                More <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {later.map((tab) => (
                  <DropdownMenuItem key={tab.slug} asChild>
                    <Link href={tab.slug ? `${base}/${tab.slug}` : base}>{tab.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}
      </ul>
    </nav>
  );
}
