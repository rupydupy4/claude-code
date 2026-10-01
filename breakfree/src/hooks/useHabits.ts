import { useMemo } from 'react';
import type { AppData, Habit } from '../models/types';
import { indexHabit, summarizeHabit, type HabitIndex, type HabitSummary } from '../utils/habitStats';

export interface HabitView {
  habit: Habit;
  idx: HabitIndex;
  summary: HabitSummary;
}

/** Per-habit indexes and summaries, recomputed only when the underlying records change. */
export function useHabitViews(data: AppData, today: string, includeArchived = false): HabitView[] {
  const { habits, checkIns, events, prefs } = data;
  return useMemo(
    () =>
      habits
        .filter((h) => includeArchived || !h.archived)
        .map((habit) => {
          const idx = indexHabit(habit.id, checkIns, events);
          return { habit, idx, summary: summarizeHabit(habit, idx, today, prefs.weekStartsOn) };
        }),
    [habits, checkIns, events, today, prefs.weekStartsOn, includeArchived],
  );
}
