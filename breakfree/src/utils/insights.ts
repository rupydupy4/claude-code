import type { AppData, DateKey, Habit, TriggerId } from '../models/types';
import { ACTIVITIES } from '../data/content';
import { triggerLabel } from '../data/categories';
import { addDays, dateRange, diffDays, partOfDay, startOfWeek } from './dates';
import { bestStreak, dayStatus, hasStatus, indexHabit, type HabitIndex } from './habitStats';
import { completionSet, completionKey, focusMinutes, isMissionDue, localDateOfIso, routineProgress } from './logic';

// ================================================================= achievements

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export const GLOBAL_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-habit', title: 'First step', description: 'Added your first habit.', icon: 'flag' },
  { id: 'first-checkin', title: 'Checked in', description: 'Completed your first daily check-in.', icon: 'check' },
  { id: 'ten-logs', title: 'Ten entries', description: 'Logged ten habit events or sessions.', icon: 'list' },
  { id: 'week-tracking', title: 'A week of tracking', description: 'Recorded something on seven days in a row.', icon: 'calendar' },
  { id: 'within-target', title: 'Within your limit', description: 'Stayed within a daily reduction target.', icon: 'target' },
  { id: 'weekly-goal', title: 'Weekly goal met', description: 'Met a weekly target across a full week.', icon: 'trophy' },
  { id: 'replacement-first', title: 'New direction', description: 'Recorded a replacement activity.', icon: 'sprout' },
  { id: 'routine-7', title: 'Steady routine', description: 'Completed a full routine on seven days.', icon: 'repeat' },
  { id: 'first-focus', title: 'In the zone', description: 'Completed a focus session.', icon: 'timer' },
  { id: 'focus-10', title: 'Deep worker', description: 'Completed ten focus sessions.', icon: 'timer' },
  { id: 'missions-10', title: 'On a mission', description: 'Completed ten missions.', icon: 'check' },
  { id: 'first-reflection', title: 'Reflective', description: 'Wrote your first journal entry.', icon: 'book' },
  { id: 'reset-5', title: 'Pause and reset', description: 'Completed five reset sessions.', icon: 'wind' },
  { id: 'goal-complete', title: 'Goal reached', description: 'Completed a personal goal.', icon: 'trophy' },
];

export const milestoneId = (habitId: string, days: number) => `milestone:${habitId}:${days}`;

export function describeAchievement(id: string, habits: Habit[]): AchievementDef {
  const g = GLOBAL_ACHIEVEMENTS.find((a) => a.id === id);
  if (g) return g;
  const [, habitId, days] = id.split(':');
  const habit = habits.find((h) => h.id === habitId);
  return {
    id,
    title: `${days}-day streak`,
    description: habit ? habit.name : 'A habit you have since removed',
    icon: 'medal',
  };
}

/** Achievement ids the data currently qualifies for. Earned ones are stored and never duplicated. */
export function qualifyingAchievements(data: AppData, today: DateKey, weekStartsOn: 0 | 1): Set<string> {
  const out = new Set<string>();
  if (data.habits.length) out.add('first-habit');
  if (data.checkIns.length) out.add('first-checkin');
  if (data.events.length >= 10) out.add('ten-logs');

  const recordDays = Array.from(new Set([...data.checkIns.map((c) => c.date), ...data.events.map((e) => e.date)])).sort();
  let run = 0, prev: DateKey | null = null;
  for (const d of recordDays) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    prev = d;
    if (run >= 7) { out.add('week-tracking'); break; }
  }

  for (const h of data.habits) {
    const idx = indexHabit(h.id, data.checkIns, data.events);
    if (hasStatus(h)) {
      const best = bestStreak(h, idx, today);
      for (const m of h.milestones) if (best >= m) out.add(milestoneId(h.id, m));
    }
    if (['frequency', 'time', 'quantity'].includes(h.mode) && h.goal.daily !== undefined) {
      for (const d of idx.totals.keys()) if (d <= today && dayStatus(h, idx, d) === 'met') { out.add('within-target'); break; }
    }
    if (h.mode === 'replacement' && idx.events.length) out.add('replacement-first');
    if (h.goal.weekly !== undefined && h.mode !== 'observation' && h.mode !== 'abstinence' && weeklyGoalMet(h, idx, today, weekStartsOn)) out.add('weekly-goal');
  }

  const done = completionSet(data.missionCompletions);
  const routineDays = new Set<DateKey>();
  for (const r of data.routines) {
    if (!r.steps.length) continue;
    const dates = new Set(data.missionCompletions.filter((c) => r.steps.some((s) => s.missionId === c.missionId)).map((c) => c.date));
    for (const d of dates) {
      const p = routineProgress(r, done, d, data.missions);
      if (p.total > 0 && p.completed === p.total) routineDays.add(`${r.id}|${d}`);
    }
    if (Array.from(routineDays).filter((k) => k.startsWith(`${r.id}|`)).length >= 7) out.add('routine-7');
  }

  const completedFocus = data.focusSessions.filter((s) => s.status === 'completed').length;
  if (completedFocus >= 1) out.add('first-focus');
  if (completedFocus >= 10) out.add('focus-10');
  if (data.missionCompletions.length >= 10) out.add('missions-10');
  if (data.journal.length) out.add('first-reflection');
  if (data.resetSessions.filter((s) => s.completed).length >= 5) out.add('reset-5');
  if (data.goals.some((g) => g.status === 'completed')) out.add('goal-complete');
  return out;
}

/** True if any full past week (with records) met the weekly target. */
function weeklyGoalMet(h: Habit, idx: HabitIndex, today: DateKey, weekStartsOn: 0 | 1): boolean {
  const target = h.goal.weekly!;
  const thisWeek = startOfWeek(today, weekStartsOn);
  const weeks = new Map<DateKey, { total: number; recorded: boolean }>();
  for (const [d, v] of idx.totals) {
    const ws = startOfWeek(d, weekStartsOn);
    if (ws >= thisWeek) continue;
    const w = weeks.get(ws) ?? { total: 0, recorded: false };
    w.total += v;
    w.recorded = true;
    weeks.set(ws, w);
  }
  for (const [ws] of idx.checkIns) {
    const k = startOfWeek(ws, weekStartsOn);
    if (k >= thisWeek) continue;
    const w = weeks.get(k) ?? { total: 0, recorded: false };
    w.recorded = true;
    weeks.set(k, w);
  }
  for (const w of weeks.values()) {
    if (!w.recorded) continue;
    if (h.mode === 'replacement' ? w.total >= target : w.total <= target) return true;
  }
  return false;
}

// ================================================================= XP

/**
 * XP is derived from records with daily caps, so repeated clicks or re-saving the same thing
 * can't inflate it, and deleting a record removes its XP. Rewards never apply to the unwanted
 * behaviour itself — only to check-ins, replacement activities, missions, focus and reflection.
 */
export function computeXp(data: AppData): number {
  let xp = 0;
  xp += data.checkIns.length * 5; // already one per habit per day
  xp += data.missionCompletions.length * 10; // already one per mission per day
  const capPerDay = <T,>(items: T[], dayOf: (t: T) => string | null, cap: number, points: number) => {
    const per = new Map<string, number>();
    for (const it of items) {
      const d = dayOf(it);
      if (!d) continue;
      per.set(d, Math.min(cap, (per.get(d) ?? 0) + 1));
    }
    let sum = 0;
    for (const n of per.values()) sum += n * points;
    return sum;
  };
  xp += capPerDay(data.focusSessions.filter((s) => s.status === 'completed'), (s) => localDateOfIso(s.startedAt), 8, 15);
  xp += capPerDay(data.journal, (j) => j.date, 3, 5);
  xp += capPerDay(data.resetSessions.filter((s) => s.completed), (s) => localDateOfIso(s.startedAt), 5, 5);
  const replacementIds = new Set(data.habits.filter((h) => h.mode === 'replacement').map((h) => h.id));
  xp += capPerDay(data.events.filter((e) => replacementIds.has(e.habitId)), (e) => `${e.habitId}|${e.date}`, 3, 5);
  xp += data.goals.filter((g) => g.status === 'completed').length * 50;
  return xp;
}

export function levelFor(xp: number) {
  // Level n needs 100·n XP to reach the next one.
  let level = 1, remaining = xp;
  while (remaining >= level * 100) {
    remaining -= level * 100;
    level++;
  }
  return { level, into: remaining, needed: level * 100 };
}

// ================================================================= statistics

export interface DayPoint {
  date: DateKey;
  label: string;
  events: number;
  amount: number;
  focus: number;
  missionsDone: number;
  missionsDue: number;
  checkIns: number;
}

export function dailySeries(data: AppData, start: DateKey, end: DateKey, habitIds?: Set<string>): DayPoint[] {
  const days = dateRange(start, end);
  const map = new Map<DateKey, DayPoint>();
  const short = days.length > 14;
  for (const d of days) {
    const date = new Date(`${d}T12:00:00`);
    map.set(d, {
      date: d,
      label: short ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : date.toLocaleDateString(undefined, { weekday: 'short' }),
      events: 0,
      amount: 0,
      focus: 0,
      missionsDone: 0,
      missionsDue: 0,
      checkIns: 0,
    });
  }
  for (const e of data.events) {
    if (habitIds && !habitIds.has(e.habitId)) continue;
    const p = map.get(e.date);
    if (p) { p.events++; p.amount += e.amount; }
  }
  for (const c of data.checkIns) {
    if (habitIds && !habitIds.has(c.habitId)) continue;
    const p = map.get(c.date);
    if (p) p.checkIns++;
  }
  for (const s of data.focusSessions) {
    if (s.status !== 'completed') continue;
    const p = map.get(localDateOfIso(s.startedAt) ?? '');
    if (p) p.focus += s.focusedMin;
  }
  const done = completionSet(data.missionCompletions);
  for (const d of days) {
    const p = map.get(d)!;
    for (const m of data.missions) {
      // Archived missions still count on days they were completed.
      const completed = done.has(completionKey(m.id, d));
      if (completed || isMissionDue(m, d)) {
        p.missionsDue++;
        if (completed) p.missionsDone++;
      }
    }
    p.focus = Math.round(p.focus);
  }
  return days.map((d) => map.get(d)!);
}

export interface PeriodTotals {
  events: number;
  focus: number;
  missionsDone: number;
  missionsDue: number;
  checkIns: number;
  hasData: boolean;
}

export function periodTotals(data: AppData, start: DateKey, end: DateKey, habitIds?: Set<string>): PeriodTotals {
  const s = dailySeries(data, start, end, habitIds);
  const t = s.reduce(
    (acc, p) => ({
      events: acc.events + p.events,
      focus: acc.focus + p.focus,
      missionsDone: acc.missionsDone + p.missionsDone,
      missionsDue: acc.missionsDue + p.missionsDue,
      checkIns: acc.checkIns + p.checkIns,
    }),
    { events: 0, focus: 0, missionsDone: 0, missionsDue: 0, checkIns: 0 },
  );
  return { ...t, hasData: t.events + t.focus + t.missionsDone + t.checkIns > 0 };
}

/** Neutral comparison sentences — only produced when the previous period has data. */
export function compareSentences(cur: PeriodTotals, prev: PeriodTotals, periodName: string): string[] {
  if (!prev.hasData || !cur.hasData) return [];
  const out: string[] = [];
  const cmp = (a: number, b: number, more: string, fewer: string, same: string) =>
    a > b ? more : a < b ? fewer : same;
  out.push(cmp(cur.events, prev.events,
    `You recorded more habit events this ${periodName} (${cur.events}) than last ${periodName} (${prev.events}).`,
    `You recorded fewer habit events this ${periodName} (${cur.events}) than last ${periodName} (${prev.events}).`,
    `You recorded the same number of habit events as last ${periodName} (${cur.events}).`));
  if (cur.focus || prev.focus) {
    out.push(cmp(cur.focus, prev.focus,
      `You completed more focus time this ${periodName} (${cur.focus} min vs ${prev.focus} min).`,
      `You completed less focus time this ${periodName} (${cur.focus} min vs ${prev.focus} min).`,
      `Your focus time matched last ${periodName} (${cur.focus} min).`));
  }
  if (cur.missionsDone || prev.missionsDone) {
    out.push(cmp(cur.missionsDone, prev.missionsDone,
      `You completed more missions this ${periodName} (${cur.missionsDone} vs ${prev.missionsDone}).`,
      `You completed fewer missions this ${periodName} (${cur.missionsDone} vs ${prev.missionsDone}).`,
      `You completed the same number of missions as last ${periodName}.`));
  }
  return out;
}

export interface PatternInsights {
  topTriggers: { id: TriggerId; label: string; count: number }[];
  partsOfDay: { part: string; count: number }[];
  topHabit: { habit: Habit; count: number } | null;
  helpfulActivities: { title: string; count: number }[];
  total: number;
}

export function patternInsights(data: AppData, start?: DateKey, end?: DateKey): PatternInsights {
  const events = data.events.filter((e) => (!start || e.date >= start) && (!end || e.date <= end));
  const trig = new Map<TriggerId, number>();
  const parts = new Map<string, number>();
  const perHabit = new Map<string, number>();
  for (const e of events) {
    if (e.trigger && e.trigger !== 'prefer-not') trig.set(e.trigger, (trig.get(e.trigger) ?? 0) + 1);
    const p = partOfDay(e.time);
    parts.set(p, (parts.get(p) ?? 0) + 1);
    perHabit.set(e.habitId, (perHabit.get(e.habitId) ?? 0) + 1);
  }
  const topHabitEntry = Array.from(perHabit.entries()).sort((a, b) => b[1] - a[1])[0];
  const topHabit = topHabitEntry ? data.habits.find((h) => h.id === topHabitEntry[0]) : undefined;
  const helped = new Map<string, number>();
  for (const s of data.resetSessions) {
    if (s.helped !== 'yes' && s.helped !== 'somewhat') continue;
    const title = ACTIVITIES.find((a) => a.id === s.activityId)?.title ?? 'Reset session';
    helped.set(title, (helped.get(title) ?? 0) + 1);
  }
  return {
    topTriggers: Array.from(trig.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({ id, label: triggerLabel(id), count })),
    partsOfDay: ['Morning', 'Afternoon', 'Evening', 'Night'].map((part) => ({ part, count: parts.get(part) ?? 0 })),
    topHabit: topHabit && topHabitEntry ? { habit: topHabit, count: topHabitEntry[1] } : null,
    helpfulActivities: Array.from(helped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([title, count]) => ({ title, count })),
    total: events.length,
  };
}

export function focusWeek(data: AppData, today: DateKey, weekStartsOn: 0 | 1) {
  const ws = startOfWeek(today, weekStartsOn);
  return { thisWeek: focusMinutes(data.focusSessions, ws, today), today: focusMinutes(data.focusSessions, today, today), lastWeek: focusMinutes(data.focusSessions, addDays(ws, -7), addDays(ws, -1)) };
}
