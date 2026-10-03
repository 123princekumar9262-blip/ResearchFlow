"use server";

import { z } from "zod";
import { action, fail, ok } from "@/lib/actions";
import { onboardingSchema, readOnboarding } from "@/lib/onboarding/state";

/**
 * Merges a change into the account's onboarding record. Quiet by design: tour
 * progress is never worth an error toast, so a failure (for example before
 * migration 8 is applied) comes back as a plain result the caller ignores.
 */
export async function saveOnboarding(patch: unknown) {
  return action(onboardingSchema, patch, async (d, { supabase, userId, profile }) => {
    const current = readOnboarding(profile);
    if (!current) return fail("Onboarding storage isn't set up yet.");
    const next = { ...current, ...d };
    const { error } = await supabase.from("profiles").update({ onboarding: next }).eq("id", userId);
    if (error) return fail(error.message);
    return ok(null);
  });
}

/**
 * Setup, student step 3a: link with a join code and return the professor's
 * name for the check mark. A wrong code gets the welcome flow's own wording.
 */
export async function linkProfessorByCode(input: { code: string }) {
  return action(z.object({ code: z.string().trim().min(4).max(20) }), input, async (d, { supabase }) => {
    const { data: professorId, error } = await supabase.rpc("join_professor", { p_code: d.code });
    if (error || !professorId) {
      if (/no professor/i.test(error?.message ?? "")) return fail("That code doesn't match any professor. Check it with them; codes stop working when they're replaced.");
      return fail(error?.message ?? "Couldn't link right now. Try again.");
    }
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", professorId).single();
    return ok({ id: professorId as string, name: prof?.full_name ?? "your professor" });
  });
}
