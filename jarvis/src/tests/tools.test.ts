import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepo, IndexedDbRepo, ClaudeDbRepo, type ClaudeDb } from '../data/adapters';
import { getState, initStore, resetStore, saveConversation, removeDemoData, MAX_ACTIVITY, logActivity } from '../data/store';
import { runTool, TOOLS } from '../tools/registry';
import { validateInput } from '../tools/validate';
import * as A from '../services/actions';
import { computeInsights } from '../services/insights';
import { planDay } from '../services/planner';
import { globalSearch } from '../services/search';
import { afterFiring, dueReminders } from '../services/reminders';
import { nextOccurrence, todayKey, addDays } from '../utils/dates';
import { SpeechStreamer, toSpeakable, type VoiceService } from '../voice/VoiceService';
import { analyseLocally } from '../services/documents';
import { resolve } from '../services/queries';
import { loadDemoData } from '../data/demo';

const now = new Date();
const today = todayKey(now);

beforeEach(() => resetStore(new MemoryRepo()));

describe('tool validation and safety', () => {
  it('rejects bad and unknown input, coerces types and drops undeclared fields', async () => {
    const schema = TOOLS.find((t) => t.name === 'create_task')!.schema;
    expect(() => validateInput(schema, {})).toThrow(/title/);
    expect(() => validateInput(schema, { title: 'x', priority: 'extreme' })).toThrow(/priority/);
    expect(validateInput(schema, { title: '  Hi  ', sql: 'DROP TABLE', tags: 'a, b' })).toEqual({ title: 'Hi', tags: ['a', 'b'] });
    expect((await runTool('create_task', { title: 'x', dueDate: '2026-02-30' }, { now })).ok).toBe(false);
    expect((await runTool('drop_database', {}, { now })).summary).toMatch(/Unknown action/);
    expect((await runTool('create_task', 'not an object', { now })).ok).toBe(false);
  });

  it('creates, updates and completes tasks and records activity', async () => {
    const r = await runTool('create_task', { title: 'Finish the landing page', priority: 'high', dueDate: addDays(today, 2) }, { now });
    expect(r.ok).toBe(true);
    expect(getState().tasks[0]).toMatchObject({ title: 'Finish the landing page', priority: 'high', status: 'not_started' });
    await runTool('update_task', { task: 'landing page', status: 'in_progress' }, { now });
    expect(getState().tasks[0].status).toBe('in_progress');
    await runTool('complete_task', { task: 'Finish the landing page' }, { now });
    expect(getState().tasks[0].status).toBe('completed');
    expect(getState().tasks[0].completedAt).toBeTruthy();
    expect(getState().activity.map((a) => a.verb)).toEqual(['completed', 'updated', 'created']);
  });

  it('never deletes without confirmation', async () => {
    A.createTask({ title: 'Old task' });
    const first = await runTool('delete_task', { task: 'Old task' }, { now });
    expect(first.pending).toBeTruthy();
    expect(getState().tasks).toHaveLength(1);
    await runTool(first.pending!.tool, first.pending!.input, { now, confirmed: true });
    expect(getState().tasks).toHaveLength(0);

    A.createProject({ name: 'A' });
    A.createProject({ name: 'B' });
    const all = await runTool('delete_all', { kind: 'projects' }, { now });
    expect(all.pending?.description).toBe('Delete all 2 projects');
    expect(getState().projects).toHaveLength(2);
  });

  it('reports ambiguity instead of guessing', () => {
    A.createTask({ title: 'Email Sam about budget' });
    A.createTask({ title: 'Email Sam about hiring' });
    const r = resolve(getState().tasks, 'email sam', (t) => t.title, 'task');
    expect('error' in r && r.error).toMatch(/More than one task/);
    expect('item' in resolve(getState().tasks, 'hiring', (t) => t.title, 'task')).toBe(true);
  });

  it('refuses reminders in the past and secrets in memory', async () => {
    expect((await runTool('create_reminder', { text: 'x', at: '2020-01-01T09:00' }, { now })).ok).toBe(false);
    expect((await runTool('save_memory', { content: 'My password is hunter2' }, { now })).ok).toBe(false);
    expect((await runTool('save_memory', { content: 'Prefer concise reports', category: 'preferences' }, { now })).ok).toBe(true);
  });

  it('moves an event and keeps its length', async () => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 15);
    A.createEvent({ title: 'Design review', start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() });
    const r = await runTool('update_event', { event: 'design review', start: `${addDays(today, 2)}T16:00` }, { now });
    expect(r.ok).toBe(true);
    const e = getState().events[0];
    expect(new Date(e.start).getHours()).toBe(16);
    expect(new Date(e.end).getTime() - new Date(e.start).getTime()).toBe(30 * 60_000);
  });

  it('reports that web research is unavailable instead of inventing results', async () => {
    const r = await runTool('search_web', { query: 'latest news' }, { now });
    expect(r.ok).toBe(false);
    expect((r.data as { available: boolean }).available).toBe(false);
  });
});

describe('insights, planning, search and reminders', () => {
  it('surfaces a project due tomorrow with unfinished tasks, and overdue work', () => {
    const p = A.createProject({ name: 'Launch', deadline: addDays(today, 1) });
    A.createTask({ title: 'A', projectId: p.id });
    A.createTask({ title: 'B', projectId: p.id });
    A.createTask({ title: 'C', projectId: p.id });
    A.createTask({ title: 'Late', dueDate: addDays(today, -2) });
    const ins = computeInsights(getState(), now);
    expect(ins[0].text).toBe('Launch is due tomorrow. 3 tasks are still unfinished.');
    expect(ins.some((i) => /“Late” is overdue/.test(i.text))).toBe(true);
    expect(computeInsights({ tasks: [], projects: [], notes: [], events: [], reminders: [] }, now)).toEqual([]);
  });

  it('plans a day around fixed events, most important tasks first', () => {
    const day = addDays(today, 1);
    A.createTask({ title: 'Low thing', priority: 'low', dueDate: day });
    A.createTask({ title: 'Urgent thing', priority: 'urgent', dueDate: day });
    A.createEvent({ title: 'Standup', start: new Date(`${day}T09:00`).toISOString(), end: new Date(`${day}T09:30`).toISOString() });
    const plan = planDay(getState(), day, now);
    const titles = plan.blocks.filter((b) => b.kind !== 'break').map((b) => `${b.start} ${b.title}`);
    expect(titles[0]).toBe('09:00 Standup');
    expect(titles[1]).toBe('09:30 Urgent thing');
    expect(titles[2]).toMatch(/Low thing/);
  });

  it('searches every area', () => {
    A.createTask({ title: 'Redesign website header' });
    A.createNote({ title: 'Ideas', content: 'The website should feel calm' });
    A.saveMemory('My website is built with Astro', 'projects');
    const hits = globalSearch(getState(), 'website');
    expect(hits.map((h) => h.type).sort()).toEqual(['memory', 'note', 'task']);
  });

  it('fires reminders once and moves recurring ones forward', () => {
    const at = new Date(now.getTime() - 60_000).toISOString();
    const r = A.createReminder({ text: 'Stand up', at, recurrence: 'daily' });
    expect(dueReminders(getState().reminders, now)).toHaveLength(1);
    const patch = afterFiring(r, now);
    expect(new Date(patch.at!).getTime()).toBe(new Date(at).getTime() + 86400_000);
    expect(afterFiring({ ...r, recurrence: 'none' }, now)).toMatchObject({ done: true });
    expect(nextOccurrence('2026-01-31T09:00:00', 'monthly', new Date('2026-02-01T00:00:00'))!.getDate()).toBe(28);
    const fri = new Date(2026, 9, 2, 9);
    expect(nextOccurrence(fri.toISOString(), 'weekdays', fri)!.getDay()).toBe(1);
  });
});

describe('voice helpers and documents', () => {
  it('speaks complete sentences as text streams in', () => {
    const said: string[] = [];
    const fake = { enqueueSpeech: (t: string) => said.push(t) } as unknown as VoiceService;
    const s = new SpeechStreamer(fake);
    s.update('You have three');
    s.update('You have three tasks today. The first');
    s.update('You have three tasks today. The first is due at 4 PM. Then');
    s.finish('You have three tasks today. The first is due at 4 PM. Then a review.');
    expect(said).toEqual(['You have three tasks today.', 'The first is due at 4 PM.', 'Then a review.']);
    expect(toSpeakable('**Done.** See [docs](https://x.y) - item')).toBe('Done. See docs - item');
  });

  it('extracts summaries, action items and deadlines offline', () => {
    const a = analyseLocally('Project brief. We are rebuilding the site.\n- Send the final copy to Priya by 12 October.\n- The homepage must load fast.\nThe deadline is 20 October 2026.', new Date(2026, 9, 1));
    expect(a.summary).toMatch(/Project brief/);
    expect(a.actionItems.map((x) => x.title)).toContain('Send the final copy to Priya by 12 October.');
    expect(a.actionItems.find((x) => /Priya/.test(x.title))?.dueDate).toBe('2026-10-12');
    expect(a.deadlines.some((d) => d.date === '2026-10-20')).toBe(true);
  });
});

describe('storage', () => {
  it('IndexedDB adapter round-trips records and settings', async () => {
    const repo = await IndexedDbRepo.open(`test-${Math.random()}`);
    await initStore(repo);
    A.createTask({ title: 'Persist me' });
    await new Promise((r) => setTimeout(r, 30));
    resetStore(new MemoryRepo());
    await initStore(repo);
    expect(getState().tasks.map((t) => t.title)).toEqual(['Persist me']);
    await repo.clearAll();
    expect(await repo.list('tasks')).toEqual([]);
  });

  it('Claude database adapter keeps each user’s data under their private path', async () => {
    const docs = new Map<string, Record<string, unknown>>();
    const docRef = (path: string): ReturnType<ClaudeDb['doc']> => ({
      get: async () => ({ id: path.split('/').pop()!, exists: docs.has(path), data: () => docs.get(path) }),
      set: async (d) => { docs.set(path, d); },
      delete: async () => { docs.delete(path); },
      collection: (sub) => colRef(`${path}/${sub}`),
    });
    const colRef = (path: string): ReturnType<ClaudeDb['collection']> => ({
      doc: (id) => docRef(`${path}/${id}`),
      limit: () => colRef(path),
      get: async () => ({ docs: [...docs.keys()].filter((k) => k.startsWith(`${path}/`) && k.split('/').length === path.split('/').length + 1).map((k) => ({ id: k, exists: true, data: () => docs.get(k) })) }),
    });
    const repo = new ClaudeDbRepo({ doc: docRef, collection: colRef }, 'user-1');
    await repo.put('tasks', { id: 't1', title: 'X' } as never);
    expect([...docs.keys()]).toEqual(['data/users/user-1/jarvis/tasks/t1']);
    expect((await repo.list('tasks')).length).toBe(1);
    await repo.clearAll();
    expect(docs.size).toBe(0);
  });

  it('caps activity and conversation size', async () => {
    for (let i = 0; i < MAX_ACTIVITY + 20; i++) logActivity('created', 'task', `t${i}`);
    expect(getState().activity).toHaveLength(MAX_ACTIVITY);
    const conv = { id: 'c', createdAt: '', updatedAt: '', title: 'x', searchText: '', messageCount: 0, lastMessageAt: '' };
    await saveConversation(conv, Array.from({ length: 260 }, (_, i) => ({ id: String(i), role: 'user' as const, content: 'hello '.repeat(5000), createdAt: new Date(i).toISOString() })));
    expect(getState().conversations[0].messageCount).toBe(200);
  });

  it('demo data is complete, marked and removable', async () => {
    await loadDemoData(now);
    await new Promise((r) => setTimeout(r, 20));
    const s = getState();
    expect(s.projects.length).toBeGreaterThan(0);
    expect(s.tasks.every((t) => t.demo)).toBe(true);
    expect(s.conversations).toHaveLength(1);
    A.createTask({ title: 'Mine' });
    await removeDemoData();
    expect(getState().tasks.map((t) => t.title)).toEqual(['Mine']);
    expect(getState().projects).toHaveLength(0);
    expect(getState().conversations).toHaveLength(0);
  });
});
