import "server-only";

import { cache } from "react";
import { daysBetween, weekStartOf } from "@/lib/domain/dates";
import { readOnboarding } from "@/lib/onboarding/state";
import { disclose, earned, type Disclosure, type Facts, type Feature } from "@/lib/onboarding/stage";
import { getWorkspace } from "./workspace";

export interface DisclosureData extends Disclosure {
  /** Features the work has earned right now (to record new unlocks). */
  earnedNow: Feature[];
  facts: Facts;
}

/** The account's stage and unlocked features, once per request (calm redesign spec, Phases 01 and 03). */
export const getDisclosure = cache(async (): Promise<DisclosureData> => {
  const ws = await getWorkspace();
  const { supabase, userId, profile, today } = ws;
  const weekStart = weekStartOf(today);

  let students = 0;
  let reportWeek = false;
  if (profile.role === "professor") {
    const [links, reports] = await Promise.all([
      supabase.from("supervisions").select("student_id", { count: "exact", head: true }).eq("professor_id", userId),
      supabase.from("weekly_reports").select("id", { count: "exact", head: true }).not("submitted_at", "is", null),
    ]);
    students = links.count ?? 0;
    reportWeek = (reports.count ?? 0) > 0;
  } else {
    reportWeek = ws.myLogs.some((l) => l.log_date < weekStart);
  }

  const facts: Facts = {
    role: profile.role,
    accountAge: Math.max(0, daysBetween(profile.created_at.slice(0, 10), today)),
    projects: ws.projects.length,
    tasks: ws.tasks.filter((t) => t.assignee_id === userId || t.assignee_id === null).length,
    logs: ws.myLogs.length,
    deadlines: ws.tasks.some((t) => t.professor_deadline || t.personal_deadline) || ws.milestones.some((m) => m.due_date),
    reportWeek,
    students,
    submissions: ws.tasks.some((t) => t.status === "in_review" || (t.requires_review && (t.status === "done" || t.status === "changes_requested"))),
  };
  const stored = readOnboarding(profile) ?? {};
  return { ...disclose(facts, stored), earnedNow: earned(facts), facts };
});
