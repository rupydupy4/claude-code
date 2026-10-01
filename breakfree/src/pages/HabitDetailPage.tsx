import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { DateKey, HabitEvent } from '../models/types';
import { categoryById, modeById, triggerLabel } from '../data/categories';
import { templateById } from '../data/habitTemplates';
import { Icon } from '../components/Icon';
import { confirmAction, EmptyState, PageHeader, Stat, StatusMark } from '../components/ui';
import { CheckInDialog, formatAmount, HabitForm, LogEventDialog, MonthCalendar, targetText, unitFor } from '../components/habits';
import { useData, useToday } from '../hooks/useApp';
import { indexHabit, hasStatus, summarizeHabit } from '../utils/habitStats';
import { formatDate, formatTime, lastNDays } from '../utils/dates';
import { plural } from '../utils/logic';
import { deleteEvent, setHabitArchived } from '../services/store';
import { notify } from '../services/notify';
import { confirmDeleteHabit } from './HabitsPage';

const Charts = lazy(() => import('../components/charts').then((m) => ({ default: m.BarSeries })));

type Dialog = { kind: 'log'; event?: HabitEvent } | { kind: 'checkin'; date?: DateKey } | { kind: 'edit' } | null;

export default function HabitDetailPage() {
  const { id } = useParams();
  const data = useData();
  const today = useToday();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showAll, setShowAll] = useState(false);
  const habit = data.habits.find((h) => h.id === id);
  const idx = useMemo(() => (habit ? indexHabit(habit.id, data.checkIns, data.events) : null), [habit, data.checkIns, data.events]);

  if (!habit || !idx) {
    return <EmptyState icon="search" title="Habit not found" action={<Link className="btn" to="/habits">Back to My Habits</Link>}>It may have been deleted.</EmptyState>;
  }
  const s = summarizeHabit(habit, idx, today, data.prefs.weekStartsOn);
  const mode = modeById(habit.mode);
  const tpl = templateById(habit.templateId);
  const statusful = hasStatus(habit);
  const linked = data.habits.find((h) => h.id === habit.linkedHabitId);
  const linkedFrom = data.habits.filter((h) => h.linkedHabitId === habit.id);
  const last14 = lastNDays(14, today).map((d) => ({ day: formatDate(d, { day: 'numeric', month: 'short' }), value: Math.round((idx.totals.get(d) ?? 0) * 100) / 100 }));
  const triggerCounts = Array.from(
    idx.events.reduce((m, e) => (e.trigger ? m.set(e.trigger, (m.get(e.trigger) ?? 0) + 1) : m), new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);
  const events = showAll ? idx.events : idx.events.slice(0, 15);
  const earned = data.achievements.filter((a) => a.id.startsWith(`milestone:${habit.id}:`)).map((a) => Number(a.id.split(':')[2])).sort((a, b) => a - b);
  const nextMilestone = habit.milestones.find((m) => m > s.best);

  const primary = habit.mode === 'abstinence'
    ? <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'checkin' })}><Icon name="check" size={16} />Complete today’s check-in</button>
    : <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'log' })}><Icon name="plus" size={16} />{mode.logLabel}</button>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div><Link to="/habits" className="btn ghost sm"><Icon name="chevron-left" size={16} />My Habits</Link></div>
      <PageHeader
        eyebrow={`${categoryById(habit.category).name} · ${mode.name}`}
        title={habit.name}
        subtitle={habit.description || undefined}
        actions={
          <>
            {primary}
            {habit.mode === 'abstinence' ? (
              <button type="button" className="btn" onClick={() => setDialog({ kind: 'log' })}>Record an occurrence</button>
            ) : statusful ? (
              <button type="button" className="btn" onClick={() => setDialog({ kind: 'checkin' })}>Check in</button>
            ) : null}
            <Link className="btn" to={`/journal?new=1&habit=${habit.id}`}><Icon name="journal" size={16} />Add a reflection</Link>
          </>
        }
      />
      {habit.archived && <div className="notice warn"><Icon name="archive" /><span>This habit is archived. Its history is kept; restore it to track it again.</span></div>}
      {tpl?.caution && <div className="notice warn" role="note"><Icon name="warning" /><span>{tpl.caution}</span></div>}
      {tpl?.guidance && <div className="notice" role="note"><Icon name="info" /><span>{tpl.guidance}</span></div>}

      <div className="card stack-sm">
        <div className="row between"><span className="muted small">Your target</span>{statusful && <StatusMark status={s.status} text={`Today: ${{ met: 'goal met', partial: 'partly met', notMet: 'not met', none: 'no entry yet', 'n/a': '' }[s.status]}`} />}</div>
        <strong>{targetText(habit)}</strong>
        {habit.alternative && <p className="small muted"><Icon name="sprout" size={14} /> Alternative: {habit.alternative}</p>}
      </div>

      <section aria-label="Statistics" className="stats-grid">
        {statusful && <Stat label={habit.mode === 'abstinence' ? 'Current streak' : 'Days in a row on target'} icon="flame" value={plural(s.current, 'day')} />}
        {statusful && <Stat label="Best streak" icon="trophy" value={plural(s.best, 'day')} />}
        {statusful && <Stat label="Successful days" icon="circle-check" value={s.successDays} />}
        {habit.mode !== 'abstinence' && <Stat label="Today" icon="calendar" value={habit.mode === 'observation' ? plural(idx.counts.get(today) ?? 0, 'entry', 'entries') : formatAmount(habit, s.todayTotal)} />}
        {habit.mode !== 'abstinence' && (
          <Stat label="This week" icon="chart" value={habit.mode === 'observation' ? plural(s.weekTotal, 'entry', 'entries') : formatAmount(habit, s.weekTotal)} hint={s.lastWeekTotal || s.weekTotal ? `Same point last week: ${habit.mode === 'observation' ? s.lastWeekTotal : formatAmount(habit, s.lastWeekTotal)}` : undefined} />
        )}
        <Stat label="Total entries" icon="list" value={s.eventCount} hint={s.daysSinceLast === null ? 'None yet' : s.daysSinceLast === 0 ? 'Last: today' : `Last: ${plural(s.daysSinceLast, 'day')} ago`} />
      </section>

      {statusful && habit.milestones.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Milestones</h2>{nextMilestone && <span className="small faint">Next: {nextMilestone} days in a row</span>}</div>
          <div className="chips">
            {habit.milestones.map((m) => (
              <span key={m} className={`badge ${earned.includes(m) ? 'accent' : ''}`}>
                <Icon name={earned.includes(m) ? 'medal' : 'circle'} size={12} />{m} {m === 1 ? 'day' : 'days'}
              </span>
            ))}
          </div>
          <p className="small faint" style={{ marginTop: 8 }}>Milestones you reach stay earned, even after a setback.</p>
        </div>
      )}

      <div className="grid grid-2">
        <section className="card" aria-labelledby="cal-h">
          <h2 id="cal-h" style={{ marginBottom: 10 }}>History</h2>
          <MonthCalendar habit={habit} idx={idx} weekStartsOn={data.prefs.weekStartsOn} onPick={statusful ? (d) => setDialog({ kind: 'checkin', date: d }) : undefined} />
          {statusful && <p className="small faint" style={{ marginTop: 8 }}>Tap a day to add or correct its check-in. Days without an entry aren’t counted as failures.</p>}
        </section>
        <section className="card" aria-labelledby="trend-h">
          <h2 id="trend-h" style={{ marginBottom: 10 }}>Last 14 days</h2>
          {s.eventCount ? (
            <Suspense fallback={<div className="chart-box" />}>
              <Charts
                data={last14}
                xKey="day"
                yKey="value"
                name={habit.mode === 'time' ? 'Minutes' : habit.mode === 'quantity' ? unitFor(habit) : 'Entries'}
                description={`${habit.name}: daily totals for the last 14 days`}
                reference={habit.goal.daily !== undefined && habit.mode !== 'observation' ? { y: habit.goal.daily, label: habit.mode === 'replacement' ? 'Target' : 'Limit' } : undefined}
              />
            </Suspense>
          ) : (
            <p className="muted small">Your daily totals will appear here once you log entries.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="events-h">
        <div className="section-title"><h2 id="events-h">Recent entries</h2><span className="small faint">{plural(idx.events.length, 'entry', 'entries')}</span></div>
        {events.length ? (
          <>
            <ul className="list">
              {events.map((e) => (
                <li key={e.id}>
                  <div className="grow">
                    <div className="title">
                      {formatDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatTime(e.time)}
                      {habit.mode !== 'abstinence' && habit.mode !== 'observation' && <span className="muted"> — {formatAmount(habit, e.amount)}</span>}
                    </div>
                    <div className="meta wrap">
                      {[e.trigger && triggerLabel(e.trigger), e.intensity && `intensity ${e.intensity}/5`, e.context, e.note].filter(Boolean).join(' · ') || 'No details'}
                    </div>
                  </div>
                  <button type="button" className="icon-btn sm" aria-label="Edit entry" onClick={() => setDialog({ kind: 'log', event: e })}><Icon name="edit" size={16} /></button>
                  <button type="button" className="icon-btn sm" aria-label="Delete entry" onClick={async () => {
                    if (await confirmAction({ title: 'Delete this entry?', body: 'This permanently removes the entry and updates your statistics.', confirmLabel: 'Delete', danger: true })) {
                      deleteEvent(e.id);
                      notify('Entry deleted.');
                    }
                  }}><Icon name="trash" size={16} /></button>
                </li>
              ))}
            </ul>
            {idx.events.length > 15 && <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${idx.events.length}`}</button>}
          </>
        ) : (
          <EmptyState icon="list" title="No entries yet" action={primary}>
            {habit.mode === 'abstinence' ? 'Check in each day to build your streak. If the behaviour happens, you can record it honestly — your previous days still count.' : 'Log your first entry to start seeing patterns.'}
          </EmptyState>
        )}
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="trig-h">
          <h2 id="trig-h" style={{ marginBottom: 10 }}>Trigger history</h2>
          {triggerCounts.length ? (
            <ul className="stack-sm small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {triggerCounts.map(([t, n]) => <li key={t} className="row between"><span>{triggerLabel(t as never)}</span><strong className="num">{n}</strong></li>)}
            </ul>
          ) : (
            <p className="muted small">When you log an entry you can note what was going on. Patterns will show here — they are observations, not proof of a cause.</p>
          )}
          {habit.triggers.length > 0 && <p className="small faint" style={{ marginTop: 10 }}>Watching for: {habit.triggers.map((t) => triggerLabel(t)).join(', ')}</p>}
        </section>
        <section className="card stack-sm" aria-labelledby="more-h">
          <h2 id="more-h">Links and notes</h2>
          {linked && <p className="small">Linked habit: <Link to={`/habits/${linked.id}`}>{linked.name}</Link></p>}
          {linkedFrom.map((h) => <p key={h.id} className="small">Linked from: <Link to={`/habits/${h.id}`}>{h.name}</Link></p>)}
          {!linked && !linkedFrom.length && <p className="small faint">No linked habits. Link a replacement habit in Edit settings.</p>}
          <p className="small wrap" style={{ whiteSpace: 'pre-wrap' }}>{habit.notes || <span className="faint">No notes.</span>}</p>
          <p className="small faint">Started {formatDate(habit.startDate, { day: 'numeric', month: 'long', year: 'numeric' })}{habit.reminder.enabled ? ` · Reminder at ${habit.reminder.time}` : ''}</p>
        </section>
      </div>

      <div className="row">
        <button type="button" className="btn" onClick={() => setDialog({ kind: 'edit' })}><Icon name="settings" size={16} />Edit settings</button>
        <button type="button" className="btn" onClick={() => { setHabitArchived(habit.id, !habit.archived); notify(habit.archived ? 'Habit restored.' : 'Habit archived. Its history is kept.'); }}>
          <Icon name={habit.archived ? 'restore' : 'archive'} size={16} />{habit.archived ? 'Restore' : 'Archive'}
        </button>
        <button type="button" className="btn danger" onClick={async () => { if (await confirmDeleteHabit(habit, idx.events.length, idx.checkIns.size)) navigate('/habits'); }}>
          <Icon name="trash" size={16} />Delete
        </button>
      </div>

      {dialog?.kind === 'log' && <LogEventDialog open onClose={() => setDialog(null)} habitId={habit.id} event={dialog.event} />}
      {dialog?.kind === 'checkin' && <CheckInDialog open onClose={() => setDialog(null)} habit={habit} date={dialog.date} />}
      {dialog?.kind === 'edit' && <HabitForm open onClose={() => setDialog(null)} habit={habit} template={tpl} />}
    </div>
  );
}
