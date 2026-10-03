import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/domain/dates";

/** Every progress log you wrote, as a spreadsheet (UTF-8 CSV that Excel opens correctly). */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data, error } = await supabase
    .from("progress_logs")
    .select(
      "log_date, minutes_spent, completed_work, problems, next_steps, created_at, project:projects!progress_logs_project_id_fkey(title), links:progress_log_tasks!progress_log_tasks_log_id_fkey(task:tasks!progress_log_tasks_task_id_fkey(title))",
    )
    .eq("author_id", userId)
    .order("log_date", { ascending: false });
  if (error) return NextResponse.json({ error: "Couldn't read your logs." }, { status: 500 });

  const cell = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Date", "Project", "Minutes", "Hours", "Completed", "Problems", "Next steps", "Linked tasks", "Written at"];
  const rows = (data ?? []).map((l) =>
    [
      l.log_date,
      l.project?.title ?? "",
      l.minutes_spent,
      (l.minutes_spent / 60).toFixed(2),
      l.completed_work,
      l.problems,
      l.next_steps,
      l.links.flatMap((x) => (x.task ? [x.task.title] : [])).join("; "),
      l.created_at,
    ].map(cell).join(","),
  );
  const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const day = todayIn(me?.timezone ?? "UTC");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="researchflow-logs-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
