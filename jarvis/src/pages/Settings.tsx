import { useEffect, useState, type ReactNode } from 'react';
import type { AiSpeed, ResponseStyle, Settings as SettingsT, ThemePref } from '../domain/types';
import { clearConversations, clearMemories, deleteAllData, exportAll, removeDemoData, updateSettings, useStore } from '../data/store';
import { loadDemoData } from '../data/demo';
import { useAIStatus } from '../ai/assistant';
import { webSearchConfigured } from '../services/research';
import { requestNotificationPermission } from '../services/reminders';
import { AI_VERSION_URL, getDownloads } from '../platform/claude';
import { pickBritishMale } from '../voice/VoiceService';
import { voice } from '../app/session';
import { Icon } from '../components/Icon';
import { confirmAction, Field, PageHeader, Segmented, SettingRow, Toggle } from '../components/ui';
import { notify } from '../services/notify';

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section className="panel" aria-labelledby={id}>
      <h2 id={id} style={{ marginBottom: 6 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function Settings() {
  const s = useStore((x) => x.settings);
  const repoDescription = useStore((x) => x.repoDescription);
  const counts = useStore((x) => `${x.tasks.length} tasks · ${x.projects.length} projects · ${x.notes.length} notes · ${x.conversations.length} conversations · ${x.memories.length} memories · ${x.documents.length} documents`);
  const ai = useAIStatus();
  const v = voice();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => v.voices());
  const set = (patch: Partial<SettingsT>) => void updateSettings(patch);

  useEffect(() => {
    if (!v.ttsSupported) return;
    const update = () => setVoices(v.voices());
    speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, [v]);

  const setNotifications = async (patch: Partial<SettingsT['notifications']>) => {
    if (patch.enabled) {
      const p = await requestNotificationPermission();
      if (p !== 'granted') notify(p === 'unsupported' ? 'System notifications aren’t available here. Reminders will show as banners while JARVIS is open.' : 'Permission wasn’t granted. Reminders will show as banners while JARVIS is open.', 'info', undefined, 7000);
    }
    set({ notifications: { ...s.notifications, ...patch } });
  };

  const exportData = async () => {
    try {
      const data = JSON.stringify(await exportAll(), null, 2);
      const filename = `jarvis-export-${new Date().toISOString().slice(0, 10)}.json`;
      const dl = await getDownloads();
      if (dl) {
        await dl.save({ filename, data: new Blob([data], { type: 'application/json' }) });
      } else {
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      notify('Export ready.', 'success');
    } catch {
      notify('The export couldn’t be saved.', 'error');
    }
  };

  const danger = async (title: string, body: string, label: string, run: () => Promise<void>, done: string) => {
    if (!(await confirmAction({ title, body, confirmLabel: label, danger: true }))) return;
    await run();
    notify(done);
  };

  const testVoice = () => {
    if (!v.ttsSupported) return notify('Spoken replies aren’t supported in this browser.', 'error');
    void v.textToSpeech(`Good ${new Date().getHours() < 12 ? 'morning' : 'day'}${s.address ? `, ${s.address}` : ''}. This is how I sound.`, { rate: s.voice.rate, voiceURI: s.voice.voiceURI });
  };

  const autoVoice = pickBritishMale(voices);
  const englishFirst = [...voices].sort((a, b) => Number(b.lang.startsWith('en')) - Number(a.lang.startsWith('en')) || a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <PageHeader title="Settings" />

      <Section title="Profile" id="set-profile">
        <div className="form-grid two">
          <Field label="What should I call you?">{(id) => <input id={id} type="text" value={s.address} maxLength={40} onChange={(e) => set({ address: e.target.value })} />}</Field>
          <Field label="Your name">{(id) => <input id={id} type="text" value={s.userName} maxLength={60} onChange={(e) => set({ userName: e.target.value })} />}</Field>
          <Field label="Assistant name" help="It answers to this name.">{(id, d) => <input id={id} type="text" value={s.assistantName} maxLength={24} aria-describedby={d} onChange={(e) => set({ assistantName: e.target.value })} onBlur={(e) => !e.target.value.trim() && set({ assistantName: 'JARVIS' })} />}</Field>
          <Field label="Work type">{(id) => <input id={id} type="text" value={s.workType} maxLength={60} onChange={(e) => set({ workType: e.target.value })} />}</Field>
        </div>
      </Section>

      <Section title="Appearance" id="set-look">
        <SettingRow title="Theme"><Segmented<ThemePref> label="Theme" value={s.theme} onChange={(theme) => set({ theme })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></SettingRow>
        <SettingRow title="Accent colour">
          <div className="row nowrap" role="group" aria-label="Accent colour">
            {(['brass', 'teal', 'blue', 'rose'] as const).map((a) => (
              <button key={a} type="button" aria-label={a} aria-pressed={s.accent === a} onClick={() => set({ accent: a })} data-accent-swatch={a}
                style={{ width: 30, height: 30, borderRadius: '50%', border: s.accent === a ? '2px solid var(--ink)' : '2px solid transparent', background: { brass: '#b8862f', teal: '#1f8f97', blue: '#3d6fc9', rose: '#b84d68' }[a], padding: 0 }} />
            ))}
          </div>
        </SettingRow>
      </Section>

      <Section title="Voice" id="set-voice">
        <SettingRow title="Voice" help={v.sttSupported ? 'Speak commands and hear replies.' : v.sttUnavailableReason}><Toggle label="Voice" checked={s.voice.enabled} onChange={(enabled) => set({ voice: { ...s.voice, enabled } })} /></SettingRow>
        <SettingRow title="Read replies aloud" help="When you speak to the assistant, it answers out loud."><Toggle label="Read replies aloud" checked={s.voice.autoRead} onChange={(autoRead) => set({ voice: { ...s.voice, autoRead } })} /></SettingRow>
        {v.ttsSupported ? (
          <div className="form-grid two" style={{ paddingTop: 8 }}>
            <Field label={`Speed · ${s.voice.rate.toFixed(1)}×`}>{(id) => <input id={id} type="range" min={0.6} max={1.6} step={0.1} value={s.voice.rate} onChange={(e) => set({ voice: { ...s.voice, rate: Number(e.target.value) } })} />}</Field>
            <Field label="Voice">
              {(id) => (
                <select id={id} value={s.voice.voiceURI} onChange={(e) => set({ voice: { ...s.voice, voiceURI: e.target.value } })}>
                  <option value="">British male (automatic){autoVoice ? ` · ${autoVoice.name}` : ''}</option>
                  {englishFirst.map((x) => <option key={x.voiceURI} value={x.voiceURI}>{x.name} ({x.lang})</option>)}
                </select>
              )}
            </Field>
            <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={testVoice}><Icon name="speak" size={16} />Test voice</button>
            {!s.voice.voiceURI && !autoVoice && voices.length > 0 && (
              <p className="small muted" style={{ gridColumn: '1 / -1' }}>
                No British male voice is installed on this device, so the default voice is used. On iPhone: Settings → Accessibility → Spoken Content → Voices → English → United Kingdom, then download Arthur or Daniel (Enhanced).
              </p>
            )}
          </div>
        ) : <p className="small muted">This browser can’t speak replies.</p>}
      </Section>

      <Section title="Assistant" id="set-ai">
        <SettingRow title="Response style"><Segmented<ResponseStyle> label="Response style" value={s.responseStyle} onChange={(responseStyle) => set({ responseStyle })} options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]} /></SettingRow>
        {ai.mode === 'claude' && (
          <SettingRow title="Thinking depth" help="Faster replies or more careful ones.">
            <Segmented<AiSpeed> label="Thinking depth" value={s.aiSpeed} onChange={(aiSpeed) => set({ aiSpeed })} options={[{ value: 'quick', label: 'Fast' }, { value: 'default', label: 'Balanced' }, { value: 'complex', label: 'Thorough' }]} />
          </SettingRow>
        )}
        <SettingRow title="Memory" help="Let the assistant save facts you ask it to remember."><Toggle label="Memory" checked={s.memoryEnabled} onChange={(memoryEnabled) => set({ memoryEnabled })} /></SettingRow>
        <div className="notice small" style={{ marginTop: 8 }}>
          <Icon name={ai.mode === 'claude' ? 'sparkles' : 'info'} />
          <div>
            {ai.mode === 'claude'
              ? `AI is on${ai.tools ? ', with access to your workspace tools' : ''}. Live web search is ${webSearchConfigured() ? 'configured' : 'not configured, so research answers come from general knowledge and say so'}.`
              : 'Command mode: the assistant understands direct commands (tasks, reminders, notes, events, projects, schedule, planning, search). Free-form AI is available in the claude.ai version.'}
            {ai.mode !== 'claude' && <> <a href={AI_VERSION_URL} target="_blank" rel="noopener noreferrer">Open the AI version</a></>}
          </div>
        </div>
      </Section>

      <Section title="Notifications" id="set-notify">
        <SettingRow title="System notifications" help="Alerts outside the app while JARVIS is open. Banners inside the app always appear."><Toggle label="System notifications" checked={s.notifications.enabled} onChange={(enabled) => void setNotifications({ enabled })} /></SettingRow>
        <SettingRow title="Reminders" help="Alert when a reminder or event reminder is due."><Toggle label="Reminder alerts" checked={s.notifications.reminders} onChange={(reminders) => void setNotifications({ reminders })} /></SettingRow>
        <SettingRow title="Deadlines" help="30 minutes before a timed task is due, and on a project’s deadline day."><Toggle label="Deadline alerts" checked={s.notifications.deadlines} onChange={(deadlines) => void setNotifications({ deadlines })} /></SettingRow>
        <SettingRow title="Daily heads-up" help="At most one message a day about the most pressing issue."><Toggle label="Daily heads-up" checked={s.notifications.proactive} onChange={(proactive) => void setNotifications({ proactive })} /></SettingRow>
      </Section>

      <Section title="Data and privacy" id="set-data">
        <p className="small muted">{repoDescription}</p>
        <p className="small faint num" style={{ marginTop: 4 }}>{counts}</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => void exportData()}><Icon name="download" size={16} />Export all data</button>
          {s.demoLoaded ? (
            <button type="button" className="btn" onClick={() => void danger('Remove example data?', 'All records marked “Example” will be deleted. Your own data is kept.', 'Remove', removeDemoData, 'Example data removed.')}>Remove example data</button>
          ) : (
            <button type="button" className="btn" onClick={() => void loadDemoData().then(() => notify('Example data added.', 'success'))}>Add example data</button>
          )}
        </div>
        <hr className="divider" style={{ margin: '16px 0' }} />
        <div className="row">
          <button type="button" className="btn danger" onClick={() => void danger('Clear all conversations?', 'Every conversation and its messages will be deleted.', 'Clear conversations', clearConversations, 'Conversations cleared.')}>Clear conversations</button>
          <button type="button" className="btn danger" onClick={() => void danger('Clear memory?', 'The assistant will forget everything it has been asked to remember.', 'Clear memory', clearMemories, 'Memory cleared.')}>Clear memory</button>
          <button type="button" className="btn danger" onClick={() => void danger('Delete all data?', 'Every task, project, note, reminder, event, memory, document and conversation will be permanently deleted, and settings reset. Export first if you want a copy.', 'Delete everything', deleteAllData, 'All data deleted.')}>Delete all data</button>
        </div>
      </Section>

      <Section title="About" id="set-about">
        <p className="small muted">J.A.R.V.I.S — a personal work assistant. Your data is private to your account. API keys are never stored in this app; AI runs through claude.ai’s own connection. Passwords and payment details are never saved to memory.</p>
      </Section>
    </div>
  );
}
