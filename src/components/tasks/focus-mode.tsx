"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { formatMinutes } from "@/lib/domain/dates";
import { formatClock, readNotes, secondsOf, useFocusSession, writeNotes, writeSession } from "./focus-session";

/**
 * Focus mode: one task, full screen, with a session timer and notes. Ending a
 * session opens today's log with this task linked, the time filled in and the
 * notes as the start of "What did you complete?". Esc leaves and the timer
 * keeps running (shown in the top bar). Press F on a task page, or arrive with
 * ?focus=1 (the Focus buttons elsewhere).
 */
export function FocusMode({
  taskId,
  projectId,
  title,
  description,
  professorDeadline,
  personalDeadline,
  today,
  canLog,
  loggedMinutes = 0,
  estimateHours = null,
  buttonClassName,
}: {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  professorDeadline: string | null;
  personalDeadline: string | null;
  today: string;
  canLog: boolean;
  loggedMinutes?: number;
  estimateHours?: number | null;
  /** Classes for the Focus button only (the overlay always works, phones included). */
  buttonClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [now, setNow] = useState(0);
  const session = useFocusSession();
  const mine = session?.taskId === taskId ? session : null;
  const running = !!mine?.startedAt;
  const seconds = secondsOf(mine, now);

  const openFocus = useCallback(() => {
    setNotes(readNotes(taskId));
    setNow(Date.now());
    setOpen(true);
  }, [taskId]);

  // Arriving from a Focus button (?focus=1) opens straight into focus.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("focus") !== "1") return;
    const raf = requestAnimationFrame(openFocus);
    router.replace(pathname, { scroll: false });
    return () => cancelAnimationFrame(raf);
  }, [openFocus, pathname, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "f" && !open && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        openFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openFocus]);

  useEffect(() => {
    if (!running || !open) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [running, open]);

  const toggle = () => {
    const t = Date.now();
    setNow(t);
    if (!mine) writeSession({ taskId, projectId, title, elapsed: 0, startedAt: t });
    else if (running) writeSession({ ...mine, elapsed: secondsOf(mine, t), startedAt: null });
    else writeSession({ ...mine, startedAt: t });
  };

  const finish = () => {
    const secs = secondsOf(mine, Date.now());
    const text = notes.trim();
    writeSession(null);
    writeNotes(taskId, "");
    setNotes("");
    setOpen(false);
    if (canLog && (secs >= 60 || text)) {
      const minutes = secs >= 60 ? Math.max(5, Math.round(secs / 60 / 5) * 5) : 0;
      const q = new URLSearchParams({
        project: projectId,
        task: taskId,
        ...(minutes && { minutes: String(minutes) }),
        ...(text && { notes: text.slice(0, 2000) }),
      });
      router.push(`/log/new?${q}`);
    }
  };

  const canEndAndLog = canLog && (seconds >= 60 || notes.trim().length > 0);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openFocus} className={`text-muted-foreground ${buttonClassName ?? ""}`}>
        <Maximize2 /> Focus <kbd>F</kbd>
      </Button>
      {/* Portalled to <body>: an animated (transformed) ancestor would otherwise trap position: fixed. */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Focus mode"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 overflow-y-auto bg-background px-6 py-10 text-center"
          >
            <div className="max-w-2xl space-y-3">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Focus</p>
              <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
              {description && <p className="line-clamp-4 text-muted-foreground">{description}</p>}
              <div className="flex flex-wrap justify-center gap-2">
                {professorDeadline && <DeadlineChip date={professorDeadline} today={today} kind="professor" />}
                {personalDeadline && personalDeadline !== professorDeadline && <DeadlineChip date={personalDeadline} today={today} kind="personal" />}
              </div>
              {(loggedMinutes > 0 || estimateHours) && (
                <p className="font-mono text-xs text-muted-foreground">
                  {formatMinutes(loggedMinutes)} logged{estimateHours ? ` of ${formatMinutes(Math.round(estimateHours * 60))} estimated` : ""}
                </p>
              )}
            </div>
            <p className="font-mono text-6xl font-medium tracking-tight tabular sm:text-7xl" aria-live="off">
              {formatClock(seconds)}
            </p>
            <div className="flex gap-3">
              <Button size="lg" onClick={toggle}>
                {running ? <Pause /> : <Play />} {running ? "Pause" : seconds ? "Resume" : "Start session"}
              </Button>
              <Button size="lg" variant="outline" onClick={canEndAndLog ? finish : () => setOpen(false)}>
                <Square /> {canEndAndLog ? "End and log it" : "Leave"}
              </Button>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                writeNotes(taskId, e.target.value);
              }}
              rows={3}
              aria-label="Notes"
              placeholder="Notes: what you're trying, what happened. They start today's log when you end the session."
              className="w-full max-w-lg text-left"
            />
            <p className="max-w-lg text-xs text-muted-foreground">
              Esc leaves focus; a running timer keeps going in the top bar. Ending the session opens today&apos;s log with this task, the time and your notes
              filled in.
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}

/** The top bar's reminder of a running (or paused) focus session. */
export function FocusPill() {
  const session = useFocusSession();
  const pathname = usePathname();
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!session?.startedAt) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [session?.startedAt]);
  if (!session) return null;
  const seconds = secondsOf(session, now);
  return (
    <a
      href={`/tasks/${session.taskId}?focus=1`}
      onClick={(e) => {
        if (pathname === `/tasks/${session.taskId}`) {
          e.preventDefault();
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
        }
      }}
      title={`Focus: ${session.title}`}
      className="flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 font-mono text-xs text-primary"
    >
      <span className={session.startedAt ? "size-1.5 animate-pulse rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground"} aria-hidden />
      {formatClock(seconds)}
    </a>
  );
}
