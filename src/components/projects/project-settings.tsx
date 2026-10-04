"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2, Trash2, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/common/ui-bits";
import { useServerAction } from "@/components/common/use-server-action";
import { addProjectMember, deleteProject, removeProjectMember, updateProject } from "@/server/actions/projects";
import type { Project, ProjectStatus } from "@/types/database";
import type { LinkedPerson } from "./new-project-dialog";

export function ProjectSettings({
  project,
  members,
  people,
  isProfessor,
  canDelete = false,
}: {
  project: Project;
  members: { user_id: string; full_name: string; role: string }[];
  people: LinkedPerson[];
  isProfessor: boolean;
  /** The project's creator can delete it. */
  canDelete?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const save = useServerAction();
  const member = useServerAction();
  const candidates = people.filter((p) => !members.some((m) => m.user_id === p.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Project settings">
          <Settings2 /> <span className="max-sm:hidden">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          action={(form) =>
            save.run(
              () =>
                updateProject({
                  projectId: project.id,
                  title: String(form.get("title")),
                  description: String(form.get("description") ?? ""),
                  status,
                  targetEndDate: String(form.get("targetEndDate") ?? ""),
                }),
              { onSuccess: () => setOpen(false) },
            )
          }
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Project settings</DialogTitle>
            <DialogDescription>Archive a project to hide it and keep its record. Delete it only if you want it gone for good.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ps-title">Title</Label>
            <Input id="ps-title" name="title" defaultValue={project.title} required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-desc">Description</Label>
            <Textarea id="ps-desc" name="description" defaultValue={project.description} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-end">Target end</Label>
              <Input id="ps-end" name="targetEndDate" type="date" defaultValue={project.target_end_date ?? ""} min={project.start_date} />
            </div>
          </div>

          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-medium">Members</p>
            <ul className="space-y-1">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2">
                  <UserAvatar name={m.full_name} />
                  <span className="flex-1">{m.full_name}</span>
                  <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                  {isProfessor && m.role === "student" && (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove ${m.full_name}`}
                      disabled={member.pending}
                      onClick={() => member.run(() => removeProjectMember({ projectId: project.id, userId: m.user_id }))}
                    >
                      <UserMinus />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {candidates.length > 0 && (
              <div className="space-y-1 rounded-md border border-dashed p-2">
                <p className="text-xs text-muted-foreground">Add someone you&apos;re linked with</p>
                {candidates.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="flex-1">{p.full_name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{p.role}</span>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={member.pending}
                      onClick={() => member.run(() => addProjectMember({ projectId: project.id, userId: p.id }))}
                    >
                      <UserPlus /> Add
                    </Button>
                  </div>
                ))}
                {candidates.some((c) => c.role === "professor") && !members.some((m) => m.role === "professor") && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    Adding your professor hands them the professor deadlines and makes your open tasks need their approval.
                  </p>
                )}
              </div>
            )}
          </div>

          {canDelete && (
            <>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-[1_1_14rem]">
                  <p className="text-sm font-medium">Delete project</p>
                  <p className="text-xs text-muted-foreground">Removes the project and everything in it, for every member.</p>
                </div>
                <DeleteProjectButton project={project} onDeleted={() => setOpen(false)} />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" disabled={save.pending}>
              {save.pending && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Asks once, with the project's name typed back, before deleting it for good. */
function DeleteProjectButton({ project, onDeleted }: { project: Project; onDeleted: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const { pending, run } = useServerAction();
  const matches = typed.trim().toLowerCase() === project.title.trim().toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="border-danger/40 text-danger hover:bg-danger/5 hover:text-danger">
          <Trash2 /> Delete project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // This dialog sits inside the settings form in React's tree; keep its submit to itself.
            e.stopPropagation();
            if (!matches) return;
            run(() => deleteProject({ projectId: project.id, confirmTitle: typed }), {
              onSuccess: () => {
                setOpen(false);
                onDeleted();
                router.replace("/dashboard");
              },
            });
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              This permanently deletes <b className="font-semibold text-foreground">{project.title}</b> and everything in it: milestones, tasks, logs, files,
              feedback, blockers and decisions. Every member loses it. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Want to keep the record? Close this and set <b className="font-medium text-foreground">Status</b> to <b className="font-medium text-foreground">Archived</b> instead.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Type <b className="font-semibold">{project.title}</b> to confirm
            </Label>
            <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder={project.title} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
