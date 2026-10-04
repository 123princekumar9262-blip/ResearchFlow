"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Plus, Settings, Sun, Target } from "lucide-react";
import { UserAvatar } from "@/components/common/ui-bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/server/actions/auth";
import type { InboxItem } from "@/lib/domain/inbox";
import { SearchButton } from "./command-palette";
import { InboxBell } from "./inbox";
import { CRUMB_SLOT_ID } from "./page-crumbs";
import { formatDay } from "@/lib/domain/dates";
import { InstallMenuItem } from "@/components/pwa/install";
import { HelpMenu } from "@/components/onboarding/help";
import { useOnboardingMaybe } from "@/components/onboarding/provider";
import { FocusPill } from "@/components/tasks/focus-mode";
import { AskAi, type AskAiProps } from "@/components/assistant/ask-ai";

/** The page's name for the top bar, until a page supplies its own breadcrumb. */
function titleFor(pathname: string, role: string): string {
  const section = pathname.split("/")[1] ?? "";
  const titles: Record<string, string> = {
    dashboard: role === "professor" ? "Students" : "Today",
    tasks: "My tasks",
    reviews: "Review queue",
    log: "Progress log",
    calendar: "Calendar",
    reports: "Reports",
    projects: "Projects",
    students: "Students",
    notifications: "Notifications",
    settings: "Settings",
  };
  return titles[section] ?? "ResearchFlow";
}

export function TopBar({ name, role, inbox, today, ai }: { name: string; role: string; inbox: InboxItem[]; today: string; ai?: AskAiProps }) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  // Progressive disclosure: a brand-new account sees title, Help and avatar only.
  const ui = useOnboardingMaybe()?.ui;
  const stage = ui?.stage ?? 3;
  const canLog = role === "student" && (ui?.has.log ?? true);
  // Inside a project, + Log starts with that project selected.
  const projectId = pathname.match(/^\/projects\/([0-9a-f-]{36})/i)?.[1];
  const logHref = projectId ? `/log/new?project=${projectId}` : "/log/new";
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:px-6 print:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div id={CRUMB_SLOT_ID} className="peer flex min-w-0 items-center empty:hidden" />
        <span className="truncate text-[15px] font-semibold peer-[:not(:empty)]:hidden md:text-[13px] md:font-medium">{titleFor(pathname, role)}</span>
        {/* On phones the dashboard's greeting is folded into the bar: "Today · Sat 3 Oct". */}
        {pathname === "/dashboard" && <span className="shrink-0 font-mono text-[11px] text-muted-foreground md:hidden">{formatDay(today)}</span>}
      </div>
      <FocusPill />
      {stage >= 2 && <SearchButton hint={stage >= 3} />}
      {role === "student" && (ui?.has.tasks ?? true) && (
        <Button variant="ghost" size="sm" className="hidden h-8 gap-1.5 text-muted-foreground md:inline-flex" asChild>
          <Link href="/focus" title="Focus on your next task">
            <Target className="size-3.5" /> Focus
          </Link>
        </Button>
      )}
      {canLog && (
        <Button variant="outline" size="sm" className="hidden h-8 gap-1.5 sm:inline-flex" asChild>
          <Link href={logHref} data-tour="log-button">
            <Plus className="size-3.5" /> Log <kbd>N</kbd>
          </Link>
        </Button>
      )}
      {ai && stage >= 2 && <AskAi {...ai} />}
      <HelpMenu />
      {stage >= 2 && <InboxBell items={inbox} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Account menu">
            <UserAvatar name={name} className="size-7 ring-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="font-medium">{name}</p>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <InstallMenuItem />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
