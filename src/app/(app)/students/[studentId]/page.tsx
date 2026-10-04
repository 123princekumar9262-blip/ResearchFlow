import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, FolderKanban, ScrollText } from "lucide-react";
import { PageHeader, ProgressBar, RowLink, Section, Stat, UserAvatar } from "@/components/common/ui-bits";
import { WeeklyHoursChart } from "@/components/charts/weekly-hours";
import { ScheduleMeetingDialog } from "@/components/meetings/schedule-dialog";
import { Heatmap } from "@/components/logs/heatmap";
import { LogEntry } from "@/components/logs/log-entry";
import { requireSession } from "@/lib/auth";
import { loadLogs } from "@/lib/data/logs";
import { readStats } from "@/lib/data/reports";
import { activityByDay, averageReviewHours, daysSinceLastLog, logConsistency, minutesPerWeek, onTimeRate, slips } from "@/lib/domain/analytics";
import { addDays, formatDay } from "@/lib/domain/dates";
import { percent, projectProgress } from "@/lib/domain/progress";
import { summarize } from "@/lib/domain/weekly-report";

export const metadata = { title: "Student" };

/** A professor's view of one student: activity, reliability, projects, reports. */
export default async function StudentPage({ params }: PageProps<"/students/[studentId]">) {
  const { studentId } = await params;
  const { supabase, userId, profile, today } = await requireSession();
  if (profile.role !== "professor") redirect("/dashboard");
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();

  const { data: student } = await supabase.from("profiles").select("*").eq("id", studentId).maybeSingle();
  if (!student || student.role !== "student") notFound();

  const [memberships, logs, reports] = await Promise.all([
    supabase.from("project_members").select("project_id").eq("user_id", studentId),
    loadLogs(supabase, { authorId: studentId, since: addDays(today, -7 * 12) }, userId),
    supabase.from("weekly_reports").select("id, week_start, stats, acknowledged_at").eq("student_id", studentId).order("week_start", { ascending: false }).limit(8),
  ]);
  const projectIds = (memberships.data ?? []).map((m) => m.project_id);
  const [projects, tasks, milestones, changes] = await Promise.all([
    supabase.from("projects").select("id, title, status").in("id", projectIds),
    supabase.from("tasks").select("*").in("project_id", projectIds),
    supabase.from("milestones").select("id, project_id").in("project_id", projectIds),
    supabase.from("deadline_changes").select("task_id, old_value, new_value, field").in("project_id", projectIds),
  ]);

  const theirTasks = (tasks.data ?? []).filter((t) => t.assignee_id === studentId);
  const theirIds = new Set(theirTasks.map((t) => t.id));
  const slipCount = slips((changes.data ?? []).filter((c) => theirIds.has(c.task_id))).length;
  const onTime = onTimeRate(theirTasks, student.timezone);
  const review = averageReviewHours(theirTasks);
  const quiet = daysSinceLastLog(logs, today);
  const overdue = theirTasks.filter((t) => t.status !== "done" && t.status !== "in_review" && t.effective_deadline && t.effective_deadline < today);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/dashboard" className="hover:text-foreground">
            ← Your students
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <UserAvatar name={student.full_name} className="size-8 text-xs" /> {student.full_name}
          </span>
        }
        description={quiet === null ? "No progress logged yet" : quiet === 0 ? "Logged progress today" : `Last log ${quiet} day${quiet === 1 ? "" : "s"} ago`}
        actions={<ScheduleMeetingDialog role="professor" people={[{ id: student.id, name: student.full_name }]} defaultPersonId={student.id} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Logged, last 14 days" value={`${Math.round(logConsistency(logs, today, 14) * 14)}/14 days`} />
        <Stat label="On-time rate" value={onTime === null ? "–" : `${Math.round(onTime * 100)}%`} tone={onTime !== null && onTime < 0.7 ? "warning" : undefined} />
        <Stat label="Overdue now" value={overdue.length} tone={overdue.length > 0 ? "danger" : undefined} />
        <Stat label="Deadline slips" value={slipCount} hint="moved later" />
        <Stat label="Your review time" value={review === null ? "–" : review < 48 ? `${Math.round(review)}h` : `${Math.round(review / 24)}d`} hint="avg, submit → verdict" />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <WeeklyHoursChart weeks={minutesPerWeek(logs, today, 8)} />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-[13px] font-medium">Consistency, 12 weeks</p>
          <Heatmap cells={activityByDay(logs, today, 12)} today={today} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section className="min-w-0 space-y-3">
          <h2 className="text-[13px] font-medium">Recent logs</h2>
          {logs.length === 0 && <p className="text-muted-foreground">Nothing logged in your shared projects in the last 12 weeks.</p>}
          {logs.slice(0, 10).map((l) => (
            <div key={l.id}>
              <p className="mb-1 text-xs text-muted-foreground">{formatDay(l.log_date, Number(today.slice(0, 4)))}</p>
              <LogEntry log={l} timeZone={student.timezone} />
            </div>
          ))}
        </section>
        <div className="space-y-5">
          <Section icon={FolderKanban} accent="success" title="Shared projects" count={(projects.data ?? []).length} bodyClassName="divide-y">
            {(projects.data ?? []).map((p) => {
              const pt = (tasks.data ?? []).filter((t) => t.project_id === p.id);
              const progress = projectProgress(pt, (milestones.data ?? []).filter((m) => m.project_id === p.id));
              return (
                <RowLink key={p.id} href={`/projects/${p.id}`} className="py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.title}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <ProgressBar value={progress} />
                      <span className="font-mono text-xs tabular">{percent(progress)}%</span>
                    </span>
                  </span>
                </RowLink>
              );
            })}
          </Section>
          <Section icon={ScrollText} accent="info" title="Weekly reports" bodyClassName="divide-y">
            {(reports.data ?? []).length === 0 ? (
              <p className="px-4 py-4 text-center text-muted-foreground">No reports submitted.</p>
            ) : (
              (reports.data ?? []).map((r) => {
                const stats = readStats(r.stats);
                return (
                  <RowLink key={r.id} href={`/reports/${r.week_start}?student=${studentId}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">Week of {formatDay(r.week_start)}</span>
                      <span className="block truncate">{stats ? summarize(stats) : "Report"}</span>
                    </span>
                    {r.acknowledged_at && <CheckCircle2 className="size-4 text-success" aria-label="Acknowledged" />}
                  </RowLink>
                );
              })
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
