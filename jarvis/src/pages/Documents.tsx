import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { DocumentMeta } from '../domain/types';
import { deleteDocument, loadDocumentText, logActivity, saveDocument, upsert, useStore } from '../data/store';
import { ACCEPT, DocumentError, MAX_UPLOAD_BYTES, extractText } from '../services/documents';
import { analyseDocument, aiAvailable } from '../ai/assistant';
import { createNote, createTask } from '../services/actions';
import { formatDay, nowIso, todayKey } from '../utils/dates';
import { uid } from '../utils/ids';
import { Icon } from '../components/Icon';
import { confirmAction, DemoBadge, EmptyState, Orb, PageHeader } from '../components/ui';
import { notify } from '../services/notify';
import { errorCopy, AIError } from '../ai/AIService';

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function Documents() {
  const documents = useStore((s) => s.documents);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const openId = params.get('open');
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handled = useRef<File | null>(null);

  const upload = async (file: File) => {
    setError('');
    if (file.size > MAX_UPLOAD_BYTES) return setError('That file is larger than 15 MB. Try a smaller file or an excerpt.');
    setUploading(file.name);
    try {
      const { text, truncated } = await extractText(file);
      const at = nowIso();
      const meta: DocumentMeta = { id: uid(), createdAt: at, updatedAt: at, name: file.name.slice(0, 200), mimeType: file.type || 'text/plain', size: file.size, textLength: text.length, truncated, summary: '' };
      await saveDocument(meta, text);
      logActivity('created', 'document', `Document uploaded: ${meta.name}`, meta.id);
      notify(`Uploaded ${meta.name}.${truncated ? ' Only the first 200,000 characters were kept.' : ''}`, 'success');
      setParams({ open: meta.id, analyse: '1' });
    } catch (e) {
      setError(e instanceof DocumentError ? e.message : 'The file couldn’t be read.');
    } finally {
      setUploading('');
    }
  };

  // A file chosen from the dashboard's "Upload document" arrives in router state.
  useEffect(() => {
    const f = (location.state as { file?: File } | null)?.file;
    if (f && handled.current !== f) {
      handled.current = f;
      navigate('/documents', { replace: true, state: null });
      void upload(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  };

  const doc = openId ? documents.find((d) => d.id === openId) : undefined;
  if (doc) return <DocumentDetail doc={doc} autoAnalyse={params.get('analyse') === '1'} onBack={() => setParams({})} />;

  return (
    <div className="stack">
      <PageHeader title="Documents" subtitle="Upload a file to summarise it, ask questions, and turn it into tasks and notes. Files are read in your browser." />
      <div
        className="panel stack-sm"
        style={{ borderStyle: 'dashed', borderColor: drag ? 'var(--accent)' : undefined, textAlign: 'center', alignItems: 'center', padding: 28 }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <div className="row" role="status"><Orb state="processing" size={28} /> Reading {uploading}…</div>
        ) : (
          <>
            <Icon name="upload" size={26} className="faint" />
            <div><strong>Drop a file here</strong> or</div>
            <button type="button" className="btn primary" onClick={() => inputRef.current?.click()}>Choose a file</button>
            <div className="tiny faint">PDF, Word (.docx), text, Markdown, CSV, JSON or HTML · up to 15 MB</div>
          </>
        )}
        <input ref={inputRef} type="file" accept={ACCEPT} hidden aria-label="Choose a document" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      </div>
      {error && <div className="notice danger" role="alert"><Icon name="warning" /><div>{error}</div></div>}
      {documents.length === 0 ? (
        <EmptyState icon="file" title="No documents yet">Upload a brief, report or meeting notes to get started.</EmptyState>
      ) : (
        <ul className="list panel flush">
          {documents.map((d) => (
            <li key={d.id}>
              <Icon name="file" className="faint" />
              <button type="button" className="item-btn" onClick={() => setParams({ open: d.id })}>
                <div className="title">{d.name}</div>
                <div className="meta">
                  <span>{kb(d.size)}</span>
                  <span>{formatDay(todayKey(new Date(d.createdAt)))}</span>
                  {d.summary ? <span className="badge ok">Analysed</span> : <span className="badge">Not analysed</span>}
                  <DemoBadge show={d.demo} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentDetail({ doc, autoAnalyse, onBack }: { doc: DocumentMeta; autoAnalyse: boolean; onBack: () => void }) {
  const projects = useStore((s) => s.projects);
  const navigate = useNavigate();
  const [text, setText] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const started = useRef(false);
  const a = doc.analysis;

  useEffect(() => {
    let live = true;
    void loadDocumentText(doc.id).then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, [doc.id]);

  const analyse = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const t = text ?? (await loadDocumentText(doc.id));
      const r = await analyseDocument(t, doc.name);
      const next: DocumentMeta = { ...doc, summary: r.summary, updatedAt: nowIso(), analysis: { ai: r.ai, at: nowIso(), keyPoints: r.keyPoints, actionItems: r.actionItems, deadlines: r.deadlines } };
      await upsert('documents', next);
      logActivity('analysed', 'document', `Document analysed: ${doc.name}`, doc.id);
      setPicked(new Set(r.actionItems.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof AIError ? errorCopy(e.code) : 'The analysis didn’t complete. Try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoAnalyse && !started.current && !doc.analysis && text !== null) {
      started.current = true;
      void analyse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyse, text]);

  const createTasks = () => {
    if (!a) return;
    const items = a.actionItems.filter((_, i) => picked.has(i));
    items.forEach((it) => createTask({ title: it.title, dueDate: it.dueDate, projectId: doc.projectId, notes: `From document: ${doc.name}` }));
    notify(`Created ${items.length} ${items.length === 1 ? 'task' : 'tasks'}.`, 'success');
    setPicked(new Set());
  };
  const deadlineTask = (what: string, date: string) => {
    createTask({ title: what.slice(0, 200), dueDate: date, priority: 'high', projectId: doc.projectId, notes: `Deadline from document: ${doc.name}` });
    notify('Deadline added as a task.', 'success');
  };
  const saveNote = () => {
    if (!doc.summary) return;
    const body = [doc.summary, ...(a?.keyPoints.length ? ['', 'Key points:', ...a.keyPoints.map((k) => `- ${k}`)] : [])].join('\n');
    createNote({ title: `Summary: ${doc.name}`.slice(0, 160), content: body, projectId: doc.projectId, tags: ['document'] });
    notify('Summary saved as a note.', 'success');
  };
  const remove = async () => {
    if (!(await confirmAction({ title: 'Delete document?', body: `“${doc.name}” and its extracted text will be deleted.`, confirmLabel: 'Delete', danger: true }))) return;
    await deleteDocument(doc.id);
    logActivity('deleted', 'document', `Document deleted: ${doc.name}`, doc.id);
    onBack();
  };

  return (
    <div className="stack">
      <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}><Icon name="back" size={16} />Documents</button>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow">
          <h1 className="wrap">{doc.name} <DemoBadge show={doc.demo} /></h1>
          <p className="small">{kb(doc.size)} · {doc.textLength.toLocaleString()} characters{doc.truncated ? ' (truncated)' : ''}</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => navigate(`/assistant?doc=${doc.id}`)}><Icon name="message" size={16} />Ask about it</button>
          <button type="button" className="btn danger" onClick={() => void remove()}><Icon name="trash" size={16} />Delete</button>
        </div>
      </header>

      <label className="field" style={{ maxWidth: 360 }}>
        Project
        <select value={doc.projectId ?? ''} onChange={(e) => void upsert('documents', { ...doc, projectId: e.target.value || undefined, updatedAt: nowIso() })}>
          <option value="">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <section className="panel stack-sm" aria-labelledby="analysis-h">
        <div className="panel-head" style={{ marginBottom: 0 }}>
          <h2 id="analysis-h">Analysis</h2>
          <button type="button" className="btn sm" onClick={() => void analyse()} disabled={busy || text === null}>
            <Icon name="sparkles" size={16} />{busy ? 'Analysing…' : a ? 'Analyse again' : 'Analyse'}
          </button>
        </div>
        {busy && <div className="row" role="status"><Orb state="processing" size={24} /><span className="small muted">Reading the document…</span></div>}
        {error && <div className="notice danger" role="alert"><Icon name="warning" /><div>{error}</div></div>}
        {!a && !busy && (
          <p className="small muted">
            Get a summary, key points, action items and deadlines.
            {!aiAvailable() && ' Without the AI this uses quick offline rules: it picks out sentences that look like instructions or dates. Open JARVIS through claude.ai for a full AI analysis.'}
          </p>
        )}
        {a && (
          <div className="stack">
            {!a.ai && <div className="notice small"><Icon name="info" /><div>Offline analysis: based on simple rules, not AI. Check it before relying on it.</div></div>}
            <div>
              <h3>Summary</h3>
              <p className="wrap" style={{ marginTop: 4 }}>{doc.summary || 'No summary.'}</p>
              {doc.summary && <button type="button" className="btn ghost sm" style={{ marginTop: 6 }} onClick={saveNote}><Icon name="note" size={16} />Save as note</button>}
            </div>
            {a.keyPoints.length > 0 && (
              <div>
                <h3>Key points</h3>
                <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>{a.keyPoints.map((k, i) => <li key={i} className="wrap">{k}</li>)}</ul>
              </div>
            )}
            <div>
              <h3>Action items</h3>
              {a.actionItems.length ? (
                <>
                  <div className="stack-sm" style={{ marginTop: 6 }}>
                    {a.actionItems.map((it, i) => (
                      <label key={i} className="check">
                        <input type="checkbox" checked={picked.has(i)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(i); else n.delete(i); setPicked(n); }} />
                        <span className="wrap">{it.title}{it.dueDate && <span className="faint small"> · due {formatDay(it.dueDate)}</span>}</span>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="btn primary sm" style={{ marginTop: 10 }} disabled={!picked.size} onClick={createTasks}>Create {picked.size || ''} {picked.size === 1 ? 'task' : 'tasks'}</button>
                </>
              ) : <p className="small muted">None found.</p>}
            </div>
            <div>
              <h3>Deadlines</h3>
              {a.deadlines.length ? (
                <ul className="list">
                  {a.deadlines.map((d, i) => (
                    <li key={i} style={{ paddingInline: 0, flexWrap: 'wrap' }}>
                      <span className="badge warn num">{d.date}</span>
                      <span className="wrap" style={{ flex: '1 1 180px' }}>{d.what}</span>
                      <button type="button" className="btn ghost sm" onClick={() => deadlineTask(d.what, d.date)}>Add as task</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="small muted">None found.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="panel stack-sm" aria-labelledby="text-h">
        <h2 id="text-h">Text</h2>
        {text === null ? <p className="small muted">Loading…</p> : (
          <>
            <div className="small wrap" style={{ whiteSpace: 'pre-wrap', maxHeight: full ? undefined : 360, overflow: 'hidden', fontFamily: 'var(--font-body)' }}>{full ? text : text.slice(0, 4000)}</div>
            {text.length > 4000 && <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setFull((v) => !v)}>{full ? 'Show less' : 'Show all'}</button>}
          </>
        )}
      </section>
      <p className="tiny faint">Questions about the document go to the assistant: <Link to={`/assistant?doc=${doc.id}`}>ask about {doc.name}</Link>.</p>
    </div>
  );
}
