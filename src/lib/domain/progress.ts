import type { Milestone, Task } from "../../types/database.ts";

export interface Completion {
  done: number;
  total: number;
  /** 0..1; 0 when there is nothing to do yet. */
  ratio: number;
  complete: boolean;
}

export function completion(tasks: Pick<Task, "status">[]): Completion {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  return { done, total, ratio: total === 0 ? 0 : done / total, complete: total > 0 && done === total };
}

/**
 * Project progress, weighted by milestone: each milestone with tasks counts
 * equally (so 20 tiny setup tasks can't outweigh one hard milestone), and tasks
 * outside any milestone form one more group.
 */
export function projectProgress(
  tasks: Pick<Task, "status" | "milestone_id">[],
  milestones: Pick<Milestone, "id">[],
): number {
  if (tasks.length === 0) return 0;
  const known = new Set(milestones.map((m) => m.id));
  const groups = new Map<string, Pick<Task, "status">[]>();
  for (const task of tasks) {
    const key = task.milestone_id && known.has(task.milestone_id) ? task.milestone_id : "__none__";
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  }
  let sum = 0;
  for (const group of groups.values()) sum += completion(group).ratio;
  return sum / groups.size;
}

export function percent(ratio: number): number {
  return Math.round(ratio * 100);
}
