"use client";

import { useState } from "react";
import { Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { ProgressBar } from "@/components/common/ui-bits";
import { useServerAction } from "@/components/common/use-server-action";
import { createMilestone, deleteMilestone, updateMilestone } from "@/server/actions/milestones";
import type { Milestone } from "@/types/database";

type MilestoneView = Milestone & { done: number; total: number };

export function MilestoneList({
  projectId,
  milestones,
  today,
  canSetDueDate,
}: {
  projectId: string;
  milestones: MilestoneView[];
  today: string;
  canSetDueDate: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, run } = useServerAction();

  return (
    <div className="divide-y">
      {milestones.length === 0 && !adding && (
        <p className="px-4 py-5 text-center text-muted-foreground">
          No milestones yet. Milestones are the professor-level checkpoints, like &ldquo;Preliminary results&rdquo; or &ldquo;Paper draft&rdquo;.
        </p>
      )}
      {milestones.map((m) =>
        editing === m.id ? (
          <form
            key={m.id}
            action={(form) =>
              run(
                () =>
                  updateMilestone({
                    milestoneId: m.id,
                    title: String(form.get("title")),
                    ...(canSetDueDate ? { dueDate: String(form.get("dueDate") ?? "") } : {}),
                  }),
                { onSuccess: () => setEditing(null) },
              )
            }
            className="flex flex-wrap items-center gap-2 px-4 py-2.5"
          >
            <Input name="title" defaultValue={m.title} required className="h-8 min-w-48 flex-1" autoFocus />
            {canSetDueDate && <Input name="dueDate" type="date" defaultValue={m.due_date ?? ""} className="h-8 w-40" />}
            <Button size="icon-sm" type="submit" disabled={pending} aria-label="Save">
              <Check />
            </Button>
            <Button size="icon-sm" type="button" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel">
              <X />
            </Button>
          </form>
        ) : (
          <div key={m.id} className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
            <span className={m.total > 0 && m.done === m.total ? "text-success" : "text-primary"}>◆</span>
            <span className="min-w-0 flex-1 truncate font-medium max-sm:basis-[calc(100%-2rem)]">{m.title}</span>
            <span className="flex w-36 items-center gap-2">
              <ProgressBar value={m.total ? m.done / m.total : 0} tone={m.total > 0 && m.done === m.total ? "success" : "primary"} />
              <span className="font-mono text-[11px] text-muted-foreground tabular">
                {m.done}/{m.total}
              </span>
            </span>
            {m.due_date ? (
              <DeadlineChip date={m.due_date} today={today} kind="milestone" status={m.total > 0 && m.done === m.total ? "done" : undefined} />
            ) : (
              <span className="w-16 text-xs text-muted-foreground">no date</span>
            )}
            {!canSetDueDate && <Lock className="size-3 text-muted-foreground" aria-label="Due date set by your professor" />}
            <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button size="icon-xs" variant="ghost" onClick={() => setEditing(m.id)} aria-label={`Edit ${m.title}`}>
                <Pencil />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Delete ${m.title}`}
                onClick={() => confirm(`Delete milestone "${m.title}"? Its tasks are kept.`) && run(() => deleteMilestone({ milestoneId: m.id }))}
              >
                <Trash2 />
              </Button>
            </span>
          </div>
        ),
      )}
      {adding ? (
        <form
          action={(form) =>
            run(
              () =>
                createMilestone({
                  projectId,
                  title: String(form.get("title")),
                  dueDate: canSetDueDate ? String(form.get("dueDate") ?? "") : "",
                }),
              { onSuccess: () => setAdding(false) },
            )
          }
          className="flex flex-wrap items-center gap-2 px-4 py-2.5"
        >
          <Input name="title" placeholder="Milestone title" required className="h-8 min-w-48 flex-1" autoFocus />
          {canSetDueDate && <Input name="dueDate" type="date" min={today} className="h-8 w-40" aria-label="Due date" />}
          <Button size="sm" type="submit" disabled={pending}>
            Add
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="size-4" /> Add milestone
          {!canSetDueDate && <span className="text-xs">(your professor sets due dates)</span>}
        </button>
      )}
    </div>
  );
}
