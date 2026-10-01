import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../data/store';
import { globalSearch, type SearchHit } from '../services/search';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';

const TYPE: Record<SearchHit['type'], { label: string; icon: string }> = {
  task: { label: 'Tasks', icon: 'tasks' }, project: { label: 'Projects', icon: 'folder' }, note: { label: 'Notes', icon: 'note' },
  conversation: { label: 'Conversations', icon: 'message' }, memory: { label: 'Memory', icon: 'brain' }, document: { label: 'Documents', icon: 'file' },
  event: { label: 'Events', icon: 'calendar' }, reminder: { label: 'Reminders', icon: 'bell' },
};

export default function Search() {
  const s = useApp();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const hits = useMemo(() => (dq.trim().length >= 2 ? globalSearch(s, dq, 80) : []), [s, dq]);
  const groups = useMemo(() => {
    const m = new Map<SearchHit['type'], SearchHit[]>();
    for (const h of hits) m.set(h.type, [...(m.get(h.type) ?? []), h]);
    return [...m.entries()];
  }, [hits]);

  return (
    <div className="stack">
      <PageHeader title="Search" subtitle="Tasks, projects, notes, conversations, memory, documents, events and reminders." />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything" aria-label="Search everything" autoFocus style={{ fontSize: 17, minHeight: 48 }} />
      <p className="small faint" aria-live="polite">{dq.trim().length >= 2 ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'}` : 'Type at least two characters.'}</p>
      {dq.trim().length >= 2 && hits.length === 0 && <EmptyState icon="search" title="No results">Try fewer or different words.</EmptyState>}
      {groups.map(([type, list]) => (
        <section key={type} className="stack-sm">
          <h2 className="label">{TYPE[type].label}</h2>
          <ul className="list panel flush">
            {list.map((h) => (
              <li key={`${h.type}-${h.id}`}>
                <Icon name={TYPE[h.type].icon} size={16} className="faint" />
                <Link to={h.link} className="item-btn" style={{ textDecoration: 'none' }}>
                  <div className="title">{h.title}</div>
                  {h.snippet && <div className="meta"><span className="wrap">{h.snippet}</span></div>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
