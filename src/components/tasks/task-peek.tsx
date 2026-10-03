"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, NotebookPen, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { StatusPill } from "@/components/common/status";
import { formatMinutes } from "@/lib/domain/dates";
import type { TaskStatus } from "@/types/database";

export interface TaskPeekData {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  projectId: string;
  projectTitle: string;
  milestone: string | null;
  assignee: string | null;
  professorDeadline: string | null;
  personalDeadline: string | null;
  evidence: number;
  minutes: number;
  openRequest: string | null;
  canLog: boolean;
}

/** A quick look from a list (Space on a focused task); Enter opens the full page. */
export function TaskPeek({ task, today }: { task: TaskPeekData; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const open = pathname === `/tasks/${task.id}/peek`;
  const full = `/tasks/${task.id}`;

  useEffect(() => {
    if (!open) return;
    // Capture phase: the dialog's own key handling must not swallow Enter. A focused
    // button or link keeps its own meaning; Enter anywhere else opens the task.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLAnchorElement || (el instanceof HTMLButtonElement && !el.closest("[data-slot=dialog-close]"))) return;
      e.preventDefault();
      e.stopPropagation();
      router.replace(full);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, router, full]);

  if (!open) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && router.back()}>
      {/* Focus the panel itself, not its first button, so Enter means "open the task". */}
      <DialogContent side="right" className="gap-4" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="space-y-2 pr-8">
          <p className="text-xs text-muted-foreground">
            {task.projectTitle}
            {task.milestone && ` · ◆ ${task.milestone}`}
          </p>
          <DialogTitle className="text-[17px] leading-snug">{task.title}</DialogTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={task.status} />
            {task.professorDeadline && <DeadlineChip date={task.professorDeadline} today={today} kind="professor" status={task.status} />}
            {task.personalDeadline && task.personalDeadline !== task.professorDeadline && (
              <DeadlineChip date={task.personalDeadline} today={today} kind="personal" status={task.status} />
            )}
          </div>
        </div>
        <DialogDescription className="line-clamp-6 text-[13px] whitespace-pre-line text-foreground/85">
          {task.description || "No description yet."}
        </DialogDescription>
        {task.openRequest && (
          <p className="rounded-lg border border-danger/30 bg-wash-danger px-3 py-2 text-[12.5px]">
            <b className="font-medium">Open change request:</b> <span className="text-muted-foreground">&ldquo;{task.openRequest}&rdquo;</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 text-[12.5px]">
          <div className="rounded-lg border bg-surface-2/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">Assignee</p>
            <p className="font-medium">{task.assignee ?? "Unassigned"}</p>
          </div>
          <div className="rounded-lg border bg-surface-2/60 px-3 py-2">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" /> Evidence
            </p>
            <p className="font-medium">
              {task.evidence} · {formatMinutes(task.minutes)} logged
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {task.canLog && (
            <Button variant="outline" asChild className="flex-1">
              <Link href={`/log/new?project=${task.projectId}&task=${task.id}`}>
                <NotebookPen /> Log progress
              </Link>
            </Button>
          )}
          <Button asChild className="flex-1">
            <Link href={full} replace>
              Open task <kbd className="border-white/25 bg-white/15 text-inherit">↵</kbd>
              <ArrowRight className="sm:hidden" />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Space on a focused task link (any list, board or calendar) opens the
 * preview instead of scrolling the page (spec §2.1).
 */
export function PeekKeys() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (!(el instanceof HTMLAnchorElement)) return;
      const match = new URL(el.href, location.origin).pathname.match(/^\/tasks\/([0-9a-f-]{36})$/i);
      if (!match) return;
      e.preventDefault();
      router.push(`/tasks/${match[1]}/peek`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
