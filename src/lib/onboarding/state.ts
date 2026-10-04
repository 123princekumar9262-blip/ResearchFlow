import { z } from "zod";

/** The seven deep-dive tours, one per area; "core" is the 10-step first tour. */
export const CHAPTERS = ["dashboard", "project", "tasks", "log", "feedback", "report", "calendar"] as const;
export type ChapterId = (typeof CHAPTERS)[number];
export type TourId = "core" | ChapterId;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One small record per account (profiles.onboarding). Every key is optional. */
export const onboardingSchema = z.object({
  /** Welcome flow. Missing on a brand-new account. */
  setup: z.enum(["in_progress", "done", "skipped"]).optional(),
  /** Setup screen to resume on. */
  screen: z.number().int().min(0).max(3).optional(),
  /** Visits to the welcome flow while it was unfinished. */
  visits: z.number().int().min(0).max(50).optional(),
  /** Core tour: at rest it is paused (with a step), finished or skipped. */
  core: z.enum(["paused", "done", "skipped"]).optional(),
  step: z.number().int().min(0).max(20).optional(),
  pausedOn: day.optional(),
  /** How many times the core tour was skipped. */
  skips: z.number().int().min(0).max(50).optional(),
  /** Chapters played or declined (also sub-parts such as "tasks-dialog"). */
  seen: z.array(z.string().max(32)).max(40).optional(),
  /** Tips dismissed for good. */
  off: z.array(z.string().max(32)).max(40).optional(),
  /** Tips dismissed until the next day: id → the day it was dismissed. */
  snooze: z.record(z.string().max(32), day).optional(),
  /** Professor copied the join code or the invite message. */
  shared: z.boolean().optional(),
  /** How many "No deadline set" hints have been shown. */
  hints: z.number().int().min(0).max(50).optional(),
  /** Day the Getting started checklist was completed. */
  done: day.optional(),
  /** Day an auto-started tour last ran (once a day after the first week). */
  autoOn: day.optional(),
  /** The account existed before onboarding shipped. */
  legacy: z.boolean().optional(),
  /** Progressive disclosure: the highest stage reached (it never goes back). */
  stage: z.number().int().min(1).max(3).optional(),
  /** Features unlocked so far: feature → the day it appeared ("-" for the first snapshot, never "New"). */
  unlocked: z.record(z.string().max(16), z.string().max(10)).optional(),
  /** "Show everything" in Settings. */
  all: z.boolean().optional(),
});

export type Onboarding = z.infer<typeof onboardingSchema>;

/**
 * The stored record, or null when the column doesn't exist yet (migration 8
 * not applied): the app then keeps progress on this device only.
 */
export function readOnboarding(profile: { onboarding?: unknown }): Onboarding | null {
  if (!("onboarding" in profile) || profile.onboarding === undefined) return null;
  const parsed = onboardingSchema.safeParse(profile.onboarding ?? {});
  return parsed.success ? parsed.data : {};
}

/** Whether the welcome flow should take over the dashboard. */
export function needsWelcome(o: Onboarding | null): boolean {
  if (!o) return false;
  if (!o.setup) return true;
  // After two abandoned visits the flow stops insisting.
  return o.setup === "in_progress" && (o.visits ?? 0) < 2;
}

export const TOUR_LABEL: Record<ChapterId, string> = {
  dashboard: "Dashboard",
  project: "Projects",
  tasks: "Tasks & deadlines",
  log: "Progress log",
  feedback: "Feedback",
  report: "Weekly report",
  calendar: "Calendar",
};
