import { useMemo, useState } from 'react';
import { useStore, updateSettings } from '../data/store';
import { deleteReminder, updateReminder } from '../services/actions';
import { formatWhen, recurrenceLabel } from '../utils/dates';
import { requestNotificationPermission } from '../services/reminders';
import { Icon } from '../components/Icon';
import { confirmAction, DemoBadge, EmptyState, PageHeader, Segmented } from '../components/ui';
import { openEditor } from '../components/editors';
import { notify } from '../services/notify';

export default function Reminders() {
  const reminders = useStore((s) => s.reminders);
  const tasks = useStore((s) => s.tasks);
  const notif = useStore((s) => s.settings.notifications);
  const [show, setShow] = useState<'upcoming' | 'done'>('upcoming');
  const list = useMemo(
    () => reminders.filter((r) => (show === 'done' ? r.done : !r.done)).sort((a, b) => (show === 'done' ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at))),
    [reminders, show],
  );
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

  const enable = async () => {
    const p = await requestNotificationPermission();
    await updateSettings({ notifications: { ...notif, enabled: true } });
    notify(p === 'granted' ? 'Notifications on.' : 'Reminders will appear as banners inside JARVIS while it is open.', 'info');
  };
  const remove = async (id: string, text: string) => {
    if (!(await confirmAction({ title: 'Delete reminder?', body: `“${text}” will be deleted.`, confirmLabel: 'Delete', danger: true }))) return;
    deleteReminder(id);
  };

  return (
    <div className="stack">
      <PageHeader title="Reminders" subtitle="One-time, recurring, or linked to a task." actions={<button type="button" className="btn primary" onClick={() => openEditor({ kind: 'reminder' })}><Icon name="plus" />New reminder</button>} />
      {(!notif.enabled || permission !== 'granted') && (
        <div className="notice">
          <Icon name="info" />
          <div className="grow small">
            Reminders fire while JARVIS is open (including in a background tab).
            {permission === 'granted' && notif.enabled ? '' : permission === 'unsupported' ? ' This browser can’t show system notifications here, so they appear as banners.' : ' Turn on notifications to get system alerts as well as banners.'}
          </div>
          {permission !== 'unsupported' && !(notif.enabled && permission === 'granted') && <button type="button" className="btn sm" onClick={() => void enable()}>Turn on</button>}
        </div>
      )}
      <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'done', label: 'Done' }]} />
      {list.length === 0 ? (
        <EmptyState icon="bell" title={show === 'upcoming' ? 'No upcoming reminders' : 'No finished reminders'}>
          {show === 'upcoming' ? 'Try: “Remind me every Monday at 9 AM to review my projects.”' : undefined}
        </EmptyState>
      ) : (
        <ul className="list panel flush">
          {list.map((r) => {
            const task = r.taskId ? tasks.find((t) => t.id === r.taskId) : undefined;
            return (
              <li key={r.id} className={r.done ? 'done' : ''}>
                <Icon name={r.recurrence === 'none' ? 'alarm' : 'repeat'} size={18} className="faint" />
                <button type="button" className="item-btn" onClick={() => openEditor({ kind: 'reminder', id: r.id })}>
                  <div className="title">{r.text}</div>
                  <div className="meta">
                    <span>{formatWhen(r.at)}</span>
                    <span>{recurrenceLabel(r.recurrence, r.at)}</span>
                    {task && <span><Icon name="tasks" size={12} /> {task.title}</span>}
                    <DemoBadge show={r.demo} />
                  </div>
                </button>
                {r.done ? (
                  <button type="button" className="btn ghost sm" onClick={() => openEditor({ kind: 'reminder', id: r.id })}>Reschedule</button>
                ) : r.recurrence === 'none' ? (
                  <button type="button" className="btn ghost sm" onClick={() => updateReminder(r.id, { done: true })}>Mark done</button>
                ) : null}
                <button type="button" className="icon-btn sm" aria-label={`Delete reminder “${r.text}”`} onClick={() => void remove(r.id, r.text)}><Icon name="trash" size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
