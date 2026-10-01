import { beforeEach, describe, expect, it } from 'vitest';
import { parseWhen } from '../nlp/when';
import { interpret, normalize } from '../nlp/interpreter';
import { resetStore, getState } from '../data/store';
import { MemoryRepo } from '../data/adapters';
import * as A from '../services/actions';

// Thursday 1 October 2026, 14:30 local.
const NOW = new Date(2026, 9, 1, 14, 30);

describe('parseWhen', () => {
  const cases: [string, Partial<ReturnType<typeof parseWhen>>][] = [
    ['tomorrow at 10 AM to finish the website', { date: '2026-10-02', time: '10:00', rest: 'to finish the website' }],
    ['at 7 PM to work on the app', { date: '2026-10-01', time: '19:00', rest: 'to work on the app' }],
    ['at 9am', { date: '2026-10-02', time: '09:00' }], // already past today → tomorrow
    ['every Monday at 9 AM to review my projects', { date: '2026-10-05', time: '09:00', recurrence: 'weekly', rest: 'to review my projects' }],
    ['finish the homepage by Friday', { date: '2026-10-02', rest: 'finish the homepage' }],
    ['next Friday', { date: '2026-10-09' }],
    ['Thursday', { date: '2026-10-01' }],
    ['Wednesday', { date: '2026-10-07' }],
    ['in 2 hours', { date: '2026-10-01', time: '16:30' }],
    ['in 3 days', { date: '2026-10-04' }],
    ['on 12 October at 15:00', { date: '2026-10-12', time: '15:00' }],
    ['March 3rd', { date: '2027-03-03' }],
    ['2026-12-24 noon', { date: '2026-12-24', time: '12:00' }],
    ['every weekday at 8:30 am', { recurrence: 'weekdays', time: '08:30', date: '2026-10-02' }],
    ['tonight', { date: '2026-10-01', time: '20:00' }],
    ['day after tomorrow in the morning', { date: '2026-10-03', time: '09:00' }],
    ['call mum', { rest: 'call mum' }],
  ];
  for (const [input, expected] of cases) {
    it(`parses “${input}”`, () => {
      const r = parseWhen(input, NOW);
      for (const [k, v] of Object.entries(expected)) expect(r[k as keyof typeof r]).toBe(v);
    });
  }
});

describe('interpreter', () => {
  beforeEach(() => {
    resetStore(new MemoryRepo());
  });

  it('strips the wake word and politeness', () => {
    expect(normalize('Jarvis, please create a task.')).toBe('create a task');
    expect(normalize('Hey JARVIS remind me')).toBe('remind me');
    expect(normalize('Friday, what’s up', 'Friday')).toBe('what’s up');
  });

  it('turns spoken commands into tool calls', () => {
    const r = interpret('Jarvis, remind me tomorrow at 10 AM to finish the website.', {}, NOW);
    expect(r).toEqual({ kind: 'tools', intent: 'reminder', calls: [{ tool: 'create_reminder', input: { text: 'Finish the website', at: '2026-10-02T10:00', recurrence: 'none' } }] });

    const t = interpret('Create a high-priority task called Finish the landing page due Friday', {}, NOW);
    expect(t.kind === 'tools' && t.calls[0]).toEqual({ tool: 'create_task', input: { title: 'Finish the landing page', priority: 'high', dueDate: '2026-10-02', dueTime: undefined, project: undefined, tags: undefined } });

    const t2 = interpret('Jarvis, create a task to finish the homepage by Friday', {}, NOW);
    expect(t2.kind === 'tools' && t2.calls[0].input).toMatchObject({ title: 'Finish the homepage', dueDate: '2026-10-02' });

    const rec = interpret('Remind me every Monday at 9 AM to review my projects', {}, NOW);
    expect(rec.kind === 'tools' && rec.calls[0].input).toMatchObject({ text: 'Review my projects', at: '2026-10-05T09:00', recurrence: 'weekly' });

    const n = interpret('Jarvis, make a note that I want the homepage to use a minimalist design.', {}, NOW);
    expect(n.kind === 'tools' && n.calls[0]).toEqual({ tool: 'create_note', input: { content: 'I want the homepage to use a minimalist design', project: undefined } });

    const m = interpret('Remember that I prefer working on this project in the evening', {}, NOW);
    expect(m.kind === 'tools' && m.calls[0]).toEqual({ tool: 'save_memory', input: { content: 'I prefer working on this project in the evening', category: 'preferences' } });

    expect(interpret('What do I need to get done today?', {}, NOW)).toMatchObject({ calls: [{ tool: 'get_overview' }] });
    expect(interpret('What’s overdue?', {}, NOW)).toMatchObject({ calls: [{ tool: 'get_tasks', input: { when: 'overdue' } }] });
    expect(interpret('What do I have tomorrow?', {}, NOW)).toMatchObject({ calls: [{ tool: 'get_schedule', input: { from: '2026-10-02', to: '2026-10-02' } }] });
    expect(interpret('What were we working on yesterday?', {}, NOW)).toMatchObject({ calls: [{ tool: 'get_activity', input: { from: '2026-09-30', to: '2026-09-30' } }] });
    expect(interpret('Plan my day', {}, NOW)).toMatchObject({ calls: [{ tool: 'plan_day', input: { date: '2026-10-01' } }] });
    expect(interpret('Delete all my projects', {}, NOW)).toMatchObject({ calls: [{ tool: 'delete_all', input: { kind: 'projects' } }] });
    expect(interpret('Add a meeting Friday at 3 PM', {}, NOW)).toMatchObject({ calls: [{ tool: 'create_event', input: { title: 'Meeting', start: '2026-10-02T15:00' } }] });
    expect(interpret('Create a task for me.', {}, NOW)).toEqual({ kind: 'reply', text: 'What should the task be called?' });
    expect(interpret('Tell me a story about dragons', {}, NOW)).toEqual({ kind: 'unknown' });
  });

  it('resolves projects and follow-ups from context', () => {
    const p = A.createProject({ name: 'Website' });
    const t = interpret('Add a task to fix the footer for the website project tomorrow', {}, NOW);
    expect(t.kind === 'tools' && t.calls[0].input).toMatchObject({ title: 'Fix the footer', project: 'Website', dueDate: '2026-10-02' });
    expect(interpret('How is my website project going?', {}, NOW)).toMatchObject({ calls: [{ tool: 'get_project', input: { project: 'Website' } }] });
    expect(getState().projects[0].id).toBe(p.id);

    const ev = A.createEvent({ title: 'Meeting with Sam', start: new Date(2026, 9, 2, 15).toISOString(), end: new Date(2026, 9, 2, 16).toISOString() });
    const mv = interpret('Move my meeting to 4 PM', {}, NOW);
    expect(mv).toMatchObject({ calls: [{ tool: 'update_event', input: { event: ev.id, start: '2026-10-02T16:00' } }] });

    const task = A.createTask({ title: 'Write report' });
    expect(interpret('Make it urgent', { lastTaskId: task.id }, NOW)).toMatchObject({ calls: [{ tool: 'update_task', input: { task: task.id, priority: 'urgent' } }] });
    expect(interpret('Add this to my work tasks', { previousUserText: 'Call the bank about the mortgage' }, NOW)).toMatchObject({ calls: [{ tool: 'create_task', input: { title: 'Call the bank about the mortgage', tags: ['work'] } }] });
  });
});
