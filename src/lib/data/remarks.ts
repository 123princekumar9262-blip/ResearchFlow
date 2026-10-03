import "server-only";

import type { ServerSupabase } from "@/lib/supabase/server";
import type { RemarkView } from "@/components/remarks/remark-thread";

/** Remarks for a project (optionally one task), threaded and with what they turned into. */
export async function loadRemarkThreads(supabase: ServerSupabase, projectId: string, taskId?: string): Promise<RemarkView[]> {
  let query = supabase
    .from("remarks")
    .select(
      "*, author:profiles!remarks_author_id_fkey(full_name, role), addressed:profiles!remarks_addressed_by_fkey(full_name), task:tasks!remarks_task_id_fkey(title)",
    )
    .eq("project_id", projectId)
    .order("created_at");
  if (taskId) query = query.eq("task_id", taskId);

  const [{ data: rows }, { data: converted }] = await Promise.all([
    query,
    supabase.from("tasks").select("id, title, status, source_remark_id").eq("project_id", projectId).not("source_remark_id", "is", null),
  ]);

  const all = rows ?? [];
  return all
    .filter((r) => r.parent_id === null)
    .map((r) => ({
      id: r.id,
      body: r.body,
      kind: r.kind,
      source: r.source,
      created_at: r.created_at,
      addressed_at: r.addressed_at,
      author_id: r.author_id,
      author_name: r.author?.full_name ?? "Someone",
      author_role: r.author?.role ?? "student",
      addressed_by_name: r.addressed?.full_name ?? null,
      task_id: r.task_id,
      task_title: r.task?.title ?? null,
      converted: (converted ?? []).filter((t) => t.source_remark_id === r.id).map(({ id, title, status }) => ({ id, title, status })),
      replies: all
        .filter((c) => c.parent_id === r.id)
        .map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, author_name: c.author?.full_name ?? "Someone", author_role: c.author?.role ?? "student" })),
    }));
}
