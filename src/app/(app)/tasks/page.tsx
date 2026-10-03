import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, CalendarDays, Hourglass, ListChecks } from "lucide-react";
import { cn } from "cn";
import { EmptyState, PageHeader, Section, SectionGroup } from "@/components/common/ui-bits";
import { Tip } from "@/components/onboarding/tips";
import { TaskRow } from "@/components/tasks/task-row";
import { getWorkspace } from "@/lib/data/workspace";
import { addDays, formatDay } from "@/lib/domain/dates";
import { compareByDeadline } from "@/lib/domain/deadlines";
import { delayRisk } from "@/lib/domain/risk";
import type { Task } from "@/types/database";

export const metadata = { title: "My tasks" };

const VIEWS = [
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "review", label: "Waiting on professor" },
  { key: "all", label: "All open" },
] as const;
type View = (typeof VIEWS)[number]["key"];

/** Every task assigned to me across projects, in saved views. */
export default async function MyTasksPage({ searchParams }: PageProps<"/tasks">) {
  const ws = await getWorkspace();
  if (ws.profile.role === "professor") redirect("/reviews");
  const { view: raw } = await searchParams;
  const { userId, today } = ws;

  const mine = ws.tasks.filter((t) => t.status !== "done" && (t.assignee_id === userId || t.assignee_id === null));
  const status = new Map(ws.tasks.map((t) => [t.id, t.status]));
  const blocked = new Set(ws.dependencies.filter((d) => status.get(d.depends_on_id) !== "done").map((d) => d.task_id));
  const projectTitle = new Map(ws.projects.map((p) => [p.id, p.title]));

  const isOverdue = (t: Task) => t.status !== "in_review" && !!t.effective_deadline && t.effective_deadline < today;
  const sets: Record<View, Task[]> = {
    overdue: mine.filter(isOverdue),
    today: mine.filter((t) => !isOverdue(t) && t.status !== "in_review" && (t.effective_deadline === today || t.status === "in_progress" || t.status === "changes_requested")),
    upcoming: mine.filter((t) => t.status !== "in_review" && t.effective_deadline && t.effective_deadline > today && t.effective_deadline <= addDays(today, 14)),
    review: mine.filter((t) => t.status === "in_review"),
    all: mine,
  };
  const defaultView: View = sets.overdue.length ? "overdue" : "today";
  const view: View = VIEWS.some((v) => v.key === raw) ? (raw as View) : defaultView;
  const tasks = [...sets[view]].sort(compareByDeadline);

  const row = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      today={today}
      projectTitle={projectTitle.get(t.project_id)}
      blocked={blocked.has(t.id)}
      evidence={ws.evidence.get(t.id)?.count}
      risk={delayRisk({
        task: t,
        today,
        openBlockers: ws.blockers.filter((b) => b.task_id === t.id).length,
        openDependencies: ws.dependencies.filter((d) => d.task_id === t.id && status.get(d.depends_on_id) !== "done").length,
        evidenceCount: ws.evidence.get(t.id)?.count ?? 0,
        lastLogDate: ws.evidence.get(t.id)?.lastLog ?? null,
        slipRate: 0,
      })}
    />
  );

  // Group upcoming by day, everything else by project.
  const groups: { label: string; tasks: Task[] }[] =
    view === "upcoming"
      ? [...new Set(tasks.map((t) => t.effective_deadline!))].map((d) => ({ label: formatDay(d), tasks: tasks.filter((t) => t.effective_deadline === d) }))
      : [...new Set(tasks.map((t) => t.project_id))].map((p) => ({ label: projectTitle.get(p) ?? "Project", tasks: tasks.filter((t) => t.project_id === p) }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader inTopBar title="My tasks" description="Everything assigned to you, across projects." />
      {sets.overdue.length > 0 && view !== "overdue" && (
        <Tip
          id="overdue"
          kind="state"
          tone="danger"
          className="mb-4"
          title={`You have ${sets.overdue.length} overdue task${sets.overdue.length === 1 ? "" : "s"}.`}
          cta={{ label: "Review overdue", href: "/tasks?view=overdue" }}
        >
          Review them now: finish them, or request an extension.
        </Tip>
      )}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="inline-flex min-w-max rounded-lg border bg-card p-0.5" role="tablist" aria-label="Views">
          {VIEWS.map((v) => {
            const count = sets[v.key].length;
            return (
              <Link
                key={v.key}
                href={`/tasks?view=${v.key}`}
                role="tab"
                aria-selected={view === v.key}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px]",
                  view === v.key ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
                <span className={cn("font-mono text-[10.5px]", v.key === "overdue" && count > 0 ? "font-semibold text-danger" : "opacity-60")}>{count}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={ListChecks} title={view === "overdue" ? "Nothing overdue" : view === "review" ? "Nothing waiting on your professor" : "Nothing here"}>
            {view === "overdue" ? "Keep it that way." : view === "today" ? "Nothing due today and nothing in progress. Pick the next task from Upcoming." : "Tasks appear here as they match this view."}
          </EmptyState>
        </div>
      ) : (
        <Section
          icon={view === "overdue" ? AlarmClock : view === "review" ? Hourglass : view === "upcoming" ? CalendarDays : ListChecks}
          accent={view === "today" ? "deadline" : undefined}
          title={VIEWS.find((v) => v.key === view)!.label}
          count={tasks.length}
          tone={view === "overdue" ? "danger" : view === "review" ? "info" : undefined}
          alert={view === "overdue"}
        >
          {groups.map((g, i) => (
            <div key={g.label}>
              <SectionGroup first={i === 0}>{g.label}</SectionGroup>
              <div className="divide-y">{g.tasks.map(row)}</div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
