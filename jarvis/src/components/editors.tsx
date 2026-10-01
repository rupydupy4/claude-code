import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { CalendarEvent, Memory, MemoryCategory, Note, Priority, Project, ProjectStatus, Recurrence, Reminder, Task, TaskStatus } from '../domain/types';
import { getState, useStore } from '../data/store';
import * as A from '../services/actions';
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, STATUS_LABEL } from '../services/queries';
import { fromDateKey, isDateKey, isTime, localDateOf, localTimeOf, toDateKey, toTime } from '../utils/dates';
import { notify } from '../services/notify';
import { Field, Modal, confirmAction } from './ui';

/**
 * One host renders whichever editor is open, so any screen (or a quick action) can call
 * `openEditor({ kind: 'task' })` without owning modal state.
 */
export type EditorRequest =
  | { kind: 'task'; id?: string; defaults?: Partial<Task> }
  | { kind: 'project'; id?: string; defaults?: Partial<Project> }
  | { kind: 'note'; id?: string; defaults?: Partial<Note> }
  | { kind: 'reminder'; id?: string; defaults?: Partial<Reminder> }
  | { kind: 'event'; id?: string; defaults?: Partial<CalendarEvent> & { date?: string } }
  | { kind: 'memory'; id?: string; defaults?: Partial<Memory> };

let push: ((r: EditorRequest | null) => void) | null = null;
export const openEditor = (r: EditorRequest) => push?.(r);

export function EditorHost() {
  const [req, setReq] = useState<EditorRequest | null>(null);
  useEffect(() => {
    push = setReq;
    return () => {
      push = null;
    };
  }, []);
  if (!req) return null;
  const close = () => setReq(null);
  const key = `${req.kind}:${req.id ?? 'new'}`;
  switch (req.kind) {
    case 'task': return <TaskEditor key={key} id={req.id} defaults={req.defaults} onClose={close} />;
    case 'project': return <ProjectEditor key={key} id={req.id} defaults={req.defaults} onClose={close} />;
    case 'note': return <NoteEditor key={key} id={req.id} defaults={req.defaults} onClose={close} />;
    case 'reminder': return <ReminderEditor key={key} id={req.id} defaults={req.defaults} onClose={close} />;
    case 'event': return <EventEditor key={key} id={req.id} defaults={req.defaults} onClose={close} />;
    case 'memory': return <MemoryEditor key={key} id={req.id} defaults={req.defaults} onClose={close} />;
  }
}

// ------------------------------------------------------------------ shared pieces

function EditorShell({ title, onClose, onSubmit, onDelete, submitLabel, children }: { title: string; onClose: () => void; onSubmit: () => boolean; onDelete?: () => void; submitLabel: string; children: ReactNode }) {
  const formId = `form-${title.replace(/\W+/g, '-').toLowerCase()}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (onSubmit()) onClose();
  };
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button type="button" className="btn danger" onClick={onDelete} style={{ marginRight: 'auto' }}>Delete</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form={formId} className="btn primary">{submitLabel}</button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={submit} noValidate>
        {children}
      </form>
    </Modal>
  );
}

const tagsFrom = (s: string) => Array.from(new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 12);

function ProjectSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const projects = useStore((s) => s.projects);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No project</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

async function confirmDelete(what: string, name: string, extra = '') {
  return confirmAction({ title: `Delete ${what}?`, body: `“${name}” will be permanently deleted.${extra ? ` ${extra}` : ''}`, confirmLabel: 'Delete', danger: true });
}

// ------------------------------------------------------------------ task

function TaskEditor({ id, defaults, onClose }: { id?: string; defaults?: Partial<Task>; onClose: () => void }) {
  const existing = id ? getState().tasks.find((t) => t.id === id) : undefined;
  const init = { ...defaults, ...existing };
  const [title, setTitle] = useState(init.title ?? '');
  const [description, setDescription] = useState(init.description ?? '');
  const [priority, setPriority] = useState<Priority>(init.priority ?? 'medium');
  const [status, setStatus] = useState<TaskStatus>(init.status ?? 'not_started');
  const [dueDate, setDueDate] = useState(init.dueDate ?? '');
  const [dueTime, setDueTime] = useState(init.dueTime ?? '');
  const [projectId, setProjectId] = useState(init.projectId ?? '');
  const [tags, setTags] = useState((init.tags ?? []).join(', '));
  const [notes, setNotes] = useState(init.notes ?? '');
  const [error, setError] = useState('');

  const submit = () => {
    if (!title.trim()) return setError('Give the task a title.'), false;
    if (dueDate && !isDateKey(dueDate)) return setError('That due date isn’t valid.'), false;
    if (dueTime && !dueDate) return setError('Add a due date for the time to apply.'), false;
    const data = {
      title: title.trim().slice(0, 200), description: description.slice(0, 4000), priority, status,
      dueDate: dueDate || undefined, dueTime: dueTime && isTime(dueTime) ? dueTime : undefined,
      projectId: projectId || undefined, tags: tagsFrom(tags), notes: notes.slice(0, 8000),
    };
    if (existing) A.updateTask(existing.id, data);
    else A.createTask(data);
    A.touchProject(data.projectId);
    notify(existing ? 'Task saved.' : `Task created: ${data.title}`, 'success');
    return true;
  };
  const remove = async () => {
    if (!existing || !(await confirmDelete('task', existing.title))) return;
    A.deleteTask(existing.id);
    notify('Task deleted.');
    onClose();
  };

  return (
    <EditorShell title={existing ? 'Edit task' : 'New task'} onClose={onClose} onSubmit={submit} onDelete={existing ? remove : undefined} submitLabel={existing ? 'Save' : 'Create task'}>
      <Field label="Title" error={error || undefined}>
        {(fid, d) => <input id={fid} type="text" value={title} autoFocus maxLength={200} aria-invalid={!!error && !title.trim()} aria-describedby={d} onChange={(e) => { setTitle(e.target.value); setError(''); }} placeholder="e.g. Finish the landing page" />}
      </Field>
      <Field label="Description">{(fid) => <textarea id={fid} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />}</Field>
      <div className="form-grid two">
        <Field label="Priority">
          {(fid) => (
            <select id={fid} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {A.PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Status">
          {(fid) => (
            <select id={fid} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {A.STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Due date">{(fid) => <input id={fid} type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setError(''); }} />}</Field>
        <Field label="Due time" help="Optional">{(fid, d) => <input id={fid} type="time" value={dueTime} aria-describedby={d} onChange={(e) => setDueTime(e.target.value)} />}</Field>
      </div>
      <Field label="Project">{(fid) => <ProjectSelect id={fid} value={projectId} onChange={setProjectId} />}</Field>
      <Field label="Tags" help="Separate with commas, e.g. work, client">{(fid, d) => <input id={fid} type="text" value={tags} aria-describedby={d} onChange={(e) => setTags(e.target.value)} />}</Field>
      <Field label="Notes">{(fid) => <textarea id={fid} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />}</Field>
      {existing && (
        <p className="tiny faint">
          Created {new Date(existing.createdAt).toLocaleString()}
          {existing.completedAt ? ` · Completed ${new Date(existing.completedAt).toLocaleString()}` : ''}
        </p>
      )}
    </EditorShell>
  );
}

// ------------------------------------------------------------------ project

function ProjectEditor({ id, defaults, onClose }: { id?: string; defaults?: Partial<Project>; onClose: () => void }) {
  const existing = id ? getState().projects.find((p) => p.id === id) : undefined;
  const init = { ...defaults, ...existing };
  const [name, setName] = useState(init.name ?? '');
  const [description, setDescription] = useState(init.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(init.status ?? 'active');
  const [deadline, setDeadline] = useState(init.deadline ?? '');
  const [error, setError] = useState('');

  const submit = () => {
    const n = name.trim();
    if (!n) return setError('Give the project a name.'), false;
    if (getState().projects.some((p) => p.id !== existing?.id && p.name.toLowerCase() === n.toLowerCase())) return setError('A project with that name already exists.'), false;
    const data = { name: n.slice(0, 120), description: description.slice(0, 4000), status, deadline: deadline && isDateKey(deadline) ? deadline : undefined };
    if (existing) A.updateProject(existing.id, data);
    else A.createProject(data);
    notify(existing ? 'Project saved.' : `Project created: ${data.name}`, 'success');
    return true;
  };
  const remove = async () => {
    if (!existing || !(await confirmDelete('project', existing.name, 'Its tasks, notes and files are kept but unlinked.'))) return;
    A.deleteProject(existing.id);
    notify('Project deleted.');
    onClose();
    if (location.hash.includes(existing.id)) location.hash = '#/projects';
  };

  return (
    <EditorShell title={existing ? 'Edit project' : 'New project'} onClose={onClose} onSubmit={submit} onDelete={existing ? remove : undefined} submitLabel={existing ? 'Save' : 'Create project'}>
      <Field label="Name" error={error || undefined}>
        {(fid, d) => <input id={fid} type="text" value={name} autoFocus maxLength={120} aria-describedby={d} aria-invalid={!!error} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="e.g. Website redesign" />}
      </Field>
      <Field label="Description">{(fid) => <textarea id={fid} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />}</Field>
      <div className="form-grid two">
        <Field label="Status">
          {(fid) => (
            <select id={fid} value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Deadline">{(fid) => <input id={fid} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}</Field>
      </div>
    </EditorShell>
  );
}

// ------------------------------------------------------------------ note

function NoteEditor({ id, defaults, onClose }: { id?: string; defaults?: Partial<Note>; onClose: () => void }) {
  const existing = id ? getState().notes.find((n) => n.id === id) : undefined;
  const init = { ...defaults, ...existing };
  const [title, setTitle] = useState(init.title ?? '');
  const [content, setContent] = useState(init.content ?? '');
  const [projectId, setProjectId] = useState(init.projectId ?? '');
  const [tags, setTags] = useState((init.tags ?? []).join(', '));
  const [error, setError] = useState('');

  const submit = () => {
    if (!content.trim() && !title.trim()) return setError('Write something first.'), false;
    const data = { title: title.trim().slice(0, 160), content: (content.trim() || title.trim()).slice(0, 20000), projectId: projectId || undefined, tags: tagsFrom(tags) };
    if (existing) A.updateNote(existing.id, { ...data, title: data.title || existing.title });
    else A.createNote(data);
    notify(existing ? 'Note saved.' : 'Note added.', 'success');
    return true;
  };
  const remove = async () => {
    if (!existing || !(await confirmDelete('note', existing.title))) return;
    A.deleteNote(existing.id);
    notify('Note deleted.');
    onClose();
  };

  return (
    <EditorShell title={existing ? 'Edit note' : 'New note'} onClose={onClose} onSubmit={submit} onDelete={existing ? remove : undefined} submitLabel={existing ? 'Save' : 'Add note'}>
      <Field label="Title" help="Optional — the first line is used if empty">{(fid, d) => <input id={fid} type="text" value={title} maxLength={160} aria-describedby={d} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Note" error={error || undefined}>
        {(fid, d) => <textarea id={fid} value={content} autoFocus rows={8} aria-describedby={d} aria-invalid={!!error} onChange={(e) => { setContent(e.target.value); setError(''); }} />}
      </Field>
      <div className="form-grid two">
        <Field label="Project">{(fid) => <ProjectSelect id={fid} value={projectId} onChange={setProjectId} />}</Field>
        <Field label="Tags" help="Comma separated">{(fid, d) => <input id={fid} type="text" value={tags} aria-describedby={d} onChange={(e) => setTags(e.target.value)} />}</Field>
      </div>
    </EditorShell>
  );
}

// ------------------------------------------------------------------ reminder

const RECURRENCE_LABEL: Record<Recurrence, string> = { none: 'Once', daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month' };

function nextHalfHour(now = new Date()) {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

function ReminderEditor({ id, defaults, onClose }: { id?: string; defaults?: Partial<Reminder>; onClose: () => void }) {
  const existing = id ? getState().reminders.find((r) => r.id === id) : undefined;
  const tasks = useStore((s) => s.tasks);
  const init = { ...defaults, ...existing };
  const at = init.at ? new Date(init.at) : nextHalfHour();
  const [text, setText] = useState(init.text ?? '');
  const [date, setDate] = useState(toDateKey(at));
  const [time, setTime] = useState(toTime(at));
  const [recurrence, setRecurrence] = useState<Recurrence>(init.recurrence ?? 'none');
  const [taskId, setTaskId] = useState(init.taskId ?? '');
  const [error, setError] = useState('');

  const submit = () => {
    if (!text.trim()) return setError('What should I remind you about?'), false;
    if (!isDateKey(date) || !isTime(time)) return setError('Choose a valid date and time.'), false;
    const when = fromDateKey(date, time);
    if (recurrence === 'none' && when.getTime() <= Date.now() && (!existing || existing.at !== when.toISOString())) return setError('That time has already passed. Choose a time in the future.'), false;
    const data = { text: text.trim().slice(0, 300), at: when.toISOString(), recurrence, taskId: taskId || undefined };
    if (existing) {
      A.updateReminder(existing.id, { ...data, done: false, lastFiredAt: undefined });
    } else A.createReminder(data);
    notify(existing ? 'Reminder saved.' : 'Reminder set.', 'success');
    return true;
  };
  const remove = async () => {
    if (!existing || !(await confirmDelete('reminder', existing.text))) return;
    A.deleteReminder(existing.id);
    notify('Reminder deleted.');
    onClose();
  };

  return (
    <EditorShell title={existing ? 'Edit reminder' : 'New reminder'} onClose={onClose} onSubmit={submit} onDelete={existing ? remove : undefined} submitLabel={existing ? 'Save' : 'Set reminder'}>
      <Field label="Remind me to" error={error || undefined}>
        {(fid, d) => <input id={fid} type="text" value={text} autoFocus maxLength={300} aria-describedby={d} aria-invalid={!!error && !text.trim()} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder="e.g. Call the client" />}
      </Field>
      <div className="form-grid two">
        <Field label="Date">{(fid) => <input id={fid} type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(''); }} />}</Field>
        <Field label="Time">{(fid) => <input id={fid} type="time" value={time} onChange={(e) => { setTime(e.target.value); setError(''); }} />}</Field>
      </div>
      <Field label="Repeat">
        {(fid) => (
          <select id={fid} value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
          </select>
        )}
      </Field>
      <Field label="Linked task" help="Optional">
        {(fid, d) => (
          <select id={fid} value={taskId} aria-describedby={d} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">None</option>
            {tasks.filter((t) => t.status !== 'completed' || t.id === taskId).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        )}
      </Field>
    </EditorShell>
  );
}

// ------------------------------------------------------------------ event

function EventEditor({ id, defaults, onClose }: { id?: string; defaults?: Partial<CalendarEvent> & { date?: string }; onClose: () => void }) {
  const existing = id ? getState().events.find((e) => e.id === id) : undefined;
  const init = { ...defaults, ...existing };
  const startD = init.start ? new Date(init.start) : init.date ? fromDateKey(init.date, '09:00') : nextHalfHour();
  const endD = init.end ? new Date(init.end) : new Date(startD.getTime() + 3600_000);
  const [title, setTitle] = useState(init.title ?? '');
  const [description, setDescription] = useState(init.description ?? '');
  const [date, setDate] = useState(localDateOf(startD.toISOString()));
  const [start, setStart] = useState(localTimeOf(startD.toISOString()));
  const [end, setEnd] = useState(localTimeOf(endD.toISOString()));
  const [location, setLocation] = useState(init.location ?? '');
  const [projectId, setProjectId] = useState(init.projectId ?? '');
  const [reminder, setReminder] = useState(init.reminderMinutes === undefined ? '' : String(init.reminderMinutes));
  const [error, setError] = useState('');

  const submit = () => {
    if (!title.trim()) return setError('Give the event a title.'), false;
    if (!isDateKey(date) || !isTime(start) || !isTime(end)) return setError('Choose a valid date and times.'), false;
    const s = fromDateKey(date, start);
    let e = fromDateKey(date, end);
    if (e <= s) {
      if (end < start) e = new Date(e.getTime() + 86_400_000); // ends after midnight
      else return setError('The end time must be after the start.'), false;
    }
    const data = {
      title: title.trim().slice(0, 200), description: description.slice(0, 4000), start: s.toISOString(), end: e.toISOString(),
      location: location.trim().slice(0, 200), projectId: projectId || undefined, reminderMinutes: reminder === '' ? undefined : Number(reminder),
    };
    if (existing) A.updateEvent(existing.id, data);
    else A.createEvent(data);
    notify(existing ? 'Event saved.' : `Event added: ${data.title}`, 'success');
    return true;
  };
  const remove = async () => {
    if (!existing || !(await confirmDelete('event', existing.title))) return;
    A.deleteEvent(existing.id);
    notify('Event deleted.');
    onClose();
  };

  return (
    <EditorShell title={existing ? 'Edit event' : 'New event'} onClose={onClose} onSubmit={submit} onDelete={existing ? remove : undefined} submitLabel={existing ? 'Save' : 'Add event'}>
      <Field label="Title" error={error || undefined}>
        {(fid, d) => <input id={fid} type="text" value={title} autoFocus maxLength={200} aria-describedby={d} aria-invalid={!!error && !title.trim()} onChange={(e) => { setTitle(e.target.value); setError(''); }} placeholder="e.g. Client call" />}
      </Field>
      <div className="form-grid three">
        <Field label="Date">{(fid) => <input id={fid} type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(''); }} />}</Field>
        <Field label="Starts">{(fid) => <input id={fid} type="time" value={start} onChange={(e) => { setStart(e.target.value); setError(''); }} />}</Field>
        <Field label="Ends">{(fid) => <input id={fid} type="time" value={end} onChange={(e) => { setEnd(e.target.value); setError(''); }} />}</Field>
      </div>
      <Field label="Location">{(fid) => <input id={fid} type="text" value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} />}</Field>
      <div className="form-grid two">
        <Field label="Project">{(fid) => <ProjectSelect id={fid} value={projectId} onChange={setProjectId} />}</Field>
        <Field label="Reminder">
          {(fid) => (
            <select id={fid} value={reminder} onChange={(e) => setReminder(e.target.value)}>
              <option value="">None</option>
              <option value="0">At start time</option>
              <option value="5">5 minutes before</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          )}
        </Field>
      </div>
      <Field label="Description">{(fid) => <textarea id={fid} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />}</Field>
    </EditorShell>
  );
}

// ------------------------------------------------------------------ memory

export const MEMORY_CATEGORIES: Record<MemoryCategory, string> = {
  preferences: 'Preferences', projects: 'Projects', people: 'People', work: 'Work', instructions: 'Instructions', important: 'Important',
};
const SECRET = /\b(password|passcode|pin code|api[ -]?key|secret key|private key|credit card|card number|cvv|social security|sort code|bank account number|seed phrase)\b/i;

function MemoryEditor({ id, defaults, onClose }: { id?: string; defaults?: Partial<Memory>; onClose: () => void }) {
  const existing = id ? getState().memories.find((m) => m.id === id) : undefined;
  const init = { ...defaults, ...existing };
  const [content, setContent] = useState(init.content ?? '');
  const [category, setCategory] = useState<MemoryCategory>(init.category ?? 'preferences');
  const [error, setError] = useState('');
  const submit = () => {
    const c = content.trim();
    if (!c) return setError('Write what JARVIS should remember.'), false;
    if (SECRET.test(c)) return setError('For your safety, JARVIS doesn’t store passwords, keys or card details.'), false;
    if (existing) A.updateMemory(existing.id, { content: c.slice(0, 1000), category });
    else A.saveMemory(c.slice(0, 1000), category);
    notify(existing ? 'Memory updated.' : 'Saved to memory.', 'success');
    return true;
  };
  const remove = async () => {
    if (!existing || !(await confirmDelete('memory', existing.content.slice(0, 80)))) return;
    A.deleteMemory(existing.id);
    onClose();
  };
  return (
    <EditorShell title={existing ? 'Edit memory' : 'Add memory'} onClose={onClose} onSubmit={submit} onDelete={existing ? remove : undefined} submitLabel="Save">
      <Field label="Remember that…" error={error || undefined}>
        {(fid, d) => <textarea id={fid} value={content} autoFocus rows={4} maxLength={1000} aria-describedby={d} aria-invalid={!!error} onChange={(e) => { setContent(e.target.value); setError(''); }} placeholder="e.g. I prefer meetings after 11 AM" />}
      </Field>
      <Field label="Category">
        {(fid) => (
          <select id={fid} value={category} onChange={(e) => setCategory(e.target.value as MemoryCategory)}>
            {(Object.keys(MEMORY_CATEGORIES) as MemoryCategory[]).map((c) => <option key={c} value={c}>{MEMORY_CATEGORIES[c]}</option>)}
          </select>
        )}
      </Field>
    </EditorShell>
  );
}

export { RECURRENCE_LABEL };
