/** 通用 UI 原子组件（无业务逻辑） */
import { useEffect, type ReactNode } from 'react';

export function Button({
  children,
  variant,
  size,
  ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'danger' | 'success';
  size?: 'sm';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ['btn', variant, size].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'blue' | 'green' | 'red' | 'amber' }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress">
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; name: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.name}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="btn sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title = '暂无数据', hint, action }: { title?: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">📭</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
      {hint && <div className="muted mt8">{hint}</div>}
      {action && <div className="mt12">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <Card>
      <div className="stat-label">{label}</div>
      <div className="stat-num" style={{ color: tone }}>
        {value}
      </div>
    </Card>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function confirmDialog(message: string): boolean {
  return window.confirm(message);
}
