import { CalendarDays, FolderKanban, Handshake, Inbox, ListChecks, NotebookPen, ScrollText, Settings, Sun, Users, type LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/database";
import type { Feature } from "@/lib/onboarding/stage";

export type CountKey = "overdue" | "open" | "reviews" | "reports";

export interface NavItem {
  href: string;
  label: string;
  /** One word for the phone tab bar. */
  short?: string;
  icon: LucideIcon;
  /** Second key of the "g" chord, e.g. "d" for g → d. */
  chord: string;
  count?: CountKey;
  /** Shown once this feature is unlocked (calm redesign spec, Phase 03). */
  feature?: Feature;
}

/** Ordered by how often each is used, not by the data model. */
export function navFor(role: UserRole): NavItem[] {
  if (role === "professor") {
    return [
      { href: "/dashboard", label: "Students", icon: Users, chord: "d" },
      { href: "/reviews", label: "Review queue", short: "Reviews", icon: Inbox, chord: "v", count: "reviews", feature: "reviews" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, chord: "c", feature: "calendar" },
      { href: "/reports", label: "Reports", icon: ScrollText, chord: "r", count: "reports", feature: "reports" },
      MEETINGS_ITEM,
    ];
  }
  return [
    { href: "/dashboard", label: "Today", icon: Sun, chord: "d", count: "overdue" },
    { href: "/tasks", label: "My tasks", short: "Tasks", icon: ListChecks, chord: "t", count: "open", feature: "tasks" },
    { href: "/log", label: "Progress log", short: "Log", icon: NotebookPen, chord: "l", feature: "log" },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, chord: "c", feature: "calendar" },
    { href: "/reports", label: "Reports", icon: ScrollText, chord: "r", feature: "reports" },
    MEETINGS_ITEM,
  ];
}

// Last in both lists, so the phone tab bar's positions stay the same.
const MEETINGS_ITEM: NavItem = { href: "/meetings", label: "Meetings", icon: Handshake, chord: "m", feature: "meetings" };

export const PROJECTS_ITEM: NavItem = { href: "/projects", label: "Projects", icon: FolderKanban, chord: "p", feature: "projects" };
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings, chord: "s" };

export function isActive(pathname: string, href: string): boolean {
  if (href === "/tasks") return pathname === "/tasks";
  return pathname === href || pathname.startsWith(`${href}/`);
}
