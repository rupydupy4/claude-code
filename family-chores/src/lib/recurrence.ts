import { addDays, isoWeekday } from './dates';
import type { Chore, Repeat } from './types';

export const WEEKDAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 7, short: 'Sun', long: 'Sunday' },
] as const;

/** Sorted, unique, 1–7 only. */
export function cleanDays(days: number[]) {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
}

/**
 * The first day after `after` that matches the rule. Mirrors public.next_due_date in the
 * database (the database is what actually schedules the next chore).
 */
export function nextDueDate(after: string, repeat: Repeat, days: number[] = []): string | null {
  if (repeat === 'daily') return addDays(after, 1);
  if (repeat === 'weekly') {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(after, i);
      if (days.includes(isoWeekday(d))) return d;
    }
  }
  return null;
}

/** When a repeating chore is approved today, the next one is due on this day. */
export function nextAfterApproval(chore: Pick<Chore, 'due_date' | 'repeat' | 'repeat_days'>, today: string) {
  const from = chore.due_date && chore.due_date > today ? chore.due_date : today;
  return nextDueDate(from, chore.repeat, chore.repeat_days);
}

/** "Every day", "Every Mon, Wed and Fri", "Weekdays", "Every week on Saturday". */
export function describeRepeat(repeat: Repeat, days: number[] = []): string | null {
  if (repeat === 'daily') return 'Every day';
  if (repeat !== 'weekly') return null;
  const d = cleanDays(days);
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '6,7') return 'Weekends';
  if (d.length === 1) return `Every ${WEEKDAYS[d[0] - 1].long}`;
  const names = d.map((n) => WEEKDAYS[n - 1].short);
  return `Every ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
