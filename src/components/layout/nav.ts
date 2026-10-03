import { CalendarDays, FolderKanban, Inbox, ListChecks, NotebookPen, ScrollText, Settings, Sun, Users, type LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/database";

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
}

/** Ordered by how often each is used, not by the data model. */
export function navFor(role: UserRole): NavItem[] {
  if (role === "professor") {
    return [
      { href: "/dashboard", label: "Students", icon: Users, chord: "d" },
      { href: "/reviews", label: "Review queue", short: "Reviews", icon: Inbox, chord: "v", count: "reviews" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, chord: "c" },
      { href: "/reports", label: "Reports", icon: ScrollText, chord: "r", count: "reports" },
    ];
  }
  return [
    { href: "/dashboard", label: "Today", icon: Sun, chord: "d", count: "overdue" },
    { href: "/tasks", label: "My tasks", short: "Tasks", icon: ListChecks, chord: "t", count: "open" },
    { href: "/log", label: "Progress log", short: "Log", icon: NotebookPen, chord: "l" },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, chord: "c" },
    { href: "/reports", label: "Reports", icon: ScrollText, chord: "r" },
  ];
}

export const PROJECTS_ITEM: NavItem = { href: "/projects", label: "Projects", icon: FolderKanban, chord: "p" };
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings, chord: "s" };

export function isActive(pathname: string, href: string): boolean {
  if (href === "/tasks") return pathname === "/tasks";
  return pathname === href || pathname.startsWith(`${href}/`);
}
