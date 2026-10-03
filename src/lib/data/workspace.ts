import "server-only";

import { cache } from "react";
import { addDays, weekStartOf } from "@/lib/domain/dates";
import { requireSession } from "@/lib/auth";
import type { Blocker, Milestone, Project, Remark, Task, UserRole } from "@/types/database";

export type MemberWithProfile = { project_id: string; user_id: string; role: UserRole; full_name: string };
export type RemarkWithAuthor = Remark & { author_name: string; author_role: UserRole };

/**
 * Everything the dashboards and calendar need, in one round of parallel
 * queries. RLS limits each query to the user's projects, so no filters by
 * membership are needed (or trusted) here.
 */
export const getWorkspace = cache(async () => {
  const session = await requireSession();
  const { supabase, userId, today } = session;
  const weekStart = weekStartOf(today);

  const [projects, members, milestones, tasks, deps, remarks, blockers, myLogs, evidenceLinks, attachments, changes] = await Promise.all([
    supabase.from("projects").select("*").order("updated_at", { ascending: false }),
    supabase.from("project_members").select("project_id, user_id, role, profile:profiles!project_members_user_id_fkey(full_name)"),
    supabase.from("milestones").select("*").order("position"),
    supabase.from("tasks").select("*"),
    supabase.from("task_dependencies").select("task_id, depends_on_id"),
    supabase
      .from("remarks")
      .select("*, author:profiles!remarks_author_id_fkey(full_name, role)")
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("blockers").select("*").eq("status", "open"),
    supabase
      .from("progress_logs")
      .select("project_id, log_date, minutes_spent")
      .eq("author_id", userId)
      .gte("log_date", addDays(weekStart, -7 * 11)),
    supabase.from("progress_log_tasks").select("task_id, log:progress_logs!progress_log_tasks_log_id_fkey(log_date)"),
    supabase.from("attachments").select("task_id").not("task_id", "is", null),
    supabase.from("deadline_changes").select("task_id, old_value, new_value"),
  ]);

  const activeProjects: Project[] = (projects.data ?? []).filter((p) => p.status !== "archived");
  const activeIds = new Set(activeProjects.map((p) => p.id));

  const remarkRows: RemarkWithAuthor[] = (remarks.data ?? []).map(({ author, ...r }) => ({
    ...r,
    author_name: author?.full_name ?? "Someone",
    author_role: author?.role ?? "student",
  }));

  // Evidence per task: linked logs (with latest date) and attachments.
  const evidence = new Map<string, { count: number; lastLog: string | null }>();
  for (const link of evidenceLinks.data ?? []) {
    const e = evidence.get(link.task_id) ?? { count: 0, lastLog: null };
    e.count += 1;
    const date = link.log?.log_date ?? null;
    if (date && (!e.lastLog || date > e.lastLog)) e.lastLog = date;
    evidence.set(link.task_id, e);
  }
  for (const a of attachments.data ?? []) {
    if (!a.task_id) continue;
    const e = evidence.get(a.task_id) ?? { count: 0, lastLog: null };
    e.count += 1;
    evidence.set(a.task_id, e);
  }

  return {
    ...session,
    weekStart,
    allProjects: projects.data ?? [],
    projects: activeProjects,
    members: (members.data ?? []).map(({ profile, ...m }) => ({ ...m, full_name: profile?.full_name ?? "Member" })) as MemberWithProfile[],
    milestones: (milestones.data ?? []).filter((m) => activeIds.has(m.project_id)) as Milestone[],
    tasks: (tasks.data ?? []).filter((t) => activeIds.has(t.project_id)) as Task[],
    dependencies: deps.data ?? [],
    remarks: remarkRows.filter((r) => activeIds.has(r.project_id)),
    blockers: (blockers.data ?? []).filter((b) => activeIds.has(b.project_id)) as Blocker[],
    myLogs: myLogs.data ?? [],
    evidence,
    deadlineChanges: changes.data ?? [],
  };
});

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
