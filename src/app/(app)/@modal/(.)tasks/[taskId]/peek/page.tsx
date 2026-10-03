import { notFound } from "next/navigation";
import { TaskPeek } from "@/components/tasks/task-peek";
import { requireSession } from "@/lib/auth";

/** Space on a task in a list: a quick look over the list instead of leaving it. */
export default async function TaskPeekSheet({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) notFound();
  const { supabase, profile, today } = await requireSession();

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, title, description, status, project_id, professor_deadline, personal_deadline, project:projects!tasks_project_id_fkey(title), milestone:milestones!tasks_milestone_id_fkey(title), assignee:profiles!tasks_assignee_id_fkey(full_name)",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (!task) notFound();

  const [links, files, requests] = await Promise.all([
    supabase.from("progress_log_tasks").select("log:progress_logs!progress_log_tasks_log_id_fkey(minutes_spent)").eq("task_id", taskId),
    supabase.from("attachments").select("id", { count: "exact", head: true }).eq("task_id", taskId),
    supabase.from("remarks").select("body").eq("task_id", taskId).eq("kind", "change_request").is("addressed_at", null).order("created_at", { ascending: false }).limit(1),
  ]);
  const logs = (links.data ?? []).flatMap((l) => (l.log ? [l.log] : []));
  const request = requests.data?.[0]?.body ?? null;

  return (
    <TaskPeek
      today={today}
      task={{
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        projectId: task.project_id,
        projectTitle: task.project?.title ?? "",
        milestone: task.milestone?.title ?? null,
        assignee: task.assignee?.full_name ?? null,
        professorDeadline: task.professor_deadline,
        personalDeadline: task.personal_deadline,
        evidence: logs.length + (files.count ?? 0),
        minutes: logs.reduce((s, l) => s + l.minutes_spent, 0),
        openRequest: request ? (request.length > 160 ? `${request.slice(0, 159)}…` : request) : null,
        canLog: profile.role === "student",
      }}
    />
  );
}
