import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Flame, NotebookPen } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState, Stat } from "@/components/common/ui-bits";
import { Heatmap } from "@/components/logs/heatmap";
import { LogEntry } from "@/components/logs/log-entry";
import { LogForm } from "@/components/logs/log-form";
import { requireSession } from "@/lib/auth";
import { loadLogs } from "@/lib/data/logs";
import { composerData } from "@/lib/data/log-composer";
import { activityByDay, logStreak, minutesPerWeek } from "@/lib/domain/analytics";
import { addDays, eachDay, formatMinutes, isoWeekday, isoWeekNumber, weekStartOf } from "@/lib/domain/dates";

export const metadata = { title: "Progress log" };

const WEEKDAY = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The research diary: today's entry on top, then every day, gaps included. */
export default async function LogPage({ searchParams }: PageProps<"/log">) {
  const params = await searchParams;
  const { supabase, userId, profile, today } = await requireSession();
  if (profile.role === "professor") redirect("/dashboard");

  const projectFilter = typeof params.filter_project === "string" ? params.filter_project : "";
  const only = typeof params.only === "string" ? params.only : "";

  const [projects, tasks, logs] = await Promise.all([
    supabase.from("projects").select("id, title").in("status", ["active", "on_hold"]).order("updated_at", { ascending: false }),
    supabase.from("tasks").select("id, title, status, project_id, assignee_id, updated_at").neq("status", "done").order("effective_deadline", { nullsFirst: false }),
    loadLogs(supabase, { authorId: userId, since: addDays(today, -7 * 12) }, userId),
  ]);

  const composer = composerData({
    userId,
    timeZone: profile.timezone,
    today,
    projects: projects.data ?? [],
    tasks: tasks.data ?? [],
    logs: logs.map((l) => ({ ...l, taskIds: l.tasks.map((t) => t.id) })),
  });

  const shown = logs.filter(
    (l) => (!projectFilter || l.project_id === projectFilter) && (only !== "problems" || l.problems.trim()) && (only !== "files" || l.attachments.length > 0),
  );
  const filtering = Boolean(projectFilter || only);
  const byDate = new Map<string, typeof shown>();
  for (const l of shown) byDate.set(l.log_date, [...(byDate.get(l.log_date) ?? []), l]);

  // Six weeks of diary, every weekday shown so gaps are visible; weekends only when logged.
  const firstDay = logs.length ? logs[logs.length - 1].log_date : today;
  const start = [addDays(today, -41), firstDay].sort().at(-1)!;
  const days = filtering ? [...byDate.keys()] : eachDay(start, today).reverse().filter((d) => byDate.has(d) || isoWeekday(d) <= 5);

  const week = minutesPerWeek(logs, today, 1);
  const todayMinutes = logs.filter((l) => l.log_date === today).reduce((sum, l) => sum + l.minutes_spent, 0);
  // Phones show two weeks of diary until asked for more.
  const showAll = params.all === "1" || filtering;
  const phoneCutoff = addDays(today, -13);
  const tasksParam = typeof params.task === "string" ? [params.task] : [];
  const minutesParam = typeof params.minutes === "string" ? Math.min(1440, Math.max(0, Number(params.minutes) || 0)) : undefined;
  const filterHref = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ ...(projectFilter && { filter_project: projectFilter }), ...(only && { only }), ...(params.all === "1" && { all: "1" }), ...patch });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/log${q.size ? `?${q}` : ""}`;
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight max-md:sr-only">Progress log</h1>
        <p className="mt-1 text-muted-foreground max-md:hidden">What you did, what broke, what&apos;s next. Your record when results aren&apos;t in yet.</p>
      </div>

      {/* Phones: the composer is a sheet from the Log tab; here, one line and one button. */}
      <div className="flex items-center gap-3 mb-4 rounded-xl border border-primary/30 bg-primary/[0.05] p-3.5 md:hidden">
        <NotebookPen className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px]">
          {todayMinutes > 0 ? (
            <>
              <b className="font-medium">Today&apos;s log is written</b> <span className="text-muted-foreground">· {formatMinutes(todayMinutes)}</span>
            </>
          ) : (
            <>
              <b className="font-medium">No log yet today.</b> <span className="text-muted-foreground">About a minute.</span>
            </>
          )}
        </p>
        <Button size="sm" asChild>
          <Link href="/log/new">{todayMinutes > 0 ? "Edit" : "Write"}</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-6">
          <div className="max-md:hidden">
            <LogForm
              {...composer}
              today={today}
              defaultProjectId={typeof params.project === "string" ? params.project : undefined}
              defaultTaskIds={tasksParam}
              defaultMinutes={minutesParam}
            />
          </div>
          {logs.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState icon={NotebookPen} title="Your first log starts the record">
                Write one for today above. It takes a minute, and it&apos;s the evidence your professor sees.
              </EmptyState>
            </div>
          ) : days.length === 0 ? (
            <p className="text-muted-foreground">No entries match this filter.</p>
          ) : (
            <ol className="rf-stagger space-y-4">
              {days.map((date, i) => {
                const entries = byDate.get(date) ?? [];
                const total = entries.reduce((s, e) => s + e.minutes_spent, 0);
                const startsWeek = !filtering && (i === 0 || weekStartOf(days[i - 1]) !== weekStartOf(date));
                const weekTotal = logs.filter((l) => weekStartOf(l.log_date) === weekStartOf(date)).reduce((s, l) => s + l.minutes_spent, 0);
                const weekDays = new Set(logs.filter((l) => weekStartOf(l.log_date) === weekStartOf(date)).map((l) => l.log_date)).size;
                return (
                  <li key={date} className={cn("list-none space-y-4", !showAll && date < phoneCutoff && "max-md:hidden")}>
                    {startsWeek && (
                      <div className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                        Week {isoWeekNumber(date)}
                        <span className="h-px flex-1 bg-border" />
                        <span className="font-mono font-medium tracking-normal normal-case">
                          {formatMinutes(weekTotal)} · {weekDays} day{weekDays === 1 ? "" : "s"}
                        </span>
                      </div>
                    )}
                    {/* Phones: the date is a small heading above full-width entries; from sm up, a notebook gutter. */}
                    <div className={cn("grid grid-cols-1 gap-y-2 sm:grid-cols-[86px_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-0", entries.length === 0 && "sm:items-center")}>
                      <div className={cn("max-sm:flex max-sm:items-baseline max-sm:gap-2", entries.length === 0 && "opacity-60")}>
                        <div className="font-mono text-[10.5px] text-muted-foreground max-sm:order-first">{date === today ? "TODAY" : WEEKDAY[isoWeekday(date) - 1]}</div>
                        <div className="text-[15px] leading-tight font-semibold sm:text-[22px]">
                          {Number(date.slice(8))} {MONTHS[Number(date.slice(5, 7)) - 1]}
                        </div>
                        {total > 0 && <div className="font-mono text-[11px] text-muted-foreground max-sm:ml-auto sm:mt-1">{formatMinutes(total)}</div>}
                      </div>
                      {entries.length === 0 ? (
                        <div className="rounded-[10px] border border-dashed px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
                          {date === today ? "Nothing logged yet today." : "No entry. Days without a log stay visible in the diary."}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {entries.map((l) => (
                            <LogEntry key={l.id} log={l} timeZone={profile.timezone} />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {!showAll && days.some((d) => d < phoneCutoff) && (
            <Button variant="outline" className="w-full md:hidden" asChild>
              <Link href={filterHref({ all: "1" })}>Show older entries</Link>
            </Button>
          )}
          {!filtering && logs.some((l) => l.log_date < start) && (
            <p className="text-center text-xs text-muted-foreground">Older entries are summarised in the heatmap. Filter by project to see them all.</p>
          )}
        </div>

        <aside className="min-w-0 space-y-3 max-lg:order-first lg:sticky lg:top-16 lg:self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="This week" value={formatMinutes(week.at(-1)?.minutes ?? 0)} icon={Clock} accent="primary" />
            <Stat label="Streak" value={`${logStreak(logs, today)}d`} hint="days in a row" icon={Flame} accent="deadline" />
          </div>
          <div className="rounded-[10px] border bg-card p-3 shadow-[var(--shadow-card)]">
            <p className="mb-2 text-[12px] font-semibold">
              Consistency · <span className="max-md:hidden">12 weeks</span>
              <span className="md:hidden">6 weeks</span>
            </p>
            <div className="max-md:hidden">
              <Heatmap cells={activityByDay(logs, today, 12)} today={today} />
            </div>
            <div className="md:hidden">
              <Heatmap cells={activityByDay(logs, today, 6)} today={today} />
            </div>
          </div>
          <div className="space-y-1.5 rounded-[10px] border bg-card p-3 text-[12.5px] max-md:-mx-1 max-md:border-0 max-md:bg-transparent max-md:p-0">
            <p className="text-[12px] font-semibold max-md:hidden">Filter</p>
            <div className="flex flex-wrap gap-1.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-1 max-md:pb-1 max-md:whitespace-nowrap">
              <Link href={filterHref({ filter_project: "" })} className={cn("rounded-full border px-2.5 py-0.5", !projectFilter && "border-primary text-primary")}>
                All projects
              </Link>
              {(projects.data ?? []).map((p) => (
                <Link key={p.id} href={filterHref({ filter_project: p.id })} className={cn("max-w-full shrink-0 truncate rounded-full border px-2.5 py-0.5 max-md:max-w-52", projectFilter === p.id && "border-primary text-primary")}>
                  {p.title}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1 max-md:px-1">
              {[
                ["problems", "Has problems"],
                ["files", "Has files"],
              ].map(([key, label]) => (
                <Link key={key} href={filterHref({ only: only === key ? "" : key })} className={cn("rounded-full border px-2.5 py-0.5", only === key && "border-primary text-primary")}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
