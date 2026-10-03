"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { id, longText, optionalId, title } from "@/lib/validation";

const raiseSchema = z.object({
  projectId: id,
  taskId: optionalId,
  title,
  description: longText(),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  needsProfessor: z.boolean().default(false),
});

export async function raiseBlocker(input: z.input<typeof raiseSchema>) {
  return action(raiseSchema, input, async (d, { supabase, userId }) => {
    const row = unwrap(
      await supabase
        .from("blockers")
        .insert({
          project_id: d.projectId,
          task_id: d.taskId,
          raised_by: userId,
          title: d.title,
          description: d.description,
          severity: d.severity,
          needs_professor: d.needsProfessor,
        })
        .select("id")
        .single(),
    );
    refresh();
    return ok(row.id, d.needsProfessor ? "Blocker raised. Your professor will see it." : "Blocker raised");
  });
}

export async function resolveBlocker(input: { blockerId: string; resolution: string }) {
  const schema = z.object({ blockerId: id, resolution: z.string().trim().min(1, "Write how it was resolved.").max(5000) });
  return action(schema, input, async (d, { supabase }) => {
    const rows = unwrap(
      await supabase.from("blockers").update({ status: "resolved", resolution: d.resolution }).eq("id", d.blockerId).select("id"),
    );
    if (rows.length === 0) return fail("You can't change this blocker.");
    refresh();
    return ok(null, "Blocker resolved");
  });
}

export async function reopenBlocker(input: { blockerId: string }) {
  return action(z.object({ blockerId: id }), input, async (d, { supabase }) => {
    unwrap(await supabase.from("blockers").update({ status: "open" }).eq("id", d.blockerId));
    refresh();
    return ok(null, "Blocker reopened");
  });
}
