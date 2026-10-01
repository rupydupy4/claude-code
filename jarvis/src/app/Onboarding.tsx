import { useState, type FormEvent } from 'react';
import { updateSettings, useStore } from '../data/store';
import { loadDemoData } from '../data/demo';
import { requestNotificationPermission } from '../services/reminders';
import { Field, Logo, Toggle } from '../components/ui';
import { Icon } from '../components/Icon';
import { voice } from './session';

const WORK_TYPES = ['Software development', 'Design', 'Marketing', 'Management', 'Sales', 'Consulting', 'Writing', 'Research', 'Student', 'Other'];

export function Onboarding() {
  const settings = useStore((s) => s.settings);
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState(settings.userName);
  const [address, setAddress] = useState(settings.address || '');
  const [assistantName, setAssistantName] = useState(settings.assistantName || 'JARVIS');
  const [workType, setWorkType] = useState(settings.workType);
  const [voiceOn, setVoiceOn] = useState(settings.voice.enabled);
  const [notifyOn, setNotifyOn] = useState(false);
  const [demo, setDemo] = useState(true);
  const [notifyNote, setNotifyNote] = useState('');
  const steps = 4;

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    setStep((s) => Math.min(steps - 1, s + 1));
  };

  const toggleNotify = async (on: boolean) => {
    setNotifyOn(on);
    setNotifyNote('');
    if (!on) return;
    const p = await requestNotificationPermission();
    if (p === 'granted') setNotifyNote('Notifications are allowed.');
    else if (p === 'unsupported') setNotifyNote('This browser can’t show system notifications here, so reminders appear as banners inside JARVIS while it is open.');
    else setNotifyNote('Permission wasn’t granted, so reminders appear as banners inside JARVIS while it is open. You can change this in your browser settings.');
  };

  const finish = async () => {
    await updateSettings({
      userName: userName.trim().slice(0, 60),
      address: (address.trim() || userName.trim()).slice(0, 40),
      assistantName: assistantName.trim().slice(0, 24) || 'JARVIS',
      workType,
      voice: { ...settings.voice, enabled: voiceOn },
      notifications: { ...settings.notifications, enabled: notifyOn },
      onboarded: true,
    });
    if (demo && !settings.demoLoaded) await loadDemoData();
  };

  return (
    <main className="onboarding" aria-labelledby="ob-title">
      <div className="inner">
        <div className="row nowrap">
          <Logo size={34} />
          <span className="wordmark">J.A.R.V.I.S</span>
        </div>
        <div className="steps" aria-hidden="true">{Array.from({ length: steps }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <p className="label">Step {step + 1} of {steps}</p>

        {step === 0 && (
          <form className="stack" onSubmit={next}>
            <h1 id="ob-title">Your personal work assistant</h1>
            <p className="muted">Tasks, projects, notes, reminders, documents and your calendar in one place, run by an assistant you can talk to. A few questions first.</p>
            <Field label="What should I call you?" help="Your name, or a form of address such as “Sir”.">
              {(id, d) => <input id={id} type="text" value={address} autoFocus maxLength={40} aria-describedby={d} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Sir, or Alex" />}
            </Field>
            <Field label="Your name" help="Optional. Used when a form of address isn’t right.">
              {(id, d) => <input id={id} type="text" value={userName} maxLength={60} aria-describedby={d} onChange={(e) => setUserName(e.target.value)} />}
            </Field>
            <button type="submit" className="btn primary block">Continue</button>
          </form>
        )}

        {step === 1 && (
          <form className="stack" onSubmit={next}>
            <h1 id="ob-title">About the assistant</h1>
            <Field label="Assistant name" help="It answers to this name, e.g. “JARVIS, plan my day”.">
              {(id, d) => <input id={id} type="text" value={assistantName} maxLength={24} aria-describedby={d} onChange={(e) => setAssistantName(e.target.value)} />}
            </Field>
            <Field label="What kind of work do you do?">
              {(id) => (
                <select id={id} value={workType} onChange={(e) => setWorkType(e.target.value)}>
                  <option value="">Prefer not to say</option>
                  {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
                </select>
              )}
            </Field>
            <div className="row nowrap">
              <button type="button" className="btn ghost" onClick={() => setStep(0)}>Back</button>
              <button type="submit" className="btn primary grow">Continue</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="stack" onSubmit={next}>
            <h1 id="ob-title">Voice and notifications</h1>
            <div className="panel stack-sm">
              <div className="row nowrap between">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>Voice</div>
                  <div className="small faint">
                    Speak commands and hear replies.
                    {!voice().sttSupported && ` ${voice().sttUnavailableReason ?? ''}`}
                  </div>
                </div>
                <Toggle checked={voiceOn} onChange={setVoiceOn} label="Enable voice" />
              </div>
              <hr className="divider" />
              <div className="row nowrap between">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>Notifications</div>
                  <div className="small faint">Reminders and deadline alerts while JARVIS is open.</div>
                </div>
                <Toggle checked={notifyOn} onChange={(v) => void toggleNotify(v)} label="Enable notifications" />
              </div>
              {notifyNote && <p className="small muted" role="status">{notifyNote}</p>}
            </div>
            <div className="row nowrap">
              <button type="button" className="btn ghost" onClick={() => setStep(1)}>Back</button>
              <button type="submit" className="btn primary grow">Continue</button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="stack">
            <h1 id="ob-title">How would you like to start?</h1>
            <div className="stack-sm" role="radiogroup" aria-label="Starting data">
              <label className="panel check">
                <input type="radio" name="start" checked={demo} onChange={() => setDemo(true)} />
                <span><strong>With example data</strong><br /><span className="small muted">Two sample projects with tasks, events and notes, marked “Example”. Remove them in one step whenever you like.</span></span>
              </label>
              <label className="panel check">
                <input type="radio" name="start" checked={!demo} onChange={() => setDemo(false)} />
                <span><strong>Empty</strong><br /><span className="small muted">Start with a clean workspace.</span></span>
              </label>
            </div>
            <div className="notice"><Icon name="lock" /><div className="small">Your workspace is private to you. Nothing is shared, and you can export or delete everything from Settings.</div></div>
            <div className="row nowrap">
              <button type="button" className="btn ghost" onClick={() => setStep(2)}>Back</button>
              <button type="button" className="btn primary grow" onClick={() => void finish()}>Start</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
