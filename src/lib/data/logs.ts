import "server-only";

import type { ServerSupabase } from "@/lib/supabase/server";
import type { LogView } from "@/components/logs/log-entry";

/** Logs with author, project, linked tasks and attachments. RLS limits them to the viewer's projects. */
export async function loadLogs(
  supabase: ServerSupabase,
  filter: { authorId?: string; projectId?: string; since: string },
  viewerId: string,
): Promise<LogView[]> {
  let query = supabase
    .from("progress_logs")
    .select(
      `*,
       author:profiles!progress_logs_author_id_fkey(full_name),
       project:projects!progress_logs_project_id_fkey(title),
       links:progress_log_tasks!progress_log_tasks_log_id_fkey(task:tasks!progress_log_tasks_task_id_fkey(id, title, status)),
       files:attachments!attachments_progress_log_id_fkey(*)`,
    )
    .gte("log_date", filter.since)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filter.authorId) query = query.eq("author_id", filter.authorId);
  if (filter.projectId) query = query.eq("project_id", filter.projectId);

  const { data } = await query;
  const recent = Date.now() - 24 * 3600_000;
  return (data ?? []).map(({ author, project, links, files, ...log }) => ({
    ...log,
    authorName: author?.full_name ?? "Member",
    projectTitle: project?.title,
    tasks: links.flatMap((l) => (l.task ? [l.task] : [])),
    attachments: files.map((a) => ({ ...a, canDelete: a.uploader_id === viewerId && new Date(a.created_at).getTime() > recent })),
  }));
}
