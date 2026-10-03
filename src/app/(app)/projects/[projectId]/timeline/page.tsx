import Link from "next/link";
import { GanttChart } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/common/ui-bits";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getProjectBundle } from "@/lib/data/project";
import { addDays, addMonths, daysBetween, formatDay, formatMonth, monthStartOf } from "@/lib/domain/dates";
import { STATUS_META, StatusIcon } from "@/components/common/status";
import { DeadlineChip } from "@/components/common/deadline-chip";
import type { Task } from "@/types/database";

export default async function ProjectTimelinePage({ params }: PageProps<"/projects/[projectId]/timeline">) {
  const { projectId } = await params;
  const b = await getProjectBundle(projectId);
  const { project, today } = b;

  const dates = [
    project.start_date,
    project.target_end_date,
    today,
    ...b.milestones.map((m) => m.due_date),
    ...b.tasks.flatMap((t) => [t.professor_deadline, t.personal_deadline]),
  ].filter((d): d is string => !!d);
  const start = dates.reduce((min, d) => (d < min ? d : min));
  const end = addDays(dates.reduce((max, d) => (d > max ? d : max)), 7);
  const span = Math.max(1, daysBetween(start, end));
  const x = (d: string) => `${(daysBetween(start, d) / span) * 100}%`;

  const months: string[] = [];
  for (let m = monthStartOf(start); m <= end; m = addMonths(m, 1)) if (m >= start) months.push(m);

  const sorted = [...b.milestones].sort((a, c) => (a.due_date ?? "9999").localeCompare(c.due_date ?? "9999"));
  const rows = sorted.map((m, i) => {
    const prevDue = sorted.slice(0, i).reverse().find((p) => p.due_date)?.due_date;
    const tasks = b.tasks.filter((t) => t.milestone_id === m.id);
    return {
      key: m.id,
      title: m.title,
      from: prevDue ?? project.start_date,
      to: m.due_date,
      tasks,
      done: tasks.length > 0 && tasks.every((t) => t.status === "done"),
    };
  });
  const loose = b.tasks.filter((t) => !t.milestone_id || !b.milestones.some((m) => m.id === t.milestone_id));
  if (loose.length > 0) rows.push({ key: "none", title: "No milestone", from: project.start_date, to: null, tasks: loose, done: false });

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={GanttChart} title="Nothing to plot yet">
          Add milestones with due dates and tasks with deadlines on the Overview and Tasks tabs.
        </EmptyState>
      </div>
    );
  }

  const marker = (t: Task) => {
    const d = t.effective_deadline;
    if (!d) return null;
    const late = t.status !== "done" && d < today;
    return (
      <Tooltip key={t.id}>
        <TooltipTrigger asChild>
          <Link
            href={`/tasks/${t.id}`}
            className={cn(
              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border transition-transform hover:scale-150",
              t.status === "done" ? "border-success bg-success" : late ? "border-danger bg-danger" : t.professor_deadline === d ? "border-foreground bg-card" : "border-muted-foreground bg-muted",
            )}
            style={{ left: x(d) }}
            aria-label={`${t.title}, due ${formatDay(d)}`}
          />
        </TooltipTrigger>
        <TooltipContent>
          {t.title} · {STATUS_META[t.status].label} · due {formatDay(d)}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-3">
      {/* Phones: one card per milestone, with its date range as a bar (spec §6.2). */}
      <div className="rf-stagger space-y-3 md:hidden">
        {rows.map((r) => {
          const overdue = r.to && r.to < today && !r.done;
          const doneCount = r.tasks.filter((t) => t.status === "done").length;
          const elapsed = r.to ? Math.min(1, Math.max(0, daysBetween(r.from, today) / Math.max(1, daysBetween(r.from, r.to)))) : 0;
          return (
            <section key={r.key} className="overflow-hidden rounded-[10px] border bg-card shadow-[var(--shadow-card)]">
              <div className="flex items-start gap-2 px-3.5 pt-3">
                {r.key !== "none" && <span className={cn("mt-0.5", r.done ? "text-success" : overdue ? "text-danger" : "text-primary")}>◆</span>}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doneCount}/{r.tasks.length} done{r.to ? ` · ${formatDay(r.from)} → ${formatDay(r.to)}` : ""}
                  </p>
                </div>
                {r.to && <DeadlineChip date={r.to} today={today} kind="milestone" status={r.done ? "done" : undefined} />}
              </div>
              {r.to && (
                <div className="px-3.5 pt-2.5">
                  <div className={cn("relative h-2 overflow-hidden rounded-full", r.done ? "bg-success/15" : overdue ? "bg-danger/12" : "bg-primary/12")}>
                    <div
                      className={cn("rf-grow absolute inset-y-0 left-0 rounded-full", r.done ? "bg-success" : overdue ? "bg-danger" : "bg-grad-primary")}
                      style={{ width: `${(r.done ? 1 : elapsed) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">{r.done ? "Complete" : overdue ? "Past its due date" : `${Math.round(elapsed * 100)}% of the time used`}</p>
                </div>
              )}
              <ul className="mt-2 divide-y border-t">
                {r.tasks.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="flex min-h-10 items-center gap-2 px-3.5 py-2 text-[13px]">
                      <StatusIcon status={t.status} />
                      <span className={cn("min-w-0 flex-1 truncate", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                      {t.effective_deadline && <DeadlineChip date={t.effective_deadline} today={today} kind={t.professor_deadline === t.effective_deadline ? "professor" : "personal"} status={t.status} />}
                    </Link>
                  </li>
                ))}
                {r.tasks.length > 6 && <li className="px-3.5 py-2 text-xs text-muted-foreground">+{r.tasks.length - 6} more on the Tasks tab</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card max-md:hidden">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[12rem_1fr] border-b text-xs text-muted-foreground">
            <div className="px-4 py-2">Milestone</div>
            <div className="relative h-8">
              {months.map((m) => (
                <span key={m} className="absolute top-2 border-l pl-1.5" style={{ left: x(m) }}>
                  {formatMonth(m)}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 left-48">
              <div className="absolute inset-y-0 w-px bg-primary" style={{ left: x(today) }}>
                <span className="absolute -top-0 left-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">today</span>
              </div>
              {project.target_end_date && <div className="absolute inset-y-0 w-px border-l border-dashed border-muted-foreground/60" style={{ left: x(project.target_end_date) }} />}
            </div>
            {rows.map((r) => {
              const overdue = r.to && r.to < today && !r.done;
              return (
                <div key={r.key} className="grid grid-cols-[12rem_1fr] border-b last:border-0">
                  <div className="truncate px-4 py-3 text-[13px]" title={r.title}>
                    {r.key !== "none" && <span className={cn("mr-1.5", r.done ? "text-success" : "text-primary")}>◆</span>}
                    {r.title}
                    <span className="block text-[11px] text-muted-foreground">
                      {r.tasks.filter((t) => t.status === "done").length}/{r.tasks.length} done{r.to ? ` · due ${formatDay(r.to)}` : ""}
                    </span>
                  </div>
                  <div className="relative h-14">
                    {r.to && (
                      <div
                        className={cn(
                          "absolute top-1/2 h-5 -translate-y-1/2 rounded-md",
                          r.done ? "bg-success/20" : overdue ? "bg-danger/15 ring-1 ring-danger/40" : "bg-primary/15",
                        )}
                        style={{ left: x(r.from), width: `calc(${x(r.to)} - ${x(r.from)})` }}
                      />
                    )}
                    {r.tasks.map(marker)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="flex flex-wrap gap-4 text-xs text-muted-foreground max-md:hidden">
        <span>◆ outlined: professor deadline · grey: personal deadline · red: overdue · green: done</span>
        {project.target_end_date && <span>Dashed line: target end {formatDay(project.target_end_date)}</span>}
      </p>
    </div>
  );
}
