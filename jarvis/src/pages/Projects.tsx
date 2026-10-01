import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectStatus } from '../domain/types';
import { useStore } from '../data/store';
import { PROJECT_STATUS_LABEL, projectProgress } from '../services/queries';
import { diffDays, formatDay, todayKey } from '../utils/dates';
import { Icon } from '../components/Icon';
import { DemoBadge, EmptyState, PageHeader, ProgressBar } from '../components/ui';
import { openEditor } from '../components/editors';

const STATUS_BADGE: Record<ProjectStatus, string> = { planning: '', active: 'accent', on_hold: 'warn', completed: 'ok' };

export default function Projects() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const today = todayKey();
  const list = useMemo(
    () =>
      projects
        .filter((p) => status === 'all' || p.status === status)
        .map((p) => ({ p, pr: projectProgress(p, { tasks, notes }, today) }))
        .sort((a, b) => (a.p.status === 'completed' ? 1 : 0) - (b.p.status === 'completed' ? 1 : 0) || (a.p.deadline ?? '9999').localeCompare(b.p.deadline ?? '9999')),
    [projects, tasks, notes, status, today],
  );

  return (
    <div className="stack">
      <PageHeader title="Projects" subtitle="Group tasks, notes, files and events around a goal." actions={<button type="button" className="btn primary" onClick={() => openEditor({ kind: 'project' })}><Icon name="plus" />New project</button>} />
      <div className="scroll-x" role="group" aria-label="Status">
        {(['all', 'active', 'planning', 'on_hold', 'completed'] as const).map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{s === 'all' ? 'All' : PROJECT_STATUS_LABEL[s]}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon="folder" title={status === 'all' ? 'No projects yet' : 'No projects with this status'} action={status === 'all' ? <button type="button" className="btn primary" onClick={() => openEditor({ kind: 'project' })}>Create a project</button> : undefined}>
          {status === 'all' ? 'Projects keep related tasks, notes, documents and events together.' : undefined}
        </EmptyState>
      ) : (
        <div className="cols-3">
          {list.map(({ p, pr }) => {
            const d = p.deadline ? diffDays(today, p.deadline) : null;
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="panel stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row nowrap between">
                  <h2 className="truncate">{p.name}</h2>
                  <span className={`badge ${STATUS_BADGE[p.status]}`}>{PROJECT_STATUS_LABEL[p.status]}</span>
                </div>
                {p.description && <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                <ProgressBar value={pr.pct} label={`${p.name} progress`} />
                <div className="row small faint between">
                  <span className="num">{pr.done}/{pr.total} tasks · {pr.pct}%</span>
                  {p.deadline && <span className={d !== null && d < 0 && p.status !== 'completed' ? 'badge danger' : d !== null && d <= 2 && p.status !== 'completed' ? 'badge warn' : ''}>Due {formatDay(p.deadline, today)}</span>}
                </div>
                {pr.overdue > 0 && <span className="small" style={{ color: 'var(--danger)' }}>{pr.overdue} overdue</span>}
                {pr.next && <div className="small"><span className="faint">Next:</span> {pr.next.title}</div>}
                <DemoBadge show={p.demo} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
