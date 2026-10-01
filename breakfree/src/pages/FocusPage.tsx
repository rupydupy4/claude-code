import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { confirmAction, EmptyState, Field, PageHeader, Segmented, Stat } from '../components/ui';
import { usePersistentTimer } from '../hooks/useTimer';
import { useData, useToday } from '../hooks/useApp';
import { addDays, formatDate, startOfWeek } from '../utils/dates';
import { focusMinutes, formatClock, formatMinutes, idleTimer, localDateOfIso, startTimer } from '../utils/logic';
import { addFocusSession, deleteFocusSession, updatePrefs } from '../services/store';
import { notify } from '../services/notify';

const PRESETS = [15, 25, 45, 60];

/**
 * Rules: a session is "completed" only if the work timer reaches zero. Ending early saves an
 * "ended-early" session (if at least one minute was focused) that is kept in history but not
 * counted towards focus-time totals. Reset discards the current session.
 */
export default function FocusPage() {
  const data = useData();
  const today = useToday();
  const { workMin, breakMin } = data.prefs.focusDefaults;
  const [custom, setCustom] = useState(String(workMin));
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const t = usePersistentTimer('focus-timer', workMin * 60_000, { phase: 'work' as 'work' | 'break', plannedMin: workMin });
  const { timer, extra } = t;
  const saved = useRef<number | null>(null);

  // When the work timer completes, save once and move to the break.
  useEffect(() => {
    if (timer.status !== 'done' || !timer.firstStartedAt || saved.current === timer.firstStartedAt) return;
    saved.current = timer.firstStartedAt;
    if (extra.phase === 'work') {
      addFocusSession({ startedAt: new Date(timer.firstStartedAt).toISOString(), endedAt: new Date().toISOString(), plannedMin: extra.plannedMin, focusedMin: extra.plannedMin, status: 'completed', category: category.trim(), note: note.trim() });
      notify(`Focus session complete — ${formatMinutes(extra.plannedMin)}. Time for a break.`, 'success');
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
      setNote('');
      if (breakMin > 0) t.load(startTimer(idleTimer(breakMin * 60_000), Date.now()), { phase: 'break', plannedMin: extra.plannedMin });
      else t.reset(extra.plannedMin * 60_000, { phase: 'work', plannedMin: extra.plannedMin });
    } else {
      notify('Break over. Ready for another session?', 'info');
      t.reset(extra.plannedMin * 60_000, { phase: 'work', plannedMin: extra.plannedMin });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status, timer.firstStartedAt]);

  const choose = (min: number) => {
    if (!Number.isFinite(min) || min < 1 || min > 240) return notify('Choose between 1 and 240 minutes.', 'error');
    setCustom(String(min));
    updatePrefs({ focusDefaults: { workMin: min, breakMin } });
    t.reset(min * 60_000, { phase: 'work', plannedMin: min });
  };
  const endSession = async () => {
    const focused = Math.floor(t.elapsed / 60_000);
    if (extra.phase === 'work' && timer.firstStartedAt && focused >= 1) {
      addFocusSession({ startedAt: new Date(timer.firstStartedAt).toISOString(), endedAt: new Date().toISOString(), plannedMin: extra.plannedMin, focusedMin: focused, status: 'ended-early', category: category.trim(), note: note.trim() });
      notify(`Session ended after ${formatMinutes(focused)}. Saved as ended early — it isn’t counted in your focus totals.`);
    }
    t.reset(extra.plannedMin * 60_000, { phase: 'work', plannedMin: extra.plannedMin });
  };
  const reset = async () => {
    if (t.elapsed > 60_000 && !(await confirmAction({ title: 'Reset this session?', body: 'The time so far won’t be saved. Use “End session” to keep a record.', confirmLabel: 'Reset' }))) return;
    t.reset(extra.plannedMin * 60_000, { phase: 'work', plannedMin: extra.plannedMin });
  };

  const ws = startOfWeek(today, data.prefs.weekStartsOn);
  const history = useMemo(() => [...data.focusSessions].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)), [data.focusSessions]);
  const pct = timer.durationMs ? t.elapsed / timer.durationMs : 0;
  const r = 120, c = 2 * Math.PI * r;
  const isBreak = extra.phase === 'break';
  const statusText = timer.status === 'idle' ? 'Ready' : timer.status === 'paused' ? 'Paused' : isBreak ? 'Break' : 'Focusing';

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader title="Focus timer" subtitle="Timing is based on the clock, so it stays accurate if you switch apps or reload." />
      <div className="stats-grid">
        <Stat label="Today" icon="timer" value={formatMinutes(focusMinutes(data.focusSessions, today, today))} />
        <Stat label="This week" icon="calendar" value={formatMinutes(focusMinutes(data.focusSessions, ws, today))} />
        <Stat label="Last week" icon="chart" value={formatMinutes(focusMinutes(data.focusSessions, addDays(ws, -7), addDays(ws, -1)))} />
      </div>

      <section className="card pad-lg" aria-labelledby="timer-h">
        <h2 id="timer-h" className="sr-only">Timer</h2>
        {timer.status === 'idle' && !isBreak && (
          <div className="stack-sm">
            <Segmented label="Session length" value={PRESETS.includes(extra.plannedMin) ? extra.plannedMin : 0} onChange={(m) => m && choose(m)} options={[...PRESETS.map((p) => ({ value: p, label: `${p} min` })), { value: 0, label: 'Custom' }]} />
            <div className="form-row three">
              <Field label="Work (minutes)">{(id) => <input id={id} type="number" min={1} max={240} value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => Number(custom) !== extra.plannedMin && choose(Number(custom))} />}</Field>
              <Field label="Break (minutes)">{(id) => <input id={id} type="number" min={0} max={60} value={breakMin} onChange={(e) => { const b = Number(e.target.value); if (Number.isFinite(b) && b >= 0 && b <= 60) updatePrefs({ focusDefaults: { workMin: extra.plannedMin, breakMin: b } }); }} />}</Field>
              <Field label="Category (optional)">{(id) => <input id={id} type="text" value={category} maxLength={40} placeholder="Study, work…" onChange={(e) => setCategory(e.target.value)} />}</Field>
            </div>
          </div>
        )}
        <div className="timer-face">
          <svg viewBox="0 0 260 260" aria-hidden="true">
            <circle cx="130" cy="130" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle cx="130" cy="130" r={r} fill="none" stroke={isBreak ? 'var(--info)' : 'var(--accent)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
          </svg>
          <div style={{ textAlign: 'center' }}>
            <div className="clock" role="timer">{formatClock(t.remaining)}</div>
            <div className="small muted" aria-live="polite">{statusText}{!isBreak ? ` · ${formatMinutes(extra.plannedMin)} session` : ''}</div>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          {timer.status === 'idle' && <button type="button" className="btn primary" onClick={t.start}><Icon name="play" size={16} />Start</button>}
          {timer.status === 'running' && <button type="button" className="btn" onClick={t.pause}><Icon name="pause" size={16} />Pause</button>}
          {timer.status === 'paused' && <button type="button" className="btn primary" onClick={t.start}><Icon name="play" size={16} />Resume</button>}
          {!isBreak && timer.status !== 'idle' && <button type="button" className="btn" onClick={reset}><Icon name="reset" size={16} />Reset</button>}
          {!isBreak && timer.status !== 'idle' && <button type="button" className="btn ghost" onClick={endSession}><Icon name="stop" size={16} />End session</button>}
          {isBreak && <button type="button" className="btn" onClick={() => t.reset(extra.plannedMin * 60_000, { phase: 'work', plannedMin: extra.plannedMin })}><Icon name="skip" size={16} />Skip break</button>}
        </div>
        {!isBreak && timer.status !== 'idle' && (
          <div style={{ maxWidth: 420, margin: '16px auto 0' }}>
            <Field label="Session note (optional)">{(id) => <input id={id} type="text" value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} />}</Field>
          </div>
        )}
      </section>

      <section aria-labelledby="hist-h">
        <div className="section-title"><h2 id="hist-h">History</h2></div>
        {history.length ? (
          <ul className="list">
            {history.slice(0, 30).map((s) => (
              <li key={s.id}>
                <span className={`icon-tile ${s.status === 'completed' ? 'accent' : ''}`}><Icon name={s.status === 'completed' ? 'circle-check' : 'circle-dashed'} /></span>
                <div className="grow">
                  <div className="title">{formatMinutes(s.focusedMin)}{s.status === 'ended-early' && <span className="badge warning" style={{ marginLeft: 8 }}>Ended early</span>}</div>
                  <div className="meta">
                    {formatDate(localDateOfIso(s.startedAt) ?? '', { weekday: 'short', day: 'numeric', month: 'short' })} · {new Date(s.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–{new Date(s.endedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    {s.category ? ` · ${s.category}` : ''}{s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
                <button type="button" className="icon-btn sm" aria-label="Delete session" onClick={async () => { if (await confirmAction({ title: 'Delete this session?', body: 'It will be removed from your history and totals.', confirmLabel: 'Delete', danger: true })) deleteFocusSession(s.id); }}><Icon name="trash" size={16} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="timer" title="No sessions yet">Completed sessions appear here and count towards your focus time.</EmptyState>
        )}
      </section>
    </div>
  );
}
