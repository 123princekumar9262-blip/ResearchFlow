import Link from "next/link";
import { Columns3, List, ListTodo } from "lucide-react";
import { cn } from "cn";
import { EmptyState, UserAvatar } from "@/components/common/ui-bits";
import { PriorityIcon, StatusLabel } from "@/components/common/status";
import { BoardFilters } from "@/components/tasks/board-filters";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { FirstTaskTip } from "@/components/onboarding/tip-kinds";
import { MobileTaskList } from "@/components/tasks/mobile-task-list";
import { TaskBoard, type BoardTask } from "@/components/tasks/task-board";
import { TaskDeadlines } from "@/components/tasks/task-row";
import { getProjectBundle } from "@/lib/data/project";
import { getDisclosure } from "@/lib/data/disclosure";
import { compareByDeadline } from "@/lib/domain/deadlines";

export default async function ProjectTasksPage({ params, searchParams }: PageProps<"/projects/[projectId]/tasks">) {
  const { projectId } = await params;
  const { view, assignee, milestone, hide } = await searchParams;
  const b = await getProjectBundle(projectId);
  const { supabase, today } = b;
  const listView = view === "list";

  const taskIds = b.tasks.map((t) => t.id);
  const [links, attachments, blockers] = await Promise.all([
    taskIds.length ? supabase.from("progress_log_tasks").select("task_id").in("task_id", taskIds) : { data: [] },
    supabase.from("attachments").select("task_id").eq("project_id", projectId).not("task_id", "is", null),
    supabase.from("blockers").select("task_id").eq("project_id", projectId).eq("status", "open").not("task_id", "is", null),
  ]);

  const count = (rows: { task_id: string | null }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.task_id) m.set(r.task_id, (m.get(r.task_id) ?? 0) + 1);
    return m;
  };
  const evidence = count([...(links.data ?? []), ...(attachments.data ?? [])]);
  const blockerCount = count(blockers.data);
  const status = new Map(b.tasks.map((t) => [t.id, t.status]));
  const blocked = new Set(b.dependencies.filter((d) => status.get(d.depends_on_id) !== "done").map((d) => d.task_id));
  const names = new Map(b.members.map((m) => [m.user_id, m.full_name]));
  const milestoneTitle = new Map(b.milestones.map((m) => [m.id, m.title]));

  const allTasks: BoardTask[] = [...b.tasks].sort(compareByDeadline).map((t) => ({
    ...t,
    assigneeName: t.assignee_id ? (names.get(t.assignee_id) ?? null) : null,
    evidence: evidence.get(t.id) ?? 0,
    blocked: blocked.has(t.id),
    openBlockers: blockerCount.get(t.id) ?? 0,
    milestoneTitle: t.milestone_id ? (milestoneTitle.get(t.milestone_id) ?? null) : null,
  }));
  const tasks = allTasks.filter(
    (t) =>
      (typeof assignee !== "string" || t.assignee_id === assignee) &&
      (typeof milestone !== "string" || t.milestone_id === milestone) &&
      (hide !== "done" || t.status !== "done"),
  );

  // Filtering three tasks is noise: views and filters come with the fifth (or a filter already in the URL).
  const { stage, all } = await getDisclosure();
  const tools = allTasks.length >= 5 || stage === 3 || all || typeof assignee === "string" || typeof milestone === "string" || hide === "done" || listView;

  const lockProfessorDeadlines = !b.canSetProfessorDeadline;
  const load: Record<string, number> = {};
  for (const t of b.tasks) if (t.status !== "done" && t.effective_deadline) load[t.effective_deadline] = (load[t.effective_deadline] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Views and filters arrive with the fifth task (calm redesign spec, Phase 03). */}
        {tools && (
          <>
            <div className="inline-flex rounded-md border p-0.5 max-md:hidden" role="group" aria-label="View">
              {[
                { key: "board", label: "Board", icon: Columns3, href: `/projects/${projectId}/tasks` },
                { key: "list", label: "List", icon: List, href: `/projects/${projectId}/tasks?view=list` },
              ].map((v) => {
                const active = (v.key === "list") === listView;
                return (
                  <Link
                    key={v.key}
                    href={v.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded px-2.5 text-xs",
                      active ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <v.icon className="size-3.5" /> {v.label}
                  </Link>
                );
              })}
            </div>
            <BoardFilters
              assignees={b.members
                .filter((m) => m.role === "student" || b.tasks.some((t) => t.assignee_id === m.user_id))
                .map((m) => ({ value: m.user_id, label: m.user_id === b.userId ? "Me" : m.full_name }))}
              milestones={b.milestones.map((m) => ({ value: m.id, label: m.title }))}
              doneCount={allTasks.filter((t) => t.status === "done").length}
            />
            <p className="text-xs text-muted-foreground max-md:hidden">
              {lockProfessorDeadlines
                ? "Submitting for review needs evidence. Your professor approves."
                : b.hasProfessor
                  ? "You approve tasks submitted for review."
                  : "Solo project: close tasks yourself once they have evidence."}
            </p>
          </>
        )}
        <div className="ml-auto">
          <NewTaskDialog
            projectId={projectId}
            milestones={b.milestones}
            members={b.members}
            me={b.userId}
            today={today}
            canSetProfessorDeadline={b.canSetProfessorDeadline}
            load={load}
          />
        </div>
      </div>

      {tasks.length === 0 && allTasks.length > 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground">No tasks match these filters.</p>
      ) : tasks.length === 0 ? (
        <div className="space-y-3">
          <FirstTaskTip />
          <div className="rounded-xl border bg-card">
            <EmptyState icon={ListTodo} title="No tasks yet">
              Break the first milestone into tasks you can finish in a few days. Press <kbd>C</kbd> to create one.
            </EmptyState>
          </div>
        </div>
      ) : listView ? (
        <>
          <div className="max-md:hidden">
            <TaskList tasks={tasks} milestones={b.milestones} today={today} locked={lockProfessorDeadlines} />
          </div>
          <div className="md:hidden">
            <MobileTaskList tasks={tasks} today={today} />
          </div>
        </>
      ) : (
        <>
          <div className="hidden md:block">
            <TaskBoard tasks={tasks} today={today} lockProfessorDeadlines={lockProfessorDeadlines} isProfessor={b.myRole === "professor"} />
          </div>
          {/* Phones: one status at a time (no dragging on small screens). */}
          <div className="md:hidden">
            <MobileTaskList tasks={tasks} today={today} />
          </div>
        </>
      )}
    </div>
  );
}

function TaskList({ tasks, milestones, today, locked }: { tasks: BoardTask[]; milestones: { id: string; title: string }[]; today: string; locked: boolean }) {
  const groups = [
    ...milestones.map((m) => ({ key: m.id, title: `◆ ${m.title}`, tasks: tasks.filter((t) => t.milestone_id === m.id) })),
    { key: "none", title: "No milestone", tasks: tasks.filter((t) => !t.milestone_id || !milestones.some((m) => m.id === t.milestone_id)) },
  ].filter((g) => g.tasks.length > 0);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[720px] text-left">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-2 font-normal">Task</th>
            <th className="px-2 py-2 font-normal">Status</th>
            <th className="px-2 py-2 font-normal">Deadlines</th>
            <th className="px-2 py-2 font-normal">Assignee</th>
            <th className="px-4 py-2 text-right font-normal">Evidence</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key} className="divide-y border-b last:border-0">
            <tr className="bg-muted/40">
              <th colSpan={5} className="px-4 py-1.5 text-xs font-medium">
                {g.title}{" "}
                <span className="font-normal text-muted-foreground">
                  · {g.tasks.filter((t) => t.status === "done").length}/{g.tasks.length} done
                </span>
              </th>
            </tr>
            {g.tasks.map((t) => (
              <tr key={t.id} className="hover:bg-accent/40">
                <td className="px-4 py-2">
                  <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 hover:underline">
                    <PriorityIcon priority={t.priority} />
                    <span className={cn("truncate", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                    {t.blocked && <span className="text-xs text-muted-foreground">(waiting)</span>}
                    {t.openBlockers > 0 && <span className="text-xs text-danger">⛔</span>}
                  </Link>
                </td>
                <td className="px-2 text-xs whitespace-nowrap">
                  <StatusLabel status={t.status} />
                </td>
                <td className="px-2">
                  <TaskDeadlines task={t} today={today} locked={locked} />
                </td>
                <td className="px-2">{t.assigneeName ? <UserAvatar name={t.assigneeName} /> : <span className="text-xs text-muted-foreground">–</span>}</td>
                <td className="px-4 text-right font-mono text-xs tabular">{t.evidence || "–"}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
