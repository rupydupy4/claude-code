/**
 * Access to claude.ai runtime capabilities. Every function resolves null when the page is not
 * running inside claude.ai (e.g. the standalone website or tests), so callers design for absence.
 */
import type { ClaudeDb } from '../data/adapters';

export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>, ctx: { signal: AbortSignal }): unknown;
}
export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  tools?: SampleTool[];
  modelTier?: 'quick' | 'default' | 'complex';
  cache?: boolean;
}
export type SampleInput = string | { role: 'user' | 'assistant'; content: string }[];
export interface SampleFn {
  (input: SampleInput, options?: SampleOptions): Promise<{ text: string; truncated: boolean; modelTierApplied: string }>;
  json<T = unknown>(input: SampleInput, options?: SampleOptions): Promise<T>;
  limits(): Promise<{ maxPromptBytes: number; tools?: { maxCount: number } }>;
}
export interface UserNs {
  id(): Promise<string | null>;
}
export interface DownloadsNs {
  save(file: { filename: string; data: string | Blob }): Promise<unknown>;
}

interface ClaudeGlobal {
  use(name: string): Promise<unknown>;
}

function claudeGlobal(): ClaudeGlobal | null {
  const c = (globalThis as unknown as { claude?: ClaudeGlobal }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

/** True when the page is framed by a claude.ai viewer (the runtime object exists). */
export const insideClaude = () => claudeGlobal() !== null;

async function use<T>(name: string): Promise<T | null> {
  const c = claudeGlobal();
  if (!c) return null;
  try {
    return ((await c.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}

export const getSample = () => use<SampleFn>('sample');
export const getDb = () => use<ClaudeDb>('db');
export const getUser = () => use<UserNs>('user');
export const getDownloads = () => use<DownloadsNs>('downloads');

/** The published claude.ai version of JARVIS (the one with the AI), linked from the standalone site. */
export const AI_VERSION_URL = 'https://claude.ai/artifact/AJQfn7JHq8cGYzowJjuTtM';
