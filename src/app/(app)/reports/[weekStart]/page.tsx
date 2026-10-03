import Link from "next/link";
import { cn } from "cn";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Pill } from "@/components/common/ui-bits";
import { PageCrumbs } from "@/components/layout/page-crumbs";
import { ReportView } from "@/components/reports/report-view";
import { AcknowledgeButton, PrintButton, ReportEditor, ShareControls } from "@/components/reports/report-controls";
import { requireSession } from "@/lib/auth";
import { firstReportWeek, generateWeeklyReport, readStats } from "@/lib/data/reports";
import { addDays, formatDay, isValidISODate, isoWeekNumber, isoWeekday, timeAgo, weekStartOf } from "@/lib/domain/dates";

export async function generateMetadata({ params }: PageProps<"/reports/[weekStart]">) {
  const { weekStart } = await params;
  return { title: isValidISODate(weekStart) ? `Week ${isoWeekNumber(weekStart)} report` : "Report" };
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[weekStart]">) {
  const { weekStart } = await params;
  const { student } = await searchParams;
  const { supabase, userId, profile, today } = await requireSession();
  if (!isValidISODate(weekStart) || isoWeekday(weekStart) !== 1 || weekStart > weekStartOf(today)) notFound();

  const studentId = profile.role === "professor" && typeof student === "string" ? student : userId;
  const own = studentId === userId;

  const [{ data: report }, { data: studentProfile }, { data: supervisors }] = await Promise.all([
    supabase.from("weekly_reports").select("*").eq("student_id", studentId).eq("week_start", weekStart).maybeSingle(),
    supabase.from("profiles").select("full_name, timezone").eq("id", studentId).maybeSingle(),
    supabase.from("supervisions").select("professor:profiles!supervisions_professor_id_fkey(full_name)").eq("student_id", studentId),
  ]);
  const supervisor = (supervisors ?? []).flatMap((s) => (s.professor ? [s.professor.full_name] : [])).join(", ") || null;
  if (!studentProfile) notFound();

  const frozen = !!report?.submitted_at;
  // A student's own reports start the week they joined (or first logged).
  const first = own ? await firstReportWeek(supabase, userId, profile.created_at, profile.timezone) : null;
  const beforeStart = first !== null && weekStart < first && !report;
  const nav = (w: string) => `/reports/${w}${own ? "" : `?student=${studentId}`}`;
  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);

  // Students see a live draft until they submit; everyone else sees only the submitted snapshot.
  let body: React.ReactNode;
  if (beforeStart) {
    body = (
      <div className="rounded-xl border bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <p className="font-medium">Nothing to report for Week {isoWeekNumber(weekStart)}</p>
        <p className="mt-1 text-muted-foreground">
          Your reports start in Week {isoWeekNumber(first!)}, the first week you used ResearchFlow.
        </p>
        <Link href={nav(weekStartOf(today))} className="mt-4 inline-block font-medium text-primary underline-offset-4 hover:underline">
          Open this week&apos;s report
        </Link>
      </div>
    );
  } else if (own && !frozen) {
    const live = await generateWeeklyReport(supabase, userId, weekStart, profile.timezone, today);
    body = (
      <div className="space-y-6">
        <ReportView stats={live.stats} highlights={live.highlights} note={report?.student_note || undefined} studentName={studentProfile.full_name} supervisor={supervisor} />
        <ReportEditor weekStart={weekStart} initialNote={report?.student_note ?? ""} isCurrentWeek={weekStart === weekStartOf(today)} />
      </div>
    );
  } else {
    const stats = report ? readStats(report.stats) : null;
    if (!report || !frozen || !stats) {
      body = <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">{studentProfile.full_name} hasn&apos;t submitted a report for this week.</p>;
    } else {
      const h = await headers();
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
      body = (
        <div className="space-y-6">
          <ReportView stats={stats} highlights={report.highlights} note={report.student_note} studentName={studentProfile.full_name} supervisor={supervisor} />
          {own && <ShareControls reportId={report.id} enabled={report.share_enabled} token={report.share_token} origin={origin} />}
        </div>
      );
    }
  }

  const status = !report ? "Not started" : report.acknowledged_at ? `Acknowledged ${timeAgo(report.acknowledged_at)}` : frozen ? `Submitted ${timeAgo(report.submitted_at!)}` : "Draft";

  const week = (w: string) => `Week ${isoWeekNumber(w)}`;

  return (
    <>
      <PageCrumbs items={[{ label: "Reports", href: "/reports" }, { label: `${week(weekStart)}${own ? "" : ` · ${studentProfile.full_name}`}` }]} />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2.5 print:hidden">
        <nav className={cn("flex items-center gap-1 text-[13px]", beforeStart && "hidden")} aria-label="Weeks">
          {(first === null || prevWeek >= first) && (
            <Link href={nav(prevWeek)} className="flex h-8 items-center gap-0.5 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              <ChevronLeft className="size-3.5" /> {week(prevWeek)}
            </Link>
          )}
          <span className="px-2 font-semibold">{week(weekStart)}</span>
          {nextWeek <= weekStartOf(today) && (
            <Link href={nav(nextWeek)} className="flex h-8 items-center gap-0.5 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              {week(nextWeek)} <ChevronRight className="size-3.5" />
            </Link>
          )}
        </nav>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {report?.submitted_at && <Pill tone="info">Submitted {formatDay(report.submitted_at.slice(0, 10))}</Pill>}
          {report?.acknowledged_at ? (
            <Pill tone="success">Acknowledged {timeAgo(report.acknowledged_at)}</Pill>
          ) : frozen ? (
            <Pill tone="neutral">Not acknowledged yet</Pill>
          ) : own && !beforeStart ? (
            <Pill tone="warning">Draft · refreshes until you submit</Pill>
          ) : (
            <span>{status}</span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {!own && report && frozen && !report.acknowledged_at && <AcknowledgeButton reportId={report.id} />}
          {(frozen || own) && !beforeStart && <PrintButton />}
        </span>
      </div>
      {body}
    </>
  );
}
