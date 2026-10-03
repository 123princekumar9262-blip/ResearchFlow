import { Upload } from "lucide-react";
import { AttachmentList } from "@/components/files/attachment-list";
import { EvidenceUploader } from "@/components/files/evidence-uploader";
import { Section } from "@/components/common/ui-bits";
import { getProjectBundle } from "@/lib/data/project";
import { formatShortDate } from "@/lib/domain/dates";

/** Uploaders may remove their own files for 24 hours (the database enforces the same window). */
function withinRemovalWindow(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 24 * 3600_000;
}

export default async function ProjectFilesPage({ params }: PageProps<"/projects/[projectId]/files">) {
  const { projectId } = await params;
  const b = await getProjectBundle(projectId);
  const { data } = await b.supabase
    .from("attachments")
    .select("*, log:progress_logs!attachments_progress_log_id_fkey(log_date)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const names = new Map(b.members.map((m) => [m.user_id, m.full_name]));
  const taskTitle = new Map(b.tasks.map((t) => [t.id, t]));
  const files = (data ?? []).map(({ log, ...a }) => {
    const task = a.task_id ? taskTitle.get(a.task_id) : undefined;
    return {
      ...a,
      uploaderName: names.get(a.uploader_id),
      context: task ? `on ${task.title}` : log ? `log ${formatShortDate(log.log_date)}` : undefined,
      canDelete:
        a.uploader_id === b.userId && withinRemovalWindow(a.created_at) && !(task && (task.status === "done" || task.status === "in_review")),
    };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Section icon={Upload} title="Upload to this project" bodyClassName="p-4 space-y-2">
        <p className="text-muted-foreground">
          Files attached here aren&apos;t evidence for a specific task. To count as evidence, attach from the task page or a log entry. Max 50 MB; link
          to anything bigger.
        </p>
        <EvidenceUploader projectId={projectId} target={{}} />
      </Section>
      <AttachmentList attachments={files} empty="No files or links yet." />
      <p className="text-xs text-muted-foreground">
        Uploads can be removed by their uploader within 24 hours, unless they&apos;re evidence on a task under review or done.
      </p>
    </div>
  );
}
