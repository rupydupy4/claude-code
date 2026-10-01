import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { dismiss, subscribeToasts, type Toast } from '../services/notify';
import type { DayStatus } from '../utils/habitStats';

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: string }) {
  return (
    <div className="stat">
      <div className="label">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'sparkles', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ProgressBar({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`progress${warn ? ' warn' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = { met: 'Goal met', partial: 'Partly met', notMet: 'Not met', none: 'No entry yet', 'n/a': 'Observing' };
const STATUS_ICON: Record<string, string> = { met: 'circle-check', partial: 'circle-dashed', notMet: 'circle-x', none: 'circle', 'n/a': 'circle' };

export function StatusMark({ status, text }: { status: DayStatus; text?: string }) {
  return (
    <span className={`status ${status === 'n/a' ? 'none' : status}`}>
      <Icon name={STATUS_ICON[status]} size={14} />
      {text ?? STATUS_TEXT[status]}
    </span>
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

/**
 * Accessible modal built on <dialog>: focus is trapped by the browser, Escape closes it,
 * and focus returns to the element that opened it.
 */
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
    // Return focus to whatever opened the dialog once it closes.
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

// ---------------------------------------------------------------- confirm

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
  const icon = (k: Toast['kind']) => (k === 'error' ? 'warning' : k === 'success' ? 'circle-check' : k === 'achievement' ? 'trophy' : 'info');
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={icon(t.kind)} />
          <div className="grow">{t.message}</div>
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

export function Logo({ size = 28 }: { size?: number }) {
  // A path that breaks through a barrier.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M8 9v14" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="4 4" />
      <path d="M12 21c4 0 5-10 12-10" fill="none" stroke="var(--accent-ink)" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M20.5 8.5 24.5 11l-2.6 3.8" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
