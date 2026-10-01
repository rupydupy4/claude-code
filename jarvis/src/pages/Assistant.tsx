import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Conversation, Message } from '../domain/types';
import { deleteConversation, getState, loadMessages, upsert, useStore } from '../data/store';
import { resolvePending, sendMessage, useAIStatus } from '../ai/assistant';
import { webSearchConfigured } from '../services/research';
import { SpeechStreamer } from '../voice/VoiceService';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { confirmAction, copyText, EmptyState, Modal, ORB_LABEL, Orb, DemoBadge } from '../components/ui';
import { notify } from '../services/notify';
import { cancelListening, setBusy, startListening, stopListening, stopSpeaking, takePending, useSession, voice } from '../app/session';
import { formatDay, todayKey } from '../utils/dates';

const PAGE = 60;

const SUGGESTIONS = ['What do I need to get done today?', 'Plan my day', 'What’s overdue?', 'What do I have tomorrow?', 'Remind me tomorrow at 9 AM to send the report', 'Create a high-priority task to prepare the client deck due Friday'];

export default function Assistant() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const convId = params.get('c');
  const conversations = useStore((s) => s.conversations);
  const settings = useStore((s) => s.settings);
  const documents = useStore((s) => s.documents);
  const ai = useAIStatus();
  const session = useSession();

  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [research, setResearch] = useState(false);
  const [docId, setDocId] = useState<string | undefined>(params.get('doc') ?? undefined);
  const [busy, setBusyLocal] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [renaming, setRenaming] = useState<Conversation | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const ownConvRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  /** Bumped whenever the visible conversation changes, so a late reply never lands in the wrong one. */
  const gen = useRef(0);
  const state = useRef({ conv, messages, busy });
  state.current = { conv, messages, busy };

  // Load the selected conversation (skip when it's the one this screen just created).
  useEffect(() => {
    if (convId && convId === ownConvRef.current) return;
    gen.current++;
    abortRef.current?.abort();
    setShown(PAGE);
    if (!convId) {
      setConv(null);
      setMessages([]);
      return;
    }
    const c = getState().conversations.find((x) => x.id === convId) ?? null;
    if (!c) {
      // Unknown or deleted conversation: fall back to a new one.
      setParams({}, { replace: true });
      return;
    }
    let live = true;
    setLoading(true);
    void loadMessages(convId).then((m) => {
      if (!live) return;
      ownConvRef.current = convId;
      setConv(c);
      setMessages(m);
      setLoading(false);
      stick.current = true;
    });
    return () => {
      live = false;
    };
  }, [convId, setParams]);

  useEffect(() => {
    const d = params.get('doc');
    if (d) setDocId(d);
    if (params.get('focus')) inputRef.current?.focus();
  }, [params]);

  // Keep the newest message in view while the user is at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = useCallback(
    async (raw: string, opts: { voice?: boolean; research?: boolean; documentId?: string } = {}) => {
      const text = raw.trim();
      if (!text || state.current.busy) return;
      const ctrl = new AbortController();
      const myGen = gen.current;
      const current = () => gen.current === myGen;
      abortRef.current = ctrl;
      setBusyLocal(true);
      setBusy(true);
      setInput('');
      stick.current = true;
      const v = voice();
      const s = getState().settings;
      const speak = !!opts.voice && s.voice.enabled && s.voice.autoRead && v.ttsSupported;
      const streamer = speak ? new SpeechStreamer(v, { rate: s.voice.rate, voiceURI: s.voice.voiceURI }) : null;
      try {
        const res = await sendMessage({
          conversation: state.current.conv,
          messages: state.current.messages,
          text,
          research: opts.research ?? research,
          documentId: opts.documentId ?? docId,
          voice: !!opts.voice,
          signal: ctrl.signal,
          onUpdate: (m) => {
            if (!current()) return;
            setMessages(m);
            const last = m.at(-1);
            if (streamer && last?.role === 'assistant' && !ctrl.signal.aborted) streamer.update(last.content);
          },
        });
        const last = res.messages.at(-1);
        if (streamer && last?.role === 'assistant' && !ctrl.signal.aborted) streamer.finish(last.content);
        if (!current()) return;
        setMessages(res.messages);
        setConv(res.conversation);
        if (ownConvRef.current !== res.conversation.id) {
          ownConvRef.current = res.conversation.id;
          setParams({ c: res.conversation.id }, { replace: true });
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Something went wrong.', 'error');
      } finally {
        abortRef.current = null;
        setBusyLocal(false);
        setBusy(false);
      }
    },
    [research, docId, setParams],
  );

  // A prompt queued elsewhere (dashboard ask bar, voice button) is sent once this screen is ready.
  useEffect(() => {
    if (loading || busy || !session.pending) return;
    // Wait until the screen shows the conversation the URL asks for.
    if ((conv?.id ?? null) !== convId) return;
    const p = takePending();
    if (!p) return;
    void send(p.text, { voice: p.voice, research: p.research, documentId: p.documentId });
  }, [session.pending, loading, busy, send, conv, convId]);

  useEffect(() => () => {
    abortRef.current?.abort();
    setBusy(false);
  }, []);

  const stop = () => {
    abortRef.current?.abort();
    stopSpeaking();
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    void send(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const mic = () => {
    if (session.listening) return stopListening();
    const ok = startListening((text) => void send(text, { voice: true }));
    if (!ok) inputRef.current?.focus();
  };

  const newChat = () => {
    gen.current++;
    abortRef.current?.abort();
    setConv(null);
    setMessages([]);
    ownConvRef.current = null;
    setParams({}, { replace: false });
    setDocId(undefined);
    setHistoryOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const confirmPending = async (messageId: string, ok: boolean) => {
    if (!conv) return;
    const next = await resolvePending(conv, messages, messageId, ok);
    setMessages(next);
  };

  const removeConversation = async (c: Conversation) => {
    if (!(await confirmAction({ title: 'Delete conversation?', body: `“${c.title}” and its messages will be permanently deleted.`, confirmLabel: 'Delete', danger: true }))) return;
    await deleteConversation(c.id);
    if (c.id === conv?.id) newChat();
    notify('Conversation deleted.');
  };

  const speakMessage = (m: Message) => {
    const v = voice();
    if (!v.ttsSupported) return notify('Spoken replies aren’t supported in this browser.', 'error');
    void v.textToSpeech(m.content, { rate: settings.voice.rate, voiceURI: settings.voice.voiceURI });
  };

  const doc = docId ? documents.find((d) => d.id === docId) : undefined;
  const visible = messages.slice(-shown);
  const name = settings.assistantName;

  const history = (
    <ConversationList
      conversations={conversations}
      activeId={conv?.id}
      onOpen={(id) => { setHistoryOpen(false); navigate(`/assistant?c=${id}`); }}
      onNew={newChat}
      onRename={setRenaming}
      onDelete={(c) => void removeConversation(c)}
    />
  );

  return (
    <div className="assistant">
      <aside className="conv-list" aria-label="Conversations">{history}</aside>

      <section className="chat" aria-label={`Conversation with ${name}`}>
        <div className="chat-head">
          <Orb state={session.orb} size={30} />
          <div className="grow">
            <div className="truncate" style={{ fontWeight: 600 }}>{conv?.title ?? 'New conversation'}</div>
            <div className="tiny faint" aria-live="polite">
              {ORB_LABEL[session.orb]} · {ai.mode === 'claude' ? 'AI with workspace tools' : 'Command mode'}
            </div>
          </div>
          {session.speaking && (
            <button type="button" className="btn sm" onClick={stopSpeaking}><Icon name="mute" size={16} />Stop speaking</button>
          )}
          <button type="button" className="icon-btn conv-toggle" aria-label="Conversation history" onClick={() => setHistoryOpen(true)}><Icon name="menu" /></button>
          <button type="button" className="icon-btn" aria-label="New conversation" onClick={newChat}><Icon name="message-plus" /></button>
        </div>

        <div className="messages" ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-busy={busy} aria-label="Messages">
          {loading ? (
            <div className="row" style={{ justifyContent: 'center' }}><Orb state="processing" size={32} /></div>
          ) : messages.length === 0 ? (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center', paddingTop: '6vh' }}>
              <Orb state={session.orb} size={72} />
              <h1>How can I help{settings.address ? `, ${settings.address}` : ''}?</h1>
              <p className="muted" style={{ maxWidth: '52ch' }}>
                {ai.mode === 'claude'
                  ? 'Ask anything, or tell me what to do. I can manage your tasks, projects, notes, reminders and calendar, and work with your documents.'
                  : 'Give me a direct command and I’ll carry it out. Open JARVIS through claude.ai for free-form questions, writing help and document analysis.'}
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((q) => <button key={q} type="button" className="chip" onClick={() => void send(q)}>{q}</button>)}
              </div>
            </div>
          ) : (
            <>
              {messages.length > shown && (
                <button type="button" className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={() => setShown((n) => n + PAGE)}>Show earlier messages</button>
              )}
              {visible.map((m, i) => (
                <MessageView
                  key={m.id}
                  m={m}
                  name={name}
                  streaming={busy && i === visible.length - 1 && m.role === 'assistant'}
                  onConfirm={(ok) => void confirmPending(m.id, ok)}
                  onSpeak={() => speakMessage(m)}
                  onRetry={i === visible.length - 1 && m.role === 'assistant' && m.interrupted && !busy ? () => {
                    const prev = [...messages].reverse().find((x) => x.role === 'user');
                    if (prev) void send(prev.content);
                  } : undefined}
                />
              ))}
            </>
          )}
        </div>

        <form className="composer" onSubmit={submit}>
          <div className="composer-inner">
            {research && (
              <div className="notice small" role="status">
                <Icon name="globe" />
                <div>
                  {ai.mode !== 'claude'
                    ? 'Research needs the AI, which isn’t available in this version. Nothing will be searched.'
                    : webSearchConfigured()
                      ? 'Research mode: answers will use live web results with sources.'
                      : 'Live web search isn’t configured, so I can’t look anything up online. I’ll answer from general knowledge and say so.'}
                </div>
              </div>
            )}
            {(session.listening || session.transcript) && (
              <div className="row nowrap" role="status">
                <span className="transcript grow">{session.transcript || 'Listening…'}</span>
                <button type="button" className="btn ghost sm" onClick={cancelListening}>Cancel</button>
              </div>
            )}
            {doc && (
              <div>
                <span className="attach-chip">
                  <Icon name="file" size={14} />
                  <span className="truncate">{doc.name}</span>
                  <button type="button" className="icon-btn sm" aria-label="Remove attached document" onClick={() => setDocId(undefined)}><Icon name="x" size={14} /></button>
                </span>
              </div>
            )}
            <div className="composer-row">
              <button type="button" className="icon-btn" aria-label="Attach a document" onClick={() => setAttachOpen(true)}><Icon name="attach" /></button>
              <button type="button" className="icon-btn" aria-label="Research mode" aria-pressed={research} onClick={() => setResearch((r) => !r)}><Icon name="globe" /></button>
              <label htmlFor="composer-input" className="sr-only">Message {name}</label>
              <textarea
                id="composer-input"
                ref={inputRef}
                rows={1}
                value={input}
                placeholder={session.listening ? 'Listening…' : `Message ${name}`}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={8000}
              />
              {settings.voice.enabled && (
                <button type="button" className="icon-btn" aria-label={session.listening ? 'Stop listening' : 'Speak'} aria-pressed={session.listening} onClick={mic}>
                  <Icon name={session.listening ? 'mic-off' : 'mic'} />
                </button>
              )}
              {busy ? (
                <button type="button" className="btn" onClick={stop} aria-label="Stop generating"><Icon name="stop" size={16} /></button>
              ) : (
                <button type="submit" className="btn primary" disabled={!input.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
              )}
            </div>
          </div>
        </form>
      </section>

      <Modal open={historyOpen} title="Conversations" onClose={() => setHistoryOpen(false)}>{history}</Modal>
      <AttachDialog open={attachOpen} onClose={() => setAttachOpen(false)} onPick={(id) => { setDocId(id); setAttachOpen(false); inputRef.current?.focus(); }} />
      {renaming && <RenameDialog conv={renaming} onClose={() => setRenaming(null)} onSaved={(c) => { if (c.id === conv?.id) setConv(c); }} />}
    </div>
  );
}

function MessageView({ m, name, streaming, onConfirm, onSpeak, onRetry }: { m: Message; name: string; streaming: boolean; onConfirm: (ok: boolean) => void; onSpeak: () => void; onRetry?: () => void }) {
  if (m.role === 'user') {
    return (
      <div className="msg user">
        <span className="sr-only">You said:</span>
        <div className="bubble">{m.content}</div>
      </div>
    );
  }
  const copy = async () => notify((await copyText(m.content)) ? 'Copied.' : 'Copy isn’t available here. Select the text instead.', 'info', undefined, 2000);
  return (
    <div className="msg assistant">
      <div className="who label">{name}</div>
      {m.tools && m.tools.length > 0 && (
        <div className="tool-chips" aria-label="Actions taken">
          {m.tools.map((t, i) => (
            <span key={i} className={`tool-chip${t.ok ? '' : ' fail'}`}>
              <Icon name={t.ok ? 'check' : 'alert'} size={13} />
              {t.summary}
            </span>
          ))}
        </div>
      )}
      <div className="body">
        {m.content ? <Markdown text={m.content} /> : streaming ? <span className="typing" aria-label="Thinking"><i /><i /><i /></span> : null}
      </div>
      {m.confirm && (
        m.confirm.state === 'pending' ? (
          <div className="confirm-card" role="group" aria-label="Confirmation needed">
            <div className="row nowrap"><Icon name="warning" /><strong className="grow wrap">{m.confirm.description}</strong></div>
            <div className="row">
              <button type="button" className="btn danger sm" onClick={() => onConfirm(true)}>Confirm</button>
              <button type="button" className="btn sm" onClick={() => onConfirm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <p className="tiny faint">{m.confirm.state === 'confirmed' ? 'Confirmed' : 'Cancelled'}: {m.confirm.description}</p>
        )
      )}
      {m.sources && m.sources.length > 0 && (
        <div className="sources">
          <span className="label">Sources</span>
          {m.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="wrap">{s.title}</a>)}
        </div>
      )}
      {m.interrupted && !streaming && <p className="tiny faint">This answer was cut short.</p>}
      {!streaming && m.content && (
        <div className="msg-actions">
          <button type="button" className="icon-btn sm" aria-label="Copy reply" onClick={() => void copy()}><Icon name="copy" size={16} /></button>
          <button type="button" className="icon-btn sm" aria-label="Read reply aloud" onClick={onSpeak}><Icon name="speak" size={16} /></button>
          {onRetry && <button type="button" className="icon-btn sm" aria-label="Try again" onClick={onRetry}><Icon name="retry" size={16} /></button>}
        </div>
      )}
    </div>
  );
}

function ConversationList({ conversations, activeId, onOpen, onNew, onRename, onDelete }: { conversations: Conversation[]; activeId?: string; onOpen: (id: string) => void; onNew: () => void; onRename: (c: Conversation) => void; onDelete: (c: Conversation) => void }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? conversations.filter((c) => c.title.toLowerCase().includes(t) || c.searchText.toLowerCase().includes(t)) : conversations;
  }, [conversations, q]);
  return (
    <div className="stack-sm">
      <button type="button" className="btn primary block" onClick={onNew}><Icon name="message-plus" size={16} />New conversation</button>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
      {list.length === 0 ? (
        <p className="small faint" style={{ padding: '8px 4px' }}>{q ? 'No conversations match.' : 'No conversations yet.'}</p>
      ) : (
        <ul className="list" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {list.slice(0, limit).map((c) => (
            <li key={c.id} className={`conv-item${c.id === activeId ? ' active' : ''}`} style={{ padding: 0, minHeight: 0, border: 0 }}>
              <button type="button" className="open" onClick={() => onOpen(c.id)} aria-current={c.id === activeId ? 'true' : undefined}>
                <div className="truncate">{c.title}</div>
                <div className="tiny faint">{formatDay(todayKey(new Date(c.lastMessageAt)))} · {c.messageCount} messages <DemoBadge show={c.demo} /></div>
              </button>
              <button type="button" className="icon-btn sm" aria-label={`Rename “${c.title}”`} onClick={() => onRename(c)}><Icon name="edit" size={14} /></button>
              <button type="button" className="icon-btn sm" aria-label={`Delete “${c.title}”`} onClick={() => onDelete(c)}><Icon name="trash" size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {list.length > limit && <button type="button" className="btn ghost sm" onClick={() => setLimit((n) => n + 40)}>Show more</button>}
    </div>
  );
}

function RenameDialog({ conv, onClose, onSaved }: { conv: Conversation; onClose: () => void; onSaved: (c: Conversation) => void }) {
  const [title, setTitle] = useState(conv.title);
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    const t = title.trim().slice(0, 70);
    if (!t) return;
    const next = { ...conv, title: t };
    void upsert('conversations', next);
    onSaved(next);
    onClose();
  };
  return (
    <Modal open title="Rename conversation" onClose={onClose} footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => save()} disabled={!title.trim()}>Save</button></>}>
      <form onSubmit={save}>
        <label className="field">Title<input type="text" value={title} autoFocus maxLength={70} onChange={(e) => setTitle(e.target.value)} /></label>
      </form>
    </Modal>
  );
}

function AttachDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const documents = useStore((s) => s.documents);
  return (
    <Modal open={open} title="Attach a document" onClose={onClose}>
      {documents.length === 0 ? (
        <EmptyState icon="file" title="No documents yet" action={<Link to="/documents" className="btn primary" onClick={onClose}>Upload a document</Link>}>
          Upload a PDF, Word, text or Markdown file first.
        </EmptyState>
      ) : (
        <>
          <ul className="list panel flush">
            {documents.map((d) => (
              <li key={d.id}>
                <button type="button" className="item-btn" onClick={() => onPick(d.id)}>
                  <div className="title">{d.name}</div>
                  <div className="meta">{Math.ceil(d.size / 1024)} KB · {d.textLength.toLocaleString()} characters <DemoBadge show={d.demo} /></div>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/documents" onClick={onClose} className="small">Upload another document</Link>
        </>
      )}
    </Modal>
  );
}
