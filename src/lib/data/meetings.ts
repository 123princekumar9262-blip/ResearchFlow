import "server-only";

import { cache } from "react";
import { requireSession } from "@/lib/auth";
import { readStats } from "@/lib/data/reports";
import { addDays, dateIn } from "@/lib/domain/dates";
import { splitMeetings } from "@/lib/domain/meetings";
import { summarize } from "@/lib/domain/weekly-report";
import type { Meeting, MeetingTopic, RemarkKind, TaskStatus } from "@/types/database";

const WITH_PEOPLE = "*, professor:profiles!meetings_professor_id_fkey(id, full_name), student:profiles!meetings_student_id_fkey(id, full_name)" as const;

export type MeetingWithPeople = Meeting & {
  professorName: string;
  studentName: string;
  /** The person on the other side, from the viewer's point of view. */
  other: { id: string; name: string };
};

function withPeople(
  m: Meeting & { professor: { id: string; full_name: string } | null; student: { id: string; full_name: string } | null },
  userId: string,
): MeetingWithPeople {
  const { professor, student, ...rest } = m;
  const professorName = professor?.full_name ?? "Professor";
  const studentName = student?.full_name ?? "Student";
  return {
    ...rest,
    professorName,
    studentName,
    other: userId === m.professor_id ? { id: m.student_id, name: studentName } : { id: m.professor_id, name: professorName },
  };
}

/**
 * The viewer's meetings, newest first, and the people they can meet with.
 * `ready` is false until migration 11 has created the table.
 */
export const listMeetings = cache(async () => {
  const { supabase, userId, profile } = await requireSession();
  const [meetings, linked] = await Promise.all([
    supabase.from("meetings").select(WITH_PEOPLE).order("starts_at", { ascending: false }).limit(200),
    supabase.rpc("linked_people"),
  ]);
  const people = (linked.data ?? []).filter((p) => p.role !== profile.role).map((p) => ({ id: p.id, name: p.full_name }));
  if (meetings.error) return { ready: false as const, meetings: [] as MeetingWithPeople[], people };
  return { ready: true as const, meetings: meetings.data.map((m) => withPeople(m, userId)), people };
});

/** The soonest meeting that hasn't happened yet (or is happening now), if it's within `days`. */
export async function nextMeeting(days = 7): Promise<MeetingWithPeople | null> {
  const { meetings } = await listMeetings();
  const next = splitMeetings(meetings).upcoming[0];
  return next && new Date(next.starts_at).getTime() - Date.now() < days * 86_400_000 ? next : null;
}

export interface AgendaTask {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string;
  due: string | null;
}

export interface MeetingDetail {
  meeting: MeetingWithPeople;
  role: "professor" | "student";
  userId: string;
  timeZone: string;
  today: string;
  projects: { id: string; title: string }[];
  topics: (MeetingTopic & { authorName: string })[];
  actionItems: AgendaTask[];
  agenda: {
    lastMeeting: { id: string; startsAt: string; items: AgendaTask[] } | null;
    requests: { id: string; body: string; kind: RemarkKind; taskId: string | null; projectId: string; createdAt: string }[];
    blockers: { id: string; title: string; severity: string; projectId: string; createdAt: string }[];
    inReview: AgendaTask[];
    changesRequested: AgendaTask[];
    overdue: AgendaTask[];
    report: { weekStart: string; summary: string; note: string } | null;
    sinceLast: { from: string; logs: number; minutes: number; problems: string[] };
  };
}

const task = (t: { id: string; title: string; status: TaskStatus; project_id: string; effective_deadline: string | null }): AgendaTask => ({
  id: t.id,
  title: t.title,
  status: t.status,
  projectId: t.project_id,
  due: t.effective_deadline,
});

/**
 * One meeting and its live agenda: everything open between this professor and
 * this student in the projects they share. RLS keeps it to their own rows.
 */
export async function loadMeeting(meetingId: string): Promise<MeetingDetail | null> {
  const { supabase, userId, profile, today } = await requireSession();
  const { data: row } = await supabase.from("meetings").select(WITH_PEOPLE).eq("id", meetingId).maybeSingle();
  if (!row) return null;
  const meeting = withPeople(row, userId);
  const { professor_id: professorId, student_id: studentId } = meeting;

  // Projects they're both on.
  const { data: members } = await supabase.from("project_members").select("project_id, user_id").in("user_id", [professorId, studentId]);
  const byProject = new Map<string, Set<string>>();
  for (const m of members ?? []) byProject.set(m.project_id, (byProject.get(m.project_id) ?? new Set()).add(m.user_id));
  const shared = [...byProject].filter(([, who]) => who.has(professorId) && who.has(studentId)).map(([id]) => id);

  const [projects, topics, items, open, remarks, blockers, report, previous] = await Promise.all([
    supabase.from("projects").select("id, title, status").in("id", shared).neq("status", "archived").order("updated_at", { ascending: false }),
    supabase.from("meeting_topics").select("*, author:profiles!meeting_topics_author_id_fkey(full_name)").eq("meeting_id", meetingId).order("created_at"),
    supabase.from("tasks").select("id, title, status, project_id, effective_deadline").eq("meeting_id", meetingId).order("created_at"),
    supabase.from("tasks").select("id, title, status, project_id, effective_deadline").in("project_id", shared).eq("assignee_id", studentId).neq("status", "done"),
    supabase
      .from("remarks")
      .select("id, body, kind, task_id, project_id, created_at")
      .in("project_id", shared)
      .eq("author_id", professorId)
      .in("kind", ["change_request", "question"])
      .is("addressed_at", null)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("blockers").select("id, title, severity, project_id, created_at").in("project_id", shared).eq("raised_by", studentId).eq("status", "open"),
    supabase
      .from("weekly_reports")
      .select("week_start, stats, student_note")
      .eq("student_id", studentId)
      .not("submitted_at", "is", null)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meetings")
      .select("id, starts_at")
      .eq("professor_id", professorId)
      .eq("student_id", studentId)
      .eq("status", "done")
      .lt("starts_at", meeting.starts_at)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const since = previous.data ? dateIn(previous.data.starts_at, profile.timezone) : addDays(today, -7);
  const [lastItems, logs] = await Promise.all([
    previous.data
      ? supabase.from("tasks").select("id, title, status, project_id, effective_deadline").eq("meeting_id", previous.data.id).order("created_at")
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("progress_logs").select("minutes_spent, problems").in("project_id", shared).eq("author_id", studentId).gte("log_date", since).order("log_date", { ascending: false }),
  ]);

  const openTasks = (open.data ?? []).map(task);
  const stats = report.data ? readStats(report.data.stats) : null;

  return {
    meeting,
    role: profile.role,
    userId,
    timeZone: profile.timezone,
    today,
    projects: (projects.data ?? []).map((p) => ({ id: p.id, title: p.title })),
    topics: (topics.data ?? []).map(({ author, ...t }) => ({ ...t, authorName: author?.full_name ?? "Someone" })),
    actionItems: (items.data ?? []).map(task),
    agenda: {
      lastMeeting: previous.data ? { id: previous.data.id, startsAt: previous.data.starts_at, items: (lastItems.data ?? []).map(task) } : null,
      requests: (remarks.data ?? []).map((r) => ({ id: r.id, body: r.body, kind: r.kind, taskId: r.task_id, projectId: r.project_id, createdAt: r.created_at })),
      blockers: (blockers.data ?? []).map((b) => ({ id: b.id, title: b.title, severity: b.severity, projectId: b.project_id, createdAt: b.created_at })),
      inReview: openTasks.filter((t) => t.status === "in_review"),
      changesRequested: openTasks.filter((t) => t.status === "changes_requested"),
      overdue: openTasks.filter((t) => t.status !== "in_review" && t.due !== null && t.due < today),
      report: report.data ? { weekStart: report.data.week_start, summary: stats ? summarize(stats) : "", note: report.data.student_note } : null,
      sinceLast: {
        from: since,
        logs: (logs.data ?? []).length,
        minutes: (logs.data ?? []).reduce((sum, l) => sum + l.minutes_spent, 0),
        problems: [...new Set((logs.data ?? []).map((l) => l.problems.trim()).filter(Boolean))].slice(0, 3),
      },
    },
  };
}
