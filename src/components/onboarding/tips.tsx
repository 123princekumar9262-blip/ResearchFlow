"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "cn";
import type { ChapterId } from "@/lib/onboarding/state";
import { PARTS, tourSteps } from "@/lib/onboarding/tours";
import { autoAllowed, noteAutoStarted, useOnboardingMaybe } from "./provider";

function typing() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * Plays a chapter the first time its area has something to show (spec Phase 05):
 * after 2 seconds, never over a dialog or while typing, one per session.
 * Chapters of more than 4 steps are offered instead of started.
 */
export function ChapterTrigger({ tour, part, ready = true, inDialog = false }: { tour: ChapterId; part?: string; ready?: boolean; inDialog?: boolean }) {
  const api = useOnboardingMaybe();
  const blocked = !api || !ready || api.running !== null;
  const key = part ?? tour;
  const seen = api ? api.isSeen(key) || (part ? api.isSeen(tour) : false) : true;

  useEffect(() => {
    if (blocked || seen || !api || !autoAllowed(api)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = (tries: number) => {
      if (cancelled) return;
      const dialog = document.querySelector('[role="dialog"][data-state="open"]');
      if ((!inDialog && (typing() || dialog)) || (inDialog && !dialog)) {
        if (tries < 10) timer = setTimeout(() => attempt(tries + 1), 1000);
        return;
      }
      let steps = tourSteps(tour, api.context());
      steps = part ? steps.filter((s) => PARTS[part]?.ids.includes(s.id)) : steps.filter((s) => !s.core);
      if (steps.length === 0) return api.markSeen(key);
      noteAutoStarted(api);
      if (steps.length > 4) api.offer(tour, { auto: true, part });
      else api.start(tour, { auto: true, part });
    };
    timer = setTimeout(() => attempt(0), inDialog ? 700 : 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, seen, key]);

  return null;
}

type Tone = "primary" | "danger" | "warning";
const EDGE: Record<Tone, string> = { primary: "border-l-primary", danger: "border-l-danger", warning: "border-l-warning" };

/**
 * A contextual tip (spec Phase 07). One on screen at a time, two per session,
 * none during a tour. "state" tips come back tomorrow when dismissed;
 * "discovery" tips are gone for good.
 */
export function Tip({
  id,
  kind,
  tone = "primary",
  title,
  children,
  cta,
  className,
}: {
  id: string;
  kind: "state" | "discovery";
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  cta?: { label: React.ReactNode; href?: string; onClick?: () => void };
  className?: string;
}) {
  const api = useOnboardingMaybe();
  const allowed = !!api && api.tipAllowed(id);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!api || !allowed) return;
    let timer: ReturnType<typeof setTimeout>;
    const ask = () => {
      if (typing()) timer = setTimeout(ask, 1000);
      else api.requestTip(id);
    };
    timer = setTimeout(ask, 2000);
    return () => {
      clearTimeout(timer);
      api.releaseTip(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, id]);

  if (!api || api.tipSlot !== id) return null;
  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => api.dismissTip(id, kind), 150);
  };
  const ctaClass = "shrink-0 text-[13px] font-medium whitespace-nowrap text-primary hover:underline";

  return (
    <div
      role="note"
      className={cn(
        "rf-rise flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-[10px] border border-l-[3px] bg-card px-3.5 py-2.5 shadow-[var(--shadow-card)] transition-opacity duration-150",
        EDGE[tone],
        leaving && "opacity-0",
        className,
      )}
    >
      <div className="min-w-0 flex-[1_1_16rem]">
        <p className="font-semibold">{title}</p>
        {children && <p className="text-muted-foreground">{children}</p>}
      </div>
      <div className="flex items-center gap-3 self-center">
        {cta &&
          (cta.href ? (
            <Link href={cta.href} className={ctaClass}>
              {cta.label}
            </Link>
          ) : (
            <button type="button" onClick={cta.onClick} className={ctaClass}>
              {cta.label}
            </button>
          ))}
        <button type="button" onClick={dismiss} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Dismiss tip">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Clicks the first visible element with this tour key (e.g. opens New task). */
export function clickTourTarget(key: string) {
  const el = [...document.querySelectorAll<HTMLElement>(`[data-tour~="${key}"]`)].find((e) => e.getBoundingClientRect().width > 0);
  el?.click();
  el?.focus();
}
