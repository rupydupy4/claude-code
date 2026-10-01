import { interpret, type InterpreterContext } from '../nlp/interpreter';
import { runTool } from '../tools/registry';
import { analyseLocally } from '../services/documents';
import { AIError, type AIProvider, type ChatRequest } from './AIService';
import { formatDay, formatTime } from '../utils/dates';
import type { ScheduleItem } from '../services/queries';

type TaskBrief = { title: string; priority: string; due: string | null; project: string | null };

function listTasks(tasks: TaskBrief[], max = 8) {
  const lines = tasks.slice(0, max).map((t) => `- ${t.title}${t.due ? ` (due ${t.due})` : ''}${t.priority === 'urgent' || t.priority === 'high' ? ` — ${t.priority}` : ''}`);
  if (tasks.length > max) lines.push(`- …and ${tasks.length - max} more`);
  return lines.join('\n');
}

/** Turns tool results into a natural reply without AI. */
export function composeReply(tool: string, ok: boolean, summary: string, data: unknown): string {
  if (!ok) return summary;
  const d = (data ?? {}) as Record<string, unknown>;
  if ((d as { status?: string }).status === 'awaiting_confirmation') return `${summary.replace(/^Waiting for confirmation: /, '')} — please confirm below.`;
  switch (tool) {
    case 'get_overview': {
      const overdue = d.overdue as TaskBrief[], due = d.dueToday as TaskBrief[], hp = d.highPriorityUndated as TaskBrief[];
      const parts: string[] = [];
      if (!overdue.length && !due.length) parts.push('Nothing is due today.');
      if (due.length) parts.push(`${due.length === 1 ? 'One task is' : `${due.length} tasks are`} due today:\n${listTasks(due)}`);
      if (overdue.length) parts.push(`${overdue.length === 1 ? 'One task is' : `${overdue.length} tasks are`} overdue:\n${listTasks(overdue)}`);
      if (d.schedule && d.schedule !== 'Nothing scheduled.') parts.push(`On your calendar:\n${String(d.schedule).split('\n').map((l) => `- ${l}`).join('\n')}`);
      if (!due.length && hp.length) parts.push(`High-priority work without a date:\n${listTasks(hp, 4)}`);
      return parts.join('\n\n');
    }
    case 'get_tasks': {
      const tasks = d.tasks as TaskBrief[];
      return tasks.length ? `${tasks.length === 1 ? 'One task' : `${tasks.length} tasks`}:\n${listTasks(tasks, 10)}` : 'No tasks match that.';
    }
    case 'get_schedule': {
      const items = d.items as ScheduleItem[];
      if (!items.length) return `Nothing is scheduled ${d.from === d.to ? `for ${formatDay(String(d.from)).toLowerCase()}` : 'in that period'}.`;
      return items.map((i) => `- ${d.from !== d.to ? `${formatDay(i.date)}, ` : ''}${i.time ? formatTime(i.time) : 'any time'}: ${i.kind === 'task' ? 'Due — ' : i.kind === 'reminder' ? 'Reminder — ' : ''}${i.title}`).join('\n');
    }
    case 'get_projects': {
      const ps = d.projects as { name: string; summary: string }[];
      return ps.length ? ps.map((p) => `- ${p.summary}`).join('\n') : 'You have no projects yet.';
    }
    case 'get_project':
      return String(d.summary);
    case 'get_reminders': {
      const rs = d.reminders as { text: string; at: string; recurrence: string }[];
      return rs.length ? rs.map((r) => `- ${r.at}: ${r.text}${r.recurrence !== 'none' ? ` (${r.recurrence})` : ''}`).join('\n') : 'No upcoming reminders.';
    }
    case 'search_notes': {
      const ns = d.notes as { title: string; excerpt: string }[];
      return ns.length ? ns.map((n) => `- **${n.title}**: ${n.excerpt.slice(0, 160)}`).join('\n') : 'No notes match that.';
    }
    case 'search_everything':
    case 'search_conversations': {
      const rs = d.results as { type?: string; title: string; excerpt: string }[];
      return rs.length ? rs.slice(0, 8).map((r) => `- ${r.type ? `${r.type}: ` : ''}**${r.title}** — ${r.excerpt}`).join('\n') : 'I couldn’t find anything about that in your workspace.';
    }
    case 'search_memory': {
      const ms = d.memories as { content: string }[];
      return ms.length ? `Here’s what I remember:\n${ms.map((m) => `- ${m.content}`).join('\n')}` : 'I haven’t been asked to remember anything about that.';
    }
    case 'get_activity': {
      const a = d.activity as string[];
      const c = d.conversations as string[];
      if (!a.length && !c.length) return 'I don’t have any recorded activity for that period.';
      return [a.length ? a.slice(0, 12).map((x) => `- ${x.replace(/^\S+ \S+ /, '')}`).join('\n') : '', c.length ? `Conversations: ${c.join(', ')}` : ''].filter(Boolean).join('\n\n');
    }
    case 'plan_day':
      return `Here’s a draft plan:\n${String(d.plan).split('\n').map((l) => `- ${l}`).join('\n')}`;
    case 'get_document': {
      const a = analyseLocally(String(d.text ?? ''));
      const parts = [`**${d.name}** — quick summary (offline, not AI):`, a.summary];
      if (a.actionItems.length) parts.push(`Possible action items:\n${a.actionItems.slice(0, 8).map((x) => `- ${x.title}${x.dueDate ? ` (by ${x.dueDate})` : ''}`).join('\n')}`);
      if (a.deadlines.length) parts.push(`Dates mentioned:\n${a.deadlines.map((x) => `- ${x.date}: ${x.what}`).join('\n')}`);
      return parts.join('\n\n');
    }
    default:
      return `Done. ${summary}.`;
  }
}

/** Updates follow-up context from a tool run (“make it urgent”, “move it to 4 PM”). */
export function updateContext(ctx: InterpreterContext, tool: string, input: Record<string, unknown>, data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>;
  if (tool === 'create_task' && (d.task as { id?: string })?.id) ctx.lastTaskId = (d.task as { id: string }).id;
  if ((tool === 'update_task' || tool === 'complete_task') && typeof input.task === 'string') ctx.lastTaskId = (d.task as { id?: string })?.id ?? ctx.lastTaskId;
  if (tool === 'create_event' && typeof d.id === 'string') ctx.lastEventId = d.id;
  if (tool === 'update_event' && typeof input.event === 'string') ctx.lastEventId = input.event;
  if (tool === 'create_note' && typeof d.id === 'string') ctx.lastNoteId = d.id;
  if (tool === 'create_project' && typeof d.id === 'string') ctx.lastProjectId = d.id;
}

/**
 * The offline “provider”: deterministic command interpretation mapped onto the same tools the
 * AI uses. It never pretends to understand free-form requests it can’t handle.
 */
export class LocalProvider implements AIProvider {
  readonly id = 'local' as const;
  readonly label = 'Built-in command interpreter (offline, no AI)';
  readonly understandsLanguage = false;
  constructor(private contexts = new Map<string, InterpreterContext>()) {}

  context(conversationId: string) {
    if (!this.contexts.has(conversationId)) this.contexts.set(conversationId, {});
    return this.contexts.get(conversationId)!;
  }

  /** Returns null when the request isn't a recognised command. */
  async handle(message: string, conversationId: string, req: Pick<ChatRequest, 'onTool'>, extra: Partial<InterpreterContext> = {}): Promise<string | null> {
    const ctx = this.context(conversationId);
    Object.assign(ctx, extra);
    const res = interpret(message, ctx);
    ctx.previousUserText = message;
    if (res.kind === 'unknown') return null;
    if (res.kind === 'reply') return res.text;
    const replies: string[] = [];
    for (const call of res.calls) {
      const r = await runTool(call.tool, call.input, { now: new Date() });
      req.onTool?.({ name: call.tool, summary: r.summary, ok: r.ok }, r.pending, r.data);
      if (r.ok) updateContext(ctx, call.tool, call.input, r.data);
      replies.push(composeReply(call.tool, r.ok, r.summary, r.data));
    }
    return replies.join('\n\n');
  }

  async chat(): Promise<{ text: string; truncated: boolean }> {
    throw new AIError('unavailable', 'Use handle() for the local interpreter.');
  }
  async complete(): Promise<string> {
    throw new AIError('unavailable', 'Writing help needs AI, which is available when JARVIS runs on claude.ai.');
  }
  async completeJson<T>(): Promise<T> {
    throw new AIError('unavailable', 'This needs AI, which is available when JARVIS runs on claude.ai.');
  }
}
