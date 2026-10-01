import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation, Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ConfirmHost, Logo, Modal, ToastHost } from '../components/ui';
import { Onboarding } from './Onboarding';
import { useData } from '../hooks/useApp';
import { getState } from '../services/store';
import { startReminderLoop } from '../services/reminders';
import DashboardPage from '../pages/DashboardPage';

const HabitsPage = lazy(() => import('../pages/HabitsPage'));
const LibraryPage = lazy(() => import('../pages/LibraryPage'));
const HabitDetailPage = lazy(() => import('../pages/HabitDetailPage'));
const ToolkitPage = lazy(() => import('../pages/ToolkitPage'));
const MissionsPage = lazy(() => import('../pages/MissionsPage'));
const FocusPage = lazy(() => import('../pages/FocusPage'));
const GoalsPage = lazy(() => import('../pages/GoalsPage'));
const JournalPage = lazy(() => import('../pages/JournalPage'));
const StatisticsPage = lazy(() => import('../pages/StatisticsPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));

export const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: 'dashboard' },
  { to: '/habits', label: 'My Habits', short: 'Habits', icon: 'target' },
  { to: '/library', label: 'Habit Library', short: 'Library', icon: 'library' },
  { to: '/toolkit', label: 'Urge Toolkit', short: 'Toolkit', icon: 'lifebuoy' },
  { to: '/missions', label: 'Daily Missions', short: 'Missions', icon: 'missions' },
  { to: '/goals', label: 'Goals', short: 'Goals', icon: 'goal' },
  { to: '/journal', label: 'Journal', short: 'Journal', icon: 'journal' },
  { to: '/stats', label: 'Statistics', short: 'Stats', icon: 'chart' },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: 'settings' },
];
const EXTRA = [
  { to: '/focus', label: 'Focus timer', icon: 'timer' },
  { to: '/privacy', label: 'Privacy', icon: 'shield-check' },
];
const TABS = ['/', '/habits', '/toolkit', '/missions'];

function useThemeAndMotion() {
  const { theme, reducedMotion } = useData().prefs;
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101114' : '#f6f7f4');
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion === 'on') root.dataset.motion = 'reduce';
    else delete root.dataset.motion;
  }, [reducedMotion]);
}

function Shell() {
  const loc = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    setMoreOpen(false);
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  const tabActive = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));
  const moreActive = !TABS.some((t) => tabActive(t));

  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <aside className="sidebar" aria-label="Primary">
        <Link to="/" className="brand" aria-label="BREAKFREE home"><Logo /><span className="wordmark">BREAKFREE</span></Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name={n.icon} />{n.label}
            </NavLink>
          ))}
          <div className="eyebrow" style={{ padding: '16px 10px 6px' }}>Tools</div>
          {EXTRA.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={n.icon} />{n.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot"><Icon name="lock" size={14} />Stored only on this device</div>
      </aside>

      <header className="mobile-header">
        <Link to="/" className="brand" style={{ padding: 0 }} aria-label="BREAKFREE home"><Logo size={26} /><span className="wordmark">BREAKFREE</span></Link>
        <span className="spacer" />
        <Link to="/privacy" className="icon-btn" aria-label="Privacy: data stays on this device"><Icon name="lock" /></Link>
        <Link to="/settings" className="icon-btn" aria-label="Settings"><Icon name="settings" /></Link>
      </header>

      <main id="main" className="main" tabIndex={-1} style={{ outline: 'none' }}>
        <Suspense fallback={<p className="muted" role="status">Loading…</p>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/habits/:id" element={<HabitDetailPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/toolkit" element={<ToolkitPage />} />
            <Route path="/missions" element={<MissionsPage />} />
            <Route path="/focus" element={<FocusPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/stats" element={<StatisticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<div className="empty"><h3>Page not found</h3><p>That page doesn’t exist.</p><Link className="btn" to="/">Go to dashboard</Link></div>} />
          </Routes>
        </Suspense>
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.filter((n) => TABS.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={n.icon} size={22} />{n.short}
          </NavLink>
        ))}
        <button type="button" className={moreActive ? 'active' : ''} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          <Icon name="more" size={22} />More
        </button>
      </nav>

      <Modal open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
        <nav aria-label="More sections">
          <ul className="list">
            {[...NAV.filter((n) => !TABS.includes(n.to)), ...EXTRA.map((e) => ({ ...e, short: e.label }))].map((n) => (
              <li key={n.to} style={{ padding: 0 }}>
                <NavLink to={n.to} className="row nowrap" style={{ padding: '12px 14px', width: '100%', color: 'inherit', textDecoration: 'none' }} onClick={() => setMoreOpen(false)}>
                  <span className="icon-tile"><Icon name={n.icon} /></span>
                  <span className="grow title">{n.label}</span>
                  <Icon name="chevron-right" />
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </Modal>
    </div>
  );
}

export default function App() {
  const onboarded = useData().prefs.onboarded;
  useThemeAndMotion();
  useEffect(() => startReminderLoop(getState), []);
  return (
    <HashRouter>
      <Shell />
      {!onboarded && <Onboarding />}
      <ConfirmHost />
      <ToastHost />
    </HashRouter>
  );
}
