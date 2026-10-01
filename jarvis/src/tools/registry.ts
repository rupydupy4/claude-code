import type { MemoryCategory, PendingAction, Priority, ProjectStatus, Recurrence, TaskStatus } from '../domain/types';
import { getState, loadDocumentText } from '../data/store';
import * as A from '../services/actions';
import {
  byImportance, describeSchedule, isOpen, isOverdue, PRIORITY_RANK, projectProgress, projectSummary, resolve, scheduleFor,
} from '../services/queries';
import { globalSearch } from '../services/search';
import { describePlan, planDay } from '../services/planner';
import { webSearch } from '../services/research';
import {
  addDays, diffDays, formatDay, formatTime, formatWhen, isDateKey, isTime, localDateOf, localTimeOf, parseLocalDateTime, startOfWeek, todayKey,
} from '../utils/dates';
import { plural, uid } from '../utils/ids';
import { ToolInputError, validateInput, type ObjectSchema } from './validate';

export interface ToolContext {
  now: Date;
  /** Set when the user has explicitly confirmed a destructive action. */
  confirmed?: boolean;
}

export interface ToolResult {
  ok: boolean;
  /** One line for the UI, e.g. "Created task “Finish homepage”". */
  summary: string;
  /** What the model sees. Kept small. */
  data: unknown;
  pending?: PendingAction;
}

export interface ToolDef {
  name: string;
  description: string;
  schema: ObjectSchema;
  /** Destructive tools never run without the user's explicit confirmation. */
  destructive?: boolean;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> | ToolResult;
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const STATUSES = ['not_started', 'in_progress', 'waiting', 'completed'] as const;
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed'] as const;
const RECURRENCES = ['none', 'daily', 'weekdays', 'weekly', 'monthly'] as const;
const MEMORY_CATEGORIES = ['preferences', 'projects', 'people', 'work', 'instructions', 'important'] as const;

const ok = (summary: string, data: unknown = { ok: true, message: summary }): ToolResult => ({ ok: true, summary, data });
const fail = (msg: string): ToolResult => ({ ok: false, summary: msg, data: { ok: false, error: msg } });

function dateArg(v: unknown, label: string): string | undefined {
  if (v === undefined) return undefined;
  if (!isDateKey(v)) throw new ToolInputError(`“${label}” must be a date in YYYY-MM-DD format.`);
  return v;
}
function timeArg(v: unknown, label: string): string | undefined {
  if (v === undefined) return undefined;
  if (!isTime(v)) throw new ToolInputError(`“${label}” must be a time in HH:MM (24-hour) format.`);
  return v;
}
function dateTimeArg(v: unknown, label: string): Date {
  const d = parseLocalDateTime(v);
  if (!d) throw new ToolInputError(`“${label}” must be a local date and time like 2026-10-02T15:00.`);
  return d;
}

function projectRef(ref: unknown): string | undefined {
  if (ref === undefined) return undefined;
  const r = resolve(getState().projects, ref, (p) => p.name, 'project');
  if ('error' in r) throw new ToolInputError(r.error);
  return r.item.id;
}

const taskBrief = (t: ReturnType<typeof getState>['tasks'][number]) => ({
  id: t.id, title: t.title, priority: t.priority, status: t.status, due: t.dueDate ? `${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ''}` : null,
  project: getState().projects.find((p) => p.id === t.projectId)?.name ?? null, tags: t.tags,
});

function pending(tool: string, input: Record<string, unknown>, description: string): ToolResult {
  const p: PendingAction = { id: uid(), tool, input, description, state: 'pending' };
  return {
    ok: true,
    summary: `Waiting for confirmation: ${description}`,
    data: { status: 'awaiting_confirmation', message: `Nothing has been deleted yet. Tell the user you need them to confirm "${description}" using the Confirm button.` },
    pending: p,
  };
}

// =====================================================================================

export const TOOLS: ToolDef[] = [
  {
    name: 'get_overview',
    description: 'Today at a glance: tasks due today and overdue, today’s events and reminders, active projects. Use for “what do I need to do today”.',
    schema: { type: 'object', properties: {} },
    run(_i, { now }) {
      const s = getState(), today = todayKey(now);
      const overdue = s.tasks.filter((t) => isOverdue(t, today)).sort((a, b) => byImportance(a, b, today));
      const dueToday = s.tasks.filter((t) => isOpen(t) && t.dueDate === today).sort((a, b) => byImportance(a, b, today));
      const important = s.tasks.filter((t) => isOpen(t) && !t.dueDate && (t.priority === 'urgent' || t.priority === 'high'));
      const schedule = scheduleFor(s, today);
      return ok(`Checked today’s overview`, {
        today, now: now.toISOString(),
        overdue: overdue.map(taskBrief), dueToday: dueToday.map(taskBrief), highPriorityUndated: important.map(taskBrief),
        schedule: describeSchedule(schedule.filter((i) => i.kind !== 'task')),
        activeProjects: s.projects.filter((p) => p.status === 'active').map((p) => ({ name: p.name, deadline: p.deadline ?? null, progress: `${projectProgress(p, s, today).pct}%` })),
      });
    },
  },
  {
    name: 'get_tasks',
    description: 'List tasks with optional filters. Returns id, title, priority, status, due, project.',
    schema: {
      type: 'object',
      properties: {
        when: { type: 'string', enum: ['all', 'today', 'overdue', 'tomorrow', 'this_week', 'no_date'], description: 'Due-date filter.' },
        status: { type: 'string', enum: ['open', ...STATUSES], description: '“open” means not completed.' },
        project: { type: 'string', description: 'Project name.' },
        priority: { type: 'string', enum: PRIORITIES },
        query: { type: 'string', description: 'Words that must appear in the title, description or tags.' },
      },
    },
    run(i, { now }) {
      const s = getState(), today = todayKey(now);
      let list = s.tasks;
      const status = (i.status as string) ?? 'open';
      list = list.filter((t) => (status === 'open' ? isOpen(t) : t.status === status));
      const when = (i.when as string) ?? 'all';
      if (when === 'today') list = list.filter((t) => t.dueDate === today);
      if (when === 'overdue') list = list.filter((t) => isOverdue(t, today));
      if (when === 'tomorrow') list = list.filter((t) => t.dueDate === addDays(today, 1));
      if (when === 'this_week') list = list.filter((t) => t.dueDate && t.dueDate >= startOfWeek(today) && t.dueDate <= addDays(startOfWeek(today), 6));
      if (when === 'no_date') list = list.filter((t) => !t.dueDate);
      if (i.project) { const pid = projectRef(i.project); list = list.filter((t) => t.projectId === pid); }
      if (i.priority) list = list.filter((t) => t.priority === i.priority);
      if (i.query) { const q = String(i.query).toLowerCase(); list = list.filter((t) => `${t.title} ${t.description} ${t.tags.join(' ')}`.toLowerCase().includes(q)); }
      list = [...list].sort((a, b) => byImportance(a, b, today)).slice(0, 40);
      return ok(`Found ${plural(list.length, 'task')}`, { count: list.length, tasks: list.map(taskBrief) });
    },
  },
  {
    name: 'create_task',
    description: 'Create a task. Dates are local: dueDate YYYY-MM-DD, dueTime HH:MM.',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 200 },
        description: { type: 'string', maxLength: 4000 },
        priority: { type: 'string', enum: PRIORITIES },
        status: { type: 'string', enum: STATUSES },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        dueTime: { type: 'string', description: 'HH:MM 24-hour' },
        project: { type: 'string', description: 'Existing project name.' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title'],
    },
    run(i) {
      const t = A.createTask({
        title: String(i.title), description: (i.description as string) ?? '', priority: (i.priority as Priority) ?? 'medium',
        status: (i.status as TaskStatus) ?? 'not_started', dueDate: dateArg(i.dueDate, 'dueDate'), dueTime: timeArg(i.dueTime, 'dueTime'),
        projectId: projectRef(i.project), tags: (i.tags as string[]) ?? [],
      });
      A.touchProject(t.projectId);
      return ok(`Created task “${t.title}”${t.dueDate ? ` due ${formatDay(t.dueDate)}` : ''}`, { ok: true, task: taskBrief(t) });
    },
  },
  {
    name: 'update_task',
    description: 'Change a task’s fields. Identify it by title or id. Use status "completed" to complete, "not_started" to reopen.',
    schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task title or id.' },
        title: { type: 'string', maxLength: 200 }, description: { type: 'string', maxLength: 4000 }, notes: { type: 'string', maxLength: 4000 },
        priority: { type: 'string', enum: PRIORITIES }, status: { type: 'string', enum: STATUSES },
        dueDate: { type: 'string' }, dueTime: { type: 'string' }, project: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['task'],
    },
    run(i) {
      const r = resolve(getState().tasks, i.task, (t) => t.title, 'task');
      if ('error' in r) return fail(r.error);
      const patch: Record<string, unknown> = {};
      for (const k of ['title', 'description', 'notes', 'priority', 'status', 'tags'] as const) if (i[k] !== undefined) patch[k] = i[k];
      if (i.dueDate !== undefined) patch.dueDate = dateArg(i.dueDate, 'dueDate');
      if (i.dueTime !== undefined) patch.dueTime = timeArg(i.dueTime, 'dueTime');
      if (i.project !== undefined) patch.projectId = projectRef(i.project);
      const t = A.updateTask(r.item.id, patch);
      A.touchProject(t?.projectId);
      return ok(`Updated task “${t!.title}”`, { ok: true, task: taskBrief(t!) });
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed.',
    schema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
    run(i) {
      const r = resolve(getState().tasks.filter(isOpen), i.task, (t) => t.title, 'open task');
      if ('error' in r) return fail(r.error);
      A.completeTask(r.item.id);
      A.touchProject(r.item.projectId);
      return ok(`Completed “${r.item.title}”`);
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task permanently. Requires the user’s confirmation in the app.',
    destructive: true,
    schema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
    run(i, ctx) {
      const r = resolve(getState().tasks, i.task, (t) => t.title, 'task');
      if ('error' in r) return fail(r.error);
      if (!ctx.confirmed) return pending('delete_task', { task: r.item.id }, `Delete task “${r.item.title}”`);
      A.deleteTask(r.item.id);
      return ok(`Deleted task “${r.item.title}”`);
    },
  },
  {
    name: 'get_projects',
    description: 'List projects with status, deadline and progress.',
    schema: { type: 'object', properties: { status: { type: 'string', enum: ['all', ...PROJECT_STATUSES] } } },
    run(i, { now }) {
      const s = getState(), today = todayKey(now);
      const list = s.projects.filter((p) => !i.status || i.status === 'all' || p.status === i.status);
      return ok(`Found ${plural(list.length, 'project')}`, { projects: list.map((p) => ({ id: p.id, name: p.name, status: p.status, deadline: p.deadline ?? null, summary: projectSummary(p, s, today) })) });
    },
  },
  {
    name: 'get_project',
    description: 'Details and health of one project: progress, open and overdue tasks, notes, documents, deadline. Use for “how is X going”.',
    schema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] },
    run(i, { now }) {
      const s = getState(), today = todayKey(now);
      const r = resolve(s.projects, i.project, (p) => p.name, 'project');
      if ('error' in r) return fail(r.error);
      const p = r.item;
      const tasks = s.tasks.filter((t) => t.projectId === p.id);
      return ok(`Reviewed project “${p.name}”`, {
        project: { name: p.name, status: p.status, deadline: p.deadline ?? null, description: p.description },
        summary: projectSummary(p, s, today),
        openTasks: tasks.filter(isOpen).sort((a, b) => byImportance(a, b, today)).map(taskBrief),
        recentlyCompleted: tasks.filter((t) => t.status === 'completed').sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1)).slice(0, 5).map((t) => t.title),
        notes: s.notes.filter((n) => n.projectId === p.id).slice(0, 10).map((n) => ({ title: n.title, excerpt: n.content.slice(0, 300) })),
        documents: s.documents.filter((d) => d.projectId === p.id).map((d) => d.name),
      });
    },
  },
  {
    name: 'create_project',
    description: 'Create a project. Optionally add tasks to it afterwards with create_task.',
    schema: {
      type: 'object',
      properties: { name: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 4000 }, status: { type: 'string', enum: PROJECT_STATUSES }, deadline: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['name'],
    },
    run(i) {
      if (getState().projects.some((p) => p.name.toLowerCase() === String(i.name).toLowerCase())) return fail(`A project called “${i.name}” already exists.`);
      const p = A.createProject({ name: String(i.name), description: (i.description as string) ?? '', status: (i.status as ProjectStatus) ?? 'active', deadline: dateArg(i.deadline, 'deadline') });
      return ok(`Created project “${p.name}”`, { ok: true, id: p.id, name: p.name });
    },
  },
  {
    name: 'update_project',
    description: 'Change a project’s name, description, status or deadline.',
    schema: {
      type: 'object',
      properties: { project: { type: 'string' }, name: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 4000 }, status: { type: 'string', enum: PROJECT_STATUSES }, deadline: { type: 'string' } },
      required: ['project'],
    },
    run(i) {
      const r = resolve(getState().projects, i.project, (p) => p.name, 'project');
      if ('error' in r) return fail(r.error);
      const patch: Record<string, unknown> = {};
      for (const k of ['name', 'description', 'status'] as const) if (i[k] !== undefined) patch[k] = i[k];
      if (i.deadline !== undefined) patch.deadline = dateArg(i.deadline, 'deadline');
      const p = A.updateProject(r.item.id, patch);
      return ok(`Updated project “${p!.name}”`);
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a project (its tasks and notes are kept). Requires confirmation.',
    destructive: true,
    schema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] },
    run(i, ctx) {
      const r = resolve(getState().projects, i.project, (p) => p.name, 'project');
      if ('error' in r) return fail(r.error);
      if (!ctx.confirmed) return pending('delete_project', { project: r.item.id }, `Delete project “${r.item.name}”`);
      A.deleteProject(r.item.id);
      return ok(`Deleted project “${r.item.name}”`);
    },
  },
  {
    name: 'create_note',
    description: 'Save a note. Use for “make a note”, ideas, meeting notes, decisions.',
    schema: {
      type: 'object',
      properties: { title: { type: 'string', maxLength: 160 }, content: { type: 'string', maxLength: 20000 }, tags: { type: 'array', items: { type: 'string' } }, project: { type: 'string' } },
      required: ['content'],
    },
    run(i) {
      const n = A.createNote({ title: i.title as string | undefined, content: String(i.content), tags: (i.tags as string[]) ?? [], projectId: projectRef(i.project) });
      return ok(`Saved note “${n.title}”`, { ok: true, id: n.id, title: n.title });
    },
  },
  {
    name: 'search_notes',
    description: 'Search notes by words. Returns titles and excerpts.',
    schema: { type: 'object', properties: { query: { type: 'string' }, project: { type: 'string' } }, required: ['query'] },
    run(i) {
      const s = getState();
      const pid = i.project ? projectRef(i.project) : undefined;
      const hits = globalSearch({ ...s, notes: s.notes.filter((n) => !pid || n.projectId === pid), tasks: [], projects: [], conversations: [], memories: [], documents: [], events: [], reminders: [] }, String(i.query), 10);
      const notes = hits.map((h) => s.notes.find((n) => n.id === h.id)!).map((n) => ({ title: n.title, updated: n.updatedAt.slice(0, 10), excerpt: n.content.slice(0, 600) }));
      return ok(`Found ${plural(notes.length, 'note')}`, { notes });
    },
  },
  {
    name: 'delete_note',
    description: 'Delete a note. Requires confirmation.',
    destructive: true,
    schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
    run(i, ctx) {
      const r = resolve(getState().notes, i.note, (n) => n.title, 'note');
      if ('error' in r) return fail(r.error);
      if (!ctx.confirmed) return pending('delete_note', { note: r.item.id }, `Delete note “${r.item.title}”`);
      A.deleteNote(r.item.id);
      return ok(`Deleted note “${r.item.title}”`);
    },
  },
  {
    name: 'create_reminder',
    description: 'Set a reminder. `at` is local time YYYY-MM-DDTHH:MM and must be in the future. recurrence repeats it.',
    schema: {
      type: 'object',
      properties: { text: { type: 'string', maxLength: 300 }, at: { type: 'string' }, recurrence: { type: 'string', enum: RECURRENCES }, task: { type: 'string', description: 'Related task title (optional).' } },
      required: ['text', 'at'],
    },
    run(i, { now }) {
      const at = dateTimeArg(i.at, 'at');
      const recurrence = (i.recurrence as Recurrence) ?? 'none';
      if (at <= now && recurrence === 'none') return fail('That time has already passed. Choose a time in the future.');
      let taskId: string | undefined;
      if (i.task) { const r = resolve(getState().tasks, i.task, (t) => t.title, 'task'); if ('item' in r) taskId = r.item.id; }
      const r = A.createReminder({ text: String(i.text), at: at.toISOString(), recurrence, taskId });
      const when = formatWhen(r.at, todayKey(now));
      return ok(recurrence === 'none' ? `Reminder “${r.text}” set for ${when}` : `Reminder “${r.text}” set: ${recurrence} from ${when}`, { ok: true, text: r.text, at: when, recurrence });
    },
  },
  {
    name: 'get_reminders',
    description: 'List upcoming reminders.',
    schema: { type: 'object', properties: {} },
    run(_i, { now }) {
      const list = getState().reminders.filter((r) => !r.done).sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, 30);
      return ok(`Found ${plural(list.length, 'reminder')}`, { reminders: list.map((r) => ({ id: r.id, text: r.text, at: formatWhen(r.at, todayKey(now)), recurrence: r.recurrence })) });
    },
  },
  {
    name: 'delete_reminder',
    description: 'Delete a reminder. Requires confirmation.',
    destructive: true,
    schema: { type: 'object', properties: { reminder: { type: 'string', description: 'Reminder text or id.' } }, required: ['reminder'] },
    run(i, ctx) {
      const r = resolve(getState().reminders.filter((x) => !x.done), i.reminder, (x) => x.text, 'reminder');
      if ('error' in r) return fail(r.error);
      if (!ctx.confirmed) return pending('delete_reminder', { reminder: r.item.id }, `Delete reminder “${r.item.text}”`);
      A.deleteReminder(r.item.id);
      return ok(`Deleted reminder “${r.item.text}”`);
    },
  },
  {
    name: 'get_schedule',
    description: 'Events, reminders and task deadlines between two dates (inclusive). Use for “what do I have tomorrow”.',
    schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['from'] },
    run(i) {
      const from = dateArg(i.from, 'from')!;
      const to = dateArg(i.to, 'to') ?? from;
      if (diffDays(from, to) > 62) return fail('Ask for at most two months at a time.');
      const items = scheduleFor(getState(), from, to);
      return ok(`Checked schedule for ${from === to ? formatDay(from) : `${from} to ${to}`}`, { from, to, items });
    },
  },
  {
    name: 'create_event',
    description: 'Add a calendar event. start/end are local YYYY-MM-DDTHH:MM. Default length is one hour.',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 200 }, start: { type: 'string' }, end: { type: 'string' }, location: { type: 'string', maxLength: 200 },
        description: { type: 'string', maxLength: 2000 }, project: { type: 'string' }, reminderMinutes: { type: 'integer', minimum: 0, maximum: 10080 },
      },
      required: ['title', 'start'],
    },
    run(i, { now }) {
      const start = dateTimeArg(i.start, 'start');
      const end = i.end ? dateTimeArg(i.end, 'end') : new Date(start.getTime() + 3600_000);
      if (end <= start) return fail('The end must be after the start.');
      const e = A.createEvent({ title: String(i.title), start: start.toISOString(), end: end.toISOString(), location: (i.location as string) ?? '', description: (i.description as string) ?? '', projectId: projectRef(i.project), reminderMinutes: i.reminderMinutes as number | undefined });
      return ok(`Added “${e.title}” on ${formatWhen(e.start, todayKey(now))}`, { ok: true, id: e.id });
    },
  },
  {
    name: 'update_event',
    description: 'Move or edit an event. Identify it by title (the soonest upcoming match is used). New times are local YYYY-MM-DDTHH:MM; if only start changes, the length is kept.',
    schema: {
      type: 'object',
      properties: { event: { type: 'string' }, title: { type: 'string', maxLength: 200 }, start: { type: 'string' }, end: { type: 'string' }, location: { type: 'string', maxLength: 200 }, description: { type: 'string', maxLength: 2000 } },
      required: ['event'],
    },
    run(i, { now }) {
      const upcoming = getState().events.filter((e) => new Date(e.end) >= now).sort((a, b) => (a.start < b.start ? -1 : 1));
      let r = resolve(upcoming, i.event, (e) => e.title, 'upcoming event');
      if ('error' in r && r.candidates?.length) r = { item: r.candidates.sort((a, b) => (a.start < b.start ? -1 : 1))[0] };
      if ('error' in r) return fail(r.error);
      const e = r.item;
      const patch: Record<string, unknown> = {};
      for (const k of ['title', 'location', 'description'] as const) if (i[k] !== undefined) patch[k] = i[k];
      if (i.start) {
        const s = dateTimeArg(i.start, 'start');
        const len = new Date(e.end).getTime() - new Date(e.start).getTime();
        patch.start = s.toISOString();
        patch.end = i.end ? dateTimeArg(i.end, 'end').toISOString() : new Date(s.getTime() + len).toISOString();
      } else if (i.end) patch.end = dateTimeArg(i.end, 'end').toISOString();
      if (patch.end && new Date(patch.end as string) <= new Date((patch.start as string) ?? e.start)) return fail('The end must be after the start.');
      const u = A.updateEvent(e.id, patch)!;
      return ok(`Moved “${u.title}” to ${formatWhen(u.start, todayKey(now))}`, { ok: true, title: u.title, start: formatWhen(u.start, todayKey(now)), end: formatTime(localTimeOf(u.end)) });
    },
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event. Requires confirmation.',
    destructive: true,
    schema: { type: 'object', properties: { event: { type: 'string' } }, required: ['event'] },
    run(i, ctx) {
      const r = resolve(getState().events, i.event, (e) => e.title, 'event');
      if ('error' in r) return fail(r.error);
      if (!ctx.confirmed) return pending('delete_event', { event: r.item.id }, `Delete event “${r.item.title}” (${localDateOf(r.item.start)})`);
      A.deleteEvent(r.item.id);
      return ok(`Deleted event “${r.item.title}”`);
    },
  },
  {
    name: 'search_memory',
    description: 'Look up things the user asked you to remember. Empty query returns all.',
    schema: { type: 'object', properties: { query: { type: 'string' } } },
    run(i) {
      const q = String(i.query ?? '').toLowerCase();
      const list = getState().memories.filter((m) => !q || m.content.toLowerCase().includes(q) || q.split(/\s+/).some((w) => w.length > 3 && m.content.toLowerCase().includes(w)));
      return ok(`Found ${plural(list.length, 'memory', 'memories')}`, { memories: list.slice(0, 40).map((m) => ({ id: m.id, content: m.content, category: m.category })) });
    },
  },
  {
    name: 'save_memory',
    description: 'Remember a fact or preference long-term. Only when the user asks you to remember something. Never store passwords or other secrets.',
    schema: { type: 'object', properties: { content: { type: 'string', maxLength: 1000 }, category: { type: 'string', enum: MEMORY_CATEGORIES } }, required: ['content'] },
    run(i) {
      if (!getState().settings.memoryEnabled) return fail('Memory is turned off in Settings.');
      if (/\b(password|passcode|pin code|credit card|card number|cvv|social security|api key|secret key)\b/i.test(String(i.content))) return fail('I don’t store passwords, card numbers or other secrets.');
      const m = A.saveMemory(String(i.content), (i.category as MemoryCategory) ?? 'important');
      return ok(`Remembered: ${m.content}`, { ok: true });
    },
  },
  {
    name: 'delete_memory',
    description: 'Forget a stored memory. Requires confirmation.',
    destructive: true,
    schema: { type: 'object', properties: { memory: { type: 'string', description: 'Words from the memory, or its id.' } }, required: ['memory'] },
    run(i, ctx) {
      const r = resolve(getState().memories, i.memory, (m) => m.content, 'memory');
      if ('error' in r) return fail(r.error);
      if (!ctx.confirmed) return pending('delete_memory', { memory: r.item.id }, `Forget “${r.item.content.slice(0, 80)}”`);
      A.deleteMemory(r.item.id);
      return ok(`Forgot “${r.item.content.slice(0, 80)}”`);
    },
  },
  {
    name: 'search_conversations',
    description: 'Search earlier conversations (titles and recent text). Use for “what did I say about X”.',
    schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run(i) {
      const s = getState();
      const hits = globalSearch({ ...s, tasks: [], projects: [], notes: [], memories: [], documents: [], events: [], reminders: [] }, String(i.query), 8);
      return ok(`Searched conversations`, { results: hits.map((h) => ({ title: h.title, date: s.conversations.find((c) => c.id === h.id)?.lastMessageAt.slice(0, 10), excerpt: h.snippet })) });
    },
  },
  {
    name: 'search_everything',
    description: 'Search tasks, projects, notes, conversations, memories, documents and events at once.',
    schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run(i) {
      const hits = globalSearch(getState(), String(i.query), 20);
      return ok(`Found ${plural(hits.length, 'result')}`, { results: hits.map((h) => ({ type: h.type, title: h.title, excerpt: h.snippet })) });
    },
  },
  {
    name: 'get_activity',
    description: 'What happened between two dates (created/completed items). Use for “what did I work on yesterday/this week”.',
    schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['from'] },
    run(i) {
      const from = dateArg(i.from, 'from')!, to = dateArg(i.to, 'to') ?? from;
      const s = getState();
      const acts = s.activity.filter((a) => { const d = localDateOf(a.createdAt); return d >= from && d <= to; }).slice(0, 60);
      const convs = s.conversations.filter((c) => { const d = localDateOf(c.lastMessageAt); return d >= from && d <= to; }).map((c) => c.title);
      return ok(`Checked activity`, { from, to, activity: acts.map((a) => `${localDateOf(a.createdAt)} ${localTimeOf(a.createdAt)} ${a.label}`), conversations: convs });
    },
  },
  {
    name: 'get_document',
    description: 'Read an uploaded document’s text (first 20,000 characters) to summarise it, answer questions or extract action items.',
    schema: { type: 'object', properties: { document: { type: 'string', description: 'Document name or id.' } }, required: ['document'] },
    async run(i) {
      const r = resolve(getState().documents, i.document, (d) => d.name, 'document');
      if ('error' in r) return fail(r.error);
      const text = await loadDocumentText(r.item.id);
      return ok(`Read “${r.item.name}”`, { name: r.item.name, text: text.slice(0, 20000), truncated: text.length > 20000 });
    },
  },
  {
    name: 'plan_day',
    description: 'Draft a schedule for a day from events and open tasks (by priority and due date). Present it and offer to adjust.',
    schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD, default today' } } },
    run(i, { now }) {
      const day = dateArg(i.date, 'date') ?? todayKey(now);
      const plan = planDay(getState(), day, now);
      return ok(`Drafted a plan for ${formatDay(day)}`, { day, plan: describePlan(plan, day), unscheduled: plan.unscheduled.map((t) => t.title) });
    },
  },
  {
    name: 'delete_all',
    description: 'Delete every item of one kind (e.g. all projects, all completed tasks). Always requires confirmation.',
    destructive: true,
    schema: { type: 'object', properties: { kind: { type: 'string', enum: ['tasks', 'completed_tasks', 'projects', 'notes', 'reminders', 'events', 'memories'] } }, required: ['kind'] },
    run(i, ctx) {
      const s = getState();
      const kind = String(i.kind);
      const items: { id: string }[] =
        kind === 'tasks' ? s.tasks : kind === 'completed_tasks' ? s.tasks.filter((t) => t.status === 'completed') : (s[kind as 'projects'] as { id: string }[]);
      const label = kind.replace('_', ' ');
      if (!items.length) return fail(`There are no ${label} to delete.`);
      if (!ctx.confirmed) return pending('delete_all', { kind }, `Delete all ${plural(items.length, label.replace(/s$/, ''), label)}`);
      const del: Record<string, (id: string) => unknown> = {
        tasks: A.deleteTask, completed_tasks: A.deleteTask, projects: A.deleteProject, notes: A.deleteNote, reminders: A.deleteReminder, events: A.deleteEvent, memories: A.deleteMemory,
      };
      items.forEach((it) => del[kind](it.id));
      return ok(`Deleted ${plural(items.length, label.replace(/s$/, ''), label)}`);
    },
  },
  {
    name: 'search_web',
    description: 'Search the internet. Returns results with source links, or says that live search is unavailable.',
    schema: { type: 'object', properties: { query: { type: 'string', maxLength: 300 } }, required: ['query'] },
    async run(i) {
      const r = await webSearch(String(i.query));
      if (!r.available) return { ok: false, summary: 'Live web search is not available', data: { available: false, message: r.message } };
      return ok(`Searched the web for “${i.query}”`, { results: r.results });
    },
  },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);

/** Validates and runs a tool. Never throws: problems come back as a failed result. */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const def = toolByName(name);
  if (!def) return fail(`Unknown action “${name}”.`);
  try {
    const args = validateInput(def.schema, input);
    return await def.run(args, ctx);
  } catch (e) {
    if (e instanceof ToolInputError) return fail(e.message);
    console.error(e);
    return fail('That action failed unexpectedly.');
  }
}

export const sortByPriority = (a: { priority: Priority }, b: { priority: Priority }) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
