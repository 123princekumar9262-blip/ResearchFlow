"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveOnboarding } from "@/server/actions/onboarding";
import { daysBetween } from "@/lib/domain/dates";
import type { ChapterId, Onboarding, TourId } from "@/lib/onboarding/state";
import { PARTS, tourSteps, type TourContext } from "@/lib/onboarding/tours";
import { TourRunner } from "./tour-runner";

export interface StartOptions {
  /** A part of a chapter that plays on its own, e.g. "tasks-dialog". */
  part?: string;
  /** Started by the app, not the user: skip steps the core tour already covered. */
  auto?: boolean;
  /** Resume the core tour at this step. */
  fromStep?: number;
}

export interface TourRequest {
  tour: TourId;
  opts: StartOptions;
  /** Bumped on every request so the same tour can be asked for twice. */
  n: number;
}

export interface Basics {
  userId: string;
  role: "student" | "professor";
  today: string;
  createdAt: string;
  hasProfessor: boolean;
  firstProjectId: string | null;
  firstTaskId: string | null;
  remarksProjectId: string | null;
  weekStart: string;
  reportPath: string | null;
}

interface Api extends Basics {
  state: Onboarding;
  /** Saved on the account (false until migration 8 is applied: this device only). */
  persisted: boolean;
  update: (patch: Partial<Onboarding>) => void;
  running: TourId | null;
  start: (tour: TourId, opts?: StartOptions) => void;
  /** Offer a chapter with "Quick look at this page?" instead of starting it. */
  offer: (tour: ChapterId, opts?: StartOptions) => void;
  markSeen: (key: string) => void;
  isSeen: (key: string) => boolean;
  accountAge: number;
  resumeStep: number | null;
  context: (here?: string) => TourContext;
  // Tips
  tipSlot: string | null;
  tipAllowed: (id: string) => boolean;
  requestTip: (id: string) => void;
  releaseTip: (id: string) => void;
  dismissTip: (id: string, kind: "state" | "discovery") => void;
  checklist: { done: number; total: number } | null;
  setChecklist: (c: { done: number; total: number } | null) => void;
}

const Ctx = createContext<Api | null>(null);

export function useOnboarding(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useOnboarding outside OnboardingProvider");
  return api;
}

/** Same as useOnboarding, but null outside the app shell (e.g. on /welcome). */
export function useOnboardingMaybe(): Api | null {
  return useContext(Ctx);
}

const SESSION_AUTO = "rf.tour.auto";
const SESSION_TIPS = "rf.tips.session";

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

function isPhone() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}
function isInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function OnboardingProvider({ basics, initial, persisted, children }: { basics: Basics; initial: Onboarding; persisted: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const localKey = `rf.onboarding.${basics.userId}`;

  const [state, setState] = useState<Onboarding>(() => {
    if (persisted || typeof window === "undefined") return initial;
    try {
      return { ...initial, ...(JSON.parse(localStorage.getItem(localKey) ?? "{}") as Onboarding) };
    } catch {
      return initial;
    }
  });
  // update() keeps this current itself, so back-to-back changes merge correctly.
  const stateRef = useRef(state);

  const update = useCallback(
    (patch: Partial<Onboarding>) => {
      const next = { ...stateRef.current, ...patch };
      stateRef.current = next;
      setState(next);
      try {
        localStorage.setItem(localKey, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      if (persisted) void saveOnboarding(patch);
    },
    [localKey, persisted],
  );

  const markSeen = useCallback(
    (key: string) => {
      const seen = stateRef.current.seen ?? [];
      if (!seen.includes(key)) update({ seen: [...seen, key].slice(-40) });
    },
    [update],
  );
  const isSeen = useCallback((key: string) => (stateRef.current.seen ?? []).includes(key), []);

  const [request, setRequest] = useState<TourRequest | null>(null);
  const [running, setRunning] = useState<TourId | null>(null);
  const [offered, setOffered] = useState<{ tour: ChapterId; opts: StartOptions; steps: number; path: string } | null>(null);
  const counter = useRef(0);

  const context = useCallback(
    (here?: string): TourContext => {
      const path = here ?? (typeof window !== "undefined" ? window.location.pathname : "/dashboard");
      const onProject = path.match(/^\/projects\/([0-9a-f-]{36})/i)?.[1];
      const onTask = path.match(/^\/tasks\/([0-9a-f-]{36})/i)?.[1];
      return {
        role: basics.role,
        phone: isPhone(),
        hasProfessor: basics.hasProfessor,
        projectId: onProject ?? basics.firstProjectId,
        taskId: onTask ?? basics.firstTaskId,
        remarksProjectId: basics.remarksProjectId,
        weekStart: basics.weekStart,
        reportPath: basics.reportPath,
        installed: isInstalled(),
        here: path,
      };
    },
    [basics],
  );

  const start = useCallback((tour: TourId, opts: StartOptions = {}) => {
    setOffered(null);
    counter.current += 1;
    setRequest({ tour, opts, n: counter.current });
  }, []);

  const offer = useCallback(
    (tour: ChapterId, opts: StartOptions = {}) => {
      const steps = tourSteps(tour, context()).filter((s) => !(opts.auto && s.core));
      setOffered({ tour, opts, steps: steps.length, path: window.location.pathname });
    },
    [context],
  );

  // A pending offer belongs to the page it was made on.
  const offeredHere = offered && offered.path === pathname ? offered : null;

  // Setup hands over with ?tour=core; the tour starts once the dashboard is in.
  useEffect(() => {
    if (pathname !== "/dashboard" || new URLSearchParams(window.location.search).get("tour") !== "core") return;
    router.replace("/dashboard", { scroll: false });
    const t = setTimeout(() => start("core"), 400);
    return () => clearTimeout(t);
  }, [pathname, router, start]);

  // Help, the command palette and the shortcuts dialog ask for tours by event.
  useEffect(() => {
    const onTour = (e: Event) => {
      const detail = (e as CustomEvent<{ tour: TourId; opts?: StartOptions }>).detail;
      if (detail?.tour) start(detail.tour, detail.opts);
    };
    window.addEventListener("rf:tour", onTour);
    return () => window.removeEventListener("rf:tour", onTour);
  }, [start]);

  const accountAge = Math.max(0, daysBetween(basics.createdAt.slice(0, 10), basics.today));
  const resumeStep =
    state.core === "paused" && state.step !== undefined && (!state.pausedOn || daysBetween(state.pausedOn, basics.today) <= 7) ? state.step : null;

  // ───────────── tips: one on screen, two per session, none during a tour ─────────────
  const [tipSlot, setTipSlot] = useState<string | null>(null);
  const candidates = useRef<string[]>([]);
  const recompute = useCallback(() => {
    if (running) return setTipSlot(null);
    setTipSlot((slot) => {
      if (slot && candidates.current.includes(slot)) return slot;
      const shown = readSession<string[]>(SESSION_TIPS, []);
      const pick = candidates.current.find((id) => shown.includes(id) || shown.length < 2) ?? null;
      if (pick && !shown.includes(pick)) writeSession(SESSION_TIPS, [...shown, pick]);
      return pick;
    });
  }, [running]);
  useEffect(() => {
    const t = setTimeout(recompute, 0);
    return () => clearTimeout(t);
  }, [recompute]);

  const requestTip = useCallback(
    (id: string) => {
      if (!candidates.current.includes(id)) candidates.current.push(id);
      recompute();
    },
    [recompute],
  );
  const releaseTip = useCallback(
    (id: string) => {
      candidates.current = candidates.current.filter((x) => x !== id);
      setTipSlot((slot) => (slot === id ? null : slot));
      setTimeout(recompute, 0);
    },
    [recompute],
  );
  const tipAllowed = useCallback(
    (id: string) => !(state.off ?? []).includes(id) && state.snooze?.[id] !== basics.today,
    [state.off, state.snooze, basics.today],
  );
  const dismissTip = useCallback(
    (id: string, kind: "state" | "discovery") => {
      if (kind === "discovery") update({ off: [...(stateRef.current.off ?? []), id].slice(-40) });
      else update({ snooze: { ...(stateRef.current.snooze ?? {}), [id]: basics.today } });
      releaseTip(id);
    },
    [update, releaseTip, basics.today],
  );

  const [checklist, setChecklist] = useState<{ done: number; total: number } | null>(null);

  const api = useMemo<Api>(
    () => ({
      ...basics,
      state,
      persisted,
      update,
      running,
      start,
      offer,
      markSeen,
      isSeen,
      accountAge,
      resumeStep,
      context,
      tipSlot,
      tipAllowed,
      requestTip,
      releaseTip,
      dismissTip,
      checklist,
      setChecklist,
    }),
    [basics, state, persisted, update, running, start, offer, markSeen, isSeen, accountAge, resumeStep, context, tipSlot, tipAllowed, requestTip, releaseTip, dismissTip, checklist],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <TourRunner
        request={request}
        onRunning={setRunning}
        offered={offeredHere}
        onOffer={(accept) => {
          const o = offeredHere;
          setOffered(null);
          if (!o) return;
          if (accept) start(o.tour, o.opts);
          else markSeen(o.opts.part ?? o.tour);
        }}
      />
    </Ctx.Provider>
  );
}

/** Starts a tour from anywhere (Help, the command palette). */
export function requestTour(tour: TourId, opts?: StartOptions) {
  window.dispatchEvent(new CustomEvent("rf:tour", { detail: { tour, opts } }));
}

/** Whether an automatic chapter may start now (one per session; one a day after week one). */
export function autoAllowed(api: Api): boolean {
  if (api.running) return false;
  if (api.state.core !== "done" && api.state.core !== "skipped") return false;
  if ((api.state.skips ?? 0) >= 2) return false;
  if (readSession<boolean>(SESSION_AUTO, false)) return false;
  if (api.accountAge >= 7 && api.state.autoOn === api.today) return false;
  return true;
}

export function noteAutoStarted(api: Api) {
  writeSession(SESSION_AUTO, true);
  api.update({ autoOn: api.today });
}

export function partSteps(part: string | undefined) {
  return part ? PARTS[part] : undefined;
}

export function useTourToast() {
  return useCallback(() => toast("Tour paused. Resume it from Help (?)."), []);
}
