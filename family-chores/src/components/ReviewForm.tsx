'use client';
import { useActionState, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { reviewChore } from '@/app/actions/parent';
import { SubmitButton } from './SubmitButton';
import { Notice, buttonClass, labelClass, textareaClass } from './ui';

export function ReviewForm({ choreId, childName }: { choreId: string; childName: string }) {
  const [state, action] = useActionState(reviewChore, undefined);
  const [changes, setChanges] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={choreId} />
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {changes ? (
        <>
          <label className="block">
            <span className={labelClass}>What needs changing?</span>
            <textarea className={textareaClass} name="feedback" maxLength={300} rows={3} autoFocus required placeholder={`Tell ${childName} what to fix`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="changes" pendingText="Sending…"><RotateCcw size={18} aria-hidden="true" />Send back</SubmitButton>
            <button type="button" className={buttonClass('ghost')} onClick={() => setChanges(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <SubmitButton name="decision" value="approve" size="lg" pendingText="Approving…"><Check size={20} aria-hidden="true" />Approve</SubmitButton>
          <button type="button" className={buttonClass('secondary', 'lg')} onClick={() => setChanges(true)}><RotateCcw size={18} aria-hidden="true" />Needs changes</button>
        </div>
      )}
    </form>
  );
}
