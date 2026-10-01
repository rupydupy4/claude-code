import type { Message } from '../domain/types';
import * as A from '../services/actions';
import { saveConversation, saveDocument, updateSettings } from './store';
import { addDays, fromDateKey, todayKey } from '../utils/dates';
import { uid } from '../utils/ids';
import { newConversation } from '../ai/assistant';

/** Realistic example content, every record marked `demo: true` so it can be removed in one step. */
export async function loadDemoData(now = new Date()) {
  const today = todayKey(now);
  const d = (n: number) => addDays(today, n);
  const at = (day: string, time: string) => fromDateKey(day, time).toISOString();

  const site = A.createProject({ name: 'Website redesign', description: 'Rebuild the company website with a cleaner, faster homepage and a new case-studies section.', status: 'active', deadline: d(1) }, true);
  const q4 = A.createProject({ name: 'Q4 planning', description: 'Budget, hiring and goals for next quarter.', status: 'planning', deadline: d(21) }, true);

  A.createTask({ title: 'Finish the homepage layout', priority: 'high', status: 'in_progress', dueDate: today, dueTime: '16:00', projectId: site.id, tags: ['design'] }, true);
  A.createTask({ title: 'Write copy for the About page', priority: 'medium', dueDate: d(1), projectId: site.id, tags: ['writing'] }, true);
  A.createTask({ title: 'Compress hero images', priority: 'low', projectId: site.id }, true);
  A.createTask({ title: 'Review analytics setup', priority: 'medium', status: 'waiting', projectId: site.id, notes: 'Waiting for access from IT.' }, true);
  const done = A.createTask({ title: 'Choose the colour palette', priority: 'medium', projectId: site.id }, true);
  A.completeTask(done.id);
  A.createTask({ title: 'Send invoice to Northwind', priority: 'urgent', dueDate: d(-1), tags: ['admin'] }, true);
  A.createTask({ title: 'Draft Q4 budget outline', priority: 'high', dueDate: d(3), projectId: q4.id }, true);
  A.createTask({ title: 'Book dentist appointment', priority: 'low', tags: ['personal'] }, true);

  A.createNote({ title: 'Homepage direction', content: 'Keep the homepage minimalist: one headline, one call to action, three case studies. Avoid carousels.', tags: ['design'], projectId: site.id }, true);
  A.createNote({ title: 'Q4 hiring ideas', content: 'Consider a part-time content writer and a contract developer for the case-studies build.', tags: ['hiring'], projectId: q4.id }, true);

  A.createReminder({ text: 'Review my projects', at: at(nextMonday(today), '09:00'), recurrence: 'weekly' }, true);
  const evening = at(today, '19:00');
  A.createReminder({ text: 'Work on the app', at: evening > now.toISOString() ? evening : at(d(1), '19:00') }, true);

  A.createEvent({ title: 'Project review', start: at(today, '18:00'), end: at(today, '18:45'), location: 'Video call', projectId: site.id, reminderMinutes: 10 }, true);
  A.createEvent({ title: 'Design sync with Priya', start: at(d(1), '10:00'), end: at(d(1), '10:30'), projectId: site.id }, true);
  A.createEvent({ title: 'Q4 budget meeting', start: at(d(3), '15:00'), end: at(d(3), '16:00'), projectId: q4.id }, true);

  A.saveMemory('I prefer concise reports with a short summary first.', 'preferences', true);
  A.saveMemory('I usually work on the website project in the evening.', 'projects', true);

  const brief = `Website redesign brief\n\nGoal: launch a faster, simpler homepage by ${d(1)}.\n\nRequirements:\n- The homepage must load in under two seconds on mobile.\n- Prepare three case studies with client approval.\n- Send the final copy to Priya for review by ${d(1)}.\n- Update the analytics configuration before launch.\n\nOut of scope: the blog redesign, which moves to next quarter.`;
  const docId = uid();
  await saveDocument({ id: docId, createdAt: now.toISOString(), updatedAt: now.toISOString(), demo: true, name: 'Website brief (example).txt', mimeType: 'text/plain', size: brief.length, textLength: brief.length, truncated: false, summary: 'A brief for launching a faster, simpler homepage with three case studies; the blog redesign is out of scope.', projectId: site.id }, brief);

  const conv = newConversation('Planning the website launch', true);
  const msgs: Message[] = [
    { id: uid(), role: 'user', content: 'Help me plan the website launch.', createdAt: new Date(now.getTime() - 86400_000).toISOString() },
    { id: uid(), role: 'assistant', content: 'The launch depends on three things: finishing the homepage layout, writing the About copy and getting analytics access. The homepage is the critical path, so I suggest finishing it first, then the copy. I’ve noted that you prefer the homepage to stay minimalist.', createdAt: new Date(now.getTime() - 86390_000).toISOString(), tools: [{ name: 'get_project', summary: 'Reviewed project “Website redesign”', ok: true }] },
  ];
  await saveConversation(conv, msgs);
  await updateSettings({ demoLoaded: true });
}

function nextMonday(today: string) {
  const dow = fromDateKey(today).getDay();
  return addDays(today, ((8 - dow) % 7) || 7);
}
