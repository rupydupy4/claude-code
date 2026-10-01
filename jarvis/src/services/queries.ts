import type { CalendarEvent, DateKey, Priority, Project, Reminder, Task, TaskStatus } from '../domain/types';
import type { State } from '../data/store';
import { addDays, diffDays, formatTime, fromDateKey, localDateOf, localTimeOf, todayKey } from '../utils/dates';
import { words } from '../utils/ids';

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const PRIORITY_LABEL: Record<Priority, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
export const STATUS_LABEL: Record<TaskStatus, string> = { not_started: 'Not started', in_progress: 'In progress', waiting: 'Waiting', completed: 'Completed' };
export const PROJECT_STATUS_LABEL: Record<Project['status'], string> = { planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed' };

export const isOpen = (t: Task) => t.status !== 'completed';
export const isOverdue = (t: Task, today = todayKey()) => isOpen(t) && !!t.dueDate && t.dueDate < today;
export const isDueOn = (t: Task, day: DateKey) => isOpen(t) && t.dueDate === day;

/** Most important first: overdue, then priority, then due date. */
export function byImportance(a: Task, b: Task, today = todayKey()): number {
  const ao = isOverdue(a, today) ? 0 : 1, bo = isOverdue(b, today) ? 0 : 1;
  if (ao !== bo) return ao - bo;
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  return (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : (a.dueDate ?? '9999') > (b.dueDate ?? '9999') ? 1 : 0;
}

/** Open tasks that need attention: overdue, due within 2 days, or urgent/high. */
export function needsAttention(tasks: Task[], today = todayKey()): Task[] {
  return tasks
    .filter((t) => isOpen(t) && (isOverdue(t, today) || (t.dueDate && diffDays(today, t.dueDate) <= 2) || t.priority === 'urgent' || t.priority === 'high'))
    .sort((a, b) => byImportance(a, b, today));
}

export function eventsOn(events: CalendarEvent[], day: DateKey) {
  return events.filter((e) => localDateOf(e.start) === day).sort((a, b) => (a.start < b.start ? -1 : 1));
}

export function remindersBetween(reminders: Reminder[], from: Date, to: Date) {
  return reminders.filter((r) => !r.done && new Date(r.at) >= from && new Date(r.at) <= to).sort((a, b) => (a.at < b.at ? -1 : 1));
}

export interface ProjectProgress {
  total: number;
  done: number;
  open: number;
  overdue: number;
  pct: number;
  next?: Task;
  lastTouched: string;
}

export function projectProgress(p: Project, s: Pick<State, 'tasks' | 'notes'>, today = todayKey()): ProjectProgress {
  const tasks = s.tasks.filter((t) => t.projectId === p.id);
  const done = tasks.filter((t) => t.status === 'completed').length;
  const open = tasks.filter(isOpen).sort((a, b) => byImportance(a, b, today));
  const touched = [p.updatedAt, ...tasks.map((t) => t.updatedAt), ...s.notes.filter((n) => n.projectId === p.id).map((n) => n.updatedAt)].sort().at(-1)!;
  return {
    total: tasks.length,
    done,
    open: open.length,
    overdue: open.filter((t) => isOverdue(t, today)).length,
    pct: tasks.length ? Math.round((done / tasks.length) * 100) : p.status === 'completed' ? 100 : 0,
    next: open[0],
    lastTouched: touched,
  };
}

/** A plain-language project summary built only from stored facts. */
export function projectSummary(p: Project, s: Pick<State, 'tasks' | 'notes'>, today = todayKey()): string {
  const pr = projectProgress(p, s, today);
  const parts = [`${p.name} is ${p.status.replace('_', ' ')}`];
  if (pr.total) parts.push(`${pr.done} of ${pr.total} tasks are done (${pr.pct}%)`);
  else parts.push('it has no tasks yet');
  if (pr.overdue) parts.push(`${pr.overdue} ${pr.overdue === 1 ? 'task is' : 'tasks are'} overdue`);
  if (p.deadline) {
    const d = diffDays(today, p.deadline);
    parts.push(d < 0 ? `the deadline passed ${-d} days ago` : d === 0 ? 'the deadline is today' : `the deadline is in ${d} days`);
  }
  if (pr.next) parts.push(`next up: “${pr.next.title}”${pr.next.dueDate ? ` (due ${pr.next.dueDate})` : ''}`);
  const idle = diffDays(localDateOf(pr.lastTouched), today);
  if (idle >= 7 && p.status === 'active') parts.push(`it hasn’t been touched for ${idle} days`);
  return parts.join('; ') + '.';
}

export interface ScheduleItem {
  kind: 'event' | 'task' | 'reminder';
  id: string;
  title: string;
  date: DateKey;
  time?: string;
  end?: string;
  detail?: string;
}

export function scheduleFor(s: Pick<State, 'tasks' | 'events' | 'reminders'>, from: DateKey, to: DateKey = from): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (const e of s.events) {
    const d = localDateOf(e.start);
    if (d >= from && d <= to) out.push({ kind: 'event', id: e.id, title: e.title, date: d, time: localTimeOf(e.start), end: localTimeOf(e.end), detail: e.location || undefined });
  }
  for (const t of s.tasks) {
    if (isOpen(t) && t.dueDate && t.dueDate >= from && t.dueDate <= to) out.push({ kind: 'task', id: t.id, title: t.title, date: t.dueDate, time: t.dueTime, detail: `${t.priority} priority` });
  }
  for (const r of s.reminders) {
    if (r.done) continue;
    const d = localDateOf(r.at);
    if (d >= from && d <= to) out.push({ kind: 'reminder', id: r.id, title: r.text, date: d, time: localTimeOf(r.at) });
  }
  return out.sort((a, b) => `${a.date} ${a.time ?? '99'}`.localeCompare(`${b.date} ${b.time ?? '99'}`));
}

export function describeSchedule(items: ScheduleItem[]): string {
  if (!items.length) return 'Nothing scheduled.';
  return items.map((i) => `${i.time ? formatTime(i.time) : 'Any time'} — ${i.kind === 'task' ? 'Task due: ' : i.kind === 'reminder' ? 'Reminder: ' : ''}${i.title}${i.detail ? ` (${i.detail})` : ''}`).join('\n');
}

// ------------------------------------------------------------------ resolving references

export type Resolved<T> = { item: T } | { error: string; candidates?: T[] };

/**
 * Finds a record by id or by name. Exact (case-insensitive) match wins, then a unique
 * "contains" match, then the best word overlap. Ambiguity is reported, never guessed.
 */
export function resolve<T extends { id: string }>(list: T[], ref: unknown, nameOf: (t: T) => string, kind: string): Resolved<T> {
  if (typeof ref !== 'string' || !ref.trim()) return { error: `Which ${kind}? I need its name.` };
  const q = ref.trim().toLowerCase().replace(/^(the|my)\s+/, '');
  const byId = list.find((t) => t.id === ref);
  if (byId) return { item: byId };
  const exact = list.filter((t) => nameOf(t).toLowerCase() === q);
  if (exact.length === 1) return { item: exact[0] };
  const contains = list.filter((t) => nameOf(t).toLowerCase().includes(q) || q.includes(nameOf(t).toLowerCase()));
  if (contains.length === 1) return { item: contains[0] };
  const qw = new Set(words(q).filter((w) => w.length > 2 && !['the', 'and', 'for', 'task', 'project', 'note', 'reminder', 'meeting'].includes(w)));
  const scored = (contains.length > 1 ? contains : list)
    .map((t) => ({ t, score: words(nameOf(t)).filter((w) => qw.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) return { item: scored[0].t };
  if (scored.length > 1) return { error: `More than one ${kind} matches “${ref}”: ${scored.slice(0, 5).map((x) => `“${nameOf(x.t)}”`).join(', ')}. Which one?`, candidates: scored.map((x) => x.t) };
  return { error: `I couldn’t find a ${kind} called “${ref}”.` };
}

export function dayLabelRange(from: DateKey, to: DateKey) {
  const f = fromDateKey(from).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (from === to) return f;
  return `${f} – ${fromDateKey(to).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

export const tomorrowKey = (today = todayKey()) => addDays(today, 1);
