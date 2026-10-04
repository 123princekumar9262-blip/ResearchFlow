import { requireSession } from "@/lib/auth";
import { getShell } from "@/lib/data/shell";
import { getWorkspace } from "@/lib/data/workspace";
import { getDisclosure } from "@/lib/data/disclosure";
import { weekStartOf } from "@/lib/domain/dates";
import { readOnboarding } from "@/lib/onboarding/state";
import { OnboardingProvider } from "@/components/onboarding/provider";
import { isAiEnabled } from "@/lib/ai/provider";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { CommandPalette } from "@/components/layout/command-palette";
import { InstallBanner } from "@/components/pwa/install";
import { PeekKeys } from "@/components/tasks/task-peek";

export default async function AppLayout({ children, modal }: LayoutProps<"/">) {
  const { profile, today, userId, supabase } = await requireSession();
  const [shell, ws, supervised, report, disclosure, myStudents] = await Promise.all([
    getShell(),
    getWorkspace(),
    profile.role === "student"
      ? supabase.from("supervisions").select("professor_id", { count: "exact", head: true }).eq("student_id", userId)
      : Promise.resolve({ count: 0 }),
    profile.role === "professor"
      ? supabase
          .from("weekly_reports")
          .select("student_id, week_start, acknowledged_at")
          .not("submitted_at", "is", null)
          .order("acknowledged_at", { nullsFirst: true })
          .order("week_start", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getDisclosure(),
    profile.role === "professor" && isAiEnabled()
      ? supabase.from("supervisions").select("student:profiles!supervisions_student_id_fkey(id, full_name)").eq("professor_id", userId)
      : Promise.resolve({ data: [] }),
  ]);
  // "Ask AI" chooses among the person's own projects (and, for professors, their students).
  const ai = isAiEnabled()
    ? {
        role: profile.role,
        projects: shell.projects.map((p) => ({ id: p.id, title: p.title })),
        students: (myStudents.data ?? []).flatMap((s) => (s.student ? [{ id: s.student.id, name: s.student.full_name }] : [])),
      }
    : undefined;
  const onboarding = readOnboarding(profile);
  // The feedback tour opens a project that has feedback in it, waiting ones first.
  const remarksProjectId =
    (ws.remarks.find((r) => !r.addressed_at && (r.kind === "change_request" || r.kind === "question")) ?? ws.remarks[0])?.project_id ?? null;
  // A task the task tours can open: one of mine still in play, else any.
  const tourTask = ws.tasks.find((t) => t.assignee_id === userId && t.status !== "done") ?? ws.tasks.find((t) => t.status !== "done") ?? ws.tasks[0];

  return (
    <OnboardingProvider
      persisted={onboarding !== null}
      initial={onboarding ?? {}}
      basics={{
        userId,
        role: profile.role,
        today,
        createdAt: profile.created_at,
        hasProfessor: profile.role === "student" && (supervised.count ?? 0) > 0,
        firstProjectId: shell.projects[0]?.id ?? null,
        firstTaskId: tourTask?.id ?? null,
        remarksProjectId,
        weekStart: weekStartOf(today),
        reportPath: report.data
          ? `/reports/${report.data.week_start}?student=${report.data.student_id}`
          : profile.role === "student"
            ? `/reports/${weekStartOf(today)}`
            : null,
        ui: { stage: disclosure.stage, all: disclosure.all, has: disclosure.has },
        earnedNow: disclosure.earnedNow,
      }}
    >
      <div className="flex min-h-dvh">
        <Sidebar role={profile.role} shell={shell} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar name={profile.full_name} role={profile.role} inbox={shell.inbox} today={today} ai={ai} />
          <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-5 pb-28 md:px-6 md:pt-6 md:pb-12 lg:px-8">
            <InstallBanner />
            {children}
          </main>
        </div>
        <MobileNav role={profile.role} shell={shell} />
        {modal}
        <CommandPalette role={profile.role} projects={shell.projects} />
        <PeekKeys />
      </div>
    </OnboardingProvider>
  );
}
