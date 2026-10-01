import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Habit } from '../models/types';
import { categoryById, modeById } from '../data/categories';
import { Icon } from '../components/Icon';
import { confirmAction, EmptyState, PageHeader, Segmented } from '../components/ui';
import { CheckInDialog, HabitCard, HabitForm, LogEventDialog } from '../components/habits';
import { useData, useToday } from '../hooks/useApp';
import { useHabitViews } from '../hooks/useHabits';
import { deleteHabit, setHabitArchived } from '../services/store';
import { notify } from '../services/notify';
import { plural } from '../utils/logic';

type Dialog = { kind: 'log'; habitId: string } | { kind: 'checkin'; habit: Habit } | { kind: 'custom' } | null;

export async function confirmDeleteHabit(habit: Habit, eventCount: number, checkInCount: number): Promise<boolean> {
  const ok = await confirmAction({
    title: `Delete “${habit.name}”?`,
    body: (
      <>
        This permanently removes the habit together with {plural(eventCount, 'logged event')} and {plural(checkInCount, 'check-in')}. Journal entries and goals linked to it are kept but unlinked.
        <br /><br />If you might want it later, archive it instead.
      </>
    ),
    confirmLabel: 'Delete permanently',
    danger: true,
  });
  if (ok) {
    deleteHabit(habit.id);
    notify(`${habit.name} deleted.`);
  }
  return ok;
}

export default function HabitsPage() {
  const data = useData();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const all = useHabitViews(data, today, true);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [dialog, setDialog] = useState<Dialog>(null);
  useEffect(() => {
    if (params.get('custom') === '1') {
      setDialog({ kind: 'custom' });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const active = all.filter((v) => !v.habit.archived);
  const archived = all.filter((v) => v.habit.archived);

  return (
    <div>
      <PageHeader
        title="My Habits"
        subtitle="Each habit is tracked on its own terms — its own method, goal and history."
        actions={
          <>
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'custom' })}><Icon name="pen" size={16} />Custom habit</button>
            <Link className="btn primary" to="/library"><Icon name="plus" size={16} />Add from library</Link>
          </>
        }
      />
      <div style={{ marginBottom: 16 }}>
        <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'active', label: `Active (${active.length})` }, { value: 'archived', label: `Archived (${archived.length})` }]} />
      </div>

      {tab === 'active' &&
        (active.length ? (
          <div className="grid grid-3">
            {active.map((v) => (
              <HabitCard key={v.habit.id} habit={v.habit} summary={v.summary} onLog={() => setDialog({ kind: 'log', habitId: v.habit.id })} onCheckIn={() => setDialog({ kind: 'checkin', habit: v.habit })} />
            ))}
          </div>
        ) : (
          <EmptyState icon="target" title="No active habits" action={<Link className="btn primary" to="/library">Browse the library</Link>}>
            Pick something you want to quit, reduce, limit, replace or simply observe.
          </EmptyState>
        ))}

      {tab === 'archived' &&
        (archived.length ? (
          <ul className="list">
            {archived.map((v) => (
              <li key={v.habit.id}>
                <span className="icon-tile"><Icon name={v.habit.icon} /></span>
                <div className="grow">
                  <Link to={`/habits/${v.habit.id}`} className="title" style={{ color: 'inherit' }}>{v.habit.name}</Link>
                  <div className="meta">{categoryById(v.habit.category).short} · {modeById(v.habit.mode).short} · {plural(v.summary.eventCount, 'entry', 'entries')} kept</div>
                </div>
                <button type="button" className="btn sm" onClick={() => { setHabitArchived(v.habit.id, false); notify(`${v.habit.name} restored.`, 'success'); }}>
                  <Icon name="restore" size={16} />Restore
                </button>
                <button type="button" className="icon-btn sm" aria-label={`Delete ${v.habit.name}`} onClick={() => confirmDeleteHabit(v.habit, v.summary.eventCount, v.idx.checkIns.size)}>
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="archive" title="Nothing archived">Archived habits keep their full history and can be restored at any time.</EmptyState>
        ))}

      {dialog?.kind === 'log' && <LogEventDialog open onClose={() => setDialog(null)} habitId={dialog.habitId} />}
      {dialog?.kind === 'checkin' && <CheckInDialog open onClose={() => setDialog(null)} habit={dialog.habit} />}
      {dialog?.kind === 'custom' && <HabitForm open onClose={() => setDialog(null)} />}
    </div>
  );
}
