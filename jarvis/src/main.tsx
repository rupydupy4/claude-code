import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './app/App';
import { initStore } from './data/store';
import { ClaudeDbRepo, IndexedDbRepo, MemoryRepo } from './data/adapters';
import type { Repo } from './data/repo';
import { getDb, getUser, insideClaude } from './platform/claude';
import { initAI } from './ai/assistant';
import { startReminderLoop } from './services/reminders';
import { initSession } from './app/session';
import { notify } from './services/notify';

/**
 * Storage: inside claude.ai each person gets a private record in the artifact's database (keyed by
 * their account id, so data never mixes between people). On the standalone site data lives in this
 * browser's IndexedDB. A memory store is the last resort and says so.
 */
async function openRepo(): Promise<Repo> {
  if (insideClaude()) {
    const [db, user] = await Promise.all([getDb(), getUser()]);
    const id = user ? await user.id().catch(() => null) : null;
    if (db && id) return new ClaudeDbRepo(db, id);
    if (db && !id) notify('Sign in to claude.ai to save your workspace. Changes in this session won’t be kept.', 'info', undefined, 0);
  }
  try {
    return await IndexedDbRepo.open();
  } catch {
    notify('This browser blocked storage (private mode?), so changes won’t be kept after you close JARVIS.', 'error', undefined, 0);
    return new MemoryRepo();
  }
}

async function registerServiceWorker() {
  if (import.meta.env.MODE === 'claude' || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          notify('A new version of JARVIS is ready.', 'info', { label: 'Reload', run: () => { w.postMessage('SKIP_WAITING'); location.reload(); } }, 0);
        }
      });
    });
  } catch {
    /* offline support is optional */
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void (async () => {
  initSession();
  const repo = await openRepo();
  await Promise.all([initStore(repo), initAI()]);
  startReminderLoop();
  void registerServiceWorker();
})();
