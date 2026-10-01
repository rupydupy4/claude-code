import type { Activity, Task } from '../domain/types';
import { useStore } from '../data/store';
import * as A from '../services/actions';
import { PRIORITY_LABEL, STATUS_LABEL, isOverdue } from '../services/queries';
import { formatDay, formatTime, todayKey } from '../utils/dates';
import { notify } from '../services/notify';
import { Icon } from './Icon';
import { DemoBadge } from './ui';
import { openEditor } from './editors';

export function TaskRow({ task, showProject = true }: { task: Task; showProject?: boolean }) {
  const project = useStore((s) => (task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined));
  const done = task.status === 'completed';
  const overdue = isOverdue(task, todayKey());
  const toggle = () => {
    if (done) A.reopenTask(task.id);
    else {
      A.completeTask(task.id);
      notify(`Completed: ${task.title}`, 'success', { label: 'Undo', run: () => A.reopenTask(task.id) });
    }
  };
  return (
    <li className={done ? 'done' : ''}>
      <button type="button" className="check-circle" onClick={toggle} aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`} aria-pressed={done}>
        <Icon name="check" size={14} />
      </button>
      <button type="button" className="item-btn" onClick={() => openEditor({ kind: 'task', id: task.id })}>
        <div className="title">{task.title}</div>
        <div className="meta">
          <span className="row nowrap" style={{ gap: 5 }}><i className={`prio ${task.priority}`} />{PRIORITY_LABEL[task.priority]}</span>
          {task.status !== 'not_started' && !done && <span>{STATUS_LABEL[task.status]}</span>}
          {task.dueDate && (
            <span className={overdue ? 'badge danger' : undefined}>
              {overdue ? 'Overdue · ' : 'Due '}
              {formatDay(task.dueDate)}
              {task.dueTime ? ` ${formatTime(task.dueTime)}` : ''}
            </span>
          )}
          {showProject && project && <span><Icon name="folder" size={12} /> {project.name}</span>}
          {task.tags.map((t) => <span key={t}>#{t}</span>)}
          <DemoBadge show={task.demo} />
        </div>
      </button>
    </li>
  );
}

const VERB_ICON: Record<Activity['verb'], string> = { created: 'plus', updated: 'edit', completed: 'circle-check', reopened: 'retry', deleted: 'trash', analysed: 'sparkles', fired: 'bell' };

export function ActivityRow({ a }: { a: Activity }) {
  const d = new Date(a.createdAt);
  return (
    <li>
      <Icon name={VERB_ICON[a.verb]} size={16} className="faint" />
      <div className="grow">
        <div className="wrap">{a.label}</div>
        <div className="meta">{formatDay(todayKey(d))} · {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
      </div>
    </li>
  );
}
