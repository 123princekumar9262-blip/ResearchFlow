import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { projectProgress } from "@/lib/domain/progress";
import type { Milestone, Task, UserRole } from "@/types/database";

export type ProjectMemberView = { user_id: string; role: UserRole; full_name: string };

/**
 * A project with its members, milestones and tasks: the bundle every project
 * tab needs. Deduplicated per request, so the layout and the page share it.
 */
export const getProjectBundle = cache(async (projectId: string) => {
  const session = await requireSession();
  const { supabase, userId } = session;

  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();

  const [project, members, milestones, tasks, deps] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase
      .from("project_members")
      .select("user_id, role, profile:profiles!project_members_user_id_fkey(full_name)")
      .eq("project_id", projectId),
    supabase.from("milestones").select("*").eq("project_id", projectId).order("position").order("created_at"),
    supabase.from("tasks").select("*").eq("project_id", projectId).order("position").order("created_at"),
    supabase.from("task_dependencies").select("task_id, depends_on_id, task:tasks!task_dependencies_task_id_fkey(project_id)"),
  ]);

  // RLS returns nothing for non-members: indistinguishable from "doesn't exist", on purpose.
  if (!project.data) notFound();

  const memberList: ProjectMemberView[] = (members.data ?? [])
    .map((m) => ({ user_id: m.user_id, role: m.role, full_name: m.profile?.full_name ?? "Member" }))
    .sort((a, b) => (a.role === b.role ? a.full_name.localeCompare(b.full_name) : a.role === "professor" ? -1 : 1));

  const taskList = (tasks.data ?? []) as Task[];
  const milestoneList = (milestones.data ?? []) as Milestone[];
  const myRole = memberList.find((m) => m.user_id === userId)?.role ?? session.profile.role;
  const hasProfessor = memberList.some((m) => m.role === "professor");

  return {
    ...session,
    project: project.data,
    members: memberList,
    milestones: milestoneList,
    tasks: taskList,
    dependencies: (deps.data ?? []).filter((d) => d.task?.project_id === projectId).map(({ task_id, depends_on_id }) => ({ task_id, depends_on_id })),
    progress: projectProgress(taskList, milestoneList),
    myRole,
    hasProfessor,
    /** Students can't touch professor deadlines once a professor is on the project. */
    canSetProfessorDeadline: myRole === "professor" || !hasProfessor,
  };
});

export type ProjectBundle = Awaited<ReturnType<typeof getProjectBundle>>;
