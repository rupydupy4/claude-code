import type { MemoryCategory, Priority } from '../domain/types';
import { getState } from '../data/store';
import { resolve } from '../services/queries';
import { addDays, localDateOf, localTimeOf, startOfWeek, todayKey } from '../utils/dates';
import { parseWhen } from './when';

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
}

/** What the last command referred to, so follow-ups like “make it urgent” work. */
export interface InterpreterContext {
  lastTaskId?: string;
  lastEventId?: string;
  lastNoteId?: string;
  lastReminderId?: string;
  lastProjectId?: string;
  /** Previous user message, for “add this to my tasks”. */
  previousUserText?: string;
  /** Most recently attached/opened document. */
  documentId?: string;
}

export type Interpretation =
  | { kind: 'tools'; calls: ToolCall[]; intent: string }
  | { kind: 'reply'; text: string }
  | { kind: 'unknown' };

const WAKE = /^\s*(?:(?:hey|ok|okay|hi)\s+)?(?:jarvis|j\.a\.r\.v\.i\.s\.?)[\s,.:!-]*/i;
const POLITE = /^(?:please\s+|can you\s+|could you\s+|would you\s+|will you\s+|i need you to\s+|i want you to\s+|go ahead and\s+)+/i;

/** Removes the wake word (any assistant name) and polite prefixes. */
export function normalize(text: string, assistantName = 'JARVIS'): string {
  let t = text.trim();
  const name = assistantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  t = t.replace(new RegExp(`^\\s*(?:(?:hey|ok|okay|hi)\\s+)?${name}[\\s,.:!-]*`, 'i'), '').replace(WAKE, '');
  t = t.replace(POLITE, '').replace(/\s*\?+$/, '?').replace(/[.!]+$/, '').trim();
  return t;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/^(?:to|about|that|for|called|named|:)\s+/i, '').replace(/\s+(?:due|by|on|at|for|before)$/i, '').replace(/^["“']|["”']$/g, '').trim();

function priorityIn(text: string): { priority?: Priority; rest: string } {
  const m = /\b(?:(low|medium|normal|high|top|urgent)[- ]priority|(urgent|important|asap|critical))\b/i.exec(text);
  if (!m) return { rest: text };
  const w = (m[1] ?? m[2]).toLowerCase();
  const priority: Priority = w === 'low' ? 'low' : w === 'medium' || w === 'normal' ? 'medium' : w === 'urgent' || w === 'asap' || w === 'critical' ? 'urgent' : 'high';
  return { priority, rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
}

function projectIn(text: string): { project?: string; rest: string } {
  const m = /\s+(?:for|in|to|under)\s+(?:the\s+|my\s+)?(.+?)\s+project\b/i.exec(text) ?? /\s+(?:in|to)\s+project\s+(.+)$/i.exec(text);
  if (!m) return { rest: text };
  const r = resolve(getState().projects, m[1], (p) => p.name, 'project');
  if ('error' in r) return { rest: text };
  return { project: r.item.name, rest: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() };
}

function guessCategory(text: string): MemoryCategory {
  if (/\b(prefer|like|love|hate|dislike|usually|always|never|favourite|favorite)\b/i.test(text)) return 'preferences';
  if (/\bproject\b/i.test(text)) return 'projects';
  if (/\b(my (boss|manager|client|colleague|partner|wife|husband|friend|team)|works? (at|for|with))\b/i.test(text)) return 'people';
  if (/\b(always|don't|do not|make sure|should)\b/i.test(text)) return 'instructions';
  if (/\b(work|job|office|meeting|client)\b/i.test(text)) return 'work';
  return 'important';
}

function dateRangeFor(text: string, now: Date): { from: string; to: string } | null {
  const today = todayKey(now);
  if (/\bthis week\b/i.test(text)) return { from: startOfWeek(today), to: addDays(startOfWeek(today), 6) };
  if (/\bnext week\b/i.test(text)) { const s = addDays(startOfWeek(today), 7); return { from: s, to: addDays(s, 6) }; }
  if (/\byesterday\b/i.test(text)) return { from: addDays(today, -1), to: addDays(today, -1) };
  if (/\blast week\b/i.test(text)) { const s = addDays(startOfWeek(today), -7); return { from: s, to: addDays(s, 6) }; }
  const w = parseWhen(text, now);
  if (w.date) return { from: w.date, to: w.date };
  if (/\btoday\b/i.test(text)) return { from: today, to: today };
  return null;
}

/**
 * Maps a request to tool calls without AI. Handles the common commands from the product spec;
 * anything else is “unknown” so the caller can ask the AI (when available) or explain.
 */
export function interpret(raw: string, ctx: InterpreterContext = {}, now = new Date()): Interpretation {
  const assistant = getState().settings.assistantName || 'JARVIS';
  const text = normalize(raw, assistant);
  const t = text.toLowerCase();
  if (!t) return { kind: 'reply', text: 'I’m listening.' };
  const today = todayKey(now);
  const tools = (intent: string, ...calls: ToolCall[]): Interpretation => ({ kind: 'tools', calls, intent });
  let m: RegExpExecArray | null;

  // ---------- memory
  if ((m = /^(?:please\s+)?remember(?:\s+that)?\s+(.+)/i.exec(text)) && !/^remember\s+(?:me|to\b)/i.test(text)) {
    return tools('remember', { tool: 'save_memory', input: { content: cap(m[1]), category: guessCategory(m[1]) } });
  }
  if ((m = /^(?:forget|stop remembering)(?:\s+that|\s+about)?\s+(.+)/i.exec(text))) {
    return tools('forget', { tool: 'delete_memory', input: { memory: m[1] } });
  }
  if (/^what (?:do you|did you) (?:remember|know)(?: about (?:me|.+))?\??$/i.test(text) || /^(?:show|list) (?:my )?memor(?:y|ies)$/i.test(t)) {
    const q = /about (.+?)\??$/i.exec(text)?.[1];
    return tools('memories', { tool: 'search_memory', input: q && !/^me$/i.test(q) ? { query: q } : {} });
  }

  // ---------- reminders
  if ((m = /^remind me\s+(.+)/i.exec(text))) {
    const w = parseWhen(m[1], now);
    let what = w.rest.replace(/^(?:to|about|that)\s+/i, '');
    what = what.replace(/\s+(?:to|about)\s+/, ' ').trim();
    const tm = /(?:^|\s)(?:to|about|that)\s+(.+)$/i.exec(w.rest);
    if (tm) what = tm[1];
    what = clean(what);
    if (!w.date && !w.time && !w.recurrence) return { kind: 'reply', text: 'When should I remind you? For example, “tomorrow at 9 AM”.' };
    if (!what) return { kind: 'reply', text: 'What should I remind you about?' };
    const at = `${w.date ?? today}T${w.time ?? '09:00'}`;
    return tools('reminder', { tool: 'create_reminder', input: { text: cap(what), at, recurrence: w.recurrence ?? 'none' } });
  }

  // ---------- notes
  if ((m = /^(?:make|take|add|create|write|jot down|save)\s+(?:a\s+|me\s+a\s+)?note(?:\s+that|\s+about|\s+saying|:)?\s+(.+)/i.exec(text)) || (m = /^note(?:\s+that|:)\s+(.+)/i.exec(text))) {
    const pj = projectIn(m[1]);
    return tools('note', { tool: 'create_note', input: { content: cap(pj.rest), project: pj.project } });
  }
  if ((m = /^(?:search|find|look (?:through|in)|check) (?:my )?notes (?:for|about|on)\s+(.+)/i.exec(text))) {
    return tools('search notes', { tool: 'search_notes', input: { query: m[1] } });
  }

  // ---------- projects
  if ((m = /^(?:create|start|add|make|set up|new)(?:\s+a|\s+an)?(?:\s+new)?\s+project(?:\s+called|\s+named|:)?\s+(.+)/i.exec(text))) {
    const w = parseWhen(m[1], now);
    return tools('project', { tool: 'create_project', input: { name: cap(clean(w.rest.replace(/\s+(?:with a )?deadline\b.*$/i, ''))), deadline: w.date } });
  }
  if (/^(?:what are|show|list)(?: me)? my (?:current |active |open )?projects\??$/i.test(text) || /^what projects/i.test(t)) {
    return tools('projects', { tool: 'get_projects', input: { status: 'all' } });
  }
  if ((m = /^(?:how(?:'s| is)|what(?:'s| is) the status of|status of|update on|how are things (?:going )?(?:with|on))\s+(?:my |the )?(.+?)(?:\s+project)?(?:\s+going)?\??$/i.exec(text))) {
    const r = resolve(getState().projects, m[1], (p) => p.name, 'project');
    if ('item' in r) return tools('project status', { tool: 'get_project', input: { project: r.item.name } });
  }

  // ---------- delete (always confirmed by the tool)
  if ((m = /^(?:delete|remove|clear|erase)\s+(?:all|every(?:thing)?)\s+(?:of\s+)?(?:my\s+|the\s+)?(completed tasks|done tasks|tasks|projects|notes|reminders|events|meetings|memories)$/i.exec(text))) {
    const map: Record<string, string> = { 'done tasks': 'completed_tasks', 'completed tasks': 'completed_tasks', meetings: 'events' };
    const kind = map[m[1].toLowerCase()] ?? m[1].toLowerCase();
    return tools('delete all', { tool: 'delete_all', input: { kind } });
  }
  if ((m = /^(?:delete|remove|cancel|get rid of)\s+(?:my\s+|the\s+|that\s+)?(reminder|task|note|event|meeting|appointment|project)(?:\s+(?:called|named|about|to|for|on))?\s*(.*)$/i.exec(text))) {
    const kind = m[1].toLowerCase();
    let ref = m[2].trim();
    const toolFor: Record<string, [string, string, keyof InterpreterContext]> = {
      reminder: ['delete_reminder', 'reminder', 'lastReminderId'], task: ['delete_task', 'task', 'lastTaskId'], note: ['delete_note', 'note', 'lastNoteId'],
      event: ['delete_event', 'event', 'lastEventId'], meeting: ['delete_event', 'event', 'lastEventId'], appointment: ['delete_event', 'event', 'lastEventId'], project: ['delete_project', 'project', 'lastProjectId'],
    };
    const [tool, key, ctxKey] = toolFor[kind];
    if (!ref) ref = (ctx[ctxKey] as string | undefined) ?? (kind === 'meeting' ? 'meeting' : '');
    if (!ref) return { kind: 'reply', text: `Which ${kind} should I delete?` };
    return tools('delete', { tool, input: { [key]: ref } });
  }
  if (/^(?:delete|remove|cancel) it$/i.test(text)) {
    if (ctx.lastTaskId) return tools('delete', { tool: 'delete_task', input: { task: ctx.lastTaskId } });
    if (ctx.lastEventId) return tools('delete', { tool: 'delete_event', input: { event: ctx.lastEventId } });
    if (ctx.lastReminderId) return tools('delete', { tool: 'delete_reminder', input: { reminder: ctx.lastReminderId } });
    if (ctx.lastNoteId) return tools('delete', { tool: 'delete_note', input: { note: ctx.lastNoteId } });
  }

  // ---------- events
  if ((m = /^(?:add|schedule|create|book|put|set up|arrange)\s+(?:a\s+|an\s+|my\s+)?(meeting|call|event|appointment|session|interview|review|lunch|catch-?up)\b(.*)$/i.exec(text))) {
    const w = parseWhen(m[2], now);
    if (!w.date && !w.time) return { kind: 'reply', text: `When is the ${m[1].toLowerCase()}?` };
    const rest = clean(w.rest.replace(/\b(?:on|at|for|in my calendar|to my calendar|to the calendar)\b/gi, ' '));
    const titleMatch = /(?:called|named|about|re:?)\s+(.+)$/i.exec(rest) ?? /^(with\s+.+)$/i.exec(rest);
    const noun = cap(m[1].toLowerCase());
    const title = titleMatch ? (titleMatch[1].toLowerCase().startsWith('with') ? `${noun} ${titleMatch[1]}` : cap(titleMatch[1])) : rest ? `${noun} ${rest}` : noun;
    return tools('event', { tool: 'create_event', input: { title: title.replace(/\s+/g, ' '), start: `${w.date ?? today}T${w.time ?? '09:00'}` } });
  }
  if ((m = /^(?:move|reschedule|push|shift|change)\s+(?:my\s+|the\s+|that\s+)?(.+?)\s+(?:to|until|till)\s+(.+)$/i.exec(text)) || (m = /^(?:move|push)\s+(it)\s+(?:to\s+)?(.+)$/i.exec(text))) {
    const w = parseWhen(m[2], now);
    if (w.date || w.time) {
      const s = getState();
      const isIt = /^(it|that)$/i.test(m[1]);
      // Prefer events; fall back to tasks.
      const evRef = isIt ? ctx.lastEventId : m[1].replace(/\b(meeting|call|event|appointment)\b/i, '').trim() || m[1];
      const upcoming = s.events.filter((e) => new Date(e.end) >= now).sort((a, b) => (a.start < b.start ? -1 : 1));
      let ev = evRef ? upcoming.find((e) => e.id === evRef) : undefined;
      if (!ev && !isIt) {
        const r = resolve(upcoming, m[1], (e) => e.title, 'event');
        ev = 'item' in r ? r.item : /\b(meeting|call|event|appointment)\b/i.test(m[1]) ? upcoming.find((e) => /meeting|call|appointment/i.test(e.title)) ?? upcoming[0] : undefined;
      }
      if (ev && (!isIt || ctx.lastEventId)) {
        const date = w.explicitDate && w.date ? w.date : localDateOf(ev.start);
        return tools('move event', { tool: 'update_event', input: { event: ev.id, start: `${date}T${w.time ?? localTimeOf(ev.start)}` } });
      }
      const taskRef = isIt ? ctx.lastTaskId : m[1];
      if (taskRef) {
        const r = resolve(s.tasks, taskRef, (x) => x.title, 'task');
        if ('item' in r) return tools('move task', { tool: 'update_task', input: { task: r.item.id, dueDate: (w.explicitDate ? w.date : r.item.dueDate ?? w.date) ?? today, dueTime: w.time } });
      }
    }
  }

  // ---------- tasks
  if ((m = /^(?:create|add|make|new|set up|put)(?:\s+me)?(?:\s+a|\s+an)?(?:\s+new)?(?:\s+((?:low|medium|high|urgent)(?:[- ]priority)?))?\s+(?:task|to-?do|todo)(?:\s+(?:for me|item))?(?:\s+(?:called|named|titled|to|for)|:)?\s*(.*)$/i.exec(text))) {
    let body = m[2].trim();
    if (!body || /^(?:for me)$/i.test(body)) {
      if (ctx.previousUserText && /\b(this|that)\b/i.test(raw)) body = ctx.previousUserText;
      else return { kind: 'reply', text: 'What should the task be called?' };
    }
    return createTaskFrom(body, m[1], now, tools);
  }
  if ((m = /^add\s+(.+?)\s+to\s+(?:my\s+)?(?:work\s+|personal\s+)?(?:tasks|task list|to-?do(?: list)?|todos)$/i.exec(text))) {
    let body = m[1];
    if (/^(this|that|it)$/i.test(body)) {
      if (!ctx.previousUserText) return { kind: 'reply', text: 'I don’t have enough information to know what “this” refers to. What should the task say?' };
      body = ctx.previousUserText;
    }
    const tags = /\bwork\b/i.test(text) ? ['work'] : /\bpersonal\b/i.test(text) ? ['personal'] : [];
    return createTaskFrom(body, undefined, now, tools, tags);
  }
  if ((m = /^(?:make|set|mark)\s+(?:it|that|the task)\s+(?:as\s+)?((?:low|medium|high|urgent)(?:[- ]priority)?|urgent|important)$/i.exec(text)) && ctx.lastTaskId) {
    return tools('priority', { tool: 'update_task', input: { task: ctx.lastTaskId, priority: priorityIn(m[1] + (/priority/.test(m[1]) ? '' : ' priority')).priority ?? 'high' } });
  }
  if ((m = /^(?:mark|tick off|check off|complete|finish|close|done with)\s+(?:my\s+|the\s+)?(?:task\s+)?(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed|finished))?$/i.exec(text)) || (m = /^i(?:'ve| have)?\s+(?:finished|completed|done)\s+(?:the\s+|my\s+)?(?:task\s+)?(.+)$/i.exec(text))) {
    let ref = m[1].trim();
    if (/^(it|that|this)$/i.test(ref)) ref = ctx.lastTaskId ?? '';
    if (!ref) return { kind: 'reply', text: 'Which task did you finish?' };
    return tools('complete', { tool: 'complete_task', input: { task: ref } });
  }

  // ---------- questions about the day, schedule and tasks
  if (/\b(plan (?:out )?(?:my|the) (?:day|morning|afternoon)|plan (?:my )?(?:tomorrow|today))\b/i.test(t)) {
    return tools('plan', { tool: 'plan_day', input: { date: /tomorrow/i.test(t) ? addDays(today, 1) : today } });
  }
  if (/\b(overdue|late|past due|missed deadline)/i.test(t) && /\b(what|which|show|list|any)\b/i.test(t)) {
    return tools('overdue', { tool: 'get_tasks', input: { when: 'overdue' } });
  }
  if (/^(?:what (?:do i|should i|have i got to|must i) (?:need to )?(?:do|get done|work on|focus on)|what(?:'s| is) (?:on )?(?:my plate|for today|on today)|what needs (?:my attention|doing)|(?:give me )?(?:my|a|the) (?:daily )?(?:briefing|overview|rundown|summary)|good morning)\b/i.test(t) && !/\btomorrow\b/i.test(t)) {
    return tools('overview', { tool: 'get_overview', input: {} });
  }
  if (/\b(schedule|calendar|agenda|what do i have|what(?:'s| is) on|anything on|am i free|meetings?)\b/i.test(t) && /\b(what|show|list|any|do i|am i)\b/i.test(t)) {
    const range = dateRangeFor(text, now) ?? { from: today, to: today };
    return tools('schedule', { tool: 'get_schedule', input: range });
  }
  if ((m = /^(?:show|list|what are|what's|what is|give me)(?: me)?(?: all)? my (?:open |outstanding |remaining |current )?(?:(high|urgent|low)[- ]priority )?(?:tasks|to-?dos|todo list)(?:\s+(?:for|in)\s+(?:the\s+)?(.+?)(?:\s+project)?)?(?:\s+(today|tomorrow|this week))?\??$/i.exec(text))) {
    const input: Record<string, unknown> = { status: 'open' };
    if (m[1]) input.priority = m[1].toLowerCase();
    if (m[2] && !/^(today|tomorrow|this week)$/i.test(m[2])) input.project = m[2];
    const when = (m[3] ?? (/^(today|tomorrow|this week)$/i.test(m[2] ?? '') ? m[2] : '')).toLowerCase();
    if (when) input.when = when === 'this week' ? 'this_week' : when;
    return tools('tasks', { tool: 'get_tasks', input });
  }
  if (/^(?:show|list|what are)(?: me)? my (?:upcoming )?reminders\??$/i.test(text)) return tools('reminders', { tool: 'get_reminders', input: {} });
  if (/\b(what (?:were we|was i|did i|have i been|did we) (?:working on|work on|do|doing|been doing)|what did i (?:get done|accomplish|complete))\b/i.test(t)) {
    const range = dateRangeFor(text, now) ?? { from: addDays(today, -1), to: today };
    return tools('activity', { tool: 'get_activity', input: range });
  }
  if ((m = /^what (?:did|have) (?:i|we) (?:say|said|write|written|note|noted|decide|decided|discuss|discussed)(?: about| on| regarding)?\s+(.+?)\??$/i.exec(text))) {
    return tools('recall', { tool: 'search_everything', input: { query: m[1].replace(/\b(last|this) (week|month)\b|\byesterday\b/gi, '').replace(/^(?:the|my)\s+/i, '').replace(/\s+project$/i, '').trim() } });
  }
  if ((m = /^(?:search|find|look up|look for)\s+(?:for\s+|my\s+(?:workspace|stuff|everything)\s+for\s+)?(.+)$/i.exec(text)) && !/\b(web|internet|online|google)\b/i.test(t)) {
    return tools('search', { tool: 'search_everything', input: { query: m[1] } });
  }
  if ((m = /^(?:summari[sz]e|tl;?dr|what matters in|tell me what (?:matters|i (?:actually )?need to do) (?:in|from|here)|extract (?:the )?(?:action items|tasks) from)\s*(?:this|the|my)?\s*(?:document|doc|file|brief|pdf)?\s*(.*)$/i.exec(text))) {
    const name = m[1].trim();
    const docRef = name || ctx.documentId || getState().documents[0]?.id;
    if (docRef) return tools('document', { tool: 'get_document', input: { document: docRef } });
    return { kind: 'reply', text: 'Upload a document first (Documents, or the paperclip in the chat), then ask me to summarise it.' };
  }

  // ---------- small talk and help
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|yo)\b[\s!.]*$/i.test(t)) return { kind: 'reply', text: 'Hello. What would you like to work on?' };
  if (/^(thanks|thank you|cheers|great|perfect|ok|okay)\b/i.test(t)) return { kind: 'reply', text: 'Anything else?' };
  if (/^(help|what can you do|commands|how do i use (?:you|this))\??$/i.test(t)) {
    return {
      kind: 'reply',
      text: 'Here are some things you can ask:\n- “Create a high-priority task to finish the landing page due Friday”\n- “Remind me tomorrow at 10 AM to call Sam”\n- “Make a note that the homepage should be minimal”\n- “Add a meeting Friday at 3 PM”, then “Move it to 4 PM”\n- “What do I need to do today?”, “What’s overdue?”, “Plan my day”\n- “Remember that I prefer concise reports”\n- “How is my website project going?”',
    };
  }
  return { kind: 'unknown' };
}

function createTaskFrom(body: string, priorityWord: string | undefined, now: Date, tools: (intent: string, ...calls: ToolCall[]) => Interpretation, tags: string[] = []): Interpretation {
  const pr = priorityIn(`${priorityWord ? priorityWord + (/priority/.test(priorityWord) ? '' : ' priority') + ' ' : ''}${body}`);
  const pj = projectIn(pr.rest);
  const w = parseWhen(pj.rest, now);
  let title = clean(w.rest.replace(/\s+(?:due|by|before|on|for)\s*$/i, '').replace(/\s+(?:due|by|before)\s+/i, ' '));
  title = title.replace(/^(?:to\s+)/i, '');
  if (!title) return { kind: 'reply', text: 'What should the task be called?' };
  return tools('task', {
    tool: 'create_task',
    input: { title: cap(title), priority: pr.priority, dueDate: w.date, dueTime: w.time, project: pj.project, tags: tags.length ? tags : undefined },
  });
}
