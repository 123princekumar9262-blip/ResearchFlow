import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";
import { getSession, type Session } from "@/lib/auth";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export const ok = <T>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string, fieldErrors?: Record<string, string[] | undefined>): ActionResult<never> => ({
  ok: false,
  error,
  fieldErrors,
});

const CONSTRAINT_MESSAGES: Record<string, string> = {
  tasks_personal_before_professor: "Your personal deadline must be on or before the professor's deadline.",
  blockers_resolution_required: "Write how the blocker was resolved.",
  progress_logs_author_id_project_id_log_date_key: "You already have a log for this project on that day. Edit it instead.",
  task_dependencies_pkey: "That dependency already exists.",
  task_dependencies_check: "A task can't depend on itself.",
  weekly_reports_student_id_week_start_key: "A report for that week already exists.",
  extension_requests_one_pending: "There is already a pending extension request for this task.",
};

/**
 * Turns a database error into something a person can act on. Trigger errors
 * (P0001) are already written for humans and pass through unchanged.
 */
export function describeDbError(error: PostgrestError | { code?: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "PGRST116") return "That item no longer exists, or you can't see it.";
  if (error.code === "23514" || error.code === "23505") {
    const constraint = Object.keys(CONSTRAINT_MESSAGES).find((name) => error.message.includes(name));
    if (constraint) return CONSTRAINT_MESSAGES[constraint];
    return error.code === "23505" ? "That already exists." : "Some values aren't allowed. Check the form and try again.";
  }
  if (error.code === "23503") return "Something this refers to no longer exists. Refresh and try again.";
  if (error.message?.includes("row-level security")) return "You don't have permission to do that.";
  console.error("[db]", error);
  return "Something went wrong saving that. Try again.";
}

/**
 * Wraps a Server Action body: re-checks auth (never trust the proxy alone),
 * validates input with Zod, and converts thrown database errors to results.
 */
export async function action<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  run: (data: z.infer<S>, session: Session) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const session = await getSession();
  if (!session) return fail("Your session expired. Sign in again.");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const first = parsed.error.issues[0];
    return fail(first ? first.message : "Check the form and try again.", fieldErrors);
  }

  try {
    return await run(parsed.data, session);
  } catch (error) {
    // redirect() and notFound() work by throwing; let them through.
    unstable_rethrow(error);
    if (error && typeof error === "object" && "message" in error) {
      return fail(describeDbError(error as PostgrestError));
    }
    throw error;
  }
}

/**
 * Throws the Postgrest error so `action()` can describe it; otherwise returns
 * the data. Typed on the whole response rather than `{ data: T | null }`:
 * that form lets TypeScript push the parameter type back into `.single<T>()`
 * and collapse the row type to `never`.
 */
export function unwrap<R extends { data: unknown; error: PostgrestError | null }>(result: R): NonNullable<R["data"]> {
  if (result.error) throw result.error;
  return result.data as NonNullable<R["data"]>;
}
