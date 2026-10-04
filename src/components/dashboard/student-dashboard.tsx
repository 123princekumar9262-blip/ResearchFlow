import Link from "next/link";
import { AlarmClock, BarChart3, CalendarDays, Clock, Flame, FolderKanban, FolderPlus, Hourglass, ListPlus, MessageSquareText, NotebookPen, Target } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { StatusIcon } from "@/components/common/status";
import { Pill, ProgressBar, RowLink, Section, SectionGroup, UserAvatar } from "@/components/common/ui-bits";
import { TaskRow } from "@/components/tasks/task-row";
import { NextActionCard } from "@/components/dashboard/next-action-card";
import { ConvertRemarkDialog } from "@/components/remarks/convert-remark-dialog";
import { RemarkQuickActions } from "@/components/remarks/remark-thread";
import { JoinProfessorCard } from "@/components/settings/join-professor";
import { GettingStarted, type ChecklistItem } from "@/components/onboarding/checklist";
import { ChapterTrigger, Tip } from "@/components/onboarding/tips";
import { NotificationsTip } from "@/components/onboarding/tip-kinds";
import { MobileSummary } from "@/components/dashboard/mobile-summary";
import { LinkProfessorLater, MoreForToday } from "@/components/dashboard/disclosure-bits";
import type { Disclosure } from "@/lib/onboarding/stage";
import { addDays, daysBetween, formatDay, formatMinutes, isoWeekday, isoWeekNumber, timeAgo, weekdayShort } from "@/lib/domain/dates";
import { compareByDeadline } from "@/lib/domain/deadlines";
import { remarksAwaiting, studentNextAction } from "@/lib/domain/next-action";
import { percent, projectProgress } from "@/lib/domain/progress";
import { delayRisk } from "@/lib/domain/risk";
import { logStreak, slipRate, usualMinutesOn, weekByDay } from "@/lib/domain/analytics";
import type { Workspace } from "@/lib/data/workspace";
import type { Health } from "@/lib/data/shell";

function greeting(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HEALTH_PILL: Record<Health, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  good: { tone: "success", label: "On track" },
  risk: { tone: "warning", label: "At risk" },
  late: { tone: "danger", label: "Missed deadline" },
  paused: { tone: "neutral", label: "On hold" },
};
const HEALTH_DOT: Record<Health, string> = { good: "bg-success", risk: "bg-warning", late: "bg-danger", paused: "bg-muted-foreground/50" };

export function StudentDashboard({
  ws,
  hasProfessor,
  aiEnabled,
  health,
  checklist,
  signals,
  ui,
}: {
  ws: Workspace;
  hasProfessor: boolean;
  aiEnabled: boolean;
  health: Record<string, Health>;
  checklist: ChecklistItem[];
  /** Time-of-day facts for the contextual tips. */
  signals: { evening: boolean; reportDue: boolean; weekStart: string };
  /** Stage and unlocked features (calm redesign spec). */
  ui: Disclosure;
}) {
  const { userId, today, profile } = ws;
  const projectTitle = new Map(ws.projects.map((p) => [p.id, p.title]));
  const professorProjects = new Set(ws.members.filter((m) => m.role === "professor").map((m) => m.project_id));

  const mine = ws.tasks.filter((t) => t.assignee_id === userId || t.assignee_id === null);
  const open = mine.filter((t) => t.status !== "done");
  const taskStatus = new Map(ws.tasks.map((t) => [t.id, t.status]));
  const blockedIds = new Set(ws.dependencies.filter((d) => taskStatus.get(d.depends_on_id) !== "done").map((d) => d.task_id));
  const blockersByTask = new Map<string, number>();
  for (const b of ws.blockers) if (b.task_id) blockersByTask.set(b.task_id, (blockersByTask.get(b.task_id) ?? 0) + 1);
  const mySlipRate = slipRate(mine, ws.deadlineChanges);

  const riskOf = (taskId: string) => {
    const t = ws.tasks.find((x) => x.id === taskId)!;
    const ev = ws.evidence.get(t.id);
    return delayRisk({
      task: t,
      today,
      openBlockers: blockersByTask.get(t.id) ?? 0,
      openDependencies: ws.dependencies.filter((d) => d.task_id === t.id && taskStatus.get(d.depends_on_id) !== "done").length,
      evidenceCount: ev?.count ?? 0,
      lastLogDate: ev?.lastLog ?? null,
      slipRate: mySlipRate,
    });
  };

  const loggedToday = ws.myLogs.some((l) => l.log_date === today);
  const action = studentNextAction({ userId, today, tasks: ws.tasks, dependencies: ws.dependencies, remarks: ws.remarks, blockers: ws.blockers, loggedToday });
  const feedback = remarksAwaiting(ws.remarks, ws.tasks, userId);

  const overdue = open
    .filter((t) => t.status !== "in_review" && t.effective_deadline && t.effective_deadline < today)
    .sort((a, b) => {
      const ap = a.professor_deadline && a.professor_deadline < today ? 0 : 1;
      const bp = b.professor_deadline && b.professor_deadline < today ? 0 : 1;
      return ap - bp || compareByDeadline(a, b);
    });
  const dueToday = open.filter((t) => !overdue.includes(t) && t.status !== "in_review" && t.effective_deadline === today).sort(compareByDeadline);
  const inProgress = open
    .filter((t) => !overdue.includes(t) && !dueToday.includes(t) && (t.status === "in_progress" || t.status === "changes_requested"))
    .sort(compareByDeadline);
  const inReview = open.filter((t) => t.status === "in_review");

  const upcomingTasks = open.filter((t) => t.status !== "in_review" && t.effective_deadline && t.effective_deadline > today && t.effective_deadline <= addDays(today, 7));
  const upcomingMilestones = ws.milestones.filter((m) => m.due_date && m.due_date > today && m.due_date <= addDays(today, 7));
  const upcomingDays = [...new Set([...upcomingTasks.map((t) => t.effective_deadline!), ...upcomingMilestones.map((m) => m.due_date!)])].sort();

  // Capacity: today's estimates against what you usually log on this weekday.
  const plannedMinutes = Math.round(dueToday.reduce((s, t) => s + (t.estimate_hours ?? 0), 0) * 60);
  const usual = usualMinutesOn(ws.myLogs, today);
  const weekday = WEEKDAY_LONG[isoWeekday(today) - 1];
  const overcommitted = usual !== null && plannedMinutes > usual * 1.25;

  const week = weekByDay(ws.myLogs, today);
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);
  const elapsed = week.filter((d) => d.date <= today);
  const emptyPast = elapsed.filter((d) => d.date < today && d.minutes === 0 && isoWeekday(d.date) <= 5);
  const maxDay = Math.max(60, ...week.map((d) => d.minutes));
  const firstName = profile.full_name.split(" ")[0];
  const streak = logStreak(ws.myLogs, today);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight sm:text-2xl">
          {greeting(profile.timezone)}, <span className="bg-grad-primary bg-clip-text text-transparent">{firstName}</span>
        </h1>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {formatDay(today)} · Week {isoWeekNumber(today)} · day {isoWeekday(today)} of 7
        </p>
      </div>
      {plannedMinutes > 0 ? (
        <Pill tone={overcommitted ? "warning" : "neutral"}>
          Planned today {formatMinutes(plannedMinutes)}
          {usual !== null && ` · your ${weekday} average ${formatMinutes(usual)}`}
        </Pill>
      ) : (
        usual !== null && <Pill>Your {weekday} average {formatMinutes(usual)}</Pill>
      )}
    </div>
  );

  const accountAge = daysBetween(profile.created_at.slice(0, 10), today);
  const tips = (
    <>
      {ws.myLogs.length === 0 && ws.projects.length > 0 && (
        <Tip id="never-logged" kind="discovery" title="Log your daily progress here." cta={{ label: "Write today's log", href: "/log/new" }}>
          Your first entry starts the record.
        </Tip>
      )}
      {!hasProfessor && accountAge >= 3 && (
        <Tip id="no-professor" kind="state" title="Working solo?" cta={{ label: "Link professor", href: "/settings" }}>
          Link your professor so your deadlines have an owner and your work has a reviewer.
        </Tip>
      )}
      <NotificationsTip />
    </>
  );

  // ───────────── Stage 1: one sentence, one button (calm redesign spec, Phase 02) ─────────────
  if (ws.projects.length === 0) {
    return (
      <div className="rf-rise mx-auto flex min-h-[62dvh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Welcome, {firstName}</p>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance">Everything in ResearchFlow lives in a project.</h1>
        <p className="max-w-[42ch] text-muted-foreground">Create one for the research you&apos;re doing now: a thesis chapter, a paper, an experiment series.</p>
        <Button size="lg" asChild className="mt-1">
          <Link href="/projects?new=1">
            <FolderPlus /> Create your first project
          </Link>
        </Button>
        {!hasProfessor && <LinkProfessorLater />}
      </div>
    );
  }

  const waitingRemark = action.kind === "respond_remark" ? feedback[0] : undefined;
  const { stage, all, has } = ui;
  const active = stage === 3 || all;

  // Each block only when it has something in it; overdue work and requests always show.
  const overdueBlock =
    overdue.length > 0 ? (
        <Section icon={AlarmClock} title="Overdue" count={overdue.length} tone="danger" alert tour="overdue" tourEmpty={overdue.length === 0} action={overdue.length > 0 ? <span className="max-sm:hidden">Can&apos;t be snoozed</span> : undefined}>
          {overdue.length === 0 ? (
            <p className="px-4 py-5 text-center text-muted-foreground">Nothing overdue. Keep it that way.</p>
          ) : (
            <div className="divide-y">
              {overdue.map((t) => (
                <TaskRow key={t.id} task={t} today={today} projectTitle={projectTitle.get(t.project_id)} risk={riskOf(t.id)} blocked={blockedIds.has(t.id)} />
              ))}
            </div>
          )}
        </Section>
    ) : null;
  const feedbackBlock =
    feedback.length > 0 ? (
        <Section icon={MessageSquareText} title="Professor feedback" count={feedback.length} tone="warning" tour="feedback" tourEmpty={feedback.length === 0}>
          {feedback.length === 0 ? (
            <p className="px-4 py-5 text-center text-muted-foreground">No open requests from your professor.</p>
          ) : (
            <div className="divide-y">
              {feedback.map((r) => {
                const task = r.task_id ? ws.tasks.find((t) => t.id === r.task_id) : undefined;
                return (
                  <div key={r.id} className="grid gap-2 px-3.5 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      <UserAvatar name={r.author_name} />
                      <b className="font-semibold">{r.author_name}</b>
                      <Pill tone={r.kind === "question" ? "info" : "warning"} className="h-[18px] text-[10.5px]">
                        {r.kind === "question" ? "Question" : "Change request"}
                      </Pill>
                      <span className="ml-auto text-muted-foreground">{timeAgo(r.created_at)}</span>
                    </div>
                    <Link href={r.task_id ? `/tasks/${r.task_id}#remark-${r.id}` : `/projects/${r.project_id}/remarks#remark-${r.id}`} className="line-clamp-4 whitespace-pre-line hover:underline max-sm:line-clamp-2">
                      {r.body}
                    </Link>
                    <p className="text-[11.5px] text-muted-foreground max-sm:hidden">
                      {r.source === "meeting" && "From a meeting · "}
                      {task ? `on ${task.title}` : projectTitle.get(r.project_id)}
                    </p>
                    <RemarkQuickActions
                      remarkId={r.id}
                      projectId={r.project_id}
                      convert={<ConvertRemarkDialog key="convert" remarkId={r.id} body={r.body} authorName={r.author_name} today={today} aiEnabled={aiEnabled} />}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Section>
    ) : null;
  const todayBlock = (
        <Section
          icon={Target}
          accent="deadline"
          title="Today's focus"
          count={dueToday.length + inProgress.length}
          tour="focus"
          tourEmpty={dueToday.length + inProgress.length === 0}
     
          action={plannedMinutes > 0 ? <span className="max-sm:hidden">{formatMinutes(plannedMinutes)} estimated</span> : undefined}
        >
          {dueToday.length + inProgress.length === 0 ? (
            <p className="px-4 py-5 text-center text-muted-foreground">Nothing due today and nothing in progress. Start the next task.</p>
          ) : (
            <>
              {dueToday.length > 0 && <SectionGroup first>Due today</SectionGroup>}
              <div className="divide-y">
                {dueToday.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} projectTitle={projectTitle.get(t.project_id)} risk={riskOf(t.id)} evidence={ws.evidence.get(t.id)?.count} blocked={blockedIds.has(t.id)} />
                ))}
              </div>
              {inProgress.length > 0 && <SectionGroup first={dueToday.length === 0}>In progress</SectionGroup>}
              <div className="divide-y">
                {inProgress.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} projectTitle={projectTitle.get(t.project_id)} risk={riskOf(t.id)} evidence={ws.evidence.get(t.id)?.count} blocked={blockedIds.has(t.id)} />
                ))}
              </div>
            </>
          )}
        </Section>
  );
  const upcomingBlock =
    (has.calendar && upcomingDays.length > 0) || all ? (
        <Section icon={CalendarDays} title="Next 7 days" count={upcomingTasks.length + upcomingMilestones.length} tour="next7" tourEmpty={upcomingDays.length === 0} action={<Link href="/calendar" className="hover:text-foreground">Calendar →</Link>}>
          {upcomingDays.length === 0 ? (
            <p className="px-4 py-5 text-center text-muted-foreground">No deadlines in the coming week.</p>
          ) : (
            upcomingDays.map((day, i) => (
              <div key={day} className={cn(i >= 3 && "max-md:hidden")}>
                <SectionGroup first={i === 0}>{formatDay(day)}</SectionGroup>
                <div className="divide-y">
                  {upcomingMilestones
                    .filter((m) => m.due_date === day)
                    .map((m) => {
                      const tasks = ws.tasks.filter((t) => t.milestone_id === m.id);
                      return (
                        <RowLink key={m.id} href={`/projects/${m.project_id}`}>
                          <span className="text-primary">◆</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              <b className="font-medium">Milestone:</b> {m.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground max-sm:hidden">
                              {projectTitle.get(m.project_id)} · {tasks.filter((t) => t.status === "done").length} of {tasks.length} tasks done
                            </span>
                          </span>
                          <DeadlineChip date={m.due_date!} today={today} kind="milestone" />
                        </RowLink>
                      );
                    })}
                  {upcomingTasks
                    .filter((t) => t.effective_deadline === day)
                    .sort(compareByDeadline)
                    .map((t) => (
                      <TaskRow key={t.id} task={t} today={today} projectTitle={projectTitle.get(t.project_id)} risk={riskOf(t.id)} blocked={blockedIds.has(t.id)} />
                    ))}
                </div>
              </div>
            ))
          )}
          {upcomingDays.length > 3 && (
            <Link href="/tasks?view=upcoming" className="block border-t px-3.5 py-2.5 text-center text-xs font-medium text-primary md:hidden">
              See all {upcomingTasks.length + upcomingMilestones.length} upcoming
            </Link>
          )}
        </Section>
    ) : null;
  const waitingBlock =
    active && inReview.length > 0 ? (
        <Section icon={Hourglass} title="Waiting on your professor" count={inReview.length} tone="info" className="max-md:hidden">
          <div className="divide-y">
            {inReview.map((t) => (
              <RowLink key={t.id} href={`/tasks/${t.id}`}>
                <StatusIcon status="in_review" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Submitted {t.submitted_at ? timeAgo(t.submitted_at) : "recently"} · {ws.evidence.get(t.id)?.count ?? 0} pieces of evidence
                  </span>
                </span>
              </RowLink>
            ))}
          </div>
        </Section>
    ) : null;
  const projectsBlock =
    active || ws.projects.length > 1 ? (
        <Section icon={FolderKanban} accent="success" title="Projects" count={ws.projects.length} tour="projects" className="max-md:hidden">
          <div className="divide-y">
            {ws.projects.map((p) => {
              const tasks = ws.tasks.filter((t) => t.project_id === p.id);
              const progress = projectProgress(tasks, ws.milestones.filter((m) => m.project_id === p.id));
              const next = ws.milestones
                .filter((m) => m.project_id === p.id && m.due_date && m.due_date >= today)
                .sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
              const h = HEALTH_PILL[health[p.id] ?? "good"];
              return (
                <Link key={p.id} href={`/projects/${p.id}`} className="grid gap-1.5 px-3.5 py-3 transition-colors hover:bg-accent/50">
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <b className="min-w-0 truncate font-semibold">{p.title}</b>
                    <Pill tone={h.tone} className="h-[18px] text-[10.5px]">
                      {h.label}
                    </Pill>
                  </span>
                  <span className="flex items-center gap-2">
                    <ProgressBar value={progress} tone={progress === 1 ? "success" : "primary"} />
                    <span className="font-mono text-[11.5px] tabular text-muted-foreground">{percent(progress)}%</span>
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {next ? `Next: ◆ ${next.title} · ${formatDay(next.due_date!)}` : professorProjects.has(p.id) ? "No upcoming milestone" : "Solo project"}
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
    ) : null;
  const weekBlock = has.chart ? (
        <Section icon={BarChart3} title="This week" tour="this-week" className="max-md:hidden" action={<span className="font-mono">{formatMinutes(weekMinutes)}</span>}>
          <div className="grid gap-2 px-3.5 py-3">
            <WeekBars week={week} today={today} maxDay={maxDay} />
            <p className="text-xs">
              {elapsed.filter((d) => d.minutes > 0).length} of {elapsed.length} days logged
              {emptyPast.length > 0 && (
                <span className="text-muted-foreground"> · {emptyPast.map((d) => WEEKDAY_LONG[isoWeekday(d.date) - 1]).join(", ")} empty</span>
              )}
            </p>
          </div>
        </Section>
  ) : null;
  const logBlock = (
    <>
      {!loggedToday ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.05] px-4 py-3">
          <NotebookPen className="size-4 text-primary" />
          <p className="min-w-0 flex-1">
            <b className="font-medium">No log yet today.</b> <span className="text-muted-foreground">About a minute. It&apos;s your evidence when results aren&apos;t in yet.</span>
          </p>
          <Button size="sm" asChild>
            <Link href="/log/new">
              Write today&apos;s log <kbd className="border-white/25 bg-white/15 text-inherit">N</kbd>
            </Link>
          </Button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Today&apos;s log is written · {formatMinutes(ws.myLogs.filter((l) => l.log_date === today).reduce((s, l) => s + l.minutes_spent, 0))} logged.{" "}
          <Link href="/log/new" className="underline-offset-2 hover:underline">
            Update it
          </Link>
        </p>
      )}
    </>
  );

  // At most three things above the fold: Next action, then what needs action first. The rest folds away.
  const priority = [
    { block: overdueBlock, label: `Overdue (${overdue.length})` },
    { block: feedbackBlock, label: `Feedback (${feedback.length})` },
    { block: todayBlock, label: `Today (${dueToday.length + inProgress.length})` },
  ].filter((x) => x.block !== null);
  const shownCount = all ? priority.length : active ? 2 : 1;
  const folded = [
    ...priority.slice(shownCount),
    { block: upcomingBlock, label: `Upcoming (${upcomingTasks.length + upcomingMilestones.length})` },
    { block: waitingBlock, label: `Waiting on your professor (${inReview.length})` },
    ...(active ? [] : [{ block: projectsBlock, label: "Projects" }, { block: weekBlock, label: "This week" }]),
  ].filter((x) => x.block !== null);
  const shown = priority.slice(0, shownCount).map((x) => x.block);
  const more = folded.length > 0 && (
    <MoreForToday labels={folded.map((x) => x.label)}>
      {folded.map((x) => x.block)}
    </MoreForToday>
  );

  const nextAction = (
    <NextActionCard
      action={action}
      focus
      secondary={
        waitingRemark ? (
          <ConvertRemarkDialog
            remarkId={waitingRemark.id}
            body={waitingRemark.body}
            authorName={waitingRemark.author_name}
            today={today}
            aiEnabled={aiEnabled}
            trigger={
              <Button variant="outline" className="flex-1 sm:flex-none">
                <ListPlus /> Convert to task
              </Button>
            }
          />
        ) : undefined
      }
    />
  );

  const topTips = (
    <>
      {overdue.length > 0 && (
        <Tip id="overdue" kind="state" tone="danger" hideOnPhone title={`You have ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}.`} cta={{ label: "Review overdue", href: "/tasks?view=overdue" }}>
          Review them now: finish them, or request an extension.
        </Tip>
      )}
      {!loggedToday && ws.myLogs.length > 0 && signals.evening && (
        <Tip id="no-log-today" kind="state" tone="warning" title="No log yet today." cta={{ label: "Write today's log", href: "/log/new" }}>
          One minute now saves an awkward question later.
        </Tip>
      )}
      {signals.reportDue && (
        <Tip id="report-due" kind="state" title="This week's report is ready." cta={{ label: "Open report", href: `/reports/${signals.weekStart}` }}>
          Add a note and submit it before Monday.
        </Tip>
      )}
      {tips}
    </>
  );

  // ───────────── Stage 2: one column, three blocks ─────────────
  if (!active) {
    return (
      <div className="mx-auto max-w-[720px] space-y-5">
        <ChapterTrigger tour="dashboard" />
        <div className="rf-rise max-md:hidden">{header}</div>
        <GettingStarted items={checklist} compact />
        {topTips}
        {nextAction}
        <div className="rf-stagger grid gap-5">{shown}</div>
        {logBlock}
        {more}
        {!hasProfessor && <JoinProfessorCard compact />}
      </div>
    );
  }

  // ───────────── Stage 3: the full picture, still in priority order ─────────────
  return (
    <div className="space-y-4">
      <ChapterTrigger tour="dashboard" />
      <div className="rf-rise max-md:hidden">{header}</div>
      <MobileSummary
        title={
          <>
            {greeting(profile.timezone)}, <span className="bg-grad-primary bg-clip-text text-transparent">{firstName}</span>
          </>
        }
        aside={`Week ${isoWeekNumber(today)} · day ${isoWeekday(today)}`}
        tiles={[
          { label: "Overdue", value: overdue.length, href: "/tasks?view=overdue", icon: AlarmClock, tone: "danger", hot: overdue.length > 0 },
          { label: "Due today", value: dueToday.length, href: "/tasks?view=today", icon: Target, tone: "warning", hot: dueToday.length > 0 },
          { label: "Logged this week", value: formatMinutes(weekMinutes), href: "/log", icon: Clock, tone: "primary" },
          { label: "Day streak", value: `${streak}d`, href: "/log", icon: Flame, tone: "success", hot: streak > 0 },
        ]}
      >
        <div className="grid gap-2 px-4 py-3">
          <WeekBars week={week} today={today} maxDay={maxDay} />
          <p className="text-xs text-muted-foreground">
            {elapsed.filter((d) => d.minutes > 0).length} of {elapsed.length} days logged this week
          </p>
        </div>
        <div className="divide-y border-t">
          {ws.projects.map((p) => {
            const progress = projectProgress(ws.tasks.filter((t) => t.project_id === p.id), ws.milestones.filter((m) => m.project_id === p.id));
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="grid gap-1.5 px-4 py-2.5 active:bg-accent" data-tour="projects">
                <span className="flex items-center gap-2">
                  <span className={cn("size-[7px] shrink-0 rounded-full", HEALTH_DOT[health[p.id] ?? "good"])} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.title}</span>
                  <span className="font-mono text-[11.5px] tabular text-muted-foreground">{percent(progress)}%</span>
                </span>
                <ProgressBar value={progress} tone={progress === 1 ? "success" : "primary"} />
              </Link>
            );
          })}
        </div>
      </MobileSummary>
      <GettingStarted items={checklist} />
      {topTips}
      {nextAction}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_344px] lg:items-start">
        <div className="rf-stagger flex min-w-0 flex-col gap-4">
          {shown}
          {more}
        </div>
        <div className="rf-stagger flex min-w-0 flex-col gap-4 max-md:hidden">
          {projectsBlock}
          {weekBlock}
        </div>
      </div>

      {!hasProfessor && <JoinProfessorCard compact />}
      <div className="max-md:hidden">{logBlock}</div>
    </div>
  );
}

/** Minutes logged per day this week, Monday to Sunday; today is outlined. */
function WeekBars({ week, today, maxDay }: { week: { date: string; minutes: number }[]; today: string; maxDay: number }) {
  return (
    <>
      <div className="grid h-14 grid-cols-7 items-end gap-1" aria-hidden>
        {week.map((d) => (
          <i
            key={d.date}
            title={`${formatDay(d.date)}: ${formatMinutes(d.minutes)}`}
            className={cn(
              "block rounded-t-[3px]",
              d.minutes > 0 ? "bg-primary bg-[linear-gradient(180deg,var(--primary-2),var(--primary))] origin-bottom animate-[rf-rise_0.6s_ease-out_both]" : "bg-border",
              d.date === today && "outline-[1.5px] outline-offset-2 outline-primary outline-dashed",
              d.date > today && "opacity-40",
            )}
            style={{ height: d.minutes > 0 ? `${Math.max(8, (d.minutes / maxDay) * 100)}%` : "4%" }}
          />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-muted-foreground">
        {week.map((d, i) => (
          <span key={d.date} className={cn(d.date === today && "font-semibold text-foreground")}>
            {weekdayShort(i)[0]}
          </span>
        ))}
      </div>
    </>
  );
}
