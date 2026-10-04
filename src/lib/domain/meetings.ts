import { addDays, dateIn, todayIn } from "./dates";

/** "4:00 pm" in the reader's time zone. */
export function formatTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(instant)).toLowerCase();
}

/** "Today, 4:00 pm", "Tomorrow, 4:00 pm", or "Thu 8 Oct, 4:00 pm". */
export function formatMeetingTime(instant: string, timeZone: string, now: Date = new Date()): string {
  const day = dateIn(instant, timeZone);
  const today = todayIn(timeZone, now);
  const label =
    day === today ? "Today"
    : day === addDays(today, 1) ? "Tomorrow"
    : day === addDays(today, -1) ? "Yesterday"
    : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone }).format(new Date(instant));
  return `${label}, ${formatTime(instant, timeZone)}`;
}

/** Upcoming (soonest first, including one that started under two hours ago) and past (newest first). */
export function splitMeetings<M extends { starts_at: string; status: string }>(meetings: M[], now: Date = new Date()): { upcoming: M[]; past: M[] } {
  const cutoff = now.getTime() - 2 * 3_600_000;
  const upcoming = meetings.filter((m) => m.status === "scheduled" && new Date(m.starts_at).getTime() >= cutoff).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = meetings.filter((m) => !upcoming.includes(m)).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { upcoming, past };
}
