import type { State } from '../data/store';
import { words } from '../utils/ids';

export interface SearchHit {
  type: 'task' | 'project' | 'note' | 'conversation' | 'memory' | 'document' | 'event' | 'reminder';
  id: string;
  title: string;
  snippet: string;
  link: string;
  score: number;
}

function snippetAround(text: string, terms: string[], len = 140): string {
  const lower = text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 40);
  return (start > 0 ? '…' : '') + text.slice(start, start + len).replace(/\s+/g, ' ').trim() + (start + len < text.length ? '…' : '');
}

function score(title: string, body: string, terms: string[], phrase: string): number {
  const t = title.toLowerCase(), b = body.toLowerCase();
  let s = 0;
  if (t.includes(phrase)) s += 10;
  if (b.includes(phrase)) s += 4;
  for (const w of terms) {
    if (t.includes(w)) s += 3;
    if (b.includes(w)) s += 1;
  }
  return terms.every((w) => t.includes(w) || b.includes(w)) ? s : 0;
}

/** Searches every area of the workspace. All terms must appear; title matches rank higher. */
export function globalSearch(s: Pick<State, 'tasks' | 'projects' | 'notes' | 'conversations' | 'memories' | 'documents' | 'events' | 'reminders'>, query: string, limit = 50): SearchHit[] {
  const phrase = query.trim().toLowerCase();
  const terms = words(phrase);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  const add = (type: SearchHit['type'], id: string, title: string, body: string, link: string) => {
    const sc = score(title, body, terms, phrase);
    if (sc > 0) hits.push({ type, id, title, snippet: snippetAround(body || title, terms), link, score: sc });
  };
  s.tasks.forEach((t) => add('task', t.id, t.title, [t.description, t.notes, t.tags.join(' ')].join(' '), `/tasks?open=${t.id}`));
  s.projects.forEach((p) => add('project', p.id, p.name, p.description, `/projects/${p.id}`));
  s.notes.forEach((n) => add('note', n.id, n.title, `${n.content} ${n.tags.join(' ')}`, `/notes?open=${n.id}`));
  s.conversations.forEach((c) => add('conversation', c.id, c.title, c.searchText, `/assistant?c=${c.id}`));
  s.memories.forEach((m) => add('memory', m.id, m.content.slice(0, 80), `${m.content} ${m.category}`, '/memory'));
  s.documents.forEach((d) => add('document', d.id, d.name, d.summary, `/documents?open=${d.id}`));
  s.events.forEach((e) => add('event', e.id, e.title, `${e.description} ${e.location}`, '/calendar'));
  s.reminders.forEach((r) => add('reminder', r.id, r.text, '', '/reminders'));
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
