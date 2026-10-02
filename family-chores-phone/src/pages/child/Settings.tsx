import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { currentUser, setMyColor, signOut, useStore } from '../../lib/store';
import { ColorPicker } from '../../components/parts';
import { Avatar, Card, PageHeader, buttonClass } from '../../components/ui';

export function ChildSettings() {
  const me = useStore((s) => currentUser(s))!;
  const household = useStore((s) => s.data.household)!;
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Settings" />
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} color={me.avatarColor} size={52} />
          <div><div className="text-lg font-semibold">{me.name}</div><div className="text-sm text-ink-3">{household.name}</div></div>
        </div>
        <h2 className="mb-2 mt-5 text-sm font-medium text-ink-2">Your colour</h2>
        <ColorPicker value={me.avatarColor} onChange={setMyColor} />
        <p className="mt-5 text-sm text-ink-3">To change your name, ask a parent.</p>
      </Card>
      <button type="button" className={buttonClass('secondary')} onClick={() => { signOut(); navigate('/'); }}><LogOut size={18} aria-hidden="true" />Switch user</button>
    </div>
  );
}
