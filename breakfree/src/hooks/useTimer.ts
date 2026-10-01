import { useCallback, useEffect, useState } from 'react';
import { getLocal, setLocal } from '../services/storage';
import { idleTimer, pauseTimer, settleTimer, startTimer, timerElapsed, timerRemaining, type TimerState } from '../utils/logic';
import { useNow } from './useApp';

/**
 * A timestamp-based timer whose state is saved per device, so a reload or a suspended tab
 * resumes with the correct remaining time. Only one timer exists per key.
 */
export function usePersistentTimer<Extra extends object>(key: string, defaultMs: number, extra: Extra) {
  const [stored, setStored] = useState<{ t: TimerState; x: Extra }>(() => getLocal(key, { t: idleTimer(defaultMs), x: extra }));
  const active = stored.t.status === 'running';
  const now = useNow(active ? 250 : 5000, true);
  const t = settleTimer(stored.t, now);

  const save = useCallback(
    (next: { t: TimerState; x: Extra }) => {
      setStored(next);
      setLocal(key, next.t.status === 'idle' && next.t.elapsedMs === 0 ? null : next);
    },
    [key],
  );

  // Persist the "done" transition once.
  useEffect(() => {
    if (t !== stored.t) save({ ...stored, t });
  }, [t, stored, save]);

  return {
    timer: t,
    extra: stored.x,
    now,
    remaining: timerRemaining(t, now),
    elapsed: timerElapsed(t, now),
    start: () => save({ ...stored, t: startTimer(t, Date.now()) }),
    pause: () => save({ ...stored, t: pauseTimer(t, Date.now()) }),
    reset: (ms = defaultMs, x: Extra = stored.x) => save({ t: idleTimer(ms), x }),
    setExtra: (x: Extra) => save({ ...stored, x }),
    load: (next: TimerState, x: Extra) => save({ t: next, x }),
  };
}
