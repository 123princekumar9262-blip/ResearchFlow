"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, CircleHelp, Keyboard, ListChecks, Play, RotateCcw, Sparkles, StepForward } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHAPTERS, TOUR_LABEL, type ChapterId, type TourId } from "@/lib/onboarding/state";
import { chapterForPath, tourSteps } from "@/lib/onboarding/tours";
import { useOnboarding } from "./provider";

export const OPEN_HELP_EVENT = "rf:help-open";
export const OPEN_SHORTCUTS_EVENT = "researchflow:open-shortcuts";

interface Item {
  key: string;
  label: string;
  meta?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: "resume" | "here";
  run: () => void;
}

function useHelpItems(): { top: Item[]; topics: Item[]; tools: Item[]; dot: boolean } {
  const api = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();
  const ctx = api.context(pathname);
  const coreTotal = tourSteps("core", ctx).length;
  const here = chapterForPath(pathname, api.role);
  const seen = (c: ChapterId) => api.isSeen(c) || (c === "tasks" && api.isSeen("tasks-dialog") && api.isSeen("tasks-page"));
  const start = (tour: TourId, opts = {}) => api.start(tour, opts);

  const top: Item[] = [];
  if (api.resumeStep !== null) {
    top.push({
      key: "resume",
      label: "Resume tour",
      meta: `${Math.min(api.resumeStep + 1, coreTotal)} / ${coreTotal}`,
      icon: StepForward,
      highlight: "resume",
      run: () => start("core", { fromStep: api.resumeStep ?? 0 }),
    });
  }
  top.push({ key: "full", label: "Take the full tour", meta: "2½ min", icon: Play, run: () => start("core") });
  if (here) {
    const n = tourSteps(here, ctx).length;
    if (n > 0) top.push({ key: "here", label: `Tour this page: ${here === "project" ? "Project" : TOUR_LABEL[here]}`, meta: `${n} steps`, icon: Sparkles, highlight: "here", run: () => start(here) });
  }

  const topics: Item[] = CHAPTERS.flatMap((c) => {
    const n = tourSteps(c, ctx).length;
    if (n === 0) return [];
    return [
      {
        key: c,
        label: TOUR_LABEL[c],
        meta: seen(c) ? (
          <span className="flex items-center gap-1 text-success">
            <Check className="size-3" /> seen
          </span>
        ) : (
          String(n)
        ),
        icon: Sparkles,
        run: () => start(c),
      },
    ];
  });

  const tools: Item[] = [
    { key: "keys", label: "Keyboard shortcuts", meta: "?", icon: Keyboard, run: () => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT)) },
  ];
  const checklistOpen = !api.state.legacy && api.accountAge < 14 && !api.state.done;
  if (checklistOpen) {
    tools.push({
      key: "checklist",
      label: "Getting started checklist",
      meta: api.checklist ? `${api.checklist.done} / ${api.checklist.total}` : undefined,
      icon: ListChecks,
      run: () => router.push("/dashboard#getting-started"),
    });
  }
  tools.push({
    key: "tips",
    label: "Show tips again",
    icon: RotateCcw,
    run: () => {
      api.update({ off: [], snooze: {} });
      toast.success("Tips are back on.");
    },
  });

  const dot = !api.running && (api.resumeStep !== null || !api.state.core);
  return { top, topics, tools, dot };
}

/** The ? button in the top bar (desktop and tablet). */
export function HelpMenu() {
  const { top, topics, tools, dot } = useHelpItems();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      if (window.matchMedia("(min-width: 768px)").matches) setOpen(true);
    };
    window.addEventListener(OPEN_HELP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_HELP_EVENT, onOpen);
  }, []);

  const row = (item: Item) => (
    <DropdownMenuItem
      key={item.key}
      onSelect={item.run}
      className={cn("justify-between gap-3", item.highlight === "resume" && "bg-primary/8 font-medium text-primary focus:bg-primary/12 focus:text-primary")}
    >
      <span className="flex items-center gap-2">
        <item.icon className="size-4 opacity-70" />
        {item.label}
      </span>
      {item.meta && <span className="font-mono text-[11.5px] text-muted-foreground">{item.meta}</span>}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative rounded-full max-md:hidden" aria-label="Help and tours" data-tour="help-button">
          <CircleHelp className="size-[18px]" />
          {dot && <span className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-background" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {top.map(row)}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Tours by topic</DropdownMenuLabel>
        {topics.map(row)}
        <DropdownMenuSeparator />
        {tools.map(row)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phones: More → Help & tours opens the same list as a bottom sheet. */
export function HelpSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { top, topics, tools } = useHelpItems();
  const row = (item: Item) => (
    <button
      key={item.key}
      type="button"
      onClick={() => {
        onOpenChange(false);
        // Let the sheet close before a tour measures the page.
        setTimeout(item.run, 220);
      }}
      className={cn(
        "flex h-12 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[15px] hover:bg-accent",
        item.highlight === "resume" && "bg-primary/8 font-medium text-primary",
      )}
    >
      <span className="flex items-center gap-3">
        <item.icon className="size-5 text-muted-foreground" />
        {item.label}
      </span>
      {item.meta && <span className="font-mono text-xs text-muted-foreground">{item.meta}</span>}
    </button>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[85dvh] gap-0.5 overflow-y-auto">
        <DialogTitle className="px-2 pb-2 text-base">Help &amp; tours</DialogTitle>
        {top.map(row)}
        <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Tours by topic</p>
        {topics.map(row)}
        <div className="my-1 h-px bg-border" />
        {tools.filter((t) => t.key !== "keys").map(row)}
      </DialogContent>
    </Dialog>
  );
}

/** Opens Help: the menu on desktop, the sheet on phones (via the More menu). */
export function openHelp() {
  window.dispatchEvent(new Event(OPEN_HELP_EVENT));
}
