import { useEffect, useState } from 'react';
import { useStore } from '../services/store';
import type { AppData } from '../models/types';
import { todayKey } from '../utils/dates';

/** The whole app state. The reference only changes when data changes. */
export const useData = (): AppData => useStore((s) => s);

/** Re-renders every `ms` milliseconds; returns the current time. */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms, enabled]);
  return now;
}

/** Today's local date key; updates when the date rolls over at midnight. */
export function useToday(): string {
  const now = useNow(60_000);
  return todayKey(new Date(now));
}
