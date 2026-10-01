import { getSample, type SampleFn, type SampleTool } from '../platform/claude';
import { runTool, type ToolDef } from '../tools/registry';
import { AIError, type AIProvider, type ChatRequest, type CompleteOptions } from './AIService';

type SampleError = { code?: string; message?: string; text?: string };

function toAIError(e: unknown): AIError {
  const err = (e ?? {}) as SampleError;
  const code = typeof err.code === 'string' ? err.code : 'upstream_error';
  return new AIError(code, err.message ?? code, err.text);
}

/**
 * Claude through the claude.ai `sample` capability: runs on the user's own Claude account,
 * so no API key exists anywhere. Tool calls execute page functions (validated in runTool).
 */
export class ClaudeProvider implements AIProvider {
  readonly id = 'claude' as const;
  readonly label = 'Claude (your claude.ai account)';
  readonly understandsLanguage = true;
  private toolLimit: number | null = null;
  constructor(private sample: SampleFn) {}

  static async create(): Promise<ClaudeProvider | null> {
    const s = await getSample();
    if (!s) return null;
    const p = new ClaudeProvider(s);
    try {
      const limits = await s.limits();
      p.toolLimit = limits.tools?.maxCount ?? 0;
    } catch {
      p.toolLimit = 0;
    }
    return p;
  }

  get supportsTools() {
    return (this.toolLimit ?? 0) > 0;
  }

  private mapTools(tools: ToolDef[], req: ChatRequest): SampleTool[] {
    return tools.slice(0, this.toolLimit ?? 0).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: { type: 'object', properties: t.schema.properties as Record<string, unknown>, required: t.schema.required },
      execute: async (input: Record<string, unknown>, ctx: { signal: AbortSignal }) => {
        if (ctx.signal.aborted) throw new Error('Cancelled by the user.');
        const res = await runTool(t.name, input, { now: new Date() });
        req.onTool?.({ name: t.name, summary: res.summary, ok: res.ok }, res.pending, res.data);
        return res.data;
      },
    }));
  }

  async chat(req: ChatRequest) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AIError('offline', 'offline');
    const turns = [{ role: 'user' as const, content: req.instructions }, ...req.history, { role: 'user' as const, content: req.message }];
    try {
      const res = await this.sample(turns, {
        signal: req.signal,
        modelTier: req.speed,
        onText: ({ text }) => req.onText?.(text),
        ...(this.supportsTools && req.tools.length ? { tools: this.mapTools(req.tools, req) } : { cache: false }),
      });
      return { text: res.text, truncated: res.truncated };
    } catch (e) {
      throw toAIError(e);
    }
  }

  async complete(prompt: string, opts: CompleteOptions = {}) {
    try {
      const res = await this.sample(prompt, { signal: opts.signal, modelTier: opts.speed ?? 'default', cache: false, onText: ({ text }) => opts.onText?.(text) });
      return res.text;
    } catch (e) {
      throw toAIError(e);
    }
  }

  async completeJson<T>(prompt: string, opts: CompleteOptions = {}) {
    try {
      return await this.sample.json<T>(prompt, { signal: opts.signal, modelTier: opts.speed ?? 'default', cache: false });
    } catch (e) {
      throw toAIError(e);
    }
  }
}
