import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CategoryId, HabitTemplate, TrackingMode } from '../models/types';
import { HABIT_TEMPLATES } from '../data/habitTemplates';
import { CATEGORIES, INTERESTS, MODES, categoryById, modeById } from '../data/categories';
import { Icon } from '../components/Icon';
import { EmptyState, Modal, PageHeader, Segmented } from '../components/ui';
import { HabitForm } from '../components/habits';
import { useData } from '../hooks/useApp';

export default function LibraryPage() {
  const data = useData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const interests = data.prefs.interests;
  const suggestedCats = new Set(INTERESTS.filter((i) => interests.includes(i.id)).map((i) => i.category));
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<CategoryId | 'all' | 'suggested'>(params.get('suggested') && suggestedCats.size ? 'suggested' : 'all');
  const [mode, setMode] = useState<TrackingMode | 'all'>('all');
  const [sort, setSort] = useState<'alpha' | 'recent'>('alpha');
  const [detail, setDetail] = useState<HabitTemplate | null>(null);
  const [adding, setAdding] = useState<HabitTemplate | 'custom' | null>(null);
  const tracked = new Set(data.habits.map((h) => h.templateId).filter(Boolean));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = HABIT_TEMPLATES.filter(
      (t) =>
        (cat === 'all' || (cat === 'suggested' ? suggestedCats.has(t.category) : t.category === cat)) &&
        (mode === 'all' || t.modes.includes(mode)) &&
        (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => (sort === 'alpha' ? a.name.localeCompare(b.name) : b.addedOrder - a.addedOrder));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cat, mode, sort, interests]);

  return (
    <div>
      <PageHeader
        title="Habit Library"
        subtitle={`${HABIT_TEMPLATES.length} habits across ${CATEGORIES.length} categories. Pick one and make it yours — nothing here is a mandatory goal.`}
        actions={<button type="button" className="btn primary" onClick={() => setAdding('custom')}><Icon name="pen" size={16} />Create custom habit</button>}
      />

      <div className="stack" style={{ marginBottom: 18 }}>
        <label className="field">
          <span className="sr-only">Search habits</span>
          <input type="search" placeholder="Search by name or description…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="scroll-x" role="group" aria-label="Category">
          <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
          {suggestedCats.size > 0 && <button type="button" className="chip" aria-pressed={cat === 'suggested'} onClick={() => setCat('suggested')}><Icon name="star" size={14} />Suggested</button>}
          {CATEGORIES.map((c) => (
            <button type="button" key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.short}</button>
          ))}
        </div>
        <div className="row">
          <label className="field" style={{ minWidth: 200 }}>
            Tracking method
            <select value={mode} onChange={(e) => setMode(e.target.value as TrackingMode | 'all')}>
              <option value="all">Any method</option>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <div className="field">
            <span>Sort</span>
            <Segmented label="Sort" value={sort} onChange={setSort} options={[{ value: 'alpha', label: 'A–Z' }, { value: 'recent', label: 'Recently added' }]} />
          </div>
        </div>
        <p className="small faint" aria-live="polite">{results.length} {results.length === 1 ? 'habit' : 'habits'}</p>
      </div>

      {results.length ? (
        <ul className="list">
          {results.map((t) => (
            <li key={t.id}>
              <span className="icon-tile"><Icon name={t.icon} /></span>
              <button type="button" className="grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', minWidth: 0 }} onClick={() => setDetail(t)}>
                <div className="title">{t.name}{tracked.has(t.id) && <span className="badge success" style={{ marginLeft: 8 }}>Tracking</span>}</div>
                <div className="meta">{categoryById(t.category).short} · Suggested: {modeById(t.suggestedMode).name}</div>
              </button>
              <button type="button" className="btn sm" onClick={() => setAdding(t)} aria-label={`Add ${t.name}`}><Icon name="plus" size={16} />Add</button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="search" title="No matching habits" action={<button type="button" className="btn primary" onClick={() => setAdding('custom')}>Create a custom habit</button>}>
          Try a different search or filter — or create your own.
        </EmptyState>
      )}

      {detail && (
        <Modal
          open
          title={detail.name}
          onClose={() => setDetail(null)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setDetail(null)}>Close</button>
              <button type="button" className="btn primary" onClick={() => { setAdding(detail); setDetail(null); }}>Add this habit</button>
            </>
          }
        >
          <div className="row"><span className="badge">{categoryById(detail.category).name}</span></div>
          <p>{detail.description}</p>
          {detail.caution && <div className="notice warn" role="note"><Icon name="warning" /><span>{detail.caution}</span></div>}
          {detail.guidance && <div className="notice" role="note"><Icon name="info" /><span>{detail.guidance}</span></div>}
          <div>
            <h3>Ways to track it</h3>
            <ul className="small" style={{ paddingLeft: 18 }}>
              {detail.modes.map((m) => (
                <li key={m}><strong>{modeById(m).name}</strong>{m === detail.suggestedMode && ' (suggested)'} — {modeById(m).description}</li>
              ))}
            </ul>
          </div>
          {detail.alternatives?.length ? (
            <div>
              <h3>Alternatives some people try</h3>
              <ul className="small" style={{ paddingLeft: 18 }}>{detail.alternatives.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          ) : null}
        </Modal>
      )}

      {adding && (
        <HabitForm
          open
          template={adding === 'custom' ? undefined : adding}
          onClose={() => setAdding(null)}
          onSaved={(id) => navigate(`/habits/${id}`)}
        />
      )}
    </div>
  );
}
