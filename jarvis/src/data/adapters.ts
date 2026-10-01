import { COLLECTIONS, type CollectionName, type CollectionTypes, type Settings } from '../domain/types';
import { RepoError, toPlain, WriteQueue, type Repo } from './repo';

// ===================================================================== memory (tests)

export class MemoryRepo implements Repo {
  readonly kind = 'memory' as const;
  readonly description = 'Temporary memory (nothing is saved)';
  private data = new Map<string, Map<string, unknown>>();
  private settings: Settings | null = null;
  private col(c: string) {
    if (!this.data.has(c)) this.data.set(c, new Map());
    return this.data.get(c)!;
  }
  async list<C extends CollectionName>(c: C) {
    return Array.from(this.col(c).values()).map((v) => toPlain(v)) as CollectionTypes[C][];
  }
  async get<C extends CollectionName>(c: C, id: string) {
    const v = this.col(c).get(id);
    return v ? (toPlain(v) as CollectionTypes[C]) : null;
  }
  async put<C extends CollectionName>(c: C, item: CollectionTypes[C]) {
    this.col(c).set((item as { id: string }).id, toPlain(item));
  }
  async remove(c: CollectionName, id: string) {
    this.col(c).delete(id);
  }
  async getSettings() {
    return this.settings ? toPlain(this.settings) : null;
  }
  async putSettings(s: Settings) {
    this.settings = toPlain(s);
  }
  async clearAll() {
    this.data.clear();
    this.settings = null;
  }
}

// ===================================================================== IndexedDB (standalone)

const DB_NAME = 'jarvis';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IndexedDbRepo implements Repo {
  readonly kind = 'indexeddb' as const;
  readonly description = 'This browser’s private database (IndexedDB) on this device';
  private dbp: Promise<IDBDatabase>;
  constructor(name = DB_NAME) {
    this.dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new RepoError('IndexedDB is not available in this browser.', 'unavailable'));
      const open = indexedDB.open(name, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        for (const c of COLLECTIONS) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new RepoError('The local database could not be opened. Private browsing or blocked site data can cause this.', 'unavailable'));
      open.onblocked = () => reject(new RepoError('The local database is busy in another tab. Close other JARVIS tabs and reload.', 'unavailable'));
    });
  }
  static async open(name?: string): Promise<IndexedDbRepo> {
    const r = new IndexedDbRepo(name);
    await r.dbp;
    return r;
  }
  private async store(c: string, mode: IDBTransactionMode) {
    return (await this.dbp).transaction(c, mode).objectStore(c);
  }
  private wrap<T>(p: Promise<T>): Promise<T> {
    return p.catch((e) => {
      const quota = e && (e.name === 'QuotaExceededError');
      throw new RepoError(quota ? 'Your device’s storage is full.' : 'The local database could not save that.', quota ? 'quota_exceeded' : 'unavailable');
    });
  }
  async list<C extends CollectionName>(c: C) {
    return (await req((await this.store(c, 'readonly')).getAll())) as CollectionTypes[C][];
  }
  async get<C extends CollectionName>(c: C, id: string) {
    return ((await req((await this.store(c, 'readonly')).get(id))) as CollectionTypes[C] | undefined) ?? null;
  }
  async put<C extends CollectionName>(c: C, item: CollectionTypes[C]) {
    await this.wrap(this.store(c, 'readwrite').then((s) => req(s.put(toPlain(item)))));
  }
  async remove(c: CollectionName, id: string) {
    await this.wrap(this.store(c, 'readwrite').then((s) => req(s.delete(id))));
  }
  async getSettings() {
    return ((await req((await this.store('meta', 'readonly')).get('settings'))) as Settings | undefined) ?? null;
  }
  async putSettings(s: Settings) {
    await this.wrap(this.store('meta', 'readwrite').then((st) => req(st.put(toPlain(s), 'settings'))));
  }
  async clearAll() {
    const db = await this.dbp;
    const names = [...COLLECTIONS, 'meta'];
    const tx = db.transaction(names, 'readwrite');
    names.forEach((n) => tx.objectStore(n).clear());
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ===================================================================== Claude database (claude.ai)

/** Minimal structural types for the `db` capability (see the platform's db.d.ts). */
interface DbSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface DbDoc { get(): Promise<DbSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; collection(p: string): DbCol }
interface DbCol { doc(id?: string): DbDoc; limit(n: number): DbCol; get(): Promise<{ docs: DbSnap[] }> }
export interface ClaudeDb { doc(path: string): DbDoc; collection(path: string): DbCol }

/**
 * Stores each user's data under their private subtree:
 *   data/users/<uid>/jarvis            (document: settings + profile)
 *   data/users/<uid>/jarvis/<col>/<id> (one document per record)
 * The platform keeps `data/users/<uid>` private to that user.
 */
export class ClaudeDbRepo implements Repo {
  readonly kind = 'claude-db' as const;
  readonly description = 'Your private database on claude.ai (follows you across devices)';
  private q = new WriteQueue();
  private root: DbDoc;
  constructor(db: ClaudeDb, uid: string) {
    this.root = db.doc(`data/users/${uid}/jarvis`);
  }
  private wrap<T>(p: Promise<T>): Promise<T> {
    return p.catch((e: { code?: string; message?: string }) => {
      const code = e?.code ?? 'unavailable';
      const msg =
        code === 'quota_exceeded' ? 'Your JARVIS database is full. Delete old conversations, documents or activity to make room.'
          : code === 'revoked' || code === 'not_granted' ? 'Access to your saved data was withdrawn. Reload the page.'
            : code === 'invalid_argument' ? 'That record could not be saved (it may be too large).'
              : 'Your data could not be saved just now. Check your connection.';
      throw new RepoError(msg, code);
    });
  }
  async list<C extends CollectionName>(c: C) {
    const snap = await this.wrap(this.root.collection(c).limit(1000).get());
    return snap.docs.filter((d) => d.exists).map((d) => d.data() as unknown as CollectionTypes[C]);
  }
  async get<C extends CollectionName>(c: C, id: string) {
    const s = await this.wrap(this.root.collection(c).doc(id).get());
    return s.exists ? (s.data() as unknown as CollectionTypes[C]) : null;
  }
  async put<C extends CollectionName>(c: C, item: CollectionTypes[C]) {
    const id = (item as { id: string }).id;
    await this.q.run(`${c}/${id}`, () => this.wrap(this.root.collection(c).doc(id).set(toPlain(item) as unknown as Record<string, unknown>)));
  }
  async remove(c: CollectionName, id: string) {
    await this.q.run(`${c}/${id}`, () => this.wrap(this.root.collection(c).doc(id).delete()));
  }
  async getSettings() {
    const s = await this.wrap(this.root.get());
    return s.exists ? ((s.data() as { settings?: Settings }).settings ?? null) : null;
  }
  async putSettings(s: Settings) {
    await this.q.run('root', () => this.wrap(this.root.set({ settings: toPlain(s) as unknown as Record<string, unknown>, updatedAt: new Date().toISOString() })));
  }
  async clearAll() {
    for (const c of COLLECTIONS) {
      const items = await this.list(c);
      for (const it of items) await this.remove(c, (it as { id: string }).id);
    }
    await this.q.run('root', () => this.wrap(this.root.delete()));
  }
}
