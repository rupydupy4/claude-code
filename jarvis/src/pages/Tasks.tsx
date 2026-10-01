import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Priority, Task, TaskStatus } from '../domain/types';
import { useStore } from '../data/store';
import { PRIORITY_LABEL, PRIORITY_RANK, STATUS_LABEL, byImportance, isOpen, isOverdue } from '../services/queries';
import { PRIORITIES, STATUSES } from '../services/actions';
import { addDays, todayKey } from '../utils/dates';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { openEditor } from '../components/editors';
import { TaskRow } from '../components/rows';

type When = 'all' | 'today' | 'overdue' | 'week' | 'nodate' | 'done';
const WHEN: { value: When; label: string }[] = [
  { value: 'all', label: 'Open' }, { value: 'today', label: 'Today' }, { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'Next 7 days' }, { value: 'nodate', label: 'No date' }, { value: 'done', label: 'Completed' },
];
type Sort = 'importance' | 'due' | 'priority' | 'created' | 'title';
const PAGE = 50;

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const when = (WHEN.some((w) => w.value === params.get('filter')) ? params.get('filter') : 'all') as When;
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [projectId, setProjectId] = useState('');
  const [sort, setSort] = useState<Sort>('importance');
  const [limit, setLimit] = useState(PAGE);

  // Deep link from search or the assistant: /tasks?open=<id>
  useEffect(() => {
    const id = params.get('open');
    if (id && tasks.some((t) => t.id === id)) {
      openEditor({ kind: 'task', id });
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, setParams, tasks]);

  const today = todayKey();
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const week = addDays(today, 7);
    const out = tasks.filter((t) => {
      if (when === 'done' ? t.status !== 'completed' : !isOpen(t)) return false;
      if (when === 'today' && t.dueDate !== today) return false;
      if (when === 'overdue' && !isOverdue(t, today)) return false;
      if (when === 'week' && !(t.dueDate && t.dueDate >= today && t.dueDate <= week)) return false;
      if (when === 'nodate' && t.dueDate) return false;
      if (priority && t.priority !== priority) return false;
      if (status && t.status !== status) return false;
      if (projectId && t.projectId !== (projectId === 'none' ? undefined : projectId)) return false;
      if (term && !`${t.title} ${t.description} ${t.notes} ${t.tags.join(' ')}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const cmp: Record<Sort, (a: Task, b: Task) => number> = {
      importance: (a, b) => byImportance(a, b, today),
      due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99'),
      priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return out.sort(when === 'done' && sort === 'importance' ? (a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') : cmp[sort]);
  }, [tasks, when, priority, status, projectId, q, sort, today]);

  const setWhen = (v: When) => {
    if (v === 'all') params.delete('filter');
    else params.set('filter', v);
    setParams(params, { replace: true });
    setLimit(PAGE);
  };
  const filtered = !!(q || priority || status || projectId);

  return (
    <div className="stack">
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.filter(isOpen).length} open · ${tasks.filter((t) => isOverdue(t, today)).length} overdue`}
        actions={<button type="button" className="btn primary" onClick={() => openEditor({ kind: 'task' })}><Icon name="plus" />New task</button>}
      />
      <div className="scroll-x" role="group" aria-label="Show">
        {WHEN.map((w) => <button key={w.value} type="button" className="chip" aria-pressed={when === w.value} onClick={() => setWhen(w.value)}>{w.label}</button>)}
      </div>
      <div className="form-grid two" style={{ gridTemplateColumns: undefined }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
        <div className="row nowrap" style={{ gap: 8 }}>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} aria-label="Priority">
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | '')} aria-label="Status">
            <option value="">Any status</option>
            {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </select>
        </div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          <option value="none">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
          <option value="importance">Sort: most important</option>
          <option value="due">Sort: due date</option>
          <option value="priority">Sort: priority</option>
          <option value="created">Sort: newest</option>
          <option value="title">Sort: title</option>
        </select>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon="tasks"
          title={filtered || when !== 'all' ? 'No tasks match' : 'No tasks yet'}
          action={!filtered && when === 'all' ? <button type="button" className="btn primary" onClick={() => openEditor({ kind: 'task' })}>Create a task</button> : undefined}
        >
          {filtered || when !== 'all' ? 'Try another filter.' : 'Add one here, or ask the assistant: “Create a task to finish the report by Friday.”'}
        </EmptyState>
      ) : (
        <>
          <p className="small faint" aria-live="polite">{list.length} {list.length === 1 ? 'task' : 'tasks'}</p>
          <ul className="list panel flush">{list.slice(0, limit).map((t) => <TaskRow key={t.id} task={t} />)}</ul>
          {list.length > limit && <button type="button" className="btn ghost" onClick={() => setLimit((n) => n + PAGE)}>Show more</button>}
        </>
      )}
    </div>
  );
}
