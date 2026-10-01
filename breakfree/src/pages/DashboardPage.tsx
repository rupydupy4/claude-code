import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Habit } from '../models/types';
import { MESSAGES } from '../data/content';
import { Icon } from '../components/Icon';
import { EmptyState, Modal, ProgressBar, Stat } from '../components/ui';
import { CheckInDialog, HabitCard, LogEventDialog } from '../components/habits';
import { useData, useToday } from '../hooks/useApp';
import { useHabitViews } from '../hooks/useHabits';
import { addDays, diffDays, formatDate, startOfWeek } from '../utils/dates';
import { hasStatus } from '../utils/habitStats';
import { completionKey, completionSet, focusMinutes, formatMinutes, goalProgress, isMissionDue, localDateOfIso, plural } from '../utils/logic';
import { compareSentences, computeXp, levelFor, periodTotals } from '../utils/insights';
import { toggleMission } from '../services/store';

type DialogState = { kind: 'log'; habitId?: string } | { kind: 'checkin'; habit: Habit } | { kind: 'pick' } | null;

export default function DashboardPage() {
  const data = useData();
  const today = useToday();
  const navigate = useNavigate();
  const views = useHabitViews(data, today);
  const [dialog, setDialog] = useState<DialogState>(null);
  const { prefs } = data;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const message = MESSAGES[Math.abs(diffDays('2024-01-01', today)) % MESSAGES.length];

  const ws = startOfWeek(today, prefs.weekStartsOn);
  const done = useMemo(() => completionSet(data.missionCompletions), [data.missionCompletions]);
  const dueToday = data.missions.filter((m) => isMissionDue(m, today));
  const week = useMemo(() => periodTotals(data, ws, today), [data, ws, today]);
  const elapsed = diffDays(ws, today);
  const lastWeek = useMemo(() => periodTotals(data, addDays(ws, -7), addDays(ws, -7 + elapsed)), [data, ws, elapsed]);
  const comparisons = compareSentences(week, lastWeek, 'week');

  const statusHabits = views.filter((v) => hasStatus(v.habit));
  const checkedToday = data.checkIns.filter((c) => c.date === today && views.some((v) => v.habit.id === c.habitId)).length;
  const activeStreaks = views.filter((v) => v.summary.current > 0).length;
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const progressing = activeGoals.filter((g) => goalProgress(g) > 0).length;
  const focusToday = focusMinutes(data.focusSessions, today, today);
  const focusWeek = focusMinutes(data.focusSessions, ws, today);
  const missionPct = week.missionsDue ? Math.round((week.missionsDone / week.missionsDue) * 100) : null;
  const trackedThisWeek = views.filter((v) => Array.from(v.idx.totals.keys()).some((d) => d >= ws) || Array.from(v.idx.checkIns.keys()).some((d) => d >= ws)).length;
  const sessionsToday = data.focusSessions.filter((s) => localDateOfIso(s.startedAt) === today);
  const xp = prefs.gamification ? levelFor(computeXp(data)) : null;
  const hasAnything = data.habits.length + data.missions.length + data.goals.length + data.journal.length + data.focusSessions.length > 0;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow">
          <div className="eyebrow">{formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greeting}{prefs.name ? `, ${prefs.name}` : ''}</h1>
          <p className="muted">{message}</p>
        </div>
        <div className="row">
          <Link to="/privacy" className="badge success" style={{ textDecoration: 'none' }}><Icon name="lock" size={12} />Private · on this device</Link>
          <Link to="/settings" className="icon-btn desktop-only" aria-label="Settings"><Icon name="settings" /></Link>
        </div>
      </header>

      <section aria-label="Summary" className="stats-grid six">
        <Stat label="Active habits" icon="target" value={views.length} hint={data.habits.length > views.length ? `${data.habits.length - views.length} archived` : undefined} />
        <Stat label="Check-ins today" icon="check" value={statusHabits.length ? `${checkedToday}/${statusHabits.length}` : '—'} hint={statusHabits.length ? undefined : 'No habits with check-ins'} />
        <Stat label="Goals progressing" icon="goal" value={activeGoals.length ? `${progressing}/${activeGoals.length}` : '—'} hint={activeGoals.length ? undefined : 'No active goals'} />
        <Stat label="Active streaks" icon="flame" value={activeStreaks} hint={statusHabits.length ? `of ${statusHabits.length} trackable` : undefined} />
        <Stat label="Focus time" icon="timer" value={formatMinutes(focusToday)} hint={`${formatMinutes(focusWeek)} this week`} />
        <Stat label="Missions this week" icon="missions" value={missionPct === null ? '—' : `${missionPct}%`} hint={week.missionsDue ? `${week.missionsDone} of ${week.missionsDue} done` : 'None scheduled'} />
      </section>

      <section aria-labelledby="qa">
        <h2 id="qa" className="sr-only">Quick actions</h2>
        <div className="scroll-x">
          <button type="button" className="btn" onClick={() => setDialog({ kind: 'log' })}><Icon name="plus" size={16} />Log an event</button>
          <button type="button" className="btn" onClick={() => setDialog({ kind: 'pick' })}><Icon name="check" size={16} />Check in</button>
          <Link className="btn" to="/focus"><Icon name="timer" size={16} />Start focus</Link>
          <Link className="btn" to="/toolkit"><Icon name="lifebuoy" size={16} />Urge toolkit</Link>
          <Link className="btn" to="/missions?new=1"><Icon name="missions" size={16} />Add mission</Link>
          <Link className="btn" to="/library"><Icon name="library" size={16} />Add habit</Link>
          <Link className="btn" to="/journal?new=1"><Icon name="journal" size={16} />Journal</Link>
        </div>
      </section>

      {!hasAnything && (
        <div className="card pad-lg stack-sm">
          <h2>Welcome to BREAKFREE</h2>
          <p className="muted">Start by choosing a habit to work on. You can quit it, cut down, limit time, build an alternative, or just observe it for a while.</p>
          <div className="row"><Link className="btn primary" to="/library">Browse the habit library</Link><Link className="btn" to="/habits?custom=1">Create a custom habit</Link></div>
        </div>
      )}

      <section aria-labelledby="habits-h">
        <div className="section-title" style={{ marginTop: 0 }}>
          <h2 id="habits-h">Your habits</h2>
          <Link to="/habits" className="btn ghost sm">All habits<Icon name="chevron-right" size={16} /></Link>
        </div>
        {views.length ? (
          <div className="grid grid-3">
            {views.map((v) => (
              <HabitCard key={v.habit.id} habit={v.habit} summary={v.summary} onLog={() => setDialog({ kind: 'log', habitId: v.habit.id })} onCheckIn={() => setDialog({ kind: 'checkin', habit: v.habit })} />
            ))}
          </div>
        ) : (
          <EmptyState icon="target" title="No active habits yet" action={<Link className="btn primary" to="/library">Choose a habit</Link>}>
            Add a habit from the library or create your own. Each one gets its own tracking method, history and statistics.
          </EmptyState>
        )}
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="today-h">
          <div className="card-head"><h2 id="today-h">Today</h2><Link to="/missions" className="btn ghost sm">Missions</Link></div>
          {dueToday.length === 0 && sessionsToday.length === 0 && statusHabits.length === 0 ? (
            <p className="muted small">Nothing planned yet. Add a mission or start a focus session.</p>
          ) : (
            <div className="stack-sm">
              {dueToday.map((m) => {
                const isDone = done.has(completionKey(m.id, today));
                return (
                  <label key={m.id} className="check">
                    <input type="checkbox" checked={isDone} onChange={(e) => toggleMission(m.id, today, e.target.checked)} />
                    <span className={isDone ? 'done-text' : ''}>{m.title}{m.preferredTime ? <span className="faint small"> · {m.preferredTime}</span> : null}</span>
                  </label>
                );
              })}
              {statusHabits.map((v) => {
                const ci = v.idx.checkIns.get(today);
                return (
                  <div key={v.habit.id} className="row nowrap small">
                    <Icon name={ci ? 'circle-check' : 'circle'} size={16} className={ci ? '' : 'faint'} />
                    <span className="grow truncate">{v.habit.name}</span>
                    <button type="button" className="btn ghost sm" onClick={() => setDialog({ kind: 'checkin', habit: v.habit })}>{ci ? 'Edit check-in' : 'Check in'}</button>
                  </div>
                );
              })}
              {sessionsToday.length > 0 && (
                <p className="small muted"><Icon name="timer" size={14} /> {plural(sessionsToday.filter((s) => s.status === 'completed').length, 'focus session')} completed today</p>
              )}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="week-h">
          <div className="card-head"><h2 id="week-h">This week</h2><Link to="/stats" className="btn ghost sm">Statistics</Link></div>
          <ul className="stack-sm small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li className="row between"><span className="muted">Habits tracked</span><strong className="num">{trackedThisWeek} of {views.length}</strong></li>
            <li className="row between"><span className="muted">Habit events logged</span><strong className="num">{week.events}</strong></li>
            <li className="row between"><span className="muted">Missions completed</span><strong className="num">{week.missionsDone}{week.missionsDue ? ` of ${week.missionsDue}` : ''}</strong></li>
            <li className="row between"><span className="muted">Focus time</span><strong className="num">{formatMinutes(week.focus)}</strong></li>
            {activeGoals.length > 0 && <li className="row between"><span className="muted">Average goal progress</span><strong className="num">{Math.round((activeGoals.reduce((s, g) => s + goalProgress(g), 0) / activeGoals.length) * 100)}%</strong></li>}
          </ul>
          {comparisons.length > 0 ? (
            <div className="stack-sm" style={{ marginTop: 12 }}>
              <div className="eyebrow">Compared with the same days last week</div>
              {comparisons.map((c) => <p key={c} className="small">{c}</p>)}
            </div>
          ) : (
            <p className="small faint" style={{ marginTop: 12 }}>Comparisons appear once you have records from last week too.</p>
          )}
          {xp && (
            <div style={{ marginTop: 14 }} className="stack-sm">
              <div className="row between small"><span><Icon name="star" size={14} /> Level {xp.level}</span><span className="faint num">{xp.into}/{xp.needed} XP</span></div>
              <ProgressBar value={xp.into / xp.needed} label={`Level ${xp.level} progress`} />
            </div>
          )}
        </section>
      </div>

      {dialog?.kind === 'log' && <LogEventDialog open onClose={() => setDialog(null)} habitId={dialog.habitId} />}
      {dialog?.kind === 'checkin' && <CheckInDialog open onClose={() => setDialog(null)} habit={dialog.habit} />}
      {dialog?.kind === 'pick' && (
        <Modal open title="Check in for…" onClose={() => setDialog(null)}>
          {statusHabits.length ? (
            <ul className="list">
              {statusHabits.map((v) => (
                <li key={v.habit.id}>
                  <span className="grow title">{v.habit.name}</span>
                  <button type="button" className="btn sm" onClick={() => setDialog({ kind: 'checkin', habit: v.habit })}>Check in</button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="stack-sm">
              <p className="muted">None of your habits use check-ins yet. Observation habits don’t have a success or failure state.</p>
              <button type="button" className="btn primary" onClick={() => navigate('/library')}>Add a habit</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
