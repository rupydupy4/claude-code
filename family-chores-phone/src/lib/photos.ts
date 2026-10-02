/** Photo proof is kept on this device only, in IndexedDB (one photo per chore). */
const DB = 'family-chores';
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Photo storage failed.')); };
  });
}

export const putPhoto = (choreId: string, blob: Blob) => run('readwrite', (s) => s.put(blob, choreId)).then(() => undefined);
export const getPhoto = (choreId: string) => run<Blob | undefined>('readonly', (s) => s.get(choreId));
export const deletePhoto = (choreId: string) => run('readwrite', (s) => s.delete(choreId)).then(() => undefined);
export const clearPhotos = () => run('readwrite', (s) => s.clear()).then(() => undefined);

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
export const MAX_ORIGINAL = 20 * 1024 * 1024;
export const MAX_STORED = 5 * 1024 * 1024;

export class PhotoError extends Error {}

export function checkPhoto(f: File) {
  if (!ACCEPT.split(',').includes(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) throw new PhotoError('Please choose a photo (JPEG, PNG, WebP or HEIC).');
  if (f.size > MAX_ORIGINAL) throw new PhotoError('That photo is too large. Try a smaller one.');
}

/** Resizes to at most 1600px as JPEG so photos don't fill up the device. Falls back to the original. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  let out: Blob = file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (blob) out = blob;
  } catch {
    /* the browser can't decode it (e.g. HEIC outside Safari): keep the original */
  }
  if (out.size > MAX_STORED) throw new PhotoError('That photo is too large. Try a smaller one.');
  return out;
}
