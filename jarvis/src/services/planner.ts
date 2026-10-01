import type { DateKey, Task } from '../domain/types';
import type { State } from '../data/store';
import { formatTime, fromDateKey, localDateOf, toTime, todayKey } from '../utils/dates';
import { byImportance, eventsOn, isOpen, isOverdue } from './queries';

export interface PlanBlock {
  start: string;
  end: string;
  kind: 'event' | 'task' | 'break';
  title: string;
  id?: string;
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ESTIMATE: Record<Task['priority'], number> = { urgent: 90, high: 60, medium: 45, low: 30 };

/**
 * Builds a realistic draft day: fixed calendar events first, then the most important open tasks
 * (overdue, due today, then by priority) in the free gaps, with short breaks. Deterministic, so
 * the assistant can explain or adjust it.
 */
export function planDay(s: Pick<State, 'tasks' | 'events'>, day: DateKey = todayKey(), now = new Date(), workStart = '09:00', workEnd = '18:00'): { blocks: PlanBlock[]; unscheduled: Task[] } {
  const isToday = day === todayKey(now);
  let cursor = Math.max(mins(workStart), isToday ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15 : 0);
  const endOfDay = mins(workEnd);
  const events = eventsOn(s.events, day).map((e) => ({ start: mins(toTime(new Date(e.start))), end: localDateOf(e.end) === day ? mins(toTime(new Date(e.end))) : endOfDay, title: e.title, id: e.id }));
  const tasks = s.tasks
    .filter((t) => isOpen(t) && t.status !== 'waiting' && (!t.dueDate || t.dueDate <= day || t.priority === 'urgent' || t.priority === 'high'))
    .sort((a, b) => {
      const aDue = a.dueDate && a.dueDate <= day ? 0 : 1, bDue = b.dueDate && b.dueDate <= day ? 0 : 1;
      return isOverdue(a, day) !== isOverdue(b, day) ? (isOverdue(a, day) ? -1 : 1) : aDue !== bDue ? aDue - bDue : byImportance(a, b, day);
    });
  const blocks: PlanBlock[] = events.filter((e) => e.end > cursor).map((e) => ({ start: hhmm(e.start), end: hhmm(e.end), kind: 'event' as const, title: e.title, id: e.id }));
  const busy = events.map((e) => [e.start, e.end] as const).sort((a, b) => a[0] - b[0]);
  const unscheduled: Task[] = [];
  for (const t of tasks) {
    const length = ESTIMATE[t.priority];
    let placed = false;
    while (cursor + length <= endOfDay) {
      const clash = busy.find(([s0, e0]) => cursor < e0 && cursor + length > s0);
      if (clash) { cursor = clash[1]; continue; }
      blocks.push({ start: hhmm(cursor), end: hhmm(cursor + length), kind: 'task', title: t.title, id: t.id });
      cursor += length;
      if (cursor + 15 <= endOfDay) { blocks.push({ start: hhmm(cursor), end: hhmm(cursor + 15), kind: 'break', title: 'Break' }); cursor += 15; }
      placed = true;
      break;
    }
    if (!placed) unscheduled.push(t);
  }
  blocks.sort((a, b) => mins(a.start) - mins(b.start));
  if (blocks.at(-1)?.kind === 'break') blocks.pop();
  return { blocks, unscheduled };
}

export function describePlan(p: ReturnType<typeof planDay>, day: DateKey): string {
  if (!p.blocks.length && p.unscheduled.length) {
    return `There’s no working time left on ${fromDateKey(day).toLocaleDateString(undefined, { weekday: 'long' })} (I plan between 9 AM and 6 PM), so nothing fits. Most important to carry forward: ${p.unscheduled.slice(0, 5).map((t) => `“${t.title}”`).join(', ')}. Say “plan tomorrow” for a full day.`;
  }
  if (!p.blocks.length) return `Nothing to plan for ${fromDateKey(day).toLocaleDateString(undefined, { weekday: 'long' })}: no open tasks or events.`;
  const lines = p.blocks.map((b) => `${formatTime(b.start)}–${formatTime(b.end)}  ${b.kind === 'event' ? '[Event] ' : ''}${b.title}`);
  if (p.unscheduled.length) lines.push(`Didn’t fit: ${p.unscheduled.map((t) => t.title).join(', ')}`);
  return lines.join('\n');
}
