import Link from "next/link";
import { Suspense } from "react";
import { FolderKanban } from "lucide-react";
import { cn } from "cn";
import { AvatarStack, EmptyState, PageHeader, ProgressBar } from "@/components/common/ui-bits";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { getWorkspace } from "@/lib/data/workspace";
import { formatDay } from "@/lib/domain/dates";
import { percent, projectProgress } from "@/lib/domain/progress";

export const metadata = { title: "Projects" };

const STATUS_LABEL = { active: "Active", on_hold: "On hold", completed: "Completed", archived: "Archived" } as const;

export default async function ProjectsPage() {
  const ws = await getWorkspace();
  const { supabase, today, profile } = ws;
  const { data: people } = await supabase.rpc("linked_people");

  const projects = [...ws.allProjects].sort((a, b) => {
    const order = { active: 0, on_hold: 1, completed: 2, archived: 3 };
    return order[a.status] - order[b.status] || b.updated_at.localeCompare(a.updated_at);
  });

  return (
    <>
      <PageHeader inTopBar
        title="Projects"
        description="Each project is a contract: milestones, deadlines with owners, and a record of the work."
        actions={
          <Suspense>
            <NewProjectDialog people={people ?? []} today={today} role={profile.role} />
          </Suspense>
        }
      />

      {projects.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={FolderKanban} title="No projects yet">
            {profile.role === "professor"
              ? "Create a project and add the students working on it, or wait for a student to add you to theirs."
              : "Create your first project. You can add your professor once you're linked."}
          </EmptyState>
        </div>
      ) : (
        <ul className="rf-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const tasks = ws.tasks.filter((t) => t.project_id === p.id);
            const milestones = ws.milestones.filter((m) => m.project_id === p.id);
            const progress = projectProgress(tasks, milestones);
            const members = ws.members.filter((m) => m.project_id === p.id);
            const late = tasks.filter((t) => t.status !== "done" && t.effective_deadline && t.effective_deadline < today).length;
            const nextProf = tasks
              .filter((t) => t.status !== "done" && t.professor_deadline && t.professor_deadline >= today)
              .map((t) => t.professor_deadline!)
              .sort()[0];
            const reviews = tasks.filter((t) => t.status === "in_review").length;
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className={cn(
                    "rf-lift flex h-full flex-col rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] hover:border-primary/40",
                    p.status === "archived" && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 font-medium">{p.title}</h2>
                    <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">{STATUS_LABEL[p.status]}</span>
                  </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-muted-foreground">{p.description}</p>}
                  <div className="mt-auto pt-4">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={progress} tone={progress === 1 ? "success" : "primary"} />
                      <span className="font-mono text-xs tabular">{percent(progress)}%</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <AvatarStack names={members.map((m) => m.full_name)} />
                      <span className="tabular">
                        {tasks.filter((t) => t.status === "done").length}/{tasks.length} tasks
                      </span>
                      {late > 0 && <span className="text-danger">{late} overdue</span>}
                      {reviews > 0 && <span className="text-info">{reviews} in review</span>}
                      <span className="ml-auto">{nextProf ? <DeadlineChip date={nextProf} today={today} kind="professor" /> : p.target_end_date ? `ends ${formatDay(p.target_end_date)}` : null}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
