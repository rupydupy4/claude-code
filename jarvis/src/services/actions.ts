import type { CalendarEvent, Memory, MemoryCategory, Note, Priority, Project, Recurrence, Reminder, Task, TaskStatus } from '../domain/types';
import { getState, logActivity, removeItem, upsert } from '../data/store';
import { nowIso } from '../utils/dates';
import { uid } from '../utils/ids';

/** All data changes go through these functions so activity is always recorded. */

const base = (demo?: boolean) => {
  const at = nowIso();
  return { id: uid(), createdAt: at, updatedAt: at, ...(demo ? { demo: true } : {}) };
};

// ------------------------------------------------------------------ tasks

export type NewTask = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

export function createTask(input: NewTask, demo?: boolean): Task {
  const t: Task = {
    ...base(demo), description: '', priority: 'medium', status: 'not_started', tags: [], notes: '',
    ...input, title: input.title.trim(),
  };
  void upsert('tasks', t);
  logActivity('created', 'task', `Task created: ${t.title}`, t.id, demo);
  return t;
}

export function updateTask(id: string, patch: Partial<Task>): Task | null {
  const cur = getState().tasks.find((t) => t.id === id);
  if (!cur) return null;
  const next: Task = { ...cur, ...patch, updatedAt: nowIso() };
  if (patch.status === 'completed' && cur.status !== 'completed') next.completedAt = nowIso();
  if (patch.status && patch.status !== 'completed') delete next.completedAt;
  void upsert('tasks', next);
  if (patch.status === 'completed' && cur.status !== 'completed') logActivity('completed', 'task', `Task completed: ${next.title}`, id);
  else if (cur.status === 'completed' && patch.status && patch.status !== 'completed') logActivity('reopened', 'task', `Task reopened: ${next.title}`, id);
  else logActivity('updated', 'task', `Task updated: ${next.title}`, id);
  return next;
}

export const completeTask = (id: string) => updateTask(id, { status: 'completed' });
export const reopenTask = (id: string) => updateTask(id, { status: 'not_started' });

export function deleteTask(id: string) {
  const t = getState().tasks.find((x) => x.id === id);
  if (!t) return false;
  void removeItem('tasks', id);
  for (const r of getState().reminders.filter((r) => r.taskId === id)) void upsert('reminders', { ...r, taskId: undefined });
  logActivity('deleted', 'task', `Task deleted: ${t.title}`, id);
  return true;
}

// ------------------------------------------------------------------ projects

export function createProject(input: Partial<Project> & { name: string }, demo?: boolean): Project {
  const p: Project = { ...base(demo), description: '', status: 'active', ...input, name: input.name.trim() };
  void upsert('projects', p);
  logActivity('created', 'project', `Project created: ${p.name}`, p.id, demo);
  return p;
}

export function updateProject(id: string, patch: Partial<Project>): Project | null {
  const cur = getState().projects.find((p) => p.id === id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: nowIso() };
  void upsert('projects', next);
  logActivity(patch.status === 'completed' && cur.status !== 'completed' ? 'completed' : 'updated', 'project', `Project ${patch.status === 'completed' ? 'completed' : 'updated'}: ${next.name}`, id);
  return next;
}

/** Deletes the project; its tasks, notes, events and documents are kept but unlinked. */
export function deleteProject(id: string) {
  const s = getState();
  const p = s.projects.find((x) => x.id === id);
  if (!p) return false;
  void removeItem('projects', id);
  s.tasks.filter((t) => t.projectId === id).forEach((t) => void upsert('tasks', { ...t, projectId: undefined, updatedAt: nowIso() }));
  s.notes.filter((n) => n.projectId === id).forEach((n) => void upsert('notes', { ...n, projectId: undefined }));
  s.events.filter((e) => e.projectId === id).forEach((e) => void upsert('events', { ...e, projectId: undefined }));
  s.documents.filter((d) => d.projectId === id).forEach((d) => void upsert('documents', { ...d, projectId: undefined }));
  logActivity('deleted', 'project', `Project deleted: ${p.name}`, id);
  return true;
}

/** Marks a project as touched (used for "not touched in a while" insights). */
export function touchProject(id?: string) {
  if (!id) return;
  const p = getState().projects.find((x) => x.id === id);
  if (p) void upsert('projects', { ...p, updatedAt: nowIso() });
}

// ------------------------------------------------------------------ notes

export function createNote(input: Partial<Note> & { content: string }, demo?: boolean): Note {
  const title = input.title?.trim() || input.content.trim().split('\n')[0].slice(0, 60) || 'Untitled note';
  const n: Note = { ...base(demo), tags: [], ...input, title, content: input.content.trim() };
  void upsert('notes', n);
  touchProject(n.projectId);
  logActivity('created', 'note', `Note added: ${n.title}`, n.id, demo);
  return n;
}

export function updateNote(id: string, patch: Partial<Note>): Note | null {
  const cur = getState().notes.find((n) => n.id === id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: nowIso() };
  void upsert('notes', next);
  logActivity('updated', 'note', `Note edited: ${next.title}`, id);
  return next;
}

export function deleteNote(id: string) {
  const n = getState().notes.find((x) => x.id === id);
  if (!n) return false;
  void removeItem('notes', id);
  logActivity('deleted', 'note', `Note deleted: ${n.title}`, id);
  return true;
}

// ------------------------------------------------------------------ reminders

export function createReminder(input: { text: string; at: string; recurrence?: Recurrence; taskId?: string }, demo?: boolean): Reminder {
  const r: Reminder = { ...base(demo), text: input.text.trim(), at: input.at, recurrence: input.recurrence ?? 'none', taskId: input.taskId, done: false };
  void upsert('reminders', r);
  logActivity('created', 'reminder', `Reminder set: ${r.text}`, r.id, demo);
  return r;
}

export function updateReminder(id: string, patch: Partial<Reminder>) {
  const cur = getState().reminders.find((r) => r.id === id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: nowIso() };
  void upsert('reminders', next);
  return next;
}

export function deleteReminder(id: string) {
  const r = getState().reminders.find((x) => x.id === id);
  if (!r) return false;
  void removeItem('reminders', id);
  logActivity('deleted', 'reminder', `Reminder deleted: ${r.text}`, id);
  return true;
}

// ------------------------------------------------------------------ events

export function createEvent(input: Partial<CalendarEvent> & { title: string; start: string; end: string }, demo?: boolean): CalendarEvent {
  const e: CalendarEvent = { ...base(demo), description: '', location: '', ...input, title: input.title.trim() };
  void upsert('events', e);
  logActivity('created', 'event', `Event added: ${e.title}`, e.id, demo);
  return e;
}

export function updateEvent(id: string, patch: Partial<CalendarEvent>) {
  const cur = getState().events.find((e) => e.id === id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: nowIso() };
  void upsert('events', next);
  logActivity('updated', 'event', `Event updated: ${next.title}`, id);
  return next;
}

export function deleteEvent(id: string) {
  const e = getState().events.find((x) => x.id === id);
  if (!e) return false;
  void removeItem('events', id);
  logActivity('deleted', 'event', `Event deleted: ${e.title}`, id);
  return true;
}

// ------------------------------------------------------------------ memory

export function saveMemory(content: string, category: MemoryCategory, demo?: boolean): Memory {
  const existing = getState().memories.find((m) => m.content.trim().toLowerCase() === content.trim().toLowerCase());
  if (existing) return existing;
  const m: Memory = { ...base(demo), content: content.trim(), category };
  void upsert('memories', m);
  logActivity('created', 'memory', `Remembered: ${m.content.slice(0, 80)}`, m.id, demo);
  return m;
}

export function updateMemory(id: string, patch: Partial<Memory>) {
  const cur = getState().memories.find((m) => m.id === id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: nowIso() };
  void upsert('memories', next);
  return next;
}

export function deleteMemory(id: string) {
  const m = getState().memories.find((x) => x.id === id);
  if (!m) return false;
  void removeItem('memories', id);
  logActivity('deleted', 'memory', `Forgot: ${m.content.slice(0, 80)}`, id);
  return true;
}

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];
export const STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'waiting', 'completed'];
