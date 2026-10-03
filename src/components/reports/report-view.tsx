import { MobileDetails } from "@/components/common/mobile-details";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { cn } from "cn";
import { StatusIcon, STATUS_META } from "@/components/common/status";
import { addDays, formatDay, formatMinutes } from "@/lib/domain/dates";
import { summarize, type WeeklyStats } from "@/lib/domain/weekly-report";

function Block({ title, children, tone, className }: { title: React.ReactNode; children: React.ReactNode; tone?: "danger"; className?: string }) {
  return (
    <section className={cn("min-w-0 space-y-1.5", className)}>
      <h3 className={cn("text-[13px] font-semibold", tone === "danger" && "text-danger")}>{title}</h3>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: "danger" | "good" | "bad" }) {
  return (
    <div className="rounded-[10px] border px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-lg font-semibold tabular", tone === "danger" && "text-danger")}>{value}</p>
      {hint && <p className={cn("text-[11px]", tone === "good" ? "text-success" : tone === "bad" ? "text-warning" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
}

/**
 * A weekly report as a one-page document: the conclusion first, four numbers
 * against the student's own average, then the evidence. `linkTasks` is off on
 * the public share page, where task pages aren't reachable.
 */
export function ReportView({
  stats,
  highlights,
  note,
  studentName,
  supervisor,
  linkTasks = true,
}: {
  stats: WeeklyStats;
  highlights: string;
  note?: string;
  studentName: string;
  supervisor?: string | null;
  linkTasks?: boolean;
}) {
  const task = (t: { id: string; title: string }) =>
    linkTasks ? (
      <Link href={`/tasks/${t.id}`} className="hover:underline">
        {t.title}
      </Link>
    ) : (
      <span>{t.title}</span>
    );
  const missed = stats.missedProfessorDeadlines;
  const avg = stats.averages;
  const delta = avg ? stats.minutesLogged - avg.minutes : null;
  const onTimeCount = stats.completed.filter((c) => c.onTime).length;
  const projects = [...new Set([...stats.perProject.map((p) => p.title), ...stats.completed.map((c) => c.project), ...stats.inProgress.map((c) => c.project)])];

  return (
    <article className="mx-auto grid max-w-[780px] gap-6 rounded-xl border bg-card px-5 py-7 sm:px-11 sm:py-9">
      <header className="grid gap-1 border-b pb-5">
        <span className="text-[10.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Weekly report · week {stats.weekNumber}</span>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-[26px]">{studentName}</h2>
        <p className="text-muted-foreground">
          {formatDay(stats.weekStart)} – {formatDay(addDays(stats.weekStart, 6))}
          {projects.length > 0 && ` · ${projects.join(", ")}`}
          {supervisor && ` · supervised by ${supervisor}`}
        </p>
      </header>

      <div className={cn("rounded-[10px] border px-4 py-3.5", missed.length > 0 ? "border-warning/35 bg-warning/[0.07]" : "border-success/30 bg-success/[0.05]")}>
        <p className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Summary</p>
        <p className="mt-1 text-[15px] font-semibold sm:text-base">{summarize(stats)}</p>
        {missed.length > 0 && (
          <p className="mt-1 flex items-start gap-1.5 text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Missed: {missed.map((m) => `"${m.title}" (${m.daysLate}d late${m.done ? "" : ", still open"})`).join(", ")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi
          label="Time logged"
          value={formatMinutes(stats.minutesLogged)}
          hint={delta === null ? `${stats.logCount} entries` : `${delta >= 0 ? "+" : "−"}${formatMinutes(Math.abs(delta))} vs 4-wk avg`}
          tone={delta === null ? undefined : delta >= 0 ? "good" : "bad"}
        />
        <Kpi label="Active days" value={`${stats.activeDays} / 7`} hint={avg ? `avg ${avg.activeDays}` : undefined} />
        <Kpi label="Completed" value={String(stats.completed.length)} hint={stats.onTimeRate === null ? undefined : `${Math.round(stats.onTimeRate * 100)}% on time`} />
        <Kpi label="Open blockers" value={String(stats.blockersOpen.length)} hint={`${stats.blockersResolved} resolved`} tone={stats.blockersOpen.length ? "danger" : undefined} />
      </div>

      {note && (
        <section className="rounded-[10px] border-l-2 border-primary bg-primary/[0.04] px-4 py-3">
          <h3 className="text-[13px] font-semibold">Note from the student</h3>
          <p className="mt-1 whitespace-pre-line text-[14px]">{note}</p>
        </section>
      )}

      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <Block title={`Completed · ${stats.completed.length}${stats.completed.length ? ` (${onTimeCount} on time)` : ""}`}>
          {stats.completed.length === 0 && <p className="text-muted-foreground">Nothing completed this week.</p>}
          {stats.completed.map((c) => (
            <p key={c.id} className="flex gap-2">
              <CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", c.onTime === false ? "text-warning" : "text-success")} />
              <span className="min-w-0">
                {task(c)} <span className="text-xs text-muted-foreground">· {c.project}</span>
                {c.onTime === false && <span className="text-xs text-warning"> · late</span>}
              </span>
            </p>
          ))}
        </Block>

        <Block title={`In progress · ${stats.inProgress.length}`}>
          {stats.inProgress.length === 0 && <p className="text-muted-foreground">Nothing in progress.</p>}
          {stats.inProgress.map((t) => (
            <p key={t.id} className="flex gap-2">
              <StatusIcon status={t.status} className="mt-0.5" />
              <span className="min-w-0">
                {task(t)} <span className="text-xs text-muted-foreground">· {STATUS_META[t.status].label.toLowerCase()}</span>
                {t.deadline && <span className="text-xs text-muted-foreground"> · due {formatDay(t.deadline)}</span>}
              </span>
            </p>
          ))}
        </Block>

        <Block title="Delays" tone={missed.length ? "danger" : undefined}>
          {missed.length === 0 ? (
            <p className="text-muted-foreground">No professor deadlines missed.</p>
          ) : (
            missed.map((m) => (
              <div key={m.id}>
                <p>
                  {task(m)} · professor deadline {m.deadline ? formatDay(m.deadline) : ""} · <b>{m.daysLate} day{m.daysLate === 1 ? "" : "s"} late</b>
                  {m.done ? ", done" : ", still open"}
                </p>
                {m.reason && <p className="text-[12.5px] text-muted-foreground">Reason given: &ldquo;{m.reason}&rdquo;</p>}
              </div>
            ))
          )}
        </Block>

        <Block title="Problems">
          {!stats.problems || stats.problems.length === 0 ? (
            <p className="text-muted-foreground">No problems recorded in the logs.</p>
          ) : (
            stats.problems.slice(0, 6).map((p) => (
              <p key={p.text}>
                {p.text} <span className="text-xs text-muted-foreground">· {formatDay(p.date).slice(0, 3)}</span>
              </p>
            ))
          )}
          {stats.blockersOpen.map((b) => (
            <p key={b.title} className="text-[12.5px]">
              <span className={b.severity === "high" ? "text-danger" : "text-warning"}>●</span> Blocker: {b.title}{" "}
              <span className="text-muted-foreground">
                · {b.severity} · open {b.ageDays}d
              </span>
            </p>
          ))}
        </Block>

        <Block title="Next week" className="sm:col-span-2">
          {stats.upcoming.length === 0 && <p className="text-muted-foreground">No deadlines next week.</p>}
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {stats.upcoming.map((u) => (
              <p key={`${u.id}-${u.kind}`}>
                <span className="font-mono text-xs text-muted-foreground">{formatDay(u.deadline!).slice(0, 6)}</span> {task(u)}{" "}
                <span className="text-xs text-muted-foreground">· {u.kind === "professor" ? "professor deadline" : "own target"}</span>
              </p>
            ))}
          </div>
          {stats.plan && <p className="text-[12.5px] text-muted-foreground">Plan from the last log: &ldquo;{stats.plan}&rdquo;</p>}
        </Block>

        {stats.decisions.length > 0 && (
          <Block title="Decisions" className="sm:col-span-2">
            {stats.decisions.map((d) => (
              <p key={d.title} className="flex items-center gap-2">
                <Scale className="size-3.5 text-muted-foreground" /> {d.title} <span className="text-xs text-muted-foreground">· {d.project}</span>
              </p>
            ))}
          </Block>
        )}

        {stats.perProject.length > 1 && (
          <Block title="Time by project" className="sm:col-span-2">
            {stats.perProject.map((p) => (
              <p key={p.projectId} className="flex items-center gap-3">
                <span className="w-44 truncate">{p.title}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full bg-primary" style={{ width: `${(p.minutes / Math.max(1, stats.minutesLogged)) * 100}%` }} />
                </span>
                <span className="w-16 text-right font-mono text-xs tabular">{formatMinutes(p.minutes)}</span>
              </p>
            ))}
          </Block>
        )}
      </div>

      <section className="space-y-1.5 border-t pt-5">
        <h3 className="text-[13px] font-semibold max-md:hidden">Highlights from the logs</h3>
        {highlights ? (
          <MobileDetails summary="Highlights from the logs" hint="every entry this week">
            <pre className="rounded-[10px] bg-muted/50 p-3.5 font-sans text-[13px] whitespace-pre-wrap">{highlights}</pre>
          </MobileDetails>
        ) : (
          <p className="text-muted-foreground">No progress logged this week.</p>
        )}
      </section>
      <footer className="text-[11.5px] text-muted-foreground">
        Generated from {stats.logCount} log entr{stats.logCount === 1 ? "y" : "ies"}
        {stats.remarksReceived > 0 && ` and ${stats.remarksReceived} professor remark${stats.remarksReceived === 1 ? "" : "s"}`}.
      </footer>
    </article>
  );
}
