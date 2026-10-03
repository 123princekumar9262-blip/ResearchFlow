import { addDays, daysBetween, eachDay, weekStartOf, type ISODate } from "./dates.ts";
import { finishedOnTime } from "./deadlines.ts";
import type { DeadlineChange, ProgressLog, Task } from "../../types/database.ts";

type LogLike = Pick<ProgressLog, "log_date" | "minutes_spent">;

/** Minutes logged per ISO week for the last `weeks` weeks, oldest first. */
export function minutesPerWeek(logs: LogLike[], today: ISODate, weeks = 8): { weekStart: ISODate; minutes: number }[] {
  const current = weekStartOf(today);
  const buckets = Array.from({ length: weeks }, (_, i) => ({ weekStart: addDays(current, -7 * (weeks - 1 - i)), minutes: 0 }));
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]));
  for (const log of logs) {
    const i = index.get(weekStartOf(log.log_date));
    if (i !== undefined) buckets[i].minutes += log.minutes_spent;
  }
  return buckets;
}

/** One cell per day for the heatmap, covering whole weeks that end with today's week. */
export function activityByDay(logs: LogLike[], today: ISODate, weeks = 12): { date: ISODate; minutes: number; logs: number }[] {
  const start = addDays(weekStartOf(today), -7 * (weeks - 1));
  const end = addDays(weekStartOf(today), 6);
  const byDay = new Map<ISODate, { minutes: number; logs: number }>();
  for (const log of logs) {
    const cell = byDay.get(log.log_date) ?? { minutes: 0, logs: 0 };
    cell.minutes += log.minutes_spent;
    cell.logs += 1;
    byDay.set(log.log_date, cell);
  }
  return eachDay(start, end).map((date) => ({ date, ...(byDay.get(date) ?? { minutes: 0, logs: 0 }) }));
}

/** Days with at least one log, divided by days elapsed, over the trailing window. */
export function logConsistency(logs: Pick<ProgressLog, "log_date">[], today: ISODate, days = 14): number {
  const from = addDays(today, -(days - 1));
  const active = new Set(logs.filter((l) => l.log_date >= from && l.log_date <= today).map((l) => l.log_date));
  return active.size / days;
}

/** Consecutive days with a log, ending today (or yesterday if today has none yet). */
export function logStreak(logs: Pick<ProgressLog, "log_date">[], today: ISODate): number {
  const days = new Set(logs.map((l) => l.log_date));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function onTimeRate(
  tasks: Pick<Task, "status" | "completed_at" | "professor_deadline" | "personal_deadline">[],
  timeZone: string,
): number | null {
  const judged = tasks.map((t) => finishedOnTime(t, timeZone)).filter((v): v is boolean => v !== null);
  return judged.length === 0 ? null : judged.filter(Boolean).length / judged.length;
}

/** A "slip" is a deadline moved later. */
export function slips(changes: Pick<DeadlineChange, "task_id" | "old_value" | "new_value">[]) {
  return changes.filter((c) => c.old_value !== null && c.new_value !== null && c.new_value > c.old_value);
}

/** Share of tasks (with any deadline) that slipped at least once. */
export function slipRate(
  tasks: Pick<Task, "id" | "effective_deadline">[],
  changes: Pick<DeadlineChange, "task_id" | "old_value" | "new_value">[],
): number {
  const withDeadline = tasks.filter((t) => t.effective_deadline !== null);
  if (withDeadline.length === 0) return 0;
  const slipped = new Set(slips(changes).map((c) => c.task_id));
  return withDeadline.filter((t) => slipped.has(t.id)).length / withDeadline.length;
}

/** Mean hours between submission and approval for reviewed tasks. */
export function averageReviewHours(tasks: Pick<Task, "status" | "submitted_at" | "completed_at" | "requires_review">[]): number | null {
  const reviewed = tasks.filter((t) => t.status === "done" && t.requires_review && t.submitted_at && t.completed_at);
  if (reviewed.length === 0) return null;
  const total = reviewed.reduce(
    (sum, t) => sum + (new Date(t.completed_at!).getTime() - new Date(t.submitted_at!).getTime()) / 3_600_000,
    0,
  );
  return total / reviewed.length;
}

/** Days since the most recent log, or null if there has never been one. */
export function daysSinceLastLog(logs: Pick<ProgressLog, "log_date">[], today: ISODate): number | null {
  if (logs.length === 0) return null;
  const latest = logs.reduce((max, l) => (l.log_date > max ? l.log_date : max), logs[0].log_date);
  return daysBetween(latest, today);
}

/**
 * Your usual minutes on this weekday: the mean over the last `weeks` same
 * weekdays on which you logged anything. Null with fewer than two samples.
 */
export function usualMinutesOn(logs: LogLike[], today: ISODate, weeks = 8): number | null {
  const byDay = new Map<ISODate, number>();
  for (const l of logs) byDay.set(l.log_date, (byDay.get(l.log_date) ?? 0) + l.minutes_spent);
  const samples: number[] = [];
  for (let i = 1; i <= weeks; i++) {
    const minutes = byDay.get(addDays(today, -7 * i));
    if (minutes) samples.push(minutes);
  }
  if (samples.length < 2) return null;
  return Math.round(samples.reduce((s, m) => s + m, 0) / samples.length);
}

/** Minutes per day for the ISO week containing `today`, Monday first. */
export function weekByDay(logs: LogLike[], today: ISODate): { date: ISODate; minutes: number }[] {
  const start = weekStartOf(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, minutes: logs.filter((l) => l.log_date === date).reduce((s, l) => s + l.minutes_spent, 0) };
  });
}
