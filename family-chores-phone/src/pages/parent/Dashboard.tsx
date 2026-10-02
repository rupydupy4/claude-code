import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Plus, UserPlus } from 'lucide-react';
import { currentUser, useStore } from '../../lib/store';
import { byApproved, byDue, formatDateTime, formatReward, isOpen, today, totalRewards } from '../../lib/format';
import { ChoreList, ChoreRow, Flash, RewardSummary } from '../../components/parts';
import { Avatar, ButtonLink, Card, EmptyState, Section } from '../../components/ui';

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
  const waiting = chores.filter((c) => c.status === 'submitted').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  const todays = chores.filter((c) => (isOpen(c) && c.dueDate && c.dueDate <= t) || (c.dueDate === t && c.status === 'submitted')).sort(byDue);
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
          <ChoreList>{waiting.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assignedTo)} today={t} to={`/parent/chores/${c.id}`} />)}</ChoreList>
        ) : (
          <EmptyState icon={<CheckCircle2 size={24} />} title="All caught up">Submitted chores will appear here.</EmptyState>
        )}
      </Section>

      <Section title="Today" count={todays.length} action={<Link to="/parent/chores" className="text-sm font-semibold text-accent">All chores</Link>}>
        {todays.length ? (
          <ChoreList>{todays.map((c) => <ChoreRow key={c.id} chore={c} child={kidById.get(c.assignedTo)} today={t} to={`/parent/chores/${c.id}`} />)}</ChoreList>
        ) : (
          <EmptyState title="Nothing due today">Chores with today’s due date show up here.</EmptyState>
        )}
      </Section>

      {kids.length > 0 && (
        <Section title="Children" action={<Link to="/parent/children" className="text-sm font-semibold text-accent">Manage</Link>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {kids.map((k) => {
              const mine = chores.filter((c) => c.assignedTo === k.id);
              return (
                <Link key={k.id} to={`/parent/rewards?child=${k.id}`} className="block">
                  <Card className="flex items-center gap-3 p-4 hover:border-line-strong">
                    <Avatar name={k.name} color={k.avatarColor} size={44} />
                    <div className="min-w-0">
                      <div className="font-semibold">{k.name}</div>
                      <div className="text-sm text-ink-3">{mine.filter(isOpen).length} to do · {mine.filter((c) => c.status === 'submitted').length} waiting</div>
                      <div className="mt-0.5 text-sm font-medium text-ink-2">Earned: <RewardSummary t={totalRewards(mine)} empty="nothing yet" /></div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Recently approved" action={<Link to="/parent/rewards" className="text-sm font-semibold text-accent">All rewards</Link>}>
        {recent.length ? (
          <Card className="divide-y divide-line">
            {recent.map((c) => {
              const k = kidById.get(c.assignedTo);
              return (
                <Link key={c.id} to={`/parent/chores/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02]">
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
          <EmptyState title="No approved chores yet" />
        )}
      </Section>
    </div>
  );
}
