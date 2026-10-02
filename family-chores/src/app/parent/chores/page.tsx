import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { byDue, listChildren, listChores } from '@/lib/data';
import { todayIn } from '@/lib/format';
import { ChoreList, ChoreRow } from '@/components/ChoreRow';
import { ButtonLink, EmptyState, Notice, PageHeader, cx } from '@/components/ui';

export const metadata: Metadata = { title: 'Chores' };

const TABS = [
  { id: 'active', label: 'To do' },
  { id: 'review', label: 'Waiting for approval' },
  { id: 'approved', label: 'Approved' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default async function ChoresPage(props: PageProps<'/parent/chores'>) {
  const sp = await props.searchParams;
  const { supabase, household } = await requireRole('parent');
  const [chores, kids] = await Promise.all([listChores(supabase), listChildren(supabase)]);
  const today = todayIn(household.time_zone);
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const waitingCount = chores.filter((c) => c.status === 'submitted').length;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : waitingCount ? 'review' : 'active';
  const child = typeof sp.child === 'string' && kidById.has(sp.child) ? sp.child : '';

  const list = chores
    .filter((c) => (tab === 'active' ? c.status === 'assigned' || c.status === 'needs_changes' : tab === 'review' ? c.status === 'submitted' : c.status === 'approved'))
    .filter((c) => !child || c.assigned_to === child)
    .sort(tab === 'approved' ? (a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? '') : tab === 'review' ? (a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '') : byDue);
  const link = (t: Tab, c = child) => `/parent/chores?tab=${t}${c ? `&child=${c}` : ''}`;
  const count = (t: Tab) => chores.filter((c) => (t === 'active' ? c.status === 'assigned' || c.status === 'needs_changes' : t === 'review' ? c.status === 'submitted' : c.status === 'approved') && (!child || c.assigned_to === child)).length;

  return (
    <div>
      <PageHeader title="Chores" actions={<ButtonLink href="/parent/chores/new"><Plus size={18} aria-hidden="true" />Create chore</ButtonLink>} />
      <div className="space-y-4">
        {sp.created && <Notice tone="ok">Chore created and assigned.</Notice>}
        {sp.deleted && <Notice tone="ok">Chore deleted.</Notice>}

        <nav aria-label="Chore status" className="flex gap-1 overflow-x-auto rounded-xl bg-black/[0.04] p-1">
          {TABS.map((t) => (
            <Link key={t.id} href={link(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={cx('flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-semibold', tab === t.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
              {t.label} <span className="ml-1 text-ink-3 tabular">{count(t.id)}</span>
            </Link>
          ))}
        </nav>

        {kids.length > 1 && (
          <div className="flex flex-wrap gap-2" aria-label="Filter by child">
            <Link href={link(tab, '')} aria-current={!child ? 'true' : undefined} className={cx('rounded-full border px-3 py-1 text-sm font-medium', !child ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong text-ink-2')}>Everyone</Link>
            {kids.map((k) => (
              <Link key={k.id} href={link(tab, k.id)} aria-current={child === k.id ? 'true' : undefined} className={cx('rounded-full border px-3 py-1 text-sm font-medium', child === k.id ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong text-ink-2')}>{k.name}</Link>
            ))}
          </div>
        )}

        {list.length ? (
          <ChoreList>
            {list.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assigned_to)} today={today} href={`/parent/chores/${c.id}`} showStatus={tab === 'active'} />)}
          </ChoreList>
        ) : (
          <EmptyState title={tab === 'review' ? 'Nothing waiting for approval' : tab === 'approved' ? 'No approved chores yet' : 'No chores to do'}>
            {tab === 'active' && (kids.length ? 'Create a chore and assign it to a child.' : 'Add a child first, then create chores for them.')}
          </EmptyState>
        )}
      </div>
    </div>
  );
}
