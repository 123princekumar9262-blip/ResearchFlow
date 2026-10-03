import Link from "next/link";
import { PageCrumbs } from "@/components/layout/page-crumbs";
import { notFound } from "next/navigation";
import { History, NotebookPen, OctagonAlert, Paperclip, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ProgressBar, Section } from "@/components/common/ui-bits";
import { MobileDetails } from "@/components/common/mobile-details";
import { ChapterTrigger } from "@/components/onboarding/tips";
import { StatusPill } from "@/components/common/status";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { AttachmentList } from "@/components/files/attachment-list";
import { EvidenceUploader } from "@/components/files/evidence-uploader";
import { RiskDot } from "@/components/tasks/task-row";
import { ActivityFeed } from "@/components/tasks/activity-feed";
import { FocusMode } from "@/components/tasks/focus-mode";
import { PendingExtension, RequestExtensionButton } from "@/components/tasks/extension";
import { DeleteTaskButton, DependencyEditor, ReviewPanel, TaskFields, TaskStatusPanel, TaskTitleEditor } from "@/components/tasks/task-controls";
import { isAiEnabled } from "@/lib/ai/remark-to-tasks";
import { getProjectBundle } from "@/lib/data/project";
import { loadRemarkThreads } from "@/lib/data/remarks";
import { requireSession } from "@/lib/auth";
import { taskActivity } from "@/lib/domain/activity";
import { daysBetween, formatDay, formatMinutes, formatShortDate, timeAgo } from "@/lib/domain/dates";
import { delayRisk } from "@/lib/domain/risk";
import type { ExtensionRequest } from "@/types/database";

export async function generateMetadata({ params }: PageProps<"/tasks/[taskId]">) {
  const { taskId } = await params;
  const { supabase } = await requireSession();
  const { data } = await supabase.from("tasks").select("title").eq("id", taskId).maybeSingle();
  return { title: data?.title ?? "Task" };
}

export default async function TaskPage({ params }: PageProps<"/tasks/[taskId]">) {
  const { taskId } = await params;
  const { supabase, userId } = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) notFound();

  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task) notFound();

  const b = await getProjectBundle(task.project_id);
  const { today } = b;

  const [links, attachments, changes, blockers, remarks, sourceRemark, extData] = await Promise.all([
    supabase.from("progress_log_tasks").select("log:progress_logs!progress_log_tasks_log_id_fkey(*)").eq("task_id", taskId),
    supabase.from("attachments").select("*").eq("task_id", taskId).order("created_at"),
    supabase.from("deadline_changes").select("*").eq("task_id", taskId).order("changed_at"),
    supabase.from("blockers").select("*").eq("task_id", taskId).eq("status", "open"),
    loadRemarkThreads(supabase, task.project_id, taskId),
    task.source_remark_id
      ? supabase.from("remarks").select("id, body, author:profiles!remarks_author_id_fkey(full_name)").eq("id", task.source_remark_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("extension_requests").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
  ]);

  const extensions = (extData.data ?? []) as ExtensionRequest[];
  const pendingExtension = extensions.find((e) => e.status === "pending");
  const names: Record<string, string> = Object.fromEntries(b.members.map((m) => [m.user_id, m.full_name]));
  const byId = new Map(b.tasks.map((t) => [t.id, t]));
  const dependsOn = b.dependencies.filter((d) => d.task_id === taskId).flatMap((d) => (byId.has(d.depends_on_id) ? [byId.get(d.depends_on_id)!] : []));
  const blocking = b.dependencies.filter((d) => d.depends_on_id === taskId).flatMap((d) => (byId.has(d.task_id) ? [byId.get(d.task_id)!] : []));
  const logs = (links.data ?? []).flatMap((l) => (l.log ? [l.log] : [])).sort((a, c) => c.log_date.localeCompare(a.log_date));
  const files = attachments.data ?? [];
  const evidenceCount = logs.length + files.length;
  const isProfessor = b.myRole === "professor";
  const milestone = b.milestones.find((m) => m.id === task.milestone_id);
  const openDeps = dependsOn.filter((d) => d.status !== "done");
  const risk = delayRisk({
    task,
    today,
    openBlockers: (blockers.data ?? []).length,
    openDependencies: openDeps.length,
    evidenceCount,
    lastLogDate: logs[0]?.log_date ?? null,
    slipRate: 0,
  });
  const minutes = logs.reduce((s, l) => s + l.minutes_spent, 0);
  const events = taskActivity({ task, changes: changes.data ?? [], logs, attachments: files, extensions });
  const load: Record<string, number> = {};
  for (const t of b.tasks) if (t.id !== taskId && t.status !== "done" && t.effective_deadline) load[t.effective_deadline] = (load[t.effective_deadline] ?? 0) + 1;

  const missedProf = task.professor_deadline && task.professor_deadline < today && task.status !== "done" && task.status !== "in_review";
  const openRequests = remarks.filter((r) => r.kind === "change_request" && (!r.addressed_at || r.converted.some((c) => c.status !== "done")));
  const studentLocked = !b.canSetProfessorDeadline;
  const canRequestExtension = studentLocked && task.status !== "done" && !pendingExtension;
  const logHref = `/log/new?project=${task.project_id}&task=${taskId}`;

  return (
    <div>
      <PageCrumbs
        items={[
          { label: b.project.title, href: `/projects/${b.project.id}` },
          milestone ? { glyph: "◆", label: milestone.title, href: `/projects/${b.project.id}/tasks` } : { label: "Tasks", href: `/projects/${b.project.id}/tasks` },
          { label: task.title },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="rf-stagger min-w-0 space-y-5">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={task.status} />
              {task.professor_deadline && <DeadlineChip date={task.professor_deadline} today={today} kind="professor" status={task.status} locked={studentLocked} />}
              {task.personal_deadline && task.personal_deadline !== task.professor_deadline && (
                <DeadlineChip date={task.personal_deadline} today={today} kind="personal" status={task.status} />
              )}
              <RiskDot risk={risk} />
              {openDeps.length > 0 && task.status !== "done" && <span className="text-xs text-muted-foreground">waiting on {openDeps.length}</span>}
              {task.completed_at && <span className="text-xs text-muted-foreground">closed {timeAgo(task.completed_at)}</span>}
              <span className="ml-auto max-md:hidden">
                <FocusMode
                  taskId={taskId}
                  projectId={task.project_id}
                  title={task.title}
                  description={task.description}
                  professorDeadline={task.professor_deadline}
                  personalDeadline={task.personal_deadline}
                  today={today}
                  canLog={!isProfessor}
                />
              </span>
            </div>
            <TaskTitleEditor task={task} />
            {sourceRemark.data && (
              <p className="rounded-md border-l-2 border-warning bg-warning/5 px-3 py-2 text-xs">
                Created from {sourceRemark.data.author?.full_name ?? "a"}&apos;s remark:{" "}
                <span className="text-muted-foreground">&ldquo;{sourceRemark.data.body.slice(0, 200)}&rdquo;</span>
              </p>
            )}
          </div>

          {missedProf && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/35 bg-danger/[0.05] px-4 py-3">
              <TriangleAlert className="size-4 shrink-0 text-danger" />
              <p className="min-w-0 flex-1">
                <b className="text-danger">
                  Missed the professor deadline by {daysBetween(task.professor_deadline!, today)} day{daysBetween(task.professor_deadline!, today) === 1 ? "" : "s"}.
                </b>{" "}
                <span className="text-muted-foreground">It stays on record. Finish it, or explain what&apos;s in the way.</span>
              </p>
              {canRequestExtension && <RequestExtensionButton projectId={task.project_id} taskId={taskId} currentDeadline={task.professor_deadline} today={today} variant="button" />}
              {!isProfessor && (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/projects/${task.project_id}/blockers`}>Raise a blocker</Link>
                </Button>
              )}
            </div>
          )}

          {openRequests.length > 0 && task.status !== "done" && (
            <a href={`#remark-${openRequests[0].id}`} className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.04] px-4 py-2.5 text-[12.5px] hover:bg-danger/[0.07]">
              <span className="size-2 shrink-0 rounded-full bg-danger" />
              <span>
                <b>{openRequests[0].author_name} requested changes {timeAgo(openRequests[0].created_at)}.</b>{" "}
                {openRequests[0].converted.length > 0
                  ? `${openRequests[0].converted.filter((c) => c.status === "done").length} of ${openRequests[0].converted.length} follow-up task${openRequests[0].converted.length === 1 ? "" : "s"} done.`
                  : "Not addressed yet."}
              </span>
            </a>
          )}

          <ChapterTrigger tour="tasks" part="tasks-page" />
          <Section
            icon={Paperclip}
            tour="evidence"
            title="Evidence"
            count={evidenceCount}
            action={evidenceCount > 0 ? <span className="font-mono">{formatMinutes(minutes)} logged</span> : undefined}
            bodyClassName="p-0"
          >
            {logs.length === 0 && files.length === 0 && (
              <p className="px-3.5 py-3 text-muted-foreground">No evidence yet. Log progress on this task or attach a file or link. Submitting needs at least one.</p>
            )}
            {logs.length > 0 && (
              <ul className="divide-y">
                {logs.map((l) => (
                  <li key={l.id} className="flex gap-3 px-3.5 py-2.5">
                    <span className="w-16 shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground">{formatDay(l.log_date).split(" ").slice(0, 2).join(" ")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-pre-line">{l.completed_work}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Log · {formatMinutes(l.minutes_spent)}
                        {l.author_id !== task.assignee_id && ` · ${names[l.author_id] ?? "Member"}`}
                        {l.problems && <span> · problem: {l.problems.split("\n")[0]}</span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <AttachmentList
              flush={logs.length > 0}
              attachments={files.map((a) => ({
                ...a,
                uploaderName: names[a.uploader_id],
                canDelete: a.uploader_id === userId && task.status !== "done" && task.status !== "in_review",
              }))}
            />
            <div className="flex flex-wrap items-start gap-2 border-t px-3.5 py-2.5">
              {!isProfessor && (
                <Button asChild size="sm" variant="outline">
                  <Link href={logHref}>
                    <NotebookPen /> Log progress on this task
                  </Link>
                </Button>
              )}
              <EvidenceUploader projectId={task.project_id} target={{ taskId }} />
            </div>
          </Section>

          <ActivityFeed
            remarks={remarks}
            events={events}
            names={names}
            projectId={task.project_id}
            taskId={taskId}
            viewerRole={b.myRole}
            today={today}
            aiEnabled={isAiEnabled()}
          />

          {/* "contents" keeps the bar a child of the scrolling column, so it can stick. */}
          <div className="contents md:hidden">
            {isProfessor && task.status === "in_review" ? (
              <ReviewPanel taskId={taskId} />
            ) : (
              <div data-tour="status-panel" className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
                <TaskStatusPanel task={task} isProfessor={isProfessor} hasProfessor={b.hasProfessor} evidenceCount={evidenceCount} openDependencies={openDeps.map((d) => d.title)} logHref={isProfessor ? undefined : logHref} compact />
              </div>
            )}
          </div>
        </div>

        <aside className="rf-stagger space-y-3 lg:sticky lg:top-16 lg:self-start">
          <div className="max-md:hidden" data-tour="status-panel">
            {isProfessor && task.status === "in_review" ? (
              <ReviewPanel taskId={taskId} />
            ) : (
              <div className="rounded-[10px] border bg-card p-3">
                <TaskStatusPanel task={task} isProfessor={isProfessor} hasProfessor={b.hasProfessor} evidenceCount={evidenceCount} openDependencies={openDeps.map((d) => d.title)} logHref={isProfessor ? undefined : logHref} />
              </div>
            )}
          </div>

          {pendingExtension && (
            <PendingExtension
              request={pendingExtension}
              studentName={names[pendingExtension.requested_by] ?? "A student"}
              isProfessor={isProfessor}
              isRequester={pendingExtension.requested_by === userId}
            />
          )}

          {(blockers.data ?? []).length > 0 && (
            <div className="rounded-[10px] border border-danger/30 bg-danger/[0.04] p-3">
              {(blockers.data ?? []).map((bl) => (
                <Link key={bl.id} href={`/projects/${task.project_id}/blockers#blocker-${bl.id}`} className="flex items-start gap-2 hover:underline">
                  <OctagonAlert className="mt-0.5 size-4 shrink-0 text-danger" /> <span>Blocked: {bl.title}</span>
                </Link>
              ))}
            </div>
          )}

          <MobileDetails summary="Details" hint="Assignee, deadlines, dependencies, history">
          <div className="rounded-[10px] border bg-card px-3 py-1">
            {task.estimate_hours !== null && (
              <div className="flex items-center gap-3 border-b py-2.5 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground">Logged</span>
                <ProgressBar value={minutes / (Number(task.estimate_hours) * 60)} tone={minutes > Number(task.estimate_hours) * 60 ? "danger" : "primary"} className="flex-1" />
                <span className="shrink-0 font-mono tabular">
                  {formatMinutes(minutes)} / {formatMinutes(Number(task.estimate_hours) * 60)}
                </span>
              </div>
            )}
            <TaskFields
              task={task}
              members={b.members}
              milestones={b.milestones}
              canSetProfessorDeadline={b.canSetProfessorDeadline}
              isProfessor={isProfessor}
              today={today}
              load={load}
              extensionSlot={
                canRequestExtension ? (
                  <span key="extension" data-tour="extension" className="inline-flex">
                    <RequestExtensionButton projectId={task.project_id} taskId={taskId} currentDeadline={task.professor_deadline} today={today} />
                  </span>
                ) : undefined
              }
            />
          </div>

          <div className="rounded-[10px] border bg-card p-3" data-tour="dependencies">
            <DependencyEditor
              taskId={taskId}
              dependsOn={dependsOn}
              blocking={blocking}
              candidates={b.tasks.filter((t) => t.status !== "done").map(({ id, title }) => ({ id, title }))}
            />
          </div>

          {(changes.data ?? []).length > 0 && (
            <div className="rounded-[10px] border bg-card p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <History className="size-3.5" /> Deadline history
              </p>
              <ol className="space-y-1.5 text-xs">
                {(changes.data ?? []).map((c) => {
                  const later = c.old_value && c.new_value && c.new_value > c.old_value;
                  return (
                    <li key={c.id} className="flex flex-wrap gap-x-1.5">
                      <span className="font-medium">{c.field === "professor" ? "Prof" : "Mine"}:</span>
                      <span className={cn(later && "text-warning")}>
                        {c.old_value ? formatShortDate(c.old_value) : "none"} → {c.new_value ? formatShortDate(c.new_value) : "none"}
                      </span>
                      <span className="text-muted-foreground">
                        {c.changed_by ? (names[c.changed_by] ?? "someone") : "system"} · {timeAgo(c.changed_at)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {extensions.filter((e) => e.status !== "pending").length > 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              {extensions.filter((e) => e.status !== "pending").length} past extension request{extensions.filter((e) => e.status !== "pending").length === 1 ? "" : "s"} ·{" "}
              {extensions
                .filter((e) => e.status !== "pending")
                .map((e) => `${e.status} for ${formatDay(e.proposed_deadline)}`)
                .join(", ")}
            </p>
          )}
          <p className="px-1 text-xs text-muted-foreground">
            Created by {names[task.created_by] ?? "a former member"} {timeAgo(task.created_at)}
            {task.submitted_at && ` · last submitted ${timeAgo(task.submitted_at)}`}
          </p>
          {(isProfessor || (task.created_by === userId && !task.professor_deadline && (task.status === "todo" || task.status === "in_progress"))) && (
            <DeleteTaskButton taskId={taskId} projectId={task.project_id} />
          )}
          </MobileDetails>
        </aside>
      </div>
    </div>
  );
}
