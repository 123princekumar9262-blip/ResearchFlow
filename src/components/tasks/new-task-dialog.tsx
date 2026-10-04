"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DeadlinePicker } from "@/components/common/deadline-picker";
import { useServerAction } from "@/components/common/use-server-action";
import { createTask } from "@/server/actions/tasks";
import { ChapterTrigger } from "@/components/onboarding/tips";
import { useOnboardingMaybe } from "@/components/onboarding/provider";

const NONE = "";

function NativeSelect(props: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
    />
  );
}

export function NewTaskDialog({
  projectId,
  milestones,
  members,
  me,
  today,
  canSetProfessorDeadline,
  defaultMilestoneId,
  load,
}: {
  projectId: string;
  milestones: { id: string; title: string; due_date?: string | null }[];
  members: { user_id: string; full_name: string; role: string }[];
  me: string;
  today: string;
  canSetProfessorDeadline: boolean;
  defaultMilestoneId?: string;
  /** Tasks already due per day, shown as dots in the deadline picker. */
  load?: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profDeadline, setProfDeadline] = useState<string | null>(null);
  const [personalDeadline, setPersonalDeadline] = useState<string | null>(null);
  const markers = { milestones: milestones.flatMap((m) => (m.due_date ? [{ date: m.due_date, title: m.title }] : [])), load };
  const { pending, run } = useServerAction();
  const onboarding = useOnboardingMaybe();
  // "No deadline set" (spec Phase 07): asked the first three times a task has no deadline.
  const [held, setHeld] = useState<{ form: FormData; again: boolean; el: HTMLFormElement } | null>(null);
  const students = members.filter((m) => m.role === "student");
  const iAmProfessor = members.some((m) => m.user_id === me && m.role === "professor");
  const defaultAssignee = students.some((s) => s.user_id === me) ? me : students.length === 1 ? students[0].user_id : NONE;

  // "c" opens the dialog, Linear-style, when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "c" || e.metaKey || e.ctrlKey || el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = (el: HTMLFormElement, data: FormData, again: boolean) => {
    submit(data, again);
    if (again) {
      el.reset();
      setProfDeadline(null);
      setPersonalDeadline(null);
      (el.elements.namedItem("title") as HTMLInputElement)?.focus();
    }
  };

  const submit = (form: FormData, again: boolean) =>
    run(
      () =>
        createTask({
          projectId,
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
          milestoneId: String(form.get("milestoneId") ?? ""),
          assigneeId: String(form.get("assigneeId") ?? ""),
          priority: String(form.get("priority") ?? "medium") as "medium",
          professorDeadline: canSetProfessorDeadline ? (profDeadline ?? "") : "",
          personalDeadline: personalDeadline ?? "",
          estimateHours: String(form.get("estimateHours") ?? ""),
        }),
      {
        onSuccess: (id) => {
          if (again) return;
          setOpen(false);
          router.push(`/tasks/${id}`);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-tour="new-task">
          <Plus /> New task <kbd className="ml-1 border-white/20 bg-white/10 text-inherit">C</kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" data-tour="new-task-dialog">
        <ChapterTrigger tour="tasks" part="tasks-dialog" inDialog />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const again = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "again";
            const form = e.currentTarget;
            const hints = onboarding?.state.hints ?? 0;
            if (onboarding && !iAmProfessor && !profDeadline && !personalDeadline && hints < 3 && !held) {
              onboarding.update({ hints: hints + 1 });
              setHeld({ form: new FormData(form), again, el: form });
              return;
            }
            setHeld(null);
            send(form, new FormData(form), again);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.requestSubmit();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Small enough to finish in a few days, specific enough to know when it&apos;s done.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="nt-title">Title</Label>
            <Input id="nt-title" name="title" required maxLength={200} autoFocus placeholder="Run baseline on Cora with 5 seeds" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nt-desc">Description</Label>
            <Textarea id="nt-desc" name="description" rows={3} placeholder="What does done look like?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nt-ms">Milestone</Label>
              <NativeSelect id="nt-ms" name="milestoneId" defaultValue={defaultMilestoneId ?? NONE}>
                <option value={NONE}>None</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nt-as">Assignee</Label>
              <NativeSelect id="nt-as" name="assigneeId" defaultValue={defaultAssignee}>
                <option value={NONE}>Unassigned</option>
                {students.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5" data-tour="nt-prof-deadline">
              <Label htmlFor="nt-pd" className="flex items-center gap-1">
                Professor deadline {!canSetProfessorDeadline && <Lock className="size-3" />}
              </Label>
              <DeadlinePicker
                id="nt-pd"
                kind="professor"
                value={profDeadline}
                onChange={(d) => {
                  setProfDeadline(d);
                  if (d && personalDeadline && personalDeadline > d) setPersonalDeadline(d);
                }}
                today={today}
                markers={markers}
                disabled={!canSetProfessorDeadline}
                placeholder={canSetProfessorDeadline ? "None" : "Set by your professor"}
              />
            </div>
            {!iAmProfessor && (
              <div className="space-y-1.5" data-tour="nt-my-deadline">
                <Label htmlFor="nt-md">Your deadline</Label>
                <DeadlinePicker
                  id="nt-md"
                  value={personalDeadline}
                  onChange={setPersonalDeadline}
                  today={today}
                  max={profDeadline}
                  markers={{ ...markers, professorDeadline: profDeadline }}
                  placeholder="Your own target"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="nt-pr">Priority</Label>
              <NativeSelect id="nt-pr" name="priority" defaultValue="medium">
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nt-est">Estimate (hours)</Label>
              <Input id="nt-est" name="estimateHours" type="number" min={0.5} step={0.5} max={999} placeholder="e.g. 6" />
            </div>
          </div>
          {!canSetProfessorDeadline && (
            <p className="text-xs text-muted-foreground">Your professor sets professor deadlines. Set your own earlier target so you finish with a buffer.</p>
          )}
          {held && !profDeadline && !personalDeadline && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-[12.5px]"
            >
              <span className="min-w-0 flex-[1_1_14rem]">
                <b className="font-semibold">No deadline set.</b> Tasks without deadlines drift. Add one, even a rough one.
              </span>
              <Button type="button" size="xs" variant="outline" onClick={() => document.getElementById(canSetProfessorDeadline ? "nt-pd" : "nt-md")?.click()}>
                Add deadline
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const h = held;
                  setHeld(null);
                  send(h.el, h.form, h.again);
                }}
              >
                Create anyway
              </button>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" variant="ghost" value="again" disabled={pending}>
              Create &amp; add another
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
