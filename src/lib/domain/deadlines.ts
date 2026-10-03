import { addDays, dateIn, daysBetween, formatDay, type ISODate } from "./dates.ts";
import type { Task, TaskStatus } from "../../types/database.ts";

export type Urgency = "overdue" | "today" | "soon" | "week" | "later" | "none" | "done";

/**
 * Urgency band for a deadline: overdue (past), today, soon (tomorrow, so
 * within 48h), week (≤ 7 days), later, none (no deadline), done.
 */
export function urgency(deadline: ISODate | null, today: ISODate, status?: TaskStatus): Urgency {
  if (status === "done") return "done";
  if (!deadline) return "none";
  if (deadline < today) return "overdue";
  if (deadline === today) return "today";
  if (deadline <= addDays(today, 1)) return "soon";
  if (deadline <= addDays(today, 7)) return "week";
  return "later";
}

/** "today", "tomorrow", "in 3d", "2d overdue", or "Mon 6 Oct" beyond a week. */
export function deadlineLabel(deadline: ISODate, today: ISODate): string {
  const days = daysBetween(today, deadline);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days}d`;
  return formatDay(deadline, Number(today.slice(0, 4)));
}

type DeadlineTask = Pick<Task, "status" | "effective_deadline">;

export function isOverdue(task: DeadlineTask, today: ISODate): boolean {
  return task.status !== "done" && task.effective_deadline !== null && task.effective_deadline < today;
}

/** The deadline a task is judged against: the professor's if set, else the student's own. */
export function accountableDeadline(task: Pick<Task, "professor_deadline" | "personal_deadline">): ISODate | null {
  return task.professor_deadline ?? task.personal_deadline;
}

/**
 * Was the task finished on time? `null` when it has no deadline or isn't done.
 * Judged in the student's timezone: finishing at 23:00 local on the due date is on time.
 */
export function finishedOnTime(
  task: Pick<Task, "status" | "completed_at" | "professor_deadline" | "personal_deadline">,
  timeZone: string,
): boolean | null {
  const deadline = accountableDeadline(task);
  if (task.status !== "done" || !task.completed_at || !deadline) return null;
  return dateIn(task.completed_at, timeZone) <= deadline;
}

/** Days a professor deadline was missed by: positive when late, else 0. */
export function daysLate(
  task: Pick<Task, "status" | "completed_at" | "professor_deadline">,
  today: ISODate,
  timeZone: string,
): number {
  if (!task.professor_deadline) return 0;
  const reference = task.status === "done" && task.completed_at ? dateIn(task.completed_at, timeZone) : today;
  return Math.max(0, daysBetween(task.professor_deadline, reference));
}

export const PRIORITY_RANK: Record<Task["priority"], number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Sort by effective deadline (missing last), then priority, then title. */
export function compareByDeadline(a: Pick<Task, "effective_deadline" | "priority" | "title">, b: typeof a): number {
  if (a.effective_deadline !== b.effective_deadline) {
    if (!a.effective_deadline) return 1;
    if (!b.effective_deadline) return -1;
    return a.effective_deadline < b.effective_deadline ? -1 : 1;
  }
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  return byPriority !== 0 ? byPriority : a.title.localeCompare(b.title);
}
