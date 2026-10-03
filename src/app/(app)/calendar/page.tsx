import Link from "next/link";
import { cn } from "cn";
import { StatusIcon } from "@/components/common/status";
import { MonthNav } from "@/components/calendar/month-nav";
import { ChapterTrigger } from "@/components/onboarding/tips";
import { CalendarGrid, type CalendarItem } from "@/components/calendar/calendar-grid";
import { getWorkspace } from "@/lib/data/workspace";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, addMonths, eachDay, formatDay, formatMonth, formatMonthLong, isoWeekNumber, isValidISODate, monthStartOf, weekStartOf } from "@/lib/domain/dates";

export const metadata = { title: "Calendar" };

/** Fixed categorical order for projects; avoids the state hues. */
const PROJECT_COLORS = ["#4F46E5", "#0F766E", "#BE185D", "#0369A1", "#4D7C0F"];

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const ws = await getWorkspace();
  const { today, userId, profile } = ws;

  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : today.slice(0, 7);
  const colorBy = params.color === "status" ? "status" : "project";
  const hidden = typeof params.hide === "string" ? params.hide.split(",").filter(Boolean) : [];
  const view = params.view === "week" ? "week" : "month";
  const weekStart = typeof params.week === "string" && isValidISODate(params.week) ? weekStartOf(params.week) : weekStartOf(today);
  const first = view === "week" ? weekStart : monthStartOf(`${month}-01`);
  const gridStart = view === "week" ? weekStart : weekStartOf(first);
  const last = view === "week" ? addDays(weekStart, 6) : addDays(addMonths(first, 1), -1);
  const gridEnd = view === "week" ? last : addDays(weekStartOf(last), 6);
  const days = eachDay(gridStart, gridEnd);

  const color = new Map(ws.projects.map((p, i) => [p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]]));
  const projectTitle = new Map(ws.projects.map((p) => [p.id, p.title]));
  const hasProfessor = new Set(ws.members.filter((m) => m.role === "professor").map((m) => m.project_id));
  const canMoveProfessor = (projectId: string) => profile.role === "professor" || !hasProfessor.has(projectId);
  const mine = profile.role === "student" ? ws.tasks.filter((t) => t.assignee_id === userId || t.assignee_id === null) : ws.tasks;

  const items: Record<string, CalendarItem[]> = {};
  const put = (date: string | null, item: CalendarItem) => {
    if (!date || date < gridStart || date > gridEnd) return;
    (items[date] ??= []).push(item);
  };
  for (const m of ws.milestones) {
    const tasks = ws.tasks.filter((t) => t.milestone_id === m.id);
    put(m.due_date, {
      kind: "milestone",
      id: m.id,
      title: m.title,
      projectId: m.project_id,
      project: projectTitle.get(m.project_id) ?? "",
      color: color.get(m.project_id) ?? PROJECT_COLORS[0],
      done: tasks.length > 0 && tasks.every((t) => t.status === "done"),
    });
  }
  for (const t of mine) {
    const base = {
      id: t.id,
      title: t.title,
      status: t.status,
      projectId: t.project_id,
      project: projectTitle.get(t.project_id) ?? "",
      color: color.get(t.project_id) ?? PROJECT_COLORS[0],
      professorDeadline: t.professor_deadline,
      personalDeadline: t.personal_deadline,
    };
    put(t.professor_deadline, { kind: "professor", ...base, draggable: t.status !== "done" && canMoveProfessor(t.project_id) });
    if (t.personal_deadline && t.personal_deadline !== t.professor_deadline) put(t.personal_deadline, { kind: "personal", ...base, draggable: t.status !== "done" });
  }

  const logged = [...new Set(ws.myLogs.map((l) => l.log_date))];
  const prev = addMonths(first, -1).slice(0, 7);
  const next = addMonths(first, 1).slice(0, 7);
  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({
      ...(view === "week" ? { view: "week", week: weekStart } : { month }),
      ...(colorBy === "status" && { color: "status" }),
      ...(hidden.length && { hide: hidden.join(",") }),
      ...patch,
    });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/calendar?${q}`;
  };
  const agenda = days.filter((d) => d >= first && d <= last && (items[d] ?? []).some((i) => !hidden.includes(i.projectId)));

  return (
    <>
      <ChapterTrigger tour="calendar" ready={Object.values(items).some((list) => list.length > 0)} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {view === "month" ? (
          <MonthNav prev={prev} next={next} today={today.slice(0, 7)} label={formatMonthLong(first)} />
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <h1 className="mr-3 text-[22px] font-semibold tracking-tight">
              Week {isoWeekNumber(weekStart)} <span className="text-base font-normal text-muted-foreground">· {formatDay(weekStart)} – {formatDay(addDays(weekStart, 6))}</span>
            </h1>
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={href({ week: addDays(weekStart, -7) })} aria-label="Previous week">
                <ChevronLeft />
              </Link>
            </Button>
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={href({ week: addDays(weekStart, 7) })} aria-label="Next week">
                <ChevronRight />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href={href({ week: weekStartOf(today) })}>Today</Link>
            </Button>
          </div>
        )}
        <span className="inline-flex rounded-md border p-0.5 text-xs max-md:hidden md:ml-auto" data-tour="cal-view">
          {(["month", "week"] as const).map((v) => (
            <Link
              key={v}
              href={v === "week" ? `/calendar?view=week&week=${view === "week" ? weekStart : weekStartOf(first <= today && today <= last ? today : first)}` : `/calendar?month=${(view === "week" ? weekStart : first).slice(0, 7)}`}
              className={cn("rounded px-2.5 py-0.5 capitalize transition-colors", view === v ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {v}
            </Link>
          ))}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Color by</span>
        <span className="inline-flex rounded-md border p-0.5">
          {(["project", "status"] as const).map((c) => (
            <Link key={c} href={href({ color: c === "status" ? "status" : "" })} className={cn("rounded px-2.5 py-0.5 capitalize", colorBy === c ? "bg-accent font-medium" : "text-muted-foreground")}>
              {c}
            </Link>
          ))}
        </span>
        <span className="mx-1 h-4 w-px bg-border" />
        {ws.projects.map((p) => {
          const off = hidden.includes(p.id);
          return (
            <Link
              key={p.id}
              href={href({ hide: (off ? hidden.filter((h) => h !== p.id) : [...hidden, p.id]).join(",") })}
              className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5", off && "opacity-45 line-through")}
              title={off ? "Show this project" : "Hide this project"}
            >
              <span className="size-2 rounded-full" style={{ background: color.get(p.id) }} />
              {p.title}
            </Link>
          );
        })}
      </div>

      <div className="hidden md:block">
        <CalendarGrid days={days} monthKey={month} today={today} items={items} logged={logged} colorBy={colorBy} hidden={hidden} week={view === "week"} />
      </div>

      {/* Phones: an agenda of the month's deadlines. */}
      <div className="space-y-4 md:hidden">
        {agenda.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">No deadlines in {formatMonth(first)}.</p>}
        {agenda.map((d) => (
          <section key={d} className="overflow-hidden rounded-[10px] border bg-card">
            <h2 className={cn("border-b px-3.5 py-2 text-xs font-semibold", d === today ? "bg-deadline/[0.07] text-deadline" : "text-muted-foreground", d < today && "opacity-80")}>
              {d === today ? "Today · " : ""}
              {formatDay(d)}
            </h2>
            <div className="divide-y">
              {(items[d] ?? [])
                .filter((i) => !hidden.includes(i.projectId))
                .map((i) => (
                  <Link
                    key={`${i.kind}-${i.id}`}
                    href={i.kind === "milestone" ? `/projects/${i.projectId}` : `/tasks/${i.id}`}
                    className={cn("flex min-h-11 items-center gap-2.5 px-3.5 py-2", i.kind !== "milestone" && i.status !== "done" && d < today && "text-danger")}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: i.color }} />
                    {i.kind === "milestone" ? (
                      <span className="font-semibold">◆ {i.title}</span>
                    ) : (
                      <>
                        <span className="w-9 shrink-0 font-mono text-[9.5px] font-semibold opacity-75">{i.kind === "professor" ? "PROF" : "ME"}</span>
                        <StatusIcon status={i.status} />
                        <span className={cn("min-w-0 flex-1 truncate", i.status === "done" && "text-muted-foreground line-through")}>{i.title}</span>
                      </>
                    )}
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-3 hidden text-xs text-muted-foreground md:block">
        PROF: professor deadline · ME (dashed): your own deadline · ◆ milestone · green dot: progress logged · drag your own deadlines to move them · ← → change month
      </p>
    </>
  );
}
