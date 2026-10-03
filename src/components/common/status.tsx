import { cn } from "cn";
import type { TaskPriority, TaskStatus } from "@/types/database";

export const STATUS_META: Record<TaskStatus, { label: string; short: string; className: string }> = {
  todo: { label: "To do", short: "To do", className: "text-muted-foreground" },
  in_progress: { label: "In progress", short: "Doing", className: "text-warning" },
  in_review: { label: "In review", short: "Review", className: "text-info" },
  changes_requested: { label: "Changes requested", short: "Changes", className: "text-danger" },
  done: { label: "Done", short: "Done", className: "text-success" },
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "in_review", "changes_requested", "done"];

/** Linear-style glyphs: a status reads before its label does. */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const cls = cn("size-3.5 shrink-0", STATUS_META[status].className, className);
  const label = STATUS_META[status].label;
  switch (status) {
    case "todo":
      return (
        <svg viewBox="0 0 14 14" className={cls} role="img" aria-label={label}>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.6" />
        </svg>
      );
    case "in_progress":
      return (
        <svg viewBox="0 0 14 14" className={cls} role="img" aria-label={label}>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
        </svg>
      );
    case "in_review":
      return (
        <svg viewBox="0 0 14 14" className={cls} role="img" aria-label={label}>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        </svg>
      );
    case "changes_requested":
      return (
        <svg viewBox="0 0 14 14" className={cls} role="img" aria-label={label}>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4.8 7.6 7 5.4l2.2 2.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "done":
      return (
        <svg viewBox="0 0 14 14" className={cls} role="img" aria-label={label}>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path d="m4.5 7.2 1.7 1.7 3.4-3.6" fill="none" stroke="var(--card)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function StatusLabel({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <StatusIcon status={status} />
      {STATUS_META[status].label}
    </span>
  );
}

export const PRIORITY_META: Record<TaskPriority, { label: string; bars: number; className: string }> = {
  urgent: { label: "Urgent", bars: 4, className: "text-danger" },
  high: { label: "High", bars: 3, className: "text-foreground" },
  medium: { label: "Medium", bars: 2, className: "text-muted-foreground" },
  low: { label: "Low", bars: 1, className: "text-muted-foreground/70" },
};

export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const meta = PRIORITY_META[priority];
  if (priority === "urgent") {
    return (
      <svg viewBox="0 0 14 14" className={cn("size-3.5 shrink-0", meta.className, className)} role="img" aria-label={`${meta.label} priority`}>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 3.8v4M7 9.9v.3" stroke="var(--card)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3.5 shrink-0", meta.className, className)} role="img" aria-label={`${meta.label} priority`}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1.5 + i * 4} y={9 - i * 3} width="3" height={3 + i * 3} rx="0.8" fill="currentColor" opacity={i < meta.bars ? 1 : 0.25} />
      ))}
    </svg>
  );
}

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "border-border text-muted-foreground bg-card",
  in_progress: "border-warning/40 text-warning bg-warning/[0.09]",
  in_review: "border-info/40 text-info bg-info/[0.08]",
  changes_requested: "border-danger/40 text-danger bg-danger/[0.08]",
  done: "border-success/40 text-success bg-success/[0.08]",
};

/** Status as a pill: glyph plus label, tinted by state. */
export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium whitespace-nowrap", STATUS_TONE[status], className)}>
      <StatusIcon status={status} className="text-current" />
      {STATUS_META[status].label}
    </span>
  );
}
