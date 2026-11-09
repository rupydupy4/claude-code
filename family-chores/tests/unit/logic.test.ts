/**
 * Unit tests for the pure logic (no database needed): dates, repeating chores, Today / This
 * week / Later grouping, points and streaks, and reward balances.
 */
import { describe, expect, it } from 'vitest';
import { addDays, isoWeekday, weekRange } from '@/lib/dates';
import { formatDue } from '@/lib/format';
import { computeProgress, rewardBalance, weekCompletion } from '@/lib/progress';
import { cleanDays, describeRepeat, nextAfterApproval, nextDueDate } from '@/lib/recurrence';
import { dueGroup, groupByDue, isOverdue } from '@/lib/schedule';
import type { Chore } from '@/lib/types';

// 2026-11-09 is a Monday.
const MON = '2026-11-09';
const TZ = 'Europe/Dublin';

let n = 0;
function chore(p: Partial<Chore> = {}): Chore {
  n++;
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, household_id: 'h', title: `Chore ${n}`, description: '', assigned_to: 'kid',
    reward_type: 'money', reward_amount: 100, reward_note: null, due_date: null, status: 'assigned', photo_path: null, child_note: null,
    feedback: null, created_at: '2026-11-01T10:00:00Z', submitted_at: null, approved_at: null, repeat: 'none', repeat_days: [],
    points: 10, series_id: null, payout_id: null, paid_at: null, ...p,
  };
}
const approvedOn = (day: string, p: Partial<Chore> = {}) => chore({ status: 'approved', submitted_at: `${day}T10:00:00Z`, approved_at: `${day}T18:00:00Z`, ...p });

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('knows ISO weekdays and Monday-to-Sunday weeks', () => {
    expect(isoWeekday(MON)).toBe(1);
    expect(isoWeekday('2026-11-15')).toBe(7);
    expect(weekRange('2026-11-12')).toEqual({ start: MON, end: '2026-11-15' });
    expect(weekRange('2026-11-15')).toEqual({ start: MON, end: '2026-11-15' });
  });
  it('labels due dates relative to today', () => {
    expect(formatDue(MON, MON)).toBe('Due today');
    expect(formatDue('2026-11-10', MON)).toBe('Due tomorrow');
    expect(formatDue('2026-11-08', MON)).toBe('Overdue · yesterday');
    expect(formatDue('2026-11-01', MON)).toMatch(/^Overdue · Sun 1 Nov/);
  });
});

describe('repeating chores', () => {
  it('daily: the next day', () => {
    expect(nextDueDate(MON, 'daily')).toBe('2026-11-10');
  });
  it('weekly: the next chosen weekday, wrapping into next week', () => {
    expect(nextDueDate(MON, 'weekly', [1, 3, 5])).toBe('2026-11-11'); // Wed
    expect(nextDueDate('2026-11-13', 'weekly', [1, 3, 5])).toBe('2026-11-16'); // Fri -> Mon
    expect(nextDueDate(MON, 'weekly', [1])).toBe('2026-11-16'); // same weekday -> a week later
  });
  it('none: no next chore', () => {
    expect(nextDueDate(MON, 'none')).toBeNull();
    expect(nextDueDate(MON, 'weekly', [])).toBeNull();
  });
  it('never schedules in the past when a chore is approved late', () => {
    // Due last Monday, approved today (Monday): next daily one is tomorrow, not last Tuesday.
    expect(nextAfterApproval({ due_date: '2026-11-02', repeat: 'daily', repeat_days: [] }, MON)).toBe('2026-11-10');
    // Done early: counts from the due date.
    expect(nextAfterApproval({ due_date: '2026-11-11', repeat: 'daily', repeat_days: [] }, MON)).toBe('2026-11-12');
  });
  it('cleans and describes weekday choices', () => {
    expect(cleanDays([5, 1, 1, 9, 0, 3])).toEqual([1, 3, 5]);
    expect(describeRepeat('daily')).toBe('Every day');
    expect(describeRepeat('weekly', [1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(describeRepeat('weekly', [6, 7])).toBe('Weekends');
    expect(describeRepeat('weekly', [6])).toBe('Every Saturday');
    expect(describeRepeat('weekly', [5, 1, 3])).toBe('Every Mon, Wed and Fri');
    expect(describeRepeat('none')).toBeNull();
  });
});

describe('Today / This week / Later', () => {
  it('groups by due date (weeks run Monday to Sunday)', () => {
    const today = '2026-11-11'; // Wednesday
    expect(dueGroup({ due_date: '2026-11-05' }, today)).toBe('today'); // overdue counts as today
    expect(dueGroup({ due_date: today }, today)).toBe('today');
    expect(dueGroup({ due_date: '2026-11-15' }, today)).toBe('week');
    expect(dueGroup({ due_date: '2026-11-16' }, today)).toBe('later');
    expect(dueGroup({ due_date: null }, today)).toBe('later');
  });
  it('sorts each group by due date', () => {
    const a = chore({ due_date: '2026-11-14' });
    const b = chore({ due_date: '2026-11-12' });
    const c = chore({ due_date: '2026-11-01' });
    const g = groupByDue([a, b, c], '2026-11-11');
    expect(g.week.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(g.today.map((x) => x.id)).toEqual([c.id]);
  });
  it('only open chores can be overdue', () => {
    expect(isOverdue(chore({ due_date: '2026-11-01' }), MON)).toBe(true);
    expect(isOverdue(chore({ due_date: '2026-11-01', status: 'submitted' }), MON)).toBe(false);
    expect(isOverdue(chore({ due_date: MON }), MON)).toBe(false);
  });
});

describe('points and streaks', () => {
  it('adds up points for approved chores only', () => {
    const p = computeProgress([approvedOn(MON, { points: 20 }), approvedOn('2026-11-02', { points: 5 }), chore({ points: 99 })], TZ, MON);
    expect(p.points).toBe(25);
    expect(p.pointsThisWeek).toBe(20);
    expect(p.level).toBe(1);
    expect(p.levelPoints).toBe(25);
  });
  it('counts consecutive days ending today', () => {
    const p = computeProgress([approvedOn(MON), approvedOn('2026-11-08'), approvedOn('2026-11-08'), approvedOn('2026-11-07'), approvedOn('2026-11-05')], TZ, MON);
    expect(p.streak).toBe(3);
    expect(p.doneToday).toBe(true);
    expect(p.bestStreak).toBe(3);
  });
  it('keeps the streak alive until the end of today', () => {
    const p = computeProgress([approvedOn('2026-11-08'), approvedOn('2026-11-07')], TZ, MON);
    expect(p.streak).toBe(2);
    expect(p.doneToday).toBe(false);
  });
  it('resets after a missed day but remembers the best', () => {
    const p = computeProgress([approvedOn('2026-11-06'), approvedOn('2026-11-05'), approvedOn('2026-11-04'), approvedOn('2026-11-07', { status: 'submitted' })], TZ, MON);
    expect(p.streak).toBe(0);
    expect(p.bestStreak).toBe(3);
  });
  it('credits the day the chore was handed in, not the day it was approved', () => {
    const late = chore({ status: 'approved', submitted_at: '2026-11-08T19:00:00Z', approved_at: '2026-11-09T08:00:00Z' });
    const p = computeProgress([late, approvedOn('2026-11-07')], TZ, MON);
    expect(p.streak).toBe(2);
  });
  it('uses the household time zone for the day', () => {
    // 23:30 UTC on 8 Nov is already 9 Nov in Auckland.
    const c = chore({ status: 'approved', submitted_at: '2026-11-08T23:30:00Z', approved_at: '2026-11-08T23:40:00Z' });
    expect(computeProgress([c], 'Pacific/Auckland', MON).doneToday).toBe(true);
    expect(computeProgress([c], 'UTC', MON).doneToday).toBe(false);
  });
  it('levels up every 50 points', () => {
    expect(computeProgress([approvedOn(MON, { points: 120 })], TZ, MON)).toMatchObject({ level: 3, levelPoints: 20 });
  });
});

describe('weekly completion and reward balances', () => {
  it('counts chores due this week and how many are approved', () => {
    const w = weekCompletion([
      approvedOn('2026-11-10', { due_date: '2026-11-10' }),
      chore({ due_date: '2026-11-12' }),
      chore({ due_date: '2026-11-20' }),
      approvedOn('2026-11-09', { due_date: null }),
    ], TZ, '2026-11-11');
    expect(w).toEqual({ due: 2, done: 1, approvedThisWeek: 2 });
  });
  it('splits approved rewards into owed and paid out', () => {
    const b = rewardBalance([
      approvedOn(MON, { reward_amount: 500 }),
      approvedOn(MON, { reward_amount: 200, payout_id: 'p1' }),
      approvedOn(MON, { reward_type: 'screen_time', reward_amount: 30 }),
      approvedOn(MON, { reward_type: 'custom', reward_amount: null, reward_note: 'Film night' }),
      approvedOn(MON, { reward_type: 'custom', reward_amount: null, reward_note: 'Pizza', payout_id: 'p2' }),
      chore({ reward_amount: 999 }),
    ]);
    expect(b.owed.moneyCents).toBe(500);
    expect(b.owed.screenMinutes).toBe(30);
    expect(b.owed.custom.map((c) => c.reward_note)).toEqual(['Film night']);
    expect(b.paid).toEqual({ moneyCents: 200, screenMinutes: 0, customCount: 1 });
  });
});
