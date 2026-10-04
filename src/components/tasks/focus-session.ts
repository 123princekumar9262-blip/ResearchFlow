"use client";

import { useSyncExternalStore } from "react";

/**
 * The running focus session, kept on this device so leaving focus mode (Esc,
 * another page) doesn't stop the clock. The top bar shows it as a pill.
 */
export interface FocusSession {
  taskId: string;
  projectId: string;
  title: string;
  /** Seconds counted before the current run. */
  elapsed: number;
  /** When the current run started (ms), or null while paused. */
  startedAt: number | null;
}

const KEY = "rf.focus.session";
const EVENT = "rf:focus";
const notesKey = (taskId: string) => `rf.focus.notes.${taskId}`;

let cachedRaw: string | null | undefined;
let cached: FocusSession | null = null;

export function readSession(): FocusSession | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = raw ? (JSON.parse(raw) as FocusSession) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function writeSession(s: FocusSession | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Seconds so far. `now` 0 (not measured yet) counts only the finished runs. */
export function secondsOf(s: FocusSession | null, now: number): number {
  if (!s) return 0;
  return s.elapsed + (s.startedAt && now ? Math.max(0, Math.floor((now - s.startedAt) / 1000)) : 0);
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useFocusSession(): FocusSession | null {
  return useSyncExternalStore(subscribe, readSession, () => null);
}

export function readNotes(taskId: string): string {
  try {
    return localStorage.getItem(notesKey(taskId)) ?? "";
  } catch {
    return "";
  }
}

export function writeNotes(taskId: string, text: string) {
  try {
    if (text) localStorage.setItem(notesKey(taskId), text);
    else localStorage.removeItem(notesKey(taskId));
  } catch {
    /* storage blocked */
  }
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${String(h).padStart(2, "0")}:${m}:${s}` : `${m}:${s}`;
}
