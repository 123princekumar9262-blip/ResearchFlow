"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CircleAlert, CircleCheck, Loader2, Plus, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/components/common/use-server-action";
import { EvidenceUploader } from "@/components/files/evidence-uploader";
import { addDays, formatDay, formatMinutes, parseDuration } from "@/lib/domain/dates";
import { saveLog } from "@/server/actions/logs";
import { useLocalStorage } from "@/components/common/use-local-storage";

export type LogDraftSource = {
  id: string;
  project_id: string;
  log_date: string;
  completed_work: string;
  problems: string;
  next_steps: string;
  minutes_spent: number;
  taskIds: string[];
};

const QUICK_MINUTES = [30, 60, 120];
type Draft = { completed: string; problems: string; nextSteps: string; minutes: number; taskIds: string[] };
const draftKey = (projectId: string, date: string) => `rf.logdraft.${projectId}.${date}`;

function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

/**
 * The daily ritual: three prompts, time, linked tasks, evidence. Re-opening a
 * day you already logged edits that entry (one per project per day). Drafts
 * are kept on this device until saved.
 */
export function LogForm({
  projects,
  tasksByProject,
  existing,
  today,
  defaultProjectId,
  defaultTaskIds = [],
  defaultMinutes,
  defaultCompleted,
  previousPlans,
  touchedToday,
  variant = "page",
  onSaved,
}: {
  projects: { id: string; title: string }[];
  tasksByProject: Record<string, { id: string; title: string; status: string }[]>;
  existing: LogDraftSource[];
  today: string;
  defaultProjectId?: string;
  defaultTaskIds?: string[];
  defaultMinutes?: number;
  /** Text to start "What did you complete?" with (focus-session notes). */
  defaultCompleted?: string;
  /** Per project: the latest earlier log's "next steps", offered as today's starting point. */
  previousPlans: Record<string, { date: string; text: string }>;
  /** Tasks whose status you changed today, suggested first. */
  touchedToday: string[];
  /** "sheet": inside the slide-over, which supplies its own frame. */
  variant?: "page" | "sheet";
  onSaved?: () => void;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [logDate, setLogDate] = useState(today);
  const current = useMemo(() => existing.find((e) => e.project_id === projectId && e.log_date === logDate), [existing, projectId, logDate]);
  const formRef = useRef<HTMLFormElement>(null);

  const [completed, setCompleted] = useState("");
  const [problems, setProblems] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [minutes, setMinutes] = useState(0);
  // What's typed in the time field, until it loses focus; null shows the parsed value.
  const [timeText, setTimeText] = useState<string | null>(null);
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [usedPlan, setUsedPlan] = useState(false);
  const { pending, run } = useServerAction();

  // Load the saved entry, else a local draft, else defaults, whenever the project or day changes.
  const key = `${projectId}:${logDate}:${current?.id ?? "new"}`;
  const [loadedKey, setLoadedKey] = useState("");
  if (loadedKey !== key) {
    setLoadedKey(key);
    const first = loadedKey === "";
    const notes = first && defaultCompleted ? defaultCompleted.trim() : "";
    setCompleted(current ? (notes && !current.completed_work.includes(notes) ? `${current.completed_work}
${notes}` : current.completed_work) : notes);
    setProblems(current?.problems ?? "");
    setNextSteps(current?.next_steps ?? "");
    setMinutes(current?.minutes_spent ?? (first && defaultMinutes ? defaultMinutes : 0));
    setTaskIds(current?.taskIds ?? (first ? defaultTaskIds.filter((t) => (tasksByProject[projectId] ?? []).some((x) => x.id === t)) : []));
    setUsedPlan(false);
  }

  // A draft kept on this device for a day with no saved entry yet; offered, never forced in.
  const [rawDraft, setRawDraft] = useLocalStorage(draftKey(projectId, logDate));
  const draft = useMemo(() => parseDraft(rawDraft), [rawDraft]);
  const formEmpty = !completed && !problems && !nextSteps;
  const canRestore = !current && formEmpty && draft !== null && Boolean(draft.completed || draft.problems || draft.nextSteps);
  const restore = () => {
    if (!draft) return;
    setCompleted(draft.completed);
    setProblems(draft.problems);
    setNextSteps(draft.nextSteps);
    setMinutes((m) => m || draft.minutes);
    setTaskIds((t) => (t.length ? t : draft.taskIds));
  };

  // Autosave the draft while typing (unsaved entries only).
  useEffect(() => {
    if (current || formEmpty) return;
    const t = setTimeout(() => setRawDraft(JSON.stringify({ completed, problems, nextSteps, minutes, taskIds } satisfies Draft)), 1200);
    return () => clearTimeout(t);
  }, [completed, problems, nextSteps, minutes, taskIds, current, formEmpty, setRawDraft]);

  useEffect(() => {
    if (variant === "sheet") {
      formRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    } else if (window.location.hash === "#new") {
      formRef.current?.scrollIntoView({ block: "start" });
      formRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    }
  }, [variant]);

  const tasks = tasksByProject[projectId] ?? [];
  // A few suggestions, not a wall of chips; everything else is in "+ link task".
  const suggested = tasks.filter((t) => touchedToday.includes(t.id) && !taskIds.includes(t.id)).slice(0, 3);
  const days = [today, addDays(today, -1), addDays(today, -2)];
  const plan = previousPlans[projectId];
  const showPlan = plan && plan.date < logDate && !usedPlan && !current && !completed.includes(plan.text);

  const submit = () =>
    run(() => saveLog({ projectId, logDate, completedWork: completed, problems, nextSteps, minutesSpent: minutes, taskIds }), {
      onSuccess: () => {
        setRawDraft(null);
        // The product tour waits for the first entry (onboarding spec, core step 8).
        window.dispatchEvent(new Event("rf:log-saved"));
        onSaved?.();
      },
    });

  if (projects.length === 0) {
    return <p className="rounded-xl border bg-card p-4 text-muted-foreground">Create or join a project first; logs belong to a project.</p>;
  }

  return (
    <form
      id={variant === "page" ? "new" : undefined}
      ref={formRef}
      data-tour="log-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && completed.trim()) {
          e.preventDefault();
          submit();
        }
      }}
      className={cn(
        "space-y-3.5",
        variant === "page" && "scroll-mt-20 rounded-xl border border-primary/40 bg-card p-4 shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_8%,transparent)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-8 max-w-[14rem] rounded-md border bg-transparent px-2 text-[13px] font-semibold"
          aria-label="Project"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Day" data-tour="log-day">
          {days.map((d, i) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={logDate === d}
              onClick={() => setLogDate(d)}
              className={cn("rounded px-2.5 py-1 text-xs", logDate === d ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {i === 0 ? "Today" : i === 1 ? "Yesterday" : formatDay(d).slice(0, 6)}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-muted-foreground">{current ? "Editing your entry for this day" : "Older days are locked"}</span>
        {canRestore ? (
          <Button type="button" size="xs" variant="outline" className="ml-auto" onClick={restore}>
            Restore unsaved draft
          </Button>
        ) : (
          !current && !formEmpty && <span className="ml-auto text-[11.5px] text-muted-foreground">Draft kept on this device</span>
        )}
      </div>

      {showPlan && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg bg-muted px-3 py-2 text-[12.5px]">
          <span className="text-muted-foreground">{plan.date === addDays(logDate, -1) ? "Yesterday" : formatDay(plan.date)} you planned:</span>
          <span className="min-w-0 flex-[1_1_12rem] font-medium">&ldquo;{plan.text}&rdquo;</span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              setCompleted((c) => (c ? `${c}\n${plan.text}` : plan.text));
              setUsedPlan(true);
            }}
          >
            <Check /> Done, add to today
          </Button>
        </div>
      )}

      <div className="space-y-1.5" data-tour="log-done">
        <Label htmlFor="log-done" className="gap-1.5">
          <CircleCheck className="size-3.5 text-success" /> What did you complete?
        </Label>
        <Textarea
          id="log-done"
          value={completed}
          onChange={(e) => setCompleted(e.target.value)}
          rows={3}
          required
          placeholder="Simulated the boost converter in LTspice at 50 kHz: 92% efficiency at full load. Failed attempts count too."
        />
      </div>
      <div className="grid gap-3.5 md:grid-cols-2">
        <div className="space-y-1.5" data-tour="log-problems">
          <Label htmlFor="log-problems" className="gap-1.5">
            <CircleAlert className="size-3.5 text-warning" /> Problems or what failed
          </Label>
          <Textarea id="log-problems" value={problems} onChange={(e) => setProblems(e.target.value)} rows={2} placeholder="Output ripple 8% at light load; MOSFET above 60 °C" />
        </div>
        <div className="space-y-1.5" data-tour="log-next">
          <Label htmlFor="log-next" className="gap-1.5">
            <ArrowRight className="size-3.5 text-muted-foreground" /> Next steps
          </Label>
          <Textarea id="log-next" value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={2} placeholder="Try a larger output capacitor; check the gate-drive dead time" />
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-3.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <div className="space-y-1.5" data-tour="log-time">
          <Label htmlFor="log-time">Time spent</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              id="log-time"
              inputMode="text"
              autoComplete="off"
              value={timeText ?? (minutes ? formatMinutes(minutes) : "")}
              placeholder="2h 30m"
              onChange={(e) => {
                setTimeText(e.target.value);
                const parsed = parseDuration(e.target.value);
                if (parsed !== null) setMinutes(Math.min(1440, parsed));
              }}
              onBlur={() => setTimeText(null)}
              aria-invalid={timeText !== null && timeText.trim() !== "" && parseDuration(timeText) === null}
              className="h-8 w-28 font-mono"
            />
            {QUICK_MINUTES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setTimeText(null);
                  setMinutes(Math.min(1440, minutes + q));
                }}
                className="h-7 rounded-full border px-2 font-mono text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                +{q >= 60 ? `${q / 60}h` : `${q}m`}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-1.5" data-tour="log-evidence">
          <Label>Counts as evidence for</Label>
          <div className="flex flex-wrap gap-1.5">
            {taskIds.map((id) => {
              const t = tasks.find((x) => x.id === id);
              return (
                <span key={id} className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2 text-xs text-primary">
                  <span className="truncate">{t?.title ?? "Task"}</span>
                  <button type="button" onClick={() => setTaskIds(taskIds.filter((x) => x !== id))} aria-label={`Unlink ${t?.title ?? "task"}`}>
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            {suggested.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTaskIds([...taskIds, t.id])}
                className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-dashed px-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
                title="You worked on this today"
              >
                <Plus className="size-3 shrink-0" /> <span className="truncate">{t.title}</span>
              </button>
            ))}
            {tasks.filter((t) => !taskIds.includes(t.id) && !suggested.includes(t)).length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && setTaskIds([...taskIds, e.target.value])}
                className="h-6 max-w-full rounded-full border border-dashed bg-transparent px-2 text-xs text-muted-foreground"
                aria-label="Link a task"
              >
                <option value="">+ link task</option>
                {tasks
                  .filter((t) => !taskIds.includes(t.id) && !suggested.includes(t))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            )}
            {tasks.length === 0 && <span className="text-xs text-muted-foreground">No open tasks in this project.</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-3" data-tour="log-attach">
        {current ? (
          <EvidenceUploader projectId={projectId} target={{ logId: current.id }} compact />
        ) : (
          <span className="text-xs text-muted-foreground">Save first, then attach files or links to this entry.</span>
        )}
        <Button type="submit" className="ml-auto w-full sm:w-auto" disabled={pending || !completed.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : current ? <Check /> : <Plus />}
          {current ? "Update log" : "Save log"} <kbd className="hidden border-white/25 bg-white/15 text-inherit sm:inline-flex">⌘↵</kbd>
        </Button>
      </div>
    </form>
  );
}
