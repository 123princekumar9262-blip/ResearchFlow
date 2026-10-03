import Link from "next/link";
import { Link2, Paperclip } from "lucide-react";
import { cn } from "cn";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { PriorityIcon, StatusIcon } from "@/components/common/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Risk } from "@/lib/domain/risk";
import type { Task } from "@/types/database";

export function RiskDot({ risk }: { risk: Risk }) {
  if (risk.level === "none" || risk.level === "low") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium",
            risk.level === "high" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning",
          )}
        >
          <span className={cn("size-1.5 rounded-full", risk.level === "high" ? "bg-danger" : "bg-warning")} aria-hidden />
          {risk.level === "high" ? "At risk" : "Watch"}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p className="mb-1 font-medium">Delay risk: {risk.level}</p>
        <ul className="list-disc pl-4">
          {risk.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function TaskDeadlines({
  task,
  today,
  locked,
  compact,
}: {
  task: Pick<Task, "status" | "professor_deadline" | "personal_deadline">;
  today: string;
  locked?: boolean;
  compact?: boolean;
}) {
  const showPersonal = task.personal_deadline && task.personal_deadline !== task.professor_deadline;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {task.professor_deadline && <DeadlineChip date={task.professor_deadline} today={today} kind="professor" status={task.status} locked={locked} />}
      {showPersonal && (!compact || !task.professor_deadline) && (
        <DeadlineChip date={task.personal_deadline!} today={today} kind="personal" status={task.status} />
      )}
    </span>
  );
}

export function TaskRow({
  task,
  today,
  projectTitle,
  risk,
  evidence,
  blocked,
  className,
}: {
  task: Task;
  today: string;
  projectTitle?: string;
  risk?: Risk;
  evidence?: number;
  blocked?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className={cn(
        "group flex min-h-10 items-center gap-2.5 px-4 py-2 transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent",
        className,
      )}
    >
      <StatusIcon status={task.status} />
      <PriorityIcon priority={task.priority} className="hidden sm:block" />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", task.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/40")}>
          {task.title}
        </span>
        {projectTitle && <span className="block truncate text-xs text-muted-foreground max-sm:hidden">{projectTitle}</span>}
      </span>
      {blocked && (
        <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex" title="Waiting on a dependency">
          <Link2 className="size-3" /> waiting
        </span>
      )}
      {evidence !== undefined && evidence > 0 && (
        <span className="hidden items-center gap-0.5 text-xs text-muted-foreground tabular sm:flex" title={`${evidence} pieces of evidence`}>
          <Paperclip className="size-3" />
          {evidence}
        </span>
      )}
      {/* Phones keep the title readable; the risk shows on the task itself. */}
      {risk && (
        <span className="hidden sm:contents">
          <RiskDot risk={risk} />
        </span>
      )}
      <TaskDeadlines task={task} today={today} compact />
    </Link>
  );
}
