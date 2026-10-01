import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WRITING_ACTIONS, aiAvailable, rewrite, streamText, type WritingAction } from '../ai/assistant';
import { AIError, errorCopy } from '../ai/AIService';
import { createNote } from '../services/actions';
import { Icon } from '../components/Icon';
import { copyText, PageHeader } from '../components/ui';
import { notify } from '../services/notify';
import { useStore } from '../data/store';

const ACTION_LABEL: Record<WritingAction, string> = {
  improve: 'Improve', shorten: 'Shorten', expand: 'Expand', professional: 'More professional', concise: 'More concise', grammar: 'Fix grammar', summarise: 'Summarise',
};
const TEMPLATES: { id: string; label: string; prompt: string }[] = [
  { id: 'email', label: 'Email', prompt: 'Write a clear, friendly professional email based on these notes. Include a subject line.' },
  { id: 'status', label: 'Status update', prompt: 'Write a short project status update (done, next, risks) based on these notes.' },
  { id: 'meeting', label: 'Meeting summary', prompt: 'Turn these meeting notes into a summary with decisions and action items (owner, due date if given).' },
  { id: 'proposal', label: 'Proposal outline', prompt: 'Draft a concise proposal outline (problem, approach, timeline, cost placeholders) from these notes.' },
];

export default function Writing() {
  const style = useStore((s) => s.settings.responseStyle);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const ai = aiAvailable();

  const run = async (label: string, job: (onText: (t: string) => void, signal: AbortSignal) => Promise<string>) => {
    if (!input.trim() || busy) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(label);
    setError('');
    setOutput('');
    try {
      const text = await job((t) => setOutput(t), ctrl.signal);
      setOutput(text);
    } catch (e) {
      if (e instanceof AIError && e.code === 'cancelled') return;
      setError(e instanceof AIError ? errorCopy(e.code) : 'That didn’t work. Try again.');
    } finally {
      setBusy('');
      abort.current = null;
    }
  };

  const copy = async () => notify((await copyText(output)) ? 'Copied.' : 'Copy isn’t available here. Select the text instead.', 'info', undefined, 2000);

  return (
    <div className="stack">
      <PageHeader title="Writing" subtitle="Paste text, then choose what to do with it." />
      {!ai && (
        <div className="notice"><Icon name="info" /><div className="small">The writing assistant needs the AI, which is available when you open JARVIS through claude.ai. Your text stays here; nothing is sent anywhere in this version.</div></div>
      )}
      <div className="cols-2">
        <div className="stack-sm">
          <label className="field" htmlFor="writing-in">Your text</label>
          <textarea id="writing-in" value={input} onChange={(e) => setInput(e.target.value)} rows={12} maxLength={40000} placeholder="Paste or write something…" />
          <div className="tiny faint num">{input.length.toLocaleString()} characters</div>
          <div className="chips" role="group" aria-label="Rewrite">
            {(Object.keys(WRITING_ACTIONS) as WritingAction[]).map((a) => (
              <button key={a} type="button" className="chip" disabled={!ai || !input.trim() || !!busy} onClick={() => void run(ACTION_LABEL[a], (onText, signal) => rewrite(a, input, onText, signal))}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
          <div className="label" style={{ marginTop: 6 }}>Draft from notes</div>
          <div className="chips" role="group" aria-label="Templates">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" className="chip" disabled={!ai || !input.trim() || !!busy} onClick={() => void run(t.label, (onText, signal) => streamText(`${t.prompt} Style: ${style}. Reply with only the text.\n\n---\n${input.slice(0, 40000)}`, onText, signal))}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="stack-sm">
          <div className="row between">
            <span className="field">{busy ? `${busy}…` : 'Result'}</span>
            {busy && <button type="button" className="btn sm" onClick={() => abort.current?.abort()}><Icon name="stop" size={14} />Stop</button>}
          </div>
          <div className="panel wrap" style={{ minHeight: 260, whiteSpace: 'pre-wrap' }} aria-live="polite" aria-busy={!!busy}>
            {output || <span className="faint">{busy ? '' : 'The result appears here.'}</span>}
          </div>
          {error && <div className="notice danger" role="alert"><Icon name="warning" /><div>{error}</div></div>}
          {output && !busy && (
            <div className="row">
              <button type="button" className="btn sm" onClick={() => void copy()}><Icon name="copy" size={16} />Copy</button>
              <button type="button" className="btn sm" onClick={() => { setInput(output); setOutput(''); }}><Icon name="retry" size={16} />Use as input</button>
              <button type="button" className="btn sm" onClick={() => { createNote({ content: output }); notify('Saved as a note.', 'success'); }}><Icon name="note" size={16} />Save as note</button>
            </div>
          )}
          <p className="tiny faint">You can also ask in the <Link to="/assistant">assistant</Link>: “Rewrite this email to sound more professional.”</p>
        </div>
      </div>
    </div>
  );
}
