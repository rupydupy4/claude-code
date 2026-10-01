import type { DateKey, Recurrence, TimeOfDay, Timestamp } from '../domain/types';

/** Calendar maths on local dates (YYYY-MM-DD); never divides elapsed milliseconds into days. */

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (d: Date): DateKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = (now = new Date()) => toDateKey(now);
export const toTime = (d: Date): TimeOfDay => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function isDateKey(v: unknown): v is DateKey {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
export const isTime = (v: unknown): v is TimeOfDay => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function fromDateKey(k: DateKey, time: TimeOfDay = '12:00'): Date {
  const [y, m, d] = k.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function addDays(k: DateKey, n: number): DateKey {
  const [y, m, d] = k.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n, 12));
}

export function diffDays(a: DateKey, b: DateKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export const dayOfWeek = (k: DateKey) => fromDateKey(k).getDay();

export function startOfWeek(k: DateKey, weekStartsOn: 0 | 1 = 1): DateKey {
  return addDays(k, -((dayOfWeek(k) - weekStartsOn + 7) % 7));
}

/** Parses "YYYY-MM-DDTHH:MM" (local), a full ISO string, or a date key into a Date; null if invalid. */
export function parseLocalDateTime(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?$/.exec(v.trim());
  if (m) {
    if (!isDateKey(m[1]) || (m[2] && !isTime(m[2]))) return null;
    return fromDateKey(m[1], m[2] ?? '09:00');
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

export const localDateOf = (iso: Timestamp): DateKey => toDateKey(new Date(iso));
export const localTimeOf = (iso: Timestamp): TimeOfDay => toTime(new Date(iso));

export function formatDay(k: DateKey, today = todayKey()): string {
  const d = diffDays(today, k);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions = d > 1 && d < 7 ? { weekday: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' };
  return fromDateKey(k).toLocaleDateString(undefined, opts);
}

export function formatTime(t: TimeOfDay): string {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatWhen(iso: Timestamp, today = todayKey()): string {
  return `${formatDay(localDateOf(iso), today)} at ${formatTime(localTimeOf(iso))}`;
}

export function formatDateLong(k: DateKey) {
  return fromDateKey(k).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Next occurrence strictly after `after` for a recurring time. */
export function nextOccurrence(atIso: Timestamp, recurrence: Recurrence, after: Date): Date | null {
  if (recurrence === 'none') return null;
  let d = new Date(atIso);
  const step = (x: Date, days: number) => { const n = new Date(x); n.setDate(n.getDate() + days); return n; };
  for (let i = 0; i < 1000 && d <= after; i++) {
    switch (recurrence) {
      case 'daily':
        d = step(d, 1);
        break;
      case 'weekdays':
        d = step(d, 1);
        while (d.getDay() === 0 || d.getDay() === 6) d = step(d, 1);
        break;
      case 'weekly':
        d = step(d, 7);
        break;
      case 'monthly': {
        const day = new Date(atIso).getDate();
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
        const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(day, last));
        d = next;
        break;
      }
    }
  }
  return d;
}

export function recurrenceLabel(r: Recurrence, atIso?: Timestamp): string {
  const day = atIso ? new Date(atIso).toLocaleDateString(undefined, { weekday: 'long' }) : '';
  return { none: 'Once', daily: 'Every day', weekdays: 'Every weekday', weekly: `Every ${day || 'week'}`, monthly: 'Every month' }[r];
}

export const nowIso = () => new Date().toISOString();

export function greetingFor(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
