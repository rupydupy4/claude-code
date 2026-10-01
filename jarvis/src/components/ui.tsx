import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { dismiss, subscribeToasts, type Toast } from '../services/notify';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="grow">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon = 'sparkles', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="toggle">
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

export function SettingRow({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="row nowrap between" style={{ padding: '10px 0' }}>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{title}</div>
        {help && <div className="small faint">{help}</div>}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const helpId = help || error ? `${id}-help` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, helpId)}
      {error ? (
        <span id={helpId} className="error" role="alert">{error}</span>
      ) : help ? (
        <span id={helpId} className="help">{help}</span>
      ) : null}
    </div>
  );
}

export const DemoBadge = ({ show }: { show?: boolean }) => (show ? <span className="badge demo" title="Example data — remove it from the dashboard or Settings">Example</span> : null);

/** Accessible modal on <dialog>: the browser traps focus, Escape closes, focus returns to the opener. */
export function Modal({ open, title, onClose, children, footer, describedBy }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; describedBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const d = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    if (d && !d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    }
    return () => opener?.focus?.();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------- confirm (window.confirm is unavailable inside claude.ai)

interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
let pushConfirm: ((r: ConfirmRequest) => void) | null = null;

export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushConfirm) return resolve(false);
    pushConfirm({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const bodyId = useId();
  useEffect(() => {
    pushConfirm = setReq;
    return () => {
      pushConfirm = null;
    };
  }, []);
  const finish = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  return (
    <Modal
      open={!!req}
      title={req?.title ?? ''}
      onClose={() => finish(false)}
      describedBy={bodyId}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => finish(false)}>Cancel</button>
          <button type="button" className={`btn ${req?.danger ? 'danger' : 'primary'}`} onClick={() => finish(true)}>{req?.confirmLabel}</button>
        </>
      }
    >
      <div id={bodyId} className="muted">{req?.body}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------- toasts

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);
  const icon = (k: Toast['kind']) => (k === 'error' ? 'warning' : k === 'success' ? 'circle-check' : 'bell');
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={icon(t.kind)} />
          <div className="grow wrap">{t.message}</div>
          {t.action && (
            <button type="button" className="btn sm" onClick={() => { t.action!.run(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button type="button" className="icon-btn sm" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- brand & state ring

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="44 16" transform="rotate(-60 16 16)" />
      <circle cx="16" cy="16" r="3.6" fill="var(--accent)" />
    </svg>
  );
}

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
export const ORB_LABEL: Record<OrbState, string> = { idle: 'Ready', listening: 'Listening', processing: 'Thinking', speaking: 'Speaking', error: 'Something went wrong' };

export function Orb({ state, size = 44 }: { state: OrbState; size?: number }) {
  return (
    <span className="orb" data-state={state} style={{ ['--size' as string]: `${size}px` }} aria-hidden="true">
      <svg viewBox="0 0 44 44">
        <circle className="ring" cx="22" cy="22" r="20" />
        <circle className="arc" cx="22" cy="22" r="20" />
      </svg>
      <span className="core" />
    </span>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
