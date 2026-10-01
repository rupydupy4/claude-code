import { describe, expect, it, afterEach } from 'vitest';
import { addDays, dateRange, diffDays, inWindow, isDateKey, startOfWeek, toDateKey, lastNDays } from '../utils/dates';
import { bestStreak, currentStreak, dayStatus, indexHabit, successfulDays, summarizeHabit } from '../utils/habitStats';
import { formatClock, goalProgress, idleTimer, isMissionDue, pauseTimer, settleTimer, startTimer, timerRemaining, focusMinutes } from '../utils/logic';
import { computeXp, compareSentences, levelFor, patternInsights, periodTotals, qualifyingAchievements } from '../utils/insights';
import { checkIn, dataWith, event, makeHabit } from './fixtures';
import type { Mission, PersonalGoal } from '../models/types';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('local calendar dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is not affected by daylight-saving changes', () => {
    for (const tz of ['Europe/London', 'America/New_York', 'Australia/Sydney', 'America/Sao_Paulo']) {
      process.env.TZ = tz;
      // Spring-forward and fall-back days in each hemisphere.
      expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
      expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
      expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
      expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
      expect(addDays('2026-04-05', 1)).toBe('2026-04-06');
      expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
      expect(diffDays('2026-10-01', '2026-11-01')).toBe(31);
      expect(dateRange('2026-03-27', '2026-03-31')).toHaveLength(5);
    }
  });

  it('formats local dates, not UTC dates', () => {
    process.env.TZ = 'Pacific/Auckland';
    // 23:30 local on 5 Jan is still 5 Jan locally even though UTC is the 5th 10:30.
    expect(toDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    process.env.TZ = 'America/Los_Angeles';
    expect(toDateKey(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });

  it('validates date keys', () => {
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-2-3')).toBe(false);
    expect(isDateKey('2026-02-28')).toBe(true);
  });

  it('computes week starts and windows that wrap midnight', () => {
    expect(startOfWeek('2026-10-01', 1)).toBe('2026-09-28'); // Thursday → Monday
    expect(startOfWeek('2026-10-01', 0)).toBe('2026-09-27'); // → Sunday
    expect(inWindow('23:30', '22:00', '07:00')).toBe(true);
    expect(inWindow('06:59', '22:00', '07:00')).toBe(true);
    expect(inWindow('12:00', '22:00', '07:00')).toBe(false);
    expect(lastNDays(3, '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});

describe('streaks and day status', () => {
  const today = '2026-05-10';

  it('counts consecutive met days and the best streak', () => {
    const h = makeHabit('abstinence');
    const cis = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10'].map((d) => checkIn(h.id, d, 'met'));
    const idx = indexHabit(h.id, cis, []);
    expect(currentStreak(h, idx, today)).toBe(6);
    expect(bestStreak(h, idx, today)).toBe(6);
    expect(successfulDays(h, idx)).toBe(9);
  });

  it('does not end the streak because today has no entry yet', () => {
    const h = makeHabit('abstinence');
    const idx = indexHabit(h.id, [checkIn(h.id, '2026-05-08', 'met'), checkIn(h.id, '2026-05-09', 'met')], []);
    expect(dayStatus(h, idx, today)).toBe('none');
    expect(currentStreak(h, idx, today)).toBe(2);
  });

  it('treats missing days as unknown — they end a streak but are never marked as failures', () => {
    const h = makeHabit('abstinence');
    const idx = indexHabit(h.id, [checkIn(h.id, '2026-05-01', 'met'), checkIn(h.id, '2026-05-03', 'met')], []);
    expect(dayStatus(h, idx, '2026-05-02')).toBe('none');
    expect(bestStreak(h, idx, today)).toBe(1);
    expect(currentStreak(h, idx, today)).toBe(0);
  });

  it('a setback ends the current streak but keeps the best streak', () => {
    const h = makeHabit('abstinence');
    const cis = ['2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'].map((d) => checkIn(h.id, d, 'met'));
    const idx = indexHabit(h.id, cis, [event(h.id, '2026-05-09')]);
    expect(dayStatus(h, idx, '2026-05-09')).toBe('notMet');
    expect(currentStreak(h, idx, today)).toBe(0);
    expect(bestStreak(h, idx, today)).toBe(4);
  });

  it('partial days end a streak', () => {
    const h = makeHabit('abstinence');
    const idx = indexHabit(h.id, [checkIn(h.id, '2026-05-08', 'met'), checkIn(h.id, '2026-05-09', 'partial'), checkIn(h.id, '2026-05-10', 'met')], []);
    expect(currentStreak(h, idx, today)).toBe(1);
  });

  it('frequency mode: days within the limit are met; explicit check-ins win', () => {
    const h = makeHabit('frequency', { daily: 3 });
    const evs = [event(h.id, '2026-05-08', 1), event(h.id, '2026-05-08', 1), event(h.id, '2026-05-09', 5), event(h.id, '2026-05-10', 2)];
    const idx = indexHabit(h.id, [checkIn(h.id, '2026-05-07', 'met')], evs);
    expect(dayStatus(h, idx, '2026-05-08')).toBe('met');
    expect(dayStatus(h, idx, '2026-05-09')).toBe('notMet');
    expect(dayStatus(h, idx, '2026-05-07')).toBe('met');
    expect(currentStreak(h, idx, today)).toBe(1);
    expect(bestStreak(h, idx, today)).toBe(2);
  });

  it('time mode aggregates durations against a budget', () => {
    const h = makeHabit('time', { daily: 60 });
    const idx = indexHabit(h.id, [], [event(h.id, today, 25), event(h.id, today, 30)]);
    const s = summarizeHabit(h, idx, today, 1);
    expect(s.todayTotal).toBe(55);
    expect(s.status).toBe('met');
    expect(s.progress).toBeCloseTo(55 / 60);
  });

  it('replacement mode: meeting the target is met, some progress is partial', () => {
    const h = makeHabit('replacement', { daily: 2 });
    const idx = indexHabit(h.id, [], [event(h.id, '2026-05-09', 1), event(h.id, today, 1), event(h.id, today, 1)]);
    expect(dayStatus(h, idx, '2026-05-09')).toBe('partial');
    expect(dayStatus(h, idx, today)).toBe('met');
  });

  it('observation habits never get a success or failure state', () => {
    const h = makeHabit('observation');
    const idx = indexHabit(h.id, [], [event(h.id, today)]);
    expect(dayStatus(h, idx, today)).toBe('n/a');
    expect(currentStreak(h, idx, today)).toBe(0);
    expect(bestStreak(h, idx, today)).toBe(0);
  });

  it('keeps habits independent', () => {
    const a = makeHabit('abstinence');
    const b = makeHabit('abstinence');
    const cis = [checkIn(a.id, today, 'met'), checkIn(b.id, today, 'notMet')];
    expect(currentStreak(a, indexHabit(a.id, cis, []), today)).toBe(1);
    expect(currentStreak(b, indexHabit(b.id, cis, []), today)).toBe(0);
  });

  it('compares this week with the same days last week', () => {
    const h = makeHabit('frequency', { daily: 5 });
    // Sunday 10 May 2026, week starting Monday 4 May.
    const idx = indexHabit(h.id, [], [event(h.id, '2026-05-04', 2), event(h.id, '2026-04-27', 4), event(h.id, '2026-05-03', 9)]);
    const s = summarizeHabit(h, idx, today, 1);
    expect(s.weekTotal).toBe(2);
    expect(s.lastWeekTotal).toBe(13);
  });
});

describe('missions', () => {
  const base: Mission = { id: 'm1', title: 'Read', category: 'learning', recurrence: { type: 'daily' }, reminder: false, archived: false, createdAt: '2026-05-01T09:00:00.000Z', updatedAt: '2026-05-01T09:00:00.000Z' };
  it('handles one-time, daily and weekday recurrence', () => {
    expect(isMissionDue(base, '2026-05-02')).toBe(true);
    expect(isMissionDue(base, '2026-04-30')).toBe(false);
    expect(isMissionDue({ ...base, recurrence: { type: 'once', date: '2026-05-05' } }, '2026-05-05')).toBe(true);
    expect(isMissionDue({ ...base, recurrence: { type: 'once', date: '2026-05-05' } }, '2026-05-06')).toBe(false);
    const weekdays = { ...base, recurrence: { type: 'weekdays' as const, days: [1, 3] } };
    expect(isMissionDue(weekdays, '2026-05-04')).toBe(true); // Monday
    expect(isMissionDue(weekdays, '2026-05-05')).toBe(false); // Tuesday
    expect(isMissionDue({ ...base, archived: true }, '2026-05-02')).toBe(false);
  });
});

describe('timers', () => {
  it('derives remaining time from timestamps, surviving suspension and pauses', () => {
    let t = idleTimer(60_000);
    t = startTimer(t, 1_000);
    expect(timerRemaining(t, 11_000)).toBe(50_000);
    t = pauseTimer(t, 21_000);
    expect(timerRemaining(t, 999_999)).toBe(40_000); // paused: time doesn't move
    t = startTimer(t, 100_000);
    // Tab suspended for a long time: remaining clamps at zero and settles to done.
    expect(timerRemaining(t, 500_000)).toBe(0);
    expect(settleTimer(t, 500_000).status).toBe('done');
  });

  it('ignores duplicate starts', () => {
    const t = startTimer(idleTimer(10_000), 0);
    expect(startTimer(t, 5_000)).toBe(t);
    expect(timerRemaining(startTimer(t, 5_000), 5_000)).toBe(5_000);
  });

  it('formats clocks', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(400)).toBe('0:01');
  });

  it('only counts completed focus sessions in totals', () => {
    const at = new Date(2026, 4, 10, 9).toISOString();
    const sessions = [
      { id: '1', startedAt: at, endedAt: at, plannedMin: 25, focusedMin: 25, status: 'completed' as const, category: '', note: '' },
      { id: '2', startedAt: at, endedAt: at, plannedMin: 25, focusedMin: 10, status: 'ended-early' as const, category: '', note: '' },
    ];
    expect(focusMinutes(sessions, '2026-05-10', '2026-05-10')).toBe(25);
  });
});

describe('goals', () => {
  const g: PersonalGoal = { id: 'g', title: 'Save', description: '', category: 'savings', kind: 'numeric', target: 200, progress: 50, unit: '£', startDate: '2026-01-01', milestones: [], status: 'active', notes: '', createdAt: '', updatedAt: '' };
  it('clamps progress and never returns NaN', () => {
    expect(goalProgress(g)).toBe(0.25);
    expect(goalProgress({ ...g, progress: 500 })).toBe(1);
    expect(goalProgress({ ...g, target: 0 })).toBe(0);
    expect(goalProgress({ ...g, target: undefined })).toBe(0);
    expect(goalProgress({ ...g, progress: Number.NaN })).toBe(0);
    expect(goalProgress({ ...g, kind: 'completion', milestones: [{ id: 'a', title: 'a', done: true }, { id: 'b', title: 'b', done: false }] })).toBe(0.5);
    expect(goalProgress({ ...g, kind: 'completion', milestones: [] })).toBe(0);
    expect(goalProgress({ ...g, status: 'completed' })).toBe(1);
  });
});

describe('statistics, insights and rewards', () => {
  it('aggregates frequency and duration per period and only compares when there is history', () => {
    const h = makeHabit('time', { daily: 60 });
    const d = dataWith({ habits: [h], events: [event(h.id, '2026-05-09', 30), event(h.id, '2026-05-10', 15)] });
    const cur = periodTotals(d, '2026-05-04', '2026-05-10');
    expect(cur.events).toBe(2);
    const prev = periodTotals(d, '2026-04-27', '2026-05-03');
    expect(prev.hasData).toBe(false);
    expect(compareSentences(cur, prev, 'week')).toEqual([]);
    const d2 = dataWith({ habits: [h], events: [...d.events, event(h.id, '2026-04-28', 10), event(h.id, '2026-04-29', 10), event(h.id, '2026-04-30', 10)] });
    const s = compareSentences(periodTotals(d2, '2026-05-04', '2026-05-10'), periodTotals(d2, '2026-04-27', '2026-05-03'), 'week');
    expect(s[0]).toMatch(/fewer habit events/);
  });

  it('reports observed trigger patterns from real records only', () => {
    const h = makeHabit('frequency', { daily: 3 });
    const d = dataWith({ habits: [h], events: [event(h.id, '2026-05-01', 1, { trigger: 'stress', time: '09:00' }), event(h.id, '2026-05-02', 1, { trigger: 'stress', time: '21:00' }), event(h.id, '2026-05-02', 1, { trigger: 'boredom', time: '21:30' })] });
    const p = patternInsights(d);
    expect(p.topTriggers[0]).toMatchObject({ id: 'stress', count: 2 });
    expect(p.partsOfDay.find((x) => x.part === 'Evening')?.count).toBe(2);
    expect(patternInsights(dataWith({})).total).toBe(0);
  });

  it('awards milestones only to habits where streaks make sense', () => {
    const quit = makeHabit('abstinence');
    const watch = makeHabit('observation');
    const days = ['2026-05-08', '2026-05-09', '2026-05-10'];
    const d = dataWith({ habits: [quit, watch], checkIns: days.map((x) => checkIn(quit.id, x, 'met')), events: days.map((x) => event(watch.id, x)) });
    const q = qualifyingAchievements(d, '2026-05-10', 1);
    expect(q.has(`milestone:${quit.id}:3`)).toBe(true);
    expect(q.has(`milestone:${quit.id}:7`)).toBe(false);
    expect([...q].some((a) => a.startsWith(`milestone:${watch.id}`))).toBe(false);
  });

  it('caps XP per day so repeated entries cannot inflate it', () => {
    const at = new Date(2026, 4, 10, 9).toISOString();
    const journal = Array.from({ length: 10 }, (_, i) => ({ id: `j${i}`, date: '2026-05-10', title: '', body: 'x', tag: 'reflection' as const, pinned: false, createdAt: at, updatedAt: at }));
    expect(computeXp(dataWith({ journal }))).toBe(15); // capped at 3 × 5
    const h = makeHabit('frequency', { daily: 2 });
    expect(computeXp(dataWith({ habits: [h], events: [event(h.id, '2026-05-10'), event(h.id, '2026-05-10')] }))).toBe(0); // unwanted behaviour earns nothing
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelFor(250)).toEqual({ level: 2, into: 150, needed: 200 });
  });
});
