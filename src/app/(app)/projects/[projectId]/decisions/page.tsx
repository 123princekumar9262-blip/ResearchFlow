import { Scale } from "lucide-react";
import { cn } from "cn";
import { EmptyState, UserAvatar } from "@/components/common/ui-bits";
import { DecisionForm } from "@/components/projects/decisions";
import { getProjectBundle } from "@/lib/data/project";
import { formatDay } from "@/lib/domain/dates";

export default async function ProjectDecisionsPage({ params }: PageProps<"/projects/[projectId]/decisions">) {
  const { projectId } = await params;
  const b = await getProjectBundle(projectId);
  const { data } = await b.supabase.from("decisions").select("*").eq("project_id", projectId).order("decided_on", { ascending: false }).order("created_at", { ascending: false });
  const decisions = data ?? [];
  const names = new Map(b.members.map((m) => [m.user_id, m.full_name]));
  const title = new Map(decisions.map((d) => [d.id, d.title]));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-muted-foreground">Why the method is what it is. Useful for the thesis chapter, and for whoever continues the work.</p>
        <DecisionForm projectId={projectId} today={b.today} decisions={decisions.filter((d) => !d.superseded_by).map(({ id, title }) => ({ id, title }))} />
      </div>
      {decisions.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Scale} title="No decisions recorded">
            When you pick a topology, a switching frequency, a control method or a component, write down why.
          </EmptyState>
        </div>
      ) : (
        <ol className="relative space-y-4 border-l pl-6">
          {decisions.map((d) => (
            <li key={d.id} id={`decision-${d.id}`} className={cn("scroll-mt-20", d.superseded_by && "opacity-60")}>
              <span className={cn("absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-background", d.superseded_by ? "bg-muted-foreground" : "bg-primary")} />
              <article className="rounded-xl border bg-card p-4">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{formatDay(d.decided_on, Number(b.today.slice(0, 4)))}</span>·
                  <UserAvatar name={names.get(d.author_id) ?? "?"} className="size-4 text-[8px] ring-0" />
                  {names.get(d.author_id)}
                  {d.superseded_by && <span className="rounded bg-muted px-1.5">superseded by &ldquo;{title.get(d.superseded_by)}&rdquo;</span>}
                </p>
                <h3 className={cn("mt-1 font-medium", d.superseded_by && "line-through")}>{d.title}</h3>
                {d.context && (
                  <p className="mt-2 text-muted-foreground">
                    <span className="font-medium text-foreground">Context. </span>
                    {d.context}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-line">{d.decision}</p>
                {d.alternatives && (
                  <p className="mt-2 text-muted-foreground">
                    <span className="font-medium text-foreground">Alternatives. </span>
                    {d.alternatives}
                  </p>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
