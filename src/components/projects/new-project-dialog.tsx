"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/components/common/use-server-action";
import { createProject } from "@/server/actions/projects";

export type LinkedPerson = { id: string; full_name: string; role: "student" | "professor" };

export function NewProjectDialog({ people, today, role }: { people: LinkedPerson[]; today: string; role: "student" | "professor" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const [members, setMembers] = useState<string[]>(() => (role === "student" ? people.filter((p) => p.role === "professor").map((p) => p.id) : []));
  const { pending, run } = useServerAction();

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && params.get("new")) router.replace(pathname);
  };

  const submit = (form: FormData) => {
    run(
      () =>
        createProject({
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
          startDate: String(form.get("startDate") ?? today),
          targetEndDate: String(form.get("targetEndDate") ?? ""),
          memberIds: members,
        }),
      {
        onSuccess: (id) => {
          setOpen(false);
          router.push(`/projects/${id}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Milestones and tasks come next. Keep the description to the research question.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="np-title">Title</Label>
            <Input id="np-title" name="title" required maxLength={200} placeholder="Structured pruning for GNNs" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-desc">Description</Label>
            <Textarea id="np-desc" name="description" rows={3} placeholder="Research question, scope, expected outcome…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-start">Start</Label>
              <Input id="np-start" name="startDate" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-end">Target end</Label>
              <Input id="np-end" name="targetEndDate" type="date" min={today} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Members</legend>
            {people.length === 0 ? (
              <p className="text-muted-foreground">
                {role === "student"
                  ? "No linked professor yet. You can work solo and add them later from the project."
                  : "No linked students yet. Share your join code from the dashboard."}
              </p>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                {people.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent">
                    <Checkbox
                      checked={members.includes(p.id)}
                      onCheckedChange={(v) => setMembers(v === true ? [...members, p.id] : members.filter((m) => m !== p.id))}
                    />
                    <span className="flex-1">{p.full_name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{p.role}</span>
                  </label>
                ))}
              </div>
            )}
            {role === "student" && people.some((p) => p.role === "professor") && (
              <p className="text-xs text-muted-foreground">With a professor on the project, they own professor deadlines and approve tasks.</p>
            )}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
