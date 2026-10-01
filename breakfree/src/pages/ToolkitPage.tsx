import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITIES, ACTIVITY_CATEGORIES, type Activity, type ActivityCategory } from '../data/content';
import { Icon } from '../components/Icon';
import { confirmAction, EmptyState, Field, Modal, PageHeader, Segmented } from '../components/ui';
import { usePersistentTimer } from '../hooks/useTimer';
import { useData, useNow } from '../hooks/useApp';
import { formatClock, plural } from '../utils/logic';
import { formatDate, formatTime, nowTime, todayKey } from '../utils/dates';
import { addBlockedSite, addDistractionLog, addResetSession, deleteBlockedSite, deleteDistractionLog, updateResetSession } from '../services/store';
import { notify } from '../services/notify';

const DURATIONS = [1, 2, 5, 10];

export default function ToolkitPage() {
  const [suggestion, setSuggestion] = useState<Activity | null>(null);
  const resetRef = useRef<HTMLDivElement>(null);
  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="Urge toolkit" title="Pause. Reset. Choose." subtitle="Give yourself a moment to decide what you want to do next. Everything here works offline." />
      <div className="row">
        <button type="button" className="btn primary" onClick={() => resetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <Icon name="play" size={16} />Start a reset session
        </button>
        <button type="button" className="btn" onClick={() => setSuggestion(ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)])}>
          <Icon name="shuffle" size={16} />Suggest an activity
        </button>
      </div>
      {suggestion && (
        <div className="card row nowrap" role="status">
          <span className="icon-tile accent"><Icon name="sprout" /></span>
          <div className="grow"><strong>{suggestion.title}</strong><div className="small muted">{suggestion.detail} · about {suggestion.minutes} min</div></div>
          <button type="button" className="btn sm" onClick={() => setSuggestion(ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)])}>Another</button>
        </div>
      )}
      <div ref={resetRef} style={{ scrollMarginTop: 80 }}><ResetSession activity={suggestion} /></div>
      <div className="grid grid-2">
        <Breathing />
        <ActivityLibrary />
      </div>
      <Distractions />
    </div>
  );
}

// ---------------------------------------------------------------- reset session

function ResetSession({ activity }: { activity: Activity | null }) {
  const [minutes, setMinutes] = useState(2);
  const t = usePersistentTimer('reset-timer', minutes * 60_000, { activityId: '' as string });
  const [reflectId, setReflectId] = useState<string | null>(null);
  const savedFor = useRef<number | null>(null);
  const { timer } = t;

  // Save the session once when it completes.
  useEffect(() => {
    if (timer.status === 'done' && timer.firstStartedAt && savedFor.current !== timer.firstStartedAt) {
      savedFor.current = timer.firstStartedAt;
      const id = addResetSession({ startedAt: new Date(timer.firstStartedAt).toISOString(), durationSec: Math.round(timer.durationMs / 1000), completed: true, activityId: t.extra.activityId || undefined });
      setReflectId(id);
      try { navigator.vibrate?.(200); } catch { /* unsupported */ }
    }
  }, [timer.status, timer.firstStartedAt, timer.durationMs, t.extra.activityId]);

  const end = () => {
    if (timer.firstStartedAt && t.elapsed >= 10_000) {
      const id = addResetSession({ startedAt: new Date(timer.firstStartedAt).toISOString(), durationSec: Math.round(t.elapsed / 1000), completed: false, activityId: t.extra.activityId || undefined });
      setReflectId(id);
    }
    t.reset(minutes * 60_000);
  };
  const pct = timer.durationMs ? t.elapsed / timer.durationMs : 0;
  const r = 120, c = 2 * Math.PI * r;

  return (
    <section className="card pad-lg" aria-labelledby="reset-h">
      <div className="card-head"><h2 id="reset-h">Reset session</h2>{activity && <span className="badge accent">With: {activity.title}</span>}</div>
      {timer.status === 'idle' && (
        <div className="row" style={{ marginBottom: 8 }}>
          <Segmented label="Duration" value={minutes} onChange={(m) => { setMinutes(m); t.reset(m * 60_000, { activityId: activity?.id ?? '' }); }} options={DURATIONS.map((d) => ({ value: d, label: `${d} min` }))} />
        </div>
      )}
      <div className="timer-face">
        <svg viewBox="0 0 260 260" aria-hidden="true">
          <circle cx="130" cy="130" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
          <circle cx="130" cy="130" r={r} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
        </svg>
        <div style={{ textAlign: 'center' }}>
          <div className="clock" role="timer" aria-live="off">{formatClock(timer.status === 'done' ? 0 : t.remaining)}</div>
          <div className="small muted" aria-live="polite">{{ idle: 'Ready when you are', running: 'Breathe and let the moment pass', paused: 'Paused', done: 'Session complete' }[timer.status]}</div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        {timer.status === 'idle' && <button type="button" className="btn primary" onClick={() => { t.setExtra({ activityId: activity?.id ?? '' }); t.start(); }}><Icon name="play" size={16} />Start</button>}
        {timer.status === 'running' && <button type="button" className="btn" onClick={t.pause}><Icon name="pause" size={16} />Pause</button>}
        {timer.status === 'paused' && <button type="button" className="btn primary" onClick={t.start}><Icon name="play" size={16} />Resume</button>}
        {(timer.status === 'running' || timer.status === 'paused') && (
          <>
            <button type="button" className="btn" onClick={() => t.reset(minutes * 60_000)}><Icon name="reset" size={16} />Restart</button>
            <button type="button" className="btn ghost" onClick={end}><Icon name="stop" size={16} />End</button>
          </>
        )}
        {timer.status === 'done' && <button type="button" className="btn" onClick={() => t.reset(minutes * 60_000)}><Icon name="reset" size={16} />New session</button>}
      </div>
      <p className="small faint" style={{ textAlign: 'center', marginTop: 10 }}>Urges usually rise and fall. This is a pause, not a guarantee — whatever you decide next is your choice.</p>
      {reflectId && <Reflection id={reflectId} onClose={() => setReflectId(null)} />}
    </section>
  );
}

function Reflection({ id, onClose }: { id: string; onClose: () => void }) {
  const [helped, setHelped] = useState<'yes' | 'somewhat' | 'no' | undefined>();
  const [feeling, setFeeling] = useState('');
  const [note, setNote] = useState('');
  const save = () => {
    updateResetSession(id, { helped, feeling: feeling.trim() || undefined, note: note.trim() || undefined });
    notify('Thanks — saved privately.', 'success');
    onClose();
  };
  return (
    <Modal open title="How did that go?" onClose={onClose} footer={<><button type="button" className="btn ghost" onClick={onClose}>Skip</button><button type="button" className="btn primary" onClick={save}>Save</button></>}>
      <p className="muted small">Entirely optional. Your session is already recorded.</p>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 6 }}>Did the session help?</legend>
        <div className="chips">
          {(['yes', 'somewhat', 'no'] as const).map((h) => <button type="button" key={h} className="chip" aria-pressed={helped === h} onClick={() => setHelped(helped === h ? undefined : h)}>{{ yes: 'Yes', somewhat: 'Somewhat', no: 'Not really' }[h]}</button>)}
        </div>
      </fieldset>
      <Field label="How are you feeling now?">{(fid) => <input id={fid} type="text" value={feeling} maxLength={120} onChange={(e) => setFeeling(e.target.value)} />}</Field>
      <Field label="Note">{(fid) => <textarea id={fid} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
    </Modal>
  );
}

// ---------------------------------------------------------------- breathing

const PHASES = [
  { name: 'Breathe in', sec: 4, scale: 1.25 },
  { name: 'Hold', sec: 4, scale: 1.25 },
  { name: 'Breathe out', sec: 6, scale: 0.85 },
];
const CYCLE = PHASES.reduce((s, p) => s + p.sec, 0);

function Breathing() {
  const [minutes, setMinutes] = useState(2);
  const [state, setState] = useState<{ status: 'idle' | 'running' | 'paused' | 'done'; startedAt: number; elapsed: number }>({ status: 'idle', startedAt: 0, elapsed: 0 });
  const now = useNow(200, state.status === 'running');
  const elapsedMs = state.status === 'running' ? state.elapsed + (now - state.startedAt) : state.elapsed;
  const total = minutes * 60_000;
  const done = elapsedMs >= total;
  useEffect(() => {
    if (state.status === 'running' && done) setState({ status: 'done', startedAt: 0, elapsed: total });
  }, [done, state.status, total]);
  const inCycle = (elapsedMs / 1000) % CYCLE;
  let acc = 0;
  let phase = PHASES[0], phaseLeft = 0;
  for (const p of PHASES) {
    if (inCycle < acc + p.sec) { phase = p; phaseLeft = Math.ceil(acc + p.sec - inCycle); break; }
    acc += p.sec;
  }
  const reduce = typeof window !== 'undefined' && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce');
  const running = state.status === 'running';
  return (
    <section className="card" aria-labelledby="breath-h">
      <div className="card-head"><h2 id="breath-h">Breathing guide</h2></div>
      {state.status === 'idle' && <Segmented label="Breathing duration" value={minutes} onChange={setMinutes} options={[1, 2, 3, 5].map((m) => ({ value: m, label: `${m} min` }))} />}
      <div
        className="breath"
        style={{ transform: `scale(${running && !reduce ? phase.scale : 1})`, transitionDuration: running && !reduce ? `${phase.sec}s` : '0s' }}
        aria-hidden="true"
      >
        {running || state.status === 'paused' ? phaseLeft : ''}
      </div>
      <p style={{ textAlign: 'center', fontWeight: 650 }} aria-live="polite">
        {state.status === 'idle' ? 'In for 4 · hold for 4 · out for 6' : state.status === 'done' ? 'Done. Notice how you feel.' : state.status === 'paused' ? 'Paused' : phase.name}
      </p>
      <p className="small faint" style={{ textAlign: 'center' }}>{state.status !== 'idle' && state.status !== 'done' ? `${formatClock(Math.max(0, total - elapsedMs))} left` : 'Breathe gently — stop if you feel dizzy.'}</p>
      <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
        {(state.status === 'idle' || state.status === 'done') && <button type="button" className="btn primary" onClick={() => setState({ status: 'running', startedAt: Date.now(), elapsed: 0 })}><Icon name="play" size={16} />{state.status === 'done' ? 'Again' : 'Start'}</button>}
        {running && <button type="button" className="btn" onClick={() => setState({ status: 'paused', startedAt: 0, elapsed: elapsedMs })}><Icon name="pause" size={16} />Pause</button>}
        {state.status === 'paused' && <button type="button" className="btn primary" onClick={() => setState({ status: 'running', startedAt: Date.now(), elapsed: state.elapsed })}><Icon name="play" size={16} />Resume</button>}
        {(running || state.status === 'paused') && <button type="button" className="btn ghost" onClick={() => setState({ status: 'idle', startedAt: 0, elapsed: 0 })}><Icon name="stop" size={16} />Stop</button>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- activities

function ActivityLibrary() {
  const [cat, setCat] = useState<ActivityCategory | 'all'>('all');
  const [maxMin, setMaxMin] = useState<number>(60);
  const [picked, setPicked] = useState<string | null>(null);
  const list = useMemo(() => ACTIVITIES.filter((a) => (cat === 'all' || a.category === cat) && a.minutes <= maxMin), [cat, maxMin]);
  return (
    <section className="card" aria-labelledby="act-h">
      <div className="card-head">
        <h2 id="act-h">Things to try instead</h2>
        <button type="button" className="btn sm" disabled={!list.length} onClick={() => setPicked(list[Math.floor(Math.random() * list.length)]?.id ?? null)}><Icon name="shuffle" size={14} />Random</button>
      </div>
      <div className="chips" role="group" aria-label="Activity category" style={{ marginBottom: 8 }}>
        <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
        {ACTIVITY_CATEGORIES.map((c) => <button type="button" key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
      </div>
      <Segmented label="Maximum duration" value={maxMin} onChange={setMaxMin} options={[{ value: 2, label: '≤2 min' }, { value: 5, label: '≤5 min' }, { value: 10, label: '≤10 min' }, { value: 60, label: 'Any' }]} />
      <ul className="stack-sm" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
        {list.map((a) => (
          <li key={a.id} className="row nowrap" style={{ padding: 8, borderRadius: 10, background: picked === a.id ? 'var(--accent-soft)' : undefined }} aria-current={picked === a.id ? 'true' : undefined}>
            <Icon name={picked === a.id ? 'star' : 'sprout'} size={16} />
            <div className="grow"><strong className="small">{a.title}</strong><div className="tiny muted">{a.detail}</div></div>
            <span className="badge">{a.minutes} min</span>
          </li>
        ))}
        {!list.length && <li className="muted small">No activities match — try a longer duration.</li>}
      </ul>
      <p className="tiny faint" style={{ marginTop: 10 }}>No activity is guaranteed to make an urge go away; they just give you a different option.</p>
    </section>
  );
}

// ---------------------------------------------------------------- distractions

function Distractions() {
  const data = useData();
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [logSite, setLogSite] = useState('');
  const [logNote, setLogNote] = useState('');
  const add = () => {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return setError('Enter a website like example.com');
    if (data.blockedSites.some((s) => s.domain === d)) return setError('That site is already on your list.');
    addBlockedSite(d, reason.trim());
    setDomain('');
    setReason('');
    setError('');
  };
  const logs = [...data.distractionLogs].sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1)).slice(0, 10);
  return (
    <section aria-labelledby="dist-h" className="stack">
      <div className="section-title" style={{ marginBottom: 0 }}><h2 id="dist-h">Distraction management</h2></div>
      <div className="notice" role="note">
        <Icon name="info" />
        <span>
          A web app can’t block websites or see your other tabs — and BREAKFREE never looks at your browsing. Use this list as a personal commitment, and use your device’s own tools for real blocking:
          iPhone/iPad: <strong>Settings → Screen Time → Content &amp; Privacy Restrictions</strong>; Android: <strong>Settings → Digital Wellbeing</strong>; Windows: <strong>Microsoft Family Safety</strong>; Mac: <strong>System Settings → Screen Time</strong>. Browser extensions can also block sites, but they need permission to read the pages you visit.
        </span>
      </div>
      <div className="grid grid-2">
        <div className="card stack-sm">
          <h3>Sites I want to avoid</h3>
          <div className="form-row two">
            <Field label="Website" error={error}>{(id, d) => <input id={id} type="text" inputMode="url" placeholder="example.com" value={domain} aria-describedby={d} aria-invalid={!!error} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />}</Field>
            <Field label="Why (optional)">{(id) => <input id={id} type="text" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />}</Field>
          </div>
          <div><button type="button" className="btn sm" onClick={add}><Icon name="plus" size={14} />Add to my list</button></div>
          {data.blockedSites.length ? (
            <ul className="list">
              {data.blockedSites.map((s) => (
                <li key={s.id}>
                  <Icon name="globe" />
                  <div className="grow"><div className="title">{s.domain}</div>{s.reason && <div className="meta">{s.reason}</div>}</div>
                  <button type="button" className="icon-btn sm" aria-label={`Remove ${s.domain}`} onClick={() => deleteBlockedSite(s.id)}><Icon name="trash" size={16} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="small faint">Your list is empty.</p>}
        </div>
        <div className="card stack-sm">
          <h3>Distraction log</h3>
          <p className="small muted">Got pulled away? Note it here — awareness helps.</p>
          <div className="form-row two">
            <Field label="Site or app">{(id) => <input id={id} type="text" value={logSite} maxLength={80} onChange={(e) => setLogSite(e.target.value)} />}</Field>
            <Field label="Note">{(id) => <input id={id} type="text" value={logNote} maxLength={160} onChange={(e) => setLogNote(e.target.value)} />}</Field>
          </div>
          <div>
            <button type="button" className="btn sm" disabled={!logSite.trim() && !logNote.trim()} onClick={() => { addDistractionLog({ date: todayKey(), time: nowTime(), site: logSite.trim(), note: logNote.trim() }); setLogSite(''); setLogNote(''); notify('Logged.', 'success'); }}>
              <Icon name="plus" size={14} />Log distraction
            </button>
          </div>
          {logs.length ? (
            <ul className="list">
              {logs.map((l) => (
                <li key={l.id}>
                  <div className="grow"><div className="title">{l.site || 'Distraction'}</div><div className="meta">{formatDate(l.date)} · {formatTime(l.time)}{l.note ? ` · ${l.note}` : ''}</div></div>
                  <button type="button" className="icon-btn sm" aria-label="Delete log entry" onClick={async () => { if (await confirmAction({ title: 'Delete this log entry?', body: 'It will be permanently removed.', confirmLabel: 'Delete', danger: true })) deleteDistractionLog(l.id); }}><Icon name="trash" size={16} /></button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="list" title="No distractions logged">{plural(0, 'entry', 'entries')} so far.</EmptyState>}
        </div>
      </div>
    </section>
  );
}
