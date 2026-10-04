"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { notifyMeeting } from "@/lib/notify/events";
import { id, optionalDate, title } from "@/lib/validation";

const NOT_READY = "Meetings need a database update first: run migration 11 in the Supabase SQL editor.";
const missingTable = (error: { message: string } | null) => !!error && /meetings|schema cache/i.test(error.message);

const instant = z.iso.datetime({ offset: true, message: "Pick a date and time." });

const scheduleSchema = z.object({ personId: id, startsAt: instant });

/** Book a meeting with your professor or one of your students. */
export async function scheduleMeeting(input: z.input<typeof scheduleSchema>) {
  return action(scheduleSchema, input, async (d, { supabase, userId, profile }) => {
    const professorId = profile.role === "professor" ? userId : d.personId;
    const studentId = profile.role === "professor" ? d.personId : userId;
    const res = await supabase.from("meetings").insert({ professor_id: professorId, student_id: studentId, starts_at: d.startsAt }).select("id, professor_id, student_id, starts_at").single();
    if (missingTable(res.error)) return fail(NOT_READY);
    const row = unwrap(res);
    notifyMeeting("scheduled", row, userId);
    refresh();
    return ok(row.id, "Meeting scheduled");
  });
}

export async function rescheduleMeeting(input: { meetingId: string; startsAt: string }) {
  return action(z.object({ meetingId: id, startsAt: instant }), input, async (d, { supabase, userId }) => {
    const rows = unwrap(await supabase.from("meetings").update({ starts_at: d.startsAt }).eq("id", d.meetingId).select("id, professor_id, student_id, starts_at"));
    if (rows.length === 0) return fail("You can't change this meeting.");
    notifyMeeting("moved", rows[0], userId);
    refresh();
    return ok(null, "Meeting moved");
  });
}

export async function cancelMeeting(input: { meetingId: string }) {
  return action(z.object({ meetingId: id }), input, async (d, { supabase, userId }) => {
    const rows = unwrap(await supabase.from("meetings").delete().eq("id", d.meetingId).select("id, professor_id, student_id, starts_at"));
    if (rows.length === 0) return fail("Only the person who booked it can cancel a meeting that hasn't happened yet.");
    notifyMeeting("cancelled", rows[0], userId);
    refresh();
    return ok(null, "Meeting cancelled");
  });
}

/** Autosaved while typing, so no refresh and no toast. */
export async function saveMeetingNotes(input: { meetingId: string; notes: string }) {
  return action(z.object({ meetingId: id, notes: z.string().max(20000, "Notes are limited to 20,000 characters.") }), input, async (d, { supabase }) => {
    const rows = unwrap(await supabase.from("meetings").update({ notes: d.notes }).eq("id", d.meetingId).select("id"));
    return rows.length ? ok(null) : fail("You can't edit these notes.");
  });
}

/** Wrap up: the meeting is marked done and the student hears about the notes and action items. */
export async function endMeeting(input: { meetingId: string; notes?: string }) {
  return action(z.object({ meetingId: id, notes: z.string().max(20000).optional() }), input, async (d, { supabase, userId }) => {
    const rows = unwrap(
      await supabase
        .from("meetings")
        .update({ status: "done", ...(d.notes === undefined ? {} : { notes: d.notes }) })
        .eq("id", d.meetingId)
        .select("id, professor_id, student_id, starts_at"),
    );
    if (rows.length === 0) return fail("You can't change this meeting.");
    const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("meeting_id", d.meetingId);
    notifyMeeting("ended", rows[0], userId, count ?? 0);
    refresh();
    return ok(null, "Meeting ended. Notes and action items are saved.");
  });
}

export async function reopenMeeting(input: { meetingId: string }) {
  return action(z.object({ meetingId: id }), input, async (d, { supabase }) => {
    const rows = unwrap(await supabase.from("meetings").update({ status: "scheduled" }).eq("id", d.meetingId).select("id"));
    if (rows.length === 0) return fail("You can't change this meeting.");
    refresh();
    return ok(null, "Meeting reopened");
  });
}

const topicSchema = z.object({ meetingId: id, body: z.string().trim().min(1, "Write the topic.").max(500, "Keep a topic under 500 characters.") });

export async function addTopic(input: z.input<typeof topicSchema>) {
  return action(topicSchema, input, async (d, { supabase }) => {
    unwrap(await supabase.from("meeting_topics").insert({ meeting_id: d.meetingId, body: d.body }));
    refresh();
    return ok(null);
  });
}

export async function setTopicDone(input: { topicId: string; done: boolean }) {
  return action(z.object({ topicId: id, done: z.boolean() }), input, async (d, { supabase }) => {
    unwrap(await supabase.from("meeting_topics").update({ done: d.done }).eq("id", d.topicId));
    refresh();
    return ok(null);
  });
}

export async function removeTopic(input: { topicId: string }) {
  return action(z.object({ topicId: id }), input, async (d, { supabase }) => {
    const rows = unwrap(await supabase.from("meeting_topics").delete().eq("id", d.topicId).select("id"));
    if (rows.length === 0) return fail("Only the person who added a topic can remove it.");
    refresh();
    return ok(null);
  });
}

const itemSchema = z.object({ meetingId: id, projectId: id, title, due: optionalDate });

/**
 * An action item is a real task for the student, tied to the meeting. A
 * professor's date is a professor deadline; a student's own is personal.
 */
export async function addActionItem(input: z.input<typeof itemSchema>) {
  return action(itemSchema, input, async (d, { supabase, userId, profile }) => {
    const { data: meeting } = await supabase.from("meetings").select("student_id").eq("id", d.meetingId).maybeSingle();
    if (!meeting) return fail("That meeting no longer exists.");
    const professor = profile.role === "professor";
    unwrap(
      await supabase.from("tasks").insert({
        project_id: d.projectId,
        title: d.title,
        assignee_id: meeting.student_id,
        professor_deadline: professor ? d.due : null,
        personal_deadline: professor ? null : d.due,
        priority: "medium",
        created_by: userId,
        meeting_id: d.meetingId,
      }),
    );
    refresh();
    return ok(null, "Action item added");
  });
}
