"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { DeadlineChip, Lock } from "@/components/common/deadline-chip";
import { StatusIcon, StatusPill, STATUS_META } from "@/components/common/status";
import { formatDay, weekdayShort } from "@/lib/domain/dates";
import { updateTask } from "@/server/actions/tasks";
import type { TaskStatus } from "@/types/database";

export type CalendarItem =
  | {
      kind: "professor" | "personal";
      id: string;
      title: string;
      status: TaskStatus;
      projectId: string;
      project: string;
      color: string;
      professorDeadline: string | null;
      personalDeadline: string | null;
      /** Students can drag their own deadlines; professor deadlines only when they own them. */
      draggable: boolean;
    }
  | { kind: "milestone"; id: string; title: string; projectId: string; project: string; color: string; done: boolean };

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "var(--muted-foreground)",
  in_progress: "var(--warning)",
  in_review: "var(--info)",
  changes_requested: "var(--danger)",
  done: "var(--success)",
};

export function CalendarGrid({
  days,
  monthKey,
  today,
  items,
  logged,
  colorBy,
  hidden,
  week = false,
}: {
  days: string[];
  monthKey: string;
  today: string;
  items: Record<string, CalendarItem[]>;
  logged: string[];
  colorBy: "project" | "status";
  hidden: string[];
  /** One week: tall cells that show every deadline instead of the first four. */
  week?: boolean;
}) {
  const limit = week ? Infinity : 4;
  const [peek, setPeek] = useState<{ item: Extract<CalendarItem, { kind: "professor" | "personal" }>; date: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<Record<string, string>>({});
  const loggedSet = new Set(logged);

  const visible = (date: string) => {
    const list = (items[date] ?? []).filter((i) => !hidden.includes(i.projectId));
    // Optimistic moves: hide the chip at its old day, show it at the new one.
    const moved = Object.entries(moving)
      .filter(([, to]) => to === date)
      .flatMap(([key]) => Object.values(items).flat().filter((i) => `${i.kind}:${i.id}` === key));
    return [...list.filter((i) => !(`${i.kind}:${i.id}` in moving)), ...moved];
  };

  const drop = (date: string, payload: string) => {
    const [kind, id] = payload.split(":");
    const item = Object.values(items).flat().find((i) => i.kind === kind && i.id === id);
    if (!item || item.kind === "milestone") return;
    const key = `${item.kind}:${item.id}`;
    if (item.professorDeadline && kind === "personal" && date > item.professorDeadline) {
      toast.error(`Your deadline must be on or before your professor's (${formatDay(item.professorDeadline)}).`);
      return;
    }
    setMoving((m) => ({ ...m, [key]: date }));
    void updateTask(kind === "personal" ? { taskId: id, personalDeadline: date } : { taskId: id, professorDeadline: date }).then((r) => {
      setMoving((m) => {
        const next = { ...m };
        delete next[key];
        return next;
      });
      if (r.ok) toast.success(`Moved "${item.title}" to ${formatDay(date)}`);
      else toast.error(r.error);
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="border-r px-2 py-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase last:border-r-0">
            {weekdayShort(i)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = week || d.slice(0, 7) === monthKey;
          const list = visible(d);
          return (
            <div
              key={d}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(d);
              }}
              onDragLeave={() => setOver((o) => (o === d ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                drop(d, e.dataTransfer.getData("text/calendar-item"));
              }}
              className={cn(
                "relative space-y-[3px] border-r border-b p-1.5 transition-colors [&:nth-child(7n)]:border-r-0",
                week ? "min-h-80" : "min-h-28",
                !inMonth && "bg-muted/40",
                d === today && "shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--deadline)_45%,transparent)]",
                over === d && "bg-primary/[0.06]",
              )}
            >
              <div className="mb-1 flex items-center gap-1">
                {d === today ? (
                  <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-deadline px-1 font-mono text-[11.5px] font-semibold text-white">{Number(d.slice(8))}</span>
                ) : (
                  <span className={cn("font-mono text-[11.5px]", inMonth ? "text-foreground/80" : "text-muted-foreground/60")}>{Number(d.slice(8))}</span>
                )}
                {loggedSet.has(d) && <span className="ml-auto size-1.5 rounded-full bg-success" title="Progress logged" />}
              </div>
              {list.slice(0, limit).map((item) => {
                if (item.kind === "milestone") {
                  return (
                    <Link
                      key={`m-${item.id}`}
                      href={`/projects/${item.projectId}`}
                      title={`Milestone: ${item.title} (${item.project})`}
                      className="flex h-5 items-center gap-1 truncate rounded-[5px] px-1.5 text-[11px] font-semibold"
                      style={{ background: `color-mix(in srgb, ${item.color} 14%, var(--card))`, color: item.done ? "var(--success)" : item.color }}
                    >
                      ◆ <span className="truncate">{item.title}</span>
                    </Link>
                  );
                }
                const overdue = item.status !== "done" && d < today;
                const due = d === today && item.status !== "done";
                const dot = colorBy === "status" ? STATUS_COLOR[item.status] : item.color;
                return (
                  <PopoverOnChip key={`${item.kind}-${item.id}`} open={peek?.item.id === item.id && peek.item.kind === item.kind && peek.date === d} onOpenChange={(o) => setPeek(o ? { item, date: d } : null)} item={item} today={today}>
                    <button
                      type="button"
                      draggable={item.draggable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/calendar-item", `${item.kind}:${item.id}`);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => setPeek({ item, date: d })}
                      title={`${item.kind === "professor" ? "Professor" : "Your"} deadline: ${item.title} (${item.project})${item.draggable ? " · drag to move" : ""}`}
                      className={cn(
                        "flex h-5 w-full items-center gap-1 overflow-hidden rounded-[5px] border px-1 text-left text-[11px] whitespace-nowrap",
                        item.kind === "professor" ? "border-transparent bg-muted" : "border-dashed border-input bg-card",
                        overdue && "border-danger/40 bg-danger/[0.09] text-danger",
                        due && "border-deadline/40 bg-deadline/[0.09] text-deadline",
                        item.status === "done" && "text-muted-foreground line-through",
                        item.draggable && "cursor-grab active:cursor-grabbing",
                        `${item.kind}:${item.id}` in moving && "opacity-50",
                      )}
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} />
                      <b className="shrink-0 font-mono text-[8.5px] tracking-[0.04em] opacity-80">{item.kind === "professor" ? "PROF" : "ME"}</b>
                      <StatusIcon status={item.status} className="size-2.5" />
                      <span className="truncate">{item.title}</span>
                      {!item.draggable && item.kind === "professor" && <Lock className="ml-auto size-2 opacity-60" />}
                    </button>
                  </PopoverOnChip>
                );
              })}
              {list.length > limit && <p className="px-1 text-[10px] text-muted-foreground">+{list.length - limit} more</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PopoverOnChip({
  children,
  open,
  onOpenChange,
  item,
  today,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Extract<CalendarItem, { kind: "professor" | "personal" }>;
  today: string;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div>{children}</div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="grid gap-2">
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: item.color }} />
            {item.project}
          </span>
          <b className="text-[13.5px] leading-snug">{item.title}</b>
          <div className="flex flex-wrap gap-1.5">
            <StatusPill status={item.status} />
            {item.professorDeadline && <DeadlineChip date={item.professorDeadline} today={today} kind="professor" status={item.status} locked={!item.draggable} />}
            {item.personalDeadline && item.personalDeadline !== item.professorDeadline && <DeadlineChip date={item.personalDeadline} today={today} kind="personal" status={item.status} />}
          </div>
          <p className="text-[11.5px] text-muted-foreground">{STATUS_META[item.status].label}{item.draggable ? " · drag the chip to move this deadline" : ""}</p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href={`/log/new?project=${item.projectId}&task=${item.id}`}>Log progress</Link>
            </Button>
            <Button asChild size="sm" className="flex-1">
              <Link href={`/tasks/${item.id}`}>Open</Link>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
