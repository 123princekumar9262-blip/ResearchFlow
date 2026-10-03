"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCircle2, CircleAlert, Clock, Info } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { timeAgo } from "@/lib/domain/dates";
import type { InboxItem } from "@/lib/domain/inbox";

const TONE_ICON = {
  danger: { icon: CircleAlert, cls: "text-danger bg-danger/12" },
  warning: { icon: Clock, cls: "text-warning bg-warning/14" },
  info: { icon: Info, cls: "text-info bg-info/12" },
  default: { icon: Info, cls: "text-muted-foreground bg-muted" },
  success: { icon: CheckCircle2, cls: "text-success bg-success/12" },
} as const;

export function InboxRow({ item, onNavigate }: { item: InboxItem; onNavigate?: () => void }) {
  const tone = TONE_ICON[item.tone];
  return (
    <Link href={item.href} onClick={onNavigate} className="group flex gap-3 rounded-lg px-3 py-2.5 transition-colors outline-none hover:bg-accent/70 focus-visible:bg-accent">
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", tone.cls)}>
        <tone.icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug">{item.title}</span>
        {item.detail && <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted-foreground">{item.detail}</span>}
        <span className="mt-1 block font-mono text-[10.5px] text-muted-foreground">{item.at.length > 10 ? timeAgo(item.at) : ""}</span>
      </span>
      {item.action && (
        <span className="h-fit self-center rounded-md border px-2 py-0.5 text-[11.5px] font-medium text-foreground/80 group-hover:border-primary/40 group-hover:text-primary">
          {item.action}
        </span>
      )}
    </Link>
  );
}

/** The bell: counts only what needs action; FYI items never raise the badge. */
export function InboxBell({ items }: { items: InboxItem[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"action" | "all">("action");
  const needs = items.filter((i) => i.needsAction);
  const shown = tab === "action" ? needs : items;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={needs.length ? `Notifications, ${needs.length} need action` : "Notifications"}
        >
          <Bell className="size-[18px]" />
          {needs.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-danger px-1 text-center font-mono text-[9.5px] leading-4 font-semibold text-white">
              {needs.length > 9 ? "9+" : needs.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(400px,calc(100vw-24px))] p-0">
        <div className="flex items-center gap-1 border-b px-3 py-2">
          {(
            [
              ["action", `Needs action · ${needs.length}`],
              ["all", `All · ${items.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn("rounded-md px-2.5 py-1 text-[12px]", tab === key ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
          <Link href="/notifications" onClick={() => setOpen(false)} className="ml-auto text-[12px] text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto p-1.5">
          {shown.length === 0 ? (
            <p className="px-3 py-8 text-center text-muted-foreground">
              <span className="block font-medium text-foreground">You&apos;re caught up</span>
              New requests, reviews and deadlines appear here.
            </p>
          ) : (
            shown.slice(0, 12).map((item) => <InboxRow key={item.id} item={item} onNavigate={() => setOpen(false)} />)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
