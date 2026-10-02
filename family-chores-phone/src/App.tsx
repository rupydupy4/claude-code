import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { currentUser, useStore } from './lib/store';
import { AppShell, type NavItem } from './components/AppShell';
import { Notice } from './components/ui';
import { Welcome } from './pages/Welcome';
import { WhoIsUsing } from './pages/WhoIsUsing';
import { ParentDashboard } from './pages/parent/Dashboard';
import { ParentChores } from './pages/parent/Chores';
import { ParentChoreDetail } from './pages/parent/ChoreDetail';
import { ChoreEditor } from './pages/parent/ChoreEditor';
import { ParentChildren } from './pages/parent/Children';
import { ParentRewards } from './pages/parent/Rewards';
import { ParentSettings } from './pages/parent/Settings';
import { ChildHome } from './pages/child/Home';
import { ChildChores } from './pages/child/Chores';
import { ChildChoreDetail } from './pages/child/ChoreDetail';
import { ChildRewards } from './pages/child/Rewards';
import { ChildSettings } from './pages/child/Settings';

function Area({ role, children }: { role: 'parent' | 'child'; children: ReactNode }) {
  const user = useStore((s) => currentUser(s));
  const household = useStore((s) => s.data.household);
  const waiting = useStore((s) => s.data.chores.filter((c) => c.status === 'submitted').length);
  const saveError = useStore((s) => s.saveError);
  // Roles come from the store's signed-in member; a child can't reach the parent area.
  if (!household || !user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'parent' ? '/parent' : '/child'} replace />;
  const nav: NavItem[] = role === 'parent'
    ? [
        { to: '/parent', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/parent/chores', label: 'Chores', icon: 'chores', badge: waiting },
        { to: '/parent/children', label: 'Children', icon: 'children' },
        { to: '/parent/rewards', label: 'Rewards', icon: 'rewards' },
        { to: '/parent/settings', label: 'Settings', icon: 'settings' },
      ]
    : [
        { to: '/child', label: 'Home', icon: 'home', end: true },
        { to: '/child/chores', label: 'My Chores', icon: 'chores' },
        { to: '/child/rewards', label: 'Rewards', icon: 'rewards' },
        { to: '/child/settings', label: 'Settings', icon: 'settings' },
      ];
  return (
    <AppShell nav={nav} householdName={household.name} user={user}>
      {saveError && <div className="mb-4"><Notice tone="danger">{saveError}</Notice></div>}
      {children}
    </AppShell>
  );
}

function Start() {
  const household = useStore((s) => s.data.household);
  const user = useStore((s) => currentUser(s));
  if (!household) return <Welcome />;
  if (!user) return <WhoIsUsing />;
  return <Navigate to={user.role === 'parent' ? '/parent' : '/child'} replace />;
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/parent" element={<Area role="parent"><ParentDashboard /></Area>} />
        <Route path="/parent/chores" element={<Area role="parent"><ParentChores /></Area>} />
        <Route path="/parent/chores/new" element={<Area role="parent"><ChoreEditor /></Area>} />
        <Route path="/parent/chores/:id" element={<Area role="parent"><ParentChoreDetail /></Area>} />
        <Route path="/parent/chores/:id/edit" element={<Area role="parent"><ChoreEditor /></Area>} />
        <Route path="/parent/children" element={<Area role="parent"><ParentChildren /></Area>} />
        <Route path="/parent/rewards" element={<Area role="parent"><ParentRewards /></Area>} />
        <Route path="/parent/settings" element={<Area role="parent"><ParentSettings /></Area>} />
        <Route path="/child" element={<Area role="child"><ChildHome /></Area>} />
        <Route path="/child/chores" element={<Area role="child"><ChildChores /></Area>} />
        <Route path="/child/chores/:id" element={<Area role="child"><ChildChoreDetail /></Area>} />
        <Route path="/child/rewards" element={<Area role="child"><ChildRewards /></Area>} />
        <Route path="/child/settings" element={<Area role="child"><ChildSettings /></Area>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
