import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/ui-bits";
import { Heatmap } from "@/components/logs/heatmap";
import { LogEntry } from "@/components/logs/log-entry";
import { getProjectBundle } from "@/lib/data/project";
import { loadLogs } from "@/lib/data/logs";
import { activityByDay } from "@/lib/domain/analytics";
import { addDays, formatDay, formatMinutes } from "@/lib/domain/dates";

export default async function ProjectLogsPage({ params }: PageProps<"/projects/[projectId]/logs">) {
  const { projectId } = await params;
  const b = await getProjectBundle(projectId);
  const { supabase, today, userId, profile } = b;
  const logs = await loadLogs(supabase, { projectId, since: addDays(today, -7 * 26) }, userId);
  const withoutProject = logs.map((l) => ({ ...l, projectTitle: undefined }));
  const byDate = new Map<string, typeof withoutProject>();
  for (const l of withoutProject) byDate.set(l.log_date, [...(byDate.get(l.log_date) ?? []), l]);
  const total = logs.reduce((s, l) => s + l.minutes_spent, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-6">
        {logs.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon={NotebookPen}
              title="No progress logged on this project"
              action={
                profile.role === "student" ? (
                  <Button asChild size="sm">
                    <Link href={`/log/new?project=${projectId}`}>Write today&apos;s log</Link>
                  </Button>
                ) : undefined
              }
            >
              Daily logs are how work shows up between meetings.
            </EmptyState>
          </div>
        ) : (
          [...byDate.entries()].map(([date, entries]) => (
            <section key={date} aria-labelledby={`d-${date}`}>
              <h2 id={`d-${date}`} className="mb-2 flex items-center gap-3 text-xs font-medium text-muted-foreground">
                {formatDay(date, Number(today.slice(0, 4)))}
                <span className="h-px flex-1 bg-border" />
              </h2>
              <div className="space-y-3">
                {entries.map((l) => (
                  <LogEntry key={l.id} log={l} timeZone={profile.timezone} showAuthor />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <aside className="space-y-3 lg:w-72">
        {profile.role === "student" && (
          <Button asChild className="w-full">
            <Link href={`/log/new?project=${projectId}`}>
              <NotebookPen /> Write today&apos;s log
            </Link>
          </Button>
        )}
        <div className="rounded-xl border bg-card p-3">
          <Heatmap cells={activityByDay(logs, today, 12)} today={today} />
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          {logs.length} entries · {formatMinutes(total)} in the last 26 weeks
        </p>
      </aside>
    </div>
  );
}
