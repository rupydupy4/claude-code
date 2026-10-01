import type { AiSpeed, PendingAction, ToolCallRecord } from '../domain/types';
import type { ToolDef } from '../tools/registry';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  instructions: string;
  history: ChatTurn[];
  message: string;
  tools: ToolDef[];
  speed: AiSpeed;
  signal?: AbortSignal;
  /** Called with the whole answer so far as it streams. */
  onText?: (text: string) => void;
  /** Called after each tool runs. */
  onTool?: (record: ToolCallRecord, pending?: PendingAction, data?: unknown) => void;
}

export interface CompleteOptions {
  speed?: AiSpeed;
  signal?: AbortSignal;
  onText?: (text: string) => void;
}

export class AIError extends Error {
  constructor(public readonly code: string, message: string, public readonly partial?: string) {
    super(message);
  }
}

/** A model provider. Implementations: Claude via claude.ai (no key), and the offline interpreter. */
export interface AIProvider {
  readonly id: 'claude' | 'local' | 'server';
  readonly label: string;
  /** True when free-form language understanding is available. */
  readonly understandsLanguage: boolean;
  chat(req: ChatRequest): Promise<{ text: string; truncated: boolean }>;
  complete(prompt: string, opts?: CompleteOptions): Promise<string>;
  completeJson<T>(prompt: string, opts?: CompleteOptions): Promise<T>;
}

export const ERROR_COPY: Record<string, string> = {
  not_granted: 'You declined the request to use Claude, so I can only handle direct commands. Reload the page to be asked again.',
  sampling_disabled: 'Claude isn’t available for this account, so I can only handle direct commands.',
  rate_limited: 'Claude’s usage limit was reached for now. Try again in a little while; direct commands still work.',
  session_expired: 'Your claude.ai session expired. Sign in again, then retry.',
  refused: 'Claude declined to answer that. Try rephrasing the request.',
  prompt_too_large: 'That was too much text to process at once. Try a shorter excerpt.',
  empty_completion: 'No answer came back. Try asking in a simpler way.',
  invalid_json: 'The answer came back in an unexpected format. Try again.',
  offline: 'You appear to be offline. Direct commands still work; AI answers need a connection.',
  upstream_error: 'The AI service had a problem. Your request may not have finished; try again.',
  unavailable: 'AI isn’t available here.',
};

export const errorCopy = (code: string) => ERROR_COPY[code] ?? ERROR_COPY.upstream_error;
