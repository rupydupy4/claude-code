import { useSyncExternalStore } from 'react';
import type { Conversation, Message, PendingAction } from '../domain/types';
import { getState, saveConversation } from '../data/store';
import { TOOLS, runTool } from '../tools/registry';
import { webSearchConfigured } from '../services/research';
import { analyseLocally, type DocumentAnalysis } from '../services/documents';
import { nowIso } from '../utils/dates';
import { uid } from '../utils/ids';
import { AIError, errorCopy, type ChatTurn } from './AIService';
import { ClaudeProvider } from './claudeProvider';
import { LocalProvider } from './localProvider';
import { buildInstructions } from './prompt';

// ------------------------------------------------------------------ provider selection

export interface AIStatus {
  ready: boolean;
  mode: 'claude' | 'local';
  tools: boolean;
}

let claude: ClaudeProvider | null = null;
let status: AIStatus = { ready: false, mode: 'local', tools: false };
const statusListeners = new Set<() => void>();
export const local = new LocalProvider();

function setStatus(s: AIStatus) {
  status = s;
  statusListeners.forEach((l) => l());
}

/** Detects Claude (only present when running inside claude.ai). */
export async function initAI(provider?: ClaudeProvider | null) {
  claude = provider !== undefined ? provider : await ClaudeProvider.create();
  setStatus({ ready: true, mode: claude ? 'claude' : 'local', tools: claude?.supportsTools ?? false });
}

export const getAIStatus = () => status;
export function useAIStatus(): AIStatus {
  return useSyncExternalStore((l) => { statusListeners.add(l); return () => statusListeners.delete(l); }, () => status, () => status);
}

// ------------------------------------------------------------------ conversation turns

const HISTORY_TURNS = 14;

function toTurns(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages.slice(-HISTORY_TURNS)) {
    let content = m.content.trim();
    if (m.role === 'assistant' && m.tools?.length) content += `\n[Actions taken: ${m.tools.map((t) => t.summary).join('; ')}]`;
    if (!content) continue;
    turns.push({ role: m.role, content: content.slice(0, 4000) });
  }
  // The turn list must start with the user; drop a leading assistant turn.
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}

export function newConversation(title: string, demo?: boolean): Conversation {
  const at = nowIso();
  return { id: uid(), createdAt: at, updatedAt: at, title: title.slice(0, 70) || 'New conversation', searchText: '', messageCount: 0, lastMessageAt: at, ...(demo ? { demo: true } : {}) };
}

export interface SendOptions {
  conversation: Conversation | null;
  messages: Message[];
  text: string;
  research?: boolean;
  documentId?: string;
  voice?: boolean;
  signal?: AbortSignal;
  /** Called whenever the visible message list changes (streaming, tool results). */
  onUpdate?: (messages: Message[]) => void;
}

const UNKNOWN_LOCAL =
  'I don’t have enough information to do that here. In this version I can carry out direct commands, such as creating tasks, reminders, notes, events and projects, checking your schedule, planning your day or searching your workspace. Free-form questions, writing help and document analysis need the AI, which is available when you open JARVIS through claude.ai. Say “help” for examples.';

/** Sends one user message and produces the assistant's reply, running tools as needed. */
export async function sendMessage(opts: SendOptions): Promise<{ conversation: Conversation; messages: Message[] }> {
  const text = opts.text.trim();
  const conversation = opts.conversation ?? newConversation(text.replace(/^(?:hey\s+)?jarvis[,\s]*/i, ''));
  const user: Message = { id: uid(), role: 'user', content: text, createdAt: nowIso() };
  let reply: Message = { id: uid(), role: 'assistant', content: '', createdAt: nowIso(), tools: [] };
  let messages = [...opts.messages, user, reply];
  const emit = () => {
    messages = [...messages.slice(0, -1), { ...reply }];
    opts.onUpdate?.(messages);
  };
  emit();

  const onTool = (record: { name: string; summary: string; ok: boolean }, pending?: PendingAction, data?: unknown) => {
    reply = { ...reply, tools: [...(reply.tools ?? []), record], ...(pending ? { confirm: pending } : {}) };
    // Real search results become the message's sources (only http(s) links are kept).
    const results = (data as { results?: { title?: unknown; url?: unknown }[] } | undefined)?.results;
    if (record.name === 'search_web' && Array.isArray(results)) {
      const found = results
        .filter((r): r is { title: string; url: string } => typeof r?.url === 'string' && /^https?:\/\//.test(r.url))
        .map((r) => ({ title: String(r.title || r.url).slice(0, 200), url: r.url }));
      const seen = new Set((reply.sources ?? []).map((x) => x.url));
      reply = { ...reply, sources: [...(reply.sources ?? []), ...found.filter((f) => !seen.has(f.url))].slice(0, 12) };
    }
    emit();
  };
  const doc = opts.documentId ? getState().documents.find((d) => d.id === opts.documentId) : undefined;

  if (claude) {
    try {
      const instructions = buildInstructions(getState(), { now: new Date(), research: !!opts.research, researchAvailable: webSearchConfigured(), documentName: doc?.name, voice: opts.voice });
      const res = await claude.chat({
        instructions,
        history: toTurns(opts.messages),
        message: doc ? `${text}\n\n(Attached document: “${doc.name}”)` : text,
        tools: TOOLS,
        speed: getState().settings.aiSpeed,
        signal: opts.signal,
        onText: (t) => { reply = { ...reply, content: t }; emit(); },
        onTool,
      });
      reply = { ...reply, content: res.text, interrupted: res.truncated || undefined };
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError('upstream_error', String(e));
      if (err.code === 'cancelled') {
        reply = { ...reply, content: err.partial ?? reply.content, interrupted: true };
      } else {
        // Fall back to the interpreter for direct commands, so the request still gets done.
        const handled = (reply.tools?.length ?? 0) === 0 ? await local.handle(text, conversation.id, { onTool }, { documentId: opts.documentId }) : null;
        reply = {
          ...reply,
          content: handled ? `${handled}\n\n_${errorCopy(err.code)}_` : `${err.partial ? `${err.partial}\n\n` : ''}${errorCopy(err.code)}`,
          interrupted: !handled || undefined,
        };
      }
    }
  } else {
    const handled = await local.handle(text, conversation.id, { onTool }, { documentId: opts.documentId });
    reply = {
      ...reply,
      content: handled ?? (opts.research ? 'Live web research isn’t available here, so I haven’t searched anything. ' + UNKNOWN_LOCAL : UNKNOWN_LOCAL),
    };
  }
  if (!reply.content.trim()) reply = { ...reply, content: reply.tools?.length ? reply.tools.map((t) => t.summary).join('. ') + '.' : 'I don’t have an answer for that.' };
  emit();
  await saveConversation(conversation, messages);
  return { conversation, messages };
}

/** Runs a confirmed (or cancels a) destructive action that the assistant proposed. */
export async function resolvePending(conversation: Conversation, messages: Message[], messageId: string, confirm: boolean): Promise<Message[]> {
  const msg = messages.find((m) => m.id === messageId);
  const p = msg?.confirm;
  if (!msg || !p || p.state !== 'pending') return messages;
  let resultText = 'Cancelled. Nothing was deleted.';
  if (confirm) {
    const r = await runTool(p.tool, p.input, { now: new Date(), confirmed: true });
    resultText = r.ok ? `Done. ${r.summary}.` : r.summary;
  }
  const next = messages.map((m) => (m.id === messageId ? { ...m, confirm: { ...p, state: confirm ? ('confirmed' as const) : ('cancelled' as const) } } : m));
  const follow: Message = { id: uid(), role: 'assistant', content: resultText, createdAt: nowIso() };
  const all = [...next, follow];
  await saveConversation(conversation, all);
  return all;
}

// ------------------------------------------------------------------ AIService facade

export function aiAvailable() {
  return !!claude;
}

export async function streamText(prompt: string, onText: (t: string) => void, signal?: AbortSignal): Promise<string> {
  if (!claude) throw new AIError('unavailable', errorCopy('unavailable'));
  return claude.complete(prompt, { onText, signal, speed: 'default' });
}

export async function summarise(text: string, signal?: AbortSignal): Promise<string> {
  if (!claude) return analyseLocally(text).summary;
  return claude.complete(`Summarise the following in 3–5 sentences for a busy professional. Plain prose, no preamble.\n\n---\n${text.slice(0, 60000)}`, { signal });
}

/** Structured analysis: summary, key points, action items, deadlines. Falls back to heuristics without AI. */
export async function analyseDocument(text: string, name: string, signal?: AbortSignal): Promise<DocumentAnalysis & { ai: boolean }> {
  if (!claude) return { ...analyseLocally(text), ai: false };
  const today = new Date();
  const prompt = `Analyse the document “${name}” for a busy professional. Today is ${today.toDateString()}.
Reply with only JSON of this shape:
{"summary": "3-5 sentences", "keyPoints": ["…"], "actionItems": [{"title": "imperative task title", "dueDate": "YYYY-MM-DD or omit"}], "deadlines": [{"what": "…", "date": "YYYY-MM-DD"}]}
Only include action items and deadlines the document actually states or clearly implies. Do not invent dates.

Document:
---
${text.slice(0, 60000)}`;
  const raw = await claude.completeJson<Partial<DocumentAnalysis>>(prompt, { signal, speed: 'default' });
  const arr = <T,>(v: unknown, f: (x: Record<string, unknown>) => T | null): T[] => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? f(x as Record<string, unknown>) : null)).filter((x): x is T => x !== null) : []);
  const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return {
    ai: true,
    summary: typeof raw?.summary === 'string' ? raw.summary.slice(0, 3000) : '',
    keyPoints: Array.isArray(raw?.keyPoints) ? (raw!.keyPoints as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 300)).slice(0, 10) : [],
    actionItems: arr(raw?.actionItems, (x) => (typeof x.title === 'string' && x.title.trim() ? { title: x.title.slice(0, 200), dueDate: isDate(x.dueDate) ? (x.dueDate as string) : undefined } : null)).slice(0, 25),
    deadlines: arr(raw?.deadlines, (x) => (typeof x.what === 'string' && isDate(x.date) ? { what: x.what.slice(0, 200), date: x.date as string } : null)).slice(0, 15),
  };
}

export const WRITING_ACTIONS = {
  improve: 'Improve this text: clearer, better flow, same meaning and length.',
  shorten: 'Shorten this text substantially while keeping every key point.',
  expand: 'Expand this text with useful detail and examples, keeping its tone.',
  professional: 'Rewrite this text in a polished, professional tone.',
  concise: 'Make this text concise and direct. Remove filler.',
  grammar: 'Fix spelling, grammar and punctuation only. Keep wording otherwise unchanged.',
  summarise: 'Summarise this text in a few sentences.',
} as const;
export type WritingAction = keyof typeof WRITING_ACTIONS;

export async function rewrite(action: WritingAction, text: string, onText: (t: string) => void, signal?: AbortSignal) {
  return streamText(`${WRITING_ACTIONS[action]} Reply with only the resulting text, no preamble or quotes.\n\n---\n${text.slice(0, 40000)}`, onText, signal);
}
