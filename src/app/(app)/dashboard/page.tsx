import { getWorkspace } from "@/lib/data/workspace";
import { getShell } from "@/lib/data/shell";
import { addDays } from "@/lib/domain/dates";
import { isAiEnabled } from "@/lib/ai/remark-to-tasks";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { ProfessorDashboard } from "@/components/dashboard/professor-dashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ws = await getWorkspace();
  const { supabase, userId, profile, today } = ws;

  if (profile.role === "professor") {
    const [students, logs, reports] = await Promise.all([
      supabase.from("supervisions").select("student:profiles!supervisions_student_id_fkey(id, full_name)").eq("professor_id", userId),
      supabase.from("progress_logs").select("author_id, project_id, log_date, created_at, minutes_spent").gte("log_date", addDays(today, -60)),
      supabase
        .from("weekly_reports")
        .select("id, student_id, week_start, submitted_at")
        .not("submitted_at", "is", null)
        .is("acknowledged_at", null)
        .order("week_start"),
    ]);
    return (
      <ProfessorDashboard
        ws={ws}
        extras={{
          students: (students.data ?? []).flatMap((s) => (s.student ? [s.student] : [])),
          logs: logs.data ?? [],
          pendingReports: reports.data ?? [],
        }}
      />
    );
  }

  const { count } = await supabase.from("supervisions").select("professor_id", { count: "exact", head: true }).eq("student_id", userId);
  const shell = await getShell();
  const health = Object.fromEntries(shell.projects.map((p) => [p.id, p.health]));
  return <StudentDashboard ws={ws} hasProfessor={(count ?? 0) > 0} aiEnabled={isAiEnabled()} health={health} />;
}
