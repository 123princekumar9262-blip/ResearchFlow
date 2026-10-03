"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Check, Play } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "./provider";

export interface ChecklistItem {
  label: string;
  done: boolean;
  href: string;
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="size-10 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border)" strokeWidth="3.5" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="url(#rf-ring)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - done / total)}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
      <defs>
        <linearGradient id="rf-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Getting started · n of 5 (spec Phase 08). Each item ticks itself when the
 * work exists. The card goes after all five, or 14 days after sign-up.
 */
export function GettingStarted({ items }: { items: ChecklistItem[] }) {
  const api = useOnboarding();
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const complete = done === total;
  const { setChecklist, update, today } = api;
  const finishedOn = api.state.done;

  useEffect(() => {
    setChecklist({ done, total });
    return () => setChecklist(null);
  }, [done, total, setChecklist]);

  useEffect(() => {
    if (complete && !finishedOn) update({ done: today });
  }, [complete, finishedOn, update, today]);

  if (api.state.legacy || api.accountAge >= 14) return null;
  if (finishedOn && finishedOn !== today) return null;

  if (complete) {
    return (
      <section id="getting-started" className="rf-rise flex items-center gap-3 rounded-xl border border-success/35 bg-card bg-wash-success px-4 py-3 shadow-[var(--shadow-card)]">
        <span className="grid size-8 place-items-center rounded-full bg-success text-white">
          <Check className="size-4" />
        </span>
        <p>
          <b className="font-semibold">Setup complete.</b> <span className="text-muted-foreground">From here, the dashboard tells you what&apos;s next.</span>
        </p>
      </section>
    );
  }

  return (
    <section id="getting-started" data-tour="getting-started" className="rf-rise scroll-mt-20 rounded-xl border bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Ring done={done} total={total} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            Getting started · {done} of {total}
          </h2>
          <p className="text-xs text-muted-foreground">Each item ticks itself when it&apos;s done.</p>
        </div>
        {api.state.core !== "done" && (
          <Button size="sm" onClick={() => api.start("core")}>
            <Play /> Take the 3-minute tour
          </Button>
        )}
      </header>
      <ol className="grid gap-px p-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className={cn("flex h-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors hover:bg-accent/60", item.done && "text-muted-foreground")}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border",
                  item.done ? "border-transparent bg-success text-white" : "border-border-strong",
                )}
              >
                {item.done && <Check className="size-3" />}
              </span>
              <span className={cn(item.done && "line-through decoration-muted-foreground/40")}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
