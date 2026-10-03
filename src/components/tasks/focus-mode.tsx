"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeadlineChip } from "@/components/common/deadline-chip";

/**
 * Focus mode: one task, full screen, with a session timer. Ending a session
 * opens today's log with this task linked and the time filled in.
 * Press F on a task page, Esc to leave.
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
}: {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  professorDeadline: string | null;
  personalDeadline: string | null;
  today: string;
  canLog: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "f" && !open && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  const finish = () => {
    setRunning(false);
    setOpen(false);
    const minutes = Math.max(5, Math.round(seconds / 60 / 5) * 5);
    if (canLog && seconds >= 60) router.push(`/log/new?project=${projectId}&task=${taskId}&minutes=${minutes}`);
    setSeconds(0);
  };

  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground">
        <Maximize2 /> Focus <kbd>F</kbd>
      </Button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Focus mode" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background px-6 text-center">
          <div className="max-w-2xl space-y-3">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Focus</p>
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
            {description && <p className="line-clamp-4 text-muted-foreground">{description}</p>}
            <div className="flex justify-center gap-2">
              {professorDeadline && <DeadlineChip date={professorDeadline} today={today} kind="professor" />}
              {personalDeadline && personalDeadline !== professorDeadline && <DeadlineChip date={personalDeadline} today={today} kind="personal" />}
            </div>
          </div>
          <p className="font-mono text-6xl font-medium tracking-tight tabular sm:text-7xl" aria-live="off">
            {hh}:{mm}:{ss}
          </p>
          <div className="flex gap-3">
            <Button size="lg" onClick={() => setRunning((r) => !r)}>
              {running ? <Pause /> : <Play />} {running ? "Pause" : seconds ? "Resume" : "Start session"}
            </Button>
            <Button size="lg" variant="outline" onClick={finish}>
              <Square /> {canLog && seconds >= 60 ? "End and log it" : "Leave"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Esc leaves without logging. Ending a session of a minute or more opens today&apos;s log with this task and the time filled in.</p>
        </div>
      )}
    </>
  );
}
