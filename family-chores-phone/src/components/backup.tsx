import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';
import { backupFileName, exportBackup, importBackup } from '../lib/store';
import { isNative, saveTextFile } from '../lib/native';
import { message } from './forms';
import { Notice, buttonClass } from './ui';

/** Parent only: save everything (photos included) as one JSON file. */
export function SaveBackupButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const text = await exportBackup();
      const shared = await saveTextFile(backupFileName(), text);
      if (shared) setNote({ tone: 'ok', text: isNative() ? 'Backup ready. Keep it somewhere safe, such as Files or your cloud drive.' : 'Backup saved to your downloads.' });
    } catch (e) {
      setNote({ tone: 'danger', text: message(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
      <button type="button" className={buttonClass('secondary')} onClick={save} disabled={busy}><Download size={18} aria-hidden="true" />{busy ? 'Preparing…' : 'Save a backup'}</button>
    </div>
  );
}

/**
 * Restore from a backup file. Replaces everything on this device, so it asks first when a household
 * already exists. Afterwards everyone picks their name again.
 */
export function RestoreBackup({ replacing }: { replacing: boolean }) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const restore = async (f: File) => {
    setBusy(true);
    setError('');
    try {
      const name = await importBackup(await f.text());
      navigate('/', { replace: true, state: { notice: `Restored ${name}.` } });
    } catch (e) {
      setError(message(e));
      setFile(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const picked = (f?: File) => {
    setError('');
    if (!f) return;
    if (replacing) setFile(f);
    else void restore(f);
  };

  return (
    <div className="space-y-3">
      {error && <Notice tone="danger">{error}</Notice>}
      {file ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft p-3" role="group" aria-label="Confirm restore">
          <span className="mr-auto text-sm font-medium text-danger">Replace everything on this device with “{file.name}”?</span>
          <button type="button" data-back-cancel className={buttonClass('secondary', 'sm')} onClick={() => setFile(null)}>Cancel</button>
          <button type="button" disabled={busy} className={buttonClass('danger', 'sm') + ' !bg-danger !text-canvas'} onClick={() => restore(file)}>{busy ? 'Restoring…' : 'Replace'}</button>
        </div>
      ) : (
        <button type="button" className={buttonClass('secondary')} onClick={() => input.current?.click()} disabled={busy}>
          <Upload size={18} aria-hidden="true" />{busy ? 'Restoring…' : 'Restore from a backup'}
        </button>
      )}
      <input ref={input} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Choose a backup file" onChange={(e) => picked(e.target.files?.[0])} />
    </div>
  );
}
