// Notifications, derived from live data instead of stored. An item exists only
// while its cause does: once a request is addressed or a review is done, it
// disappears, so the inbox can never go stale.

import { daysBetween, formatDay, type ISODate } from "./dates.ts";
import { remarksAwaiting, type ActionRemark, type ActionTask, type Tone } from "./next-action.ts";
import type { ExtensionRequest } from "../../types/database.ts";

export interface InboxItem {
  id: string;
  /** Needs action: something waits on you. FYI: a decision made about your work. */
  needsAction: boolean;
  tone: Tone;
  title: string;
  detail: string;
  href: string;
  at: string;
  action?: string;
}

const excerpt = (text: string, max = 90) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

type NamedTask = ActionTask & { title: string; updated_at?: string };

export interface StudentInboxInput {
  userId: string;
  today: ISODate;
  /** Midnight-ish cutoff for FYI items, as an ISO timestamp. */
  since: string;
  tasks: NamedTask[];
  remarks: (ActionRemark & { author_name: string })[];
  extensions: Pick<ExtensionRequest, "id" | "task_id" | "project_id" | "status" | "proposed_deadline" | "decided_at" | "requested_by">[];
  projectTitle: Map<string, string>;
}

export function studentInbox(input: StudentInboxInput): InboxItem[] {
  const { userId, today } = input;
  const taskById = new Map(input.tasks.map((t) => [t.id, t]));
  const mine = input.tasks.filter((t) => t.assignee_id === userId || t.assignee_id === null);
  const items: InboxItem[] = [];

  for (const r of remarksAwaiting(input.remarks, input.tasks, userId)) {
    const task = r.task_id ? taskById.get(r.task_id) : undefined;
    items.push({
      id: `remark-${r.id}`,
      needsAction: true,
      tone: "warning",
      title: `${r.author_name} ${r.kind === "question" ? "asked a question" : "requested a change"}`,
      detail: `"${excerpt(r.body)}"${task ? ` · on ${task.title}` : ` · ${input.projectTitle.get(r.project_id) ?? ""}`}`,
      href: r.task_id ? `/tasks/${r.task_id}#remark-${r.id}` : `/projects/${r.project_id}/remarks#remark-${r.id}`,
      at: r.created_at,
      action: "Respond",
    });
  }

  for (const t of mine.filter((t) => t.status === "changes_requested")) {
    items.push({
      id: `changes-${t.id}`,
      needsAction: true,
      tone: "danger",
      title: `Changes requested on "${t.title}"`,
      detail: input.projectTitle.get(t.project_id) ?? "",
      href: `/tasks/${t.id}`,
      at: t.updated_at ?? input.since,
      action: "Revise",
    });
  }

  for (const t of mine.filter((t) => t.status !== "done" && t.status !== "in_review" && t.professor_deadline && t.professor_deadline < today)) {
    const days = daysBetween(t.professor_deadline!, today);
    items.push({
      id: `overdue-${t.id}`,
      needsAction: true,
      tone: "danger",
      title: `Missed the professor deadline on "${t.title}"`,
      detail: `${days} day${days === 1 ? "" : "s"} overdue · finish it, or request an extension`,
      href: `/tasks/${t.id}`,
      at: `${t.professor_deadline}T23:59:59Z`,
      action: "Open",
    });
  }

  for (const e of input.extensions.filter((e) => e.requested_by === userId && e.status !== "pending" && e.decided_at && e.decided_at >= input.since)) {
    const task = taskById.get(e.task_id);
    items.push({
      id: `ext-${e.id}`,
      needsAction: false,
      tone: e.status === "approved" ? "success" : "warning",
      title: e.status === "approved" ? `Extension approved: due ${formatDay(e.proposed_deadline)}` : "Extension declined",
      detail: task?.title ?? "",
      href: `/tasks/${e.task_id}`,
      at: e.decided_at!,
    });
  }

  return sortInbox(items);
}

export interface ProfessorInboxInput {
  today: ISODate;
  reviews: (NamedTask & { studentName: string | null })[];
  blockers: { id: string; title: string; severity: string; project_id: string; created_at: string; needs_professor: boolean; status: string; raisedByName: string }[];
  extensions: (Pick<ExtensionRequest, "id" | "task_id" | "project_id" | "status" | "proposed_deadline" | "current_deadline" | "reason" | "created_at"> & {
    studentName: string;
    taskTitle: string;
  })[];
  reports: { id: string; studentId: string; studentName: string; weekStart: string; submittedAt: string }[];
  quiet: { studentId: string; name: string; daysSinceLog: number | null }[];
}

export function professorInbox(input: ProfessorInboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  for (const t of input.reviews) {
    items.push({
      id: `review-${t.id}`,
      needsAction: true,
      tone: "info",
      title: `Review "${t.title}"`,
      detail: `Submitted by ${t.studentName ?? "a student"}`,
      href: `/reviews?task=${t.id}`,
      at: t.submitted_at ?? input.today,
      action: "Review",
    });
  }
  for (const e of input.extensions.filter((e) => e.status === "pending")) {
    items.push({
      id: `ext-${e.id}`,
      needsAction: true,
      tone: "warning",
      title: `${e.studentName} asks to move "${e.taskTitle}" to ${formatDay(e.proposed_deadline)}`,
      detail: `"${excerpt(e.reason)}"${e.current_deadline ? ` · now due ${formatDay(e.current_deadline)}` : ""}`,
      href: `/tasks/${e.task_id}#extension`,
      at: e.created_at,
      action: "Decide",
    });
  }
  for (const b of input.blockers.filter((b) => b.status === "open" && b.needs_professor)) {
    items.push({
      id: `blocker-${b.id}`,
      needsAction: true,
      tone: b.severity === "high" ? "danger" : "warning",
      title: `${b.raisedByName} is blocked: ${b.title}`,
      detail: `${b.severity} severity`,
      href: `/projects/${b.project_id}/blockers#blocker-${b.id}`,
      at: b.created_at,
      action: "Respond",
    });
  }
  for (const r of input.reports) {
    items.push({
      id: `report-${r.id}`,
      needsAction: true,
      tone: "info",
      title: `${r.studentName}'s weekly report`,
      detail: `Week of ${formatDay(r.weekStart)} · awaiting acknowledgement`,
      href: `/reports/${r.weekStart}?student=${r.studentId}`,
      at: r.submittedAt,
      action: "Read",
    });
  }
  for (const q of input.quiet) {
    items.push({
      id: `quiet-${q.studentId}`,
      needsAction: false,
      tone: "warning",
      title: `${q.name} has been quiet`,
      detail: q.daysSinceLog === null ? "No progress logged yet" : `No progress logged for ${q.daysSinceLog} days`,
      href: `/students/${q.studentId}`,
      at: input.today,
    });
  }
  return sortInbox(items);
}

/** Needs-action first, oldest first (it has waited longest); then FYI, newest first. */
function sortInbox(items: InboxItem[]): InboxItem[] {
  const action = items.filter((i) => i.needsAction).sort((a, b) => a.at.localeCompare(b.at));
  const fyi = items.filter((i) => !i.needsAction).sort((a, b) => b.at.localeCompare(a.at));
  return [...action, ...fyi];
}
