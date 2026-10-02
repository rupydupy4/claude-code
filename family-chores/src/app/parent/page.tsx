import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, ClipboardCheck, Plus, UserPlus } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { byDue, isDueByToday, listChildren, listChores } from '@/lib/data';
import { formatDateTime, formatReward, todayIn, totalRewards } from '@/lib/format';
import { ChoreList, ChoreRow } from '@/components/ChoreRow';
import { RewardSummary } from '@/components/RewardTotals';
import { Avatar, ButtonLink, Card, EmptyState, Notice, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Dashboard' };

function greeting(timeZone: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function ParentDashboard(props: PageProps<'/parent'>) {
  const { reviewed } = await props.searchParams;
  const { supabase, member, household } = await requireRole('parent');
  const [chores, kids] = await Promise.all([listChores(supabase), listChildren(supabase)]);
  const today = todayIn(household.time_zone);
  const kidById = new Map(kids.map((k) => [k.id, k]));

  const waiting = chores.filter((c) => c.status === 'submitted').sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''));
  const todays = chores.filter((c) => isDueByToday(c, today) || (c.due_date === today && c.status === 'submitted')).sort(byDue);
  const recent = chores.filter((c) => c.status === 'approved').sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? '')).slice(0, 5);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold sm:text-[28px]">{greeting(household.time_zone)}, {member.name}</h1>
          <p className="mt-1 text-ink-2">
            {waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'chore is' : 'chores are'} waiting for your approval.` : 'Nothing is waiting for approval.'}
          </p>
        </div>
      </header>

      {reviewed && <Notice tone="ok">{reviewed === 'approved' ? 'Approved. The reward has been recorded.' : 'Sent back with your note.'}</Notice>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ButtonLink href="/parent/chores/new" size="lg" className="col-span-2 sm:col-span-1"><Plus size={20} aria-hidden="true" />Create chore</ButtonLink>
        <ButtonLink href="/parent/children#add" variant="secondary" size="lg"><UserPlus size={19} aria-hidden="true" />Add child</ButtonLink>
        <ButtonLink href={waiting[0] ? `/parent/chores/${waiting[0].id}` : '/parent/chores?tab=review'} variant="secondary" size="lg">
          <ClipboardCheck size={19} aria-hidden="true" />Review<span className="max-sm:sr-only">&nbsp;submissions</span>{waiting.length ? ` (${waiting.length})` : ''}
        </ButtonLink>
      </div>

      {kids.length === 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Start by adding your children</h2>
          <p className="mt-1 text-ink-2">Each child gets a PIN to sign in. Then create chores and assign them.</p>
          <ButtonLink href="/parent/children#add" className="mt-4"><UserPlus size={18} aria-hidden="true" />Add a child</ButtonLink>
        </Card>
      )}

      <Section title="Needs approval" count={waiting.length}>
        {waiting.length ? (
          <ChoreList>
            {waiting.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assigned_to)} today={today} href={`/parent/chores/${c.id}`} />)}
          </ChoreList>
        ) : (
          <EmptyState icon={<CheckCircle2 size={24} />} title="All caught up">Submitted chores will appear here.</EmptyState>
        )}
      </Section>

      <Section title="Today" count={todays.length} action={<Link href="/parent/chores" className="text-sm font-semibold text-accent">All chores</Link>}>
        {todays.length ? (
          <ChoreList>
            {todays.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assigned_to)} today={today} href={`/parent/chores/${c.id}`} />)}
          </ChoreList>
        ) : (
          <EmptyState title="Nothing due today">Chores with today’s due date show up here.</EmptyState>
        )}
      </Section>

      {kids.length > 0 && (
        <Section title="Children" action={<Link href="/parent/children" className="text-sm font-semibold text-accent">Manage</Link>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {kids.map((k) => {
              const mine = chores.filter((c) => c.assigned_to === k.id);
              const open = mine.filter((c) => c.status === 'assigned' || c.status === 'needs_changes').length;
              return (
                <Link key={k.id} href={`/parent/rewards?child=${k.id}`} className="block">
                  <Card className="flex items-center gap-3 p-4 hover:border-line-strong">
                    <Avatar name={k.name} color={k.avatar_color} size={44} />
                    <div className="min-w-0">
                      <div className="font-semibold">{k.name}</div>
                      <div className="text-sm text-ink-3">{open} to do · {mine.filter((c) => c.status === 'submitted').length} waiting</div>
                      <div className="mt-0.5 text-sm font-medium text-ink-2">Earned: <RewardSummary t={totalRewards(mine)} empty="nothing yet" /></div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Recently approved" action={<Link href="/parent/rewards" className="text-sm font-semibold text-accent">All rewards</Link>}>
        {recent.length ? (
          <Card className="divide-y divide-line">
            {recent.map((c) => {
              const k = kidById.get(c.assigned_to);
              return (
                <Link key={c.id} href={`/parent/chores/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02]">
                  {k && <Avatar name={k.name} color={k.avatar_color} size={32} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="text-sm text-ink-3">{k?.name} · {formatDateTime(c.approved_at!, household.time_zone)}</div>
                  </div>
                  <span className="text-sm font-semibold text-ok">{c.reward_type === 'money' ? '+' : ''}{formatReward(c)}</span>
                </Link>
              );
            })}
          </Card>
        ) : (
          <EmptyState title="No approved chores yet" />
        )}
      </Section>
    </div>
  );
}
