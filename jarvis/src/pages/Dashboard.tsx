import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { removeDemoData, updateSettings, useApp } from '../data/store';
import { computeInsights, insightKey } from '../services/insights';
import { eventsOn, isOpen, isOverdue, needsAttention, scheduleFor } from '../services/queries';
import { formatDateLong, formatTime, greetingFor, todayKey } from '../utils/dates';
import { Icon } from '../components/Icon';
import { confirmAction, DemoBadge, EmptyState } from '../components/ui';
import { openEditor } from '../components/editors';
import { ActivityRow, TaskRow } from '../components/rows';
import { VoiceButton, useVoiceToggle } from '../app/VoiceButton';
import { ACCEPT } from '../services/documents';
import { queuePrompt } from '../app/session';
import { notify } from '../services/notify';

export default function Dashboard() {
  const s = useApp();
  const navigate = useNavigate();
  const now = new Date();
  const today = todayKey(now);
  const [ask, setAsk] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const startVoice = useVoiceToggle();

  const insights = useMemo(
    () => computeInsights(s, now).filter((i) => !s.settings.dismissedInsights.includes(insightKey(i.id, today))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.tasks, s.projects, s.notes, s.events, s.reminders, s.settings.dismissedInsights, today],
  );
  const attention = useMemo(() => needsAttention(s.tasks, today).slice(0, 6), [s.tasks, today]);
  const schedule = useMemo(() => scheduleFor(s, today), [s, today]);
  const figures = [
    { label: 'Due today', v: s.tasks.filter((t) => isOpen(t) && t.dueDate === today).length, to: '/tasks?filter=today' },
    { label: 'Overdue', v: s.tasks.filter((t) => isOverdue(t, today)).length, to: '/tasks?filter=overdue', alert: true },
    { label: 'Open tasks', v: s.tasks.filter(isOpen).length, to: '/tasks' },
    { label: 'Active projects', v: s.projects.filter((p) => p.status === 'active').length, to: '/projects' },
    { label: 'Events today', v: eventsOn(s.events, today).length, to: '/calendar' },
    { label: 'Reminders', v: s.reminders.filter((r) => !r.done).length, to: '/reminders' },
  ];
  const hasDemo = s.settings.demoLoaded && [s.tasks, s.projects, s.notes, s.events].some((l) => l.some((x) => x.demo));
  const address = s.settings.address || s.settings.userName;
  const greeting = `${greetingFor(now.getHours())}${address ? `, ${address}` : ''}.`;
  const allClear = !insights.length && !attention.length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ask.trim()) return;
    queuePrompt({ text: ask.trim(), voice: false });
    navigate('/assistant');
  };
  const dismissInsight = (id: string) => updateSettings({ dismissedInsights: [...s.settings.dismissedInsights.filter((k) => k.startsWith(today)), insightKey(id, today)] });
  const removeDemo = async () => {
    if (!(await confirmAction({ title: 'Remove example data?', body: 'All records marked “Example” will be deleted. Your own data is kept.', confirmLabel: 'Remove', danger: true }))) return;
    await removeDemoData();
    notify('Example data removed.', 'success');
  };

  return (
    <div className="stack-lg">
      <section className="hero">
        <div>
          <p className="label">{formatDateLong(today)}</p>
          <h1 style={{ marginTop: 6 }}>{greeting}</h1>
          <p className="sub">{allClear ? 'Nothing urgent. Your workspace is in order.' : 'Here’s what needs your attention.'}</p>
        </div>
        <form className="ask-bar" onSubmit={submit} role="search" aria-label={`Ask ${s.settings.assistantName}`}>
          <Icon name="sparkles" className="faint" />
          <input type="text" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`Ask ${s.settings.assistantName}…`} aria-label={`Ask ${s.settings.assistantName}`} style={{ minWidth: 0 }} />
          <button type="submit" className="icon-btn" aria-label="Send" disabled={!ask.trim()}><Icon name="send" /></button>
          <span className="mobile-hide"><VoiceButton size={30} /></span>
        </form>
      </section>

      {hasDemo && (
        <div className="notice accent" role="note">
          <Icon name="info" />
          <div className="grow">You’re looking at example data, marked <DemoBadge show />. It shows how JARVIS works and can be removed in one step.</div>
          <button type="button" className="btn sm" onClick={() => void removeDemo()}>Remove example data</button>
        </div>
      )}

      <section aria-labelledby="overview-h">
        <h2 id="overview-h" className="sr-only">Overview</h2>
        <div className="figures">
          {figures.map((f) => (
            <Link key={f.label} to={f.to} className="figure">
              <div className={`v${f.alert && f.v > 0 ? ' alert' : ''}`}>{f.v}</div>
              <div className="label" style={{ marginTop: 4 }}>{f.label}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="cols-2">
        <section className="stack-sm" aria-labelledby="attention-h">
          <div className="section-head"><h2 id="attention-h">Needs attention</h2><Link to="/tasks" className="small">All tasks</Link></div>
          {insights.length > 0 && (
            <div className="panel flush">
              {insights.map((i) => (
                <div key={i.id} className={`insight ${i.level}`}>
                  <span className="bar" />
                  <div className="grow wrap">
                    {i.text}{' '}
                    {i.link && <Link to={i.link} className="small">View</Link>}
                  </div>
                  <button type="button" className="icon-btn sm" aria-label="Dismiss for today" onClick={() => void dismissInsight(i.id)}><Icon name="x" size={16} /></button>
                </div>
              ))}
            </div>
          )}
          {attention.length > 0 ? (
            <ul className="list panel flush">{attention.map((t) => <TaskRow key={t.id} task={t} />)}</ul>
          ) : (
            !insights.length && <EmptyState icon="circle-check" title="All clear">No overdue, urgent or soon-due tasks.</EmptyState>
          )}
        </section>

        <section className="stack-sm" aria-labelledby="today-h">
          <div className="section-head"><h2 id="today-h">Today</h2><Link to="/calendar" className="small">Calendar</Link></div>
          <div className="panel">
            {schedule.length ? (
              <ul className="timeline">
                {schedule.map((i) => (
                  <li key={`${i.kind}-${i.id}`}>
                    <span className="t">{i.time ? formatTime(i.time) : 'Any time'}</span>
                    <span className="wrap">
                      {i.kind === 'task' ? <span className="badge">Due</span> : i.kind === 'reminder' ? <span className="badge warn">Reminder</span> : null} {i.title}
                      {i.end && i.kind === 'event' && <span className="faint small"> until {formatTime(i.end)}</span>}
                      {i.detail && i.kind === 'event' && <span className="faint small"> · {i.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Nothing scheduled today.</p>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn sm" onClick={() => { queuePrompt({ text: 'Plan my day', voice: false }); navigate('/assistant'); }}><Icon name="sparkles" size={16} />Plan my day</button>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="quick-h" className="stack-sm">
        <h2 id="quick-h">Quick actions</h2>
        <div className="quick">
          <button type="button" className="btn" onClick={() => openEditor({ kind: 'task' })}><Icon name="task-plus" />New task</button>
          <button type="button" className="btn" onClick={() => openEditor({ kind: 'note' })}><Icon name="note" />New note</button>
          <button type="button" className="btn" onClick={() => openEditor({ kind: 'reminder' })}><Icon name="alarm" />New reminder</button>
          <button type="button" className="btn" onClick={() => openEditor({ kind: 'project' })}><Icon name="folder-plus" />New project</button>
          <Link to="/assistant" className="btn"><Icon name="message" />Ask {s.settings.assistantName}</Link>
          <button type="button" className="btn" onClick={startVoice}><Icon name="mic" />Start voice</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" />Upload document</button>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden aria-label="Upload a document" onChange={(e) => { const f = e.target.files?.[0]; if (f) navigate('/documents', { state: { file: f } }); e.target.value = ''; }} />
      </section>

      <section aria-labelledby="recent-h" className="stack-sm">
        <div className="section-head"><h2 id="recent-h">Recent activity</h2><Link to="/activity" className="small">All activity</Link></div>
        {s.activity.length ? (
          <ul className="list panel flush">{s.activity.slice(0, 6).map((a) => <ActivityRow key={a.id} a={a} />)}</ul>
        ) : (
          <p className="muted small">Nothing yet. Changes you and the assistant make appear here.</p>
        )}
      </section>
    </div>
  );
}
