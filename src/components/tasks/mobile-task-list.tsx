"use client";

import { useState } from "react";
import { cn } from "cn";
import { StatusIcon } from "@/components/common/status";
import { TaskRow } from "@/components/tasks/task-row";
import type { BoardTask } from "@/components/tasks/task-board";
import type { TaskStatus } from "@/types/database";

const SEGMENTS: { key: string; label: string; statuses: TaskStatus[] }[] = [
  { key: "todo", label: "To do", statuses: ["todo"] },
  { key: "doing", label: "Doing", statuses: ["in_progress", "changes_requested"] },
  { key: "review", label: "Review", statuses: ["in_review"] },
  { key: "done", label: "Done", statuses: ["done"] },
];

/**
 * The board on a phone: one status at a time behind a segmented control,
 * instead of every column stacked into one long page.
 */
export function MobileTaskList({ tasks, today }: { tasks: BoardTask[]; today: string }) {
  const count = (statuses: TaskStatus[]) => tasks.filter((t) => statuses.includes(t.status)).length;
  // Open on the work in hand: doing, else to do, else whatever has tasks.
  const initial = SEGMENTS.find((s) => s.key === "doing" && count(s.statuses) > 0) ?? SEGMENTS.find((s) => count(s.statuses) > 0) ?? SEGMENTS[0];
  const [active, setActive] = useState(initial.key);
  const segment = SEGMENTS.find((s) => s.key === active) ?? SEGMENTS[0];
  const shown = tasks.filter((t) => segment.statuses.includes(t.status));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 rounded-lg border bg-muted/50 p-0.5" role="tablist" aria-label="Status">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={s.key === active}
            onClick={() => setActive(s.key)}
            className={cn(
              "flex h-8 items-center justify-center gap-1 rounded-md text-[12.5px] transition-colors",
              s.key === active ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground",
            )}
          >
            {s.label}
            <span className="font-mono text-[10.5px] opacity-70">{count(s.statuses)}</span>
          </button>
        ))}
      </div>
      <section className="overflow-hidden rounded-[10px] border bg-card" role="tabpanel">
        {shown.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-muted-foreground">
            <StatusIcon status={segment.statuses[0]} /> Nothing here.
          </p>
        ) : (
          <div className="divide-y">
            {shown.map((t) => (
              <TaskRow key={t.id} task={t} today={today} evidence={t.evidence} blocked={t.blocked} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
