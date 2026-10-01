import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { JournalEntry, JournalTag } from '../models/types';
import { JOURNAL_PROMPTS, JOURNAL_TAGS } from '../data/content';
import { Icon } from '../components/Icon';
import { confirmAction, EmptyState, Field, Modal, PageHeader } from '../components/ui';
import { useData, useToday } from '../hooks/useApp';
import { formatDate, isDateKey } from '../utils/dates';
import { patternInsights } from '../utils/insights';
import { deleteJournal, saveJournal, toggleJournalPin } from '../services/store';
import { downloadText, journalToText } from '../services/exportImport';
import { notify } from '../services/notify';

export default function JournalPage() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null);
  const [presetHabit, setPresetHabit] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<JournalTag | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    if (params.get('new') === '1') {
      setPresetHabit(params.get('habit') ?? undefined);
      setEditing('new');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.journal
      .filter((j) => (tag === 'all' || j.tag === tag) && (!from || j.date >= from) && (!to || j.date <= to) && (!query || `${j.title} ${j.body} ${j.prompt ?? ''}`.toLowerCase().includes(query)))
      .sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
  }, [data.journal, q, tag, from, to]);
  const insights = useMemo(() => patternInsights(data), [data]);
  const filtered = q || tag !== 'all' || from || to;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader
        title="Journal"
        subtitle="Private reflections, stored only on this device."
        actions={
          <>
            <button type="button" className="btn" disabled={!data.journal.length} onClick={() => downloadText('breakfree-journal.txt', journalToText(data), 'text/plain')}><Icon name="download" size={16} />Export</button>
            <button type="button" className="btn primary" onClick={() => { setPresetHabit(undefined); setEditing('new'); }}><Icon name="plus" size={16} />New entry</button>
          </>
        }
      />

      <div className="card stack-sm">
        <div className="form-row two">
          <label className="field"><span>Search</span><input type="search" value={q} placeholder="Search entries…" onChange={(e) => setQ(e.target.value)} /></label>
          <label className="field"><span>Category</span>
            <select value={tag} onChange={(e) => setTag(e.target.value as JournalTag | 'all')}>
              <option value="all">All categories</option>
              {JOURNAL_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row two">
          <label className="field"><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {filtered && <div><button type="button" className="btn ghost sm" onClick={() => { setQ(''); setTag('all'); setFrom(''); setTo(''); }}>Clear filters</button></div>}
      </div>

      {list.length ? (
        <div className="stack-sm">
          {list.map((j) => {
            const habit = data.habits.find((h) => h.id === j.habitId);
            return (
              <article key={j.id} className="card stack-sm" aria-labelledby={`j-${j.id}`}>
                <div className="row between nowrap">
                  <div className="grow">
                    <h3 id={`j-${j.id}`} className="wrap">{j.title || formatDate(j.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                    <div className="small faint">
                      {formatDate(j.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {JOURNAL_TAGS.find((t) => t.id === j.tag)?.label}{habit ? ` · ${habit.name}` : ''}
                    </div>
                  </div>
                  <button type="button" className="icon-btn sm" aria-pressed={j.pinned} aria-label={j.pinned ? 'Unpin entry' : 'Pin entry'} onClick={() => toggleJournalPin(j.id)}><Icon name={j.pinned ? 'pin' : 'unpin'} size={16} /></button>
                  <button type="button" className="icon-btn sm" aria-label="Edit entry" onClick={() => setEditing(j)}><Icon name="edit" size={16} /></button>
                  <button type="button" className="icon-btn sm" aria-label="Delete entry" onClick={async () => {
                    if (await confirmAction({ title: 'Delete this journal entry?', body: 'It will be permanently removed from this device.', confirmLabel: 'Delete', danger: true })) { deleteJournal(j.id); notify('Entry deleted.'); }
                  }}><Icon name="trash" size={16} /></button>
                </div>
                {j.prompt && <p className="small muted"><em>{j.prompt}</em></p>}
                <p className="wrap" style={{ whiteSpace: 'pre-wrap' }}>{j.body}</p>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="journal" title={filtered ? 'No matching entries' : 'Your journal is empty'} action={!filtered ? <button type="button" className="btn primary" onClick={() => setEditing('new')}>Write your first entry</button> : undefined}>
          {filtered ? 'Try clearing the filters.' : 'Reflection prompts are available if you’re not sure where to start.'}
        </EmptyState>
      )}

      <section className="card" aria-labelledby="pat-h">
        <h2 id="pat-h">Patterns from your logs</h2>
        <p className="small faint" style={{ margin: '4px 0 12px' }}>Observations from what you’ve recorded — they show what tends to happen together, not what causes what.</p>
        {insights.total === 0 ? (
          <p className="muted small">Log a few habit events with optional triggers to see patterns here.</p>
        ) : (
          <div className="grid grid-2">
            <div>
              <h3 className="small">Most-selected triggers</h3>
              {insights.topTriggers.length ? <ol className="small">{insights.topTriggers.map((t) => <li key={t.id}>{t.label} — {t.count}</li>)}</ol> : <p className="small faint">No triggers recorded yet.</p>}
            </div>
            <div>
              <h3 className="small">When entries are logged</h3>
              <ul className="small" style={{ paddingLeft: 18 }}>{insights.partsOfDay.map((p) => <li key={p.part}>{p.part}: {p.count}</li>)}</ul>
            </div>
            {insights.topHabit && <p className="small">Most records: <strong>{insights.topHabit.habit.name}</strong> ({insights.topHabit.count})</p>}
            {insights.helpfulActivities.length > 0 && <p className="small">Reported as helpful: {insights.helpfulActivities.map((a) => `${a.title} (${a.count})`).join(', ')}</p>}
          </div>
        )}
      </section>

      {editing && <JournalForm entry={editing === 'new' ? undefined : editing} presetHabit={presetHabit} onClose={() => setEditing(null)} />}
    </div>
  );
}

function JournalForm({ entry, presetHabit, onClose }: { entry?: JournalEntry; presetHabit?: string; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const [date, setDate] = useState(entry?.date ?? today);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [prompt, setPrompt] = useState(entry?.prompt ?? '');
  const [tag, setTag] = useState<JournalTag>(entry?.tag ?? 'reflection');
  const [habitId, setHabitId] = useState(entry?.habitId ?? presetHabit ?? '');
  const [error, setError] = useState('');
  const save = () => {
    if (!body.trim()) return setError('Write something before saving.');
    if (!isDateKey(date)) return setError('Choose a valid date.');
    if (body.length > 20000) return setError('Entries can be up to 20,000 characters.');
    saveJournal({ id: entry?.id, date, title: title.trim(), body: body.trim(), prompt: prompt || undefined, tag, habitId: habitId || undefined, pinned: entry?.pinned ?? false });
    notify('Saved privately.', 'success');
    onClose();
  };
  return (
    <Modal open title={entry ? 'Edit entry' : 'New journal entry'} onClose={onClose} footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={save}>Save</button></>}>
      <div className="field">
        <span>Prompt (optional)</span>
        <div className="chips">
          {JOURNAL_PROMPTS.map((p) => <button type="button" key={p} className="chip" aria-pressed={prompt === p} onClick={() => setPrompt(prompt === p ? '' : p)}>{p}</button>)}
        </div>
      </div>
      <div className="form-row two">
        <Field label="Date">{(id) => <input id={id} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Category">{(id) => <select id={id} value={tag} onChange={(e) => setTag(e.target.value as JournalTag)}>{JOURNAL_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>}</Field>
      </div>
      <Field label="Title" help="Optional">{(id, d) => <input id={id} type="text" value={title} maxLength={120} aria-describedby={d} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label={prompt || 'Entry'} help={`${body.length.toLocaleString()} / 20,000 characters`}>{(id, d) => <textarea id={id} rows={8} value={body} aria-describedby={d} onChange={(e) => setBody(e.target.value)} />}</Field>
      <Field label="Related habit" help="Optional">{(id, d) => <select id={id} value={habitId} aria-describedby={d} onChange={(e) => setHabitId(e.target.value)}><option value="">None</option>{data.habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>}</Field>
      {error && <div className="notice danger" role="alert"><Icon name="warning" /><span>{error}</span></div>}
    </Modal>
  );
}
