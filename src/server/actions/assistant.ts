"use server";

import { z } from "zod";
import { action, fail, ok } from "@/lib/actions";
import { getWorkspace } from "@/lib/data/workspace";
import { answer } from "@/lib/ai/assistant";
import { AiUnavailableError, isAiEnabled } from "@/lib/ai/provider";
import { id } from "@/lib/validation";

/** Questions per person per 24 hours; keeps the free AI quota for everyone. */
const DAILY_QUESTIONS = 25;

const askSchema = z.object({
  scope: z.object({ projectId: id.optional(), studentId: id.optional() }),
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(12)
    .refine((t) => t[t.length - 1].role === "user", "Ask a question first."),
});

/** "Ask AI": one answer about the asker's own projects, or about power electronics. Nothing is written except the allowance count. */
export async function askAssistant(input: z.input<typeof askSchema>) {
  return action(askSchema, input, async (d, { supabase, userId }) => {
    if (!isAiEnabled()) return fail("AI isn't set up on this server.");

    const since = new Date(Date.now() - 86_400_000).toISOString();
    // A real select, not a head count: a head request to a missing table reports no error.
    const used = await supabase.from("ai_questions").select("asked_at").eq("user_id", userId).gte("asked_at", since).limit(DAILY_QUESTIONS);
    // Before migration 10 the table doesn't exist: no allowance then.
    const counted = !used.error;
    const usedCount = used.data?.length ?? 0;
    if (counted && usedCount >= DAILY_QUESTIONS) return fail(`You've used today's ${DAILY_QUESTIONS} questions. You can ask more tomorrow.`);

    try {
      const ws = await getWorkspace();
      const res = await answer(ws, d.scope, d.turns);
      if (!res.text) return fail("The AI had no answer for that. Try asking another way.");
      if (counted) await supabase.from("ai_questions").insert({});
      return ok({ text: res.text, refs: res.refs, left: counted ? DAILY_QUESTIONS - usedCount - 1 : null });
    } catch (error) {
      if (error instanceof AiUnavailableError) return fail(error.message);
      throw error;
    }
  });
}
