import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, buttonClass } from '../components/ui';

/** Last changed: keep in step with PRIVACY.md. */
export const POLICY_DATE = '9 November 2026';

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  return (
    <main className="auth-safe mx-auto w-full max-w-2xl px-4">
      <button type="button" onClick={back} className={buttonClass('ghost', 'sm') + ' -ml-3'}><ArrowLeft size={16} aria-hidden="true" />Back</button>
      <Card className="mt-3 p-5 sm:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-ink-3">Last updated {POLICY_DATE}</p>
        <div className="mt-6 space-y-5 leading-relaxed text-ink-2 [&_h2]:mb-1 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
      </Card>
      <p className="mt-6 flex justify-center gap-2 text-sm text-ink-3">
        <Link to="/privacy" className="inline-flex min-h-11 items-center px-2 font-medium hover:text-ink">Privacy</Link>
        <span aria-hidden="true" className="self-center">·</span>
        <Link to="/terms" className="inline-flex min-h-11 items-center px-2 font-medium hover:text-ink">Terms</Link>
      </p>
    </main>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <section>
        <h2>The short version</h2>
        <p>Family Chores collects no data. There are no accounts, no servers, no analytics, no adverts and no tracking. Everything you put in the app stays on this device.</p>
      </section>
      <section>
        <h2>What the app stores, and where</h2>
        <ul>
          <li>Your household name, first names, chores, rewards, points and settings are saved in the app’s own storage on this device.</li>
          <li>Photos a child adds as proof are resized and saved in the app’s own storage on this device.</li>
          <li>The parent PIN is never stored as typed: only a salted, one-way fingerprint (hash) of it is kept.</li>
        </ul>
        <p className="mt-2">None of this is sent to us or to anyone else. We (the developer) can’t see it. If you use your phone’s own system backup (for example iCloud Backup on an iPhone), the app’s storage may be included in it, as it is for other apps; that backup belongs to you and we have no access to it.</p>
      </section>
      <section>
        <h2>Camera and photos</h2>
        <p>The app asks to use the camera or photo library only when a child chooses to add a photo to a chore. The photo is kept on this device and is never uploaded.</p>
      </section>
      <section>
        <h2>Backups you make</h2>
        <p>A parent can save a backup file (in Settings). It contains the household’s data and photos. It is only created when you ask, and you choose where it goes (for example your Files app, cloud drive or email). Treat it like any private family document.</p>
      </section>
      <section>
        <h2>Children</h2>
        <p>The app is designed for families and is set up and controlled by a parent. It collects no personal information from children, has no chat or sharing with other people, no adverts and no in-app purchases.</p>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <p>A parent can delete everything at any time in Settings → Delete all data. Uninstalling the app also removes it. Because we hold no copy, we can’t restore data after it is deleted, unless you saved a backup.</p>
      </section>
      <section>
        <h2>Changes and contact</h2>
        <p>If this policy changes, the new version will be shown here with a new date. Questions: open an issue at <a className="font-medium text-accent underline" href="https://github.com/rupydupy4/claude-code/issues" target="_blank" rel="noopener noreferrer">github.com/rupydupy4/claude-code</a>.</p>
      </section>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of use">
      <section>
        <h2>Using the app</h2>
        <p>Family Chores is a free tool to help families organise chores and keep a record of rewards. You may use it for your own household.</p>
      </section>
      <section>
        <h2>Rewards are records only</h2>
        <p>Money and screen-time rewards are notes kept in the app. The app doesn’t move money, make payments or control screen time. “Mark as paid out” simply records that a parent has handed a reward over.</p>
      </section>
      <section>
        <h2>The parent PIN</h2>
        <p>The PIN keeps the parent area away from children on a shared device. It is a household lock, not strong security, so don’t use the app for anything that needs real protection.</p>
      </section>
      <section>
        <h2>Your data is your responsibility</h2>
        <p>Your data lives only on your device. If the device is lost or reset, or the app is removed, the data is gone unless you saved a backup. Please make backups from Settings now and then.</p>
      </section>
      <section>
        <h2>No warranty</h2>
        <p>The app is provided “as is”, without warranty of any kind. To the extent the law allows, the developer isn’t liable for any loss arising from its use. Nothing here affects your statutory rights.</p>
      </section>
      <section>
        <h2>Privacy</h2>
        <p>See the <Link className="font-medium text-accent underline" to="/privacy">privacy policy</Link>: no data is collected and everything stays on your device.</p>
      </section>
    </LegalPage>
  );
}
