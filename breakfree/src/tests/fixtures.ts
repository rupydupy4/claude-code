import type { AppData, CheckInStatus, DateKey, Habit, HabitCheckIn, HabitEvent, TrackingMode } from '../models/types';
import { emptyData } from '../services/schema';

let n = 0;
const id = (p: string) => `${p}-${++n}`;

export function makeHabit(mode: TrackingMode, goal: Habit['goal'] = {}, extra: Partial<Habit> = {}): Habit {
  return {
    id: id('h'),
    name: `Habit ${mode}`,
    category: 'custom',
    description: '',
    icon: 'sparkles',
    mode,
    goal,
    successRule: mode === 'abstinence' ? 'None all day' : '',
    triggers: [],
    alternative: '',
    reminder: { enabled: false, time: '20:00', days: [0, 1, 2, 3, 4, 5, 6] },
    milestones: [1, 3, 7],
    notes: '',
    archived: false,
    startDate: '2026-01-01',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...extra,
  };
}

export function checkIn(habitId: string, date: DateKey, status: CheckInStatus): HabitCheckIn {
  return { id: id('c'), habitId, date, status, note: '', createdAt: `${date}T20:00:00.000Z`, updatedAt: `${date}T20:00:00.000Z` };
}

export function event(habitId: string, date: DateKey, amount = 1, extra: Partial<HabitEvent> = {}): HabitEvent {
  return { id: id('e'), habitId, date, time: '12:00', amount, context: '', note: '', createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z`, ...extra };
}

export function dataWith(patch: Partial<AppData>): AppData {
  return { ...emptyData(), ...patch };
}
