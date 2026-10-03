"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useInstall } from "@/components/pwa/install";
import type { ChapterId, TourId } from "@/lib/onboarding/state";
import { PARTS, tourSteps, type TourContext, type TourStep } from "@/lib/onboarding/tours";
import { useOnboarding, type StartOptions, type TourRequest } from "./provider";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Phase = "seek" | "show" | "confirm" | "waiting" | "logged";

interface Run {
  tour: TourId;
  style: "full" | "light";
  seenKey: string;
  steps: TourStep[];
  i: number;
  skipped: number[];
  phase: Phase;
  /** Where the current step is shown; leaving it (by the user) pauses the tour. */
  path: string;
  ctx: TourContext;
}

const PAD = 6;
let synthetic = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTyping(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  return !!e && (e.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.tagName));
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
}

function findTargets(step: TourStep): HTMLElement[] {
  if (!step.target) return [];
  const all = step.target
    .split(" ")
    .flatMap((k) => [...document.querySelectorAll<HTMLElement>(`[data-tour~="${k}"]`)])
    .filter(visible);
  // Inside an open dialog, prefer what's in it.
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')].at(-1);
  const inDialog = dialog ? all.filter((e) => dialog.contains(e)) : [];
  const list = inDialog.length ? inDialog : all;
  return step.union ? list : list.slice(0, 1);
}

function unionRect(list: HTMLElement[]): Rect {
  const rs = list.map((e) => e.getBoundingClientRect());
  const left = Math.min(...rs.map((r) => r.left));
  const top = Math.min(...rs.map((r) => r.top));
  const right = Math.max(...rs.map((r) => r.right));
  const bottom = Math.max(...rs.map((r) => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

function pinned(el: HTMLElement): boolean {
  for (let e: HTMLElement | null = el; e && e !== document.body; e = e.parentElement) {
    const p = getComputedStyle(e).position;
    if (p === "fixed" || p === "sticky") return true;
  }
  return false;
}

function same(a: Rect | null, b: Rect | null) {
  if (!a || !b) return a === b;
  return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function closeNewTaskDialog() {
  if (!document.querySelector('[data-tour~="new-task-dialog"]')) return;
  synthetic = true;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  synthetic = false;
}

function bounce(el: HTMLElement | undefined) {
  if (!el || reducedMotion()) return;
  el.classList.remove("rf-tour-bounce");
  void el.offsetWidth;
  el.classList.add("rf-tour-bounce");
  setTimeout(() => el.classList.remove("rf-tour-bounce"), 750);
}

export function TourRunner({
  request,
  onRunning,
  offered,
  onOffer,
}: {
  request: TourRequest | null;
  onRunning: (tour: TourId | null) => void;
  offered: { tour: ChapterId; opts: StartOptions; steps: number } | null;
  onOffer: (accept: boolean) => void;
}) {
  const api = useOnboarding();
  const apiRef = useRef(api);
  apiRef.current = api;
  const router = useRouter();
  const pathname = usePathname();
  const install = useInstall();

  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [radius, setRadius] = useState(10);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [cardOut, setCardOut] = useState(false);
  const [finish, setFinish] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [vw, setVw] = useState({ w: 1280, h: 800 });
  const els = useRef<HTMLElement[]>([]);
  const token = useRef(0);
  const navigating = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [cardH, setCardH] = useState(220);
  const bounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the page last changed, and the step a run started on: both get a longer wait for their target. */
  const pathChangedAt = useRef(0);
  const firstIndex = useRef(0);

  const commit = useCallback((r: Run | null) => {
    runRef.current = r;
    setRun(r);
  }, []);

  const end = useCallback(() => {
    token.current += 1;
    navigating.current = false;
    if (bounceTimer.current) clearTimeout(bounceTimer.current);
    commit(null);
    onRunning(null);
    setRect(null);
    setContainer(null);
    setInstallHelp(false);
    els.current = [];
  }, [commit, onRunning]);

  const pause = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    const a = apiRef.current;
    if (r.tour === "core") {
      a.update({ core: "paused", step: r.i, pausedOn: a.today });
      toast("Tour paused. Resume it from Help (?).");
    } else {
      a.markSeen(r.seenKey);
    }
    end();
  }, [end]);

  const complete = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    const a = apiRef.current;
    end();
    if (r.tour === "core") {
      a.update({ core: "done", step: undefined });
      if (window.location.pathname !== "/dashboard") router.push("/dashboard");
      setFinish(true);
    } else {
      a.markSeen(r.seenKey);
      if (!r.seenKey.includes("-") && r.tour === "tasks") a.markSeen("tasks");
    }
  }, [end, router]);

  const seek = useCallback(
    async (index: number, dir: 1 | -1): Promise<void> => {
      const my = ++token.current;
      const r0 = runRef.current;
      if (!r0) return;
      if (index >= r0.steps.length) return complete();
      if (index < 0) return seek(0, 1);
      const step = r0.steps[index];
      commit({ ...r0, i: index, phase: "seek" });

      const skip = () => {
        const r = runRef.current;
        if (!r || my !== token.current) return;
        commit({ ...r, skipped: [...new Set([...r.skipped, index])] });
        // Going back past the first step turns around.
        if (dir === -1 && index === 0) return void seek(index + 1, 1);
        return void seek(index + dir, dir);
      };

      const route = step.route ? step.route(r0.ctx) : undefined;
      if (route === null) return skip();
      if (!step.inDialog) closeNewTaskDialog();
      const routePath = route?.split("?")[0];
      const moved = !!route && routePath !== window.location.pathname;
      if (moved) {
        navigating.current = true;
        router.push(route!);
        const until = Date.now() + 15000;
        while (window.location.pathname !== routePath && Date.now() < until) await sleep(80);
        if (my !== token.current) return;
        if (window.location.pathname !== routePath) return skip();
      }
      if (step.inDialog === "new-task" && !document.querySelector('[data-tour~="new-task-dialog"]')) {
        const until = Date.now() + 4000;
        let opener: HTMLElement | undefined;
        while (!(opener = [...document.querySelectorAll<HTMLElement>('[data-tour~="new-task"]')].find(visible)) && Date.now() < until) await sleep(100);
        opener?.click();
      }

      let found: HTMLElement[] = [];
      if (step.target) {
        // A new page may still be rendering; on the same page a missing target is simply not there.
        const fresh = moved || !!step.inDialog || index === firstIndex.current || Date.now() - pathChangedAt.current < 4000;
        const until = Date.now() + (fresh ? 6000 : 1200);
        while (!(found = findTargets(step)).length && Date.now() < until) {
          await sleep(100);
          if (my !== token.current) return;
        }
        if (!found.length) return skip();
        // Scroll it into view: the top 55% on phones, clear of the edges elsewhere.
        if (!pinned(found[0])) {
          const u = unionRect(found);
          const vh = window.innerHeight;
          const phone = r0.ctx.phone;
          const topOk = phone ? vh * 0.1 : 96;
          const bottomOk = phone ? vh * 0.55 : vh - 96;
          if (u.top < topOk || u.top + Math.min(u.height, vh * 0.4) > bottomOk) {
            const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
            if (found[0].closest('[role="dialog"]')) found[0].scrollIntoView({ block: phone ? "start" : "center", behavior });
            else window.scrollTo({ top: Math.max(0, window.scrollY + u.top - (phone ? vh * 0.15 : Math.max(96, (vh - u.height) / 2))), behavior });
            await sleep(reducedMotion() ? 40 : 420);
            if (my !== token.current) return;
          }
        }
      }
      els.current = found;
      navigating.current = false;
      const r = runRef.current;
      if (!r || my !== token.current) return;
      if (found[0]) setRadius(Math.min(16, (parseFloat(getComputedStyle(found[0]).borderTopLeftRadius) || 6) + 4));
      if (found.length) setRect(unionRect(found));
      else setRect(null);
      setContainer(found[0]?.closest<HTMLElement>('[role="dialog"]') ?? null);
      commit({ ...r, i: index, phase: "show", path: window.location.pathname });
      if (r.tour === "core") apiRef.current.update({ core: "paused", step: index, pausedOn: apiRef.current.today });
      if (r.ctx.phone && "vibrate" in navigator) navigator.vibrate?.(10);
      if (bounceTimer.current) clearTimeout(bounceTimer.current);
      if (step.bounce || step.action?.kind === "log") {
        bounce(found[0]);
        bounceTimer.current = setTimeout(() => {
          const now = runRef.current;
          if (now && now.i === index && now.phase === "show") bounce(els.current[0]);
        }, 4000);
      }
    },
    [commit, complete, router],
  );

  const begin = useCallback(
    (tour: TourId, opts: StartOptions) => {
      const a = apiRef.current;
      const ctx = a.context(window.location.pathname);
      let steps = tourSteps(tour, ctx);
      const part = opts.part ? PARTS[opts.part] : undefined;
      if (part) steps = steps.filter((s) => part.ids.includes(s.id));
      else if (opts.auto && tour !== "core") steps = steps.filter((s) => !s.core);
      const seenKey = opts.part ?? tour;
      if (!steps.length) {
        if (tour !== "core") a.markSeen(seenKey);
        return;
      }
      token.current += 1;
      setFinish(false);
      setInstallHelp(false);
      commit({ tour, style: tour === "core" ? "full" : "light", seenKey, steps, i: 0, skipped: [], phase: "seek", path: ctx.here, ctx });
      onRunning(tour);
      firstIndex.current = Math.min(opts.fromStep ?? 0, steps.length - 1);
      void seek(firstIndex.current, 1);
    },
    [commit, onRunning, seek],
  );

  // Each request starts once (the router changes identity on navigation, which re-runs this effect).
  const handled = useRef(0);
  useEffect(() => {
    if (!request || request.n === handled.current) return;
    handled.current = request.n;
    begin(request.tour, request.opts);
  }, [request, begin]);

  const exitThen = useCallback((fn: () => void) => {
    if (reducedMotion()) return fn();
    setCardOut(true);
    setTimeout(() => {
      setCardOut(false);
      fn();
    }, 120);
  }, []);

  const next = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    if (r.phase === "confirm") return commit({ ...r, phase: "show" });
    if (r.phase !== "show") return;
    exitThen(() => (r.i + 1 >= r.steps.length ? complete() : void seek(r.i + 1, 1)));
  }, [commit, complete, exitThen, seek]);

  const back = useCallback(() => {
    const r = runRef.current;
    if (!r || r.phase !== "show") return;
    let j = r.i - 1;
    while (j >= 0 && r.skipped.includes(j)) j--;
    if (j < 0) return;
    exitThen(() => void seek(j, -1));
  }, [exitThen, seek]);

  const askSkip = useCallback(() => {
    const r = runRef.current;
    if (r) commit({ ...r, phase: "confirm" });
  }, [commit]);

  const confirmSkip = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    const a = apiRef.current;
    if (r.tour === "core") a.update({ core: "skipped", step: undefined, skips: (a.state.skips ?? 0) + 1 });
    else a.markSeen(r.seenKey);
    end();
  }, [end]);

  const doAction = useCallback(async () => {
    const r = runRef.current;
    if (!r) return;
    const step = r.steps[r.i];
    if (step.action?.kind === "log") {
      commit({ ...r, phase: "waiting" });
      navigating.current = true;
      router.push("/log/new");
    } else if (step.action?.kind === "install") {
      if (install.state === "prompt") {
        await install.install();
        next();
      } else setInstallHelp(true);
    }
  }, [commit, router, install, next]);

  // The first log, written mid-tour: continue when it's saved.
  useEffect(() => {
    const onSaved = () => {
      const r = runRef.current;
      if (!r || r.phase !== "waiting") return;
      commit({ ...r, phase: "logged" });
      setTimeout(() => {
        const now = runRef.current;
        if (now && now.phase === "logged") void seek(now.i + 1, 1);
      }, 1600);
    };
    window.addEventListener("rf:log-saved", onSaved);
    return () => window.removeEventListener("rf:log-saved", onSaved);
  }, [commit, seek]);

  useEffect(() => {
    pathChangedAt.current = Date.now();
  }, [pathname]);

  // Leaving the page by hand pauses the core tour and ends a chapter.
  useEffect(() => {
    const r = runRef.current;
    if (!r) return;
    if (r.phase === "waiting") {
      if (pathname === "/log/new") navigating.current = false;
      else if (!navigating.current) {
        // The sheet was closed without saving: back to the step.
        const t = setTimeout(() => {
          const now = runRef.current;
          if (now && now.phase === "waiting") void seek(now.i, 1);
        }, 600);
        return () => clearTimeout(t);
      }
      return;
    }
    if (navigating.current || r.phase === "seek" || r.phase === "logged") return;
    if (pathname !== r.path) {
      if (r.tour === "core") pause();
      else {
        apiRef.current.markSeen(r.seenKey);
        end();
      }
    }
  }, [pathname, pause, end, seek]);

  // Follow the target as the page scrolls, resizes or re-renders.
  useEffect(() => {
    if (!run || (run.phase !== "show" && run.phase !== "confirm")) return;
    const step = run.steps[run.i];
    let raf = 0;
    let missingSince = 0;
    const tick = () => {
      setVw((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      if (step.target) {
        let list = els.current.filter((e) => e.isConnected && visible(e));
        if (!list.length) list = els.current = findTargets(step);
        if (!list.length) {
          missingSince ||= performance.now();
          if (performance.now() - missingSince > 700) {
            if (runRef.current?.style === "full") pause();
            else {
              apiRef.current.markSeen(runRef.current?.seenKey ?? "");
              end();
            }
            return;
          }
        } else {
          missingSince = 0;
          const u = unionRect(list);
          setRect((prev) => (same(prev, u) ? prev : u));
          const c = list[0].closest<HTMLElement>('[role="dialog"]');
          setContainer((prev) => (prev === c ? prev : c));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [run, pause, end]);

  // Keys: → / Enter next, ← back, Esc pauses. A full tour keeps the app's shortcuts quiet.
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (synthetic) return;
      const r = runRef.current;
      if (!r || (r.phase !== "show" && r.phase !== "confirm")) return;
      const inCard = !!cardRef.current?.contains(e.target as Node);
      const typing = isTyping(e.target);
      const full = r.style === "full";
      if (e.key === "Escape") {
        if (!full && !inCard) return;
        e.preventDefault();
        e.stopPropagation();
        if (r.phase === "confirm") return commit({ ...r, phase: "show" });
        return pause();
      }
      if (typing && !inCard) return;
      if (!full && !inCard && document.activeElement && document.activeElement !== document.body) return;
      if (e.key === "ArrowRight" || (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement))) {
        e.preventDefault();
        e.stopPropagation();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        back();
      } else if (e.key === "Tab" && full && cardRef.current) {
        const focusables = [...cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!inCard) {
          e.preventDefault();
          first.focus();
        }
        e.stopPropagation();
      } else if (full && !inCard) {
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [run, commit, pause, next, back]);

  // Inside a dialog the card isn't part of the dialog's React tree, so Radix would read a click or
  // focus on it as "outside" and close the dialog. Keep those events from reaching the document.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !container) return;
    const stop = (e: Event) => e.stopPropagation();
    const types = ["pointerdown", "mousedown", "touchstart", "focusin"] as const;
    for (const t of types) el.addEventListener(t, stop);
    return () => {
      for (const t of types) el.removeEventListener(t, stop);
    };
  }, [run, container]);

  // Focus moves into the card (unless someone is typing on the page).
  useEffect(() => {
    if (!run || run.phase !== "show") return;
    if (run.style === "light" && isTyping(document.activeElement)) return;
    const t = setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 160);
    return () => clearTimeout(t);
  }, [run]);

  // Measure the card so it can sit above its target when there's no room below.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 1) setCardH(h);
  }, [run, cardH, installHelp, vw]);

  // The finish card: 4 seconds or a click, then the Next action card glows once.
  useEffect(() => {
    if (!finish) return;
    const t = setTimeout(() => closeFinish(), 4000);
    return () => clearTimeout(t);
  }, [finish]);

  function closeFinish() {
    setFinish(false);
    let tries = 0;
    const glow = () => {
      const el = document.querySelector<HTMLElement>('[data-tour~="next-action"]');
      if (el && visible(el)) {
        el.classList.add("rf-tour-glow");
        setTimeout(() => el.classList.remove("rf-tour-glow"), 1000);
      } else if (tries++ < 30) setTimeout(glow, 100);
    };
    glow();
  }

  // Phone sheet: swipe left/right to move, down on the handle to pause.
  const swipe = useRef<{ x: number; y: number; handle: boolean } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  if (!run && !finish && !offered) return null;
  if (typeof document === "undefined") return null;

  // ───────────── offer ─────────────
  if (!run && !finish && offered) {
    const minutes = Math.max(1, Math.round((offered.steps * 10) / 60));
    return createPortal(
      <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[75] flex justify-center px-4 md:bottom-6">
        <div className="rf-tour-card-in flex w-full max-w-md flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 shadow-[var(--shadow-pop)]" role="dialog" aria-label="Page tour">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Quick look at this page?</p>
            <p className="text-xs text-muted-foreground">
              {offered.steps} steps · about {minutes} minute{minutes === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOffer(false)}>
              Not now
            </Button>
            <Button size="sm" onClick={() => onOffer(true)}>
              Show me
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // ───────────── finish ─────────────
  if (!run && finish) {
    return createPortal(
      <div className="rf-tour-fade fixed inset-0 z-[82] grid place-items-center bg-[var(--tour-scrim-soft)] px-4" onClick={closeFinish} role="dialog" aria-label="Tour complete">
        <div className="rf-tour-card-in grid max-w-sm gap-2 rounded-2xl border bg-card p-6 text-center shadow-[var(--shadow-pop)]">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-grad-primary text-white shadow-[0_8px_20px_-6px_rgba(79,70,229,0.6)]">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path className="rf-tour-check" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <p className="text-[17px] font-semibold tracking-tight">You know the system. Now use it daily.</p>
          <p className="text-muted-foreground">Log every day. Hit every deadline. Answer every request.</p>
        </div>
      </div>,
      document.body,
    );
  }

  if (!run) return null;
  const step = run.steps[run.i];
  const full = run.style === "full";
  const phone = run.ctx.phone;
  const total = run.steps.length - run.skipped.length;
  const pos = run.steps.slice(0, run.i + 1).filter((_, j) => !run.skipped.includes(j)).length;
  const last = run.steps.slice(run.i + 1).every((_, k) => run.skipped.includes(run.i + 1 + k));
  const first = pos <= 1;

  // ───────────── waiting for the first log ─────────────
  if (run.phase === "waiting" || run.phase === "logged") {
    return createPortal(
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[90] flex justify-center px-4">
        <p
          key={run.phase}
          className={cn(
            "rf-tour-card-in max-w-md rounded-full border px-4 py-2 text-center text-[13px] shadow-[var(--shadow-pop)]",
            run.phase === "logged" ? "border-success/40 bg-card text-success" : "bg-card text-foreground",
          )}
          role="status"
        >
          {run.phase === "logged" ? "Logged. That's your first piece of evidence." : "Write one line about what you did today. The tour continues when you save."}
        </p>
      </div>,
      document.body,
    );
  }

  // Geometry: viewport coordinates, or relative to the dialog the target lives in.
  const host = container ?? document.body;
  const inHost = !!container;
  const cr = container?.getBoundingClientRect();
  const off = inHost && cr ? { x: cr.left - container!.scrollLeft, y: cr.top - container!.scrollTop } : { x: 0, y: 0 };
  const bounds = inHost && container ? { left: container.scrollLeft, top: container.scrollTop, w: container.clientWidth, h: container.clientHeight } : { left: 0, top: 0, w: vw.w, h: vw.h };
  const hole = rect ? { left: rect.left - off.x - PAD, top: rect.top - off.y - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null;
  const pos2 = inHost ? "absolute" : "fixed";

  const sheet = phone && !inHost;
  const cardW = Math.min(sheet ? bounds.w - 16 : 330, bounds.w - 24);
  let card: React.CSSProperties;
  let side: "below" | "above" | "right" | "left" | "center" = "center";
  let arrowX = 0;
  let arrowY = 0;
  if (sheet) {
    const vh = vw.h;
    // Only a target low on the screen (the tab bar) pushes the sheet above it; a tall section keeps the sheet at the bottom.
    const lowTarget = rect && rect.top > vh * 0.5;
    card = lowTarget && rect ? { left: 8, right: 8, bottom: Math.max(8, vh - rect.top + 14) } : { left: 8, right: 8, bottom: "calc(8px + env(safe-area-inset-bottom))" };
  } else if (!hole) {
    card = { left: bounds.left + (bounds.w - cardW) / 2, top: bounds.top + Math.max(16, (bounds.h - cardH) / 2), width: cardW };
  } else {
    const gap = 14;
    const below = hole.top + hole.height + gap;
    const above = hole.top - gap - cardH;
    const clampX = (x: number) => Math.max(bounds.left + 12, Math.min(x, bounds.left + bounds.w - cardW - 12));
    const clampY = (y: number) => Math.max(bounds.top + 8, Math.min(y, bounds.top + bounds.h - cardH - 8));
    if (below + cardH <= bounds.top + bounds.h - 8) {
      side = "below";
      const left = clampX(hole.left);
      card = { left, top: below, width: cardW };
      arrowX = Math.max(16, Math.min(cardW - 28, hole.left + hole.width / 2 - left - 6));
    } else if (above >= bounds.top + 8) {
      side = "above";
      const left = clampX(hole.left);
      card = { left, top: above, width: cardW };
      arrowX = Math.max(16, Math.min(cardW - 28, hole.left + hole.width / 2 - left - 6));
    } else if (hole.left + hole.width + gap + cardW <= bounds.left + bounds.w - 8) {
      side = "right";
      const top = clampY(hole.top);
      card = { left: hole.left + hole.width + gap, top, width: cardW };
      arrowY = Math.max(14, Math.min(cardH - 26, hole.top + Math.min(hole.height, 80) / 2 - top - 6));
    } else if (hole.left - gap - cardW >= bounds.left + 8) {
      side = "left";
      const top = clampY(hole.top);
      card = { left: hole.left - gap - cardW, top, width: cardW };
      arrowY = Math.max(14, Math.min(cardH - 26, hole.top + Math.min(hole.height, 80) / 2 - top - 6));
    } else {
      // A target taller than the screen: the card sits inside its lower edge.
      card = { left: clampX(hole.left + 12), top: bounds.top + bounds.h - cardH - 16, width: cardW };
    }
  }

  const empty = step.preview && els.current[0]?.dataset.tourEmpty === "true";
  const confirm = run.phase === "confirm";
  const seeking = run.phase === "seek";
  const isAction = !!step.action && !confirm;
  const text = phone ? step.short : step.text;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!sheet || e.pointerType === "mouse") return;
    const handle = (e.target as HTMLElement).closest("[data-handle]") !== null;
    swipe.current = { x: e.clientX, y: e.clientY, handle };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > Math.abs(dy)) setDrag({ x: dx, y: 0 });
    else if (s.handle && dy > 0) setDrag({ x: 0, y: dy });
  };
  const onPointerUp = () => {
    const d = drag;
    swipe.current = null;
    setDrag(null);
    if (!d) return;
    const w = cardRef.current?.offsetWidth ?? 320;
    if (d.x < -w * 0.25) next();
    else if (d.x > w * 0.25) back();
    else if (d.y > 60) pause();
  };

  return createPortal(
    <>
      {/* Click shield: the tour can't be lost by a stray click. Action steps leave the target clickable. */}
      {full && !seeking && (
        <>
          {isAction && hole ? (
            <>
              <div className="fixed inset-x-0 top-0 z-[80]" style={{ height: Math.max(0, hole.top) }} />
              <div className="fixed inset-x-0 bottom-0 z-[80]" style={{ top: hole.top + hole.height }} />
              <div className="fixed left-0 z-[80]" style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }} />
              <div className="fixed right-0 z-[80]" style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} />
            </>
          ) : (
            <div className="fixed inset-0 z-[80]" aria-hidden />
          )}
        </>
      )}
      {full && !hole && <div className="rf-tour-fade fixed inset-0 z-[80] bg-[var(--tour-scrim)]" aria-hidden />}
      {hole &&
        createPortal(
          <div
            aria-hidden
            className={cn("rf-tour-spot pointer-events-none z-[81]", full ? "rf-tour-ring-full" : "rf-tour-ring")}
            style={{ position: pos2, left: hole.left, top: hole.top, width: hole.width, height: hole.height, borderRadius: radius }}
          >
            {/* Re-keyed per step so the glow swells once on each arrival. */}
            {!seeking && <span key={step.id} className="rf-tour-ring-arrive absolute inset-0 rounded-[inherit]" />}
          </div>,
          host,
        )}
      {!seeking &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-modal={full || undefined}
            aria-labelledby="rf-tour-title"
            className={cn(
              "z-[82] overflow-visible border bg-card text-card-foreground shadow-[var(--shadow-pop)] transition-opacity duration-100",
              sheet ? "rounded-2xl" : "rounded-xl",
              cardOut && "opacity-0",
            )}
            style={{
              position: pos2,
              ...card,
              transform: drag ? `translate(${drag.x}px, ${drag.y}px)` : undefined,
              transition: drag ? "none" : undefined,
              touchAction: sheet ? "pan-y" : undefined,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {!sheet && side !== "center" && (
              <span
                aria-hidden
                className="absolute size-3 rotate-45 border-t border-l bg-card"
                style={
                  side === "below"
                    ? { top: -6.5, left: arrowX }
                    : side === "above"
                      ? { bottom: -6.5, left: arrowX, transform: "rotate(225deg)" }
                      : side === "right"
                        ? { left: -6.5, top: arrowY, transform: "rotate(-45deg)" }
                        : { right: -6.5, top: arrowY, transform: "rotate(135deg)" }
                }
              />
            )}
            {sheet && <div data-handle className="mx-auto mt-2 h-1 w-9 rounded-full bg-border" aria-hidden />}
            <div className={cn("relative overflow-hidden", sheet ? "mx-4 mt-2 rounded-full" : "rounded-t-xl")}>
              <div className="h-[3px] bg-sunken">
                <i className="block h-full bg-grad-primary transition-[width] duration-300 ease-out" style={{ width: `${(Math.max(1, pos) / Math.max(1, total)) * 100}%` }} />
              </div>
            </div>
            <div key={`${step.id}-${confirm}`} className={cn("rf-tour-card-in grid gap-1.5 px-4 pt-3", sheet ? "pb-[calc(12px+env(safe-area-inset-bottom))]" : "pb-3")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-primary uppercase">{step.chapter}</span>
                <span className="font-mono text-[11.5px] tabular text-muted-foreground">
                  {pos} of {total}
                </span>
              </div>
              <h2 id="rf-tour-title" className="text-[15.5px] leading-snug font-semibold tracking-tight">
                {confirm ? "Skip the tour?" : step.title}
              </h2>
              <p className="text-[13.5px] leading-relaxed text-foreground/80">{confirm ? "You can replay it anytime from Help (?)." : text}</p>
              {!confirm && !phone && step.why && <p className="border-l-2 border-primary/35 pl-2 text-[12.5px] text-muted-foreground">{step.why}</p>}
              {!confirm && empty && (
                <div className="mt-1 grid gap-1 rounded-lg border border-dashed bg-surface-2/60 p-2 grayscale" aria-label="Preview">
                  {step.preview!.map((row) => (
                    <span key={row} className="truncate rounded-md border bg-card px-2 py-1 text-[11.5px] text-muted-foreground">
                      {row}
                    </span>
                  ))}
                  <span className="text-[10.5px] text-muted-foreground">What this looks like with work in it</span>
                </div>
              )}
              {!confirm && installHelp && (
                <p className="rounded-lg bg-muted px-3 py-2 text-[12.5px]">
                  {install.state === "ios" ? "On iPhone: tap Share, then Add to Home Screen." : "Open ResearchFlow in Chrome or Safari, then choose Install app from the menu."}
                </p>
              )}
              {isAction && (
                <Button className={cn("mt-1 w-full", sheet && "h-11")} onClick={() => void doAction()} ref={step.action?.kind === "log" ? nextRef : undefined}>
                  {step.action!.label}
                </Button>
              )}
              <div className={cn("flex items-center gap-1.5 pt-1", sheet && "gap-2")}>
                {confirm ? (
                  <>
                    <Button variant="ghost" size="sm" className={cn(sheet && "h-11 flex-1")} onClick={confirmSkip}>
                      Skip
                    </Button>
                    <span className="flex-1 max-sm:hidden" />
                    <Button size="sm" className={cn(sheet && "h-11 flex-1")} onClick={next} ref={nextRef}>
                      Keep going
                    </Button>
                  </>
                ) : sheet ? (
                  <>
                    <Button variant="outline" className="h-11 flex-1" onClick={askSkip}>
                      Skip
                    </Button>
                    <Button variant={isAction ? "outline" : "default"} className="h-11 flex-1" onClick={next} ref={isAction ? undefined : nextRef}>
                      {last ? "Finish" : "Next"}
                    </Button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={askSkip} className="rounded px-1 py-1 text-[12.5px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                      Skip tour
                    </button>
                    <span className="flex-1" />
                    {!first && (
                      <Button variant="ghost" size="sm" onClick={back}>
                        Back
                      </Button>
                    )}
                    <Button size="sm" variant={isAction ? "outline" : "default"} onClick={next} ref={isAction ? undefined : nextRef}>
                      {last ? "Finish" : "Next"}
                    </Button>
                  </>
                )}
              </div>
              {sheet && !confirm && <p className="text-center text-[11px] text-muted-foreground">Swipe ← → to move · ↓ to pause</p>}
            </div>
            <p className="sr-only" aria-live="polite">
              {confirm ? "Skip the tour?" : `Step ${pos} of ${total}. ${step.title}.`}
            </p>
          </div>,
          host,
        )}
    </>,
    document.body,
  );
}
