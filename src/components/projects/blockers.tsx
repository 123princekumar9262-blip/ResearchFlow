"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, Loader2, OctagonAlert, Plus, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/common/ui-bits";
import { useServerAction } from "@/components/common/use-server-action";
import { raiseBlocker, reopenBlocker, resolveBlocker } from "@/server/actions/blockers";
import type { Blocker, BlockerSeverity } from "@/types/database";

const SEVERITY: Record<BlockerSeverity, string> = {
  high: "text-danger border-danger/40 bg-danger/5",
  medium: "text-warning border-warning/40 bg-warning/5",
  low: "text-muted-foreground border-border",
};

export function RaiseBlockerForm({ projectId, tasks, isStudent }: { projectId: string; tasks: { id: string; title: string }[]; isStudent: boolean }) {
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<BlockerSeverity>("medium");
  const [needsProfessor, setNeedsProfessor] = useState(false);
  const { pending, run } = useServerAction();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus /> Raise a blocker
      </Button>
    );
  }

  return (
    <form
      action={(form) =>
        run(
          () =>
            raiseBlocker({
              projectId,
              taskId: String(form.get("taskId") ?? ""),
              title: String(form.get("title") ?? ""),
              description: String(form.get("description") ?? ""),
              severity,
              needsProfessor,
            }),
          { onSuccess: () => setOpen(false) },
        )
      }
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="bl-title">What&apos;s blocking you?</Label>
        <Input id="bl-title" name="title" required maxLength={200} autoFocus placeholder="Oscilloscope current probe broken in the lab" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bl-desc">Details</Label>
        <Textarea id="bl-desc" name="description" rows={2} placeholder="What you tried, what you need" />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Severity</Label>
          <div className="inline-flex rounded-md border p-0.5" role="radiogroup">
            {(["low", "medium", "high"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={severity === s}
                onClick={() => setSeverity(s)}
                className={cn("rounded px-2.5 py-1 text-xs capitalize", severity === s ? "bg-accent font-medium" : "text-muted-foreground")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="bl-task">Blocks task</Label>
          <select id="bl-task" name="taskId" className="h-8 w-full rounded-md border bg-transparent px-2 text-sm">
            <option value="">No specific task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {isStudent && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={needsProfessor} onCheckedChange={(v) => setNeedsProfessor(v === true)} /> I need my professor to unblock this
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Raise blocker
        </Button>
      </div>
    </form>
  );
}

export function BlockerCard({
  blocker,
  raisedBy,
  resolvedBy,
  task,
  ageDays,
}: {
  blocker: Blocker;
  raisedBy: string;
  resolvedBy: string | null;
  task?: { id: string; title: string };
  ageDays: number;
}) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  const { pending, run } = useServerAction();
  const open = blocker.status === "open";

  return (
    <li id={`blocker-${blocker.id}`} className={cn("scroll-mt-20 rounded-xl border bg-card p-4 target:ring-2 target:ring-primary/40", !open && "opacity-75")}>
      <div className="flex items-start gap-3">
        {open ? <OctagonAlert className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{blocker.title}</p>
            <span className={cn("rounded border px-1.5 text-[11px] capitalize", SEVERITY[blocker.severity])}>{blocker.severity}</span>
            {blocker.needs_professor && open && <span className="rounded bg-info/10 px-1.5 text-[11px] text-info">needs professor</span>}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <UserAvatar name={raisedBy} className="size-4 text-[8px] ring-0" /> {raisedBy} · {open ? `open ${ageDays}d` : `resolved by ${resolvedBy ?? "someone"}`}
            {task && (
              <>
                {" "}
                · blocks{" "}
                <Link href={`/tasks/${task.id}`} className="hover:underline">
                  {task.title}
                </Link>
              </>
            )}
          </p>
          {blocker.description && <p className="mt-2 whitespace-pre-line">{blocker.description}</p>}
          {!open && blocker.resolution && (
            <p className="mt-2 rounded-md bg-success/5 px-3 py-2 text-sm">
              <span className="font-medium text-success">Resolution:</span> {blocker.resolution}
            </p>
          )}
          {open && resolving && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => resolveBlocker({ blockerId: blocker.id, resolution }), { onSuccess: () => setResolving(false) });
              }}
              className="mt-3 space-y-2"
            >
              <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2} placeholder="How was it resolved? The next person stuck here will thank you." autoFocus required />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setResolving(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={pending || !resolution.trim()}>
                  {pending && <Loader2 className="animate-spin" />} Mark resolved
                </Button>
              </div>
            </form>
          )}
        </div>
        {open && !resolving && (
          <Button size="sm" variant="outline" onClick={() => setResolving(true)}>
            Resolve
          </Button>
        )}
        {!open && (
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => reopenBlocker({ blockerId: blocker.id }))}>
            <RotateCcw /> Reopen
          </Button>
        )}
      </div>
    </li>
  );
}
