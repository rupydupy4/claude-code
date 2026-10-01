import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReminderSettings, ThemePreference } from '../models/types';
import { Icon } from '../components/Icon';
import { confirmAction, Field, PageHeader, Segmented } from '../components/ui';
import { useData } from '../hooks/useApp';
import { deleteAllData, getLoadStatus, replaceAllData, resetPrefs, updatePrefs } from '../services/store';
import { backupFilename, buildBackup, downloadText, MAX_IMPORT_BYTES, parseBackup, readFileText } from '../services/exportImport';
import { clearRecovery, readRecovery } from '../services/storage';
import { notificationSupport, requestNotificationPermission } from '../services/reminders';
import { notify } from '../services/notify';

export default function SettingsPage() {
  const data = useData();
  const { prefs } = data;
  const r = prefs.reminders;
  const setRem = (patch: Partial<ReminderSettings>) => updatePrefs({ reminders: { ...r, ...patch } });
  const [permission, setPermission] = useState(notificationSupport());
  const fileRef = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(readRecovery());
  const status = getLoadStatus();

  const enableNative = async (on: boolean) => {
    if (!on) return setRem({ native: false });
    const p = await requestNotificationPermission();
    setPermission(p);
    if (p === 'granted') {
      setRem({ native: true, enabled: true });
      notify('Device notifications enabled.', 'success');
    } else {
      setRem({ native: false });
      notify(p === 'unsupported' ? 'This browser can’t show notifications. In-app reminders still work while BREAKFREE is open.' : 'Notifications were not allowed. You can change this in your browser or device settings.', 'error');
    }
  };

  const exportJson = () => {
    downloadText(backupFilename(), JSON.stringify(buildBackup(data), null, 2));
    notify('Backup downloaded. Keep it somewhere safe — it contains your private records.', 'success');
  };

  const onImport = async (file: File) => {
    setImportErrors([]);
    if (file.size > MAX_IMPORT_BYTES) return setImportErrors(['The file is larger than 10 MB, which is too big for a BREAKFREE backup.']);
    setBusy(true);
    try {
      const text = await readFileText(file);
      const result = parseBackup(text, file.size);
      if (!result.ok) return setImportErrors(result.errors);
      const c = result.counts;
      const ok = await confirmAction({
        title: 'Replace your data with this backup?',
        body: (
          <>
            The backup{result.exportedAt ? ` from ${new Date(result.exportedAt).toLocaleString()}` : ''} contains {c.habits} habits, {c.events} events, {c.checkIns} check-ins, {c.journal} journal entries, {c.missions} missions, {c.goals} goals and {c.focusSessions} focus sessions.
            <br /><br /><strong>Everything currently in BREAKFREE on this device will be replaced.</strong> Export a backup first if you want to keep it.
          </>
        ),
        confirmLabel: 'Replace my data',
        danger: true,
      });
      if (ok) {
        replaceAllData(result.data);
        notify('Backup restored.', 'success');
      }
    } catch {
      setImportErrors(['The file could not be read.']);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteEverything = async () => {
    const ok = await confirmAction({
      title: 'Delete all BREAKFREE data?',
      body: 'This permanently erases every habit, record, journal entry, mission, goal, session and setting from this browser. It cannot be undone. Consider exporting a backup first.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    deleteAllData();
    setRecovery(null);
    notify('All data deleted from this device.');
  };

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 760 }}>
      <PageHeader title="Settings" subtitle="Preferences are saved on this device." />

      <section className="card stack" aria-labelledby="pref-h">
        <h2 id="pref-h">Profile and appearance</h2>
        <Field label="Name" help="Optional — only used for the greeting.">{(id, d) => <input id={id} type="text" value={prefs.name} maxLength={40} aria-describedby={d} onChange={(e) => updatePrefs({ name: e.target.value })} />}</Field>
        <div className="field"><span>Theme</span><Segmented<ThemePreference> label="Theme" value={prefs.theme} onChange={(theme) => updatePrefs({ theme })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Match device' }]} /></div>
        <div className="field"><span>Motion</span><Segmented label="Motion" value={prefs.reducedMotion} onChange={(reducedMotion) => updatePrefs({ reducedMotion })} options={[{ value: 'system', label: 'Match device' }, { value: 'on', label: 'Reduce motion' }, { value: 'off', label: 'Full motion' }]} /></div>
        <div className="field"><span>Week starts on</span><Segmented label="Week starts on" value={prefs.weekStartsOn} onChange={(weekStartsOn) => updatePrefs({ weekStartsOn })} options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]} /></div>
        <label className="check"><input type="checkbox" checked={prefs.gamification} onChange={(e) => updatePrefs({ gamification: e.target.checked })} /><span>Show XP, levels and achievement pop-ups<span className="small faint" style={{ display: 'block' }}>Turn off for a simpler interface. Achievements are still recorded quietly.</span></span></label>
      </section>

      <section className="card stack" aria-labelledby="rem-h">
        <h2 id="rem-h">Reminders</h2>
        <div className="notice" role="note"><Icon name="info" /><span>Reminders only appear while BREAKFREE is open in a browser tab or installed app that is running. Browsers can’t schedule notifications for when the app is closed without a push server, which BREAKFREE doesn’t use. For alarms that always fire, use your phone’s clock or calendar.</span></div>
        <label className="check"><input type="checkbox" checked={r.enabled} onChange={(e) => setRem({ enabled: e.target.checked })} /><span>Turn on reminders <span className="faint small">(off by default)</span></span></label>
        {r.enabled && (
          <>
            <label className="check">
              <input type="checkbox" checked={r.native && permission === 'granted'} disabled={permission === 'unsupported'} onChange={(e) => enableNative(e.target.checked)} />
              <span>Also show device notifications<span className="small faint" style={{ display: 'block' }}>{permission === 'unsupported' ? 'Not supported in this browser — on iPhone, add BREAKFREE to your Home Screen first.' : permission === 'denied' ? 'Blocked in your browser settings.' : 'Your browser will ask for permission.'} Otherwise reminders appear as banners inside the app.</span></span>
            </label>
            <div className="form-row two">
              <Field label="Quiet hours start">{(id) => <input id={id} type="time" value={r.quietStart} onChange={(e) => setRem({ quietStart: e.target.value })} />}</Field>
              <Field label="Quiet hours end">{(id) => <input id={id} type="time" value={r.quietEnd} onChange={(e) => setRem({ quietEnd: e.target.value })} />}</Field>
            </div>
            {(['reflection', 'focus', 'goals'] as const).map((k) => (
              <div key={k} className="row">
                <label className="check grow"><input type="checkbox" checked={r[k].enabled} onChange={(e) => setRem({ [k]: { ...r[k], enabled: e.target.checked } })} /><span>{{ reflection: 'Daily reflection', focus: 'Focus session', goals: 'Goal check' }[k]}</span></label>
                <input type="time" aria-label={`${k} reminder time`} value={r[k].time} disabled={!r[k].enabled} onChange={(e) => setRem({ [k]: { ...r[k], time: e.target.value } })} style={{ maxWidth: 140 }} />
              </div>
            ))}
            <label className="check"><input type="checkbox" checked={r.missions} onChange={(e) => setRem({ missions: e.target.checked })} /><span>Missions with a preferred time and reminder switched on</span></label>
            <label className="check"><input type="checkbox" checked={r.routines} onChange={(e) => setRem({ routines: e.target.checked })} /><span>Routine start times</span></label>
            <p className="small faint">Habit check-in reminders are set on each habit (Edit settings). Reminders never repeat for the same item on the same day.</p>
          </>
        )}
      </section>

      <section className="card stack" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="small muted">Stored in this browser only. <Link to="/privacy">How BREAKFREE handles privacy</Link>.</p>
        {(status.kind === 'repaired' || status.kind === 'corrupt' || recovery) && recovery && (
          <div className="notice warn" role="alert">
            <Icon name="warning" />
            <div className="stack-sm">
              <span>A copy of data that couldn’t be fully loaded was kept on {new Date(recovery.savedAt).toLocaleString()}. Download it if you want to inspect or recover it.</span>
              <div className="row">
                <button type="button" className="btn sm" onClick={() => downloadText('breakfree-recovery.json', recovery.raw)}>Download recovery copy</button>
                <button type="button" className="btn ghost sm" onClick={() => { clearRecovery(); setRecovery(null); }}>Discard it</button>
              </div>
            </div>
          </div>
        )}
        <div className="row">
          <button type="button" className="btn" onClick={exportJson}><Icon name="download" size={16} />Export backup (JSON)</button>
          <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />{busy ? 'Checking…' : 'Import backup'}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} aria-label="Choose a backup file" />
        </div>
        {importErrors.length > 0 && (
          <div className="notice danger" role="alert">
            <Icon name="warning" />
            <div><strong>That backup wasn’t imported. Your current data is unchanged.</strong><ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{importErrors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul></div>
          </div>
        )}
        <div className="row">
          <button type="button" className="btn" onClick={async () => { if (await confirmAction({ title: 'Reset preferences?', body: 'Theme, reminders and other settings go back to their defaults. Your habits and records are not affected.', confirmLabel: 'Reset preferences' })) { resetPrefs(); notify('Preferences reset.'); } }}>Reset preferences</button>
          <button type="button" className="btn" onClick={() => { updatePrefs({ onboarded: false }); }}>Show welcome screens again</button>
          <button type="button" className="btn danger" onClick={deleteEverything}><Icon name="trash" size={16} />Delete all data</button>
        </div>
      </section>

      <section className="card stack-sm" aria-labelledby="install-h">
        <h2 id="install-h">Install as an app</h2>
        <p className="small muted">BREAKFREE works offline once it has loaded. To add it to your home screen:</p>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li><strong>iPhone / iPad (Safari):</strong> Share → Add to Home Screen.</li>
          <li><strong>Android (Chrome):</strong> menu ⋮ → Install app / Add to Home screen.</li>
          <li><strong>Desktop (Chrome, Edge):</strong> the install icon in the address bar.</li>
        </ul>
      </section>

      <p className="small faint">BREAKFREE · Progress over perfection. This app is a self-tracking tool and doesn’t provide medical or psychological advice.</p>
    </div>
  );
}
