import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/reports/report-controls";
import { requireSession } from "@/lib/auth";
import { formatDay, formatMinutes } from "@/lib/domain/dates";

export const metadata = { title: "Progress log (print)" };

/** The whole diary as one clean document; the browser's print dialog saves it as a PDF. */
export default async function LogPrintPage() {
  const { supabase, userId, profile } = await requireSession();
  if (profile.role === "professor") redirect("/dashboard");

  const { data } = await supabase
    .from("progress_logs")
    .select(
      "id, log_date, minutes_spent, completed_work, problems, next_steps, project:projects!progress_logs_project_id_fkey(title), links:progress_log_tasks!progress_log_tasks_log_id_fkey(task:tasks!progress_log_tasks_task_id_fkey(title))",
    )
    .eq("author_id", userId)
    .order("log_date", { ascending: true });
  const logs = data ?? [];
  const total = logs.reduce((s, l) => s + l.minutes_spent, 0);
  const days = new Set(logs.map((l) => l.log_date)).size;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/log">
            <ArrowLeft /> Back to the log
          </Link>
        </Button>
        <PrintButton />
      </div>
      <article className="rounded-xl border bg-card p-6 shadow-[var(--shadow-card)] sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="border-b pb-4">
          <p className="text-[10.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Research progress log</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{profile.full_name}</h1>
          <p className="mt-1 text-muted-foreground">
            {logs.length ? `${formatDay(logs[0].log_date)} – ${formatDay(logs[logs.length - 1].log_date)} · ` : ""}
            {logs.length} entries over {days} days · {formatMinutes(total)} logged
          </p>
        </header>
        {logs.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No progress logged yet.</p>
        ) : (
          <ol className="divide-y">
            {logs.map((l) => (
              <li key={l.id} className="grid gap-1 py-4 break-inside-avoid sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
                <div className="text-[12.5px]">
                  <p className="font-semibold">{formatDay(l.log_date)}</p>
                  <p className="font-mono text-muted-foreground">{formatMinutes(l.minutes_spent)}</p>
                </div>
                <div className="space-y-1 text-[13.5px] leading-relaxed">
                  <p className="text-xs font-medium text-muted-foreground">{l.project?.title}</p>
                  <p className="whitespace-pre-line">
                    <b className="font-semibold">Done: </b>
                    {l.completed_work}
                  </p>
                  {l.problems && (
                    <p className="whitespace-pre-line">
                      <b className="font-semibold">Problems: </b>
                      {l.problems}
                    </p>
                  )}
                  {l.next_steps && (
                    <p className="whitespace-pre-line text-muted-foreground">
                      <b className="font-semibold">Next: </b>
                      {l.next_steps}
                    </p>
                  )}
                  {l.links.length > 0 && (
                    <p className="text-xs text-muted-foreground">Evidence for: {l.links.flatMap((x) => (x.task ? [x.task.title] : [])).join(", ")}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <footer className="mt-4 border-t pt-3 text-[11.5px] text-muted-foreground">Exported from ResearchFlow. Entries are as written; late entries keep their original date.</footer>
      </article>
    </div>
  );
}
