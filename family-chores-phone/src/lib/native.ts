import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { getState } from './store';

/**
 * The small native layer for the App Store / Google Play builds (Capacitor). Everything here also
 * works, or quietly does nothing, in an ordinary browser, so the GitHub Pages version is unchanged.
 */

export const isNative = () => Capacitor.isNativePlatform();

/** Screens where Android's back button leaves the app instead of going back. */
const HOME_ROUTES = new Set(['', '/', '/parent', '/child']);
const route = () => window.location.hash.replace(/^#/, '').split('?')[0];

let started = false;

/** Call once when the app starts. */
export function startNative() {
  if (started || !isNative()) return;
  started = true;
  // The splash screen hides as soon as the first screen is drawn.
  requestAnimationFrame(() => { SplashScreen.hide().catch(() => undefined); });
  // Android back button: close an open "are you sure?" step first, then go back, and leave the app from a home screen.
  App.addListener('backButton', () => {
    const cancel = document.querySelector<HTMLButtonElement>('[data-back-cancel]');
    if (cancel) return cancel.click();
    if (HOME_ROUTES.has(route())) App.exitApp().catch(() => undefined);
    else window.history.back();
  }).catch(() => undefined);
}

/** A short tap of feedback on key actions, if the parent has it switched on. */
export function tap() {
  if (!getState().data.prefs.haptics) return;
  if (isNative()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  else if ('vibrate' in navigator) {
    try { navigator.vibrate(12); } catch { /* not supported */ }
  }
}

/**
 * Saves a text file the user can keep. In the app it opens the share sheet (Files, Drive, email…);
 * in a browser it downloads the file. Returns false if the user cancelled the share sheet.
 */
export async function saveTextFile(name: string, text: string): Promise<boolean> {
  if (isNative()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: name, files: [uri] });
      return true;
    } catch {
      return false;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
