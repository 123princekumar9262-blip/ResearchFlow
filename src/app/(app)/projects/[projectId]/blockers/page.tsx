import { BlockerCard, RaiseBlockerForm } from "@/components/projects/blockers";
import { getProjectBundle } from "@/lib/data/project";
import { dateIn, daysBetween } from "@/lib/domain/dates";

export default async function ProjectBlockersPage({ params }: PageProps<"/projects/[projectId]/blockers">) {
  const { projectId } = await params;
  const b = await getProjectBundle(projectId);
  const { data } = await b.supabase.from("blockers").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  const blockers = data ?? [];
  const names = new Map(b.members.map((m) => [m.user_id, m.full_name]));
  const tasks = new Map(b.tasks.map((t) => [t.id, t]));
  const open = blockers.filter((x) => x.status === "open");
  const resolved = blockers.filter((x) => x.status === "resolved");

  const card = (bl: (typeof blockers)[number]) => (
    <BlockerCard
      key={bl.id}
      blocker={bl}
      raisedBy={names.get(bl.raised_by) ?? "Former member"}
      resolvedBy={bl.resolved_by ? (names.get(bl.resolved_by) ?? null) : null}
      task={bl.task_id ? tasks.get(bl.task_id) : undefined}
      ageDays={daysBetween(dateIn(bl.created_at, b.profile.timezone), b.today)}
    />
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-muted-foreground">
          Stuck for more than an hour? Raise it. Blockers show on the professor&apos;s overview, and the resolutions become the lab&apos;s know-how.
        </p>
        <RaiseBlockerForm projectId={projectId} tasks={b.tasks.filter((t) => t.status !== "done")} isStudent={b.myRole === "student"} />
      </div>
      <section aria-labelledby="open-blockers">
        <h2 id="open-blockers" className="mb-2 text-[13px] font-medium">
          Open ({open.length})
        </h2>
        {open.length === 0 ? <p className="text-muted-foreground">Nothing blocking this project.</p> : <ul className="space-y-3">{open.map(card)}</ul>}
      </section>
      {resolved.length > 0 && (
        <section aria-labelledby="resolved-blockers">
          <h2 id="resolved-blockers" className="mb-2 text-[13px] font-medium">
            Resolved ({resolved.length})
          </h2>
          <ul className="space-y-3">{resolved.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
