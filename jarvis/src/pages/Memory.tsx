import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MemoryCategory } from '../domain/types';
import { clearMemories, useStore } from '../data/store';
import { deleteMemory } from '../services/actions';
import { Icon } from '../components/Icon';
import { confirmAction, DemoBadge, EmptyState, PageHeader } from '../components/ui';
import { MEMORY_CATEGORIES, openEditor } from '../components/editors';
import { notify } from '../services/notify';

export default function MemoryPage() {
  const memories = useStore((s) => s.memories);
  const enabled = useStore((s) => s.settings.memoryEnabled);
  const name = useStore((s) => s.settings.assistantName);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<MemoryCategory | ''>('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return memories.filter((m) => (!cat || m.category === cat) && (!t || m.content.toLowerCase().includes(t))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [memories, q, cat]);

  const clearAll = async () => {
    if (!(await confirmAction({ title: 'Clear all memory?', body: `${name} will forget all ${memories.length} saved facts and preferences. This can’t be undone.`, confirmLabel: 'Clear memory', danger: true }))) return;
    await clearMemories();
    notify('Memory cleared.');
  };
  const remove = async (id: string, content: string) => {
    if (!(await confirmAction({ title: 'Forget this?', body: `“${content.slice(0, 120)}”`, confirmLabel: 'Forget', danger: true }))) return;
    deleteMemory(id);
  };

  return (
    <div className="stack">
      <PageHeader
        title="Memory"
        subtitle={`What ${name} remembers about you and your work. It only saves things you ask it to remember, and never passwords or card details.`}
        actions={
          <>
            {memories.length > 0 && <button type="button" className="btn ghost" onClick={() => void clearAll()}>Clear all</button>}
            <button type="button" className="btn primary" onClick={() => openEditor({ kind: 'memory' })}><Icon name="plus" />Add</button>
          </>
        }
      />
      {!enabled && <div className="notice warn"><Icon name="info" /><div className="small">Memory is turned off, so {name} won’t save anything new. <Link to="/settings">Turn it on in Settings</Link>.</div></div>}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memory" aria-label="Search memory" />
      <div className="scroll-x" role="group" aria-label="Category">
        <button type="button" className="chip" aria-pressed={!cat} onClick={() => setCat('')}>All</button>
        {(Object.keys(MEMORY_CATEGORIES) as MemoryCategory[]).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>
            {MEMORY_CATEGORIES[c]} <span className="faint">{memories.filter((m) => m.category === c).length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon="brain" title={memories.length ? 'Nothing matches' : 'Nothing remembered yet'}>
          {memories.length ? undefined : `Say “Remember that I prefer meetings after 11 AM” and ${name} will keep it in mind.`}
        </EmptyState>
      ) : (
        <ul className="list panel flush">
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" className="item-btn" onClick={() => openEditor({ kind: 'memory', id: m.id })}>
                <div className="wrap">{m.content}</div>
                <div className="meta"><span className="badge">{MEMORY_CATEGORIES[m.category]}</span><span>{new Date(m.updatedAt).toLocaleDateString()}</span><DemoBadge show={m.demo} /></div>
              </button>
              <button type="button" className="icon-btn sm" aria-label={`Forget “${m.content.slice(0, 40)}”`} onClick={() => void remove(m.id, m.content)}><Icon name="trash" size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
