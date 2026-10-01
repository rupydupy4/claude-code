import { Link } from 'react-router-dom';
import { useApp } from '../data/store';
import { isOpen } from '../services/queries';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';

export default function Workspace() {
  const s = useApp();
  const areas = [
    { to: '/assistant', icon: 'message', title: 'Assistant', detail: `${s.conversations.length} conversations` },
    { to: '/tasks', icon: 'tasks', title: 'Tasks', detail: `${s.tasks.filter(isOpen).length} open` },
    { to: '/projects', icon: 'folder', title: 'Projects', detail: `${s.projects.filter((p) => p.status === 'active').length} active` },
    { to: '/calendar', icon: 'calendar', title: 'Calendar', detail: `${s.events.length} events` },
    { to: '/reminders', icon: 'bell', title: 'Reminders', detail: `${s.reminders.filter((r) => !r.done).length} upcoming` },
    { to: '/notes', icon: 'note', title: 'Notes', detail: `${s.notes.length} notes` },
    { to: '/documents', icon: 'file', title: 'Documents', detail: `${s.documents.length} files` },
    { to: '/writing', icon: 'write', title: 'Writing', detail: 'Improve, shorten, rewrite' },
    { to: '/memory', icon: 'brain', title: 'Memory', detail: `${s.memories.length} items` },
    { to: '/activity', icon: 'activity', title: 'Activity', detail: 'Everything that changed' },
    { to: '/search', icon: 'search', title: 'Search', detail: 'Across the workspace' },
    { to: '/settings', icon: 'settings', title: 'Settings', detail: 'Voice, theme, data' },
  ];
  return (
    <div className="stack">
      <PageHeader title="Workspace" subtitle="Every part of your workspace in one place." />
      <div className="cols-3">
        {areas.map((a) => (
          <Link key={a.to} to={a.to} className="panel row nowrap" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="icon-btn" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name={a.icon} /></span>
            <span className="grow">
              <span style={{ display: 'block', fontWeight: 600 }}>{a.title}</span>
              <span className="small faint">{a.detail}</span>
            </span>
            <Icon name="chevron-right" className="faint" />
          </Link>
        ))}
      </div>
    </div>
  );
}
