/**
 * Progressive disclosure (calm redesign spec): an account has a stage, and
 * features appear when the work behind them exists. Nothing here hides data
 * that needs action; callers still show overdue work, requests, reviews and
 * blockers whenever they're non-empty.
 */

export type Stage = 1 | 2 | 3;

/** Features that appear on their own trigger (spec Phase 03). */
export const FEATURES = ["tasks", "log", "calendar", "reports", "chart", "logstats", "reviews", "projects", "meetings"] as const;
export type Feature = (typeof FEATURES)[number];

export interface Facts {
  role: "student" | "professor";
  accountAge: number;
  projects: number;
  /** Students: tasks assigned to them (or unassigned) across projects. */
  tasks: number;
  /** Students: log entries in the last 12 weeks. */
  logs: number;
  /** Any task or milestone with a date. */
  deadlines: boolean;
  /** Students: a week with a log entry has ended. Professors: a report was submitted. */
  reportWeek: boolean;
  /** Professors: linked students. */
  students: number;
  /** Professors: a task was ever submitted for review. */
  submissions: boolean;
}

export function stageFor(f: Facts): Stage {
  if (f.role === "student") {
    if (f.projects === 0) return 1;
    return (f.tasks >= 5 && f.logs >= 3) || f.accountAge >= 14 ? 3 : 2;
  }
  if (f.students === 0 && f.projects === 0) return 1;
  return f.students >= 3 || f.reportWeek || f.accountAge >= 14 ? 3 : 2;
}

/** Which features the work has earned so far (before stage and "Show everything" are applied). */
export function earned(f: Facts): Feature[] {
  const out: Feature[] = [];
  if (f.projects > 0) out.push("projects", "log");
  if (f.role === "student" ? f.tasks > 0 : f.projects > 0) out.push("tasks");
  if (f.deadlines) out.push("calendar");
  if (f.reportWeek) out.push("reports");
  if (f.logs > 0) out.push("chart");
  if (f.logs >= 3) out.push("logstats");
  if (f.role === "professor" && (f.submissions || f.students > 0)) out.push("reviews");
  // Someone to meet: a professor with students, a student with a project.
  if (f.role === "professor" ? f.students > 0 : f.projects > 0) out.push("meetings");
  return out;
}

export interface Disclosure {
  stage: Stage;
  /** "Show everything" from Settings: every feature, every section. */
  all: boolean;
  has: Record<Feature, boolean>;
}

/**
 * The view for this account. Stages and unlocks only move forward: what the
 * account has seen before (stored) stays, even if the work behind it is gone.
 */
export function disclose(f: Facts, stored: { stage?: number; unlocked?: Record<string, string>; all?: boolean }): Disclosure {
  const stage = Math.max(stageFor(f), Math.min(3, stored.stage ?? 1)) as Stage;
  const all = !!stored.all;
  const got = new Set<string>([...earned(f), ...Object.keys(stored.unlocked ?? {})]);
  const has = Object.fromEntries(FEATURES.map((k) => [k, all || stage === 3 || got.has(k)])) as Record<Feature, boolean>;
  // Nothing to log into, or to plan, without a project.
  if (f.projects === 0 && !all) {
    has.log = false;
    has.tasks = false;
  }
  return { stage, all, has };
}

/** Which page belongs to a feature, for the "New" pill (cleared on the first visit). */
export const FEATURE_PATH: Partial<Record<Feature, string>> = {
  calendar: "/calendar",
  reports: "/reports",
  tasks: "/tasks",
  log: "/log",
  reviews: "/reviews",
  meetings: "/meetings",
};
