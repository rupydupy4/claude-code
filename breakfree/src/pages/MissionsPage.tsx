import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Mission, MissionCategory, Recurrence, Routine, RoutineSlot } from '../models/types';
import { MISSION_CATEGORIES, MISSION_TEMPLATES } from '../data/content';
import { Icon } from '../components/Icon';
import { confirmAction, EmptyState, Field, Modal, PageHeader, ProgressBar, Segmented } from '../components/ui';
import { useData, useToday } from '../hooks/useApp';
import { isDateKey, isTimeOfDay } from '../utils/dates';
import { completionKey, completionSet, describeRecurrence, isMissionDue, routineProgress, uid } from '../utils/logic';
import { deleteMission, deleteRoutine, saveMission, saveRoutine, setMissionArchived, toggleMission } from '../services/store';
import { notify } from '../services/notify';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOTS: { id: RoutineSlot; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

export default function MissionsPage() {
  const data = useData();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'today' | 'all' | 'routines' | 'archived'>('today');
  const [editing, setEditing] = useState<Mission | 'new' | null>(null);
  const [routineEdit, setRoutineEdit] = useState<Routine | 'new' | null>(null);
  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing('new');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const done = useMemo(() => completionSet(data.missionCompletions), [data.missionCompletions]);
  const active = data.missions.filter((m) => !m.archived);
  const dueToday = active.filter((m) => isMissionDue(m, today)).sort((a, b) => (a.preferredTime ?? '99').localeCompare(b.preferredTime ?? '99'));
  const doneToday = dueToday.filter((m) => done.has(completionKey(m.id, today))).length;
  const routines = data.routines.filter((r) => !r.archived);

  const addTemplate = (tpl: (typeof MISSION_TEMPLATES)[number]) => {
    if (active.some((m) => m.title === tpl.title)) return notify('You already have that mission.');
    saveMission({ title: tpl.title, category: tpl.category, durationMin: tpl.durationMin, recurrence: { type: 'daily' }, reminder: false });
    notify(`Added “${tpl.title}”.`, 'success');
  };

  const missionRow = (m: Mission, showToggle: boolean) => {
    const isDone = done.has(completionKey(m.id, today));
    return (
      <li key={m.id}>
        {showToggle ? (
          <input type="checkbox" className="big-check" aria-label={`Complete ${m.title}`} checked={isDone} onChange={(e) => toggleMission(m.id, today, e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
        ) : (
          <span className="icon-tile"><Icon name="missions" /></span>
        )}
        <div className="grow">
          <div className={`title ${showToggle && isDone ? 'done-text' : ''}`}>{m.title}</div>
          <div className="meta">
            {describeRecurrence(m)}
            {m.preferredTime ? ` · ${m.preferredTime}` : ''}
            {m.durationMin ? ` · ${m.durationMin} min` : ''} · {MISSION_CATEGORIES.find((c) => c.id === m.category)?.label}
          </div>
        </div>
        <button type="button" className="icon-btn sm" aria-label={`Edit ${m.title}`} onClick={() => setEditing(m)}><Icon name="edit" size={16} /></button>
      </li>
    );
  };

  return (
    <div>
      <PageHeader
        title="Daily Missions"
        subtitle="Small, optional actions you plan for yourself. Group them into routines if you like."
        actions={
          <>
            <Link className="btn" to="/focus"><Icon name="timer" size={16} />Focus timer</Link>
            <button type="button" className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} />New mission</button>
          </>
        }
      />
      <div style={{ marginBottom: 16 }}>
        <Segmented label="View" value={tab} onChange={setTab} options={[
          { value: 'today', label: `Today (${doneToday}/${dueToday.length})` },
          { value: 'all', label: 'All missions' },
          { value: 'routines', label: 'Routines' },
          { value: 'archived', label: 'Archived' },
        ]} />
      </div>

      {tab === 'today' && (
        <div className="stack">
          {dueToday.length > 0 && <ProgressBar value={doneToday / dueToday.length} label="Today's missions completed" />}
          {dueToday.length ? <ul className="list">{dueToday.map((m) => missionRow(m, true))}</ul> : (
            <EmptyState icon="missions" title="No missions for today" action={<button type="button" className="btn primary" onClick={() => setEditing('new')}>Create a mission</button>}>
              Add one of your own, or pick from the suggestions below.
            </EmptyState>
          )}
          {routines.filter((r) => !r.paused).map((r) => <RoutineCard key={r.id} routine={r} today={today} done={done} />)}
          <div>
            <div className="section-title"><h2>Suggestions</h2></div>
            <div className="chips">
              {MISSION_TEMPLATES.map((tpl) => (
                <button type="button" key={tpl.title} className="chip" onClick={() => addTemplate(tpl)}><Icon name="plus" size={14} />{tpl.title}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'all' && (active.length ? <ul className="list">{active.map((m) => missionRow(m, false))}</ul> : <EmptyState icon="missions" title="No missions yet" action={<button type="button" className="btn primary" onClick={() => setEditing('new')}>Create a mission</button>} />)}

      {tab === 'routines' && (
        <div className="stack">
          <div><button type="button" className="btn" onClick={() => setRoutineEdit('new')} disabled={!active.length}><Icon name="plus" size={16} />New routine</button>{!active.length && <span className="small faint" style={{ marginLeft: 8 }}>Create some missions first.</span>}</div>
          {routines.length ? routines.map((r) => <RoutineCard key={r.id} routine={r} today={today} done={done} onEdit={() => setRoutineEdit(r)} />) : (
            <EmptyState icon="repeat" title="No routines yet">A routine is an ordered set of missions for the morning, afternoon or evening.</EmptyState>
          )}
        </div>
      )}

      {tab === 'archived' && (
        <div className="stack">
          {data.missions.filter((m) => m.archived).length ? (
            <ul className="list">
              {data.missions.filter((m) => m.archived).map((m) => (
                <li key={m.id}>
                  <div className="grow"><div className="title">{m.title}</div><div className="meta">{data.missionCompletions.filter((c) => c.missionId === m.id).length} completions kept</div></div>
                  <button type="button" className="btn sm" onClick={() => setMissionArchived(m.id, false)}><Icon name="restore" size={14} />Restore</button>
                  <button type="button" className="icon-btn sm" aria-label={`Delete ${m.title}`} onClick={() => confirmDeleteMission(m, data.missionCompletions.filter((c) => c.missionId === m.id).length)}><Icon name="trash" size={16} /></button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="archive" title="No archived missions" />}
          {data.routines.filter((r) => r.archived).map((r) => (
            <div key={r.id} className="card row">
              <div className="grow"><strong>{r.name}</strong> <span className="faint small">routine</span></div>
              <button type="button" className="btn sm" onClick={() => saveRoutine({ ...r, archived: false })}>Restore</button>
            </div>
          ))}
        </div>
      )}

      {editing && <MissionForm mission={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {routineEdit && <RoutineForm routine={routineEdit === 'new' ? undefined : routineEdit} onClose={() => setRoutineEdit(null)} />}
    </div>
  );
}

async function confirmDeleteMission(m: Mission, completions: number) {
  if (await confirmAction({ title: `Delete “${m.title}”?`, body: `This removes the mission, its ${completions} completion record(s) and any routine steps that use it. Archive it instead to keep the history.`, confirmLabel: 'Delete', danger: true })) {
    deleteMission(m.id);
    notify('Mission deleted.');
    return true;
  }
  return false;
}

function RoutineCard({ routine, today, done, onEdit }: { routine: Routine; today: string; done: Set<string>; onEdit?: () => void }) {
  const data = useData();
  const p = routineProgress(routine, done, today, data.missions);
  const steps = routine.steps.map((s) => data.missions.find((m) => m.id === s.missionId)).filter((m): m is Mission => !!m && !m.archived);
  return (
    <section className="card" aria-label={`${routine.name} routine`}>
      <div className="card-head">
        <div>
          <h3>{routine.name}</h3>
          <div className="small faint">{SLOTS.find((s) => s.id === routine.slot)?.label}{routine.startTime ? ` · starts ${routine.startTime}` : ''}{routine.paused ? ' · paused' : ''}</div>
        </div>
        <div className="row">
          <span className="badge num">{p.completed}/{p.total}</span>
          {onEdit && <button type="button" className="icon-btn sm" aria-label={`Edit ${routine.name}`} onClick={onEdit}><Icon name="edit" size={16} /></button>}
        </div>
      </div>
      {p.total > 0 && <ProgressBar value={p.completed / p.total} label={`${routine.name} progress`} />}
      <ol className="stack-sm" style={{ paddingLeft: 20, margin: '12px 0 0' }}>
        {steps.map((m) => {
          const isDone = done.has(completionKey(m.id, today));
          return (
            <li key={m.id}>
              <label className="check">
                <input type="checkbox" checked={isDone} disabled={routine.paused} onChange={(e) => toggleMission(m.id, today, e.target.checked)} />
                <span className={isDone ? 'done-text' : ''}>{m.title}</span>
              </label>
            </li>
          );
        })}
      </ol>
      {!steps.length && <p className="small faint">No steps yet.</p>}
    </section>
  );
}

function MissionForm({ mission, onClose }: { mission?: Mission; onClose: () => void }) {
  const today = useToday();
  const [title, setTitle] = useState(mission?.title ?? '');
  const [category, setCategory] = useState<MissionCategory>(mission?.category ?? 'other');
  const [duration, setDuration] = useState(mission?.durationMin?.toString() ?? '');
  const [time, setTime] = useState(mission?.preferredTime ?? '');
  const [type, setType] = useState<Recurrence['type']>(mission?.recurrence.type ?? 'daily');
  const [date, setDate] = useState(mission?.recurrence.type === 'once' ? mission.recurrence.date : today);
  const [days, setDays] = useState<number[]>(mission?.recurrence.type === 'weekdays' ? mission.recurrence.days : [1, 2, 3, 4, 5]);
  const [reminder, setReminder] = useState(mission?.reminder ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give the mission a title.';
    const d = duration.trim() ? Number(duration) : undefined;
    if (d !== undefined && (!Number.isFinite(d) || d <= 0 || d > 1440)) e.duration = 'Enter minutes between 1 and 1,440.';
    if (time && !isTimeOfDay(time)) e.time = 'Enter a valid time.';
    if (type === 'once' && !isDateKey(date)) e.date = 'Choose a date.';
    if (type === 'weekdays' && !days.length) e.days = 'Pick at least one day.';
    if (reminder && !time) e.time = 'Reminders need a preferred time.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const recurrence: Recurrence = type === 'once' ? { type, date } : type === 'weekdays' ? { type, days: [...days].sort() } : { type: 'daily' };
    saveMission({ id: mission?.id, title: title.trim(), category, durationMin: d, preferredTime: time || undefined, recurrence, reminder });
    notify(mission ? 'Mission updated.' : 'Mission added.', 'success');
    onClose();
  };
  return (
    <Modal
      open
      title={mission ? 'Edit mission' : 'New mission'}
      onClose={onClose}
      footer={
        <>
          {mission && <button type="button" className="btn danger" onClick={async () => { if (await confirmDeleteMission(mission, 0)) onClose(); }}>Delete</button>}
          {mission && <button type="button" className="btn" onClick={() => { setMissionArchived(mission.id, true); notify('Mission archived.'); onClose(); }}>Archive</button>}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <Field label="Title" error={errors.title}>{(id, d) => <input id={id} type="text" value={title} maxLength={100} aria-describedby={d} aria-invalid={!!errors.title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <div className="form-row three">
        <Field label="Category">{(id) => <select id={id} value={category} onChange={(e) => setCategory(e.target.value as MissionCategory)}>{MISSION_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}</Field>
        <Field label="Duration (min)" error={errors.duration} help="Optional">{(id, d) => <input id={id} type="number" min={1} value={duration} aria-describedby={d} onChange={(e) => setDuration(e.target.value)} />}</Field>
        <Field label="Preferred time" error={errors.time} help="Optional">{(id, d) => <input id={id} type="time" value={time} aria-describedby={d} onChange={(e) => setTime(e.target.value)} />}</Field>
      </div>
      <div className="field">
        <span>Repeats</span>
        <Segmented label="Repeats" value={type} onChange={setType} options={[{ value: 'once', label: 'Once' }, { value: 'daily', label: 'Daily' }, { value: 'weekdays', label: 'Selected days' }]} />
      </div>
      {type === 'once' && <Field label="Date" error={errors.date}>{(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>}
      {type === 'weekdays' && (
        <div className="field">
          <span>Days</span>
          <div className="chips" role="group" aria-label="Days">
            {DAY_LETTERS.map((l, i) => <button type="button" key={i} className="chip" aria-label={DAY_NAMES[i]} aria-pressed={days.includes(i)} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}>{l}</button>)}
          </div>
          {errors.days && <span className="error">{errors.days}</span>}
        </div>
      )}
      <label className="check"><input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} /><span>Remind me at the preferred time <span className="faint small">(while the app is open; enable reminders in Settings)</span></span></label>
    </Modal>
  );
}

function RoutineForm({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const data = useData();
  const missions = data.missions.filter((m) => !m.archived);
  const [name, setName] = useState(routine?.name ?? '');
  const [slot, setSlot] = useState<RoutineSlot>(routine?.slot ?? 'morning');
  const [startTime, setStartTime] = useState(routine?.startTime ?? '');
  const [paused, setPaused] = useState(routine?.paused ?? false);
  const [steps, setSteps] = useState(routine?.steps.filter((s) => missions.some((m) => m.id === s.missionId)) ?? []);
  const [error, setError] = useState('');
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };
  const save = () => {
    if (!name.trim()) return setError('Give the routine a name.');
    if (!steps.length) return setError('Add at least one step.');
    saveRoutine({ id: routine?.id, name: name.trim(), slot, startTime: startTime || undefined, steps, paused, archived: routine?.archived ?? false });
    notify(routine ? 'Routine updated.' : 'Routine created.', 'success');
    onClose();
  };
  const available = missions.filter((m) => !steps.some((s) => s.missionId === m.id));
  return (
    <Modal
      open
      title={routine ? 'Edit routine' : 'New routine'}
      onClose={onClose}
      footer={
        <>
          {routine && <button type="button" className="btn danger" onClick={async () => { if (await confirmAction({ title: 'Delete this routine?', body: 'The missions in it are kept.', confirmLabel: 'Delete', danger: true })) { deleteRoutine(routine.id); onClose(); } }}>Delete</button>}
          {routine && <button type="button" className="btn" onClick={() => { saveRoutine({ ...routine, archived: true }); notify('Routine archived.'); onClose(); }}>Archive</button>}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <Field label="Name">{(id) => <input id={id} type="text" value={name} maxLength={60} placeholder="Morning reset" onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="form-row two">
        <div className="field"><span>Part of day</span><Segmented label="Part of day" value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s.id, label: s.label }))} /></div>
        <Field label="Start time (optional)" help="Used for routine reminders.">{(id, d) => <input id={id} type="time" value={startTime} aria-describedby={d} onChange={(e) => setStartTime(e.target.value)} />}</Field>
      </div>
      <div className="field">
        <span>Steps (in order)</span>
        {steps.length ? (
          <ol className="list" style={{ listStyle: 'none' }}>
            {steps.map((s, i) => (
              <li key={s.id}>
                <span className="faint num">{i + 1}</span>
                <span className="grow title">{missions.find((m) => m.id === s.missionId)?.title}</span>
                <button type="button" className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrow-up" size={16} /></button>
                <button type="button" className="icon-btn sm" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><Icon name="arrow-down" size={16} /></button>
                <button type="button" className="icon-btn sm" aria-label="Remove step" onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}><Icon name="x" size={16} /></button>
              </li>
            ))}
          </ol>
        ) : <span className="help">No steps yet.</span>}
      </div>
      {available.length > 0 && (
        <div className="field">
          <span>Add a mission</span>
          <div className="chips">{available.map((m) => <button type="button" key={m.id} className="chip" onClick={() => setSteps([...steps, { id: uid(), missionId: m.id }])}><Icon name="plus" size={14} />{m.title}</button>)}</div>
        </div>
      )}
      <label className="check"><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /><span>Pause this routine</span></label>
      {error && <div className="notice danger" role="alert"><Icon name="warning" /><span>{error}</span></div>}
    </Modal>
  );
}
