import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TrackingMode } from '../models/types';
import { INTERESTS, MODES } from '../data/categories';
import { Icon } from '../components/Icon';
import { Logo } from '../components/ui';
import { updatePrefs } from '../services/store';
import { getLocal, setLocal } from '../services/storage';

interface Progress {
  step: number;
  interests: string[];
  modes: TrackingMode[];
  name: string;
}

const KEY = 'onboarding-progress';
const STEPS = 5;

/** Optional five-step setup. Progress survives a page refresh; skipping is always possible. */
export function Onboarding() {
  const navigate = useNavigate();
  const [p, setP] = useState<Progress>(() => getLocal<Progress>(KEY, { step: 0, interests: [], modes: [], name: '' }));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setLocal(KEY, p);
  }, [p]);
  useEffect(() => {
    heading.current?.focus();
  }, [p.step]);

  const go = (step: number) => setP((x) => ({ ...x, step: Math.max(0, Math.min(STEPS - 1, step)) }));
  const finish = (skipped: boolean) => {
    updatePrefs(skipped ? { onboarded: true } : { onboarded: true, interests: p.interests, preferredModes: p.modes, name: p.name.trim().slice(0, 40) });
    setLocal(KEY, null);
    navigate(skipped || !p.interests.length ? '/' : '/library?suggested=1');
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="inner">
        <div className="row between">
          <div className="row"><Logo /><span className="wordmark">BREAKFREE</span></div>
          <button type="button" className="btn ghost sm" onClick={() => finish(true)}>Skip setup</button>
        </div>
        <div className="steps-dots" aria-label={`Step ${p.step + 1} of ${STEPS}`} role="img">
          {Array.from({ length: STEPS }, (_, i) => <i key={i} className={i <= p.step ? 'on' : ''} />)}
        </div>

        {p.step === 0 && (
          <section className="stack" style={{ marginTop: 24 }}>
            <p className="eyebrow">Understand your habits. Change your future.</p>
            <h1 id="ob-title" ref={heading} tabIndex={-1} style={{ fontSize: '2.1rem' }}>Take control of your habits.</h1>
            <p className="muted" style={{ fontSize: 17 }}>Understand your patterns, build better routines, and measure progress on your terms.</p>
            <ul className="stack-sm muted" style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
              <li className="row nowrap"><Icon name="target" />Track several habits, each in the way that suits it.</li>
              <li className="row nowrap"><Icon name="lifebuoy" />Pause and reset when an urge hits.</li>
              <li className="row nowrap"><Icon name="lock" />Everything stays on this device. No account.</li>
            </ul>
            <div className="row" style={{ marginTop: 'auto' }}>
              <button type="button" className="btn primary" onClick={() => go(1)}>Get started</button>
              <button type="button" className="btn ghost" onClick={() => finish(true)}>Skip setup</button>
            </div>
          </section>
        )}

        {p.step === 1 && (
          <section className="stack">
            <h1 id="ob-title" ref={heading} tabIndex={-1}>What would you like to work on?</h1>
            <p className="muted">Pick any that interest you — this only shapes suggestions. You don’t need to share anything sensitive.</p>
            <div className="chips" role="group" aria-label="Interests">
              {INTERESTS.map((i) => (
                <button type="button" key={i.id} className="chip" aria-pressed={p.interests.includes(i.id)} onClick={() => setP((x) => ({ ...x, interests: toggle(x.interests, i.id) }))}>
                  {i.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {p.step === 2 && (
          <section className="stack">
            <h1 id="ob-title" ref={heading} tabIndex={-1}>How do you like to track?</h1>
            <p className="muted">Not every habit has to be quit completely. Choose what appeals — each habit can use its own method, and you can change it any time.</p>
            <div className="stack-sm" role="group" aria-label="Tracking preferences">
              {MODES.map((m) => (
                <button type="button" key={m.id} className="option-card" aria-pressed={p.modes.includes(m.id)} onClick={() => setP((x) => ({ ...x, modes: toggle(x.modes, m.id) }))}>
                  <Icon name={p.modes.includes(m.id) ? 'circle-check' : 'circle'} size={20} />
                  <span><strong>{m.name}</strong><span className="small muted" style={{ display: 'block' }}>{m.description}</span></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {p.step === 3 && (
          <section className="stack">
            <h1 id="ob-title" ref={heading} tabIndex={-1}>Your data stays with you</h1>
            <ul className="stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Data is stored locally in this browser on this device.</li>
              <li>No account is required.</li>
              <li>Habit and journal data are never uploaded to the app developer or anyone else.</li>
              <li>Local browser storage is <strong>not</strong> encrypted. Anyone using this device and browser profile may be able to see it.</li>
              <li>You can export a backup or delete everything at any time in Settings.</li>
            </ul>
            <div className="notice" role="note"><Icon name="info" /><span>Clearing your browser’s site data will erase your records. Export a backup now and then.</span></div>
          </section>
        )}

        {p.step === 4 && (
          <section className="stack">
            <h1 id="ob-title" ref={heading} tabIndex={-1}>You’re all set</h1>
            <label className="field">What should we call you? <span className="help">Optional — used only for the greeting.</span>
              <input type="text" value={p.name} maxLength={40} onChange={(e) => setP((x) => ({ ...x, name: e.target.value }))} />
            </label>
            <div className="card stack-sm">
              <div><span className="faint small">Interests: </span>{p.interests.length ? INTERESTS.filter((i) => p.interests.includes(i.id)).map((i) => i.label).join(', ') : 'None chosen'}</div>
              <div><span className="faint small">Tracking styles: </span>{p.modes.length ? MODES.filter((m) => p.modes.includes(m.id)).map((m) => m.name).join(', ') : 'Decide per habit'}</div>
            </div>
            <p className="muted small">Next, pick a habit from the library — {p.interests.length ? 'we’ll show your chosen categories first.' : 'or create your own.'}</p>
          </section>
        )}

        {p.step > 0 && (
          <div className="row" style={{ marginTop: 'auto', paddingTop: 12 }}>
            <button type="button" className="btn ghost" onClick={() => go(p.step - 1)}><Icon name="chevron-left" size={16} />Back</button>
            <span className="grow" />
            {p.step < STEPS - 1 ? (
              <button type="button" className="btn primary" onClick={() => go(p.step + 1)}>Continue</button>
            ) : (
              <button type="button" className="btn primary" onClick={() => finish(false)}>Open my dashboard</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
