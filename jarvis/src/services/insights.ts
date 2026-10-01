import type { DateKey, Task } from '../domain/types';
import type { State } from '../data/store';
import { addDays, diffDays, formatTime, localDateOf, localTimeOf, todayKey } from '../utils/dates';
import { plural } from '../utils/ids';
import { byImportance, eventsOn, isOpen, isOverdue, projectProgress } from './queries';

export interface Insight {
  id: string;
  level: 'high' | 'medium' | 'info';
  text: string;
  link?: string;
}

/**
 * Proactive observations from stored data only. Ordered by importance and capped so the
 * dashboard surfaces a few genuinely useful items rather than a stream of alerts.
 */
export function computeInsights(s: Pick<State, 'tasks' | 'projects' | 'notes' | 'events' | 'reminders'>, now = new Date(), max = 4): Insight[] {
  const today = todayKey(now);
  const tomorrow = addDays(today, 1);
  const out: Insight[] = [];

  for (const p of s.projects) {
    if (p.status === 'completed' || !p.deadline) continue;
    const pr = projectProgress(p, s, today);
    const d = diffDays(today, p.deadline);
    if (d >= 0 && d <= 1 && pr.open > 0) {
      out.push({ id: `deadline:${p.id}:${p.deadline}`, level: 'high', link: `/projects/${p.id}`, text: `${p.name} is due ${d === 0 ? 'today' : 'tomorrow'}. ${plural(pr.open, 'task')} ${pr.open === 1 ? 'is' : 'are'} still unfinished.` });
    } else if (d < 0 && pr.open > 0) {
      out.push({ id: `late:${p.id}`, level: 'high', link: `/projects/${p.id}`, text: `${p.name} passed its deadline ${plural(-d, 'day')} ago with ${plural(pr.open, 'open task')}.` });
    }
  }

  const overdue = s.tasks.filter((t) => isOverdue(t, today)).sort((a, b) => byImportance(a, b, today));
  if (overdue.length) {
    out.push({ id: `overdue:${today}:${overdue.length}`, level: 'high', link: '/tasks?filter=overdue', text: overdue.length === 1 ? `“${overdue[0].title}” is overdue.` : `${overdue.length} tasks are overdue, including “${overdue[0].title}”.` });
  }

  const nextEvent = eventsOn(s.events, today).find((e) => new Date(e.start) > now && (new Date(e.start).getTime() - now.getTime()) <= 2 * 3600_000);
  if (nextEvent) out.push({ id: `soon:${nextEvent.id}`, level: 'medium', link: '/calendar', text: `${nextEvent.title} starts at ${formatTime(localTimeOf(nextEvent.start))}.` });

  const dueTomorrow = s.tasks.filter((t: Task) => isOpen(t) && t.dueDate === tomorrow && (t.priority === 'high' || t.priority === 'urgent'));
  if (dueTomorrow.length) out.push({ id: `tomorrow:${today}`, level: 'medium', link: '/tasks', text: `${plural(dueTomorrow.length, 'high-priority task')} ${dueTomorrow.length === 1 ? 'is' : 'are'} due tomorrow: “${dueTomorrow[0].title}”${dueTomorrow.length > 1 ? ' and more' : ''}.` });

  for (const p of s.projects) {
    if (p.status !== 'active') continue;
    const pr = projectProgress(p, s, today);
    const idle = diffDays(localDateOf(pr.lastTouched), today);
    if (idle >= 7 && pr.open > 0) {
      out.push({ id: `idle:${p.id}:${Math.floor(idle / 7)}`, level: 'info', link: `/projects/${p.id}`, text: `${p.name} hasn’t been touched for ${idle} days. ${plural(pr.open, 'task')} ${pr.open === 1 ? 'remains' : 'remain'}.` });
    }
  }

  const rank = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, max);
}

export const insightKey = (id: string, day: DateKey = todayKey()) => `${day}|${id}`;
