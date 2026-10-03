"use server";

import { notifyExtension } from "@/lib/notify/events";
import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { formatDay } from "@/lib/domain/dates";
import { id, isoDate } from "@/lib/validation";

const requestSchema = z.object({
  projectId: id,
  taskId: id,
  proposedDate: isoDate,
  reason: z.string().trim().min(1, "Say why you need more time.").max(2000),
});

/** Ask the professor to move a deadline you can't move yourself. */
export async function requestExtension(input: z.input<typeof requestSchema>) {
  return action(requestSchema, input, async (d, { supabase, userId }) => {
    const row = unwrap(
      await supabase
        .from("extension_requests")
        .insert({
          project_id: d.projectId,
          task_id: d.taskId,
          requested_by: userId,
          proposed_deadline: d.proposedDate,
          reason: d.reason,
        })
        .select("id")
        .single(),
    );
    notifyExtension(row.id, userId);
    refresh();
    return ok(null, `Extension to ${formatDay(d.proposedDate)} requested. Your professor will see it in their inbox.`);
  });
}

export async function withdrawExtension(input: { requestId: string }) {
  return action(z.object({ requestId: id }), input, async (d, { supabase }) => {
    const rows = unwrap(await supabase.from("extension_requests").delete().eq("id", d.requestId).select("id"));
    if (rows.length === 0) return fail("That request was already decided.");
    refresh();
    return ok(null, "Request withdrawn");
  });
}

const respondSchema = z.object({ requestId: id, approve: z.boolean(), response: z.string().trim().max(2000).default("") });

export async function respondExtension(input: z.input<typeof respondSchema>) {
  return action(respondSchema, input, async (d, { supabase, userId }) => {
    unwrap(await supabase.rpc("respond_extension", { p_request: d.requestId, p_approve: d.approve, p_response: d.response }));
    notifyExtension(d.requestId, userId);
    refresh();
    return ok(null, d.approve ? "Extension approved. The deadline moved." : "Extension declined");
  });
}
