export type ToastKind = 'info' | 'success' | 'error' | 'achievement';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
  /** Stays until dismissed (errors, updates) and is never pushed out by newer toasts. */
  sticky?: boolean;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let next = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

export function notify(message: string, kind: ToastKind = 'info', action?: Toast['action'], ttl = 3500) {
  const id = next++;
  const others = toasts.filter((t) => !(t.kind === kind && t.message === message));
  // Sticky messages always stay; of the rest, keep only the latest so toasts never bury the page.
  toasts = [...others.filter((t) => t.sticky), ...others.filter((t) => !t.sticky).slice(-1), { id, kind, message, action, sticky: ttl <= 0 }];
  emit();
  if (ttl > 0) setTimeout(() => dismiss(id), ttl);
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(l: Listener) {
  listeners.add(l);
  l(toasts);
  return () => {
    listeners.delete(l);
  };
}
