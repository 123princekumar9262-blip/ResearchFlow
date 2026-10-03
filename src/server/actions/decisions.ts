"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, ok, unwrap } from "@/lib/actions";
import { id, isoDate, longText, optionalId, title } from "@/lib/validation";

const recordSchema = z.object({
  projectId: id,
  title,
  context: longText(),
  decision: z.string().trim().min(1, "State the decision.").max(5000),
  alternatives: longText(),
  decidedOn: isoDate,
  supersedes: optionalId,
});

export async function recordDecision(input: z.input<typeof recordSchema>) {
  return action(recordSchema, input, async (d, { supabase, userId }) => {
    const row = unwrap(
      await supabase
        .from("decisions")
        .insert({
          project_id: d.projectId,
          author_id: userId,
          title: d.title,
          context: d.context,
          decision: d.decision,
          alternatives: d.alternatives,
          decided_on: d.decidedOn,
        })
        .select("id")
        .single(),
    );
    if (d.supersedes) {
      unwrap(await supabase.from("decisions").update({ superseded_by: row.id }).eq("id", d.supersedes));
    }
    refresh();
    return ok(row.id, "Decision recorded");
  });
}
