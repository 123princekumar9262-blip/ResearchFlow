import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { UserAvatar } from "@/components/common/ui-bits";
import { AttachmentList, type AttachmentView } from "@/components/files/attachment-list";
import { StatusIcon } from "@/components/common/status";
import { LogComments } from "./log-comments";
import { dateIn, daysBetween, formatMinutes } from "@/lib/domain/dates";
import type { ProgressLog, TaskStatus } from "@/types/database";

export interface LogComment {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
  authorRole: string;
}

export type LogView = ProgressLog & {
  authorName: string;
  projectTitle?: string;
  tasks: { id: string; title: string; status: TaskStatus }[];
  attachments: AttachmentView[];
  comments: LogComment[];
};

/** One day's entry. Marks honestly when it was written after the day it describes. */
export function LogEntry({ log, timeZone, showAuthor }: { log: LogView; timeZone: string; showAuthor?: boolean }) {
  const lateBy = daysBetween(log.log_date, dateIn(log.created_at, timeZone));
  return (
    <article id={`log-${log.id}`} className="scroll-mt-20 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow duration-200 target:ring-2 target:ring-primary/40 hover:shadow-[var(--shadow-lift)]">
      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {showAuthor && (
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <UserAvatar name={log.authorName} className="size-5 text-[9px]" />
            {log.authorName}
          </span>
        )}
        {log.projectTitle && (
          <Link href={`/projects/${log.project_id}/logs`} className="font-medium text-foreground hover:underline">
            {log.projectTitle}
          </Link>
        )}
        <span className="flex items-center gap-1 font-mono tabular">
          <Clock className="size-3" /> {formatMinutes(log.minutes_spent)}
        </span>
        {lateBy > 0 && (
          <span className="rounded bg-muted px-1.5" title="Logs can be written up to two days after the day they describe">
            written {lateBy} day{lateBy === 1 ? "" : "s"} later
          </span>
        )}
      </header>
      <div className="space-y-2">
        <p className="flex gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Completed" />
          <span className="whitespace-pre-line">{log.completed_work}</span>
        </p>
        {log.problems && (
          <p className="flex gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Problems" />
            <span className="whitespace-pre-line">{log.problems}</span>
          </p>
        )}
        {log.next_steps && (
          <p className="flex gap-2 text-muted-foreground">
            <ArrowRight className="mt-0.5 size-4 shrink-0" aria-label="Next steps" />
            <span className="whitespace-pre-line">{log.next_steps}</span>
          </p>
        )}
      </div>
      {log.tasks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {log.tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs hover:bg-accent">
              <StatusIcon status={t.status} className="size-3" /> {t.title}
            </Link>
          ))}
        </div>
      )}
      {log.attachments.length > 0 && (
        <div className="mt-3">
          <AttachmentList attachments={log.attachments} />
        </div>
      )}
      <LogComments logId={log.id} projectId={log.project_id} comments={log.comments} />
    </article>
  );
}
