import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { isOpen, useStore } from '../../lib/store';
import { byApproved, bySubmitted, today } from '../../lib/format';
import type { Chore } from '../../lib/types';
import { ChoreList, ChoreRow, DueGroups, Flash } from '../../components/parts';
import { ButtonLink, EmptyState, PageHeader, cx } from '../../components/ui';

const TABS = [
  { id: 'active', label: 'To do' },
  { id: 'review', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
] as const;
type Tab = (typeof TABS)[number]['id'];
const inTab = (c: Chore, t: Tab) => (t === 'active' ? isOpen(c) : t === 'review' ? c.status === 'submitted' : c.status === 'approved');

export function ParentChores() {
  const [sp] = useSearchParams();
  const data = useStore((s) => s.data);
  const t = today();
  const kids = data.members.filter((m) => m.role === 'child');
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const waiting = data.chores.filter((c) => c.status === 'submitted').length;
  const tab: Tab = TABS.some((x) => x.id === sp.get('tab')) ? (sp.get('tab') as Tab) : waiting ? 'review' : 'active';
  const child = kidById.has(sp.get('child') ?? '') ? sp.get('child')! : '';
  const link = (x: Tab, c = child) => `/parent/chores?tab=${x}${c ? `&child=${c}` : ''}`;
  const mine = (c: Chore) => !child || c.assignedTo === child;
  const list = data.chores.filter((c) => inTab(c, tab) && mine(c)).sort(tab === 'approved' ? byApproved : bySubmitted);
  const rows = (l: Chore[]) => <ChoreList>{l.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assignedTo)} today={t} to={`/parent/chores/${c.id}`} showStatus={tab === 'active'} />)}</ChoreList>;

  return (
    <div>
      <PageHeader title="Chores" actions={<ButtonLink href="/parent/chores/new"><Plus size={18} aria-hidden="true" />Create chore</ButtonLink>} />
      <div className="space-y-5">
        <Flash />
        <nav aria-label="Chore status" className="flex gap-1 overflow-x-auto rounded-xl bg-ink/[0.05] p-1">
          {TABS.map((x) => (
            <Link key={x.id} to={link(x.id)} replace aria-current={tab === x.id ? 'page' : undefined}
              className={cx('flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-center text-sm font-semibold', tab === x.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
              {x.label} <span className="ml-1 text-ink-3 tabular">{data.chores.filter((c) => inTab(c, x.id) && mine(c)).length}</span>
            </Link>
          ))}
        </nav>
        {kids.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by child">
            {[{ id: '', name: 'Everyone' }, ...kids].map((k) => (
              <Link key={k.id || 'all'} to={link(tab, k.id)} replace aria-current={child === k.id ? 'true' : undefined}
                className={cx('inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium', child === k.id ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong text-ink-2')}>{k.name}</Link>
            ))}
          </div>
        )}
        {!list.length ? (
          <EmptyState title={tab === 'review' ? 'Nothing waiting for approval' : tab === 'approved' ? 'No approved chores yet' : 'No chores to do'}>
            {tab === 'active' && (kids.length ? 'Create a chore and assign it to a child.' : 'Add a child first, then create chores for them.')}
          </EmptyState>
        ) : tab === 'active' ? (
          <div className="space-y-8"><DueGroups chores={list} today={t} render={rows} /></div>
        ) : (
          rows(list)
        )}
      </div>
    </div>
  );
}
