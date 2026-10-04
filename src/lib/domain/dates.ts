// Calendar-date helpers. Deadlines and log dates are plain "YYYY-MM-DD" strings
// meaning a day in the user's timezone; all arithmetic happens on those strings
// via UTC midnight, so no local clock can shift a date by one.

export type ISODate = string;

const DAY_MS = 86_400_000;

/** Today's date in `timeZone`, e.g. "2026-10-03". */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  return dateIn(now, timeZone);
}

/** The calendar date an instant falls on in `timeZone`. */
export function dateIn(instant: Date | string, timeZone: string): ISODate {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function toUTC(date: ISODate): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: ISODate): number {
  const day = new Date(toUTC(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The Monday on or before `date`. */
export function weekStartOf(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date));
}

/** ISO-8601 week number. */
export function isoWeekNumber(date: ISODate): number {
  const thursday = addDays(date, 4 - isoWeekday(date));
  const yearStart = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(yearStart, thursday) / 7) + 1;
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUTC(toUTC(value)) === value;
}

export function monthStartOf(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: ISODate, months: number): ISODate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  return fromUTC(Date.UTC(year, month, 1));
}

/** Every date from `from` to `to`, inclusive. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const days: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 6 Oct" (adds the year when it isn't `referenceYear`). */
export function formatDay(date: ISODate, referenceYear?: number): string {
  const label = `${WEEKDAYS[isoWeekday(date) - 1]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
  const year = Number(date.slice(0, 4));
  return referenceYear !== undefined && year !== referenceYear ? `${label} ${year}` : label;
}

export function formatShortDate(date: ISODate): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** A week by its dates, Monday to Sunday: "28 Sep – 4 Oct". */
export function formatWeek(weekStart: ISODate): string {
  return `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`;
}

export function formatMonth(date: ISODate): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 2026", for headings. */
export function formatMonthLong(date: ISODate): string {
  return `${MONTHS_LONG[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export function weekdayShort(index: number): string {
  return WEEKDAYS[index];
}

/** "2h 30m", "45m", "0m". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Minutes from what people type for time spent: "3h 10m", "3h", "45m",
 * "1.5h", "1:30", or a bare number (minutes; "2"–"12" read as hours).
 * Null when it can't be read.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  const clock = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const bare = s.match(/^\d+(\.\d+)?$/);
  if (bare) {
    const n = Number(s);
    return n <= 12 ? Math.round(n * 60) : Math.round(n);
  }
  const parts = s.match(/^(?:(\d+(?:\.\d+)?) ?(?:h|hr|hrs|hours?))? ?(?:(\d+) ?(?:m|min|mins|minutes?))?$/);
  if (!parts || (parts[1] === undefined && parts[2] === undefined)) return null;
  return Math.round(Number(parts[1] ?? 0) * 60) + Number(parts[2] ?? 0);
}

/** "just now", "5m ago", "3h ago", "2d ago", "6 Oct". */
export function timeAgo(instant: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(instant).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatShortDate(new Date(instant).toISOString().slice(0, 10));
}

const WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function weekdayIndex(word: string): number {
  if (word.length < 2) return -1;
  return WEEKDAY_NAMES.findIndex((d) => d.startsWith(word));
}

function monthIndex(word: string): number {
  if (word.length < 3) return -1;
  return MONTH_NAMES.findIndex((m) => m.startsWith(word));
}

/** The next calendar date with this day-of-month and month, on or after `today`. */
function nextDayMonth(today: ISODate, day: number, month: number): ISODate | null {
  for (const year of [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]) {
    const candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isValidISODate(candidate) && candidate >= today) return candidate;
  }
  return null;
}

/**
 * Reads the dates people type: "today", "tomorrow", "fri", "next fri",
 * "in 3 days", "2w", "eow", "eom", "7 oct", "oct 7", "7/10" (day first),
 * "2026-10-07", or a bare day of the month. Returns null when it can't tell.
 */
export function parseDateInput(input: string, today: ISODate): ISODate | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]$/, "");
  if (!text) return null;
  if (isValidISODate(text)) return text;
  if (["today", "tod", "now"].includes(text)) return today;
  if (["tomorrow", "tmr", "tom", "tmrw"].includes(text)) return addDays(today, 1);
  if (text === "yesterday") return addDays(today, -1);
  if (text === "eow" || text === "end of week") {
    const friday = addDays(today, 5 - isoWeekday(today));
    return friday >= today ? friday : addDays(friday, 7);
  }
  if (text === "eom" || text === "end of month") return addDays(addMonths(today, 1), -1);

  const rel = text.match(/^(?:in\s+|\+)?(\d{1,3})\s*(d|day|days|w|wk|week|weeks|m|mo|month|months)$/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2][0];
    if (unit === "d") return addDays(today, n);
    if (unit === "w") return addDays(today, 7 * n);
    const target = addMonths(today, n);
    const day = Math.min(Number(today.slice(8, 10)), Number(addDays(addMonths(target, 1), -1).slice(8, 10)));
    return `${target.slice(0, 8)}${String(day).padStart(2, "0")}`;
  }

  const weekday = text.match(/^(next |this )?([a-z]+)$/);
  if (weekday) {
    const idx = weekdayIndex(weekday[2]);
    if (idx >= 0) {
      const target = idx + 1;
      if (weekday[1] === "next ") {
        // The named day in next calendar week.
        return addDays(weekStartOf(today), 7 + target - 1);
      }
      const diff = (target - isoWeekday(today) + 7) % 7;
      return addDays(today, diff === 0 ? 7 : diff);
    }
  }

  const dayMonth = text.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)$/) ?? text.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/);
  if (dayMonth) {
    const [a, b] = dayMonth.slice(1);
    const day = Number(/\d/.test(a) ? a : b);
    const month = monthIndex(/\d/.test(a) ? b : a);
    if (month >= 0) return nextDayMonth(today, day, month);
  }

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    if (slash[3]) {
      const year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
      const candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return isValidISODate(candidate) ? candidate : null;
    }
    return nextDayMonth(today, day, month);
  }

  if (/^\d{1,2}$/.test(text)) {
    const day = Number(text);
    for (let i = 0; i < 3; i++) {
      const month = addMonths(today, i);
      const candidate = `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
      if (isValidISODate(candidate) && candidate >= today) return candidate;
    }
  }
  return null;
}
