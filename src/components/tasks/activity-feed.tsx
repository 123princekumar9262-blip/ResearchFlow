"use client";

import { useState } from "react";
import { cn } from "cn";
import { RemarkComposer, RemarkItem, type RemarkView } from "@/components/remarks/remark-thread";
import { timeAgo } from "@/lib/domain/dates";
import type { ActivityEvent } from "@/lib/domain/activity";
import type { UserRole } from "@/types/database";

type Filter = "all" | "remarks" | "evidence" | "changes";

const DOT: Record<ActivityEvent["tone"], string> = {
  default: "bg-border",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Everything that happened to a task in one newest-first timeline: remarks as
 * cards, everything else as one-line events on a rail. Filters isolate a kind.
 */
export function ActivityFeed({
  remarks,
  events,
  names,
  projectId,
  taskId,
  viewerRole,
  today,
  aiEnabled,
}: {
  remarks: RemarkView[];
  events: ActivityEvent[];
  names: Record<string, string>;
  projectId: string;
  taskId: string;
  viewerRole: UserRole;
  today: string;
  aiEnabled: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  type Entry = { at: string; remark?: RemarkView; event?: ActivityEvent };
  const entries: Entry[] = [
    ...(filter === "all" || filter === "remarks" ? remarks.map((r) => ({ at: r.created_at, remark: r })) : []),
    ...(filter === "remarks" ? [] : events.filter((e) => filter === "all" || e.group === filter).map((e) => ({ at: e.at, event: e }))),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const counts = {
    all: remarks.length + events.length,
    remarks: remarks.length,
    evidence: events.filter((e) => e.group === "evidence").length,
    changes: events.filter((e) => e.group === "changes").length,
  };

  return (
    <section aria-labelledby="activity-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="activity-heading" className="text-[13px] font-semibold">
          Activity
        </h2>
        <div className="inline-flex rounded-md border p-0.5 text-[11.5px]" role="tablist" aria-label="Filter activity">
          {(["all", "remarks", "evidence", "changes"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn("rounded px-2 py-0.5 capitalize", filter === f ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {f} <span className="font-mono text-[10px] opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ol className="ml-2.5 space-y-3 border-l-[1.5px] pl-5">
          {entries.map((entry) =>
            entry.remark ? (
              <li key={entry.remark.id} className="relative list-none">
                <span className={cn("absolute top-3 -left-[26.5px] size-2 rounded-full ring-4 ring-background", entry.remark.kind === "change_request" ? "bg-danger" : entry.remark.kind === "approval" ? "bg-success" : "bg-primary")} />
                <ol className="list-none">
                  <RemarkItem r={entry.remark} projectId={projectId} viewerRole={viewerRole} today={today} aiEnabled={aiEnabled} />
                </ol>
              </li>
            ) : (
              <li key={entry.event!.id} className="relative list-none text-[12.5px] text-muted-foreground">
                <span className={cn("absolute top-1.5 -left-[26px] size-[7px] rounded-full ring-4 ring-background", DOT[entry.event!.tone])} />
                <b className="font-medium text-foreground">{entry.event!.actorId ? (names[entry.event!.actorId] ?? "Someone") : "Your professor"}</b>{" "}
                {entry.event!.text} · {timeAgo(entry.event!.at)}
              </li>
            ),
          )}
        </ol>
      )}

      {/* Newest activity is on top; the composer closes the conversation, as in a chat. */}
      {(filter === "all" || filter === "remarks") && <RemarkComposer projectId={projectId} taskId={taskId} viewerRole={viewerRole} />}
    </section>
  );
}
