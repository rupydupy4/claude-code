/**
 * Voice abstraction. The default implementation uses the browser's Web Speech API; a cloud
 * provider can implement the same interface later without UI changes.
 */
export type VoiceErrorCode = 'not-allowed' | 'no-speech' | 'audio-capture' | 'network' | 'unsupported' | 'blocked-here' | 'other';

export interface ListenHandlers {
  onStart?: () => void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (code: VoiceErrorCode, message: string) => void;
  onEnd?: () => void;
}

export interface SpeakOptions {
  rate?: number;
  voiceURI?: string;
}

export interface VoiceService {
  readonly sttSupported: boolean;
  readonly ttsSupported: boolean;
  /** Why speech input is unavailable, if it is. */
  readonly sttUnavailableReason?: string;
  startListening(h: ListenHandlers): void;
  /** Stop and deliver what was heard. */
  stopListening(): void;
  /** Stop and discard. */
  cancelListening(): void;
  speechToText(): Promise<string>;
  textToSpeech(text: string, opts?: SpeakOptions): Promise<void>;
  /** Queue a fragment for speaking (used while an answer streams). */
  enqueueSpeech(text: string, opts?: SpeakOptions): void;
  cancelSpeaking(): void;
  readonly speaking: boolean;
  onSpeakingChange(cb: (speaking: boolean) => void): () => void;
  voices(): SpeechSynthesisVoice[];
}

export const VOICE_ERROR_COPY: Record<VoiceErrorCode, string> = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.',
  'no-speech': 'I didn’t hear anything. Tap the microphone and try again.',
  'audio-capture': 'No microphone was found. Check that one is connected and not in use by another app.',
  network: 'Speech recognition needs an internet connection in this browser.',
  unsupported: 'This browser doesn’t support voice input. Try Chrome, Edge or Safari, or use your keyboard’s dictation key.',
  'blocked-here': 'Voice input isn’t allowed inside claude.ai pages. Tap the message box and use your keyboard’s microphone key to dictate instead. Spoken replies still work.',
  other: 'Voice input stopped unexpectedly. Try again.',
};

/**
 * Default voice: a British English male voice, chosen from the voices this device has installed
 * (browsers can't download voices or clone a particular person's voice). Ordered by quality.
 */
const BRITISH_MALE = ['Arthur', 'Daniel', 'Oliver', 'Google UK English Male', 'Microsoft Ryan', 'Microsoft George', 'Microsoft Thomas', 'Microsoft Alfie', 'Malcolm', 'Fergus'];
const FEMALE_HINT = /\b(female|kate|serena|stephanie|martha|hazel|susan|libby|sonia|maisie|bella|abbi|hollie|olivia|fiona|moira|karen|samantha)\b/i;

export function pickBritishMale<T extends { name: string; lang: string; voiceURI: string }>(voices: T[]): T | undefined {
  const gb = voices.filter((v) => /^en[-_]GB/i.test(v.lang));
  for (const n of BRITISH_MALE) {
    // Prefer enhanced/premium editions of a named voice when installed.
    const named = gb.filter((v) => v.name.toLowerCase().startsWith(n.toLowerCase()) || v.name.toLowerCase().includes(n.toLowerCase()));
    if (named.length) return named.find((v) => /premium|enhanced|neural|online/i.test(v.name)) ?? named[0];
  }
  return gb.find((v) => /\bmale\b/i.test(v.name)) ?? gb.find((v) => !FEMALE_HINT.test(v.name));
}

/** Removes Markdown and symbols that sound wrong when read aloud. */
export function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*_#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Feeds a growing answer into speech: each call passes the whole text so far and only
 * complete sentences beyond what was already spoken are queued. `finish` speaks the rest.
 */
export class SpeechStreamer {
  private spoken = 0;
  constructor(private voice: VoiceService, private opts: SpeakOptions = {}) {}
  update(fullText: string) {
    const pending = fullText.slice(this.spoken);
    const m = /^([\s\S]*[.!?:;](?:["”')\]]?))(\s+|\n)/.exec(pending);
    if (!m) return;
    const chunk = m[1];
    this.spoken += chunk.length;
    const say = toSpeakable(chunk);
    if (say) this.voice.enqueueSpeech(say, this.opts);
  }
  finish(fullText: string) {
    const rest = toSpeakable(fullText.slice(this.spoken));
    this.spoken = fullText.length;
    if (rest) this.voice.enqueueSpeech(rest, this.opts);
  }
}

type SR = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
};

export class WebSpeechVoice implements VoiceService {
  readonly sttSupported: boolean;
  readonly ttsSupported: boolean;
  readonly sttUnavailableReason?: string;
  private rec: SR | null = null;
  private finalText = '';
  private interim = '';
  private discard = false;
  private speakingListeners = new Set<(s: boolean) => void>();
  private queue = 0;
  private _speaking = false;

  constructor(opts: { blockedHere?: boolean } = {}) {
    const g = globalThis as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR; speechSynthesis?: SpeechSynthesis };
    const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
    this.sttSupported = !!Ctor && !opts.blockedHere;
    this.sttUnavailableReason = opts.blockedHere ? VOICE_ERROR_COPY['blocked-here'] : !Ctor ? VOICE_ERROR_COPY.unsupported : undefined;
    this.ttsSupported = !!g.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined';
    this.Ctor = Ctor ?? null;
  }
  private Ctor: (new () => SR) | null;

  get speaking() {
    return this._speaking;
  }
  private setSpeaking(v: boolean) {
    if (v === this._speaking) return;
    this._speaking = v;
    this.speakingListeners.forEach((l) => l(v));
  }
  onSpeakingChange(cb: (s: boolean) => void) {
    this.speakingListeners.add(cb);
    return () => this.speakingListeners.delete(cb);
  }

  startListening(h: ListenHandlers) {
    if (!this.sttSupported || !this.Ctor) {
      h.onError?.(this.sttUnavailableReason === VOICE_ERROR_COPY['blocked-here'] ? 'blocked-here' : 'unsupported', this.sttUnavailableReason ?? VOICE_ERROR_COPY.unsupported);
      h.onEnd?.();
      return;
    }
    this.cancelSpeaking(); // talking over the assistant interrupts it
    this.cancelListening();
    this.finalText = '';
    this.interim = '';
    this.discard = false;
    const rec = new this.Ctor();
    rec.lang = navigator.language || 'en-GB';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => h.onStart?.();
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      this.interim = interim;
      h.onInterim?.((this.finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      const code: VoiceErrorCode = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'not-allowed' : e.error === 'no-speech' ? 'no-speech' : e.error === 'audio-capture' ? 'audio-capture' : e.error === 'network' ? 'network' : 'other';
      this.discard = true;
      h.onError?.(code, VOICE_ERROR_COPY[code]);
    };
    rec.onend = () => {
      this.rec = null;
      const text = (this.finalText || this.interim).trim();
      if (!this.discard && text) h.onFinal?.(text);
      else if (!this.discard && !text) h.onError?.('no-speech', VOICE_ERROR_COPY['no-speech']);
      h.onEnd?.();
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.rec = null;
      h.onError?.('other', VOICE_ERROR_COPY.other);
      h.onEnd?.();
    }
  }

  stopListening() {
    this.rec?.stop();
  }

  cancelListening() {
    if (!this.rec) return;
    this.discard = true;
    this.rec.abort();
  }

  speechToText(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.startListening({ onFinal: resolve, onError: (_c, m) => reject(new Error(m)) });
    });
  }

  voices() {
    return this.ttsSupported ? speechSynthesis.getVoices() : [];
  }

  private utter(text: string, opts: SpeakOptions) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.min(2, Math.max(0.5, opts.rate ?? 1));
    const all = this.voices();
    const v = (opts.voiceURI ? all.find((x) => x.voiceURI === opts.voiceURI) : undefined) ?? pickBritishMale(all);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = 'en-GB';
    return u;
  }

  enqueueSpeech(text: string, opts: SpeakOptions = {}) {
    if (!this.ttsSupported || !text.trim()) return;
    const u = this.utter(text, opts);
    this.queue++;
    this.setSpeaking(true);
    const done = () => {
      this.queue = Math.max(0, this.queue - 1);
      if (this.queue === 0) this.setSpeaking(false);
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }

  textToSpeech(text: string, opts: SpeakOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ttsSupported) return resolve();
      this.cancelSpeaking();
      const unsub = this.onSpeakingChange((s) => { if (!s) { unsub(); resolve(); } });
      this.enqueueSpeech(toSpeakable(text), opts);
      if (!this.speaking) { unsub(); resolve(); }
    });
  }

  cancelSpeaking() {
    if (!this.ttsSupported) return;
    this.queue = 0;
    speechSynthesis.cancel();
    this.setSpeaking(false);
  }
}

let instance: VoiceService | null = null;
export function getVoice(blockedHere = false): VoiceService {
  instance ??= new WebSpeechVoice({ blockedHere });
  return instance;
}
/** Tests can inject a fake. */
export function setVoice(v: VoiceService | null) {
  instance = v;
}
