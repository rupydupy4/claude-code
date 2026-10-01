import { useMemo, useState } from 'react';
import { useApp } from '../data/store';
import { scheduleFor, type ScheduleItem } from '../services/queries';
import { addDays, formatDateLong, formatTime, fromDateKey, startOfWeek, todayKey } from '../utils/dates';
import { Icon } from '../components/Icon';
import { PageHeader, Segmented } from '../components/ui';
import { openEditor } from '../components/editors';

type View = 'day' | 'week' | 'month';

function openItem(i: ScheduleItem) {
  openEditor(i.kind === 'event' ? { kind: 'event', id: i.id } : i.kind === 'task' ? { kind: 'task', id: i.id } : { kind: 'reminder', id: i.id });
}

const KIND_LABEL = { event: 'Event', task: 'Task due', reminder: 'Reminder' } as const;

function ItemButton({ i, compact }: { i: ScheduleItem; compact?: boolean }) {
  return (
    <button type="button" className={`ev ${i.kind}`} onClick={() => openItem(i)} aria-label={`${KIND_LABEL[i.kind]}: ${i.title}${i.time ? ` at ${formatTime(i.time)}` : ''}`}>
      <div className="tiny mono faint">{i.time ? formatTime(i.time) : 'Any time'}{i.end && !compact ? `–${formatTime(i.end)}` : ''}</div>
      <div className="wrap">{i.title}</div>
      {!compact && i.detail && i.kind === 'event' && <div className="tiny faint"><Icon name="pin" size={11} /> {i.detail}</div>}
    </button>
  );
}

export default function Calendar() {
  const s = useApp();
  const today = todayKey();
  const [view, setView] = useState<View>(() => (typeof matchMedia !== 'undefined' && matchMedia('(max-width: 599px)').matches ? 'day' : 'week'));
  const [cursor, setCursor] = useState(today);

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor };
    if (view === 'week') { const f = startOfWeek(cursor); return { from: f, to: addDays(f, 6) }; }
    const first = cursor.slice(0, 8) + '01';
    const f = startOfWeek(first);
    return { from: f, to: addDays(f, 41) };
  }, [view, cursor]);
  const items = useMemo(() => scheduleFor(s, range.from, range.to), [s, range]);
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [items]);

  const step = (dir: number) => {
    if (view === 'day') setCursor(addDays(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, 7 * dir));
    else {
      const d = fromDateKey(cursor);
      setCursor(todayKey(new Date(d.getFullYear(), d.getMonth() + dir, 1, 12)));
    }
  };
  const title =
    view === 'day' ? formatDateLong(cursor)
      : view === 'week' ? `${fromDateKey(range.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${fromDateKey(range.to).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : fromDateKey(cursor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const month = cursor.slice(0, 7);
  const dows = Array.from({ length: 7 }, (_, i) => fromDateKey(addDays(range.from, i)).toLocaleDateString(undefined, { weekday: 'short' }));

  return (
    <div className="stack">
      <PageHeader title="Calendar" subtitle="Events, task due dates and reminders together." actions={<button type="button" className="btn primary" onClick={() => openEditor({ kind: 'event', defaults: { date: cursor } })}><Icon name="calendar-plus" />New event</button>} />
      <div className="row between">
        <div className="row nowrap">
          <button type="button" className="icon-btn" aria-label="Previous" onClick={() => step(-1)}><Icon name="chevron-left" /></button>
          <button type="button" className="btn sm" onClick={() => setCursor(today)}>Today</button>
          <button type="button" className="icon-btn" aria-label="Next" onClick={() => step(1)}><Icon name="chevron-right" /></button>
          <h2 aria-live="polite" style={{ marginLeft: 6 }}>{title}</h2>
        </div>
        <Segmented<View> label="View" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </div>

      {view === 'day' && (
        <div className="panel stack-sm">
          {(byDay.get(cursor) ?? []).length ? (
            (byDay.get(cursor) ?? []).map((i) => <ItemButton key={`${i.kind}-${i.id}`} i={i} />)
          ) : (
            <p className="muted small">Nothing scheduled.</p>
          )}
          <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => openEditor({ kind: 'event', defaults: { date: cursor } })}><Icon name="plus" size={16} />Add event</button>
        </div>
      )}

      {view === 'week' && (
        <div className="week-cols">
          {Array.from({ length: 7 }, (_, i) => addDays(range.from, i)).map((d) => (
            <section key={d} className={`day-col${d === today ? ' today' : ''}`} aria-label={formatDateLong(d)}>
              <button type="button" className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setCursor(d); setView('day'); }}>
                <span className="label">{fromDateKey(d).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="num">{Number(d.slice(8))}</span>
              </button>
              {(byDay.get(d) ?? []).map((i) => <ItemButton key={`${i.kind}-${i.id}`} i={i} compact />)}
            </section>
          ))}
        </div>
      )}

      {view === 'month' && (
        <div className="cal-grid" role="grid" aria-label={title}>
          {dows.map((d) => <div key={d} className="dow" role="columnheader">{d}</div>)}
          {Array.from({ length: 42 }, (_, i) => addDays(range.from, i)).map((d) => {
            const list = byDay.get(d) ?? [];
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                className={`cal-cell${d.slice(0, 7) !== month ? ' other' : ''}${d === today ? ' today' : ''}`}
                onClick={() => { setCursor(d); setView('day'); }}
                aria-label={`${formatDateLong(d)}: ${list.length ? `${list.length} items` : 'nothing scheduled'}`}
              >
                <span className="d">{Number(d.slice(8))}</span>
                {list.slice(0, 3).map((i) => <span key={`${i.kind}-${i.id}`} className={`cal-pill${i.kind === 'event' ? '' : ' task'}`}>{i.title}</span>)}
                {list.length > 3 && <span className="tiny faint">+{list.length - 3} more</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="tiny faint">Tip: tell the assistant “Schedule a meeting with Sam on Friday at 3 PM” or “Move my meeting to 4 PM”.</p>
    </div>
  );
}
