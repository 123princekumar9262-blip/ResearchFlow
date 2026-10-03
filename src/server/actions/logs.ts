"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { addDays } from "@/lib/domain/dates";
import { id, isoDate, longText } from "@/lib/validation";

const saveSchema = z.object({
  projectId: id,
  logDate: isoDate,
  completedWork: z.string().trim().min(1, "Write what you completed, even if it was a failed attempt.").max(5000),
  problems: longText(),
  nextSteps: longText(),
  minutesSpent: z.coerce.number().int().min(0).max(1440, "That's more than a day."),
  taskIds: z.array(id).max(20).default([]),
});

/**
 * Creates or updates the author's log for a project and day, and syncs which
 * tasks it counts as evidence for. The database refuses dates outside the
 * grace window, so this only checks it to give a clearer message.
 */
export async function saveLog(input: z.input<typeof saveSchema>) {
  return action(saveSchema, input, async (d, { supabase, userId, today }) => {
    if (d.logDate > addDays(today, 0) || d.logDate < addDays(today, -2)) {
      return fail("Logs can be written for today or the two days before it. Older days are locked.");
    }

    const log = unwrap(
      await supabase
        .from("progress_logs")
        .upsert(
          {
            project_id: d.projectId,
            author_id: userId,
            log_date: d.logDate,
            completed_work: d.completedWork,
            problems: d.problems,
            next_steps: d.nextSteps,
            minutes_spent: d.minutesSpent,
          },
          { onConflict: "author_id,project_id,log_date" },
        )
        .select("id")
        .single(),
    );

    const existing = unwrap(await supabase.from("progress_log_tasks").select("task_id").eq("log_id", log.id)).map((r) => r.task_id);
    const wanted = new Set(d.taskIds);
    const toAdd = d.taskIds.filter((t) => !existing.includes(t));
    const toRemove = existing.filter((t) => !wanted.has(t));

    if (toAdd.length > 0) {
      unwrap(await supabase.from("progress_log_tasks").insert(toAdd.map((task_id) => ({ log_id: log.id, task_id }))));
    }
    let kept = 0;
    if (toRemove.length > 0) {
      const removed = unwrap(
        await supabase.from("progress_log_tasks").delete().eq("log_id", log.id).in("task_id", toRemove).select("task_id"),
      );
      kept = toRemove.length - removed.length;
    }

    refresh();
    return ok(
      log.id,
      kept > 0 ? "Log saved. Links to tasks under review or done were kept, because they're evidence." : "Log saved",
    );
  });
}
