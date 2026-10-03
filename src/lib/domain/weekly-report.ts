// Weekly report generator. Deterministic: the same week's data always yields
// the same report, so a draft can be regenerated freely until it is submitted
// and frozen.

import { addDays, dateIn, daysBetween, formatDay, formatMinutes, isoWeekNumber, type ISODate } from "./dates.ts";
import { accountableDeadline, finishedOnTime } from "./deadlines.ts";
import type { Blocker, Decision, ProgressLog, Task } from "../../types/database.ts";

type ReportTask = Pick<
  Task,
  | "id"
  | "title"
  | "project_id"
  | "status"
  | "professor_deadline"
  | "personal_deadline"
  | "effective_deadline"
  | "completed_at"
>;

export interface WeeklyReportInput {
  weekStart: ISODate;
  today: ISODate;
  timeZone: string;
  projects: { id: string; title: string }[];
  /** Tasks assigned to the student (any status). */
  tasks: ReportTask[];
  /** The student's logs (any range; filtered to the week here). */
  logs: Pick<ProgressLog, "project_id" | "log_date" | "completed_work" | "problems" | "next_steps" | "minutes_spent">[];
  blockers: Pick<Blocker, "title" | "severity" | "status" | "created_at" | "resolved_at" | "project_id">[];
  decisions: Pick<Decision, "title" | "decided_on" | "project_id">[];
  /** Professor remarks in the student's projects (filtered to the week here). */
  remarks: { created_at: string; kind: string }[];
  /** Extension requests the student made; their reasons explain delays. */
  extensions?: { task_id: string; reason: string; created_at: string }[];
}

export interface ReportTaskLine {
  id: string;
  title: string;
  projectId: string;
  project: string;
  deadline: ISODate | null;
}

export interface WeeklyStats {
  version: 1;
  weekStart: ISODate;
  weekEnd: ISODate;
  weekNumber: number;
  minutesLogged: number;
  activeDays: number;
  logCount: number;
  completed: (ReportTaskLine & { onTime: boolean | null; completedOn: ISODate })[];
  inProgress: (ReportTaskLine & { status: Task["status"] })[];
  missedProfessorDeadlines: (ReportTaskLine & { daysLate: number; done: boolean; reason?: string | null })[];
  blockersOpened: number;
  blockersResolved: number;
  blockersOpen: { title: string; severity: string; ageDays: number; project: string }[];
  decisions: { title: string; project: string }[];
  remarksReceived: number;
  upcoming: (ReportTaskLine & { kind: "professor" | "personal" })[];
  perProject: { projectId: string; title: string; minutes: number; completed: number }[];
  onTimeRate: number | null;
  /** The student's own previous four weeks, for comparison. Absent in older snapshots. */
  averages?: { minutes: number; activeDays: number } | null;
  /** First line of each log's "problems", newest first. */
  problems?: { date: ISODate; project: string; text: string }[];
  /** "Next steps" from the week's latest log: the plan the student already wrote. */
  plan?: string | null;
}

export interface WeeklyReport {
  stats: WeeklyStats;
  /** One-line conclusion, leading the report. */
  summary: string;
  /** Plain-text bullet list distilled from the week's logs. */
  highlights: string;
}

const firstLine = (text: string) => text.split(/\r?\n/).map((l) => l.replace(/^[-*•\s]+/, "").trim()).find(Boolean) ?? "";

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const { weekStart, today, timeZone } = input;
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (date: ISODate) => date >= weekStart && date <= weekEnd;
  const projectTitle = new Map(input.projects.map((p) => [p.id, p.title]));
  const line = (t: ReportTask): ReportTaskLine => ({
    id: t.id,
    title: t.title,
    projectId: t.project_id,
    project: projectTitle.get(t.project_id) ?? "Project",
    deadline: accountableDeadline(t),
  });

  const logs = input.logs.filter((l) => inWeek(l.log_date)).sort((a, b) => a.log_date.localeCompare(b.log_date));
  const minutesLogged = logs.reduce((sum, l) => sum + l.minutes_spent, 0);
  const activeDays = new Set(logs.map((l) => l.log_date)).size;

  const completed = input.tasks
    .filter((t) => t.status === "done" && t.completed_at && inWeek(dateIn(t.completed_at, timeZone)))
    .map((t) => ({ ...line(t), onTime: finishedOnTime(t, timeZone), completedOn: dateIn(t.completed_at!, timeZone) }))
    .sort((a, b) => a.completedOn.localeCompare(b.completedOn));

  const inProgress = input.tasks
    .filter((t) => t.status === "in_progress" || t.status === "in_review" || t.status === "changes_requested")
    .map((t) => ({ ...line(t), status: t.status }))
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));

  // Professor deadlines that fell in this week (and have passed) and weren't met.
  const lastJudgedDay = today <= weekEnd ? addDays(today, -1) : weekEnd;
  const missedProfessorDeadlines = input.tasks
    .filter((t) => t.professor_deadline && t.professor_deadline >= weekStart && t.professor_deadline <= lastJudgedDay)
    .map((t) => {
      const done = t.status === "done" && t.completed_at !== null;
      const reference = done ? dateIn(t.completed_at!, timeZone) : today;
      const reason = (input.extensions ?? [])
        .filter((e) => e.task_id === t.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.reason ?? null;
      return { ...line(t), deadline: t.professor_deadline, daysLate: daysBetween(t.professor_deadline!, reference), done, reason };
    })
    .filter((t) => t.daysLate > 0);

  const blockersOpened = input.blockers.filter((b) => inWeek(dateIn(b.created_at, timeZone))).length;
  const blockersResolved = input.blockers.filter((b) => b.resolved_at && inWeek(dateIn(b.resolved_at, timeZone))).length;
  const blockersOpen = input.blockers
    .filter((b) => b.status === "open")
    .map((b) => ({
      title: b.title,
      severity: b.severity,
      ageDays: daysBetween(dateIn(b.created_at, timeZone), today),
      project: projectTitle.get(b.project_id) ?? "Project",
    }));

  const decisions = input.decisions
    .filter((d) => inWeek(d.decided_on))
    .map((d) => ({ title: d.title, project: projectTitle.get(d.project_id) ?? "Project" }));

  const remarksReceived = input.remarks.filter((r) => inWeek(dateIn(r.created_at, timeZone))).length;

  const nextWeekStart = addDays(weekEnd, 1);
  const nextWeekEnd = addDays(weekEnd, 7);
  const upcoming = input.tasks
    .filter((t) => t.status !== "done" && t.effective_deadline && t.effective_deadline >= nextWeekStart && t.effective_deadline <= nextWeekEnd)
    .map((t) => ({
      ...line(t),
      deadline: t.effective_deadline,
      kind: (t.professor_deadline === t.effective_deadline ? "professor" : "personal") as "professor" | "personal",
    }))
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));

  const perProject = input.projects
    .map((p) => ({
      projectId: p.id,
      title: p.title,
      minutes: logs.filter((l) => l.project_id === p.id).reduce((s, l) => s + l.minutes_spent, 0),
      completed: completed.filter((c) => c.projectId === p.id).length,
    }))
    .filter((p) => p.minutes > 0 || p.completed > 0);

  // Previous four weeks, only once there is history to compare with.
  const history = input.logs.filter((l) => l.log_date < weekStart && l.log_date >= addDays(weekStart, -28));
  const averages =
    history.length === 0
      ? null
      : {
          minutes: Math.round(history.reduce((s, l) => s + l.minutes_spent, 0) / 4),
          activeDays: Math.round((new Set(history.map((l) => l.log_date)).size / 4) * 10) / 10,
        };

  const problems = [...logs]
    .reverse()
    .filter((l) => firstLine(l.problems))
    .map((l) => ({ date: l.log_date, project: projectTitle.get(l.project_id) ?? "Project", text: firstLine(l.problems) }))
    .filter((p, i, all) => all.findIndex((q) => q.text === p.text) === i);
  const latest = logs.filter((l) => firstLine(l.next_steps)).at(-1);
  const plan = latest ? firstLine(latest.next_steps) : null;

  const judged = completed.filter((c) => c.onTime !== null);
  const onTimeRate = judged.length === 0 ? null : judged.filter((c) => c.onTime).length / judged.length;

  const stats: WeeklyStats = {
    version: 1,
    weekStart,
    weekEnd,
    weekNumber: isoWeekNumber(weekStart),
    minutesLogged,
    activeDays,
    logCount: logs.length,
    completed,
    inProgress,
    missedProfessorDeadlines,
    blockersOpened,
    blockersResolved,
    blockersOpen,
    decisions,
    remarksReceived,
    upcoming,
    perProject,
    onTimeRate,
    averages,
    problems,
    plan,
  };

  return { stats, summary: summarize(stats), highlights: highlightsFrom(logs, input.projects.length > 1 ? projectTitle : null) };
}

export function summarize(stats: WeeklyStats): string {
  const parts: string[] = [];
  const onTime = stats.completed.filter((c) => c.onTime).length;
  const judged = stats.completed.filter((c) => c.onTime !== null).length;
  parts.push(
    stats.completed.length === 0
      ? "No tasks completed"
      : `Completed ${stats.completed.length} task${stats.completed.length === 1 ? "" : "s"}` +
          (judged > 0 ? ` (${onTime} on time)` : ""),
  );
  parts.push(
    stats.minutesLogged === 0
      ? "no time logged"
      : `${formatMinutes(stats.minutesLogged)} over ${stats.activeDays} day${stats.activeDays === 1 ? "" : "s"}`,
  );
  if (stats.blockersResolved > 0) parts.push(`${stats.blockersResolved} blocker${stats.blockersResolved === 1 ? "" : "s"} resolved`);
  if (stats.blockersOpen.length > 0) parts.push(`${stats.blockersOpen.length} still open`);
  if (stats.missedProfessorDeadlines.length > 0) {
    parts.push(`${stats.missedProfessorDeadlines.length} professor deadline${stats.missedProfessorDeadlines.length === 1 ? "" : "s"} missed`);
  }
  return parts.join(" · ");
}

function highlightsFrom(
  logs: WeeklyReportInput["logs"],
  projectTitle: Map<string, string> | null,
): string {
  if (logs.length === 0) return "";
  return logs
    .map((l) => {
      const prefix = projectTitle ? `[${projectTitle.get(l.project_id) ?? "Project"}] ` : "";
      const done = firstLine(l.completed_work);
      const problem = firstLine(l.problems);
      return `- ${formatDay(l.log_date)}: ${prefix}${done}${problem ? ` (problem: ${problem})` : ""}`;
    })
    .join("\n");
}
