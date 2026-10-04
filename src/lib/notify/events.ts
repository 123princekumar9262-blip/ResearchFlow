import "server-only";

import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { formatMeetingTime } from "@/lib/domain/meetings";
import { pushToUsers, isPushConfigured } from "./push";

const URGENT = { urgent: true };

// Who hears about what (spec §4.4). Each function runs after the response has
// been sent, looks up the people involved with the server's own client, and
// never notifies the person who acted. Failures are swallowed: a missed
// notification must never undo the action that caused it.

const excerpt = (text: string, max = 110) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** "Prof. Anita Mehta" → "Prof. Mehta"; others by first name. */
function shortName(name: string): string {
  const titled = name.match(/^((?:Prof|Dr)\.?)\s+.*?(\S+)$/);
  return titled ? `${titled[1]} ${titled[2]}` : (name.split(" ")[0] ?? name);
}

function later(work: (admin: NonNullable<ReturnType<typeof adminClient>>) => Promise<void>) {
  if (!isPushConfigured()) return;
  after(async () => {
    try {
      await work(adminClient()!);
    } catch (error) {
      console.error("notification failed", error);
    }
  });
}

async function projectMembers(admin: NonNullable<ReturnType<typeof adminClient>>, projectId: string, role: "student" | "professor") {
  const { data } = await admin.from("project_members").select("user_id").eq("project_id", projectId).eq("role", role);
  return (data ?? []).map((m) => m.user_id);
}

async function nameOf(admin: NonNullable<ReturnType<typeof adminClient>>, userId: string) {
  const { data } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name ?? "Someone";
}

/** A new remark or reply: requests reach the student, comments reach whoever the thread is about. */
export function notifyRemark(remarkId: string, actorId: string) {
  later(async (admin) => {
    const { data: r } = await admin
      .from("remarks")
      .select("id, project_id, task_id, progress_log_id, parent_id, kind, body, author:profiles!remarks_author_id_fkey(full_name, role)")
      .eq("id", remarkId)
      .maybeSingle();
    if (!r) return;
    const who = shortName(r.author?.full_name ?? "Someone");
    const isProfessor = r.author?.role === "professor";
    const recipients = new Set<string>();
    let url = r.task_id ? `/tasks/${r.task_id}#remark-${r.id}` : `/projects/${r.project_id}/remarks#remark-${r.id}`;

    if (r.progress_log_id) {
      const { data: log } = await admin.from("progress_logs").select("author_id, log_date").eq("id", r.progress_log_id).maybeSingle();
      if (log) recipients.add(log.author_id);
      url = `/log#log-${r.progress_log_id}`;
    }
    if (r.parent_id) {
      const { data: parent } = await admin.from("remarks").select("author_id").eq("id", r.parent_id).maybeSingle();
      if (parent) recipients.add(parent.author_id);
    } else if (!r.progress_log_id) {
      if (isProfessor) {
        const { data: task } = r.task_id ? await admin.from("tasks").select("assignee_id").eq("id", r.task_id).maybeSingle() : { data: null };
        if (task?.assignee_id) recipients.add(task.assignee_id);
        else for (const id of await projectMembers(admin, r.project_id, "student")) recipients.add(id);
      } else {
        for (const id of await projectMembers(admin, r.project_id, "professor")) recipients.add(id);
      }
    }
    recipients.delete(actorId);

    const title =
      r.parent_id ? `${who} replied`
      : r.kind === "change_request" ? `${who} requested a change`
      : r.kind === "question" ? `${who} asked a question`
      : r.progress_log_id ? `${who} commented on your log`
      : `${who} commented`;
    const tag = `remark-${r.parent_id ?? r.id}`;
    if (r.progress_log_id && recipients.size > 0) {
      const { data: people } = await admin.from("profiles").select("id, role").in("id", [...recipients]);
      const students = (people ?? []).filter((p) => p.role === "student").map((p) => p.id);
      const professors = (people ?? []).filter((p) => p.role === "professor").map((p) => p.id);
      await pushToUsers(students, { title, body: excerpt(r.body), url, tag }, URGENT);
      await pushToUsers(professors, { title, body: excerpt(r.body), url: `/projects/${r.project_id}/logs#log-${r.progress_log_id}`, tag }, URGENT);
      return;
    }
    await pushToUsers([...recipients], { title, body: excerpt(r.body), url, tag }, URGENT);
  });
}

/** A student submitted work: every professor on the project hears about it. */
export function notifySubmitted(taskId: string, actorId: string) {
  later(async (admin) => {
    const { data: task } = await admin.from("tasks").select("id, title, project_id").eq("id", taskId).maybeSingle();
    if (!task) return;
    const professors = (await projectMembers(admin, task.project_id, "professor")).filter((id) => id !== actorId);
    await pushToUsers(professors, {
      title: `${shortName(await nameOf(admin, actorId))} submitted work for review`,
      body: task.title,
      url: `/reviews?task=${task.id}`,
      tag: `review-${task.id}`,
    }, URGENT);
  });
}

/** The professor's verdict reaches the student it's about. */
export function notifyReviewed(taskId: string, approved: boolean, actorId: string) {
  later(async (admin) => {
    const { data: task } = await admin.from("tasks").select("id, title, assignee_id").eq("id", taskId).maybeSingle();
    if (!task?.assignee_id || task.assignee_id === actorId) return;
    await pushToUsers([task.assignee_id], {
      title: approved ? "Approved" : `${shortName(await nameOf(admin, actorId))} requested changes`,
      body: task.title,
      url: `/tasks/${task.id}`,
      tag: `review-${task.id}`,
    }, URGENT);
  });
}

/** A request for more time goes to the professors; the decision comes back to the student. */
export function notifyExtension(requestId: string, actorId: string) {
  later(async (admin) => {
    const { data: x } = await admin
      .from("extension_requests")
      .select("id, task_id, project_id, requested_by, status, proposed_deadline, task:tasks!extension_requests_task_id_fkey(title)")
      .eq("id", requestId)
      .maybeSingle();
    if (!x) return;
    const title = x.task?.title ?? "a task";
    if (x.status === "pending") {
      const professors = (await projectMembers(admin, x.project_id, "professor")).filter((id) => id !== actorId);
      await pushToUsers(professors, {
        title: `${shortName(await nameOf(admin, x.requested_by))} asked for more time`,
        body: `${title} · to ${x.proposed_deadline}`,
        url: `/tasks/${x.task_id}`,
        tag: `extension-${x.id}`,
      }, URGENT);
    } else if (x.requested_by !== actorId) {
      await pushToUsers([x.requested_by], {
        title: x.status === "approved" ? "Extension approved" : "Extension declined",
        body: title,
        url: `/tasks/${x.task_id}`,
        tag: `extension-${x.id}`,
      }, URGENT);
    }
  });
}

/** A blocker the student flagged for the professor. */
export function notifyBlocker(blockerId: string, actorId: string) {
  later(async (admin) => {
    const { data: b } = await admin.from("blockers").select("id, title, project_id, severity, needs_professor").eq("id", blockerId).maybeSingle();
    if (!b?.needs_professor) return;
    const professors = (await projectMembers(admin, b.project_id, "professor")).filter((id) => id !== actorId);
    await pushToUsers(professors, {
      title: `${shortName(await nameOf(admin, actorId))} is blocked (${b.severity})`,
      body: b.title,
      url: `/projects/${b.project_id}/blockers#blocker-${b.id}`,
      tag: `blocker-${b.id}`,
    }, URGENT);
  });
}

/** A task someone else put on your plate. */
export function notifyAssigned(taskId: string, actorId: string) {
  later(async (admin) => {
    const { data: task } = await admin.from("tasks").select("id, title, assignee_id, professor_deadline").eq("id", taskId).maybeSingle();
    if (!task?.assignee_id || task.assignee_id === actorId) return;
    await pushToUsers(
      [task.assignee_id],
      {
        title: `${shortName(await nameOf(admin, actorId))} gave you a task`,
        body: task.professor_deadline ? `${task.title} · due ${task.professor_deadline}` : task.title,
        url: `/tasks/${task.id}`,
        tag: `task-${task.id}`,
      },
      URGENT,
    );
  });
}

export type MeetingEvent = "scheduled" | "moved" | "ended" | "cancelled";

/**
 * A meeting was booked, moved, finished or called off: the other person hears
 * about it, with the time in their own time zone. Cancelled meetings are gone
 * by the time this runs, so the caller passes what it knew.
 */
export function notifyMeeting(
  event: MeetingEvent,
  meeting: { id: string; professor_id: string; student_id: string; starts_at: string },
  actorId: string,
  actionItems = 0,
) {
  later(async (admin) => {
    const otherId = actorId === meeting.professor_id ? meeting.student_id : meeting.professor_id;
    const [{ data: other }, who] = await Promise.all([
      admin.from("profiles").select("timezone").eq("id", otherId).maybeSingle(),
      nameOf(admin, actorId).then(shortName),
    ]);
    const when = formatMeetingTime(meeting.starts_at, other?.timezone ?? "UTC");
    const message =
      event === "scheduled" ? { title: `${who} scheduled a meeting`, body: `${when}. Open it to see the agenda or add a topic.` }
      : event === "moved" ? { title: `${who} moved your meeting`, body: `Now ${when}.` }
      : event === "cancelled" ? { title: `${who} cancelled your meeting`, body: `It was ${when}.` }
      : { title: "Meeting notes are ready", body: actionItems ? `${actionItems} action item${actionItems === 1 ? "" : "s"} from today's meeting.` : "Notes from today's meeting." };
    await pushToUsers([otherId], { ...message, url: event === "cancelled" ? "/meetings" : `/meetings/${meeting.id}`, tag: `meeting-${meeting.id}` }, URGENT);
  });
}
