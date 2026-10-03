"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLocalStorage } from "@/components/common/use-local-storage";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { cn } from "cn";
import { Logo, LogoMark } from "@/components/brand";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/server/actions/auth";
import type { Health, ShellData } from "@/lib/data/shell";
import { isActive, navFor, PROJECTS_ITEM, SETTINGS_ITEM, type NavItem } from "./nav";
import type { UserRole } from "@/types/database";

const HEALTH: Record<Health, { dot: string; label: string }> = {
  good: { dot: "bg-success", label: "On track" },
  risk: { dot: "bg-warning", label: "At risk" },
  late: { dot: "bg-danger", label: "Missed a professor deadline" },
  paused: { dot: "bg-muted-foreground/50", label: "On hold" },
};

const STORAGE_KEY = "rf.sidebar.collapsed";

function NavLink({ item, pathname, count, collapsed }: { item: NavItem; pathname: string; count?: number; collapsed: boolean }) {
  const active = isActive(pathname, item.href);
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-[30px] items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "relative bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border),var(--shadow-card)] before:absolute before:inset-y-1.5 before:-left-2 before:w-[3px] before:rounded-full before:bg-grad-primary"
          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <item.icon className={cn("size-4 shrink-0", active && "text-primary")} aria-hidden />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && !!count && (
        <span className={cn("font-mono text-[11px] tabular", item.count === "overdue" ? "font-semibold text-danger" : "text-muted-foreground")}>{count}</span>
      )}
      {collapsed && !!count && item.count === "overdue" && <span className="absolute ml-5 -mt-4 size-1.5 rounded-full bg-danger" />}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {count ? ` · ${count}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ role, shell }: { role: UserRole; shell: ShellData }) {
  const pathname = usePathname();
  const [stored, setStored] = useLocalStorage(STORAGE_KEY);
  const collapsed = stored === "1";
  const toggle = useCallback(() => setStored(collapsed ? "0" : "1"), [collapsed, setStored]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-150 md:flex print:hidden",
        collapsed ? "w-14" : "w-60",
        // Tablets get the icon rail regardless.
        "md:max-lg:w-14",
      )}
      data-collapsed={collapsed || undefined}
    >
      <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0", "md:max-lg:justify-center md:max-lg:px-0")}>
        <Link href="/dashboard" aria-label="ResearchFlow home" className="flex items-center">
          {collapsed ? <LogoMark /> : <span className="md:max-lg:hidden"><Logo className="text-[15px]" /></span>}
          {!collapsed && <span className="hidden md:max-lg:block"><LogoMark /></span>}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-px overflow-y-auto px-2 pb-3" aria-label="Main">
        {navFor(role).map((item) => (
          <NavItemResponsive key={item.href} item={item} pathname={pathname} count={item.count ? shell.counts[item.count] : undefined} collapsed={collapsed} />
        ))}

        <div className={cn("mt-5 mb-1 flex items-center justify-between px-2", collapsed && "hidden", "md:max-lg:hidden")}>
          <Link href={PROJECTS_ITEM.href} className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase hover:text-foreground">
            Projects
          </Link>
          <Link href="/projects?new=1" aria-label="New project" className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
            <Plus className="size-3.5" />
          </Link>
        </div>
        <div className={cn("mt-3", !collapsed && "hidden", "md:max-lg:block")}>
          <NavItemResponsive item={PROJECTS_ITEM} pathname={pathname} collapsed />
        </div>
        <div className={cn(collapsed && "hidden", "md:max-lg:hidden")}>
          {shell.projects.length === 0 && <p className="px-2 text-xs text-muted-foreground">No active projects</p>}
          {shell.projects.map((p) => {
            const href = `/projects/${p.id}`;
            const on = isActive(pathname, href);
            return (
              <Link
                key={p.id}
                href={href}
                title={HEALTH[p.health].label}
                className={cn(
                  "flex h-[30px] items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                  on ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                )}
              >
                <span className={cn("size-[7px] shrink-0 rounded-full", HEALTH[p.health].dot)} aria-label={HEALTH[p.health].label} />
                <span className="truncate">{p.title}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto grid gap-px pt-4">
          <NavItemResponsive item={SETTINGS_ITEM} pathname={pathname} collapsed={collapsed} />
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex h-[30px] items-center gap-2.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground md:max-lg:hidden",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Collapse</span>
                <kbd>⌘\</kbd>
              </>
            )}
          </button>
        </div>
      </nav>
    </aside>
  );
}

/** Full row on desktop; icon-only on tablets or when collapsed. */
function NavItemResponsive(props: { item: NavItem; pathname: string; count?: number; collapsed: boolean }) {
  if (props.collapsed) return <NavLink {...props} collapsed />;
  return (
    <>
      <div className="md:max-lg:hidden">
        <NavLink {...props} collapsed={false} />
      </div>
      <div className="hidden md:max-lg:block">
        <NavLink {...props} collapsed />
      </div>
    </>
  );
}

/**
 * Phone navigation: four destinations and, for students, a raised Log button
 * in the centre, the one action worth a thumb's reach every day.
 */
export function MobileNav({ role, shell }: { role: UserRole; shell: ShellData }) {
  const pathname = usePathname();
  const nav = navFor(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const slots: (NavItem | "log")[] =
    role === "student" ? [nav[0], nav[1], "log", nav[3]] : [nav[0], nav[1], PROJECTS_ITEM, nav[3]];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
    >
      {slots.map((slot) => {
        if (slot === "log") {
          return (
            <Link key="log" href="/log/new" aria-label="Write today's log" className="flex flex-col items-center gap-1.5 pb-1.5 text-[10px] font-medium text-muted-foreground">
              <span className="-mt-7 grid size-12 place-items-center rounded-full bg-primary bg-grad-primary text-primary-foreground shadow-[0_10px_22px_-6px_rgba(79,70,229,0.6)] ring-4 ring-background transition-transform duration-150 active:scale-95">
                <Plus className="size-6" />
              </span>
              Log
            </Link>
          );
        }
        const active = isActive(pathname, slot.href);
        const count = slot.count ? shell.counts[slot.count] : 0;
        return (
          <Link
            key={slot.href}
            href={slot.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors", active ? "font-semibold text-primary" : "text-muted-foreground")}
          >
            <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-all duration-200", active ? "bg-primary/12 scale-100" : "scale-90")}>
              <slot.icon className="size-5" aria-hidden />
            </span>
            {slot.short ?? slot.label}
            {!!count && (
              <span className={cn("absolute top-1.5 left-1/2 ml-1.5 min-w-4 rounded-full px-1 text-center font-mono text-[9px] leading-4 text-white", slot.count === "overdue" ? "bg-danger" : "bg-muted-foreground")}>
                {count}
              </span>
            )}
          </Link>
        );
      })}
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogTrigger asChild>
          <button type="button" className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
            <span className="grid h-7 w-12 scale-90 place-items-center rounded-full">
              <Menu className="size-5" aria-hidden />
            </span>
            More
          </button>
        </DialogTrigger>
        <DialogContent showCloseButton={false} className="gap-1">
          <DialogTitle className="px-2 pb-2 text-base">More</DialogTitle>
          {[...(role === "student" ? [PROJECTS_ITEM, nav[4]] : [nav[2]]), SETTINGS_ITEM].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className="flex h-12 items-center gap-3 rounded-lg px-3 text-[15px] hover:bg-accent">
              <item.icon className="size-5 text-muted-foreground" /> {item.label}
            </Link>
          ))}
          {shell.projects.length > 0 && <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Projects</p>}
          {shell.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} onClick={() => setMoreOpen(false)} className="flex h-11 items-center gap-3 rounded-lg px-3 text-[14px] hover:bg-accent">
              <span className={cn("size-2 rounded-full", HEALTH[p.health].dot)} /> {p.title}
            </Link>
          ))}
          <button type="button" onClick={() => void signOut()} className="mt-2 flex h-12 items-center gap-3 rounded-lg px-3 text-[15px] text-muted-foreground hover:bg-accent">
            <LogOut className="size-5" /> Sign out
          </button>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
