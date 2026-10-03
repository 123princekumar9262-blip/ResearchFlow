"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { id } from "@/lib/validation";

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(120),
  timezone: z.string().trim().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone."),
});

export async function updateProfile(input: z.input<typeof profileSchema>) {
  return action(profileSchema, input, async (d, { supabase, userId }) => {
    unwrap(await supabase.from("profiles").update({ full_name: d.fullName, timezone: d.timezone }).eq("id", userId));
    refresh();
    return ok(null, "Profile saved");
  });
}

export async function joinProfessor(input: { code: string }) {
  return action(z.object({ code: z.string().trim().min(4, "Enter the code your professor gave you.").max(20) }), input, async (d, { supabase }) => {
    const professorId = unwrap(await supabase.rpc("join_professor", { p_code: d.code }));
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", professorId).single();
    refresh();
    return ok(professorId, `Linked with ${prof?.full_name ?? "your professor"}. Add them to your projects to hand over deadlines and reviews.`);
  });
}

export async function regenerateJoinCode() {
  return action(z.object({}), {}, async (_d, { supabase }) => {
    const code = unwrap(await supabase.rpc("regenerate_join_code"));
    refresh();
    return ok(code, "New code generated. The old one no longer works.");
  });
}

export async function unlinkSupervision(input: { otherId: string }) {
  return action(z.object({ otherId: id }), input, async (d, { supabase, userId, profile }) => {
    const [professorId, studentId] = profile.role === "professor" ? [userId, d.otherId] : [d.otherId, userId];
    const rows = unwrap(
      await supabase.from("supervisions").delete().eq("professor_id", professorId).eq("student_id", studentId).select("student_id"),
    );
    if (rows.length === 0) return fail("That link no longer exists.");
    refresh();
    return ok(null, "Unlinked. Shared projects keep their members.");
  });
}
