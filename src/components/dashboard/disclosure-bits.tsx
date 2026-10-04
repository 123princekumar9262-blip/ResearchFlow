"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { useLocalStorage } from "@/components/common/use-local-storage";
import { JoinProfessorCard } from "@/components/settings/join-professor";

/**
 * "More for today (n)": everything past the first three blocks, folded into
 * one line that opens in place (calm redesign spec, Phase 02). Open or closed
 * is remembered on this device.
 */
export function MoreForToday({ labels, children }: { labels: string[]; children: React.ReactNode }) {
  const [stored, setStored] = useLocalStorage("rf.dashboard.more");
  // A tour pointing at a folded section opens it for this visit ("rf:reveal").
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const onReveal = () => setRevealed(true);
    window.addEventListener("rf:reveal", onReveal);
    return () => window.removeEventListener("rf:reveal", onReveal);
  }, []);
  const open = stored === "1" || revealed;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setRevealed(false);
          setStored(open ? "0" : "1");
        }}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-90")} aria-hidden />
        <span className="font-medium text-foreground">More for today</span>
        <span className="min-w-0 truncate">· {labels.join(", ")}</span>
      </button>
      {open && <div className="rf-rise mt-2 grid gap-4">{children}</div>}
    </div>
  );
}

/** Stage 1, students: the one alternative to creating a project. */
export function LinkProfessorLater() {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="rf-rise mt-2 w-full text-left">
        <JoinProfessorCard />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)} className="px-2 py-1 text-[13px] text-muted-foreground hover:text-foreground">
      Have a join code? Link your professor
    </button>
  );
}
