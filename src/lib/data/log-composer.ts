import "server-only";

import { addDays, dateIn, type ISODate } from "@/lib/domain/dates";
import type { ServerSupabase } from "@/lib/supabase/server";

const firstLine = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\s]+/, "").trim())
    .find(Boolean) ?? "";

export interface ComposerLog {
  id: string;
  project_id: string;
  log_date: string;
  completed_work: string;
  problems: string;
  next_steps: string;
  minutes_spent: number;
  taskIds: string[];
}

export interface ComposerData {
  projects: { id: string; title: string }[];
  tasksByProject: Record<string, { id: string; title: string; status: string }[]>;
  existing: ComposerLog[];
  previousPlans: Record<string, { date: string; text: string }>;
  touchedToday: string[];
}

/** Everything the log composer needs, from data the caller already loaded. */
export function composerData(input: {
  userId: string;
  timeZone: string;
  today: ISODate;
  projects: { id: string; title: string }[];
  tasks: { id: string; title: string; status: string; project_id: string; assignee_id: string | null; updated_at: string }[];
  /** The author's logs, newest first. */
  logs: ComposerLog[];
}): ComposerData {
  const { userId, timeZone, today } = input;
  const tasksByProject: ComposerData["tasksByProject"] = {};
  const touchedToday: string[] = [];
  for (const t of input.tasks) {
    if (t.assignee_id && t.assignee_id !== userId) continue;
    (tasksByProject[t.project_id] ??= []).push({ id: t.id, title: t.title, status: t.status });
    if (dateIn(t.updated_at, timeZone) === today) touchedToday.push(t.id);
  }
  const previousPlans: ComposerData["previousPlans"] = {};
  for (const l of input.logs) {
    if (l.log_date >= today || previousPlans[l.project_id] || !firstLine(l.next_steps)) continue;
    previousPlans[l.project_id] = { date: l.log_date, text: firstLine(l.next_steps) };
  }
  // The project you logged most recently (then most often) comes first, so it's the default.
  const lastLogged = new Map<string, string>();
  const logCount = new Map<string, number>();
  for (const l of input.logs) {
    if (!lastLogged.has(l.project_id)) lastLogged.set(l.project_id, l.log_date);
    logCount.set(l.project_id, (logCount.get(l.project_id) ?? 0) + 1);
  }
  const projects = [...input.projects].sort(
    (a, b) => (lastLogged.get(b.id) ?? "").localeCompare(lastLogged.get(a.id) ?? "") || (logCount.get(b.id) ?? 0) - (logCount.get(a.id) ?? 0),
  );
  return {
    projects,
    tasksByProject,
    // Logs stay editable for two days, like the composer's day picker.
    existing: input.logs.filter((l) => l.log_date >= addDays(today, -2)),
    previousPlans,
    touchedToday,
  };
}

/** Loads the composer on its own, for the slide-over that opens from anywhere. */
export async function loadLogComposer(supabase: ServerSupabase, userId: string, timeZone: string, today: ISODate): Promise<ComposerData> {
  const [projects, tasks, logs] = await Promise.all([
    supabase.from("projects").select("id, title").in("status", ["active", "on_hold"]).order("updated_at", { ascending: false }),
    supabase.from("tasks").select("id, title, status, project_id, assignee_id, updated_at").neq("status", "done").order("effective_deadline", { nullsFirst: false }),
    supabase
      .from("progress_logs")
      .select("id, project_id, log_date, completed_work, problems, next_steps, minutes_spent, links:progress_log_tasks(task_id)")
      .eq("author_id", userId)
      .gte("log_date", addDays(today, -30))
      .order("log_date", { ascending: false }),
  ]);
  return composerData({
    userId,
    timeZone,
    today,
    projects: projects.data ?? [],
    tasks: tasks.data ?? [],
    logs: (logs.data ?? []).map(({ links, ...l }) => ({ ...l, taskIds: (links ?? []).map((x) => x.task_id) })),
  });
}

/** Prefills from links such as Focus mode's "log this session". */
export function composerDefaults(params: Record<string, string | string[] | undefined>) {
  return {
    defaultProjectId: typeof params.project === "string" ? params.project : undefined,
    defaultTaskIds: typeof params.task === "string" ? [params.task] : [],
    defaultMinutes: typeof params.minutes === "string" ? Math.min(1440, Math.max(0, Number(params.minutes) || 0)) || undefined : undefined,
    // Notes from a focus session start "What did you complete?".
    defaultCompleted: typeof params.notes === "string" ? params.notes.slice(0, 2000) : undefined,
  };
}
