"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { id, longText, optionalDate, title } from "@/lib/validation";

const createSchema = z.object({ projectId: id, title, description: longText(), dueDate: optionalDate });

export async function createMilestone(input: z.input<typeof createSchema>) {
  return action(createSchema, input, async (d, { supabase, userId }) => {
    const { count } = await supabase.from("milestones").select("id", { count: "exact", head: true }).eq("project_id", d.projectId);
    const row = unwrap(
      await supabase
        .from("milestones")
        .insert({ project_id: d.projectId, title: d.title, description: d.description, due_date: d.dueDate, position: count ?? 0, created_by: userId })
        .select("id")
        .single(),
    );
    refresh();
    return ok(row.id, "Milestone added");
  });
}

const updateSchema = z.object({ milestoneId: id, title: title.optional(), description: longText().optional(), dueDate: optionalDate });

export async function updateMilestone(input: z.input<typeof updateSchema>) {
  return action(updateSchema, input, async (d, { supabase }) => {
    const patch: { title?: string; description?: string; due_date?: string | null } = {};
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description;
    if (input.dueDate !== undefined) patch.due_date = d.dueDate;
    const rows = unwrap(await supabase.from("milestones").update(patch).eq("id", d.milestoneId).select("id"));
    if (rows.length === 0) return fail("You can't edit this milestone.");
    refresh();
    return ok(null, "Milestone updated");
  });
}

export async function deleteMilestone(input: { milestoneId: string }) {
  return action(z.object({ milestoneId: id }), input, async (d, { supabase }) => {
    const rows = unwrap(await supabase.from("milestones").delete().eq("id", d.milestoneId).select("id"));
    if (rows.length === 0) return fail("Only your professor can delete a milestone on this project.");
    refresh();
    return ok(null, "Milestone deleted. Its tasks were kept.");
  });
}
