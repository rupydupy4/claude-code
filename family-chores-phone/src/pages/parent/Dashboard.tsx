import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Flame, Plus, Star, UserPlus } from 'lucide-react';
import { computeProgress, currentUser, dueGroup, isOpen, isOverdue, rewardBalance, useStore, weekCompletion } from '../../lib/store';
import { byApproved, byDue, bySubmitted, formatDateTime, formatReward, today } from '../../lib/format';
import { ChoreList, ChoreRow, Flash, RewardBalanceCard } from '../../components/parts';
import { Avatar, ButtonLink, Card, EmptyState, ProgressBar, Section, TextLink } from '../../components/ui';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function ParentDashboard() {
  const me = useStore((s) => currentUser(s))!;
  const data = useStore((s) => s.data);
  const t = today();
  const kids = data.members.filter((m) => m.role === 'child');
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const chores = data.chores;
  const waiting = chores.filter((c) => c.status === 'submitted').sort(bySubmitted);
  const todays = chores.filter((c) => isOpen(c) && dueGroup(c, t) === 'today').sort(byDue);
  const overdue = todays.filter((c) => isOverdue(c, t)).length;
  const recent = chores.filter((c) => c.status === 'approved').sort(byApproved).slice(0, 5);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold sm:text-[28px]">{greeting()}, {me.name}</h1>
        <p className="mt-1 text-ink-2">{waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'chore is' : 'chores are'} waiting for your approval.` : 'Nothing is waiting for approval.'}</p>
      </header>
      <Flash />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ButtonLink href="/parent/chores/new" size="lg" className="col-span-2 sm:col-span-1"><Plus size={20} aria-hidden="true" />Create chore</ButtonLink>
        <ButtonLink href="/parent/children" variant="secondary" size="lg"><UserPlus size={19} aria-hidden="true" />Add child</ButtonLink>
        <ButtonLink href={waiting[0] ? `/parent/chores/${waiting[0].id}` : '/parent/chores?tab=review'} variant="secondary" size="lg">
          <ClipboardCheck size={19} aria-hidden="true" />Review<span className="max-sm:sr-only">&nbsp;submissions</span>{waiting.length ? ` (${waiting.length})` : ''}
        </ButtonLink>
      </div>

      {kids.length === 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Start by adding your children</h2>
          <p className="mt-1 text-ink-2">Then create chores and assign them. Children pick their name on this device to see their chores.</p>
          <ButtonLink href="/parent/children" className="mt-4"><UserPlus size={18} aria-hidden="true" />Add a child</ButtonLink>
        </Card>
      )}

      <Section title="Needs approval" count={waiting.length}>
        {waiting.length ? (
          <ChoreList label="Chores waiting for approval">{waiting.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assignedTo)} today={t} to={`/parent/chores/${c.id}`} />)}</ChoreList>
        ) : (
          <EmptyState icon={<CheckCircle2 size={24} />} title="All caught up">Chores your children hand in will appear here for you to check.</EmptyState>
        )}
      </Section>

      {kids.length > 0 && (
        <Section title="This week" action={<TextLink to="/parent/children">Manage children</TextLink>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {kids.map((k) => {
              const mine = chores.filter((c) => c.assignedTo === k.id);
              const w = weekCompletion(mine, t);
              const p = computeProgress(mine, t);
              return (
                <Card key={k.id} className="p-4" role="region" aria-label={`${k.name} this week`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={k.name} color={k.avatarColor} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{k.name}</div>
                      <div className="text-sm text-ink-3">{w.due ? `${w.done} of ${w.due} due this week done` : 'No chores due this week'}</div>
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
        <Section title="Rewards to hand over" action={<TextLink to="/parent/rewards">All rewards</TextLink>}>
          <p className="-mt-1 text-sm text-ink-3">Approved rewards stay here until you mark them as paid out. This is a record only: no money moves.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {kids.map((k) => <RewardBalanceCard key={k.id} child={k} b={rewardBalance(chores.filter((c) => c.assignedTo === k.id))} />)}
          </div>
        </Section>
      )}

      <Section title="Today" count={todays.length}
        action={<div className="flex items-center gap-3">{overdue > 0 && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger">{overdue} overdue</span>}<TextLink to="/parent/chores?tab=active">All chores</TextLink></div>}>
        {todays.length ? (
          <ChoreList label="Chores due today">{todays.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assignedTo)} today={t} to={`/parent/chores/${c.id}`} />)}</ChoreList>
        ) : (
          <EmptyState title="Nothing left to do today">Chores due today, or overdue, show up here.</EmptyState>
        )}
      </Section>

      <Section title="Recently approved">
        {recent.length ? (
          <Card className="divide-y divide-line">
            {recent.map((c) => {
              const k = kidById.get(c.assignedTo);
              return (
                <Link key={c.id} to={`/parent/chores/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-ink/[0.03]">
                  {k && <Avatar name={k.name} color={k.avatarColor} size={32} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="text-sm text-ink-3">{k?.name} · {formatDateTime(c.approvedAt!)}</div>
                  </div>
                  <span className="text-sm font-semibold text-ok">{c.rewardType === 'money' ? '+' : ''}{formatReward(c)}</span>
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
