import type { AppData } from '../models/types';
import { migrate, MigrationError, SCHEMA_VERSION, validateData } from './schema';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export interface BackupFile {
  app: 'BREAKFREE';
  exportedAt: string;
  schemaVersion: number;
  data: AppData;
}

export function buildBackup(data: AppData): BackupFile {
  return { app: 'BREAKFREE', exportedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, data };
}

export function backupFilename(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `breakfree-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`;
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ImportResult =
  | { ok: true; data: AppData; counts: Record<string, number>; exportedAt?: string }
  | { ok: false; errors: string[] };

/** Parses and fully validates a backup. Never touches stored data. */
export function parseBackup(text: string, sizeBytes = text.length): ImportResult {
  if (sizeBytes > MAX_IMPORT_BYTES) return { ok: false, errors: ['The file is larger than 10 MB, which is too big for a BREAKFREE backup.'] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, errors: ['This file does not contain a backup.'] };
  const file = parsed as Record<string, unknown>;
  if (file.app !== 'BREAKFREE' || !file.data || typeof file.data !== 'object') {
    return { ok: false, errors: ['This does not look like a BREAKFREE backup file.'] };
  }
  if (typeof file.schemaVersion !== 'number') return { ok: false, errors: ['The backup has no schema version.'] };
  let migrated: Record<string, unknown>;
  try {
    migrated = migrate({ ...(file.data as Record<string, unknown>), schemaVersion: file.schemaVersion });
  } catch (e) {
    return { ok: false, errors: [e instanceof MigrationError ? e.message : 'The backup could not be upgraded.'] };
  }
  const result = validateData(migrated, 'strict');
  if (result.errors.length) return { ok: false, errors: result.errors };
  return { ok: true, data: result.data, counts: result.counts, exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : undefined };
}

export function journalToText(data: AppData): string {
  return [...data.journal]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((j) => `${j.date}${j.title ? ` — ${j.title}` : ''}\n${j.prompt ? `(${j.prompt})\n` : ''}${j.body}\n`)
    .join('\n');
}

/** Reads a file as text, falling back to FileReader on browsers without Blob.text(). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
