import type { Reminder } from '../domain/types';
import { getState } from '../data/store';
import { updateReminder } from './actions';
import { logActivity } from '../data/store';
import { nextOccurrence, formatTime, fromDateKey, localTimeOf, todayKey } from '../utils/dates';
import { computeInsights } from './insights';
import { notify } from './notify';

/**
 * Reminder delivery. Honest limitation: browsers can only run this while JARVIS is open (or
 * recently backgrounded). True background alerts need a push service or a native wrapper;
 * `deliver` is the single place to plug one in.
 */

export interface Delivery {
  (title: string, body: string): void;
}

/** Native notifications when permitted (standalone site), otherwise in-app banners. */
export const defaultDelivery: Delivery = (title, body) => {
  notify(`${title}${body ? ` — ${body}` : ''}`, 'info', undefined, 12000);
  const s = getState().settings.notifications;
  if (!s.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    void navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg) void reg.showNotification(title, { body, tag: title });
      else new Notification(title, { body });
    });
  } catch {
    /* banner already shown */
  }
};

/** Reminders due now (within the catch-up window) that haven't fired yet. */
export function dueReminders(reminders: Reminder[], now: Date, windowMs = 10 * 60_000): Reminder[] {
  return reminders.filter((r) => {
    if (r.done) return false;
    const at = new Date(r.at).getTime();
    return at <= now.getTime() && now.getTime() - at <= windowMs && (!r.lastFiredAt || new Date(r.lastFiredAt).getTime() < at);
  });
}

/** Marks a reminder fired: one-time reminders complete; recurring ones move to the next time. */
export function afterFiring(r: Reminder, now: Date): Partial<Reminder> {
  const next = nextOccurrence(r.at, r.recurrence, now);
  return next ? { at: next.toISOString(), lastFiredAt: now.toISOString() } : { done: true, lastFiredAt: now.toISOString() };
}

/** Missed reminders (older than the catch-up window) are rolled forward or completed quietly. */
export function staleReminders(reminders: Reminder[], now: Date, windowMs = 10 * 60_000) {
  return reminders.filter((r) => !r.done && now.getTime() - new Date(r.at).getTime() > windowMs);
}

export function tick(now = new Date(), deliver: Delivery = defaultDelivery) {
  const s = getState();
  if (s.status !== 'ready') return;
  for (const r of dueReminders(s.reminders, now)) {
    if (s.settings.notifications.reminders) deliver(`Reminder: ${r.text}`, `Set for ${formatTime(localTimeOf(r.at))}`);
    updateReminder(r.id, afterFiring(r, now));
    logActivity('fired', 'reminder', `Reminder: ${r.text}`, r.id);
  }
  for (const r of staleReminders(s.reminders, now)) {
    if (r.recurrence === 'none') {
      updateReminder(r.id, { done: true });
      notify(`Missed reminder: ${r.text}`, 'info', undefined, 10000);
    } else updateReminder(r.id, { at: nextOccurrence(r.at, r.recurrence, now)!.toISOString() });
  }
  // Event reminders (minutes before start), fired once per event start.
  for (const e of s.events) {
    if (e.reminderMinutes === undefined) continue;
    const at = new Date(e.start).getTime() - e.reminderMinutes * 60_000;
    const key = `jarvis:event-reminded:${e.id}:${e.start}`;
    if (s.settings.notifications.reminders && now.getTime() >= at && now.getTime() - at <= 10 * 60_000 && !safeGet(key)) {
      safeSet(key);
      deliver(`${e.title} ${e.reminderMinutes ? `in ${e.reminderMinutes} min` : 'now'}`, `Starts at ${formatTime(localTimeOf(e.start))}${e.location ? ` · ${e.location}` : ''}`);
    }
  }
  const today = todayKey(now);
  // Deadline alerts: timed tasks 30 minutes before they are due; project deadlines once on the day.
  if (s.settings.notifications.deadlines) {
    for (const t of s.tasks) {
      if (t.status === 'completed' || t.dueDate !== today || !t.dueTime) continue;
      const due = fromDateKey(today, t.dueTime).getTime();
      const key = `jarvis:due-alert:${t.id}:${today}:${t.dueTime}`;
      if (now.getTime() >= due - 30 * 60_000 && now.getTime() <= due && !safeGet(key)) {
        safeSet(key);
        deliver(`Due at ${formatTime(t.dueTime)}: ${t.title}`, '');
      }
    }
    if (now.getHours() >= 9) {
      for (const p of s.projects) {
        const key = `jarvis:project-deadline:${p.id}:${today}`;
        if (p.status !== 'completed' && p.deadline === today && !safeGet(key)) {
          safeSet(key);
          deliver(`${p.name} is due today`, '');
        }
      }
    }
  }
  // Proactive briefing: the single most important observation, once a day, in the app only.
  if (s.settings.notifications.proactive && now.getHours() >= 8) {
    const key = `jarvis:briefing:${today}`;
    const top = computeInsights(s, now, 1)[0];
    if (top && top.level === 'high' && !safeGet(key)) {
      safeSet(key);
      notify(top.text, 'info', undefined, 12000);
    }
  }
}

function safeGet(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string) {
  try { localStorage.setItem(k, '1'); } catch { /* per-device convenience only */ }
}

export function startReminderLoop(): () => void {
  tick();
  const id = window.setInterval(() => tick(), 20_000);
  const onVis = () => document.visibilityState === 'visible' && tick();
  document.addEventListener('visibilitychange', onVis);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}
