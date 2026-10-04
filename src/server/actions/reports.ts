"use server";

import { notifyReport } from "@/lib/notify/events";
import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { generateWeeklyReport } from "@/lib/data/reports";
import { AiUnavailableError } from "@/lib/ai/remark-to-tasks";
import { draftReportNote } from "@/lib/ai/report-note";
import { isoWeekday, weekStartOf } from "@/lib/domain/dates";
import { summarize } from "@/lib/domain/weekly-report";
import { id, isoDate } from "@/lib/validation";
import type { Json } from "@/types/database";

const draftSchema = z.object({
  weekStart: isoDate.refine((d) => isoWeekday(d) === 1, "Reports cover Monday to Sunday."),
  note: z.string().trim().max(5000).default(""),
  submit: z.boolean().default(false),
});

/** Regenerates the week from live data and saves it; with `submit`, freezes it. */
export async function saveWeeklyReport(input: z.input<typeof draftSchema>) {
  return action(draftSchema, input, async (d, { supabase, userId, profile, today }) => {
    if (profile.role !== "student") return fail("Only students write weekly reports.");
    if (d.weekStart > weekStartOf(today)) return fail("You can't report on a week that hasn't started.");

    const { data: existing } = await supabase
      .from("weekly_reports")
      .select("id, submitted_at")
      .eq("student_id", userId)
      .eq("week_start", d.weekStart)
      .maybeSingle();
    if (existing?.submitted_at) return fail("This report was already submitted and is read-only.");

    const report = await generateWeeklyReport(supabase, userId, d.weekStart, profile.timezone, today);
    const values = {
      stats: report.stats as unknown as Json,
      highlights: report.highlights,
      student_note: d.note,
    };

    const row = existing
      ? unwrap(await supabase.from("weekly_reports").update(values).eq("id", existing.id).select("id").single())
      : unwrap(await supabase.from("weekly_reports").insert({ ...values, student_id: userId, week_start: d.weekStart }).select("id").single());

    if (d.submit) {
      unwrap(await supabase.from("weekly_reports").update({ submitted_at: new Date().toISOString() }).eq("id", row.id));
      notifyReport(row.id, "submitted", userId);
    }
    refresh();
    return ok(row.id, d.submit ? `Report submitted: ${summarize(report.stats)}` : "Draft saved");
  });
}

export async function acknowledgeReport(input: { reportId: string }) {
  return action(z.object({ reportId: id }), input, async (d, { supabase, profile, userId }) => {
    if (profile.role !== "professor") return fail("Only a supervising professor can acknowledge a report.");
    const rows = unwrap(
      await supabase.from("weekly_reports").update({ acknowledged_at: new Date().toISOString() }).eq("id", d.reportId).select("id"),
    );
    if (rows.length === 0) return fail("You can't acknowledge this report.");
    notifyReport(d.reportId, "read", userId);
    refresh();
    return ok(null, "Acknowledged. The student can see you read it.");
  });
}

export async function setReportSharing(input: { reportId: string; enabled: boolean; rotate?: boolean }) {
  const schema = z.object({ reportId: id, enabled: z.boolean(), rotate: z.boolean().default(false) });
  return action(schema, input, async (d, { supabase }) => {
    const patch: { share_enabled: boolean; share_token?: string } = { share_enabled: d.enabled };
    if (d.rotate) patch.share_token = randomUUID();
    const rows = unwrap(await supabase.from("weekly_reports").update(patch).eq("id", d.reportId).select("share_token"));
    if (rows.length === 0) return fail("You can't change sharing on this report.");
    refresh();
    return ok(rows[0].share_token, d.rotate ? "New link created. The old one stopped working." : d.enabled ? "Link sharing on" : "Link sharing off");
  });
}

/** An AI draft of the note to the professor, from this week's report. Writes nothing. */
export async function draftNoteWithAi(input: { weekStart: string }) {
  return action(z.object({ weekStart: isoDate }), input, async (d, { supabase, userId, profile, today }) => {
    if (profile.role !== "student") return fail("Only students write weekly reports.");
    const [report, { data: supervisors }] = await Promise.all([
      generateWeeklyReport(supabase, userId, d.weekStart, profile.timezone, today),
      supabase.from("supervisions").select("professor:profiles!supervisions_professor_id_fkey(full_name)").eq("student_id", userId).limit(1),
    ]);
    try {
      const note = await draftReportNote({
        studentName: profile.full_name,
        professorName: supervisors?.[0]?.professor?.full_name ?? null,
        stats: report.stats,
        highlights: report.highlights,
      });
      return ok(note, "Draft written. Edit it before you submit.");
    } catch (error) {
      if (error instanceof AiUnavailableError) return fail(error.message);
      throw error;
    }
  });
}
