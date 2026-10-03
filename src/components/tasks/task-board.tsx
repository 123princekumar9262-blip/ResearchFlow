"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Link2, MoreHorizontal, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PriorityIcon, STATUS_META, STATUS_ORDER, StatusIcon } from "@/components/common/status";
import { UserAvatar } from "@/components/common/ui-bits";
import { TaskDeadlines } from "@/components/tasks/task-row";
import { setTaskStatus } from "@/server/actions/tasks";
import type { Task, TaskStatus } from "@/types/database";

export type BoardTask = Task & { assigneeName: string | null; evidence: number; blocked: boolean; openBlockers: number; milestoneTitle: string | null };

const COLUMN_HINT: Record<TaskStatus, string> = {
  todo: "Not started",
  in_progress: "Being worked on",
  in_review: "Submitted, waiting for the professor",
  changes_requested: "Sent back with feedback",
  done: "Approved or closed with evidence",
};

/**
 * Kanban by status. Drag a card or use its menu (keyboard). Moves apply
 * instantly and roll back with the database's reason if a rule forbids them.
 */
/** What a column demands of the card being dragged, so illegal drops are visible before they happen. */
function dropHint(task: BoardTask, status: TaskStatus, isProfessor: boolean): { ok: boolean; text: string } | null {
  if (task.status === status) return null;
  const evidence = task.evidence > 0;
  const deps = !task.blocked;
  const closing = (status === "in_review" || status === "done") && task.status !== "in_review";
  if (status === "changes_requested") return isProfessor ? { ok: task.status === "in_review", text: "Request changes from the task page" } : { ok: false, text: "Only your professor sends work back" };
  if (status === "done" && task.requires_review && !isProfessor) return { ok: false, text: "Needs your professor's approval" };
  if (closing) return { ok: evidence && deps, text: `Evidence ${evidence ? "✓" : "✗"} · dependencies ${deps ? "✓" : "✗"}` };
  return { ok: true, text: "Drop to move" };
}

const COLUMN_EDGE: Record<string, string> = {
  todo: "border-t-muted-foreground/40",
  in_progress: "border-t-warning",
  in_review: "border-t-info",
  changes_requested: "border-t-danger",
  done: "border-t-success",
};

export function TaskBoard({
  tasks,
  today,
  lockProfessorDeadlines,
  isProfessor = false,
}: {
  tasks: BoardTask[];
  today: string;
  lockProfessorDeadlines: boolean;
  isProfessor?: boolean;
}) {
  const [optimistic, applyMove] = useOptimistic(tasks, (state, move: { id: string; status: TaskStatus }) =>
    state.map((t) => (t.id === move.id ? { ...t, status: move.status } : t)),
  );
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [dragging, setDragging] = useState<BoardTask | null>(null);
  const [showDone, setShowDone] = useState(false);

  const move = (task: BoardTask, status: TaskStatus) => {
    if (task.status === status) return;
    startTransition(async () => {
      applyMove({ id: task.id, status });
      const result = await setTaskStatus({ taskId: task.id, status });
      if (result.ok) toast.success(`${task.title}: ${STATUS_META[status].label}`);
      else toast.error(result.error);
    });
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="grid min-w-[860px] grid-cols-5 gap-2.5">
        {STATUS_ORDER.map((status) => {
          const column = optimistic.filter((t) => t.status === status);
          const hint = dragging ? dropHint(dragging, status, isProfessor) : null;
          const collapsed = status === "done" && !showDone && column.length > 0;
          return (
            <section
              key={status}
              aria-label={STATUS_META[status].label}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                setDragging(null);
                const task = optimistic.find((t) => t.id === e.dataTransfer.getData("text/task-id"));
                if (task) move(task, status);
              }}
              className={cn(
                // Columns sit on the spec's sunken grey so white cards stand out; a status-coloured top edge.
                "flex min-h-64 flex-col overflow-hidden rounded-xl border border-t-[3px] bg-sunken transition-colors duration-200",
                COLUMN_EDGE[status],
                dragOver === status && "border-primary/50 bg-primary/[0.06]",
                hint && (hint.ok ? "border-dashed border-info/50" : "opacity-60"),
              )}
            >
              <header className="flex items-center gap-2 px-3 py-2.5" title={COLUMN_HINT[status]}>
                <StatusIcon status={status} />
                <h3 className="text-[13px] font-medium">{STATUS_META[status].label}</h3>
                <span className="font-mono text-xs text-muted-foreground tabular">{column.length}</span>
                {status === "done" && column.length > 0 && (
                  <button type="button" onClick={() => setShowDone((v) => !v)} className="ml-auto text-[11.5px] text-muted-foreground hover:text-foreground">
                    {showDone ? "Hide" : "Show"}
                  </button>
                )}
              </header>
              {hint && (
                <p className={cn("mx-2 mb-2 rounded-md border border-dashed px-2 py-1.5 text-center text-[11px]", hint.ok ? "border-info/50 text-info" : "border-danger/40 text-danger")}>
                  {hint.text}
                </p>
              )}
              <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {collapsed && (
                  <li className="rounded-lg border bg-card p-2.5 text-xs text-muted-foreground">
                    {column.length} done · <button type="button" className="underline-offset-2 hover:underline" onClick={() => setShowDone(true)}>show</button>
                    <span className="mt-0.5 block truncate text-[11px]">Last: {[...column].sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))[0]?.title}</span>
                  </li>
                )}
                {(collapsed ? [] : column).map((task) => (
                  <li
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/task-id", task.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(task);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDragOver(null);
                    }}
                    className="group rf-lift rounded-lg border bg-card p-2.5 shadow-[var(--shadow-card)] hover:border-primary/30 active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-1.5">
                      <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 font-medium leading-snug outline-none hover:underline focus-visible:underline">
                        {task.title}
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-xs" variant="ghost" className="-mt-0.5 -mr-1 opacity-60 group-hover:opacity-100" aria-label={`Change status of ${task.title}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          {STATUS_ORDER.filter((s) => s !== task.status).map((s) => (
                            <DropdownMenuItem key={s} onSelect={() => move(task, s)}>
                              <StatusIcon status={s} /> {STATUS_META[s].label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {task.milestoneTitle && <p className="mt-1 truncate text-[11px] text-muted-foreground">◆ {task.milestoneTitle}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <PriorityIcon priority={task.priority} />
                      <TaskDeadlines task={task} today={today} locked={lockProfessorDeadlines} compact />
                      {task.blocked && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground" title="Waiting on a dependency">
                          <Link2 className="size-3" />
                        </span>
                      )}
                      {task.openBlockers > 0 && <span className="text-[11px] text-danger" title="Open blocker">⛔</span>}
                      {task.evidence > 0 && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground tabular" title="Evidence">
                          <Paperclip className="size-3" />
                          {task.evidence}
                        </span>
                      )}
                      {task.assigneeName && <UserAvatar name={task.assigneeName} className="ml-auto size-5 text-[9px]" />}
                    </div>
                  </li>
                ))}
                {column.length === 0 && <li className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground/70">{COLUMN_HINT[status]}</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
