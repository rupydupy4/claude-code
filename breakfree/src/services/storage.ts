import type { AppData } from '../models/types';
import { emptyData, migrate, MigrationError, validateData } from './schema';

export const STORAGE_KEY = 'breakfree:data';
export const RECOVERY_KEY = 'breakfree:recovery';

export type LoadStatus =
  | { kind: 'new' }
  | { kind: 'ok' }
  | { kind: 'repaired'; dropped: number }
  | { kind: 'corrupt'; message: string }
  | { kind: 'unavailable'; message: string };

export interface LoadResult {
  data: AppData;
  status: LoadStatus;
  /** False when the stored data must not be overwritten (e.g. it came from a newer version). */
  writable: boolean;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__breakfree_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function keepRecoveryCopy(s: Storage, raw: string) {
  try {
    s.setItem(RECOVERY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
  } catch {
    /* if even this fails, the original stays under STORAGE_KEY because we won't overwrite it */
  }
}

export function loadData(): LoadResult {
  const s = storage();
  if (!s) {
    return {
      data: emptyData(),
      status: { kind: 'unavailable', message: 'Browser storage is unavailable (private mode or blocked site data). Changes will be lost when you close this tab.' },
      writable: false,
    };
  }
  const raw = s.getItem(STORAGE_KEY);
  if (raw === null) return { data: emptyData(), status: { kind: 'new' }, writable: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
  } catch {
    keepRecoveryCopy(s, raw);
    return {
      data: emptyData(),
      status: { kind: 'corrupt', message: 'Your saved data could not be read. A copy was kept so it can be downloaded from Settings → Data.' },
      writable: true,
    };
  }

  try {
    const migrated = migrate(parsed as Record<string, unknown>);
    const result = validateData(migrated, 'repair');
    if (result.dropped > 0) {
      keepRecoveryCopy(s, raw);
      return { data: result.data, status: { kind: 'repaired', dropped: result.dropped }, writable: true };
    }
    return { data: result.data, status: { kind: 'ok' }, writable: true };
  } catch (e) {
    keepRecoveryCopy(s, raw);
    const message = e instanceof MigrationError ? e.message : 'Your saved data could not be upgraded.';
    // Not writable: we must not overwrite data we couldn't understand.
    return { data: emptyData(), status: { kind: 'corrupt', message }, writable: false };
  }
}

export class StorageWriteError extends Error {
  constructor(public readonly quota: boolean) {
    super(quota ? 'Storage is full.' : 'Could not save.');
  }
}

export function saveData(data: AppData): void {
  const s = storage();
  if (!s) throw new StorageWriteError(false);
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    throw new StorageWriteError(quota);
  }
}

export function readRecovery(): { savedAt: string; raw: string } | null {
  try {
    const v = window.localStorage.getItem(RECOVERY_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function clearRecovery() {
  try {
    window.localStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAllStorage() {
  try {
    const s = window.localStorage;
    Object.keys(s)
      .filter((k) => k.startsWith('breakfree:'))
      .forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Small per-device keys that aren't part of the backup (timer state, reminder log). */
export function getLocal<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(`breakfree:${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setLocal(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(`breakfree:${key}`);
    else window.localStorage.setItem(`breakfree:${key}`, JSON.stringify(value));
  } catch {
    /* non-critical */
  }
}
