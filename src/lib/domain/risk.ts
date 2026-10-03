// Delay risk, v1: an explainable heuristic (see PRODUCT_SPEC §8.2). Each signal
// adds points and a human-readable reason; the reasons are the product, the
// score only orders them.

import { daysBetween, type ISODate } from "./dates.ts";
import type { Task } from "../../types/database.ts";

export type RiskLevel = "high" | "medium" | "low" | "none";

export interface RiskInput {
  task: Pick<Task, "status" | "effective_deadline" | "created_at" | "estimate_hours">;
  today: ISODate;
  openBlockers: number;
  openDependencies: number;
  /** Linked logs + attachments. */
  evidenceCount: number;
  /** Most recent log date that references this task. */
  lastLogDate: ISODate | null;
  /** Share of this student's tasks whose deadline was moved later (0..1). */
  slipRate: number;
}

export interface Risk {
  level: RiskLevel;
  score: number;
  reasons: string[];
}

const PRODUCTIVE_HOURS_PER_DAY = 4;

export function delayRisk(input: RiskInput): Risk {
  const { task, today } = input;
  if (task.status === "done" || task.status === "in_review" || !task.effective_deadline) {
    return { level: "none", score: 0, reasons: [] };
  }

  const daysLeft = daysBetween(today, task.effective_deadline);
  if (daysLeft < 0) {
    return { level: "high", score: 10, reasons: [`Overdue by ${-daysLeft} day${daysLeft === -1 ? "" : "s"}`] };
  }

  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  const window = Math.max(1, daysBetween(task.created_at.slice(0, 10), task.effective_deadline));
  const fractionLeft = daysLeft / window;

  if (task.status === "todo" && fractionLeft < 0.25) add(3, `Not started, ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`);
  else if (task.status === "todo" && fractionLeft < 0.5) add(1, "Not started, past the halfway point");

  if (task.status === "changes_requested" && daysLeft <= 2) add(2, "Revision still pending");

  if (task.estimate_hours && task.estimate_hours > (daysLeft + 1) * PRODUCTIVE_HOURS_PER_DAY) {
    add(2, `Estimate (${task.estimate_hours}h) exceeds the time left`);
  }

  if (input.openBlockers > 0) add(3, input.openBlockers === 1 ? "Open blocker" : `${input.openBlockers} open blockers`);
  if (input.openDependencies > 0) {
    add(2, `Waiting on ${input.openDependencies} dependenc${input.openDependencies === 1 ? "y" : "ies"}`);
  }

  if (task.status === "in_progress") {
    if (input.evidenceCount === 0 && daysLeft <= 3) add(1, "No progress logged yet");
    else if (input.lastLogDate && daysBetween(input.lastLogDate, today) >= 4) {
      add(1, `No log in ${daysBetween(input.lastLogDate, today)} days`);
    }
  }

  if (daysLeft <= 1) add(1, daysLeft === 0 ? "Due today" : "Due tomorrow");
  if (input.slipRate >= 0.3 && score > 0) add(1, `${Math.round(input.slipRate * 100)}% of past deadlines were moved`);

  const level: RiskLevel = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  return { level, score, reasons };
}
