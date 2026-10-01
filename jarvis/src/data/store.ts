import { useSyncExternalStore } from 'react';
import type {
  Activity, CalendarEvent, CollectionName, CollectionTypes, Conversation, ConversationMessages, DocumentMeta,
  EntityType, Memory, Message, Note, Project, Reminder, Settings, Task,
} from '../domain/types';
import { nowIso } from '../utils/dates';
import { uid } from '../utils/ids';
import { notify } from '../services/notify';
import type { Repo } from './repo';

export const MAX_ACTIVITY = 300;
export const MAX_MESSAGES_PER_CONVERSATION = 200;

export function defaultSettings(): Settings {
  return {
    userName: '',
    address: '',
    assistantName: 'JARVIS',
    workType: '',
    theme: 'system',
    accent: 'brass',
    voice: { enabled: true, rate: 1, voiceURI: '', autoRead: true },
    responseStyle: 'concise',
    aiSpeed: 'quick',
    memoryEnabled: true,
    notifications: { enabled: false, reminders: true, deadlines: true, proactive: false },
    onboarded: false,
    demoLoaded: false,
    dismissedInsights: [],
  };
}

export interface State {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  repoKind: Repo['kind'] | null;
  repoDescription: string;
  settings: Settings;
  tasks: Task[];
  projects: Project[];
  notes: Note[];
  reminders: Reminder[];
  events: CalendarEvent[];
  memories: Memory[];
  documents: DocumentMeta[];
  conversations: Conversation[];
  activity: Activity[];
  saveError?: string;
}

type ListKey = 'tasks' | 'projects' | 'notes' | 'reminders' | 'events' | 'memories' | 'documents' | 'conversations' | 'activity';

let repo: Repo | null = null;
let state: State = {
  status: 'loading',
  repoKind: null,
  repoDescription: '',
  settings: defaultSettings(),
  tasks: [], projects: [], notes: [], reminders: [], events: [], memories: [], documents: [], conversations: [], activity: [],
};
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getState = () => state;
export const getRepo = () => repo;

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
    () => selector(state),
  );
}
export const useApp = () => useStore((s) => s);

/** Loads everything except message bodies and document text, which load on demand. */
export async function initStore(r: Repo) {
  repo = r;
  set({ status: 'loading', repoKind: r.kind, repoDescription: r.description });
  try {
    const [settings, tasks, projects, notes, reminders, events, memories, documents, conversations, activity] = await Promise.all([
      r.getSettings(), r.list('tasks'), r.list('projects'), r.list('notes'), r.list('reminders'), r.list('events'),
      r.list('memories'), r.list('documents'), r.list('conversations'), r.list('activity'),
    ]);
    set({
      status: 'ready',
      error: undefined,
      settings: { ...defaultSettings(), ...(settings ?? {}), voice: { ...defaultSettings().voice, ...(settings?.voice ?? {}) }, notifications: { ...defaultSettings().notifications, ...(settings?.notifications ?? {}) } },
      tasks, projects, notes, reminders, events, memories, documents,
      conversations: conversations.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1)),
      activity: activity.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    });
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : 'Your data could not be loaded.' });
  }
}

/** Test helper: replace state wholesale. */
export function resetStore(r: Repo, partial: Partial<State> = {}) {
  repo = r;
  set({
    status: 'ready', repoKind: r.kind, repoDescription: r.description, settings: defaultSettings(),
    tasks: [], projects: [], notes: [], reminders: [], events: [], memories: [], documents: [], conversations: [], activity: [],
    saveError: undefined, ...partial,
  });
}

function persist(job: () => Promise<void>) {
  if (!repo) return Promise.resolve();
  return job().then(
    () => {
      if (state.saveError) set({ saveError: undefined });
    },
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'A change could not be saved.';
      set({ saveError: msg });
      notify(`Not saved: ${msg}`, 'error', undefined, 0);
    },
  );
}

// ------------------------------------------------------------------ generic

export function upsert<K extends ListKey>(key: K, item: State[K][number]) {
  const list = state[key] as { id: string }[];
  const exists = list.some((x) => x.id === (item as { id: string }).id);
  const next = exists ? list.map((x) => (x.id === (item as { id: string }).id ? item : x)) : [item, ...list];
  set({ [key]: next } as Partial<State>);
  return persist(() => repo!.put(key as CollectionName, item as CollectionTypes[CollectionName]));
}

export function removeItem(key: ListKey, id: string) {
  set({ [key]: (state[key] as { id: string }[]).filter((x) => x.id !== id) } as Partial<State>);
  return persist(() => repo!.remove(key as CollectionName, id));
}

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  set({ settings });
  return persist(() => repo!.putSettings(settings));
}

export function logActivity(verb: Activity['verb'], entity: EntityType, label: string, entityId?: string, demo?: boolean) {
  const a: Activity = { id: uid(), createdAt: nowIso(), verb, entity, entityId, label, demo };
  const all = [a, ...state.activity];
  const keep = all.slice(0, MAX_ACTIVITY);
  const drop = all.slice(MAX_ACTIVITY);
  set({ activity: keep });
  void persist(async () => {
    await repo!.put('activity', a);
    for (const d of drop) await repo!.remove('activity', d.id);
  });
  return a;
}

// ------------------------------------------------------------------ conversations

export async function loadMessages(conversationId: string): Promise<Message[]> {
  if (!repo) return [];
  try {
    return (await repo.get('messages', conversationId))?.messages ?? [];
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Messages could not be loaded.', 'error');
    return [];
  }
}

/** Saves a conversation's messages (bounded) and refreshes its search/preview metadata. */
export function saveConversation(conv: Conversation, messages: Message[]) {
  const kept = messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map((m) => ({ ...m, content: m.content.slice(0, 12000) }));
  const text = kept.map((m) => m.content).join('\n');
  const updated: Conversation = {
    ...conv,
    updatedAt: nowIso(),
    lastMessageAt: kept.at(-1)?.createdAt ?? conv.lastMessageAt,
    messageCount: kept.length,
    searchText: text.slice(-6000),
  };
  const list = [updated, ...state.conversations.filter((c) => c.id !== conv.id)].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  set({ conversations: list });
  const record: ConversationMessages = { id: conv.id, messages: kept };
  return persist(async () => {
    await repo!.put('conversations', updated);
    await repo!.put('messages', record);
  });
}

export function deleteConversation(id: string) {
  set({ conversations: state.conversations.filter((c) => c.id !== id) });
  return persist(async () => {
    await repo!.remove('conversations', id);
    await repo!.remove('messages', id);
  });
}

export async function clearConversations() {
  const ids = state.conversations.map((c) => c.id);
  set({ conversations: [] });
  await persist(async () => {
    for (const id of ids) {
      await repo!.remove('conversations', id);
      await repo!.remove('messages', id);
    }
  });
}

// ------------------------------------------------------------------ documents

export async function loadDocumentText(id: string): Promise<string> {
  if (!repo) return '';
  return (await repo.get('documentText', id))?.text ?? '';
}

export function saveDocument(meta: DocumentMeta, text: string) {
  set({ documents: [meta, ...state.documents.filter((d) => d.id !== meta.id)] });
  return persist(async () => {
    await repo!.put('documentText', { id: meta.id, text });
    await repo!.put('documents', meta);
  });
}

export function deleteDocument(id: string) {
  set({ documents: state.documents.filter((d) => d.id !== id) });
  return persist(async () => {
    await repo!.remove('documents', id);
    await repo!.remove('documentText', id);
  });
}

// ------------------------------------------------------------------ bulk

export async function clearMemories() {
  const ids = state.memories.map((m) => m.id);
  set({ memories: [] });
  await persist(async () => {
    for (const id of ids) await repo!.remove('memories', id);
  });
}

/** Removes every record marked as demo content. */
export async function removeDemoData() {
  const keys: ListKey[] = ['tasks', 'projects', 'notes', 'reminders', 'events', 'memories', 'documents', 'conversations', 'activity'];
  const doomed: [ListKey, string][] = [];
  const patch: Partial<State> = {};
  for (const k of keys) {
    const list = state[k] as { id: string; demo?: boolean }[];
    list.filter((x) => x.demo).forEach((x) => doomed.push([k, x.id]));
    (patch as Record<string, unknown>)[k] = list.filter((x) => !x.demo);
  }
  set(patch);
  await updateSettings({ demoLoaded: false });
  await persist(async () => {
    for (const [k, id] of doomed) {
      await repo!.remove(k as CollectionName, id);
      if (k === 'conversations') await repo!.remove('messages', id);
      if (k === 'documents') await repo!.remove('documentText', id);
    }
  });
}

export async function deleteAllData() {
  const settings = { ...defaultSettings() };
  set({ tasks: [], projects: [], notes: [], reminders: [], events: [], memories: [], documents: [], conversations: [], activity: [], settings });
  await persist(() => repo!.clearAll());
}

/** Everything the user has, including message bodies and document text, for export. */
export async function exportAll() {
  const messages = repo ? await repo.list('messages') : [];
  const documentText = repo ? await repo.list('documentText') : [];
  const { settings, tasks, projects, notes, reminders, events, memories, documents, conversations, activity } = state;
  return { app: 'JARVIS', exportedAt: nowIso(), version: 1, settings, tasks, projects, notes, reminders, events, memories, documents, documentText, conversations, messages, activity };
}
