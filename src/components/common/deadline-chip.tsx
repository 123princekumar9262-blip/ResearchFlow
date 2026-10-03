import { cn } from "cn";
import { deadlineLabel, urgency, type Urgency } from "@/lib/domain/deadlines";
import { formatDay } from "@/lib/domain/dates";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TaskStatus } from "@/types/database";

const URGENCY_CLASS: Record<Urgency, { chip: string; tab: string }> = {
  overdue: { chip: "border-danger/45 text-danger bg-danger/[0.07]", tab: "bg-danger/15" },
  today: { chip: "border-deadline/45 text-deadline bg-deadline/[0.07]", tab: "bg-deadline/15" },
  soon: { chip: "border-warning/45 text-warning", tab: "bg-warning/15" },
  week: { chip: "border-input text-foreground/80", tab: "bg-muted" },
  later: { chip: "border-input text-muted-foreground", tab: "bg-muted" },
  none: { chip: "border-input text-muted-foreground", tab: "bg-muted" },
  done: { chip: "border-input text-muted-foreground line-through decoration-muted-foreground/50", tab: "bg-muted" },
};

export function Lock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 12" className={cn("size-2.5 shrink-0", className)} aria-hidden>
      <rect x="1" y="5" width="8" height="6.5" rx="1.5" fill="currentColor" />
      <path d="M3 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * A deadline: whose it is, and how far away. PROF (filled tab) is the
 * professor's hard deadline; ME (dashed tab) is the student's own target.
 * Urgency colours the whole chip: overdue red, today orange, ≤48h amber.
 */
export function DeadlineChip({
  date,
  today,
  kind,
  status,
  locked,
  className,
}: {
  date: string;
  today: string;
  kind: "professor" | "personal" | "milestone";
  status?: TaskStatus;
  locked?: boolean;
  className?: string;
}) {
  const level = URGENCY_CLASS[urgency(date, today, status)];
  const tag = kind === "professor" ? "PROF" : kind === "personal" ? "ME" : "◆";
  const label = deadlineLabel(date, today);
  // Phones: "P 1d", "M today", "P 15 Oct". The colour still says overdue or soon.
  const shortLabel = label.replace(/ overdue$/, "").replace(/^in /, "").replace(/^[A-Z][a-z]{2} (?=\d)/, "");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-stretch overflow-hidden rounded-[5px] border bg-card font-mono text-[11px] leading-[18px] font-medium tabular whitespace-nowrap",
            level.chip,
            className,
          )}
        >
          <span
            className={cn(
              "px-[5px] text-[9.5px] font-semibold tracking-[0.05em]",
              kind === "personal" ? "border-r border-dashed border-current/30 bg-transparent" : level.tab,
            )}
          >
            <span className="max-sm:hidden">{tag}</span>
            <span className="sm:hidden">{tag === "◆" ? tag : tag[0]}</span>
          </span>
          <span className="flex items-center gap-1 px-1.5">
            <span className="max-sm:hidden">{label}</span>
            <span className="sm:hidden">{shortLabel}</span>
            {locked && <Lock className="opacity-70" />}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {kind === "professor" ? "Professor deadline" : kind === "personal" ? "Your own deadline" : "Milestone due"} ·{" "}
        {formatDay(date, Number(today.slice(0, 4)))}
        {locked ? " · only your professor can move it" : ""}
      </TooltipContent>
    </Tooltip>
  );
}
