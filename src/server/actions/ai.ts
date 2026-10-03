"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { AiUnavailableError, splitRemarkIntoTasks, type SplitTask } from "@/lib/ai/remark-to-tasks";
import { id, optionalDate, taskPriority, title } from "@/lib/validation";

/** Ask the model for a draft split of one remark. Writes nothing. */
export async function suggestTasksFromRemark(input: { remarkId: string }) {
  return action(z.object({ remarkId: id }), input, async (d, { supabase }) => {
    // Read through RLS: you can only split remarks you can see.
    const { data: remark } = await supabase
      .from("remarks")
      .select("body, project:projects!remarks_project_id_fkey(title), task:tasks!remarks_task_id_fkey(title), author:profiles!remarks_author_id_fkey(full_name)")
      .eq("id", d.remarkId)
      .maybeSingle();
    if (!remark) return fail("Remark not found.");

    try {
      const tasks = await splitRemarkIntoTasks({
        remark: remark.body,
        authorName: remark.author?.full_name ?? "Professor",
        projectTitle: remark.project?.title ?? "Research project",
        taskTitle: remark.task?.title ?? null,
      });
      if (tasks.length === 0) return fail("No concrete asks found in that remark.");
      return ok<SplitTask[]>(tasks);
    } catch (error) {
      if (error instanceof AiUnavailableError) return fail(error.message);
      throw error;
    }
  });
}

const createSchema = z.object({
  remarkId: id,
  tasks: z
    .array(z.object({ title, description: z.string().trim().max(10000).default(""), priority: taskPriority, personalDeadline: optionalDate }))
    .min(1, "Pick at least one task.")
    .max(6),
});

/** Create the tasks the student accepted, each linked back to the remark. */
export async function createTasksFromRemark(input: z.input<typeof createSchema>) {
  return action(createSchema, input, async (d, { supabase }) => {
    const ids: string[] = [];
    for (const t of d.tasks) {
      ids.push(
        unwrap(
          await supabase.rpc("convert_remark_to_task", {
            p_remark: d.remarkId,
            p_title: t.title,
            p_description: t.description,
            p_priority: t.priority,
            p_personal_deadline: t.personalDeadline,
          }),
        ),
      );
    }
    refresh();
    return ok(ids, `${ids.length} task${ids.length === 1 ? "" : "s"} created from the remark`);
  });
}
