import type { CheckInStatus, DateKey, Habit, HabitCheckIn, HabitEvent } from '../models/types';
import { addDays, diffDays, startOfWeek, todayKey } from './dates';

/**
 * STREAK AND DAY-STATUS RULES (documented in README)
 *
 * Day status for one habit on one day:
 * - An explicit check-in is the user's own judgement and always wins.
 * - Otherwise, if events were logged that day:
 *     abstinence  → any occurrence means "notMet".
 *     frequency / time / quantity with a daily limit → total ≤ limit is "met", else "notMet".
 *     replacement with a daily target → total ≥ target is "met", > 0 is "partial".
 * - Days with no record are "none" — never treated as failures.
 * - Observation habits have no success/failure status ("n/a").
 *
 * Streaks count consecutive "met" days. "partial", "notMet" and unrecorded days end a streak
 * (unrecorded days just aren't known to be successes). Today not being recorded yet does not
 * end the current streak — counting starts from yesterday until today is recorded.
 */
export type DayStatus = CheckInStatus | 'none' | 'n/a';

export interface HabitIndex {
  checkIns: Map<DateKey, HabitCheckIn>;
  totals: Map<DateKey, number>;
  counts: Map<DateKey, number>;
  events: HabitEvent[];
}

export function indexHabit(habitId: string, checkIns: HabitCheckIn[], events: HabitEvent[]): HabitIndex {
  const ci = new Map<DateKey, HabitCheckIn>();
  for (const c of checkIns) if (c.habitId === habitId) ci.set(c.date, c);
  const totals = new Map<DateKey, number>();
  const counts = new Map<DateKey, number>();
  const evs: HabitEvent[] = [];
  for (const e of events) {
    if (e.habitId !== habitId) continue;
    evs.push(e);
    totals.set(e.date, (totals.get(e.date) ?? 0) + e.amount);
    counts.set(e.date, (counts.get(e.date) ?? 0) + 1);
  }
  evs.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  return { checkIns: ci, totals, counts, events: evs };
}

export function hasStatus(habit: Habit): boolean {
  if (habit.mode === 'observation') return false;
  if (habit.mode === 'abstinence') return true;
  if (habit.mode === 'replacement') return true;
  return habit.goal.daily !== undefined;
}

export function dayStatus(habit: Habit, idx: HabitIndex, date: DateKey): DayStatus {
  if (habit.mode === 'observation') return 'n/a';
  const ci = idx.checkIns.get(date);
  if (ci) return ci.status;
  const total = idx.totals.get(date);
  if (total === undefined) return 'none';
  switch (habit.mode) {
    case 'abstinence':
      return 'notMet';
    case 'replacement': {
      const target = habit.goal.daily ?? 1;
      return total >= target ? 'met' : total > 0 ? 'partial' : 'none';
    }
    default:
      if (habit.goal.daily === undefined) return 'none';
      return total <= habit.goal.daily ? 'met' : 'notMet';
  }
}

/** Every day with any record for this habit, sorted ascending. */
function recordedDays(idx: HabitIndex): DateKey[] {
  return Array.from(new Set([...idx.checkIns.keys(), ...idx.totals.keys()])).sort();
}

export function currentStreak(habit: Habit, idx: HabitIndex, today: DateKey = todayKey()): number {
  if (!hasStatus(habit)) return 0;
  let day = today;
  if (dayStatus(habit, idx, today) === 'none') day = addDays(today, -1);
  let n = 0;
  // Bounded by the number of recorded days, so this never runs away on sparse history.
  const limit = idx.checkIns.size + idx.totals.size + 1;
  while (n <= limit && dayStatus(habit, idx, day) === 'met') {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(habit: Habit, idx: HabitIndex, today: DateKey = todayKey()): number {
  if (!hasStatus(habit)) return 0;
  let best = 0, run = 0;
  let prev: DateKey | null = null;
  for (const day of recordedDays(idx)) {
    if (day > today) break;
    if (dayStatus(habit, idx, day) === 'met') {
      run = prev !== null && diffDays(prev, day) === 1 ? run + 1 : 1;
      prev = day;
      best = Math.max(best, run);
    } else {
      run = 0;
      prev = null;
    }
  }
  return best;
}

export function successfulDays(habit: Habit, idx: HabitIndex): number {
  if (!hasStatus(habit)) return 0;
  return recordedDays(idx).filter((d) => dayStatus(habit, idx, d) === 'met').length;
}

export function totalBetween(idx: HabitIndex, start: DateKey, end: DateKey): number {
  let sum = 0;
  for (const [d, v] of idx.totals) if (d >= start && d <= end) sum += v;
  return sum;
}

export function weekTotal(idx: HabitIndex, today: DateKey, weekStartsOn: 0 | 1): number {
  return totalBetween(idx, startOfWeek(today, weekStartsOn), today);
}

export interface HabitSummary {
  status: DayStatus;
  todayTotal: number;
  weekTotal: number;
  lastWeekTotal: number;
  current: number;
  best: number;
  successDays: number;
  eventCount: number;
  /** 0–1 progress towards (or within) today's target, when a target applies. */
  progress: number | null;
  daysSinceLast: number | null;
}

export function summarizeHabit(habit: Habit, idx: HabitIndex, today: DateKey, weekStartsOn: 0 | 1): HabitSummary {
  const todayTotal = idx.totals.get(today) ?? 0;
  const ws = startOfWeek(today, weekStartsOn);
  const wt = totalBetween(idx, ws, today);
  const lastWeekStart = addDays(ws, -7);
  // Compare like with like: the same number of days into last week.
  const lwt = totalBetween(idx, lastWeekStart, addDays(lastWeekStart, diffDays(ws, today)));
  let progress: number | null = null;
  if (habit.goal.daily) {
    progress = Math.min(1, todayTotal / habit.goal.daily);
  }
  const last = idx.events[0]?.date;
  return {
    status: dayStatus(habit, idx, today),
    todayTotal,
    weekTotal: wt,
    lastWeekTotal: lwt,
    current: currentStreak(habit, idx, today),
    best: bestStreak(habit, idx, today),
    successDays: successfulDays(habit, idx),
    eventCount: idx.events.length,
    progress,
    daysSinceLast: last ? diffDays(last, today) : null,
  };
}

/** Milestones are meaningful only where consecutive successful days make sense. */
export function supportsMilestones(habit: Habit): boolean {
  return hasStatus(habit);
}
