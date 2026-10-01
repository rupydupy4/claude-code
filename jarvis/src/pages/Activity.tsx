import { useMemo, useState } from 'react';
import type { EntityType } from '../domain/types';
import { useStore } from '../data/store';
import { todayKey, formatDateLong } from '../utils/dates';
import { EmptyState, PageHeader } from '../components/ui';
import { ActivityRow } from '../components/rows';

const TYPES: { value: EntityType | ''; label: string }[] = [
  { value: '', label: 'All' }, { value: 'task', label: 'Tasks' }, { value: 'project', label: 'Projects' }, { value: 'note', label: 'Notes' },
  { value: 'reminder', label: 'Reminders' }, { value: 'event', label: 'Events' }, { value: 'memory', label: 'Memory' }, { value: 'document', label: 'Documents' },
];
const PAGE = 60;

export default function ActivityPage() {
  const activity = useStore((s) => s.activity);
  const [type, setType] = useState<EntityType | ''>('');
  const [limit, setLimit] = useState(PAGE);
  const list = useMemo(() => activity.filter((a) => !type || a.entity === type), [activity, type]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const a of list.slice(0, limit)) {
      const k = todayKey(new Date(a.createdAt));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [list, limit]);

  return (
    <div className="stack">
      <PageHeader title="Activity" subtitle="Everything created, changed or completed — by you or the assistant." />
      <div className="scroll-x" role="group" aria-label="Type">
        {TYPES.map((t) => <button key={t.value} type="button" className="chip" aria-pressed={type === t.value} onClick={() => { setType(t.value); setLimit(PAGE); }}>{t.label}</button>)}
      </div>
      {groups.length === 0 ? (
        <EmptyState icon="activity" title="No activity yet" />
      ) : (
        groups.map(([day, items]) => (
          <section key={day} className="stack-sm">
            <h2 className="label">{formatDateLong(day)}</h2>
            <ul className="list panel flush">{items.map((a) => <ActivityRow key={a.id} a={a} />)}</ul>
          </section>
        ))
      )}
      {list.length > limit && <button type="button" className="btn ghost" onClick={() => setLimit((n) => n + PAGE)}>Show more</button>}
    </div>
  );
}
