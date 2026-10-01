import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';

export default function PrivacyPage() {
  return (
    <div className="stack" style={{ maxWidth: 760, gap: 16 }}>
      <PageHeader eyebrow="Privacy" title="Your data stays on your device" subtitle="BREAKFREE is local-first. Here is exactly what that means — including the limits." />
      <section className="card stack-sm">
        <h2><Icon name="shield-check" /> What BREAKFREE does</h2>
        <ul className="stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Everything you enter — habits, check-ins, triggers, journal entries, goals, missions and sessions — is saved in this browser’s local storage on this device.</li>
          <li>No account. No sign-in. No server receives your records.</li>
          <li>No analytics, advertising or tracking scripts. The app makes no network requests with your data.</li>
          <li>The offline cache (service worker) stores only the app’s own files, never your records.</li>
          <li>You can export a full backup and delete everything at any time from <Link to="/settings">Settings</Link>.</li>
        </ul>
      </section>
      <section className="card stack-sm">
        <h2><Icon name="warning" /> Limitations to know about</h2>
        <ul className="stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
          <li><strong>Not encrypted.</strong> Browser local storage is not encrypted by BREAKFREE. Anyone who can use this device and browser profile, or has access to its files, may be able to read it.</li>
          <li><strong>Per device and browser.</strong> Data doesn’t sync. A different browser, device or private window starts empty. Use export/import to move it.</li>
          <li><strong>Clearing site data erases it.</strong> Clearing browsing data for this site, or some “storage cleanup” tools, will delete your records. Export a backup regularly.</li>
          <li><strong>Backups are plain files.</strong> An exported JSON backup contains your private records in readable form. Store it somewhere safe.</li>
          <li><strong>Reminders</strong> only run while the app is open; BREAKFREE uses no push service.</li>
          <li><strong>Website blocking</strong> isn’t possible from a web app. BREAKFREE never reads your browsing history or other tabs.</li>
        </ul>
      </section>
      <section className="card stack-sm">
        <h2><Icon name="heart" /> About support</h2>
        <p className="small">BREAKFREE is a self-tracking tool, not a medical service, and it doesn’t diagnose anything. If a habit involves substances, gambling or significant distress, a doctor, pharmacist or local support service can help — and for some substances, stopping suddenly needs medical guidance. If you are in immediate danger, contact your local emergency number.</p>
      </section>
    </div>
  );
}
