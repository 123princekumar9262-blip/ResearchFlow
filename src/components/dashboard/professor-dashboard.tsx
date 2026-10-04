import Link from "next/link";
import { Inbox, Moon, OctagonAlert, ScrollText, Users } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { Pill, ProgressBar, RowLink, Section, UserAvatar } from "@/components/common/ui-bits";
import { StatusIcon } from "@/components/common/status";
import { NextActionCard } from "@/components/dashboard/next-action-card";
import { JoinCodeCard } from "@/components/settings/join-code";
import { formatCode } from "@/lib/join-code";
import { GettingStarted, type ChecklistItem } from "@/components/onboarding/checklist";
import { Tip } from "@/components/onboarding/tips";
import { InviteTip } from "@/components/onboarding/tip-kinds";
import { MobileSummary } from "@/components/dashboard/mobile-summary";
import { MoreForToday } from "@/components/dashboard/disclosure-bits";
import { CopyInviteButton } from "@/components/onboarding/tip-kinds";
import type { Disclosure } from "@/lib/onboarding/stage";
import { daysBetween, formatDay, formatMinutes, timeAgo, weekStartOf } from "@/lib/domain/dates";
import { professorNextAction } from "@/lib/domain/next-action";
import { percent, projectProgress } from "@/lib/domain/progress";
import type { Workspace } from "@/lib/data/workspace";

export interface ProfessorExtras {
  students: { id: string; full_name: string }[];
  logs: { author_id: string; project_id: string; log_date: string; created_at: string; minutes_spent: number }[];
  pendingReports: { id: string; student_id: string; week_start: string; submitted_at: string | null }[];
}

const STALE_DAYS = 3;

/** An ISO timestamp n days back, for "waiting more than n days". */
function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export function ProfessorDashboard({
  ws,
  extras,
  checklist,
  ui,
  top,
}: {
  ws: Workspace;
  extras: ProfessorExtras;
  checklist: ChecklistItem[];
  ui: Disclosure;
  /** The next meeting and the notifications prompt, shown with the tips. */
  top?: React.ReactNode;
}) {
  const { today, userId } = ws;
  const name = new Map(ws.members.map((m) => [m.user_id, m.full_name]));
  for (const s of extras.students) name.set(s.id, s.full_name);
  const projectTitle = new Map(ws.projects.map((p) => [p.id, p.title]));
  const myProjects = ws.projects.filter((p) => ws.members.some((m) => m.project_id === p.id && m.user_id === userId && m.role === "professor"));
  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const weekStart = weekStartOf(today);

  // One row per student, across every project of yours they're on. Progress
  // shows their most active project; activity counts only what the student did
  // (logs, submissions, completions), never edits someone else made to a task.
  const studentIds = [...new Set(ws.members.filter((m) => myProjectIds.has(m.project_id) && m.role === "student").map((m) => m.user_id))];
  const rows = studentIds.map((studentId) => {
    const projects = myProjects.filter((p) => ws.members.some((m) => m.project_id === p.id && m.user_id === studentId));
    const projectIds = new Set(projects.map((p) => p.id));
    const theirs = ws.tasks.filter((t) => projectIds.has(t.project_id) && t.assignee_id === studentId);
    const logs = extras.logs.filter((l) => l.author_id === studentId && projectIds.has(l.project_id));
    const activity = [
      ...logs.map((l) => l.created_at),
      ...theirs.flatMap((t) => [t.submitted_at, t.completed_at]),
    ].filter((x): x is string => !!x);
    const lastActivity = activity.sort().at(-1) ?? null;
    const lastLogDate = logs.reduce<string | null>((max, l) => (!max || l.log_date > max ? l.log_date : max), null);
    const daysSinceLog = lastLogDate ? daysBetween(lastLogDate, today) : null;
    const weekMinutes = logs.filter((l) => l.log_date >= weekStart).reduce((s, l) => s + l.minutes_spent, 0);
    const minutesBy = (id: string) => logs.filter((l) => l.project_id === id).reduce((s, l) => s + l.minutes_spent, 0);
    const project = [...projects].sort((a, b) => minutesBy(b.id) - minutesBy(a.id))[0];
    const progress = projectProgress(
      ws.tasks.filter((t) => t.project_id === project.id),
      ws.milestones.filter((m) => m.project_id === project.id),
    );
    const open = theirs.filter((t) => t.status !== "done" && t.status !== "in_review");
    const overdue = open.filter((t) => t.effective_deadline && t.effective_deadline < today).length;
    const profLate = open.some((t) => t.professor_deadline && t.professor_deadline < today);
    const blockers = ws.blockers.filter((b) => projectIds.has(b.project_id) && b.raised_by === studentId);
    const reviews = theirs.filter((t) => t.status === "in_review").length;
    const stale = projects.some((p) => p.status === "active") && (daysSinceLog === null || daysSinceLog >= STALE_DAYS);
    const highBlocker = blockers.some((b) => b.severity === "high");
    const attention = (stale ? 3 : 0) + overdue * 2 + blockers.filter((b) => b.severity === "high").length * 3 + blockers.length + reviews;
    const health: "late" | "risk" | "good" = profLate || highBlocker ? "late" : stale || overdue > 0 ? "risk" : "good";
    const studentName = name.get(studentId) ?? "Student";
    return { project, more: projects.length - 1, studentId, studentName, progress, lastActivity, daysSinceLog, weekMinutes, overdue, blockers, reviews, stale, attention, health };
  });
  rows.sort((a, b) => b.attention - a.attention || a.studentName.localeCompare(b.studentName));

  const pendingReviews = ws.tasks
    .filter((t) => t.status === "in_review" && myProjectIds.has(t.project_id))
    .map((t) => ({ ...t, studentName: t.assignee_id ? (name.get(t.assignee_id) ?? null) : null }))
    .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  const blockers = ws.blockers
    .filter((b) => myProjectIds.has(b.project_id))
    .map((b) => ({ ...b, raisedByName: name.get(b.raised_by) ?? "A student" }))
    .sort((a, b) => Number(b.needs_professor) - Number(a.needs_professor) || a.created_at.localeCompare(b.created_at));
  const needYou = blockers.filter((b) => b.needs_professor);

  const staleStudents = rows.filter((r) => r.stale).map((r) => ({ studentId: r.studentId, name: r.studentName, daysSinceLog: r.daysSinceLog }));

  const reports = extras.pendingReports.map((r) => ({ id: r.id, studentId: r.student_id, studentName: name.get(r.student_id) ?? "Student", weekStart: r.week_start }));
  const action = professorNextAction({ today, pendingReviews, blockers, staleStudents, unacknowledgedReports: reports });
  const unlinked = extras.students.filter((s) => !rows.some((r) => r.studentId === s.id));
  const HEALTH_DOT = { late: "bg-danger", risk: "bg-warning", good: "bg-success" } as const;

  const twoDaysAgo = isoDaysAgo(2);
  const waitingLong = pendingReviews.filter((t) => t.submitted_at && t.submitted_at < twoDaysAgo).length;
  const quietest = [...staleStudents].sort((a, b) => (b.daysSinceLog ?? 99) - (a.daysSinceLog ?? 99))[0];
  const tips = (
    <>
      {extras.students.length === 0 && <InviteTip code={ws.profile.join_code ?? ""} />}
      {waitingLong > 0 && (
        <Tip
          id="reviews-waiting"
          kind="state"
          tone="warning"
          title={`${waitingLong} task${waitingLong === 1 ? " has" : "s have"} waited more than 2 days for your review.`}
          cta={{ label: "Open queue", href: "/reviews" }}
        >
          Students can&apos;t move on until you decide.
        </Tip>
      )}
      {quietest && (
        <Tip
          id="quiet-student"
          kind="state"
          tone="warning"
          title={quietest.daysSinceLog === null ? `${quietest.name} hasn't logged yet.` : `${quietest.name} hasn't logged in ${quietest.daysSinceLog} days.`}
          cta={{ label: `Open ${quietest.name.split(" ")[0]}`, href: `/students/${quietest.studentId}` }}
        >
          A short check-in now beats a surprise later.
        </Tip>
      )}
      {top}
    </>
  );

  // ───────────── Stage 1: the join code is the screen (calm redesign spec, Phase 02) ─────────────
  if (extras.students.length === 0 && myProjects.length === 0) {
    return (
      <div className="rf-rise mx-auto flex min-h-[62dvh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Welcome, {ws.profile.full_name}</p>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance">Add your students.</h1>
        <p className="max-w-[42ch] text-muted-foreground">They enter your code once, and appear here with their deadlines and progress.</p>
        <code className="rounded-xl border border-dashed border-primary/40 bg-primary/[0.06] px-5 py-3 font-mono text-[26px] font-medium tracking-[0.16em]">
          {formatCode(ws.profile.join_code ?? "")}
        </code>
        <CopyInviteButton code={ws.profile.join_code ?? ""} />
        <Link href="/projects?new=1" className="px-2 py-1 text-[13px] text-muted-foreground hover:text-foreground">
          Or create a project first
        </Link>
      </div>
    );
  }

  const { stage, all } = ui;
  const active = stage === 3 || all;
  const simple = !active;

  const studentsBlock = (
    <Section id="attention" icon={Users} title="Sorted by attention needed" tour="students">
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-muted-foreground">You aren&apos;t on any projects yet. Create one, or ask a student to add you to theirs.</p>
      ) : (
        <>
          {/* Desktop and tablet: one scannable table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-muted/50 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
                <tr className="border-b">
                  {!simple && <th className="w-8 py-2 pl-3.5" aria-label="Health" data-tour="health" />}
                  <th className={cn("py-2 pr-2", simple && "pl-3.5")}>Student</th>
                  <th className="px-2 py-2">Project</th>
                  <th className="w-36 px-2 py-2">Progress</th>
                  <th className="px-2 py-2" data-tour="activity">
                    Last update
                  </th>
                  {!simple && (
                    <th className="px-2 py-2" data-tour="activity">
                      This week
                    </th>
                  )}
                  <th className="px-2 py-2 text-right">Overdue</th>
                  {!simple && <th className="px-2 py-2">Blockers</th>}
                  <th className="py-2 pr-3.5 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.studentId} className="h-12 hover:bg-accent/40">
                    {!simple && (
                      <td className="pl-3.5" data-tour="health">
                        <span className={cn("block size-[7px] rounded-full", HEALTH_DOT[r.health])} />
                      </td>
                    )}
                    <td className={cn("pr-2", simple && "pl-3.5")}>
                      <Link href={`/students/${r.studentId}`} className="flex items-center gap-2 font-medium hover:underline">
                        <UserAvatar name={r.studentName} />
                        {r.studentName}
                      </Link>
                    </td>
                    <td className="max-w-56 px-2 text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1">
                        <Link href={`/projects/${r.project.id}`} className="truncate hover:text-foreground hover:underline">
                          {r.project.title}
                        </Link>
                        {r.more > 0 && (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 font-mono text-[10.5px]" title={`On ${r.more} more of your projects`}>
                            +{r.more}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2">
                      <span className="flex items-center gap-2">
                        <ProgressBar value={r.progress} tone={r.progress >= 0.8 ? "success" : "primary"} />
                        <span className="font-mono text-[11.5px] tabular">{percent(r.progress)}%</span>
                      </span>
                    </td>
                    <td className={cn("px-2 text-xs whitespace-nowrap", r.stale && "text-warning")} data-tour="activity">
                      {r.lastActivity ? timeAgo(r.lastActivity) : "never"}
                      {r.stale && r.daysSinceLog !== null && <span className="block text-[11px]">no log {r.daysSinceLog}d</span>}
                    </td>
    {!simple && (
                      <td className="px-2 font-mono text-xs tabular" data-tour="activity">
                        {r.weekMinutes ? formatMinutes(r.weekMinutes) : <span className="text-muted-foreground">–</span>}</td>
                    )}
                    <td className={cn("px-2 text-right font-mono tabular", r.overdue > 0 ? "font-semibold text-danger" : "text-muted-foreground")}>{r.overdue || "–"}</td>
    {!simple && (
                      <td className="px-2 text-xs">
                        {r.blockers.length === 0 ? (
                          <span className="text-muted-foreground">–</span>
                        ) : (
                          <span className={r.blockers.some((b) => b.severity === "high") ? "text-danger" : "text-warning"}>
                            {r.blockers.length} · {r.blockers.some((b) => b.severity === "high") ? "high" : "open"}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="pr-3.5 text-right">
                      {r.reviews > 0 ? (
                        <Link href="/reviews" className="inline-flex items-center gap-1 font-mono font-semibold text-info">
                          {r.reviews} <StatusIcon status="in_review" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: one card per student. */}
          <div className="divide-y md:hidden">
            {rows.map((r) => (
              <Link key={`${r.studentId}-m`} href={`/students/${r.studentId}`} className="grid gap-1.5 px-3.5 py-3">
                <span className="flex items-center gap-2">
                  <span className={cn("size-[7px] shrink-0 rounded-full", HEALTH_DOT[r.health])} data-tour="health" />
                  <UserAvatar name={r.studentName} />
                  <b className="min-w-0 flex-1 truncate font-medium">{r.studentName}</b>
                  <span className="font-mono text-[11.5px] tabular text-muted-foreground">{percent(r.progress)}%</span>
                </span>
                <ProgressBar value={r.progress} tone={r.progress >= 0.8 ? "success" : "primary"} />
                <span className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {r.project.title}
                    {r.more > 0 && ` +${r.more}`}
                  </span>
                  <span className={cn("shrink-0", r.health === "late" ? "text-danger" : r.health === "risk" ? "text-warning" : "text-muted-foreground")} data-tour="activity">
                    {[
                      r.overdue && `${r.overdue} overdue`,
                      r.stale && (r.daysSinceLog === null ? "never logged" : `quiet ${r.daysSinceLog}d`),
                      r.blockers.length && `${r.blockers.length} blocker${r.blockers.length === 1 ? "" : "s"}`,
                      r.reviews && `${r.reviews} to review`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "On track"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </Section>
  );
  // Reviews and blockers appear the moment they exist, at any stage.
  const reviewBlock =
    pendingReviews.length > 0 || all ? (
      <Section icon={Inbox} title="Review queue" count={pendingReviews.length} tone="info" tour="review-queue" tourEmpty={pendingReviews.length === 0} action={<Link href="/reviews" className="hover:text-foreground">Open queue →</Link>}>
        {pendingReviews.length === 0 ? (
          <p className="px-4 py-5 text-center text-muted-foreground">Nothing waiting for your review.</p>
        ) : (
          <div className="divide-y">
            {pendingReviews.slice(0, 6).map((t) => (
              <RowLink key={t.id} href={`/reviews?task=${t.id}`}>
                <StatusIcon status="in_review" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.studentName ?? "Unassigned"} · {ws.evidence.get(t.id)?.count ?? 0} evidence · waiting {t.submitted_at ? timeAgo(t.submitted_at).replace(" ago", "") : "–"}
                  </span>
                </span>
                {t.professor_deadline && <DeadlineChip date={t.professor_deadline} today={today} kind="professor" status={t.status} />}
              </RowLink>
            ))}
          </div>
        )}
      </Section>
    ) : null;
  const blockersBlock =
    blockers.length > 0 || all ? (
      <Section id="blockers" icon={OctagonAlert} title="Blockers that need you" count={needYou.length} tone="danger" tour="blockers" tourEmpty={needYou.length === 0}>
        {blockers.length === 0 ? (
          <p className="px-4 py-5 text-center text-muted-foreground">No one is blocked.</p>
        ) : (
          <div className="divide-y">
            {blockers.map((b) => (
              <RowLink key={b.id} href={`/projects/${b.project_id}/blockers#blocker-${b.id}`}>
                <span className={cn("size-2 shrink-0 rounded-full", b.severity === "high" ? "bg-danger" : b.severity === "medium" ? "bg-warning" : "bg-muted-foreground")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{b.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {b.raisedByName} · {b.severity} · open {daysBetween(b.created_at.slice(0, 10), today)}d{!b.needs_professor && " · FYI"}
                  </span>
                </span>
                <Button size="xs" variant="outline" tabIndex={-1}>
                  Respond
                </Button>
              </RowLink>
            ))}
          </div>
        )}
      </Section>
    ) : null;
  const reportsBlock =
    reports.length > 0 ? (
      <Section icon={ScrollText} title="Weekly reports to read" count={reports.length} tone="info">
        <div className="divide-y">
          {reports.map((r) => (
            <RowLink key={r.id} href={`/reports/${r.weekStart}?student=${r.studentId}`}>
              <UserAvatar name={r.studentName} />
              <span className="flex-1">{r.studentName}</span>
              <span className="text-xs text-muted-foreground">week of {formatDay(r.weekStart)}</span>
            </RowLink>
          ))}
        </div>
      </Section>
    ) : null;
  const unlinkedLine = unlinked.length > 0 && (
    <p className="text-muted-foreground">
      Linked but not on any of your projects: {unlinked.map((s) => s.full_name).join(", ")}. Add them from a project&apos;s settings.
    </p>
  );

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3 max-md:hidden">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">
          Your students <span className="font-medium text-muted-foreground">· {extras.students.length}</span>
        </h1>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {formatDay(today)}
        </p>
      </div>
      {active && (
        <div className="flex flex-wrap gap-1.5">
          <Link href="/reviews">
            <Pill tone={pendingReviews.length ? "info" : "neutral"}>
              {pendingReviews.length} review{pendingReviews.length === 1 ? "" : "s"} waiting
            </Pill>
          </Link>
          <a href="#blockers">
            <Pill tone={needYou.length ? "danger" : "neutral"}>
              {needYou.length} blocker{needYou.length === 1 ? "" : "s"} need you
            </Pill>
          </a>
          <Pill tone={staleStudents.length ? "warning" : "neutral"}>
            {staleStudents.length} quiet {STALE_DAYS}+ days
          </Pill>
        </div>
      )}
    </div>
  );

  // ───────────── Stage 2: Next action, what needs you, a simple student list ─────────────
  if (!active) {
    const needs = [
      { block: blockersBlock, label: `Blockers (${blockers.length})` },
      { block: reviewBlock, label: `Review queue (${pendingReviews.length})` },
    ].filter((x) => x.block !== null);
    const folded = [...needs.slice(1), { block: reportsBlock, label: `Reports to read (${reports.length})` }].filter((x) => x.block !== null);
    return (
      <div className="rf-stagger mx-auto max-w-[860px] space-y-5">
        {header}
        <GettingStarted items={checklist} compact />
        {tips}
        <NextActionCard action={action} />
        {needs[0]?.block}
        {studentsBlock}
        {folded.length > 0 && <MoreForToday labels={folded.map((x) => x.label)}>{folded.map((x) => x.block)}</MoreForToday>}
        {unlinkedLine}
        <div className="max-md:hidden">
          <JoinCodeCard code={ws.profile.join_code ?? ""} compact />
        </div>
      </div>
    );
  }

  // ───────────── Stage 3: the full picture, still three blocks above the fold ─────────────
  const pair = [reviewBlock, blockersBlock].filter((b) => b !== null);
  return (
    <div className="rf-stagger space-y-4">
      {header}

      <MobileSummary
        title={
          <>
            Your students <span className="font-medium text-muted-foreground">· {extras.students.length}</span>
          </>
        }
        tiles={[
          { label: "Reviews waiting", value: pendingReviews.length, href: "/reviews", icon: Inbox, tone: "info", hot: pendingReviews.length > 0 },
          { label: "Blockers need you", value: needYou.length, href: "#blockers", icon: OctagonAlert, tone: "danger", hot: needYou.length > 0 },
          { label: `Quiet ${STALE_DAYS}+ days`, value: staleStudents.length, href: "#attention", icon: Moon, tone: "warning", hot: staleStudents.length > 0 },
          { label: "Reports to read", value: reports.length, href: "/reports", icon: ScrollText, tone: "info", hot: reports.length > 0 },
        ]}
      />
      <GettingStarted items={checklist} />
      {tips}
      <NextActionCard action={action} />

      {studentsBlock}

      {pair.length > 0 && <div className={cn("grid gap-4", pair.length === 2 && "lg:grid-cols-2")}>{pair}</div>}

      {all ? reportsBlock : reportsBlock && <MoreForToday labels={[`Reports to read (${reports.length})`]}>{reportsBlock}</MoreForToday>}

      {unlinkedLine}
      <div className="max-md:hidden">
        <JoinCodeCard code={ws.profile.join_code ?? ""} compact />
      </div>
      <p className="text-center text-xs text-muted-foreground max-md:hidden">
        Showing {projectTitle.size} project{projectTitle.size === 1 ? "" : "s"} you belong to.
      </p>
    </div>
  );
}

