import "server-only";

import { cache } from "react";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { professorInbox, studentInbox, type InboxItem } from "@/lib/domain/inbox";
import { getWorkspace, type Workspace } from "@/lib/data/workspace";
import type { ExtensionRequest } from "@/types/database";

export type Health = "good" | "risk" | "late" | "paused";

export interface ShellData {
  projects: { id: string; title: string; status: string; health: Health }[];
  counts: { overdue: number; open: number; reviews: number; reports: number };
  inbox: InboxItem[];
}

/** Project health in one word: late (a professor deadline passed), risk, good, or paused. */
function projectHealth(ws: Workspace, projectId: string, status: string): Health {
  if (status === "on_hold") return "paused";
  const tasks = ws.tasks.filter((t) => t.project_id === projectId && t.status !== "done");
  if (tasks.some((t) => t.professor_deadline && t.professor_deadline < ws.today && t.status !== "in_review")) return "late";
  const highBlocker = ws.blockers.some((b) => b.project_id === projectId && b.severity === "high");
  const late = tasks.some((t) => t.effective_deadline && t.effective_deadline < ws.today);
  return highBlocker || late ? "risk" : "good";
}

/**
 * Everything the app frame needs: sidebar counts, project health, and the
 * inbox. Shares the request's workspace query, so pages pay nothing extra.
 */
export const getShell = cache(async (): Promise<ShellData> => {
  const ws = await getWorkspace();
  const { supabase, userId, profile, today } = ws;
  const projectTitle = new Map(ws.projects.map((p) => [p.id, p.title]));
  const names = new Map(ws.members.map((m) => [m.user_id, m.full_name]));

  // A missing table (migration not applied yet) just means no extension requests.
  const { data: extData } = await supabase.from("extension_requests").select("*").order("created_at", { ascending: false }).limit(200);
  const extensions = (extData ?? []) as ExtensionRequest[];

  const projects = ws.projects
    .filter((p) => p.status === "active" || p.status === "on_hold")
    .map((p) => ({ id: p.id, title: p.title, status: p.status, health: projectHealth(ws, p.id, p.status) }));

  if (profile.role === "student") {
    const mine = ws.tasks.filter((t) => t.status !== "done" && (t.assignee_id === userId || t.assignee_id === null));
    const overdue = mine.filter((t) => t.status !== "in_review" && t.effective_deadline && t.effective_deadline < today).length;
    const inbox = studentInbox({
      userId,
      today,
      since: `${addDays(today, -7)}T00:00:00Z`,
      tasks: ws.tasks,
      remarks: ws.remarks,
      extensions,
      projectTitle,
    });
    return { projects, counts: { overdue, open: mine.length, reviews: 0, reports: 0 }, inbox };
  }

  const myProjects = new Set(ws.members.filter((m) => m.user_id === userId && m.role === "professor").map((m) => m.project_id));
  const [reports, logs] = await Promise.all([
    supabase
      .from("weekly_reports")
      .select("id, student_id, week_start, submitted_at, student:profiles!weekly_reports_student_id_fkey(full_name)")
      .not("submitted_at", "is", null)
      .is("acknowledged_at", null),
    supabase.from("progress_logs").select("author_id, log_date").gte("log_date", addDays(today, -60)),
  ]);

  const reviews = ws.tasks
    .filter((t) => t.status === "in_review" && myProjects.has(t.project_id))
    .map((t) => ({ ...t, studentName: t.assignee_id ? (names.get(t.assignee_id) ?? null) : null }));
  const taskTitle = new Map(ws.tasks.map((t) => [t.id, t.title]));

  const lastLog = new Map<string, string>();
  for (const l of logs.data ?? []) if (!lastLog.has(l.author_id) || l.log_date > lastLog.get(l.author_id)!) lastLog.set(l.author_id, l.log_date);
  const students = [...new Set(ws.members.filter((m) => m.role === "student" && myProjects.has(m.project_id)).map((m) => m.user_id))];
  const quiet = students
    .map((id) => {
      const last = lastLog.get(id);
      return { studentId: id, name: names.get(id) ?? "Student", daysSinceLog: last ? daysBetween(last, today) : null };
    })
    .filter((s) => s.daysSinceLog === null || s.daysSinceLog >= 3);

  const inbox = professorInbox({
    today,
    reviews,
    blockers: ws.blockers.filter((b) => myProjects.has(b.project_id)).map((b) => ({ ...b, raisedByName: names.get(b.raised_by) ?? "A student" })),
    extensions: extensions
      .filter((e) => myProjects.has(e.project_id))
      .map((e) => ({ ...e, studentName: names.get(e.requested_by) ?? "A student", taskTitle: taskTitle.get(e.task_id) ?? "a task" })),
    reports: (reports.data ?? []).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.student?.full_name ?? "Student",
      weekStart: r.week_start,
      submittedAt: r.submitted_at!,
    })),
    quiet,
  });

  return {
    projects,
    counts: { overdue: 0, open: 0, reviews: reviews.length, reports: (reports.data ?? []).length },
    inbox,
  };
});
