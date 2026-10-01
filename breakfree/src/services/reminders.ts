import type { AppData, DateKey, TimeOfDay } from '../models/types';
import { dayOfWeek, inWindow, minutesOfDay, nowTime, todayKey } from '../utils/dates';
import { completionSet, completionKey, focusMinutes, isMissionDue } from '../utils/logic';
import { getLocal, setLocal } from './storage';
import { notify } from './notify';

/**
 * In-app reminders. Honest limitation: these only fire while BREAKFREE is open (or recently
 * backgrounded) in a browser tab. Web apps cannot schedule notifications for when they are
 * closed without a push server, which this app deliberately doesn't use.
 */

export interface DueReminder {
  key: string;
  title: string;
  body: string;
}

/** Reminders whose time falls in the last `windowMin` minutes and that haven't fired today. */
export function dueReminders(data: AppData, now: Date, fired: Set<string>, windowMin = 3): DueReminder[] {
  const r = data.prefs.reminders;
  if (!r.enabled) return [];
  const date = todayKey(now);
  const time = nowTime(now);
  if (inWindow(time, r.quietStart, r.quietEnd)) return [];
  const nowMin = minutesOfDay(time);
  const isDue = (t: TimeOfDay) => {
    const diff = nowMin - minutesOfDay(t);
    return diff >= 0 && diff < windowMin;
  };
  const out: DueReminder[] = [];
  const add = (id: string, title: string, body: string) => {
    const key = `${id}|${date}`;
    if (!fired.has(key)) out.push({ key, title, body });
  };

  for (const h of data.habits) {
    if (h.archived || !h.reminder.enabled || !h.reminder.days.includes(dayOfWeek(date)) || !isDue(h.reminder.time)) continue;
    const checked = data.checkIns.some((c) => c.habitId === h.id && c.date === date);
    if (!checked) add(`habit:${h.id}`, `Check in: ${h.name}`, 'A quick check-in when you have a moment.');
  }
  if (r.reflection.enabled && isDue(r.reflection.time) && !data.journal.some((j) => j.date === date)) {
    add('reflection', 'Time to reflect', 'A few lines about today, if you would like.');
  }
  if (r.focus.enabled && isDue(r.focus.time) && focusMinutes(data.focusSessions, date, date) === 0) {
    add('focus', 'Focus session', 'Ready for a focus block?');
  }
  if (r.goals.enabled && isDue(r.goals.time) && data.goals.some((g) => g.status === 'active')) {
    add('goals', 'Goal check', 'A good moment to update your goals.');
  }
  if (r.missions) {
    const done = completionSet(data.missionCompletions);
    for (const m of data.missions) {
      if (!m.reminder || !m.preferredTime || !isMissionDue(m, date) || !isDue(m.preferredTime)) continue;
      if (!done.has(completionKey(m.id, date))) add(`mission:${m.id}`, m.title, 'Planned for now.');
    }
  }
  if (r.routines) {
    for (const rt of data.routines) {
      if (rt.paused || rt.archived || !rt.startTime || !isDue(rt.startTime)) continue;
      add(`routine:${rt.id}`, `${rt.name}`, 'Time to start your routine.');
    }
  }
  return out;
}

function loadFired(date: DateKey): Set<string> {
  const log = getLocal<string[]>('reminder-log', []);
  return new Set(log.filter((k) => k.endsWith(`|${date}`)));
}

async function show(rem: DueReminder, native: boolean) {
  notify(`${rem.title} — ${rem.body}`, 'info', undefined, 8000);
  if (!native || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(rem.title, { body: rem.body, tag: rem.key, icon: './icon-192.png' });
    else new Notification(rem.title, { body: rem.body, tag: rem.key });
  } catch {
    /* in-app banner already shown */
  }
}

export function startReminderLoop(getData: () => AppData): () => void {
  const tick = () => {
    const data = getData();
    if (!data.prefs.reminders.enabled) return;
    const now = new Date();
    const date = todayKey(now);
    const fired = loadFired(date);
    const due = dueReminders(data, now, fired);
    if (!due.length) return;
    due.forEach((d) => fired.add(d.key));
    setLocal('reminder-log', Array.from(fired));
    due.forEach((d) => void show(d, data.prefs.reminders.native));
  };
  tick();
  const id = window.setInterval(tick, 30_000);
  const onVisible = () => document.visibilityState === 'visible' && tick();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function notificationSupport(): 'unsupported' | NotificationPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Only called from an explicit user action. */
export async function requestNotificationPermission(): Promise<'unsupported' | NotificationPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}
