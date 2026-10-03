import { ChapterTrigger } from "@/components/onboarding/tips";
import { FirstMilestoneTip } from "@/components/onboarding/tip-kinds";
import Link from "next/link";
import { ArrowRight, CircleDot, Flag, Info, MessageSquareText, NotebookPen, OctagonAlert, Scale } from "lucide-react";
import { cn } from "cn";
import { RowLink, Section, UserAvatar } from "@/components/common/ui-bits";
import { MilestoneList } from "@/components/projects/milestones";
import { getProjectBundle } from "@/lib/data/project";
import { daysBetween, formatDay, formatMinutes, timeAgo } from "@/lib/domain/dates";

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const b = await getProjectBundle(projectId);
  const { supabase, today } = b;
  const names = new Map(b.members.map((m) => [m.user_id, m.full_name]));

  const [logs, remarks, blockers, decisions] = await Promise.all([
    supabase.from("progress_logs").select("*").eq("project_id", projectId).order("log_date", { ascending: false }).limit(4),
    supabase
      .from("remarks")
      .select("*")
      .eq("project_id", projectId)
      .is("parent_id", null)
      .is("addressed_at", null)
      .in("kind", ["change_request", "question"])
      .order("created_at"),
    supabase.from("blockers").select("*").eq("project_id", projectId).eq("status", "open").order("created_at"),
    supabase.from("decisions").select("*").eq("project_id", projectId).is("superseded_by", null).order("decided_on", { ascending: false }).limit(3),
  ]);

  const milestones = b.milestones.map((m) => {
    const tasks = b.tasks.filter((t) => t.milestone_id === m.id);
    return { ...m, total: tasks.length, done: tasks.filter((t) => t.status === "done").length };
  });
  const viewAll = (href: string) => (
    <Link href={`/projects/${projectId}/${href}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      All <ArrowRight className="size-3" />
    </Link>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <ChapterTrigger tour="project" />
      <div className="rf-stagger space-y-5 lg:col-span-2">
        {milestones.length === 0 && <FirstMilestoneTip />}
        <Section icon={Flag} title="Milestones" count={milestones.length} tour="milestones">
          <MilestoneList projectId={projectId} milestones={milestones} today={today} canSetDueDate={b.canSetProfessorDeadline} />
        </Section>

        <Section icon={NotebookPen} accent="success" title="Latest progress" action={viewAll("logs")} bodyClassName="divide-y">
          {(logs.data ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-muted-foreground">No logs yet. Logs are the evidence that work happened.</p>
          ) : (
            (logs.data ?? []).map((l) => (
              <div key={l.id} className="flex gap-3 px-4 py-3">
                <UserAvatar name={names.get(l.author_id) ?? "?"} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{names.get(l.author_id)}</span> · {formatDay(l.log_date)} · {formatMinutes(l.minutes_spent)}
                  </p>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line">{l.completed_work}</p>
                  {l.problems && <p className="mt-1 line-clamp-1 text-xs text-warning">Problem: {l.problems}</p>}
                </div>
              </div>
            ))
          )}
        </Section>
      </div>

      <div className="space-y-5">
        {b.project.description && (
          <Section icon={Info} accent="info" title="About">
            <p className="px-4 py-3 whitespace-pre-line text-muted-foreground">{b.project.description}</p>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              Started {formatDay(b.project.start_date)}
              {b.project.target_end_date && ` · target ${formatDay(b.project.target_end_date)}`}
            </p>
          </Section>
        )}

        <Section icon={OctagonAlert} title="Open blockers" count={(blockers.data ?? []).length} tone="danger" action={viewAll("blockers")} bodyClassName="divide-y">
          {(blockers.data ?? []).length === 0 ? (
            <p className="px-4 py-4 text-center text-muted-foreground">Nothing blocking.</p>
          ) : (
            (blockers.data ?? []).map((bl) => (
              <RowLink key={bl.id} href={`/projects/${projectId}/blockers#blocker-${bl.id}`}>
                <CircleDot className={cn("size-3.5", bl.severity === "high" ? "text-danger" : "text-warning")} />
                <span className="min-w-0 flex-1 truncate">{bl.title}</span>
                <span className="text-xs text-muted-foreground">{daysBetween(bl.created_at.slice(0, 10), today)}d</span>
              </RowLink>
            ))
          )}
        </Section>

        <Section icon={MessageSquareText} title="Awaiting response" count={(remarks.data ?? []).length} tone="warning" action={viewAll("remarks")} bodyClassName="divide-y">
          {(remarks.data ?? []).length === 0 ? (
            <p className="px-4 py-4 text-center text-muted-foreground">No open requests.</p>
          ) : (
            (remarks.data ?? []).map((r) => (
              <RowLink key={r.id} href={r.task_id ? `/tasks/${r.task_id}#remark-${r.id}` : `/projects/${projectId}/remarks#remark-${r.id}`}>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">{r.body}</span>
                  <span className="text-xs text-muted-foreground">
                    {names.get(r.author_id)} · {timeAgo(r.created_at)}
                  </span>
                </span>
              </RowLink>
            ))
          )}
        </Section>

        <Section icon={Scale} title="Recent decisions" action={viewAll("decisions")} bodyClassName="divide-y">
          {(decisions.data ?? []).length === 0 ? (
            <p className="px-4 py-4 text-center text-muted-foreground">No decisions recorded.</p>
          ) : (
            (decisions.data ?? []).map((d) => (
              <RowLink key={d.id} href={`/projects/${projectId}/decisions#decision-${d.id}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.title}</span>
                  <span className="text-xs text-muted-foreground">{formatDay(d.decided_on)}</span>
                </span>
              </RowLink>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
