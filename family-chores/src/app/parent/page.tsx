import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, ClipboardCheck, Flame, Plus, Star, UserPlus } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { byDue, isDueByToday, isOverdue, listChildren, listChores } from '@/lib/data';
import { formatDateTime, formatReward, todayIn } from '@/lib/format';
import { computeProgress, rewardBalance, weekCompletion } from '@/lib/progress';
import { ChoreList, ChoreRow } from '@/components/ChoreRow';
import { RewardBalanceCard } from '@/components/RewardBalances';
import { Avatar, ButtonLink, Card, EmptyState, Notice, ProgressBar, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Dashboard' };

function greeting(timeZone: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const REVIEWED: Record<string, string> = {
  approved: 'Approved. The reward has been recorded.',
  'approved-repeat': 'Approved. The reward has been recorded and the next one is scheduled.',
  changes: 'Sent back with your note.',
};

export default async function ParentDashboard(props: PageProps<'/parent'>) {
  const { reviewed, paid } = await props.searchParams;
  const { supabase, member, household } = await requireRole('parent');
  const [chores, kids] = await Promise.all([listChores(supabase), listChildren(supabase)]);
  const tz = household.time_zone;
  const today = todayIn(tz);
  const kidById = new Map(kids.map((k) => [k.id, k]));

  const waiting = chores.filter((c) => c.status === 'submitted').sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''));
  const todays = chores.filter((c) => isDueByToday(c, today)).sort(byDue);
  const overdue = todays.filter((c) => isOverdue(c, today)).length;
  const recent = chores.filter((c) => c.status === 'approved').sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? '')).slice(0, 5);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold sm:text-[28px]">{greeting(tz)}, {member.name}</h1>
        <p className="mt-1 text-ink-2">
          {waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'chore is' : 'chores are'} waiting for your approval.` : 'Nothing is waiting for approval.'}
        </p>
      </header>

      {typeof reviewed === 'string' && REVIEWED[reviewed] && <Notice tone="ok">{REVIEWED[reviewed]}</Notice>}
      {paid === 'ok' && <Notice tone="ok">Marked as paid out.</Notice>}
      {paid === 'error' && <Notice tone="danger">That couldn’t be marked as paid out. It may already have been. Please check and try again.</Notice>}

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
          <ChoreList label="Chores waiting for approval">
            {waiting.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assigned_to)} today={today} href={`/parent/chores/${c.id}`} />)}
          </ChoreList>
        ) : (
          <EmptyState icon={<CheckCircle2 size={24} />} title="All caught up">Chores your children hand in will appear here for you to check.</EmptyState>
        )}
      </Section>

      {kids.length > 0 && (
        <Section title="This week" action={<Link href="/parent/children" className="text-sm font-semibold text-accent">Manage children</Link>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {kids.map((k) => {
              const mine = chores.filter((c) => c.assigned_to === k.id);
              const w = weekCompletion(mine, tz, today);
              const p = computeProgress(mine, tz, today);
              return (
                <Card key={k.id} className="p-4" role="region" aria-label={`${k.name} this week`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={k.name} color={k.avatar_color} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{k.name}</div>
                      <div className="text-sm text-ink-3">
                        {w.due ? `${w.done} of ${w.due} due this week done` : 'No chores due this week'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3"><ProgressBar value={w.done} max={w.due} label={`${k.name}: ${w.done} of ${w.due} chores done this week`} tone="ok" /></div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
                    <span className="inline-flex items-center gap-1"><CheckCircle2 size={15} className="text-ok" aria-hidden="true" />{w.approvedThisWeek} approved</span>
                    <span className="inline-flex items-center gap-1"><Star size={15} className="text-gold" aria-hidden="true" />+{p.pointsThisWeek} points</span>
                    <span className="inline-flex items-center gap-1"><Flame size={15} className={p.streak ? 'text-gold' : 'text-ink-3'} aria-hidden="true" />{p.streak}-day streak</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {kids.length > 0 && (
        <Section title="Rewards to hand over" action={<Link href="/parent/rewards" className="text-sm font-semibold text-accent">All rewards</Link>}>
          <p className="-mt-1 text-sm text-ink-3">Approved rewards stay here until you mark them as paid out. This is a record only: no money moves.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {kids.map((k) => <RewardBalanceCard key={k.id} child={k} b={rewardBalance(chores.filter((c) => c.assigned_to === k.id))} returnTo="/parent" />)}
          </div>
        </Section>
      )}

      <Section title="Today" count={todays.length}
        action={<div className="flex items-center gap-3">{overdue > 0 && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger">{overdue} overdue</span>}<Link href="/parent/chores?tab=active" className="text-sm font-semibold text-accent">All chores</Link></div>}>
        {todays.length ? (
          <ChoreList label="Chores due today">
            {todays.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assigned_to)} today={today} href={`/parent/chores/${c.id}`} />)}
          </ChoreList>
        ) : (
          <EmptyState title="Nothing left to do today">Chores due today, or overdue, show up here.</EmptyState>
        )}
      </Section>

      <Section title="Recently approved">
        {recent.length ? (
          <Card className="divide-y divide-line">
            {recent.map((c) => {
              const k = kidById.get(c.assigned_to);
              return (
                <Link key={c.id} href={`/parent/chores/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink/[0.03]">
                  {k && <Avatar name={k.name} color={k.avatar_color} size={32} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="text-sm text-ink-3">{k?.name} · {formatDateTime(c.approved_at!, tz)}</div>
                  </div>
                  <span className="text-sm font-semibold text-ok">{c.reward_type === 'money' ? '+' : ''}{formatReward(c)}</span>
                </Link>
              );
            })}
          </Card>
        ) : (
          <EmptyState title="No approved chores yet">When you approve a chore, it shows up here.</EmptyState>
        )}
      </Section>
    </div>
  );
}
