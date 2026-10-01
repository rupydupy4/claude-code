import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { Icon } from '../components/Icon';
import { ConfirmHost, Logo, ORB_LABEL, Orb, ToastHost } from '../components/ui';
import { EditorHost } from '../components/editors';
import { useSession } from './session';
import { VoiceButton } from './VoiceButton';
import { useAIStatus } from '../ai/assistant';
import { Onboarding } from './Onboarding';
import Dashboard from '../pages/Dashboard';

const Assistant = lazy(() => import('../pages/Assistant'));
const Workspace = lazy(() => import('../pages/Workspace'));
const Tasks = lazy(() => import('../pages/Tasks'));
const Projects = lazy(() => import('../pages/Projects'));
const ProjectDetail = lazy(() => import('../pages/ProjectDetail'));
const Calendar = lazy(() => import('../pages/Calendar'));
const Reminders = lazy(() => import('../pages/Reminders'));
const Notes = lazy(() => import('../pages/Notes'));
const Documents = lazy(() => import('../pages/Documents'));
const Writing = lazy(() => import('../pages/Writing'));
const MemoryPage = lazy(() => import('../pages/Memory'));
const ActivityPage = lazy(() => import('../pages/Activity'));
const Search = lazy(() => import('../pages/Search'));
const Settings = lazy(() => import('../pages/Settings'));

const NAV: { group?: string; items: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  { items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }, { to: '/assistant', label: 'Assistant', icon: 'message' }] },
  { group: 'Work', items: [
    { to: '/workspace', label: 'Workspace', icon: 'workspace' }, { to: '/tasks', label: 'Tasks', icon: 'tasks' },
    { to: '/projects', label: 'Projects', icon: 'folder' }, { to: '/calendar', label: 'Calendar', icon: 'calendar' },
    { to: '/reminders', label: 'Reminders', icon: 'bell' },
  ] },
  { group: 'Knowledge', items: [
    { to: '/notes', label: 'Notes', icon: 'note' }, { to: '/documents', label: 'Documents', icon: 'file' },
    { to: '/writing', label: 'Writing', icon: 'write' }, { to: '/memory', label: 'Memory', icon: 'brain' },
  ] },
  { group: 'System', items: [{ to: '/activity', label: 'Activity', icon: 'activity' }, { to: '/settings', label: 'Settings', icon: 'settings' }] },
];

const TITLES: Record<string, string> = {
  '': 'Dashboard', assistant: 'Assistant', workspace: 'Workspace', tasks: 'Tasks', projects: 'Projects', calendar: 'Calendar',
  reminders: 'Reminders', notes: 'Notes', documents: 'Documents', writing: 'Writing', memory: 'Memory', activity: 'Activity',
  search: 'Search', settings: 'Settings',
};

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  const accent = useStore((s) => s.settings.accent);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    root.dataset.accent = accent;
    try {
      localStorage.setItem('jarvis:theme', JSON.stringify({ theme, accent }));
    } catch {
      /* per-device convenience only */
    }
  }, [theme, accent]);
}

function Sidebar() {
  // Selectors return primitives so the store snapshot stays stable between renders.
  const openTasks = useStore((s) => s.tasks.filter((t) => t.status !== 'completed').length);
  const activeReminders = useStore((s) => s.reminders.filter((r) => !r.done).length);
  const counts = { tasks: openTasks, reminders: activeReminders };
  const name = useStore((s) => s.settings.assistantName);
  const ai = useAIStatus();
  const session = useSession();
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <NavLink to="/" className="brand" aria-label="J.A.R.V.I.S home">
        <Logo />
        <span className="wordmark">J.A.R.V.I.S</span>
      </NavLink>
      <NavLink to="/search" className="btn ghost sm" style={{ justifyContent: 'flex-start', margin: '0 2px 6px' }}>
        <Icon name="search" size={16} /> Search <span className="faint tiny mono" style={{ marginLeft: 'auto' }}>Ctrl K</span>
      </NavLink>
      {NAV.map((g, i) => (
        <nav key={i} className="nav" aria-label={g.group ?? 'Primary'}>
          {g.group && <div className="label nav-group">{g.group}</div>}
          {g.items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              <Icon name={it.icon} />
              {it.label}
              {it.to === '/tasks' && counts.tasks > 0 && <span className="count">{counts.tasks}</span>}
              {it.to === '/reminders' && counts.reminders > 0 && <span className="count">{counts.reminders}</span>}
            </NavLink>
          ))}
        </nav>
      ))}
      <div className="sidebar-foot">
        <VoiceButton size={30} />
        <div className="grow">
          <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{name}</div>
          <div aria-live="polite">{ORB_LABEL[session.orb]} · {ai.mode === 'claude' ? 'AI on' : 'Commands only'}</div>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const loc = useLocation();
  const key = loc.pathname.split('/')[1] ?? '';
  return (
    <header className="topbar mobile-only">
      <NavLink to="/" aria-label="Home" className="row nowrap" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Logo size={26} />
      </NavLink>
      <span className="grow truncate" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{TITLES[key] ?? 'J.A.R.V.I.S'}</span>
      <NavLink to="/search" className="icon-btn" aria-label="Search"><Icon name="search" /></NavLink>
      <NavLink to="/assistant" className="icon-btn" aria-label="Assistant chat"><Icon name="message" /></NavLink>
      <NavLink to="/settings" className="icon-btn" aria-label="Settings"><Icon name="settings" /></NavLink>
    </header>
  );
}

function BottomBar() {
  return (
    <nav className="bottombar" aria-label="Main navigation">
      <NavLink to="/" end><Icon name="dashboard" size={21} />Home</NavLink>
      <NavLink to="/tasks"><Icon name="tasks" size={21} />Tasks</NavLink>
      <div className="voice-slot" style={{ display: 'grid', placeItems: 'center' }}><VoiceButton /></div>
      <NavLink to="/calendar"><Icon name="calendar" size={21} />Calendar</NavLink>
      <NavLink to="/workspace"><Icon name="workspace" size={21} />More</NavLink>
    </nav>
  );
}

function Shortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
  return null;
}

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function Main({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <main id="main" tabIndex={-1} className={`main${pathname.startsWith('/assistant') ? ' full' : ''}`}>
      {children}
    </main>
  );
}

function Loading() {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: 48 }} role="status">
      <Orb state="processing" size={36} />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function App() {
  useTheme();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const onboarded = useStore((s) => s.settings.onboarded);

  if (status === 'loading') return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><Loading /></div>;
  if (status === 'error')
    return (
      <div className="main stack" style={{ maxWidth: 520 }}>
        <h1>J.A.R.V.I.S couldn’t start</h1>
        <div className="notice danger" role="alert"><Icon name="warning" /><div>{error}</div></div>
        <button type="button" className="btn primary" onClick={() => location.reload()}>Try again</button>
      </div>
    );

  // Until onboarding is finished, it is the only thing on screen (and in the accessibility tree).
  if (!onboarded)
    return (
      <>
        <Onboarding />
        <ConfirmHost />
        <ToastHost />
      </>
    );

  return (
    <HashRouter>
      <a href="#main" className="sr-only">Skip to content</a>
      <Shortcuts />
      <ScrollReset />
      <div className="shell">
        <Sidebar />
        <div style={{ minWidth: 0 }}>
          <TopBar />
          <Main>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/workspace" element={<Workspace />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/reminders" element={<Reminders />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/writing" element={<Writing />} />
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/search" element={<Search />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Dashboard />} />
              </Routes>
            </Suspense>
          </Main>
        </div>
        <BottomBar />
      </div>
      <EditorHost />
      <ConfirmHost />
      <ToastHost />
    </HashRouter>
  );
}
