import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, X } from 'lucide-react';
import { currentUser, submitChore, useStore } from '../../lib/store';
import { ACCEPT, PhotoError, checkPhoto, shrinkPhoto } from '../../lib/photos';
import { formatDateTime, formatDue, formatReward, today } from '../../lib/format';
import { StoredPhoto } from '../../components/parts';
import { message } from '../../components/forms';
import { Card, EmptyState, Notice, StatusBadge, buttonClass, labelClass, textareaClass } from '../../components/ui';

function HandIn({ choreId, resubmit }: { choreId: string; resubmit: boolean }) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f?: File) => {
    setError('');
    if (!f) return;
    try {
      checkPhoto(f);
    } catch (e) {
      return setError(e instanceof PhotoError ? e.message : 'That photo can’t be used.');
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const clear = () => {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = '';
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const photo = file ? await shrinkPhoto(file) : null;
      await submitChore(choreId, { photo, note });
      navigate('/child', { state: { notice: 'Handed in! A parent will check it soon.' } });
    } catch (err) {
      setError(err instanceof PhotoError ? err.message : message(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <div>
        <span className={labelClass}>Photo <span className="font-normal text-ink-3">(optional)</span></span>
        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-line bg-black/[0.03]">
            <img src={preview} alt="Your photo" className="max-h-80 w-full object-contain" />
            <button type="button" onClick={clear} aria-label="Remove photo" className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow"><X size={18} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-white py-6 font-medium text-ink-2 hover:border-ink-3">
            <Camera size={20} aria-hidden="true" />Add a photo
          </button>
        )}
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="Choose a photo" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <label className="block">
        <span className={labelClass}>Note <span className="font-normal text-ink-3">(optional)</span></span>
        <textarea className={textareaClass} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={resubmit ? 'What did you change?' : 'Anything to add?'} />
      </label>
      <button type="submit" disabled={busy} className={buttonClass('primary', 'lg') + ' w-full'}>
        <Check size={20} aria-hidden="true" />{busy ? 'Handing in…' : resubmit ? 'Hand it in again' : 'I’ve done it'}
      </button>
    </form>
  );
}

export function ChildChoreDetail() {
  const { id } = useParams();
  const me = useStore((s) => currentUser(s))!;
  const chore = useStore((s) => s.data.chores.find((c) => c.id === id && c.assignedTo === me.id));
  if (!chore) return <EmptyState title="Chore not found"><Link to="/child" className="font-semibold text-accent">Back home</Link></EmptyState>;
  const t = today();
  const canHandIn = chore.status === 'assigned' || chore.status === 'needs_changes';
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link to="/child" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"><ArrowLeft size={16} aria-hidden="true" />Home</Link>
      <Card className="p-5 sm:p-6">
        <StatusBadge status={chore.status} />
        <h1 className="mt-2 text-2xl font-semibold">{chore.title}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-ink-2">
          <span>Reward: <strong className="font-semibold text-ink">{formatReward(chore)}</strong></span>
          {chore.dueDate && <span>{formatDue(chore.dueDate, t)}</span>}
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
          <HandIn choreId={chore.id} resubmit={chore.status === 'needs_changes'} />
        </Card>
      )}
      {chore.status === 'submitted' && chore.submittedAt && <Notice tone="warn">Waiting for approval. Handed in {formatDateTime(chore.submittedAt)}.</Notice>}
      {chore.status === 'approved' && <Notice tone="ok">Approved{chore.approvedAt ? ` ${formatDateTime(chore.approvedAt)}` : ''}. {formatReward(chore)} added to your rewards.{chore.feedback ? ` “${chore.feedback}”` : ''}</Notice>}
      {!canHandIn && (chore.childNote || chore.hasPhoto) && (
        <Card className="p-5">
          <h2 className="font-semibold">What you handed in</h2>
          {chore.childNote && <p className="mt-2">“{chore.childNote}”</p>}
          {chore.hasPhoto && <div className="mt-3"><StoredPhoto choreId={chore.id} alt="Your photo proof" className="max-h-80 w-full rounded-xl border border-line object-contain" /></div>}
        </Card>
      )}
    </div>
  );
}
