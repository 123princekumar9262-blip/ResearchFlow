"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, CheckCircle2, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/common/status";
import { useServerAction } from "@/components/common/use-server-action";
import { deadlineLabel } from "@/lib/domain/deadlines";
import type { AgendaTask } from "@/lib/data/meetings";
import type { MeetingTopic } from "@/types/database";
import { ScheduleMeetingDialog } from "./schedule-dialog";
import {
  addActionItem,
  addTopic,
  cancelMeeting,
  endMeeting,
  removeTopic,
  reopenMeeting,
  saveMeetingNotes,
  setTopicDone,
} from "@/server/actions/meetings";

// What's typed but not yet saved, so "End meeting" can take it along.
const unsaved = new Map<string, string>();

type SaveState = "saved" | "saving" | "unsaved" | "error";

/** Shared notes. Saves a second after typing stops, and when leaving the page. */
export function MeetingNotes({ meetingId, initial, placeholder }: { meetingId: string; initial: string; placeholder: string }) {
  const [notes, setNotes] = useState(initial);
  const [state, setState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (text: string) => {
    setState("saving");
    const res = await saveMeetingNotes({ meetingId, notes: text });
    if (res.ok) {
      if (unsaved.get(meetingId) === text) unsaved.delete(meetingId);
      setState(unsaved.has(meetingId) ? "unsaved" : "saved");
    } else {
      setState("error");
      toast.error(res.error);
    }
  };

  useEffect(() => {
    const flush = () => {
      const text = unsaved.get(meetingId);
      if (text !== undefined) void saveMeetingNotes({ meetingId, notes: text });
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [meetingId]);

  return (
    <div className="grid gap-1.5">
      <Textarea
        value={notes}
        onChange={(e) => {
          const text = e.target.value;
          setNotes(text);
          unsaved.set(meetingId, text);
          setState("unsaved");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(text), 1000);
        }}
        placeholder={placeholder}
        aria-label="Meeting notes"
        className="min-h-48 resize-y text-[14px] leading-6"
        maxLength={20000}
      />
      <p className={cn("text-[11px]", state === "error" ? "text-danger" : "text-muted-foreground")} aria-live="polite">
        {state === "saving" ? "Saving…" : state === "unsaved" ? "Typing…" : state === "error" ? "Not saved. Check your connection." : "Saved. Both of you can see and edit these notes."}
      </p>
    </div>
  );
}

/** Extra things to talk about, added by either side. Tick them off as you go. */
export function Topics({ meetingId, topics, userId, open }: { meetingId: string; topics: (MeetingTopic & { authorName: string })[]; userId: string; open: boolean }) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () => {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await addTopic({ meetingId, body });
      if (res.ok) setDraft("");
      else toast.error(res.error);
    });
  };

  return (
    <div className="grid gap-2">
      {topics.length > 0 && (
        <ul className="grid gap-1">
          {topics.map((t) => (
            <li key={t.id} className="group flex items-start gap-2.5 rounded-md px-1 py-1">
              <Checkbox
                checked={t.done}
                className="mt-0.5"
                aria-label={t.done ? "Mark as not discussed" : "Mark as discussed"}
                onCheckedChange={(v) => startTransition(async () => void (await setTopicDone({ topicId: t.id, done: v === true })))}
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[14px]", t.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>{t.body}</span>
                <span className="block text-[11px] text-muted-foreground">{t.author_id === userId ? "You" : t.authorName}</span>
              </span>
              {t.author_id === userId && (
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  aria-label="Remove topic"
                  onClick={() => startTransition(async () => void (await removeTopic({ topicId: t.id })))}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a topic, e.g. which conference to target" maxLength={500} aria-label="New topic" />
          <Button type="submit" variant="outline" size="icon" disabled={pending || !draft.trim()} aria-label="Add topic" className="shrink-0">
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </form>
      )}
    </div>
  );
}

/** What was agreed: real tasks for the student, linked back to this meeting. */
export function ActionItems({
  meetingId,
  items,
  projects,
  today,
  studentFirstName,
  role,
}: {
  meetingId: string;
  items: AgendaTask[];
  projects: { id: string; title: string }[];
  today: string;
  studentFirstName: string;
  role: "student" | "professor";
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [due, setDue] = useState("");
  const { pending, run } = useServerAction();

  return (
    <div className="grid gap-3">
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing yet. Each item becomes a task for {role === "professor" ? studentFirstName : "you"}, with a deadline.</p>
      ) : (
        <ul className="grid gap-1.5">
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 hover:border-primary/40">
                <span className={cn("min-w-0 flex-1 truncate text-[14px]", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                {t.due && t.status !== "done" && <span className="shrink-0 text-xs text-muted-foreground">{deadlineLabel(t.due, today)}</span>}
                <StatusPill status={t.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {projects.length === 0 ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Action items need a project you share. Create one first.</p>
      ) : (
        <form
          className="grid gap-2 rounded-lg border border-dashed p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addActionItem({ meetingId, projectId, title, due: due || null }), {
              onSuccess: () => {
                setTitle("");
                setDue("");
              },
            });
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Measure efficiency at 5% and 10% load" maxLength={200} aria-label="Action item" />
          {projects.length > 1 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project" className="h-9 w-full min-w-0 truncate rounded-md border bg-transparent px-2 text-[13px]">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
              Due
              <Input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className="h-9 min-w-0 flex-1" aria-label="Due date" />
            </label>
            <Button type="submit" size="sm" disabled={pending || !title.trim()} className="h-9 shrink-0">
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** End (or reopen), move, and cancel. */
export function MeetingControls({
  meeting,
  role,
  canCancel,
}: {
  meeting: { id: string; startsAt: string; status: "scheduled" | "done"; otherName: string };
  role: "student" | "professor";
  canCancel: boolean;
}) {
  const router = useRouter();
  const end = useServerAction();
  const other = useServerAction();
  const [confirm, setConfirm] = useState(false);

  if (meeting.status === "done") {
    return (
      <Button variant="ghost" size="sm" disabled={other.pending} onClick={() => other.run(() => reopenMeeting({ meetingId: meeting.id }))}>
        <RotateCcw /> Reopen
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ScheduleMeetingDialog
        role={role}
        people={[]}
        meeting={{ id: meeting.id, startsAt: meeting.startsAt, otherName: meeting.otherName }}
        trigger={
          <Button variant="ghost" size="sm">
            <CalendarClock /> Move
          </Button>
        }
      />
      {canCancel && (
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger">
              <Trash2 /> Cancel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel this meeting?</DialogTitle>
              <DialogDescription>{meeting.otherName} gets a notification. Its notes and topics are deleted; action items stay as tasks.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Keep it
              </Button>
              <Button
                variant="destructive"
                disabled={other.pending}
                onClick={() => other.run(() => cancelMeeting({ meetingId: meeting.id }), { onSuccess: () => router.replace("/meetings") })}
              >
                {other.pending && <Loader2 className="animate-spin" />} Cancel meeting
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Button size="sm" disabled={end.pending} onClick={() => end.run(() => endMeeting({ meetingId: meeting.id, notes: unsaved.get(meeting.id) }))}>
        {end.pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} End meeting
      </Button>
    </div>
  );
}

/** A tick for agenda rows you've covered; kept on this device only. */
export function AgendaCheck({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(`rf.agenda.${id}`) === "1") requestAnimationFrame(() => setDone(true));
    } catch {}
  }, [id]);
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={done ? "Mark as not discussed" : "Mark as discussed"}
      onClick={() => {
        setDone(!done);
        try {
          if (done) localStorage.removeItem(`rf.agenda.${id}`);
          else localStorage.setItem(`rf.agenda.${id}`, "1");
        } catch {}
      }}
      className={cn(
        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
        done ? "border-success bg-success text-white" : "border-muted-foreground/40 hover:border-primary",
      )}
    >
      {done && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}
