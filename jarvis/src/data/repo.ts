import type { CollectionName, CollectionTypes, Settings } from '../domain/types';

/**
 * Storage abstraction. The app talks only to this interface; adapters exist for
 * Claude's per-user database (on claude.ai), IndexedDB (standalone browser) and memory (tests).
 * A server-backed adapter can be added later without touching the UI.
 */
export interface Repo {
  readonly kind: 'claude-db' | 'indexeddb' | 'memory';
  /** Human description for Settings → Data. */
  readonly description: string;
  list<C extends CollectionName>(col: C): Promise<CollectionTypes[C][]>;
  get<C extends CollectionName>(col: C, id: string): Promise<CollectionTypes[C] | null>;
  put<C extends CollectionName>(col: C, item: CollectionTypes[C]): Promise<void>;
  remove(col: CollectionName, id: string): Promise<void>;
  getSettings(): Promise<Partial<Settings> | null>;
  putSettings(s: Settings): Promise<void>;
  /** Deletes every record this user has. */
  clearAll(): Promise<void>;
}

export class RepoError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

/** Serialises writes per key so the same record is never written concurrently. */
export class WriteQueue {
  private chains = new Map<string, Promise<unknown>>();
  run<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(job);
    this.chains.set(key, next);
    void next.finally(() => {
      if (this.chains.get(key) === next) this.chains.delete(key);
    }).catch(() => undefined);
    return next;
  }
}

/** Strips undefined values (the Claude database and structured clone both prefer plain JSON). */
export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
