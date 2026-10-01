import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, ProgressBar, Segmented, Stat } from '../components/ui';
import { BarSeries, Heatmap, LineSeries } from '../components/charts';
import { formatAmount } from '../components/habits';
import { useData, useToday } from '../hooks/useApp';
import { useHabitViews } from '../hooks/useHabits';
import { addDays, dateRange, diffDays, formatDate, isDateKey, startOfWeek } from '../utils/dates';
import { dayStatus, hasStatus } from '../utils/habitStats';
import { formatMinutes, localDateOfIso, plural } from '../utils/logic';
import { compareSentences, computeXp, dailySeries, describeAchievement, GLOBAL_ACHIEVEMENTS, levelFor, patternInsights, periodTotals } from '../utils/insights';

type Range = '7' | '30' | '90' | 'all' | 'custom';

export default function StatisticsPage() {
  const data = useData();
  const today = useToday();
  const views = useHabitViews(data, today, true);
  const [range, setRange] = useState<Range>('7');
  const [customFrom, setCustomFrom] = useState(addDays(today, -13));
  const [customTo, setCustomTo] = useState(today);
  const [habitId, setHabitId] = useState<string>('all');

  const earliest = useMemo(() => {
    const dates = [...data.events.map((e) => e.date), ...data.checkIns.map((c) => c.date), ...data.missionCompletions.map((c) => c.date), ...data.focusSessions.map((s) => localDateOfIso(s.startedAt) ?? today)];
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today;
  }, [data, today]);

  const validCustom = isDateKey(customFrom) && isDateKey(customTo) && customFrom <= customTo && diffDays(customFrom, customTo) <= 3660;
  const [start, end] = range === 'custom' ? (validCustom ? [customFrom, customTo] : [today, today]) : range === 'all' ? [earliest < today ? earliest : addDays(today, -6), today] : [addDays(today, -(Number(range) - 1)), today];
  const length = diffDays(start, end) + 1;
  const prevStart = addDays(start, -length), prevEnd = addDays(start, -1);
  const habitSet = habitId === 'all' ? undefined : new Set([habitId]);
  const selected = views.find((v) => v.habit.id === habitId);

  const series = useMemo(() => dailySeries(data, start, end, habitSet), [data, start, end, habitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = useMemo(() => periodTotals(data, start, end, habitSet), [data, start, end, habitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => periodTotals(data, prevStart, prevEnd, habitSet), [data, prevStart, prevEnd, habitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const comparisons = range === 'all' ? [] : compareSentences(cur, prev, length === 7 ? 'week' : `${length}-day period`).map((s) => s.replace(/last (\d+-day period)/, 'the previous $1'));
  const insights = useMemo(() => patternInsights(data, start, end), [data, start, end]);

  const statusViews = views.filter((v) => !v.habit.archived && hasStatus(v.habit));
  const successDays = statusViews.reduce((sum, v) => sum + dateRange(start, end).filter((d) => dayStatus(v.habit, v.idx, d) === 'met').length, 0);
  const sumMode = (mode: string) => views.filter((v) => v.habit.mode === mode && (!habitSet || habitSet.has(v.habit.id))).reduce((s, v) => s + dateRange(start, end).reduce((x, d) => x + (v.idx.totals.get(d) ?? 0), 0), 0);
  const timeSpent = sumMode('time');
  const replacementCount = sumMode('replacement');
  const goalsDone = data.goals.filter((g) => g.status === 'completed').length;
  const milestones = data.achievements.filter((a) => a.id.startsWith('milestone:')).length;
  const xp = computeXp(data);
  const level = levelFor(xp);

  const heat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.events) if (!habitSet || habitSet.has(e.habitId)) m.set(e.date, (m.get(e.date) ?? 0) + 1);
    for (const c of data.checkIns) if (!habitSet || habitSet.has(c.habitId)) m.set(c.date, (m.get(c.date) ?? 0) + 1);
    if (!habitSet) for (const c of data.missionCompletions) m.set(c.date, (m.get(c.date) ?? 0) + 1);
    return m;
  }, [data, habitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Weekly totals for the selected habit (or all events).
  const weekly = useMemo(() => {
    const ws = startOfWeek(start, data.prefs.weekStartsOn);
    const out: { week: string; total: number }[] = [];
    for (let w = ws; w <= end; w = addDays(w, 7)) {
      let total = 0;
      for (const p of series) if (p.date >= w && p.date < addDays(w, 7)) total += selected ? p.amount : p.events;
      out.push({ week: formatDate(w, { day: 'numeric', month: 'short' }), total: Math.round(total * 100) / 100 });
    }
    return out;
  }, [series, start, end, selected, data.prefs.weekStartsOn]);

  const hasData = data.events.length + data.checkIns.length + data.focusSessions.length + data.missionCompletions.length > 0;
  const earnedSet = new Set(data.achievements.map((a) => a.id));

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader title="Statistics" subtitle="Calculated on this device from your own records. Nothing is estimated or filled in." />

      <div className="card stack-sm">
        <div className="row">
          <Segmented label="Date range" value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All' }, { value: 'custom', label: 'Custom' }]} />
          <label className="field" style={{ minWidth: 200 }}>
            <span className="sr-only">Habit</span>
            <select value={habitId} onChange={(e) => setHabitId(e.target.value)} aria-label="Habit">
              <option value="all">All habits</option>
              {views.map((v) => <option key={v.habit.id} value={v.habit.id}>{v.habit.name}{v.habit.archived ? ' (archived)' : ''}</option>)}
            </select>
          </label>
        </div>
        {range === 'custom' && (
          <div className="form-row two">
            <label className="field"><span>From</span><input type="date" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} /></label>
            <label className="field"><span>To</span><input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} /></label>
            {!validCustom && <p className="small" role="alert" style={{ color: 'var(--danger)' }}>Choose a start date on or before the end date.</p>}
          </div>
        )}
        <p className="small faint">{formatDate(start, { day: 'numeric', month: 'short', year: 'numeric' })} – {formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })} · {plural(length, 'day')}</p>
      </div>

      {!hasData ? (
        <EmptyState icon="chart" title="No data yet" action={<Link className="btn primary" to="/library">Add a habit</Link>}>Statistics appear as soon as you log habits, missions or focus sessions.</EmptyState>
      ) : (
        <>
          <section aria-label="Overview" className="stats-grid six">
            <Stat label="Active habits" icon="target" value={views.filter((v) => !v.habit.archived).length} />
            <Stat label="Events recorded" icon="list" value={cur.events} hint="in this range" />
            {statusViews.length > 0 && <Stat label="Successful days" icon="circle-check" value={successDays} hint="across trackable habits" />}
            {timeSpent > 0 && <Stat label="Time on tracked habits" icon="clock" value={formatMinutes(timeSpent)} />}
            {replacementCount > 0 && <Stat label="Replacement activities" icon="sprout" value={replacementCount} />}
            <Stat label="Focus time" icon="timer" value={formatMinutes(cur.focus)} />
            <Stat label="Missions" icon="missions" value={cur.missionsDue ? `${Math.round((cur.missionsDone / cur.missionsDue) * 100)}%` : '—'} hint={cur.missionsDue ? `${cur.missionsDone} of ${cur.missionsDue}` : 'None scheduled'} />
            <Stat label="Goals completed" icon="goal" value={`${goalsDone}/${data.goals.length}`} />
            <Stat label="Milestones earned" icon="medal" value={milestones} />
          </section>

          {comparisons.length > 0 && (
            <section className="card stack-sm" aria-labelledby="cmp-h">
              <h2 id="cmp-h">Compared with the previous period</h2>
              {comparisons.map((c) => <p key={c} className="small">{c}</p>)}
              <p className="tiny faint">Whether more or less is better depends on your goal for each habit.</p>
            </section>
          )}

          <div className="grid grid-2">
            <section className="card" aria-labelledby="act-h">
              <h2 id="act-h" style={{ marginBottom: 8 }}>{selected ? `${selected.habit.name}: daily total` : 'Habit events per day'}</h2>
              <BarSeries
                data={series.map((p) => ({ label: p.label, value: selected ? Math.round(p.amount * 100) / 100 : p.events }))}
                xKey="label" yKey="value" name={selected ? (selected.habit.mode === 'time' ? 'Minutes' : 'Total') : 'Events'}
                description={`${selected ? selected.habit.name : 'All habits'}: activity per day from ${start} to ${end}`}
                reference={selected && selected.habit.goal.daily !== undefined && selected.habit.mode !== 'observation' ? { y: selected.habit.goal.daily, label: selected.habit.mode === 'replacement' ? 'Target' : 'Limit' } : undefined}
              />
            </section>
            <section className="card" aria-labelledby="wk-h">
              <h2 id="wk-h" style={{ marginBottom: 8 }}>Weekly trend</h2>
              <BarSeries data={weekly} xKey="week" yKey="total" name={selected ? 'Weekly total' : 'Events'} color="var(--chart-2)" description={`Weekly totals from ${start} to ${end}`} reference={selected && selected.habit.goal.weekly !== undefined ? { y: selected.habit.goal.weekly, label: 'Weekly goal' } : undefined} />
            </section>
            <section className="card" aria-labelledby="focus-h">
              <h2 id="focus-h" style={{ marginBottom: 8 }}>Focus time (minutes)</h2>
              <BarSeries data={series.map((p) => ({ label: p.label, value: p.focus }))} xKey="label" yKey="value" name="Focus" unit=" min" color="var(--chart-3)" description={`Completed focus minutes per day from ${start} to ${end}`} />
            </section>
            <section className="card" aria-labelledby="mis-h">
              <h2 id="mis-h" style={{ marginBottom: 8 }}>Mission completion</h2>
              <LineSeries data={series.map((p) => ({ label: p.label, done: p.missionsDone, due: p.missionsDue }))} xKey="label" lines={[{ key: 'done', name: 'Completed', color: 'var(--chart-1)' }, { key: 'due', name: 'Scheduled', color: 'var(--chart-4)' }]} description={`Missions completed and scheduled per day from ${start} to ${end}`} />
            </section>
          </div>

          <section className="card" aria-labelledby="heat-h">
            <h2 id="heat-h" style={{ marginBottom: 10 }}>Activity calendar</h2>
            <Heatmap values={heat} end={today} weekStartsOn={data.prefs.weekStartsOn} label={selected ? selected.habit.name : 'All tracking activity'} />
          </section>

          {statusViews.length > 0 && (
            <section aria-labelledby="streak-h">
              <div className="section-title"><h2 id="streak-h">Streaks</h2></div>
              <ul className="list">
                {statusViews.map((v) => (
                  <li key={v.habit.id}>
                    <div className="grow"><Link to={`/habits/${v.habit.id}`} className="title" style={{ color: 'inherit' }}>{v.habit.name}</Link><div className="meta">Best {plural(v.summary.best, 'day')} · {plural(v.summary.successDays, 'successful day')} in total</div></div>
                    <span className="badge accent num"><Icon name="flame" size={12} />{plural(v.summary.current, 'day')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {selected && selected.habit.mode !== 'abstinence' && selected.habit.mode !== 'observation' && (
            <p className="small muted">Range total for {selected.habit.name}: <strong>{formatAmount(selected.habit, series.reduce((s, p) => s + p.amount, 0))}</strong></p>
          )}

          <section className="card" aria-labelledby="ins-h">
            <h2 id="ins-h">Patterns in this period</h2>
            <p className="small faint" style={{ margin: '4px 0 12px' }}>Things that were recorded together — not proof that one causes the other.</p>
            {insights.total === 0 ? <p className="muted small">No habit events in this range.</p> : (
              <div className="grid grid-2">
                <div>
                  <h3 className="small">Most-selected triggers</h3>
                  {insights.topTriggers.length ? (
                    <div className="stack-sm" style={{ marginTop: 8 }}>
                      {insights.topTriggers.map((t) => (
                        <div key={t.id}><div className="row between small"><span>{t.label}</span><span className="num">{t.count}</span></div><ProgressBar value={t.count / insights.topTriggers[0].count} label={`${t.label}: ${t.count}`} /></div>
                      ))}
                    </div>
                  ) : <p className="small faint">No triggers recorded in this range.</p>}
                </div>
                <div>
                  <h3 className="small">Time of day</h3>
                  <div className="stack-sm" style={{ marginTop: 8 }}>
                    {insights.partsOfDay.map((p) => (
                      <div key={p.part}><div className="row between small"><span>{p.part}</span><span className="num">{p.count}</span></div><ProgressBar value={p.count / Math.max(1, ...insights.partsOfDay.map((x) => x.count))} label={`${p.part}: ${p.count}`} /></div>
                    ))}
                  </div>
                </div>
                {insights.topHabit && <p className="small">Habit with the most records: <strong>{insights.topHabit.habit.name}</strong> ({insights.topHabit.count})</p>}
                {insights.helpfulActivities.length > 0 && <p className="small">Reset activities you said helped: {insights.helpfulActivities.map((a) => `${a.title} (${a.count})`).join(', ')}</p>}
              </div>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="ach-h">
        <div className="section-title">
          <h2 id="ach-h">Achievements</h2>
          {data.prefs.gamification && <span className="badge accent"><Icon name="star" size={12} />Level {level.level} · {xp} XP</span>}
        </div>
        {data.prefs.gamification && (
          <div className="card stack-sm" style={{ marginBottom: 12 }}>
            <div className="row between small"><span>Progress to level {level.level + 1}</span><span className="num faint">{level.into}/{level.needed} XP</span></div>
            <ProgressBar value={level.into / level.needed} label="Level progress" />
            <p className="tiny faint">XP comes from check-ins, missions, focus sessions, reflections and replacement activities, with daily caps. It’s never awarded for the habits you are cutting down.</p>
          </div>
        )}
        <div className="grid grid-3">
          {GLOBAL_ACHIEVEMENTS.map((a) => {
            const earned = earnedSet.has(a.id);
            return (
              <div key={a.id} className="card row nowrap" style={{ opacity: earned ? 1 : 0.55 }}>
                <span className={`icon-tile ${earned ? 'accent' : ''}`}><Icon name={earned ? a.icon : 'lock'} /></span>
                <div className="grow"><strong className="small">{a.title}</strong><div className="tiny muted">{a.description}</div></div>
                <span className="sr-only">{earned ? 'Earned' : 'Not yet earned'}</span>
              </div>
            );
          })}
          {data.achievements.filter((a) => a.id.startsWith('milestone:')).map((a) => {
            const d = describeAchievement(a.id, data.habits);
            return (
              <div key={a.id} className="card row nowrap">
                <span className="icon-tile accent"><Icon name="medal" /></span>
                <div className="grow"><strong className="small">{d.title}</strong><div className="tiny muted">{d.description} · {formatDate(a.earnedAt.slice(0, 10))}</div></div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
