import { CheckCircle2, Circle, CircleDashed, ScrollText, Send } from "lucide-react";
import { EmptyState, PageHeader, RowLink, UserAvatar } from "@/components/common/ui-bits";
import { requireSession } from "@/lib/auth";
import { firstReportWeek, readStats } from "@/lib/data/reports";
import { addDays, formatDay, formatMinutes, isoWeekNumber, timeAgo, weekStartOf } from "@/lib/domain/dates";
import { summarize } from "@/lib/domain/weekly-report";

export const metadata = { title: "Weekly reports" };

export default async function ReportsPage() {
  const { supabase, userId, profile, today } = await requireSession();
  const current = weekStartOf(today);

  if (profile.role === "professor") {
    const { data } = await supabase
      .from("weekly_reports")
      .select("id, student_id, week_start, stats, submitted_at, acknowledged_at, student:profiles!weekly_reports_student_id_fkey(full_name)")
      .not("submitted_at", "is", null)
      .order("week_start", { ascending: false })
      .limit(100);
    const reports = data ?? [];
    const weeks = [...new Set(reports.map((r) => r.week_start))];
    return (
      <>
        <PageHeader inTopBar title="Weekly reports" description="Submitted by your students. Acknowledge them so they know you read them." />
        {reports.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState icon={ScrollText} title="No reports submitted yet">
              Students generate reports from their logs and tasks and submit them at the end of each week.
            </EmptyState>
          </div>
        ) : (
          <div className="space-y-6">
            {weeks.map((w) => (
              <section key={w}>
                <h2 className="mb-2 text-xs font-medium text-muted-foreground">
                  Week {isoWeekNumber(w)} · {formatDay(w)} – {formatDay(addDays(w, 6))}
                </h2>
                <div className="divide-y rounded-xl border bg-card">
                  {reports
                    .filter((r) => r.week_start === w)
                    .map((r) => {
                      const stats = readStats(r.stats);
                      return (
                        <RowLink key={r.id} href={`/reports/${w}?student=${r.student_id}`} className="py-3">
                          <UserAvatar name={r.student?.full_name ?? "?"} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{r.student?.full_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{stats ? summarize(stats) : "Report"}</span>
                          </span>
                          {r.acknowledged_at ? (
                            <span className="flex items-center gap-1 text-xs text-success">
                              <CheckCircle2 className="size-3.5" /> read
                            </span>
                          ) : (
                            <span className="rounded bg-info/10 px-1.5 py-0.5 text-xs text-info">new</span>
                          )}
                        </RowLink>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        )}
      </>
    );
  }

  // From this week back to the first week this student has anything to report on.
  const first = await firstReportWeek(supabase, userId, profile.created_at, profile.timezone);
  const weeks = Array.from({ length: 52 }, (_, i) => addDays(current, -7 * i)).filter((w) => w >= first);
  const { data } = await supabase
    .from("weekly_reports")
    .select("id, week_start, stats, submitted_at, acknowledged_at")
    .eq("student_id", userId)
    .gte("week_start", weeks.at(-1)!);
  const byWeek = new Map((data ?? []).map((r) => [r.week_start, r]));

  return (
    <>
      <PageHeader inTopBar title="Weekly reports" description="Generated from your logs and tasks. Add a note, submit, done: no status emails." />
      <div className="divide-y rounded-xl border bg-card">
        {weeks.map((w) => {
          const r = byWeek.get(w);
          const stats = r ? readStats(r.stats) : null;
          const state = r?.acknowledged_at ? "acknowledged" : r?.submitted_at ? "submitted" : r ? "draft" : w === current ? "current" : "missing";
          return (
            <RowLink key={w} href={`/reports/${w}`} className="py-3">
              {state === "acknowledged" ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : state === "submitted" ? (
                <Send className="size-4 text-info" />
              ) : state === "missing" ? (
                <CircleDashed className="size-4 text-muted-foreground/60" />
              ) : (
                <Circle className="size-4 text-warning" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  Week {isoWeekNumber(w)} <span className="font-normal text-muted-foreground">· {formatDay(w)} – {formatDay(addDays(w, 6))}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {stats ? summarize(stats) : state === "current" ? "This week: open it to see your draft" : "Not written"}
                  {stats && stats.minutesLogged === 0 && ` · ${formatMinutes(0)}`}
                </span>
              </span>
              <span className="text-xs text-muted-foreground capitalize">
                {state === "acknowledged" ? `read ${timeAgo(r!.acknowledged_at!)}` : state === "current" ? "in progress" : state}
              </span>
            </RowLink>
          );
        })}
      </div>
    </>
  );
}
