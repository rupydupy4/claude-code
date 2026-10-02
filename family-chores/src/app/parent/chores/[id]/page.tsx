import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Pencil } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { getChore, photoUrl } from '@/lib/data';
import { formatDateTime, formatDue, formatReward, todayIn } from '@/lib/format';
import { deleteChore } from '@/app/actions/parent';
import { ReviewForm } from '@/components/ReviewForm';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Avatar, ButtonLink, Card, Notice, StatusBadge } from '@/components/ui';
import type { Member } from '@/lib/types';

export const metadata: Metadata = { title: 'Chore' };

export default async function ChoreDetail(props: PageProps<'/parent/chores/[id]'>) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { supabase, household } = await requireRole('parent');
  const chore = await getChore(supabase, id);
  if (!chore) notFound();
  const { data: child } = await supabase.from('members').select('*').eq('id', chore.assigned_to).single<Member>();
  const photo = await photoUrl(supabase, chore.photo_path);
  const today = todayIn(household.time_zone);
  const tz = household.time_zone;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/parent/chores" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"><ArrowLeft size={16} aria-hidden="true" />Chores</Link>

      {sp.saved && <Notice tone="ok">Changes saved.</Notice>}
      {sp.reviewed && <Notice tone="ok">{sp.reviewed === 'approved' ? 'Approved. Here’s the next one waiting.' : 'Sent back. Here’s the next one waiting.'}</Notice>}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <StatusBadge status={chore.status} />
            <h1 className="mt-2 text-2xl font-semibold">{chore.title}</h1>
          </div>
          {chore.status !== 'approved' && <ButtonLink href={`/parent/chores/${chore.id}/edit`} variant="secondary" size="sm"><Pencil size={15} aria-hidden="true" />Edit</ButtonLink>}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-3">Assigned to</dt>
            <dd className="mt-1 flex items-center gap-2 font-medium">{child && <Avatar name={child.name} color={child.avatar_color} size={24} />}{child?.name}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Reward</dt>
            <dd className="mt-1 font-medium">{formatReward(chore)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Due</dt>
            <dd className="mt-1 font-medium">{chore.due_date ? formatDue(chore.due_date, today).replace(/^Due (\w)/, (_, c: string) => c.toUpperCase()) : 'No due date'}</dd>
          </div>
        </dl>

        {chore.description && (
          <div className="mt-5 border-t border-line pt-5">
            <h2 className="text-sm text-ink-3">Instructions</h2>
            <p className="mt-1 whitespace-pre-line">{chore.description}</p>
          </div>
        )}
      </Card>

      {(chore.status === 'submitted' || chore.status === 'approved' || chore.submitted_at) && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{chore.status === 'submitted' ? `${child?.name} says it’s done` : 'Submission'}</h2>
          {chore.submitted_at && <p className="mt-0.5 text-sm text-ink-3">Handed in {formatDateTime(chore.submitted_at, tz)}</p>}
          {chore.child_note && <p className="mt-3 rounded-xl bg-black/[0.03] px-4 py-3">“{chore.child_note}”</p>}
          {photo ? (
            <a href={photo} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-xl border border-line">
              <img src={photo} alt={`Photo proof for ${chore.title}`} className="max-h-[480px] w-full object-contain bg-black/[0.03]" />
            </a>
          ) : (
            <p className="mt-3 text-sm text-ink-3">No photo was added.</p>
          )}
          {chore.status === 'submitted' && (
            <div className="mt-5 border-t border-line pt-5">
              <ReviewForm choreId={chore.id} childName={child?.name ?? 'them'} />
            </div>
          )}
          {chore.status === 'approved' && chore.approved_at && (
            <div className="mt-4"><Notice tone="ok">Approved {formatDateTime(chore.approved_at, tz)} · {formatReward(chore)} recorded for {child?.name}.</Notice></div>
          )}
        </Card>
      )}

      {chore.status === 'needs_changes' && chore.feedback && (
        <Notice tone="warn">Sent back: “{chore.feedback}”. Waiting for {child?.name} to hand it in again.</Notice>
      )}

      <div className="flex justify-end">
        <ConfirmButton action={deleteChore} fields={{ id: chore.id }} label="Delete chore" confirmText={chore.status === 'approved' ? 'Delete this chore and its reward record?' : 'Delete this chore?'} />
      </div>
    </div>
  );
}
