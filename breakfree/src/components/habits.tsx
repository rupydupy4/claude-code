import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CategoryId, CheckInStatus, DateKey, Habit, HabitEvent, HabitTemplate, TrackingMode, TriggerId } from '../models/types';
import { CATEGORIES, DEFAULT_MILESTONES, MODES, TRIGGERS, categoryById, modeById } from '../data/categories';
import { addDays, dayOfWeek, formatDate, fromDateKey, isDateKey, isTimeOfDay, nowTime, todayKey, toDateKey } from '../utils/dates';
import { dayStatus, hasStatus, type HabitIndex, type HabitSummary } from '../utils/habitStats';
import { formatMinutes, plural } from '../utils/logic';
import { addEvent, addHabit, deleteCheckIn, setCheckIn, updateEvent, updateHabit, type NewHabit } from '../services/store';
import { notify } from '../services/notify';
import { useData } from '../hooks/useApp';
import { Icon } from './Icon';
import { Field, Modal, ProgressBar, StatusMark } from './ui';

// ============================================================ helpers

export function unitFor(h: Habit): string {
  switch (h.mode) {
    case 'time':
      return 'min';
    case 'quantity':
      return h.goal.unit || 'units';
    case 'frequency':
    case 'replacement':
      return 'times';
    default:
      return 'entries';
  }
}

export function formatAmount(h: Habit, n: number): string {
  if (h.mode === 'time') return formatMinutes(n);
  if (h.mode === 'quantity') return `${round(n)} ${h.goal.unit || ''}`.trim();
  return plural(round(n), 'time');
}

const round = (n: number) => Math.round(n * 100) / 100;

export function targetText(h: Habit): string {
  const g = h.goal;
  const u = unitFor(h);
  const fmt = (n: number) => (h.mode === 'time' ? formatMinutes(n) : `${n} ${u}`);
  switch (h.mode) {
    case 'abstinence':
      return h.successRule || 'Avoid it for the whole day';
    case 'observation':
      return 'No target — observing the pattern';
    case 'replacement': {
      const parts = [g.daily ? `${fmt(g.daily)} a day` : '', g.weekly ? `${fmt(g.weekly)} a week` : ''].filter(Boolean);
      return parts.length ? `At least ${parts.join(' · ')}` : 'Do it whenever you can';
    }
    default: {
      const parts = [g.daily !== undefined ? `${fmt(g.daily)} a day` : '', g.weekly !== undefined ? `${fmt(g.weekly)} a week` : ''].filter(Boolean);
      return parts.length ? `At most ${parts.join(' · ')}` : 'No limit set yet';
    }
  }
}

// ============================================================ habit form

interface FormState {
  name: string;
  category: CategoryId;
  description: string;
  mode: TrackingMode;
  daily: string;
  weekly: string;
  unit: string;
  successRule: string;
  alternative: string;
  linkedHabitId: string;
  triggers: TriggerId[];
  milestones: number[];
  reminderOn: boolean;
  reminderTime: string;
  reminderDays: number[];
  notes: string;
}

function initialForm(habit?: Habit, template?: HabitTemplate): FormState {
  if (habit) {
    return {
      name: habit.name,
      category: habit.category,
      description: habit.description,
      mode: habit.mode,
      daily: habit.goal.daily?.toString() ?? '',
      weekly: habit.goal.weekly?.toString() ?? '',
      unit: habit.goal.unit ?? '',
      successRule: habit.successRule,
      alternative: habit.alternative,
      linkedHabitId: habit.linkedHabitId ?? '',
      triggers: habit.triggers,
      milestones: habit.milestones,
      reminderOn: habit.reminder.enabled,
      reminderTime: habit.reminder.time,
      reminderDays: habit.reminder.days,
      notes: habit.notes,
    };
  }
  const mode = template?.suggestedMode ?? 'frequency';
  return {
    name: template?.name ?? '',
    category: template?.category ?? 'custom',
    description: template?.description ?? '',
    mode,
    daily: mode === 'replacement' ? '1' : '',
    weekly: '',
    unit: template?.unit ?? '',
    successRule: '',
    alternative: template?.alternatives?.[0] ?? '',
    linkedHabitId: '',
    triggers: [],
    milestones: template?.milestones ?? DEFAULT_MILESTONES,
    reminderOn: false,
    reminderTime: '20:00',
    reminderDays: [0, 1, 2, 3, 4, 5, 6],
    notes: '',
  };
}

type Errors = Partial<Record<keyof FormState, string>>;

function parseNum(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function validateHabitForm(f: FormState): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = 'Give the habit a name.';
  else if (f.name.trim().length > 80) e.name = 'Keep the name under 80 characters.';
  const daily = parseNum(f.daily);
  const weekly = parseNum(f.weekly);
  const bad = (n: number | undefined) => n !== undefined && (Number.isNaN(n) || n < 0 || n > 100000);
  if (bad(daily)) e.daily = 'Enter a number of 0 or more.';
  if (bad(weekly)) e.weekly = 'Enter a number of 0 or more.';
  switch (f.mode) {
    case 'abstinence':
      if (!f.successRule.trim()) e.successRule = 'Describe what a successful day means to you, e.g. “No cigarettes all day”.';
      break;
    case 'frequency':
      if (daily === undefined && weekly === undefined) e.daily = 'Set a daily or weekly limit (number of times).';
      else if (daily !== undefined && !Number.isInteger(daily)) e.daily = 'Use a whole number of times.';
      break;
    case 'time':
      if (daily === undefined && weekly === undefined) e.daily = 'Set a daily or weekly time budget in minutes.';
      else if (daily !== undefined && daily <= 0 && weekly === undefined) e.daily = 'A time budget needs a duration above 0 minutes.';
      break;
    case 'quantity':
      if (!f.unit.trim()) e.unit = 'Choose a unit, e.g. drinks, £, cups.';
      if (daily === undefined && weekly === undefined) e.daily = 'Set a daily or weekly limit.';
      break;
    case 'replacement':
      if (daily !== undefined && daily < 1 && !e.daily) e.daily = 'Aim for at least once a day, or leave it empty.';
      break;
  }
  if (f.reminderOn && (!isTimeOfDay(f.reminderTime) || f.reminderDays.length === 0)) e.reminderTime = 'Pick a time and at least one day.';
  return e;
}

function formToHabit(f: FormState, icon: string): NewHabit {
  const goal: Habit['goal'] = {};
  if (f.mode !== 'abstinence' && f.mode !== 'observation') {
    const d = parseNum(f.daily);
    const w = parseNum(f.weekly);
    if (d !== undefined) goal.daily = d;
    if (w !== undefined) goal.weekly = w;
    if (f.mode === 'quantity') goal.unit = f.unit.trim();
  }
  return {
    name: f.name.trim(),
    category: f.category,
    description: f.description.trim(),
    icon,
    mode: f.mode,
    goal,
    successRule: f.mode === 'abstinence' ? f.successRule.trim() : '',
    triggers: f.triggers,
    alternative: f.alternative.trim(),
    linkedHabitId: f.linkedHabitId || undefined,
    reminder: { enabled: f.reminderOn, time: f.reminderTime, days: f.reminderDays },
    milestones: hasStatus({ mode: f.mode, goal } as Habit) ? [...f.milestones].sort((a, b) => a - b) : [],
    notes: f.notes.trim(),
    startDate: todayKey(),
  };
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function HabitForm({ open, onClose, habit, template, onSaved }: { open: boolean; onClose: () => void; habit?: Habit; template?: HabitTemplate; onSaved?: (id: string) => void }) {
  const data = useData();
  const [f, setF] = useState<FormState>(() => initialForm(habit, template));
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => {
      const next = { ...p, [k]: v };
      if (submitted) setErrors(validateHabitForm(next));
      return next;
    });
  };
  const allowedModes = template ? template.modes : MODES.map((m) => m.id);
  const mode = modeById(f.mode);
  const others = data.habits.filter((h) => h.id !== habit?.id && !h.archived);
  const showTargets = f.mode !== 'abstinence' && f.mode !== 'observation';
  const unitLabel = f.mode === 'time' ? 'minutes' : f.mode === 'quantity' ? f.unit || 'units' : 'times';

  const save = () => {
    setSubmitted(true);
    const e = validateHabitForm(f);
    setErrors(e);
    if (Object.keys(e).length) {
      notify('Please check the highlighted fields.', 'error');
      return;
    }
    // Keep the template's or habit's own icon unless the category was changed.
    const originalCategory = habit?.category ?? template?.category;
    const icon = f.category === originalCategory ? habit?.icon ?? template?.icon ?? categoryById(f.category).icon : categoryById(f.category).icon;
    const payload = formToHabit(f, icon);
    let id: string;
    if (habit) {
      const { startDate: _ignored, ...rest } = payload;
      void _ignored;
      updateHabit(habit.id, { ...rest, templateId: habit.templateId });
      id = habit.id;
      notify('Habit updated.', 'success');
    } else {
      id = addHabit({ ...payload, templateId: template?.id });
      notify(`${payload.name} added.`, 'success');
    }
    onSaved?.(id);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? 'Edit habit' : template ? `Add: ${template.name}` : 'Create a custom habit'}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>{habit ? 'Save changes' : 'Add habit'}</button>
        </>
      }
    >
      {template?.caution && (
        <div className="notice warn" role="note"><Icon name="warning" /><span>{template.caution}</span></div>
      )}
      <Field label="Name" error={errors.name}>
        {(id, d) => <input id={id} type="text" value={f.name} maxLength={80} aria-describedby={d} aria-invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <div className="form-row two">
        <Field label="Category">
          {(id) => (
            <select id={id} value={f.category} onChange={(e) => set('category', e.target.value as CategoryId)}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Tracking method" help={mode.description}>
          {(id, d) => (
            <select id={id} value={f.mode} aria-describedby={d} onChange={(e) => {
              const m = e.target.value as TrackingMode;
              setF((p) => ({ ...p, mode: m, daily: m === 'replacement' && !p.daily ? '1' : p.daily }));
            }}>
              {MODES.filter((m) => allowedModes.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </Field>
      </div>

      {f.mode === 'abstinence' && (
        <Field label="A successful day means…" help="In your own words. Check-ins are measured against this." error={errors.successRule}>
          {(id, d) => <input id={id} type="text" value={f.successRule} placeholder="e.g. No cigarettes all day" aria-describedby={d} aria-invalid={!!errors.successRule} onChange={(e) => set('successRule', e.target.value)} />}
        </Field>
      )}

      {f.mode === 'quantity' && (
        <Field label="Unit" help="What you are measuring." error={errors.unit}>
          {(id, d) => <input id={id} type="text" value={f.unit} maxLength={20} placeholder="drinks, £, cups…" aria-describedby={d} aria-invalid={!!errors.unit} onChange={(e) => set('unit', e.target.value)} />}
        </Field>
      )}

      {showTargets && (
        <div className="form-row two">
          <Field label={`${f.mode === 'replacement' ? 'Daily target' : 'Daily limit'} (${unitLabel})`} error={errors.daily} help={f.mode === 'replacement' ? 'Leave empty for no daily target.' : 'Days within this limit count towards your streak.'}>
            {(id, d) => <input id={id} type="number" inputMode="decimal" min={0} step={f.mode === 'frequency' ? 1 : 'any'} value={f.daily} aria-describedby={d} aria-invalid={!!errors.daily} onChange={(e) => set('daily', e.target.value)} />}
          </Field>
          <Field label={`Weekly ${f.mode === 'replacement' ? 'target' : 'limit'} (${unitLabel})`} error={errors.weekly} help="Optional.">
            {(id, d) => <input id={id} type="number" inputMode="decimal" min={0} step="any" value={f.weekly} aria-describedby={d} aria-invalid={!!errors.weekly} onChange={(e) => set('weekly', e.target.value)} />}
          </Field>
        </div>
      )}

      {f.mode === 'observation' && (
        <div className="notice" role="note"><Icon name="info" /><span>Observation habits have no targets, streaks or success/failure. Log what happens and look for patterns first.</span></div>
      )}

      {mode.checkInMeaning && (
        <details className="small muted">
          <summary>What check-ins mean for this method</summary>
          <ul>
            <li><strong>Goal met:</strong> {mode.checkInMeaning.met}</li>
            <li><strong>Partly met:</strong> {mode.checkInMeaning.partial}</li>
            <li><strong>Not met:</strong> {mode.checkInMeaning.notMet}</li>
          </ul>
        </details>
      )}

      <Field label="Description" help="Optional.">
        {(id, d) => <textarea id={id} rows={2} value={f.description} aria-describedby={d} onChange={(e) => set('description', e.target.value)} />}
      </Field>

      <div className="form-row two">
        <Field label="Preferred alternative activity" help="Something to do instead, if you like.">
          {(id, d) => <input id={id} type="text" value={f.alternative} aria-describedby={d} onChange={(e) => set('alternative', e.target.value)} />}
        </Field>
        <Field label="Linked habit" help="E.g. link a replacement habit you are building.">
          {(id, d) => (
            <select id={id} value={f.linkedHabitId} aria-describedby={d} onChange={(e) => set('linkedHabitId', e.target.value)}>
              <option value="">None</option>
              {others.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
        </Field>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 6 }}>Triggers to watch for <span className="help">(optional)</span></legend>
        <div className="chips">
          {TRIGGERS.filter((t) => t.id !== 'prefer-not').map((t) => {
            const on = f.triggers.includes(t.id);
            return (
              <button type="button" key={t.id} className="chip" aria-pressed={on} onClick={() => set('triggers', on ? f.triggers.filter((x) => x !== t.id) : [...f.triggers, t.id])}>
                {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {hasStatus({ mode: f.mode, goal: { daily: parseNum(f.daily) } } as Habit) && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 6 }}>Milestones (days in a row)</legend>
          <div className="chips">
            {DEFAULT_MILESTONES.map((m) => {
              const on = f.milestones.includes(m);
              return (
                <button type="button" key={m} className="chip" aria-pressed={on} onClick={() => set('milestones', on ? f.milestones.filter((x) => x !== m) : [...f.milestones, m])}>
                  {m}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 6 }}>Check-in reminder</legend>
        <label className="check">
          <input type="checkbox" checked={f.reminderOn} onChange={(e) => set('reminderOn', e.target.checked)} />
          <span>Remind me to check in <span className="faint small">(works while BREAKFREE is open — turn reminders on in Settings)</span></span>
        </label>
        {f.reminderOn && (
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <input type="time" aria-label="Reminder time" value={f.reminderTime} onChange={(e) => set('reminderTime', e.target.value)} style={{ maxWidth: 160 }} />
            <div className="chips" role="group" aria-label="Reminder days">
              {DAY_LETTERS.map((l, i) => {
                const on = f.reminderDays.includes(i);
                return (
                  <button type="button" key={i} className="chip" aria-pressed={on} aria-label={DAY_NAMES[i]} onClick={() => set('reminderDays', on ? f.reminderDays.filter((x) => x !== i) : [...f.reminderDays, i])}>
                    {l}
                  </button>
                );
              })}
            </div>
            {errors.reminderTime && <span className="error small" role="alert" style={{ color: 'var(--danger)' }}>{errors.reminderTime}</span>}
          </div>
        )}
      </fieldset>

      <Field label="Notes" help="Private, optional.">
        {(id, d) => <textarea id={id} rows={2} value={f.notes} aria-describedby={d} onChange={(e) => set('notes', e.target.value)} />}
      </Field>
    </Modal>
  );
}

// ============================================================ log event

export function LogEventDialog({ open, onClose, habitId, event }: { open: boolean; onClose: () => void; habitId?: string; event?: HabitEvent }) {
  const data = useData();
  const active = data.habits.filter((h) => !h.archived);
  const [hid, setHid] = useState(event?.habitId ?? habitId ?? active[0]?.id ?? '');
  const habit = data.habits.find((h) => h.id === hid);
  const [date, setDate] = useState(event?.date ?? todayKey());
  const [time, setTime] = useState(event?.time ?? nowTime());
  const [amount, setAmount] = useState(event ? String(event.amount) : '');
  const [trigger, setTrigger] = useState<TriggerId | ''>(event?.trigger ?? '');
  const [intensity, setIntensity] = useState<number | undefined>(event?.intensity);
  const [context, setContext] = useState(event?.context ?? '');
  const [note, setNote] = useState(event?.note ?? '');
  const [error, setError] = useState('');

  if (!habit) {
    return (
      <Modal open={open} onClose={onClose} title="Log an event">
        <p className="muted">Add a habit first, then you can log events for it.</p>
        <Link className="btn primary" to="/library" onClick={onClose}>Open the habit library</Link>
      </Modal>
    );
  }
  const mode = modeById(habit.mode);
  const needsAmount = habit.mode === 'time' || habit.mode === 'quantity';
  const showAmount = needsAmount || habit.mode === 'frequency' || habit.mode === 'replacement';
  const amountLabel = habit.mode === 'time' ? 'Duration (minutes)' : habit.mode === 'quantity' ? `Amount (${habit.goal.unit || 'units'})` : 'How many times';

  const save = () => {
    if (!isDateKey(date) || date > todayKey()) return setError('Choose a date that is today or earlier.');
    if (!isTimeOfDay(time)) return setError('Choose a valid time.');
    let n = 1;
    if (showAmount) {
      const parsed = amount.trim() === '' ? (needsAmount ? NaN : 1) : Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) return setError(needsAmount ? `Enter ${habit.mode === 'time' ? 'a duration in minutes' : 'an amount'} above 0.` : 'Enter a number above 0.');
      if (parsed > 100000) return setError('That number is too large.');
      if (habit.mode === 'time' && parsed > 1440) return setError('A single session can be at most 1,440 minutes (24 hours).');
      n = parsed;
    }
    const payload = { habitId: habit.id, date, time, amount: n, trigger: trigger || undefined, intensity, context: context.trim(), note: note.trim() };
    if (event) {
      updateEvent(event.id, payload);
      notify('Entry updated.', 'success');
    } else {
      addEvent(payload);
      if (habit.mode === 'abstinence') {
        notify('Recorded. Every day you managed before still counts — tomorrow is a fresh start.', 'info', { label: 'Urge toolkit', run: () => { location.hash = '#/toolkit'; } }, 7000);
      } else if ((habit.mode === 'frequency' || habit.mode === 'time' || habit.mode === 'quantity') && habit.goal.daily !== undefined) {
        const total = data.events.filter((e) => e.habitId === habit.id && e.date === date).reduce((s, e) => s + e.amount, 0) + n;
        notify(total > habit.goal.daily ? `Logged. You are over today's limit — that's useful information, not a failure.` : 'Logged.', total > habit.goal.daily ? 'info' : 'success');
      } else notify('Logged.', 'success');
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? 'Edit entry' : mode.logLabel}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>{event ? 'Save' : 'Log it'}</button>
        </>
      }
    >
      {!habitId && !event && (
        <Field label="Habit">
          {(id) => (
            <select id={id} value={hid} onChange={(e) => setHid(e.target.value)}>
              {active.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
        </Field>
      )}
      <div className="form-row two">
        <Field label="Date">{(id) => <input id={id} type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Time">{(id) => <input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
      </div>
      {showAmount && (
        <Field label={amountLabel} help={needsAmount ? undefined : 'Defaults to 1.'}>
          {(id, d) => <input id={id} type="number" inputMode="decimal" min={0} step="any" value={amount} placeholder={needsAmount ? '' : '1'} aria-describedby={d} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
      )}
      <Field label="What was going on?" help="Optional trigger label — not a diagnosis.">
        {(id, d) => (
          <select id={id} value={trigger} aria-describedby={d} onChange={(e) => setTrigger(e.target.value as TriggerId | '')}>
            <option value="">Not recorded</option>
            {TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
      </Field>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 6 }}>Intensity of the urge or feeling <span className="help">(optional)</span></legend>
        <div className="chips">
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} className="chip" aria-pressed={intensity === n} aria-label={`Intensity ${n} of 5`} onClick={() => setIntensity(intensity === n ? undefined : n)}>{n}</button>
          ))}
        </div>
      </fieldset>
      <Field label="Context" help="Where were you, who with, what were you doing? Optional.">
        {(id, d) => <input id={id} type="text" value={context} maxLength={200} aria-describedby={d} onChange={(e) => setContext(e.target.value)} />}
      </Field>
      <Field label="Note" help="Optional and private.">
        {(id, d) => <textarea id={id} rows={2} value={note} aria-describedby={d} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {error && <div className="notice danger" role="alert"><Icon name="warning" /><span>{error}</span></div>}
    </Modal>
  );
}

// ============================================================ check-in

export function CheckInDialog({ open, onClose, habit, date: initialDate }: { open: boolean; onClose: () => void; habit: Habit; date?: DateKey }) {
  const data = useData();
  const [date, setDate] = useState(initialDate ?? todayKey());
  const existing = data.checkIns.find((c) => c.habitId === habit.id && c.date === date);
  const [status, setStatus] = useState<CheckInStatus | null>(existing?.status ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const meaning = modeById(habit.mode).checkInMeaning;
  if (!meaning) return null;
  const options: { id: CheckInStatus; label: string; icon: string; text: string }[] = [
    { id: 'met', label: 'Goal met', icon: 'circle-check', text: meaning.met },
    { id: 'partial', label: 'Partly met', icon: 'circle-dashed', text: meaning.partial },
    { id: 'notMet', label: 'Not met', icon: 'circle-x', text: meaning.notMet },
  ];
  const save = () => {
    if (!status) return;
    if (!isDateKey(date) || date > todayKey()) return;
    setCheckIn(habit.id, date, status, note.trim());
    notify(status === 'notMet' ? 'Checked in. A hard day doesn’t erase the progress you have made.' : 'Checked in.', status === 'notMet' ? 'info' : 'success');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Check in: ${habit.name}`}
      footer={
        <>
          {existing && (
            <button type="button" className="btn danger" onClick={() => { deleteCheckIn(habit.id, date); notify('Check-in removed.'); onClose(); }}>Remove</button>
          )}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={!status}>Save check-in</button>
        </>
      }
    >
      {habit.mode === 'abstinence' && <p className="muted small">Your goal: {habit.successRule || 'avoid it for the whole day'}</p>}
      <Field label="Day">
        {(id) => (
          <input id={id} type="date" value={date} max={todayKey()} onChange={(e) => {
            setDate(e.target.value);
            const ex = data.checkIns.find((c) => c.habitId === habit.id && c.date === e.target.value);
            setStatus(ex?.status ?? null);
            setNote(ex?.note ?? '');
          }} />
        )}
      </Field>
      {existing && <p className="small faint">You already checked in for this day — saving will update it.</p>}
      <div className="stack-sm" role="radiogroup" aria-label="How did it go?">
        {options.map((o) => (
          <button type="button" key={o.id} role="radio" aria-checked={status === o.id} aria-pressed={status === o.id} className="option-card" onClick={() => setStatus(o.id)}>
            <span className={`status ${o.id}`}><Icon name={o.icon} size={20} /></span>
            <span>
              <strong>{o.label}</strong>
              <span className="small muted" style={{ display: 'block' }}>{o.text}</span>
            </span>
          </button>
        ))}
      </div>
      <Field label="Note" help="Optional.">
        {(id, d) => <textarea id={id} rows={2} value={note} aria-describedby={d} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </Modal>
  );
}

// ============================================================ habit card

export function HabitCard({ habit, summary, onLog, onCheckIn }: { habit: Habit; summary: HabitSummary; onLog: () => void; onCheckIn: () => void }) {
  const mode = modeById(habit.mode);
  const cat = categoryById(habit.category);
  const s = summary;
  const limit = habit.goal.daily;
  const over = limit !== undefined && habit.mode !== 'replacement' && s.todayTotal > limit;
  const trend = (() => {
    if (s.lastWeekTotal === 0 && s.weekTotal === 0) return null;
    if (habit.mode === 'abstinence' || habit.mode === 'observation') return null;
    const diff = s.weekTotal - s.lastWeekTotal;
    if (s.lastWeekTotal === 0) return null;
    const word = diff === 0 ? 'Same as' : diff > 0 ? 'More than' : 'Less than';
    return `${word} this point last week`;
  })();

  let metric: ReactNode;
  if (habit.mode === 'abstinence') {
    metric = (
      <div>
        <div className="metric"><span className="big">{s.current}</span><span className="muted">{s.current === 1 ? 'day' : 'days'} in a row</span></div>
        <div className="small faint">Best {plural(s.best, 'day')} · {plural(s.successDays, 'successful day')}</div>
      </div>
    );
  } else if (habit.mode === 'observation') {
    metric = (
      <div>
        <div className="metric"><span className="big">{s.weekTotal}</span><span className="muted">this week</span></div>
        <div className="small faint">{s.daysSinceLast === null ? 'No observations yet' : s.daysSinceLast === 0 ? 'Last logged today' : `Last logged ${plural(s.daysSinceLast, 'day')} ago`}</div>
      </div>
    );
  } else {
    metric = (
      <div className="stack-sm">
        <div className="metric">
          <span className="big">{round(s.todayTotal)}</span>
          <span className="muted">
            {habit.mode === 'time' ? 'min' : unitFor(habit)} today
            {limit !== undefined && (habit.mode === 'replacement' ? ` · target ${limit}` : ` · limit ${habit.mode === 'time' ? formatMinutes(limit) : limit}`)}
          </span>
        </div>
        {limit !== undefined && limit > 0 && <ProgressBar value={s.todayTotal / limit} warn={over} label={`${habit.name}: today against target`} />}
        <div className="small faint">This week: {formatAmount(habit, s.weekTotal)}{habit.goal.weekly !== undefined ? ` of ${formatAmount(habit, habit.goal.weekly)}` : ''}</div>
      </div>
    );
  }

  const primaryCheckIn = habit.mode === 'abstinence';
  return (
    <article className="card habit-card" aria-labelledby={`h-${habit.id}`}>
      <div className="top">
        <span className="icon-tile accent"><Icon name={habit.icon} /></span>
        <div className="grow">
          <Link to={`/habits/${habit.id}`} id={`h-${habit.id}`} className="name" style={{ color: 'inherit', textDecoration: 'none' }}>{habit.name}</Link>
          <div className="row small faint" style={{ gap: 6, marginTop: 2 }}>
            <span>{cat.short}</span>·<span>{mode.short}</span>
          </div>
        </div>
        {hasStatus(habit) && <StatusMark status={s.status} />}
      </div>
      {metric}
      <div className="small muted">{targetText(habit)}{trend ? ` · ${trend}` : ''}</div>
      {over && <div className="small" style={{ color: 'var(--warning)' }}>Over today’s limit — tomorrow is a fresh start.</div>}
      <div className="row">
        {primaryCheckIn ? (
          <button type="button" className="btn primary sm" onClick={onCheckIn}><Icon name="check" size={16} />Check in</button>
        ) : (
          <button type="button" className="btn primary sm" onClick={onLog}><Icon name="plus" size={16} />{mode.logLabel}</button>
        )}
        {primaryCheckIn ? (
          <button type="button" className="btn sm" onClick={onLog}>Record occurrence</button>
        ) : hasStatus(habit) ? (
          <button type="button" className="btn sm" onClick={onCheckIn}>Check in</button>
        ) : null}
        <span className="grow" />
        <Link to={`/habits/${habit.id}`} className="btn ghost sm" aria-label={`Details for ${habit.name}`}>Details<Icon name="chevron-right" size={16} /></Link>
      </div>
    </article>
  );
}

// ============================================================ month calendar

export function MonthCalendar({ habit, idx, onPick, weekStartsOn }: { habit: Habit; idx: HabitIndex; onPick?: (d: DateKey) => void; weekStartsOn: 0 | 1 }) {
  const today = todayKey();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const days = useMemo(() => {
    const first = `${month}-01`;
    const lead = (dayOfWeek(first) - weekStartsOn + 7) % 7;
    const out: (DateKey | null)[] = Array(lead).fill(null);
    let d = first;
    while (d.startsWith(month)) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [month, weekStartsOn]);
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(toDateKey(new Date(y, m - 1 + n, 1)).slice(0, 7));
  };
  const statusful = hasStatus(habit);
  const dows = weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const MARK: Record<string, string> = { met: '✓', partial: '~', notMet: '✕', logged: '•' };
  const label = fromDateKey(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <button type="button" className="icon-btn sm" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="chevron-left" /></button>
        <strong aria-live="polite">{label}</strong>
        <button type="button" className="icon-btn sm" onClick={() => shift(1)} aria-label="Next month" disabled={month >= today.slice(0, 7)}><Icon name="chevron-right" /></button>
      </div>
      <div className="calendar" role="grid" aria-label={`${habit.name} — ${label}`}>
        {dows.map((d) => <div key={d} className="dow" aria-hidden="true">{DAY_LETTERS[d]}</div>)}
        {days.map((d, i) => {
          if (!d) return <span key={`b${i}`} aria-hidden="true" />;
          const st = dayStatus(habit, idx, d);
          const total = idx.totals.get(d);
          const cls = statusful ? (st === 'none' || st === 'n/a' ? '' : st) : total !== undefined ? 'logged' : '';
          const future = d > today;
          const text = statusful
            ? { met: 'goal met', partial: 'partly met', notMet: 'not met', none: 'no entry', 'n/a': '' }[st]
            : total !== undefined ? `${idx.counts.get(d)} logged` : 'nothing logged';
          return (
            <button
              type="button"
              key={d}
              className={`day ${cls}${d === today ? ' today' : ''}${future ? ' future' : ''}`}
              disabled={future || !onPick}
              onClick={() => onPick?.(d)}
              aria-label={`${formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${text}`}
            >
              {Number(d.slice(8))}
              {cls && <span className="mark" aria-hidden="true">{MARK[cls]}</span>}
            </button>
          );
        })}
      </div>
      <div className="legend" aria-hidden="true">
        {statusful ? (
          <>
            <span><i className="swatch" style={{ background: 'var(--success-soft)', border: '1px solid var(--success)' }} />✓ Met</span>
            <span><i className="swatch" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)' }} />~ Partly</span>
            <span><i className="swatch" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)' }} />✕ Not met</span>
            <span><i className="swatch" style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }} />No entry</span>
          </>
        ) : (
          <span><i className="swatch" style={{ background: 'var(--info-soft)', border: '1px solid var(--info)' }} />• Logged</span>
        )}
      </div>
    </div>
  );
}
