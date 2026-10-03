import "server-only";

import { addDays, dateIn, weekStartOf, type ISODate } from "@/lib/domain/dates";
import { buildWeeklyReport, type WeeklyReport, type WeeklyStats } from "@/lib/domain/weekly-report";
import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * Gathers one student's week and builds the report. Runs as the student (the
 * only person who generates their report), so RLS scopes every query.
 */
export async function generateWeeklyReport(
  supabase: ServerSupabase,
  studentId: string,
  weekStart: ISODate,
  timeZone: string,
  today: ISODate,
): Promise<WeeklyReport> {
  const weekEnd = addDays(weekStart, 6);
  // Timestamps are filtered with a day of slack each side; exact
  // timezone-correct bucketing happens in the generator.
  const fromTs = `${addDays(weekStart, -1)}T00:00:00Z`;
  const toTs = `${addDays(weekEnd, 2)}T00:00:00Z`;

  const [projects, tasks, logs, blockers, decisions, remarks, extensions] = await Promise.all([
    supabase.from("projects").select("id, title").neq("status", "archived"),
    supabase
      .from("tasks")
      .select("id, title, project_id, status, professor_deadline, personal_deadline, effective_deadline, completed_at")
      .eq("assignee_id", studentId),
    supabase
      .from("progress_logs")
      .select("project_id, log_date, completed_work, problems, next_steps, minutes_spent")
      .eq("author_id", studentId)
      // Four weeks back too, for the comparison with the student's own average.
      .gte("log_date", addDays(weekStart, -28))
      .lte("log_date", weekEnd),
    supabase.from("blockers").select("title, severity, status, created_at, resolved_at, project_id").eq("raised_by", studentId),
    supabase.from("decisions").select("title, decided_on, project_id").gte("decided_on", weekStart).lte("decided_on", weekEnd),
    supabase
      .from("remarks")
      .select("created_at, kind, author:profiles!remarks_author_id_fkey(role)")
      .gte("created_at", fromTs)
      .lt("created_at", toTs),
    supabase.from("extension_requests").select("task_id, reason, created_at").eq("requested_by", studentId),
  ]);

  return buildWeeklyReport({
    weekStart,
    today,
    timeZone,
    projects: projects.data ?? [],
    tasks: tasks.data ?? [],
    logs: logs.data ?? [],
    blockers: blockers.data ?? [],
    decisions: decisions.data ?? [],
    remarks: (remarks.data ?? []).filter((r) => r.author?.role === "professor"),
    extensions: extensions.data ?? [],
  });
}

/** Stored stats are a frozen snapshot; tolerate older shapes by falling back to empty lists. */
export function readStats(stats: unknown): WeeklyStats | null {
  if (!stats || typeof stats !== "object" || (stats as { version?: number }).version !== 1) return null;
  return stats as WeeklyStats;
}

/**
 * The first week a student can report on: the week they joined, or the week of
 * their earliest log if that's older. Weeks before it have nothing to report.
 */
export async function firstReportWeek(supabase: ServerSupabase, studentId: string, joinedAt: string, timeZone: string): Promise<ISODate> {
  const { data } = await supabase.from("progress_logs").select("log_date").eq("author_id", studentId).order("log_date").limit(1).maybeSingle();
  const joined = weekStartOf(dateIn(joinedAt, timeZone));
  return data ? [joined, weekStartOf(data.log_date)].sort()[0] : joined;
}
