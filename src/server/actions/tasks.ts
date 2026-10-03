"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { id, longText, optionalDate, optionalId, taskPriority, taskStatus, title } from "@/lib/validation";
import type { Database } from "@/types/database";

type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

const estimate = z
  .union([z.coerce.number().positive("Estimate must be positive.").max(9999), z.literal(""), z.null()])
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));

const createSchema = z.object({
  projectId: id,
  title,
  description: longText(10000),
  milestoneId: optionalId,
  assigneeId: optionalId,
  priority: taskPriority.default("medium"),
  professorDeadline: optionalDate,
  personalDeadline: optionalDate,
  estimateHours: estimate,
  status: z.enum(["todo", "in_progress"]).default("todo"),
});

export async function createTask(input: z.input<typeof createSchema>) {
  return action(createSchema, input, async (d, { supabase, userId }) => {
    const row = unwrap(
      await supabase
        .from("tasks")
        .insert({
          project_id: d.projectId,
          title: d.title,
          description: d.description,
          milestone_id: d.milestoneId,
          assignee_id: d.assigneeId,
          priority: d.priority,
          professor_deadline: d.professorDeadline,
          personal_deadline: d.personalDeadline,
          estimate_hours: d.estimateHours,
          status: d.status,
          created_by: userId,
        })
        .select("id")
        .single(),
    );
    refresh();
    return ok(row.id, "Task created");
  });
}

const updateSchema = z.object({
  taskId: id,
  title: title.optional(),
  description: longText(10000).optional(),
  milestoneId: optionalId,
  assigneeId: optionalId,
  priority: taskPriority.optional(),
  professorDeadline: optionalDate,
  personalDeadline: optionalDate,
  estimateHours: estimate,
  requiresReview: z.boolean().optional(),
});

/** Partial update: only keys present in the input are written. */
export async function updateTask(input: z.input<typeof updateSchema>) {
  return action(updateSchema, input, async (d, { supabase }) => {
    const patch: TaskUpdate = {};
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description;
    if ("milestoneId" in input) patch.milestone_id = d.milestoneId;
    if ("assigneeId" in input) patch.assignee_id = d.assigneeId;
    if (d.priority !== undefined) patch.priority = d.priority;
    if ("professorDeadline" in input) patch.professor_deadline = d.professorDeadline;
    if ("personalDeadline" in input) patch.personal_deadline = d.personalDeadline;
    if ("estimateHours" in input) patch.estimate_hours = d.estimateHours;
    if (d.requiresReview !== undefined) patch.requires_review = d.requiresReview;
    if (Object.keys(patch).length === 0) return ok(null);

    const rows = unwrap(await supabase.from("tasks").update(patch).eq("id", d.taskId).select("id"));
    if (rows.length === 0) return fail("You can't edit this task.");
    refresh();
    return ok(null, "Saved");
  });
}

const STATUS_MESSAGES: Record<z.infer<typeof taskStatus>, string> = {
  todo: "Moved to To do",
  in_progress: "Started",
  in_review: "Submitted for review",
  changes_requested: "Changes requested",
  done: "Marked done",
};

export async function setTaskStatus(input: { taskId: string; status: z.input<typeof taskStatus> }) {
  return action(z.object({ taskId: id, status: taskStatus }), input, async (d, { supabase }) => {
    const rows = unwrap(await supabase.from("tasks").update({ status: d.status }).eq("id", d.taskId).select("id"));
    if (rows.length === 0) return fail("You can't change this task.");
    refresh();
    return ok(null, STATUS_MESSAGES[d.status]);
  });
}

export async function deleteTask(input: { taskId: string }) {
  return action(z.object({ taskId: id }), input, async (d, { supabase }) => {
    const rows = unwrap(await supabase.from("tasks").delete().eq("id", d.taskId).select("project_id"));
    if (rows.length === 0) {
      return fail("You can only delete your own unstarted tasks that have no professor deadline. Ask your professor otherwise.");
    }
    refresh();
    return ok(rows[0].project_id, "Task deleted");
  });
}

const depSchema = z.object({ taskId: id, dependsOnId: id });

export async function addDependency(input: z.input<typeof depSchema>) {
  return action(depSchema, input, async (d, { supabase }) => {
    if (d.taskId === d.dependsOnId) return fail("A task can't depend on itself.");
    unwrap(await supabase.from("task_dependencies").insert({ task_id: d.taskId, depends_on_id: d.dependsOnId }));
    refresh();
    return ok(null, "Dependency added");
  });
}

export async function removeDependency(input: z.input<typeof depSchema>) {
  return action(depSchema, input, async (d, { supabase }) => {
    unwrap(await supabase.from("task_dependencies").delete().eq("task_id", d.taskId).eq("depends_on_id", d.dependsOnId));
    refresh();
    return ok(null, "Dependency removed");
  });
}

const reviewSchema = z.object({ taskId: id, approve: z.boolean(), comment: longText() });

export async function reviewTask(input: z.input<typeof reviewSchema>) {
  return action(reviewSchema, input, async (d, { supabase }) => {
    unwrap(await supabase.rpc("review_task", { p_task: d.taskId, p_approve: d.approve, p_comment: d.comment }));
    refresh();
    return ok(null, d.approve ? "Approved" : "Changes requested");
  });
}
