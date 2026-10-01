import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { formatDay, todayKey } from '../utils/dates';
import { Icon } from '../components/Icon';
import { DemoBadge, EmptyState, PageHeader } from '../components/ui';
import { openEditor } from '../components/editors';

const PAGE = 40;

export default function Notes() {
  const notes = useStore((s) => s.notes);
  const projects = useStore((s) => s.projects);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [projectId, setProjectId] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const id = params.get('open');
    if (id && notes.some((n) => n.id === id)) {
      openEditor({ kind: 'note', id });
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, setParams, notes]);

  const tags = useMemo(() => Array.from(new Set(notes.flatMap((n) => n.tags))).sort(), [notes]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return notes
      .filter((n) => (!tag || n.tags.includes(tag)) && (!projectId || n.projectId === projectId) && (!t || `${n.title} ${n.content} ${n.tags.join(' ')}`.toLowerCase().includes(t)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, q, tag, projectId]);

  return (
    <div className="stack">
      <PageHeader title="Notes" subtitle="Ideas, decisions and meeting notes." actions={<button type="button" className="btn primary" onClick={() => openEditor({ kind: 'note' })}><Icon name="plus" />New note</button>} />
      <div className="form-grid two">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {tags.length > 0 && (
        <div className="scroll-x" role="group" aria-label="Tags">
          <button type="button" className="chip" aria-pressed={!tag} onClick={() => setTag('')}>All</button>
          {tags.map((t) => <button key={t} type="button" className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)}>#{t}</button>)}
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState icon="note" title={notes.length ? 'No notes match' : 'No notes yet'}>
          {notes.length ? 'Try a different search.' : 'Try: “Make a note that the client prefers a minimalist homepage.”'}
        </EmptyState>
      ) : (
        <>
          <div className="cols-3">
            {list.slice(0, limit).map((n) => {
              const project = n.projectId ? projects.find((p) => p.id === n.projectId) : undefined;
              return (
                <button key={n.id} type="button" className="panel stack-sm" style={{ textAlign: 'left', color: 'inherit', font: 'inherit' }} onClick={() => openEditor({ kind: 'note', id: n.id })}>
                  <h3 className="wrap">{n.title}</h3>
                  <p className="small muted wrap" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line' }}>{n.content}</p>
                  <div className="row tiny faint">
                    <span>{formatDay(todayKey(new Date(n.updatedAt)))}</span>
                    {project && <span><Icon name="folder" size={11} /> {project.name}</span>}
                    {n.tags.map((t) => <span key={t}>#{t}</span>)}
                    <DemoBadge show={n.demo} />
                  </div>
                </button>
              );
            })}
          </div>
          {list.length > limit && <button type="button" className="btn ghost" onClick={() => setLimit((x) => x + PAGE)}>Show more</button>}
        </>
      )}
    </div>
  );
}
