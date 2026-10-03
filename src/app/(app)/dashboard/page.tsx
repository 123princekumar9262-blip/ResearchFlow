import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/data/workspace";
import { getShell } from "@/lib/data/shell";
import { addDays, isoWeekday, weekStartOf } from "@/lib/domain/dates";
import { isAiEnabled } from "@/lib/ai/remark-to-tasks";
import { needsWelcome, readOnboarding } from "@/lib/onboarding/state";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { ProfessorDashboard } from "@/components/dashboard/professor-dashboard";
import type { ChecklistItem } from "@/components/onboarding/checklist";

export const metadata = { title: "Dashboard" };

function hourIn(timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(new Date()));
}

export default async function DashboardPage() {
  const ws = await getWorkspace();
  const { supabase, userId, profile, today } = ws;

  // A brand-new account starts with the welcome flow (spec Phase 01).
  const onboarding = readOnboarding(profile);
  if (needsWelcome(onboarding)) redirect("/welcome");

  const firstProject = ws.projects[0]?.id;
  const projectHref = firstProject ? `/projects/${firstProject}` : "/projects?new=1";

  if (profile.role === "professor") {
    const [students, logs, reports, acknowledged] = await Promise.all([
      supabase.from("supervisions").select("student:profiles!supervisions_student_id_fkey(id, full_name)").eq("professor_id", userId),
      supabase.from("progress_logs").select("author_id, project_id, log_date, created_at, minutes_spent").gte("log_date", addDays(today, -60)),
      supabase
        .from("weekly_reports")
        .select("id, student_id, week_start, submitted_at")
        .not("submitted_at", "is", null)
        .is("acknowledged_at", null)
        .order("week_start"),
      supabase.from("weekly_reports").select("id", { count: "exact", head: true }).eq("acknowledged_by", userId),
    ]);
    const studentList = (students.data ?? []).flatMap((s) => (s.student ? [s.student] : []));
    const checklist: ChecklistItem[] = [
      { label: "Share your join code", done: !!onboarding?.shared || studentList.length > 0, href: "/settings" },
      { label: "Create or join a project", done: ws.projects.length > 0, href: "/projects?new=1" },
      { label: "Set a milestone deadline", done: ws.milestones.some((m) => m.due_date), href: projectHref },
      { label: "Review a task", done: ws.tasks.some((t) => t.requires_review && (t.status === "done" || t.status === "changes_requested")), href: "/reviews" },
      { label: "Acknowledge a weekly report", done: (acknowledged.count ?? 0) > 0, href: "/reports" },
    ];
    return (
      <ProfessorDashboard
        ws={ws}
        checklist={checklist}
        extras={{
          students: studentList,
          logs: logs.data ?? [],
          pendingReports: reports.data ?? [],
        }}
      />
    );
  }

  const [{ count }, report] = await Promise.all([
    supabase.from("supervisions").select("professor_id", { count: "exact", head: true }).eq("student_id", userId),
    supabase.from("weekly_reports").select("submitted_at").eq("student_id", userId).eq("week_start", weekStartOf(today)).maybeSingle(),
  ]);
  const hasProfessor = (count ?? 0) > 0;
  const shell = await getShell();
  const health = Object.fromEntries(shell.projects.map((p) => [p.id, p.health]));
  const hour = hourIn(profile.timezone);
  const checklist: ChecklistItem[] = [
    { label: "Link your professor", done: hasProfessor, href: "/settings" },
    { label: "Create a project", done: ws.projects.length > 0, href: "/projects?new=1" },
    { label: "Add a milestone", done: ws.milestones.length > 0, href: projectHref },
    { label: "Create a task with a deadline", done: ws.tasks.some((t) => t.professor_deadline || t.personal_deadline), href: firstProject ? `/projects/${firstProject}/tasks` : "/projects?new=1" },
    { label: "Write your first log", done: ws.myLogs.length > 0, href: "/log/new" },
  ];
  return (
    <StudentDashboard
      ws={ws}
      hasProfessor={hasProfessor}
      aiEnabled={isAiEnabled()}
      health={health}
      checklist={checklist}
      signals={{
        evening: hour >= 17,
        reportDue: isoWeekday(today) === 7 && hour >= 18 && !report.data?.submitted_at,
        weekStart: weekStartOf(today),
      }}
    />
  );
}
