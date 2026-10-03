import Link from "next/link";
import { cn } from "cn";
import { RemarkThread } from "@/components/remarks/remark-thread";
import { isAiEnabled } from "@/lib/ai/remark-to-tasks";
import { getProjectBundle } from "@/lib/data/project";
import { loadRemarkThreads } from "@/lib/data/remarks";

export default async function ProjectRemarksPage({ params, searchParams }: PageProps<"/projects/[projectId]/remarks">) {
  const { projectId } = await params;
  const { filter } = await searchParams;
  const b = await getProjectBundle(projectId);
  const all = await loadRemarkThreads(b.supabase, projectId);
  const openOnly = filter === "open";
  const isOpen = (r: (typeof all)[number]) => (r.kind === "change_request" || r.kind === "question") && !r.addressed_at;
  const remarks = (openOnly ? all.filter(isOpen) : all).slice().reverse();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-xs">
          {[
            { key: "all", label: `All (${all.length})`, href: `/projects/${projectId}/remarks` },
            { key: "open", label: `Needs response (${all.filter(isOpen).length})`, href: `/projects/${projectId}/remarks?filter=open` },
          ].map((f) => (
            <Link
              key={f.key}
              href={f.href}
              className={cn("rounded px-2.5 py-1", (f.key === "open") === openOnly ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <p className="ml-auto text-xs text-muted-foreground">Newest first. Remarks on tasks also appear on the task.</p>
      </div>
      <RemarkThread remarks={remarks} projectId={projectId} viewerRole={b.myRole} today={b.today} aiEnabled={isAiEnabled()} showTaskLinks />
    </div>
  );
}
