import { PageCrumbs } from "@/components/layout/page-crumbs";
import { AvatarStack, Pill, ProgressBar } from "@/components/common/ui-bits";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectSettings } from "@/components/projects/project-settings";
import { getProjectBundle } from "@/lib/data/project";
import { getDisclosure } from "@/lib/data/disclosure";
import { percent } from "@/lib/domain/progress";
import { daysBetween, formatDay } from "@/lib/domain/dates";

const STATUS = {
  active: { label: "Active", className: "bg-success" },
  on_hold: { label: "On hold", className: "bg-warning" },
  completed: { label: "Completed", className: "bg-info" },
  archived: { label: "Archived", className: "bg-muted-foreground" },
} as const;

export async function generateMetadata({ params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const { project } = await getProjectBundle(projectId);
  return { title: project.title };
}

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const b = await getProjectBundle(projectId);
  const { project, today } = b;

  const [{ data: people }, counts, used, disclosure] = await Promise.all([
    b.supabase.rpc("linked_people"),
    Promise.all([
      b.supabase.from("blockers").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "open"),
      b.supabase
        .from("remarks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .is("parent_id", null)
        .is("addressed_at", null)
        .in("kind", ["change_request", "question"]),
    ]),
    // Which tabs have ever had anything in them (calm redesign spec, Phase 03).
    Promise.all([
      b.supabase.from("remarks").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      b.supabase.from("attachments").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      b.supabase.from("blockers").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      b.supabase.from("decisions").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    ]),
    getDisclosure(),
  ]);
  const showAllTabs = disclosure.all;
  const unlockedTabs = new Set([
    "",
    "tasks",
    "logs",
    ...(showAllTabs || b.milestones.some((m) => m.due_date) ? ["timeline"] : []),
    ...(showAllTabs || (used[0].count ?? 0) > 0 ? ["remarks"] : []),
    ...(showAllTabs || (used[1].count ?? 0) > 0 ? ["files"] : []),
    ...(showAllTabs || (used[2].count ?? 0) > 0 ? ["blockers"] : []),
    ...(showAllTabs || (used[3].count ?? 0) > 0 ? ["decisions"] : []),
  ]);

  const nextProfessorDeadline = b.tasks
    .filter((t) => t.status !== "done" && t.professor_deadline)
    .map((t) => t.professor_deadline!)
    .sort()[0];
  const open = b.tasks.filter((t) => t.status !== "done").length;
  const done = b.tasks.length - open;
  const late = b.tasks.some((t) => t.status !== "done" && t.status !== "in_review" && t.professor_deadline && t.professor_deadline < today);
  const atRisk = (counts[0].count ?? 0) > 0 || b.tasks.some((t) => t.status !== "done" && t.effective_deadline && t.effective_deadline < today);
  const health = project.status !== "active" ? null : late ? { tone: "danger" as const, label: "Missed a deadline" } : atRisk ? { tone: "warning" as const, label: "At risk" } : { tone: "success" as const, label: "On track" };
  const daysLeft = project.target_end_date ? daysBetween(today, project.target_end_date) : null;
  const status = STATUS[project.status];

  return (
    <div>
      <PageCrumbs items={[{ label: "Projects", href: "/projects" }, { label: project.title }]} />
      <header className="mb-4 flex flex-wrap items-start gap-x-6 gap-y-3" data-tour="project-header">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-lg leading-snug font-semibold tracking-tight sm:text-[21px]">
            <span className="min-w-0">{project.title}</span>
            <Pill className="max-sm:hidden">
              <span className={`size-1.5 rounded-full ${status.className}`} aria-hidden /> {status.label}
            </Pill>
            {health && <Pill tone={health.tone}>{health.label}</Pill>}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="max-sm:hidden">
              <AvatarStack names={b.members.map((m) => m.full_name)} />
            </span>
            {!b.hasProfessor && <span className="rounded bg-muted px-1.5 py-0.5 max-sm:hidden">Solo: no professor on this project yet</span>}
            <span className="flex items-center gap-2 max-sm:flex-1">
              <ProgressBar value={b.progress} className="w-28 max-sm:w-auto max-sm:flex-1" tone={b.progress === 1 ? "success" : "primary"} />
              <span className="font-mono tabular">{percent(b.progress)}%</span>
            </span>
            <span className="tabular max-sm:hidden">
              {open} open · {done} done
            </span>
            {nextProfessorDeadline && (
              <span className="flex items-center gap-1.5">
                <span className="max-sm:hidden">Next professor deadline</span> <DeadlineChip date={nextProfessorDeadline} today={today} kind="professor" />
              </span>
            )}
            {project.target_end_date && (
              <span className="max-sm:hidden">
                Target end <span className="font-mono">{formatDay(project.target_end_date)}</span>
                {daysLeft !== null && daysLeft >= 0 && ` · ${daysLeft} days`}
              </span>
            )}
          </div>
        </div>
        <ProjectSettings project={project} members={b.members} people={people ?? []} isProfessor={b.myRole === "professor"} />
      </header>
      <ProjectTabs projectId={project.id} counts={{ tasks: open, blockers: counts[0].count ?? 0, remarks: counts[1].count ?? 0 }} unlocked={[...unlockedTabs]} />
      {children}
    </div>
  );
}
