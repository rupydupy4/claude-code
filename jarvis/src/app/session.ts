import { useSyncExternalStore } from 'react';
import type { OrbState } from '../components/ui';
import { getVoice, VOICE_ERROR_COPY, type VoiceErrorCode } from '../voice/VoiceService';
import { insideClaude } from '../platform/claude';
import { notify } from '../services/notify';

/**
 * App-wide assistant state: the ring indicator in the navigation, the live transcript, and a
 * prompt queued from anywhere (dashboard ask bar, voice button) for the Assistant screen to send.
 */
export interface Session {
  orb: OrbState;
  transcript: string;
  listening: boolean;
  speaking: boolean;
  busy: boolean;
  voiceError: string;
  pending: { text: string; voice: boolean; research?: boolean; documentId?: string } | null;
}

let s: Session = { orb: 'idle', transcript: '', listening: false, speaking: false, busy: false, voiceError: '', pending: null };
const listeners = new Set<() => void>();
let errorTimer: ReturnType<typeof setTimeout> | undefined;

function derive(next: Session): Session {
  const orb: OrbState = next.listening ? 'listening' : next.busy ? 'processing' : next.speaking ? 'speaking' : next.voiceError ? 'error' : 'idle';
  return { ...next, orb };
}
function set(patch: Partial<Session>) {
  s = derive({ ...s, ...patch });
  listeners.forEach((l) => l());
}
export const getSession = () => s;
export function useSession(): Session {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => s, () => s);
}

export const voice = () => getVoice(insideClaude());

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  voice().onSpeakingChange((speaking) => set({ speaking }));
}

export function setBusy(busy: boolean) {
  set({ busy });
}

export function showVoiceError(message: string) {
  set({ voiceError: message });
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => set({ voiceError: '' }), 6000);
}

export function queuePrompt(p: NonNullable<Session['pending']>) {
  set({ pending: p });
}
export function takePending() {
  const p = s.pending;
  if (p) set({ pending: null });
  return p;
}

/**
 * Starts listening (must be called from a click so the browser allows the microphone).
 * `onText` receives the final transcript. Returns false when voice input isn't possible here.
 */
export function startListening(onText: (text: string) => void): boolean {
  wire();
  const v = voice();
  if (!v.sttSupported) {
    showVoiceError(v.sttUnavailableReason ?? VOICE_ERROR_COPY.unsupported);
    notify(v.sttUnavailableReason ?? VOICE_ERROR_COPY.unsupported, 'info', undefined, 8000);
    return false;
  }
  set({ transcript: '', voiceError: '' });
  v.startListening({
    onStart: () => set({ listening: true }),
    onInterim: (t) => set({ transcript: t }),
    onFinal: (t) => {
      set({ transcript: '' });
      onText(t);
    },
    onError: (code: VoiceErrorCode, msg) => {
      showVoiceError(msg);
      if (code !== 'no-speech') notify(msg, 'error', undefined, 8000);
    },
    onEnd: () => set({ listening: false }),
  });
  set({ listening: true });
  return true;
}

export function stopListening() {
  voice().stopListening();
}
export function cancelListening() {
  voice().cancelListening();
  set({ listening: false, transcript: '' });
}
export function stopSpeaking() {
  voice().cancelSpeaking();
}
export function initSession() {
  wire();
}
