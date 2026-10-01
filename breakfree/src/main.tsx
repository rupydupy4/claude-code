import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { initStore, getLoadStatus } from './services/store';
import { notify } from './services/notify';
import './styles/index.css';

initStore();
const status = getLoadStatus();
if (status.kind === 'corrupt' || status.kind === 'unavailable') notify(status.message, 'error', undefined, 0);
if (status.kind === 'repaired') {
  notify(`${status.dropped} damaged record(s) could not be loaded. A copy of the original data is kept in Settings → Data.`, 'error', undefined, 0);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support (production builds only). Updates wait for the user to reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const offerUpdate = (worker: ServiceWorker) =>
          notify('A new version of BREAKFREE is ready.', 'info', {
            label: 'Reload',
            run: () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
              worker.postMessage('SKIP_WAITING');
            },
          }, 0);
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
          });
        });
      })
      .catch(() => {
        /* offline support unavailable; the app still works online */
      });
  });
}
