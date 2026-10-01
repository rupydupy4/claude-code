import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ProjectStatus } from '../domain/types';
import { useApp } from '../data/store';
import { updateProject } from '../services/actions';
import { PROJECT_STATUS_LABEL, byImportance, projectProgress, projectSummary } from '../services/queries';
import { formatDateLong, formatWhen, todayKey } from '../utils/dates';
import { Icon } from '../components/Icon';
import { DemoBadge, EmptyState, ProgressBar, Segmented } from '../components/ui';
import { openEditor } from '../components/editors';
import { ActivityRow, TaskRow } from '../components/rows';
import { queuePrompt } from '../app/session';

type Tab = 'tasks' | 'notes' | 'files' | 'events' | 'activity';

export default function ProjectDetail() {
  const { id } = useParams();
  const s = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('tasks');
  const [showDone, setShowDone] = useState(false);
  const p = s.projects.find((x) => x.id === id);
  const today = todayKey();
  const pr = useMemo(() => (p ? projectProgress(p, s, today) : null), [p, s, today]);

  if (!p || !pr) {
    return <EmptyState icon="folder" title="Project not found" action={<Link to="/projects" className="btn">All projects</Link>}>It may have been deleted.</EmptyState>;
  }

  const tasks = s.tasks.filter((t) => t.projectId === p.id).sort((a, b) => byImportance(a, b, today));
  const open = tasks.filter((t) => t.status !== 'completed');
  const done = tasks.filter((t) => t.status === 'completed');
  const notes = s.notes.filter((n) => n.projectId === p.id);
  const files = s.documents.filter((d) => d.projectId === p.id);
  const events = s.events.filter((e) => e.projectId === p.id).sort((a, b) => a.start.localeCompare(b.start));
  const ids = new Set([p.id, ...tasks.map((t) => t.id), ...notes.map((n) => n.id), ...files.map((f) => f.id), ...events.map((e) => e.id)]);
  const activity = s.activity.filter((a) => a.entityId && ids.has(a.entityId)).slice(0, 40);

  return (
    <div className="stack">
      <Link to="/projects" className="btn ghost sm" style={{ alignSelf: 'flex-start' }}><Icon name="back" size={16} />Projects</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow">
          <h1 className="wrap">{p.name} <DemoBadge show={p.demo} /></h1>
          {p.description && <p>{p.description}</p>}
          {p.deadline && <p className="small">Deadline: <strong>{formatDateLong(p.deadline)}</strong></p>}
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => { queuePrompt({ text: `Summarise my ${p.name} project and tell me what to do next`, voice: false }); navigate('/assistant'); }}><Icon name="sparkles" size={16} />Ask for a summary</button>
          <button type="button" className="btn" onClick={() => openEditor({ kind: 'project', id: p.id })}><Icon name="edit" size={16} />Edit</button>
        </div>
      </header>

      <div className="panel stack-sm">
        <div className="row between">
          <Segmented<ProjectStatus> label="Project status" value={p.status} options={(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((v) => ({ value: v, label: PROJECT_STATUS_LABEL[v] }))} onChange={(v) => updateProject(p.id, { status: v })} />
          <span className="num small">{pr.done}/{pr.total} tasks · {pr.pct}%</span>
        </div>
        <ProgressBar value={pr.pct} label="Progress" />
        <p className="small muted">{projectSummary(p, s, today)}</p>
      </div>

      <div className="scroll-x" role="tablist" aria-label="Project sections">
        {([['tasks', `Tasks (${open.length})`], ['notes', `Notes (${notes.length})`], ['files', `Files (${files.length})`], ['events', `Events (${events.length})`], ['activity', 'Activity']] as [Tab, string][]).map(([v, label]) => (
          <button key={v} type="button" role="tab" className="chip" aria-selected={tab === v} aria-pressed={tab === v} onClick={() => setTab(v)}>{label}</button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'tasks' && (
          <div className="stack-sm">
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => openEditor({ kind: 'task', defaults: { projectId: p.id } })}><Icon name="plus" size={16} />Add task</button>
            {open.length ? <ul className="list panel flush">{open.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</ul> : <p className="muted small">No open tasks.</p>}
            {done.length > 0 && (
              <>
                <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>{showDone ? 'Hide' : 'Show'} {done.length} completed</button>
                {showDone && <ul className="list panel flush">{done.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</ul>}
              </>
            )}
          </div>
        )}
        {tab === 'notes' && (
          <div className="stack-sm">
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => openEditor({ kind: 'note', defaults: { projectId: p.id } })}><Icon name="plus" size={16} />Add note</button>
            {notes.length ? (
              <ul className="list panel flush">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button type="button" className="item-btn" onClick={() => openEditor({ kind: 'note', id: n.id })}>
                      <div className="title">{n.title}</div>
                      <div className="meta"><span className="wrap">{n.content.slice(0, 140)}</span></div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">No notes yet.</p>}
          </div>
        )}
        {tab === 'files' && (
          <div className="stack-sm">
            {files.length ? (
              <ul className="list panel flush">
                {files.map((f) => (
                  <li key={f.id}><Icon name="file" size={16} className="faint" /><Link to={`/documents?open=${f.id}`} className="grow wrap">{f.name}</Link></li>
                ))}
              </ul>
            ) : <p className="muted small">No files linked. Open a document and choose this project to link it.</p>}
            <Link to="/documents" className="small">Go to Documents</Link>
          </div>
        )}
        {tab === 'events' && (
          <div className="stack-sm">
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => openEditor({ kind: 'event', defaults: { projectId: p.id } })}><Icon name="plus" size={16} />Add event</button>
            {events.length ? (
              <ul className="list panel flush">
                {events.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="item-btn" onClick={() => openEditor({ kind: 'event', id: e.id })}>
                      <div className="title">{e.title}</div>
                      <div className="meta">{formatWhen(e.start)}{e.location && ` · ${e.location}`}</div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">No events linked.</p>}
          </div>
        )}
        {tab === 'activity' && (activity.length ? <ul className="list panel flush">{activity.map((a) => <ActivityRow key={a.id} a={a} />)}</ul> : <p className="muted small">No activity recorded yet.</p>)}
      </div>
    </div>
  );
}
