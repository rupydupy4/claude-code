import type { Metadata } from 'next';
import { LogOut } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { signOut } from '@/app/actions/auth';
import { updateMyColor } from '@/app/actions/child';
import { AVATAR_COLORS } from '@/lib/types';
import { AVATAR_BG, Avatar, Card, PageHeader, buttonClass, cx } from '@/components/ui';

export const metadata: Metadata = { title: 'Settings' };

export default async function ChildSettings() {
  const { member, household } = await requireRole('child');
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Settings" />
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <Avatar name={member.name} color={member.avatar_color} size={52} />
          <div>
            <div className="text-lg font-semibold">{member.name}</div>
            <div className="text-sm text-ink-3">{household.name}</div>
          </div>
        </div>
        <form action={updateMyColor} className="mt-5">
          <h2 className="mb-2 text-sm font-medium text-ink-2">Your colour</h2>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button key={c} name="avatar_color" value={c} aria-label={c} aria-pressed={member.avatar_color === c}
                className={cx('h-9 w-9 rounded-full ring-offset-2', AVATAR_BG[c], member.avatar_color === c ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line-strong')} />
            ))}
          </div>
        </form>
        <p className="mt-5 text-sm text-ink-3">To change your name or PIN, ask a parent.</p>
      </Card>
      <form action={signOut}><button className={buttonClass('secondary')}><LogOut size={18} aria-hidden="true" />Sign out</button></form>
    </div>
  );
}
