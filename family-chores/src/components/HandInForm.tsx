'use client';
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Check, X } from 'lucide-react';
import { submitChore } from '@/app/actions/child';
import { createClient } from '@/lib/supabase/browser';
import { Notice, buttonClass, labelClass, textareaClass } from './ui';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_ORIGINAL = 20 * 1024 * 1024; // before resizing
const MAX_UPLOAD = 5 * 1024 * 1024; // the storage bucket's limit

/** Resizes to at most 1600px and re-encodes as JPEG. Returns the original if the browser can't decode it. */
async function shrink(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (blob) return { blob, ext: 'jpg', type: 'image/jpeg' };
  } catch {
    /* e.g. HEIC in a browser that can't decode it: upload as-is */
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  return { blob: file, ext, type: file.type || 'image/jpeg' };
}

export function HandInForm({ choreId, householdId, resubmit }: { choreId: string; householdId: string; resubmit?: boolean }) {
  const [state, action, pending] = useActionState(submitChore, undefined);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) return setError('Please choose a photo (JPEG, PNG, WebP or HEIC).');
    if (f.size > MAX_ORIGINAL) return setError('That photo is too large. Try a smaller one.');
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clear = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (input.current) input.current.value = '';
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    if (file) {
      setUploading(true);
      try {
        const { blob, ext, type } = await shrink(file);
        if (blob.size > MAX_UPLOAD) throw new Error('That photo is still too large after resizing. Try another one.');
        const path = `${householdId}/${choreId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await createClient().storage.from('proofs').upload(path, blob, { contentType: type, upsert: false });
        if (upErr) throw new Error('The photo couldn’t be uploaded. Check your connection and try again, or hand it in without a photo.');
        fd.set('photo_path', path);
      } catch (err) {
        setUploading(false);
        return setError(err instanceof Error ? err.message : 'The photo couldn’t be uploaded.');
      }
      setUploading(false);
    }
    startTransition(() => action(fd));
  };

  const busy = uploading || pending;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="id" value={choreId} />
      {(error || state?.error) && <Notice tone="danger">{error || state?.error}</Notice>}

      <div>
        <span className={labelClass}>Photo <span className="font-normal text-ink-3">(optional)</span></span>
        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-line bg-black/[0.03]">
            <img src={preview} alt="Your photo" className="max-h-80 w-full object-contain" />
            <button type="button" onClick={clear} aria-label="Remove photo" className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow"><X size={18} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-white py-6 font-medium text-ink-2 hover:border-ink-3">
            <Camera size={20} aria-hidden="true" />Add a photo
          </button>
        )}
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="Choose a photo" onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <label className="block">
        <span className={labelClass}>Note <span className="font-normal text-ink-3">(optional)</span></span>
        <textarea name="note" className={textareaClass} rows={2} maxLength={300} placeholder={resubmit ? 'What did you change?' : 'Anything to add?'} />
      </label>

      <button type="submit" disabled={busy} aria-busy={busy} className={buttonClass('primary', 'lg') + ' w-full'}>
        <Check size={20} aria-hidden="true" />
        {uploading ? 'Uploading photo…' : pending ? 'Handing in…' : resubmit ? 'Hand it in again' : 'I’ve done it'}
      </button>
    </form>
  );
}
