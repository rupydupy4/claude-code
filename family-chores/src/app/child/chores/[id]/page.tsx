import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { getChore, photoUrl } from '@/lib/data';
import { formatDateTime, formatDue, formatReward, todayIn } from '@/lib/format';
import { HandInForm } from '@/components/HandInForm';
import { Card, Notice, StatusBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Chore' };

export default async function ChildChore(props: PageProps<'/child/chores/[id]'>) {
  const { id } = await props.params;
  const { supabase, household } = await requireRole('child');
  const chore = await getChore(supabase, id);
  if (!chore) notFound();
  const today = todayIn(household.time_zone);
  const photo = await photoUrl(supabase, chore.photo_path);
  const canHandIn = chore.status === 'assigned' || chore.status === 'needs_changes';

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/child" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"><ArrowLeft size={16} aria-hidden="true" />Home</Link>

      <Card className="p-5 sm:p-6">
        <StatusBadge status={chore.status} />
        <h1 className="mt-2 text-2xl font-semibold">{chore.title}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-ink-2">
          <span>Reward: <strong className="font-semibold text-ink">{formatReward(chore)}</strong></span>
          {chore.due_date && <span>{formatDue(chore.due_date, today)}</span>}
        </div>
        {chore.description && (
          <div className="mt-5 border-t border-line pt-5">
            <h2 className="text-sm font-medium text-ink-3">What to do</h2>
            <p className="mt-1 whitespace-pre-line text-[17px] leading-relaxed">{chore.description}</p>
          </div>
        )}
      </Card>

      {chore.status === 'needs_changes' && chore.feedback && <Notice tone="danger">Needs changes: “{chore.feedback}”</Notice>}

      {canHandIn && (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">{chore.status === 'needs_changes' ? 'Hand it in again' : 'Finished?'}</h2>
          <HandInForm choreId={chore.id} householdId={household.id} resubmit={chore.status === 'needs_changes'} />
        </Card>
      )}

      {chore.status === 'submitted' && <Notice tone="warn">Waiting for approval. Handed in {formatDateTime(chore.submitted_at!, household.time_zone)}.</Notice>}
      {chore.status === 'approved' && <Notice tone="ok">Approved{chore.approved_at ? ` ${formatDateTime(chore.approved_at, household.time_zone)}` : ''}. {formatReward(chore)} added to your rewards.{chore.feedback ? ` “${chore.feedback}”` : ''}</Notice>}

      {!canHandIn && (chore.child_note || photo) && (
        <Card className="p-5">
          <h2 className="font-semibold">What you handed in</h2>
          {chore.child_note && <p className="mt-2">“{chore.child_note}”</p>}
          {photo && <img src={photo} alt="Your photo proof" className="mt-3 max-h-80 w-full rounded-xl border border-line object-contain" />}
        </Card>
      )}
    </div>
  );
}
