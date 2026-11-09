import { addDays, dayIn, weekRange } from './dates';
import type { Chore, RewardType } from './types';

/** Points needed for each level. Every 50 points is a new level. */
export const POINTS_PER_LEVEL = 50;

export interface Progress {
  points: number;
  pointsThisWeek: number;
  /** Consecutive days, ending today or yesterday, with at least one approved chore. */
  streak: number;
  bestStreak: number;
  /** True when today already counts towards the streak. */
  doneToday: boolean;
  level: number;
  /** Points into the current level (0 … POINTS_PER_LEVEL - 1). */
  levelPoints: number;
}

/**
 * The day an approved chore counts for: the day the child handed it in, so a parent approving
 * late doesn't break the child's streak.
 */
export function creditDay(c: Pick<Chore, 'submitted_at' | 'approved_at'>, timeZone: string) {
  const at = c.submitted_at ?? c.approved_at;
  return at ? dayIn(timeZone, at) : null;
}

export function computeProgress(chores: Chore[], timeZone: string, today: string): Progress {
  const approved = chores.filter((c) => c.status === 'approved');
  const week = weekRange(today);
  const days = new Set<string>();
  let points = 0;
  let pointsThisWeek = 0;
  for (const c of approved) {
    points += c.points ?? 0;
    const day = creditDay(c, timeZone);
    if (!day) continue;
    days.add(day);
    if (day >= week.start && day <= week.end) pointsThisWeek += c.points ?? 0;
  }

  // Current streak: count back from today (or from yesterday if nothing is approved for today yet).
  const doneToday = days.has(today);
  let streak = 0;
  for (let d = doneToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) streak++;

  // Best streak: longest run of consecutive days.
  let bestStreak = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue; // not the start of a run
    let run = 0;
    for (let x = d; days.has(x); x = addDays(x, 1)) run++;
    bestStreak = Math.max(bestStreak, run);
  }

  return { points, pointsThisWeek, streak, bestStreak, doneToday, level: Math.floor(points / POINTS_PER_LEVEL) + 1, levelPoints: points % POINTS_PER_LEVEL };
}

export interface WeekCompletion {
  /** Chores due this week (Monday–Sunday). */
  due: number;
  /** …of which approved. */
  done: number;
  /** Chores approved this week, whatever their due date. */
  approvedThisWeek: number;
}

export function weekCompletion(chores: Chore[], timeZone: string, today: string): WeekCompletion {
  const { start, end } = weekRange(today);
  const dueThisWeek = chores.filter((c) => c.due_date && c.due_date >= start && c.due_date <= end);
  const approvedThisWeek = chores.filter((c) => {
    if (c.status !== 'approved' || !c.approved_at) return false;
    const d = dayIn(timeZone, c.approved_at);
    return d >= start && d <= end;
  }).length;
  return { due: dueThisWeek.length, done: dueThisWeek.filter((c) => c.status === 'approved').length, approvedThisWeek };
}

export interface Balance {
  /** Approved but not yet marked as paid out. */
  owed: { moneyCents: number; screenMinutes: number; custom: Chore[] };
  paid: { moneyCents: number; screenMinutes: number; customCount: number };
}

export function rewardBalance(chores: Chore[]): Balance {
  const b: Balance = { owed: { moneyCents: 0, screenMinutes: 0, custom: [] }, paid: { moneyCents: 0, screenMinutes: 0, customCount: 0 } };
  for (const c of chores) {
    if (c.status !== 'approved') continue;
    const paid = !!c.payout_id;
    const type: RewardType = c.reward_type;
    if (type === 'money') { if (paid) b.paid.moneyCents += c.reward_amount ?? 0; else b.owed.moneyCents += c.reward_amount ?? 0; }
    else if (type === 'screen_time') { if (paid) b.paid.screenMinutes += c.reward_amount ?? 0; else b.owed.screenMinutes += c.reward_amount ?? 0; }
    else if (paid) b.paid.customCount++;
    else b.owed.custom.push(c);
  }
  return b;
}
