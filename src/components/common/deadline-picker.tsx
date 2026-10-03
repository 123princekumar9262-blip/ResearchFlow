"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Lock } from "@/components/common/deadline-chip";
import {
  addDays,
  addMonths,
  daysBetween,
  eachDay,
  formatDay,
  formatMonth,
  isoWeekday,
  monthStartOf,
  parseDateInput,
  weekStartOf,
} from "@/lib/domain/dates";
import { deadlineLabel } from "@/lib/domain/deadlines";

export interface DeadlineMarkers {
  /** The professor's deadline for this task, drawn dashed red. */
  professorDeadline?: string | null;
  milestones?: { date: string; title: string }[];
  /** Tasks already due per day, drawn as dots. */
  load?: Record<string, number>;
}

/** Two working days before `date`, never before today. */
function bufferBefore(date: string, today: string): string {
  let d = date;
  let left = 2;
  while (left > 0) {
    d = addDays(d, -1);
    if (isoWeekday(d) <= 5) left--;
  }
  return d < today ? today : d;
}

/**
 * The deadline picker. Deadlines are the product's core object, so the picker
 * shows the professor's deadline, milestones and existing load, accepts typed
 * dates ("next fri", "in 3 days"), and refuses dates past `max` before you try.
 */
export function DeadlinePicker({
  value,
  onChange,
  today,
  max,
  min,
  markers,
  name,
  placeholder = "Set deadline",
  kind = "personal",
  disabled,
  className,
  id,
}: {
  value: string | null;
  onChange: (date: string | null) => void;
  today: string;
  max?: string | null;
  /** Earliest selectable date; defaults to today. */
  min?: string | null;
  markers?: DeadlineMarkers;
  /** Renders a hidden input so the picker works inside plain forms. */
  name?: string;
  placeholder?: string;
  kind?: "personal" | "professor" | "milestone";
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState<string>(value ?? today);
  const [month, setMonth] = useState(monthStartOf(value ?? today));

  const parsed = text ? parseDateInput(text, today) : null;
  const tooLate = (d: string) => !!max && d > max;
  const tooEarly = (d: string) => d < (min && min > today ? min : today);
  const allowed = (d: string) => !tooLate(d) && !tooEarly(d);

  const presets = useMemo(() => {
    const list: { label: string; date: string }[] = [
      { label: "Tomorrow", date: addDays(today, 1) },
      { label: "Fri", date: parseDateInput("eow", today)! },
      { label: "Next Mon", date: parseDateInput("next mon", today)! },
      { label: "+1 week", date: addDays(today, 7) },
      { label: "+2 weeks", date: addDays(today, 14) },
    ];
    if (kind === "personal" && max && max >= today) list.unshift({ label: "2 days before Prof", date: bufferBefore(max, today) });
    const seen = new Set<string>();
    return list.filter((p) => allowed(p.date) && !seen.has(p.date) && seen.add(p.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, max, kind]);

  const commit = (date: string | null) => {
    if (date && !allowed(date)) return;
    onChange(date);
    setOpen(false);
    setText("");
  };

  const gridStart = weekStartOf(month);
  const gridEnd = addDays(weekStartOf(addDays(addMonths(month, 1), -1)), 6);
  const days = eachDay(gridStart, gridEnd);
  const milestoneOn = new Map((markers?.milestones ?? []).map((m) => [m.date, m.title]));
  const focus = parsed ?? cursor;
  const weekLoad = (d: string) => [-1, 0, 1].reduce((s, o) => s + (markers?.load?.[addDays(d, o)] ?? 0), 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const move = (n: number) => {
      e.preventDefault();
      const next = addDays(cursor, n);
      setCursor(next);
      setMonth(monthStartOf(next));
      setText("");
    };
    if (e.key === "ArrowRight" && !text) move(1);
    else if (e.key === "ArrowLeft" && !text) move(-1);
    else if (e.key === "ArrowDown") move(7);
    else if (e.key === "ArrowUp") move(-7);
    else if (e.key === "PageDown") {
      e.preventDefault();
      setMonth(addMonths(month, 1));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setMonth(addMonths(month, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(parsed ?? cursor);
    } else if (e.key === "Backspace" && !text && value) {
      e.preventDefault();
      commit(null);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setCursor(value ?? (kind === "personal" && max ? bufferBefore(max, today) : today));
          setMonth(monthStartOf(value ?? today));
          setText("");
        }
      }}
    >
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-sm shadow-xs transition-colors outline-none hover:border-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted disabled:opacity-80 dark:bg-input/30",
            className,
          )}
        >
          {disabled ? <Lock className="text-muted-foreground" /> : <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />}
          {value ? (
            <span className="min-w-0 truncate">
              <span className="font-mono text-[12.5px]">{formatDay(value, Number(today.slice(0, 4)))}</span>
              <span className="text-muted-foreground"> · {deadlineLabel(value, today)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[316px] p-3" onKeyDown={onKeyDown}>
        <div className="grid gap-2.5">
          <div className="flex items-center gap-2 rounded-md border border-ring bg-card px-2.5 ring-[3px] ring-ring/20">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='Type "fri", "next mon", "in 3 days"'
              className="h-8 min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-muted-foreground"
              aria-label="Type a date"
            />
            {text && (
              <span className={cn("shrink-0 text-[11.5px]", parsed && allowed(parsed) ? "text-foreground" : "text-danger")}>
                {parsed ? `→ ${formatDay(parsed)}` : "?"}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => commit(p.date)}
                className={cn(
                  "h-6 rounded-full border px-2.5 text-[11.5px] transition-colors hover:border-primary/50 hover:text-primary",
                  value === p.date && "border-primary text-primary",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">{formatMonth(month)}</span>
            <span className="flex gap-0.5">
              <button type="button" onClick={() => setMonth(addMonths(month, -1))} className="rounded p-1 hover:bg-accent" aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="rounded p-1 hover:bg-accent" aria-label="Next month">
                <ChevronRight className="size-4" />
              </button>
            </span>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-[11.5px]" role="grid" aria-label={formatMonth(month)}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className="pb-1 text-[10px] text-muted-foreground">
                {d}
              </span>
            ))}
            {days.map((d) => {
              const inMonth = d.slice(0, 7) === month.slice(0, 7);
              const isProf = markers?.professorDeadline === d;
              const ms = milestoneOn.get(d);
              const load = markers?.load?.[d] ?? 0;
              const ok = allowed(d);
              const selected = value === d;
              const focused = focus === d && !selected;
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  disabled={!ok}
                  onClick={() => commit(d)}
                  title={
                    tooLate(d)
                      ? `Must be on or before the professor's deadline (${formatDay(max!)})`
                      : [isProf && "Professor deadline", ms && `Milestone: ${ms}`, load && `${load} task${load === 1 ? "" : "s"} already due`].filter(Boolean).join(" · ") || undefined
                  }
                  className={cn(
                    "relative h-8 rounded-md transition-colors",
                    !inMonth && "opacity-40",
                    ok ? "hover:bg-accent" : "cursor-not-allowed opacity-30",
                    tooLate(d) && "line-through",
                    d === today && !selected && "ring-[1.5px] ring-foreground/70 ring-inset",
                    isProf && !selected && "font-semibold text-danger outline-[1.5px] -outline-offset-[1.5px] outline-danger outline-dashed",
                    focused && "bg-accent",
                    selected && "bg-deadline font-semibold text-white hover:bg-deadline",
                  )}
                >
                  {Number(d.slice(8))}
                  {ms && <span className="absolute top-0 right-0.5 text-[8px] text-primary">◆</span>}
                  {load > 0 && (
                    <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-px">
                      {Array.from({ length: Math.min(load, 3) }, (_, i) => (
                        <i key={i} className={cn("size-[3px] rounded-full", selected ? "bg-white" : "bg-muted-foreground")} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid gap-0.5 border-t pt-2 text-[12px]">
            <span>
              <b className="font-medium">{formatDay(focus)}</b>
              <span className="text-muted-foreground">
                {" "}
                · {deadlineLabel(focus, today)}
                {max && focus <= max && kind === "personal" && ` · ${daysBetween(focus, max)} day${daysBetween(focus, max) === 1 ? "" : "s"} before your professor's deadline`}
              </span>
            </span>
            {tooLate(focus) && <span className="text-danger">After your professor&apos;s deadline ({formatDay(max!)}).</span>}
            {weekLoad(focus) >= 2 && !tooLate(focus) && (
              <span className="text-warning">You already have {weekLoad(focus)} tasks due around then.</span>
            )}
          </div>

          <div className="flex justify-end gap-2">
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => commit(null)}>
                <X /> Clear
              </Button>
            )}
            <Button type="button" size="sm" disabled={!allowed(focus)} onClick={() => commit(focus)}>
              Set deadline <kbd className="border-white/25 bg-white/15 text-inherit">↵</kbd>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
