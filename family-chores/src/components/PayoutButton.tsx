'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { markRewardsPaid } from '@/app/actions/parent';
import type { RewardType } from '@/lib/types';
import { SubmitButton } from './SubmitButton';
import { buttonClass } from './ui';

/** "Mark as paid out" with an inline confirm step. Records it in the app only: no money moves. */
export function PayoutButton({ childId, childName, type, what, choreId, returnTo }: {
  childId: string; childName: string; type: RewardType; what: string; choreId?: string; returnTo: '/parent' | '/parent/rewards';
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setAsking(true)} aria-label={`Mark ${what} as paid out to ${childName}`}>
        <Check size={15} aria-hidden="true" />Mark as paid out
      </button>
    );
  }
  return (
    <form action={markRewardsPaid} className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-accent-soft p-3" role="group" aria-label="Confirm payout">
      <input type="hidden" name="child_id" value={childId} />
      <input type="hidden" name="reward_type" value={type} />
      <input type="hidden" name="return_to" value={returnTo} />
      {choreId && <input type="hidden" name="chore_id" value={choreId} />}
      <span className="mr-auto text-sm font-medium text-accent-strong">Have you given {childName} {what}?</span>
      <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setAsking(false)}>Cancel</button>
      <SubmitButton size="sm" pendingText="Saving…">Yes, paid out</SubmitButton>
    </form>
  );
}
