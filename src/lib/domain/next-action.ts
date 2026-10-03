// The Next Action engine: a deterministic, explainable priority ladder. The
// first rung that matches wins, and every answer carries the reason it won, so
// the recommendation can be trusted rather than second-guessed.

import { addDays, daysBetween, type ISODate } from "./dates.ts";
import { compareByDeadline, deadlineLabel } from "./deadlines.ts";
import type { Blocker, Remark, Task, UserRole } from "../../types/database.ts";

export type Tone = "danger" | "warning" | "info" | "default" | "success";

export interface NextAction {
  kind:
    | "respond_remark"
    | "revise_task"
    | "overdue_task"
    | "follow_up_blocker"
    | "due_soon"
    | "continue_task"
    | "start_task"
    | "write_log"
    | "plan"
    | "review_task"
    | "unblock_student"
    | "check_in_student"
    | "acknowledge_report"
    | "all_clear";
  title: string;
  reason: string;
  href: string;
  tone: Tone;
  /** Shorter wording for phones, where the full quote would fill the screen. */
  short?: { title: string; reason: string };
}

export type ActionTask = Pick<
  Task,
  | "id"
  | "title"
  | "status"
  | "priority"
  | "assignee_id"
  | "project_id"
  | "professor_deadline"
  | "effective_deadline"
  | "submitted_at"
>;

export type ActionRemark = Pick<
  Remark,
  "id" | "body" | "kind" | "source" | "task_id" | "project_id" | "parent_id" | "addressed_at" | "created_at"
> & { author_role: UserRole; author_name?: string };

export type ActionBlocker = Pick<
  Blocker,
  "id" | "title" | "severity" | "status" | "raised_by" | "needs_professor" | "project_id" | "created_at"
>;

export interface StudentActionInput {
  userId: string;
  today: ISODate;
  tasks: ActionTask[];
  /** Pairs (task_id → depends_on_id). */
  dependencies: { task_id: string; depends_on_id: string }[];
  remarks: ActionRemark[];
  blockers: ActionBlocker[];
  loggedToday: boolean;
}

/** A remark that waits on the student: a professor's (or meeting-recorded) ask that nobody has addressed. */
export function needsResponse(remark: ActionRemark): boolean {
  return (
    remark.parent_id === null &&
    remark.addressed_at === null &&
    (remark.kind === "change_request" || remark.kind === "question") &&
    (remark.author_role === "professor" || remark.source === "meeting")
  );
}

/**
 * The open professor requests that wait on this student: project-level ones,
 * and those about a task assigned to them (or to nobody). A request on a
 * lab-mate's task is theirs to answer.
 */
export function remarksAwaiting<R extends ActionRemark>(remarks: R[], tasks: Pick<Task, "id" | "assignee_id">[], userId: string): R[] {
  const assignee = new Map(tasks.map((t) => [t.id, t.assignee_id]));
  return remarks
    .filter(needsResponse)
    .filter((r) => {
      if (r.task_id === null) return true;
      if (!assignee.has(r.task_id)) return false;
      const who = assignee.get(r.task_id);
      return who === userId || who === null;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** "Prof. Anita Mehta" → "Prof. Mehta"; other names are kept whole. */
export function shortName(name: string): string {
  const m = name.match(/^((?:Prof|Dr)\.?)\s+.*?(\S+)$/);
  return m ? `${m[1]} ${m[2]}` : name;
}

function excerpt(text: string, max = 80): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function dependencyIsOpen(input: StudentActionInput): (taskId: string) => boolean {
  const status = new Map(input.tasks.map((t) => [t.id, t.status]));
  const open = new Set<string>();
  for (const d of input.dependencies) {
    // A dependency we can't see is treated as open: safer than a false "go".
    if (status.get(d.depends_on_id) !== "done") open.add(d.task_id);
  }
  return (taskId) => open.has(taskId);
}

export function studentNextAction(input: StudentActionInput): NextAction {
  const { today, userId } = input;
  const mine = input.tasks.filter((t) => t.status !== "done" && (t.assignee_id === userId || t.assignee_id === null));

  // 1. The professor asked for something and is waiting.
  const waiting = remarksAwaiting(input.remarks, input.tasks, userId);
  if (waiting.length > 0) {
    const r = waiting[0];
    const ageDays = daysBetween(r.created_at.slice(0, 10), today);
    const who = r.author_name ? shortName(r.author_name) : "your professor";
    const on = r.task_id ? input.tasks.find((t) => t.id === r.task_id)?.title : undefined;
    return {
      kind: "respond_remark",
      title: `Respond to ${who}: "${excerpt(r.body, 70)}"`,
      reason:
        (r.kind === "question" ? "Question" : "Change request") +
        (on ? ` on ${on}` : "") +
        (ageDays > 0 ? ` · ${ageDays} day${ageDays === 1 ? "" : "s"} ago` : " · today") +
        (r.kind === "change_request" && on ? " · blocks approval" : "") +
        (waiting.length > 1 ? ` · ${waiting.length - 1} more waiting` : ""),
      short: {
        title: `Respond to ${who === "your professor" ? "your professor" : who}'s ${r.kind === "question" ? "question" : "change request"}`,
        reason: [on ? `On ${on}` : null, ageDays > 0 ? `${ageDays} day${ageDays === 1 ? "" : "s"} ago` : "today"].filter(Boolean).join(" · "),
      },
      href: r.task_id ? `/tasks/${r.task_id}#remark-${r.id}` : `/projects/${r.project_id}/remarks#remark-${r.id}`,
      tone: "warning",
    };
  }

  // 2. Work came back from review.
  const revisions = mine.filter((t) => t.status === "changes_requested").sort(compareByDeadline);
  if (revisions.length > 0) {
    const t = revisions[0];
    return {
      kind: "revise_task",
      title: `Revise "${t.title}"`,
      reason: "Your professor requested changes" + (t.effective_deadline ? ` · due ${deadlineLabel(t.effective_deadline, today)}` : ""),
      href: `/tasks/${t.id}`,
      tone: "warning",
    };
  }

  // 3. Something is already late. Professor deadlines first, then most overdue.
  const overdue = mine
    .filter((t) => t.status !== "in_review" && t.effective_deadline && t.effective_deadline < today)
    .sort((a, b) => {
      const aProf = a.professor_deadline !== null && a.professor_deadline < today ? 0 : 1;
      const bProf = b.professor_deadline !== null && b.professor_deadline < today ? 0 : 1;
      return aProf - bProf || compareByDeadline(a, b);
    });
  if (overdue.length > 0) {
    const t = overdue[0];
    const professorLate = t.professor_deadline !== null && t.professor_deadline < today;
    const days = daysBetween(t.effective_deadline!, today);
    return {
      kind: "overdue_task",
      title: `Finish "${t.title}"`,
      reason: `${days} day${days === 1 ? "" : "s"} overdue on ${professorLate ? "a professor" : "your own"} deadline` +
        (overdue.length > 1 ? ` · ${overdue.length - 1} more overdue` : ""),
      href: `/tasks/${t.id}`,
      tone: "danger",
    };
  }

  // 4. Your own high-severity blocker is still open.
  const stuck = input.blockers
    .filter((b) => b.status === "open" && b.raised_by === userId && b.severity === "high")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (stuck.length > 0) {
    const b = stuck[0];
    const age = daysBetween(b.created_at.slice(0, 10), today);
    return {
      kind: "follow_up_blocker",
      title: `Unblock: ${b.title}`,
      reason: `High-severity blocker open for ${age} day${age === 1 ? "" : "s"}${b.needs_professor ? " · waiting on your professor" : ""}`,
      href: `/projects/${b.project_id}/blockers#blocker-${b.id}`,
      tone: "warning",
    };
  }

  const blocked = dependencyIsOpen(input);
  const actionable = mine.filter((t) => t.status !== "in_review" && !blocked(t.id));

  // 5. Due within 48 hours. Keep momentum on what's started.
  const soon = actionable
    .filter((t) => t.effective_deadline && t.effective_deadline <= addDays(today, 1))
    .sort((a, b) => (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) || compareByDeadline(a, b));
  if (soon.length > 0) {
    const t = soon[0];
    return {
      kind: "due_soon",
      title: `${t.status === "in_progress" ? "Finish" : "Start"} "${t.title}"`,
      reason: `Due ${deadlineLabel(t.effective_deadline!, today)}`,
      href: `/tasks/${t.id}`,
      tone: "warning",
    };
  }

  // 6. Continue what's in flight.
  const inProgress = actionable.filter((t) => t.status === "in_progress").sort(compareByDeadline);
  if (inProgress.length > 0) {
    const t = inProgress[0];
    return {
      kind: "continue_task",
      title: `Continue "${t.title}"`,
      reason: t.effective_deadline ? `In progress · due ${deadlineLabel(t.effective_deadline, today)}` : "In progress",
      href: `/tasks/${t.id}`,
      tone: "info",
    };
  }

  // 7. Start the next unblocked task.
  const todo = actionable.filter((t) => t.status === "todo").sort(compareByDeadline);
  if (todo.length > 0) {
    const t = todo[0];
    return {
      kind: "start_task",
      title: `Start "${t.title}"`,
      reason: t.effective_deadline ? `Next deadline · due ${deadlineLabel(t.effective_deadline, today)}` : `Highest-priority open task (${t.priority})`,
      href: `/tasks/${t.id}`,
      tone: "default",
    };
  }

  // 8. Nothing to execute.
  if (!input.loggedToday && mine.length > 0) {
    return {
      kind: "write_log",
      title: "Write today's progress log",
      reason: "Everything else is waiting on review. Record what you did today.",
      href: "/log/new",
      tone: "default",
    };
  }
  return {
    kind: "plan",
    title: "Plan your next task",
    reason: mine.some((t) => t.status === "in_review")
      ? "Your work is with your professor for review. Line up what comes next."
      : "No open tasks. Break the next milestone into tasks.",
    href: "/projects",
    tone: "success",
  };
}

// ───────────────────────────── professor ─────────────────────────────

export interface ProfessorActionInput {
  today: ISODate;
  pendingReviews: (ActionTask & { studentName: string | null })[];
  blockers: (ActionBlocker & { raisedByName: string })[];
  staleStudents: { studentId: string; name: string; daysSinceLog: number | null }[];
  unacknowledgedReports: { id: string; studentId: string; studentName: string; weekStart: ISODate }[];
}

export function professorNextAction(input: ProfessorActionInput): NextAction {
  const { today } = input;

  const reviews = [...input.pendingReviews].sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  if (reviews.length > 0) {
    const t = reviews[0];
    const waited = t.submitted_at ? daysBetween(t.submitted_at.slice(0, 10), today) : 0;
    return {
      kind: "review_task",
      title: `Review "${t.title}"${t.studentName ? ` from ${t.studentName}` : ""}`,
      reason: `Waiting ${waited === 0 ? "since today" : `${waited} day${waited === 1 ? "" : "s"}`}` +
        (reviews.length > 1 ? ` · ${reviews.length - 1} more in your queue` : ""),
      href: `/tasks/${t.id}`,
      tone: waited >= 2 ? "warning" : "info",
    };
  }

  const severity = { high: 0, medium: 1, low: 2 } as const;
  const blockers = input.blockers
    .filter((b) => b.status === "open" && b.needs_professor)
    .sort((a, b) => severity[a.severity] - severity[b.severity] || a.created_at.localeCompare(b.created_at));
  if (blockers.length > 0) {
    const b = blockers[0];
    return {
      kind: "unblock_student",
      title: `Unblock ${b.raisedByName}: ${b.title}`,
      reason: `${b.severity[0].toUpperCase()}${b.severity.slice(1)}-severity blocker, open ${daysBetween(b.created_at.slice(0, 10), today)}d`,
      href: `/projects/${b.project_id}/blockers#blocker-${b.id}`,
      tone: b.severity === "high" ? "danger" : "warning",
    };
  }

  const stale = [...input.staleStudents].sort((a, b) => (b.daysSinceLog ?? 999) - (a.daysSinceLog ?? 999));
  if (stale.length > 0) {
    const s = stale[0];
    return {
      kind: "check_in_student",
      title: `Check in with ${s.name}`,
      reason: s.daysSinceLog === null ? "No progress logged yet" : `No progress logged for ${s.daysSinceLog} days`,
      href: `/students/${s.studentId}`,
      tone: "warning",
    };
  }

  const reports = [...input.unacknowledgedReports].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (reports.length > 0) {
    const r = reports[0];
    return {
      kind: "acknowledge_report",
      title: `Read ${r.studentName}'s weekly report`,
      reason: reports.length > 1 ? `${reports.length} reports awaiting acknowledgement` : "Submitted and awaiting your acknowledgement",
      href: `/reports/${r.weekStart}?student=${r.studentId}`,
      tone: "info",
    };
  }

  return {
    kind: "all_clear",
    title: "All clear",
    reason: "No reviews, blockers or unread reports. Your students are moving.",
    href: "/dashboard",
    tone: "success",
  };
}
