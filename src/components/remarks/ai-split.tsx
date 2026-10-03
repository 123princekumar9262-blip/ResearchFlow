"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useServerAction } from "@/components/common/use-server-action";
import { addDays } from "@/lib/domain/dates";
import { createTasksFromRemark, suggestTasksFromRemark } from "@/server/actions/ai";
import type { SplitTask } from "@/lib/ai/remark-to-tasks";

type Draft = SplitTask & { keep: boolean };

/** AI proposes, the student disposes: drafts are editable and nothing is created until confirmed. */
export function AiSplitButton({ remarkId, today, onDone }: { remarkId: string; today: string; onDone: () => void }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const suggest = useServerAction();
  const create = useServerAction();

  if (!drafts) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={suggest.pending}
        onClick={() => suggest.run(() => suggestTasksFromRemark({ remarkId }), { onSuccess: (tasks) => setDrafts(tasks.map((t) => ({ ...t, keep: true }))) })}
      >
        {suggest.pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {suggest.pending ? "Reading the remark…" : "Split into several tasks with AI"}
      </Button>
    );
  }

  const kept = drafts.filter((d) => d.keep);
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="size-3.5" /> Suggested tasks. Edit or untick before creating.
      </p>
      {drafts.map((d, i) => (
        <div key={i} className="flex items-start gap-2">
          <Checkbox
            checked={d.keep}
            onCheckedChange={(v) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, keep: v === true } : x)))}
            className="mt-2"
            aria-label={`Keep task ${i + 1}`}
          />
          <div className="min-w-0 flex-1">
            <Input
              value={d.title}
              onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              className="h-8"
            />
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {d.priority} priority{d.due_in_days !== null ? ` · due in ${d.due_in_days}d` : ""}
              {d.description ? ` · ${d.description}` : ""}
            </p>
          </div>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={create.pending || kept.length === 0}
        onClick={() =>
          create.run(
            () =>
              createTasksFromRemark({
                remarkId,
                tasks: kept.map((d) => ({
                  title: d.title,
                  description: d.description,
                  priority: d.priority,
                  personalDeadline: d.due_in_days !== null ? addDays(today, d.due_in_days) : "",
                })),
              }),
            { onSuccess: onDone },
          )
        }
      >
        {create.pending && <Loader2 className="animate-spin" />} Create {kept.length} task{kept.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}
