import type { DateKey, TimeOfDay } from '../models/types';

/**
 * All day arithmetic works on local calendar dates (YYYY-MM-DD), never on elapsed
 * milliseconds, so daylight-saving changes and time-zone moves don't skip or double days.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Local Date at noon on the given day (noon avoids DST edge cases at midnight). */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n, 12));
}

/** Whole calendar days from a to b (positive when b is later). */
export function diffDays(a: DateKey, b: DateKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function dayOfWeek(key: DateKey): number {
  return fromDateKey(key).getDay();
}

/** Inclusive list of days from start to end. */
export function dateRange(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

/** Last `n` days ending today (inclusive), oldest first. */
export function lastNDays(n: number, today: DateKey = todayKey()): DateKey[] {
  return dateRange(addDays(today, -(n - 1)), today);
}

export function startOfWeek(key: DateKey, weekStartsOn: 0 | 1 = 1): DateKey {
  const dow = dayOfWeek(key);
  const back = (dow - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}

export function formatDate(key: DateKey, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return fromDateKey(key).toLocaleDateString(undefined, opts);
}

export function formatTime(time: TimeOfDay): string {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function nowTime(now: Date = new Date()): TimeOfDay {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function minutesOfDay(time: TimeOfDay): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** True when `time` falls inside a window that may wrap past midnight (e.g. 22:00–07:00). */
export function inWindow(time: TimeOfDay, start: TimeOfDay, end: TimeOfDay): boolean {
  const t = minutesOfDay(time), s = minutesOfDay(start), e = minutesOfDay(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export function partOfDay(time: TimeOfDay): 'Night' | 'Morning' | 'Afternoon' | 'Evening' {
  const h = Number(time.slice(0, 2));
  if (h < 5) return 'Night';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 22) return 'Evening';
  return 'Night';
}

export function nowIso(): string {
  return new Date().toISOString();
}
