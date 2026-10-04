"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, CircleSlash, Loader2, Pencil, Play, RotateCcw, Send, Trash2, Undo2, X } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusIcon } from "@/components/common/status";
import { useServerAction } from "@/components/common/use-server-action";
import { DeadlinePicker } from "@/components/common/deadline-picker";
import { Lock as LockGlyph } from "@/components/common/deadline-chip";
import { addDependency, deleteTask, removeDependency, reviewTask, setTaskStatus, updateTask } from "@/server/actions/tasks";
import type { Task, TaskPriority, TaskStatus } from "@/types/database";

/**
 * The status panel answers "what can I do with this task now?", and when the
 * answer is "nothing yet", says why.
 */
export function TaskStatusPanel({
  task,
  isProfessor,
  hasProfessor,
  evidenceCount,
  openDependencies,
  logHref,
  compact = false,
}: {
  task: Pick<Task, "id" | "status" | "requires_review">;
  /** Where "Link a log" goes when evidence is missing (students). */
  logHref?: string;
  isProfessor: boolean;
  hasProfessor: boolean;
  evidenceCount: number;
  openDependencies: string[];
  /** The phone action bar: the main action and why it's blocked, nothing else. */
  compact?: boolean;
}) {
  const { pending, run } = useServerAction();
  const go = (status: TaskStatus) => {
    // Submitting and closing can be undone for 10 seconds.
    const back: TaskStatus = task.status === "changes_requested" ? "in_progress" : task.status;
    if (status !== "in_review" && status !== "done") return run(() => setTaskStatus({ taskId: task.id, status }));
    run(() => setTaskStatus({ taskId: task.id, status }), {
      success: "",
      onSuccess: () =>
        toast.success(status === "in_review" ? "Submitted for review" : "Marked done", {
          duration: 10_000,
          action: { label: "Undo", onClick: () => run(() => setTaskStatus({ taskId: task.id, status: back }), { success: "Undone" }) },
        }),
    });
  };
  const closeLabel = task.requires_review ? "Submit for review" : "Mark done";
  const closeStatus: TaskStatus = task.requires_review ? "in_review" : "done";
  const blockedReason =
    evidenceCount === 0
      ? null
      : openDependencies.length > 0
        ? `Finish ${openDependencies.length === 1 ? `"${openDependencies[0]}"` : `${openDependencies.length} dependencies`} first.`
        : null;

  if (isProfessor) {
    const where: Record<TaskStatus, string> = {
      todo: "Not started yet.",
      in_progress: "The student is working on it.",
      changes_requested: "Sent back with your remarks. Waiting for the student to resubmit.",
      in_review: "Waiting for your review.",
      done: task.requires_review ? "Approved and closed." : "Closed.",
    };
    return (
      <div className="space-y-2">
        <p className={cn("text-sm", task.status === "done" ? "text-success" : "text-muted-foreground")}>{where[task.status]}</p>
        {task.status === "done" && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => go("in_progress")} disabled={pending}>
            <RotateCcw /> Reopen
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {task.status === "todo" && (
        <Button className="w-full" onClick={() => go("in_progress")} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Play />} Start working
        </Button>
      )}

      {(task.status === "in_progress" || task.status === "changes_requested") && (
        <>
          {task.status === "changes_requested" && !compact && (
            <p data-tour="changes-requested" className="rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">
              Your professor requested changes. Address each remark, then submit again.{" "}
              <a href="#activity" className="font-medium underline-offset-2 hover:underline">
                See remarks
              </a>
            </p>
          )}
          <Button className="w-full" onClick={() => go(closeStatus)} disabled={pending || !!blockedReason || evidenceCount === 0}>
            {pending ? <Loader2 className="animate-spin" /> : task.requires_review ? <Send /> : <Check />} {closeLabel}
          </Button>
          {evidenceCount === 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/30 bg-warning/[0.06] px-2.5 py-2 text-xs">
              <span>
                <b className="font-semibold">Add evidence first.</b> Link today&apos;s log or attach a file. Professors approve proof, not claims.
              </span>
              {logHref && (
                <Link href={logHref} className="font-medium text-primary hover:underline">
                  Link a log
                </Link>
              )}
            </p>
          )}
          {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
          {task.status === "in_progress" && !compact && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => go("todo")} disabled={pending}>
              <Undo2 /> Back to To do
            </Button>
          )}
        </>
      )}

      {task.status === "in_review" && !isProfessor && (
        <>
          <p className="rounded-md bg-info/5 px-3 py-2 text-xs text-info">
            {hasProfessor ? "Waiting for your professor's review." : "Under review."} You can withdraw it to keep working.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => go("in_progress")} disabled={pending}>
            <Undo2 /> Withdraw from review
          </Button>
        </>
      )}

      {task.status === "done" && (
        <>
          <p className="flex items-center gap-1.5 text-success">
            <StatusIcon status="done" /> {task.requires_review ? "Approved and closed" : "Closed"}
          </p>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => go("in_progress")} disabled={pending}>
            <RotateCcw /> Reopen
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * The professor's verdict. With `keyboard`, A approves and R starts a change
 * request; after a verdict `nextHref` (if any) loads the next submission.
 */
export function ReviewPanel({ taskId, keyboard, nextHref }: { taskId: string; keyboard?: boolean; nextHref?: string | null }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const box = useRef<HTMLTextAreaElement>(null);
  const { pending, run } = useServerAction();
  const done = () => {
    setComment("");
    setMode("idle");
    if (nextHref) router.push(nextHref);
  };
  const approve = () => run(() => reviewTask({ taskId, approve: true, comment }), { onSuccess: done });
  const requestChanges = () => {
    if (!comment.trim()) {
      setMode("changes");
      box.current?.focus();
      return;
    }
    run(() => reviewTask({ taskId, approve: false, comment }), { onSuccess: done });
  };

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || document.querySelector("[role=dialog]")) return;
      if (e.key === "a") {
        e.preventDefault();
        approve();
      } else if (e.key === "r") {
        e.preventDefault();
        setMode("changes");
        box.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-2 rounded-xl border border-info/30 bg-info/[0.04] p-3">
      <p className="text-sm font-medium">Your review</p>
      <p className="text-xs text-muted-foreground">Check the evidence. Approving closes the task and any change requests on it.</p>
      <Textarea
        ref={box}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (mode === "changes") requestChanges();
            else approve();
          }
        }}
        rows={3}
        placeholder={mode === "changes" ? "What needs to change? Be specific; this becomes their to-do." : "Optional comment"}
        aria-label="Review comment"
      />
      <div className="flex gap-2">
        <Button className="flex-1" disabled={pending} onClick={approve}>
          <Check /> Approve {keyboard && <kbd className="border-white/25 bg-white/15 text-inherit">A</kbd>}
        </Button>
        <Button variant="outline" className="flex-1" disabled={pending} onClick={requestChanges}>
          <CircleSlash /> Request changes {keyboard && <kbd>R</kbd>}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, locked }: { label: string; children: React.ReactNode; locked?: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-1.5">
      <span className="flex items-center gap-1 text-xs text-muted-foreground" title={locked}>
        {label}
        {locked && <LockGlyph className="opacity-80" />}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const selectClass =
  "h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-input focus-visible:border-ring focus-visible:outline-none disabled:opacity-60 disabled:hover:border-transparent";

/** Inline-editable properties; each change saves immediately. */
export function TaskFields({
  task,
  members,
  milestones,
  canSetProfessorDeadline,
  isProfessor,
  today,
  load,
  extensionSlot,
}: {
  task: Task;
  members: { user_id: string; full_name: string; role: string }[];
  milestones: { id: string; title: string; due_date: string | null }[];
  canSetProfessorDeadline: boolean;
  isProfessor: boolean;
  today: string;
  load?: Record<string, number>;
  /** "Request extension" control, rendered under a locked professor deadline. */
  extensionSlot?: React.ReactNode;
}) {
  const { pending, run } = useServerAction();
  const save = (patch: Parameters<typeof updateTask>[0]) => run(() => updateTask(patch));
  const students = members.filter((m) => m.role === "student");
  const markers = { milestones: milestones.flatMap((m) => (m.due_date ? [{ date: m.due_date, title: m.title }] : [])), load };

  return (
    <div className={cn("divide-y", pending && "opacity-70")}>
      <Field label="Assignee">
        <select className={selectClass} value={task.assignee_id ?? ""} onChange={(e) => save({ taskId: task.id, assigneeId: e.target.value })}>
          <option value="">Unassigned</option>
          {students.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Priority">
        <select className={selectClass} value={task.priority} onChange={(e) => save({ taskId: task.id, priority: e.target.value as TaskPriority })}>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </Field>
      <Field label="Prof deadline" locked={canSetProfessorDeadline ? undefined : "Only your professor can move this"}>
        <div className="grid gap-1">
          <DeadlinePicker
            kind="professor"
            value={task.professor_deadline}
            onChange={(d) => save({ taskId: task.id, professorDeadline: d ?? "" })}
            today={today}
            markers={markers}
            disabled={!canSetProfessorDeadline}
            placeholder={canSetProfessorDeadline ? "None" : "Not set"}
            className="h-8 border-transparent shadow-none hover:border-input"
          />
          {extensionSlot}
        </div>
      </Field>
      {!isProfessor && (
        <Field label="My deadline">
          <DeadlinePicker
            value={task.personal_deadline}
            onChange={(d) => save({ taskId: task.id, personalDeadline: d ?? "" })}
            today={today}
            max={task.professor_deadline}
            markers={{ ...markers, professorDeadline: task.professor_deadline }}
            placeholder="Your own target"
            className="h-8 border-transparent shadow-none hover:border-input"
          />
        </Field>
      )}
      <Field label="Milestone">
        <select className={selectClass} value={task.milestone_id ?? ""} onChange={(e) => save({ taskId: task.id, milestoneId: e.target.value })}>
          <option value="">None</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Estimate (h)">
        <input
          type="number"
          min={0.5}
          step={0.5}
          className={selectClass}
          defaultValue={task.estimate_hours ?? ""}
          key={String(task.estimate_hours)}
          onBlur={(e) => e.target.value !== String(task.estimate_hours ?? "") && save({ taskId: task.id, estimateHours: e.target.value })}
          aria-label="Estimate in hours"
        />
      </Field>
      <Field label="Review">
        {isProfessor ? (
          <label className="flex items-center gap-2 px-1.5 text-sm">
            <input type="checkbox" checked={task.requires_review} onChange={(e) => save({ taskId: task.id, requiresReview: e.target.checked })} />
            Needs my approval
          </label>
        ) : (
          <span className="px-1.5 text-sm text-muted-foreground">{task.requires_review ? "Professor approves" : "You close it"}</span>
        )}
      </Field>
    </div>
  );
}

export function TaskTitleEditor({ task }: { task: Pick<Task, "id" | "title" | "description"> }) {
  const [editing, setEditing] = useState(false);
  const { pending, run } = useServerAction();
  if (!editing) {
    return (
      <div className="group">
        <h1 className="flex items-start gap-2 text-xl font-semibold tracking-tight">
          <span className="min-w-0 flex-1">{task.title}</span>
          <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditing(true)} aria-label="Edit title and description">
            <Pencil />
          </Button>
        </h1>
        {task.description ? (
          <p className="mt-2 whitespace-pre-line text-muted-foreground">{task.description}</p>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-2 text-muted-foreground/70 hover:text-muted-foreground">
            Add a description: what does done look like?
          </button>
        )}
      </div>
    );
  }
  return (
    <form
      action={(form) =>
        run(() => updateTask({ taskId: task.id, title: String(form.get("title")), description: String(form.get("description") ?? "") }), {
          onSuccess: () => setEditing(false),
        })
      }
      className="space-y-2"
    >
      <Input name="title" defaultValue={task.title} required maxLength={200} className="text-base font-semibold" autoFocus />
      <Textarea name="description" defaultValue={task.description} rows={5} placeholder="What does done look like?" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          <X /> Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Save
        </Button>
      </div>
    </form>
  );
}

export function DependencyEditor({
  taskId,
  dependsOn,
  blocking,
  candidates,
}: {
  taskId: string;
  dependsOn: { id: string; title: string; status: TaskStatus }[];
  blocking: { id: string; title: string; status: TaskStatus }[];
  candidates: { id: string; title: string }[];
}) {
  const { pending, run } = useServerAction();
  const available = candidates.filter((c) => c.id !== taskId && !dependsOn.some((d) => d.id === c.id));
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Depends on</p>
        {dependsOn.length === 0 && <p className="text-xs text-muted-foreground/70">Nothing. It can be submitted any time.</p>}
        <ul className="space-y-1">
          {dependsOn.map((d) => (
            <li key={d.id} className="group flex items-center gap-2">
              <StatusIcon status={d.status} />
              <Link href={`/tasks/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {d.title}
              </Link>
              <Button
                size="icon-xs"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove dependency on ${d.title}`}
                disabled={pending}
                onClick={() => run(() => removeDependency({ taskId, dependsOnId: d.id }))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
        {available.length > 0 && (
          <select
            className={cn(selectClass, "mt-1 border-dashed border-input text-muted-foreground")}
            value=""
            disabled={pending}
            onChange={(e) => e.target.value && run(() => addDependency({ taskId, dependsOnId: e.target.value }))}
            aria-label="Add a dependency"
          >
            <option value="">+ Add dependency…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {blocking.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Blocking</p>
          <ul className="space-y-1">
            {blocking.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <StatusIcon status={d.status} />
                <Link href={`/tasks/${d.id}`} className="truncate hover:underline">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DeleteTaskButton({ taskId, projectId }: { taskId: string; projectId: string }) {
  const router = useRouter();
  const { pending, run } = useServerAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full text-muted-foreground hover:text-danger"
      disabled={pending}
      onClick={() =>
        confirm("Delete this task? This can't be undone.") &&
        run(() => deleteTask({ taskId }), { onSuccess: () => router.push(`/projects/${projectId}/tasks`) })
      }
    >
      <Trash2 /> Delete task
    </Button>
  );
}
