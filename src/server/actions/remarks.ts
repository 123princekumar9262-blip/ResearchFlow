"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { id, optionalDate, optionalId, taskPriority, title } from "@/lib/validation";

const postSchema = z.object({
  projectId: id,
  taskId: optionalId,
  parentId: optionalId,
  body: z.string().trim().min(1, "Write something first.").max(5000),
  kind: z.enum(["comment", "change_request", "question", "approval"]).default("comment"),
  source: z.enum(["app", "meeting"]).default("app"),
  /** Replying can also close the remark you're answering. */
  addressParent: z.boolean().default(false),
});

export async function postRemark(input: z.input<typeof postSchema>) {
  return action(postSchema, input, async (d, { supabase, userId }) => {
    const row = unwrap(
      await supabase
        .from("remarks")
        .insert({
          project_id: d.projectId,
          task_id: d.taskId,
          parent_id: d.parentId,
          author_id: userId,
          body: d.body,
          kind: d.parentId ? "comment" : d.kind,
          source: d.source,
        })
        .select("id")
        .single(),
    );
    if (d.parentId && d.addressParent) {
      unwrap(await supabase.from("remarks").update({ addressed_at: new Date().toISOString() }).eq("id", d.parentId));
    }
    refresh();
    return ok(row.id, d.parentId ? "Reply posted" : "Remark posted");
  });
}

export async function setRemarkAddressed(input: { remarkId: string; addressed: boolean }) {
  return action(z.object({ remarkId: id, addressed: z.boolean() }), input, async (d, { supabase }) => {
    const rows = unwrap(
      await supabase
        .from("remarks")
        .update({ addressed_at: d.addressed ? new Date().toISOString() : null })
        .eq("id", d.remarkId)
        .select("id"),
    );
    if (rows.length === 0) return fail("You can't change this remark.");
    refresh();
    return ok(null, d.addressed ? "Marked as addressed" : "Reopened");
  });
}

const convertSchema = z.object({
  remarkId: id,
  title,
  description: z.string().trim().max(10000).default(""),
  priority: taskPriority.default("medium"),
  personalDeadline: optionalDate,
});

export async function convertRemarkToTask(input: z.input<typeof convertSchema>) {
  return action(convertSchema, input, async (d, { supabase }) => {
    const taskId = unwrap(
      await supabase.rpc("convert_remark_to_task", {
        p_remark: d.remarkId,
        p_title: d.title,
        p_description: d.description,
        p_priority: d.priority,
        p_personal_deadline: d.personalDeadline,
      }),
    );
    refresh();
    return ok(taskId, "Task created from remark");
  });
}
