import { useState } from 'react';
import type { GoalCategory, GoalMilestone, GoalStatus, PersonalGoal } from '../models/types';
import { Icon } from '../components/Icon';
import { confirmAction, EmptyState, Field, Modal, PageHeader, ProgressBar, Segmented } from '../components/ui';
import { useData, useToday } from '../hooks/useApp';
import { formatDate, isDateKey } from '../utils/dates';
import { goalDaysLeft, goalProgress, uid } from '../utils/logic';
import { deleteGoal, saveGoal, setGoalProgress, setGoalStatus, toggleGoalMilestone } from '../services/store';
import { notify } from '../services/notify';

const CATS: { id: GoalCategory; label: string }[] = [
  { id: 'habit', label: 'Habit' },
  { id: 'routine', label: 'Routine' },
  { id: 'focus', label: 'Focus time' },
  { id: 'savings', label: 'Saving money' },
  { id: 'project', label: 'Personal project' },
  { id: 'other', label: 'Other' },
];

export default function GoalsPage() {
  const data = useData();
  const today = useToday();
  const [tab, setTab] = useState<GoalStatus>('active');
  const [editing, setEditing] = useState<PersonalGoal | 'new' | null>(null);
  const list = data.goals.filter((g) => g.status === tab);
  const count = (s: GoalStatus) => data.goals.filter((g) => g.status === s).length;
  return (
    <div>
      <PageHeader title="Goals" subtitle="Personal targets — numeric or step-by-step. Separate from habit statistics unless you link them." actions={<button type="button" className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} />New goal</button>} />
      <div style={{ marginBottom: 16 }}>
        <Segmented label="Status" value={tab} onChange={setTab} options={(['active', 'paused', 'completed', 'archived'] as GoalStatus[]).map((s) => ({ value: s, label: `${s[0].toUpperCase()}${s.slice(1)} (${count(s)})` }))} />
      </div>
      {list.length ? (
        <div className="grid grid-2">{list.map((g) => <GoalCard key={g.id} goal={g} today={today} onEdit={() => setEditing(g)} />)}</div>
      ) : (
        <EmptyState icon="goal" title={tab === 'active' ? 'No active goals' : `No ${tab} goals`} action={tab === 'active' ? <button type="button" className="btn primary" onClick={() => setEditing('new')}>Set a goal</button> : undefined}>
          {tab === 'active' ? 'For example: “Save £200”, “Read 6 books” or a project broken into milestones.' : undefined}
        </EmptyState>
      )}
      {editing && <GoalForm goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GoalCard({ goal: g, today, onEdit }: { goal: PersonalGoal; today: string; onEdit: () => void }) {
  const data = useData();
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');
  const p = goalProgress(g);
  const left = goalDaysLeft(g, today);
  const habit = data.habits.find((h) => h.id === g.habitId);
  const add = (sign: 1 | -1) => {
    const n = Number(amount);
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) return setErr('Enter a positive number.');
    const next = Math.max(0, Math.round((g.progress + sign * n) * 100) / 100);
    setGoalProgress(g.id, next);
    setAmount('');
    setErr('');
    if (g.target && next >= g.target && g.status === 'active') {
      notify('You reached your target!', 'success', { label: 'Mark complete', run: () => setGoalStatus(g.id, 'completed') }, 8000);
    }
  };
  return (
    <article className="card stack-sm" aria-labelledby={`g-${g.id}`}>
      <div className="row between nowrap">
        <div className="grow">
          <h3 id={`g-${g.id}`} className="wrap">{g.title}</h3>
          <div className="small faint">{CATS.find((c) => c.id === g.category)?.label}{habit ? ` · ${habit.name}` : ''}</div>
        </div>
        <button type="button" className="icon-btn sm" aria-label={`Edit ${g.title}`} onClick={onEdit}><Icon name="edit" size={16} /></button>
      </div>
      {g.description && <p className="small muted wrap">{g.description}</p>}
      <ProgressBar value={p} label={`${g.title} progress`} />
      <div className="row between small">
        <strong className="num">{g.kind === 'numeric' ? `${g.progress} / ${g.target ?? '—'} ${g.unit}` : `${g.milestones.filter((m) => m.done).length} / ${g.milestones.length} steps`}</strong>
        <span className="faint">{Math.round(p * 100)}%{left !== null ? ` · ${left >= 0 ? `${left} days left` : `${-left} days past target date`}` : ''}</span>
      </div>
      {g.kind === 'numeric' && g.status === 'active' && (
        <div className="stack-sm">
          <div className="row nowrap">
            <input type="number" min={0} step="any" aria-label={`Amount for ${g.title}`} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 140 }} />
            <button type="button" className="btn sm" onClick={() => add(1)}><Icon name="plus" size={14} />Add</button>
            <button type="button" className="btn ghost sm" onClick={() => add(-1)}><Icon name="minus" size={14} />Subtract</button>
          </div>
          {err && <span className="small" role="alert" style={{ color: 'var(--danger)' }}>{err}</span>}
        </div>
      )}
      {g.milestones.length > 0 && (
        <ul className="stack-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {g.milestones.map((m) => (
            <li key={m.id}>
              <label className="check">
                <input type="checkbox" checked={m.done} disabled={g.status !== 'active'} onChange={() => toggleGoalMilestone(g.id, m.id)} />
                <span className={m.done ? 'done-text' : ''}>{m.title}{m.value !== undefined ? ` (${m.value} ${g.unit})` : ''}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {g.status === 'active' && <button type="button" className="btn sm" onClick={() => setGoalStatus(g.id, 'completed')}><Icon name="check" size={14} />Complete</button>}
        {g.status === 'active' && <button type="button" className="btn ghost sm" onClick={() => setGoalStatus(g.id, 'paused')}><Icon name="pause" size={14} />Pause</button>}
        {g.status === 'paused' && <button type="button" className="btn sm" onClick={() => setGoalStatus(g.id, 'active')}><Icon name="play" size={14} />Resume</button>}
        {(g.status === 'completed' || g.status === 'archived') && <button type="button" className="btn sm" onClick={() => setGoalStatus(g.id, 'active')}><Icon name="restore" size={14} />Reopen</button>}
        {g.status !== 'archived' && <button type="button" className="btn ghost sm" onClick={() => setGoalStatus(g.id, 'archived')}><Icon name="archive" size={14} />Archive</button>}
      </div>
      {g.targetDate && <p className="tiny faint">Target date: {formatDate(g.targetDate, { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
    </article>
  );
}

function GoalForm({ goal, onClose }: { goal?: PersonalGoal; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [category, setCategory] = useState<GoalCategory>(goal?.category ?? 'other');
  const [kind, setKind] = useState<PersonalGoal['kind']>(goal?.kind ?? 'numeric');
  const [target, setTarget] = useState(goal?.target?.toString() ?? '');
  const [progress, setProgress] = useState(goal?.progress?.toString() ?? '0');
  const [unit, setUnit] = useState(goal?.unit ?? '');
  const [startDate, setStartDate] = useState(goal?.startDate ?? today);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [habitId, setHabitId] = useState(goal?.habitId ?? '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [milestones, setMilestones] = useState<GoalMilestone[]>(goal?.milestones ?? []);
  const [newMilestone, setNewMilestone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give the goal a title.';
    const t = Number(target), pr = Number(progress);
    if (kind === 'numeric') {
      if (!target.trim() || !Number.isFinite(t) || t <= 0) e.target = 'Enter a target above 0.';
      if (!Number.isFinite(pr) || pr < 0) e.progress = 'Progress must be 0 or more.';
    } else if (!milestones.length) e.milestones = 'Add at least one step.';
    if (!isDateKey(startDate)) e.startDate = 'Choose a start date.';
    if (targetDate && (!isDateKey(targetDate) || targetDate < startDate)) e.targetDate = 'The target date must be after the start date.';
    setErrors(e);
    if (Object.keys(e).length) return;
    saveGoal({
      id: goal?.id, title: title.trim(), description: description.trim(), category, kind,
      target: kind === 'numeric' ? t : undefined, progress: kind === 'numeric' ? pr : 0, unit: unit.trim(),
      startDate, targetDate: targetDate || undefined, milestones, status: goal?.status ?? 'active', notes: notes.trim(), habitId: habitId || undefined,
    });
    notify(goal ? 'Goal updated.' : 'Goal created.', 'success');
    onClose();
  };
  return (
    <Modal
      open
      title={goal ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      footer={
        <>
          {goal && <button type="button" className="btn danger" onClick={async () => { if (await confirmAction({ title: 'Delete this goal?', body: 'It will be permanently removed.', confirmLabel: 'Delete', danger: true })) { deleteGoal(goal.id); notify('Goal deleted.'); onClose(); } }}>Delete</button>}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <Field label="Title" error={errors.title}>{(id, d) => <input id={id} type="text" value={title} maxLength={100} aria-describedby={d} aria-invalid={!!errors.title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Description" help="Optional">{(id) => <textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      <div className="form-row two">
        <Field label="Category">{(id) => <select id={id} value={category} onChange={(e) => setCategory(e.target.value as GoalCategory)}>{CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}</Field>
        <Field label="Linked habit" help="Optional — for your reference only.">{(id, d) => <select id={id} value={habitId} aria-describedby={d} onChange={(e) => setHabitId(e.target.value)}><option value="">None</option>{data.habits.filter((h) => !h.archived).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>}</Field>
      </div>
      <div className="field"><span>Type</span><Segmented label="Goal type" value={kind} onChange={setKind} options={[{ value: 'numeric', label: 'Numeric target' }, { value: 'completion', label: 'Steps to complete' }]} /></div>
      {kind === 'numeric' && (
        <div className="form-row three">
          <Field label="Target" error={errors.target}>{(id, d) => <input id={id} type="number" min={0} step="any" value={target} aria-describedby={d} aria-invalid={!!errors.target} onChange={(e) => setTarget(e.target.value)} />}</Field>
          <Field label="Current progress" error={errors.progress}>{(id, d) => <input id={id} type="number" min={0} step="any" value={progress} aria-describedby={d} onChange={(e) => setProgress(e.target.value)} />}</Field>
          <Field label="Unit" help="e.g. £, books, km">{(id, d) => <input id={id} type="text" value={unit} maxLength={20} aria-describedby={d} onChange={(e) => setUnit(e.target.value)} />}</Field>
        </div>
      )}
      <div className="form-row two">
        <Field label="Start date" error={errors.startDate}>{(id) => <input id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}</Field>
        <Field label="Target date" help="Optional" error={errors.targetDate}>{(id, d) => <input id={id} type="date" value={targetDate} aria-describedby={d} onChange={(e) => setTargetDate(e.target.value)} />}</Field>
      </div>
      <div className="field">
        <span>{kind === 'completion' ? 'Steps' : 'Milestones (optional)'}</span>
        {milestones.length > 0 && (
          <ul className="list">
            {milestones.map((m) => (
              <li key={m.id}><span className="grow title">{m.title}</span><button type="button" className="icon-btn sm" aria-label={`Remove ${m.title}`} onClick={() => setMilestones(milestones.filter((x) => x.id !== m.id))}><Icon name="x" size={16} /></button></li>
            ))}
          </ul>
        )}
        <div className="row nowrap">
          <input type="text" aria-label="New step" value={newMilestone} maxLength={100} placeholder="Add a step…" onChange={(e) => setNewMilestone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newMilestone.trim()) { setMilestones([...milestones, { id: uid(), title: newMilestone.trim(), done: false }]); setNewMilestone(''); } }} />
          <button type="button" className="btn sm" onClick={() => { if (newMilestone.trim()) { setMilestones([...milestones, { id: uid(), title: newMilestone.trim(), done: false }]); setNewMilestone(''); } }}>Add</button>
        </div>
        {errors.milestones && <span className="error">{errors.milestones}</span>}
      </div>
      <Field label="Notes" help="Optional">{(id) => <textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
    </Modal>
  );
}
