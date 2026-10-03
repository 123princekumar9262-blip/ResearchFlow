import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Inbox, NotebookPen } from "lucide-react";
import { cn } from "cn";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { EmptyState, PageHeader, UserAvatar } from "@/components/common/ui-bits";
import { StatusIcon } from "@/components/common/status";
import { AttachmentList } from "@/components/files/attachment-list";
import { RemarkThread } from "@/components/remarks/remark-thread";
import { ReviewPanel } from "@/components/tasks/task-controls";
import { ReviewKeys } from "@/components/tasks/review-keys";
import { getWorkspace } from "@/lib/data/workspace";
import { loadRemarkThreads } from "@/lib/data/remarks";
import { formatDay, formatMinutes, timeAgo } from "@/lib/domain/dates";

export const metadata = { title: "Review queue" };

/**
 * Split view for professors: submissions on the left (oldest first), the
 * selected one's evidence and history on the right, verdict at the bottom.
 * A approves, R requests changes, J/K move through the queue.
 */
export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  const ws = await getWorkspace();
  if (ws.profile.role !== "professor") redirect("/tasks?view=review");
  const { task: selectedParam } = await searchParams;
  const { supabase, userId, today } = ws;

  const myProjects = new Set(ws.members.filter((m) => m.user_id === userId && m.role === "professor").map((m) => m.project_id));
  const names = new Map(ws.members.map((m) => [m.user_id, m.full_name]));
  const projectTitle = new Map(ws.projects.map((p) => [p.id, p.title]));
  const queue = ws.tasks
    .filter((t) => t.status === "in_review" && myProjects.has(t.project_id))
    .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));

  const selected = queue.find((t) => t.id === selectedParam) ?? (typeof selectedParam === "string" ? undefined : queue[0]);
  const index = selected ? queue.indexOf(selected) : -1;
  const hrefFor = (i: number) => (queue[i] ? `/reviews?task=${queue[i].id}` : null);
  const nextAfterVerdict = queue[index + 1] ? hrefFor(index + 1) : queue[index - 1] ? hrefFor(index - 1) : "/reviews";

  let detail: React.ReactNode = null;
  if (selected) {
    const [links, attachments, remarks] = await Promise.all([
      supabase.from("progress_log_tasks").select("log:progress_logs!progress_log_tasks_log_id_fkey(*)").eq("task_id", selected.id),
      supabase.from("attachments").select("*").eq("task_id", selected.id).order("created_at"),
      loadRemarkThreads(supabase, selected.project_id, selected.id),
    ]);
    const logs = (links.data ?? []).flatMap((l) => (l.log ? [l.log] : [])).sort((a, b) => b.log_date.localeCompare(a.log_date));
    const minutes = logs.reduce((s, l) => s + l.minutes_spent, 0);
    const student = selected.assignee_id ? names.get(selected.assignee_id) : null;

    detail = (
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Link href="/reviews?task=" className="inline-flex items-center gap-1 text-xs text-muted-foreground lg:hidden">
            <ChevronLeft className="size-3.5" /> Queue
          </Link>
          <p className="text-xs text-muted-foreground">
            {projectTitle.get(selected.project_id)} · submitted {selected.submitted_at ? timeAgo(selected.submitted_at) : "recently"}
            {student && ` by ${student}`}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            <Link href={`/tasks/${selected.id}`} className="hover:underline">
              {selected.title}
            </Link>
          </h2>
          <div className="flex flex-wrap gap-2">
            {selected.professor_deadline && <DeadlineChip date={selected.professor_deadline} today={today} kind="professor" status={selected.status} />}
            <span className="text-xs text-muted-foreground">
              {logs.length + (attachments.data ?? []).length} pieces of evidence · {formatMinutes(minutes)} logged
            </span>
          </div>
          {selected.description && <p className="whitespace-pre-line text-muted-foreground">{selected.description}</p>}
        </div>

        <ReviewPanel taskId={selected.id} keyboard nextHref={nextAfterVerdict} />

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold">Evidence</h3>
          {logs.length === 0 && (attachments.data ?? []).length === 0 && <p className="text-muted-foreground">No evidence attached.</p>}
          {logs.map((l) => (
            <article key={l.id} className="rounded-[10px] border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <NotebookPen className="size-3" /> {formatDay(l.log_date)} · {formatMinutes(l.minutes_spent)}
              </p>
              <p className="mt-1 whitespace-pre-line">{l.completed_work}</p>
              {l.problems && <p className="mt-1 text-xs text-warning">Problem: {l.problems}</p>}
              {l.next_steps && <p className="mt-1 text-xs text-muted-foreground">Next: {l.next_steps}</p>}
            </article>
          ))}
          <AttachmentList attachments={(attachments.data ?? []).map((a) => ({ ...a, uploaderName: names.get(a.uploader_id) }))} />
        </section>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold">Remarks on this task</h3>
          <RemarkThread remarks={remarks} projectId={selected.project_id} taskId={selected.id} viewerRole="professor" today={today} aiEnabled={false} />
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHeader inTopBar title="Review queue" description="Submissions waiting for your verdict, oldest first." />
      {queue.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Inbox} title="Nothing to review">
            When a student submits a task with its evidence, it appears here.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ReviewKeys prev={hrefFor(index - 1)} next={hrefFor(index + 1)} />
          <ol className={cn("space-y-1.5 lg:sticky lg:top-16 lg:self-start", selected && "hidden lg:block")}>
            {queue.map((t) => {
              const on = t.id === selected?.id;
              const student = t.assignee_id ? names.get(t.assignee_id) : null;
              return (
                <li key={t.id}>
                  <Link
                    href={`/reviews?task=${t.id}`}
                    aria-current={on ? "true" : undefined}
                    className={cn("flex gap-2.5 rounded-[10px] border bg-card p-3 transition-colors hover:border-primary/40", on && "border-primary/60 ring-2 ring-primary/15")}
                  >
                    <StatusIcon status="in_review" className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {student && <UserAvatar name={student} className="size-4 text-[8px] ring-0" />}
                        {student ?? "Unassigned"} · {ws.evidence.get(t.id)?.count ?? 0} evidence · {t.submitted_at ? timeAgo(t.submitted_at) : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          {detail ?? <p className="hidden text-muted-foreground lg:block">Pick a submission.</p>}
        </div>
      )}
    </div>
  );
}
