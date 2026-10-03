// A task's history as one timeline: what happened, when, by whom. Built from
// records that already exist (timestamps, deadline audit, evidence, extension
// requests), so nothing extra has to be written to produce it.

import { formatShortDate } from "./dates.ts";
import type { Attachment, DeadlineChange, ExtensionRequest, ProgressLog, Task } from "../../types/database.ts";

export type ActivityKind = "created" | "submitted" | "completed" | "deadline" | "log" | "attachment" | "extension";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  /** Plain sentence; the actor's name is prepended by the UI when known. */
  text: string;
  actorId: string | null;
  tone: "default" | "info" | "success" | "warning" | "danger";
  group: "changes" | "evidence";
}

export function taskActivity(input: {
  task: Pick<Task, "id" | "created_at" | "created_by" | "submitted_at" | "completed_at" | "status" | "assignee_id" | "requires_review">;
  changes: Pick<DeadlineChange, "id" | "field" | "old_value" | "new_value" | "changed_by" | "changed_at">[];
  logs: Pick<ProgressLog, "id" | "log_date" | "author_id" | "created_at" | "minutes_spent" | "completed_work">[];
  attachments: Pick<Attachment, "id" | "name" | "uploader_id" | "created_at" | "kind">[];
  extensions: Pick<ExtensionRequest, "id" | "requested_by" | "proposed_deadline" | "reason" | "status" | "created_at" | "decided_at" | "decided_by">[];
}): ActivityEvent[] {
  const { task } = input;
  const events: ActivityEvent[] = [
    { id: "created", kind: "created", at: task.created_at, text: "created this task", actorId: task.created_by, tone: "default", group: "changes" },
  ];
  if (task.submitted_at) {
    events.push({ id: "submitted", kind: "submitted", at: task.submitted_at, text: "submitted it for review", actorId: task.assignee_id, tone: "info", group: "changes" });
  }
  if (task.completed_at && task.status === "done") {
    events.push({
      id: "completed",
      kind: "completed",
      at: task.completed_at,
      text: task.requires_review ? "approved it" : "closed it",
      actorId: task.requires_review ? null : task.assignee_id,
      tone: "success",
      group: "changes",
    });
  }
  for (const c of input.changes) {
    const later = c.old_value && c.new_value && c.new_value > c.old_value;
    const from = c.old_value ? formatShortDate(c.old_value) : "none";
    const to = c.new_value ? formatShortDate(c.new_value) : "none";
    events.push({
      id: `dc-${c.id}`,
      kind: "deadline",
      at: c.changed_at,
      text: `moved the ${c.field === "professor" ? "professor" : "personal"} deadline ${from} → ${to}`,
      actorId: c.changed_by,
      tone: later ? "warning" : "default",
      group: "changes",
    });
  }
  for (const l of input.logs) {
    events.push({
      id: `log-${l.id}`,
      kind: "log",
      at: l.created_at,
      text: `logged progress for ${formatShortDate(l.log_date)}: "${l.completed_work.split(/\r?\n/)[0].slice(0, 80)}"`,
      actorId: l.author_id,
      tone: "default",
      group: "evidence",
    });
  }
  for (const a of input.attachments) {
    events.push({
      id: `att-${a.id}`,
      kind: "attachment",
      at: a.created_at,
      text: `attached ${a.kind === "link" ? "a link" : "a file"}: ${a.name}`,
      actorId: a.uploader_id,
      tone: "default",
      group: "evidence",
    });
  }
  for (const e of input.extensions) {
    events.push({
      id: `ext-${e.id}`,
      kind: "extension",
      at: e.created_at,
      text: `asked to move the deadline to ${formatShortDate(e.proposed_deadline)}: "${e.reason.slice(0, 80)}"`,
      actorId: e.requested_by,
      tone: "warning",
      group: "changes",
    });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
