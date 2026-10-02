import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Pencil, RotateCcw } from 'lucide-react';
import { deleteChore, getState, reviewChore, useStore } from '../../lib/store';
import { formatDateTime, formatDue, formatReward, today } from '../../lib/format';
import { ConfirmButton, Flash, StoredPhoto } from '../../components/parts';
import { message } from '../../components/forms';
import { Avatar, ButtonLink, Card, EmptyState, Notice, StatusBadge, buttonClass, labelClass, textareaClass } from '../../components/ui';

export function ParentChoreDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const chore = useStore((s) => s.data.chores.find((c) => c.id === id));
  const child = useStore((s) => s.data.members.find((m) => m.id === chore?.assignedTo));
  const [changes, setChanges] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  if (!chore) return <EmptyState title="Chore not found"><Link to="/parent/chores" className="font-semibold text-accent">Back to chores</Link></EmptyState>;
  const t = today();

  const review = (approve: boolean) => {
    setError('');
    try {
      reviewChore(chore.id, approve, approve ? '' : feedback);
      const next = getState().data.chores.filter((c) => c.status === 'submitted').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))[0];
      const notice = approve ? 'Approved. The reward has been recorded.' : 'Sent back with your note.';
      setChanges(false);
      setFeedback('');
      navigate(next ? `/parent/chores/${next.id}` : '/parent', { state: { notice: next ? `${notice} Here’s the next one waiting.` : notice } });
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/parent/chores" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"><ArrowLeft size={16} aria-hidden="true" />Chores</Link>
      <Flash />

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
            <dd className="mt-1 flex items-center gap-2 font-medium">{child && <Avatar name={child.name} color={child.avatarColor} size={24} />}{child?.name}</dd>
          </div>
          <div><dt className="text-ink-3">Reward</dt><dd className="mt-1 font-medium">{formatReward(chore)}</dd></div>
          <div><dt className="text-ink-3">Due</dt><dd className="mt-1 font-medium">{chore.dueDate ? formatDue(chore.dueDate, t).replace(/^Due (\w)/, (_, c: string) => c.toUpperCase()) : 'No due date'}</dd></div>
        </dl>
        {chore.description && (
          <div className="mt-5 border-t border-line pt-5">
            <h2 className="text-sm text-ink-3">Instructions</h2>
            <p className="mt-1 whitespace-pre-line">{chore.description}</p>
          </div>
        )}
      </Card>

      {chore.submittedAt && chore.status !== 'needs_changes' && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{chore.status === 'submitted' ? `${child?.name} says it’s done` : 'Submission'}</h2>
          <p className="mt-0.5 text-sm text-ink-3">Handed in {formatDateTime(chore.submittedAt)}</p>
          {chore.childNote && <p className="mt-3 rounded-xl bg-black/[0.03] px-4 py-3">“{chore.childNote}”</p>}
          {chore.hasPhoto ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <StoredPhoto choreId={chore.id} alt={`Photo proof for ${chore.title}`} className="max-h-[480px] w-full bg-black/[0.03] object-contain" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-3">No photo was added.</p>
          )}
          {chore.status === 'submitted' && (
            <div className="mt-5 space-y-4 border-t border-line pt-5">
              {error && <Notice tone="danger">{error}</Notice>}
              {changes ? (
                <>
                  <label className="block">
                    <span className={labelClass}>What needs changing?</span>
                    <textarea className={textareaClass} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={300} rows={3} autoFocus placeholder={`Tell ${child?.name ?? 'them'} what to fix`} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={buttonClass('primary')} onClick={() => review(false)}><RotateCcw size={18} aria-hidden="true" />Send back</button>
                    <button type="button" className={buttonClass('ghost')} onClick={() => setChanges(false)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" className={buttonClass('primary', 'lg')} onClick={() => review(true)}><Check size={20} aria-hidden="true" />Approve</button>
                  <button type="button" className={buttonClass('secondary', 'lg')} onClick={() => setChanges(true)}><RotateCcw size={18} aria-hidden="true" />Needs changes</button>
                </div>
              )}
            </div>
          )}
          {chore.status === 'approved' && chore.approvedAt && (
            <div className="mt-4"><Notice tone="ok">Approved {formatDateTime(chore.approvedAt)} · {formatReward(chore)} recorded for {child?.name}.</Notice></div>
          )}
        </Card>
      )}

      {chore.status === 'needs_changes' && chore.feedback && <Notice tone="warn">Sent back: “{chore.feedback}”. Waiting for {child?.name} to hand it in again.</Notice>}

      <div className="flex justify-end">
        <ConfirmButton label="Delete chore" confirmText={chore.status === 'approved' ? 'Delete this chore and its reward record?' : 'Delete this chore?'}
          onConfirm={async () => { await deleteChore(chore.id); navigate('/parent/chores', { state: { notice: 'Chore deleted.' } }); }} />
      </div>
    </div>
  );
}
