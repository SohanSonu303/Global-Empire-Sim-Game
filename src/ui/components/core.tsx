import { useEffect, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { IconClose } from './Icons';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ---------- Buttons ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'gold' | 'dark' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
};
export function Button({ variant = 'gold', size = 'md', block, className, children, ...rest }: BtnProps) {
  const v = {
    gold: 'bg-gold text-gold-ink border border-gold-edge hover:bg-gold-2 btn-edge',
    dark: 'bg-card-2 text-text border border-line-strong hover:bg-line btn-edge',
    ghost: 'bg-transparent text-muted border border-line hover:text-text',
    danger: 'bg-red-dim text-text border border-red/60 btn-edge',
  }[variant];
  const s = { sm: 'min-h-tap px-3 text-sm', md: 'min-h-tap px-4 text-base', lg: 'min-h-[52px] px-5 text-lg' }[size];
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold select-none transition-colors disabled:opacity-45 disabled:pointer-events-none',
        v, s, block && 'w-full', className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------- Card ----------
export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  // A div with button semantics, so cards can contain their own buttons.
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && e.target === e.currentTarget && onClick() : undefined}
      className={cx('block w-full text-left rounded-card border border-line bg-card shadow-card', onClick && 'cursor-pointer active:bg-card-2', className)}
    >
      {children}
    </div>
  );
}

// ---------- Ribbon header ----------
export function Ribbon({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative flex items-center gap-2 h-10 pl-3 pr-2 rounded-t-card bg-gradient-to-b from-card-2 to-card border-b border-line">
      <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-gold" />
      {icon && <span className="text-gold">{icon}</span>}
      <h2 className="font-bold text-base tracking-wide">{children}</h2>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

// ---------- Progress bar ----------
export function Progress({ value, tone = 'green', className, height = 10 }: { value: number; tone?: 'green' | 'gold' | 'red' | 'amber' | 'blue'; className?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = { green: 'bg-green', gold: 'bg-gold', red: 'bg-red', amber: 'bg-amber', blue: 'bg-blue' }[tone];
  return (
    <div className={cx('w-full rounded-full bg-bg border border-line overflow-hidden', className)} style={{ height }}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------- Stat pill ----------
export function StatPill({ label, value, delta }: { label: string; value: ReactNode; delta?: number | null }) {
  return (
    <div className="flex-1 min-w-0 text-left rounded-lg border border-line bg-surface px-3 py-2">
      <div className="text-xs text-muted truncate">{label}</div>
      <div className="num text-lg font-bold truncate">{value}</div>
      {delta != null && Number.isFinite(delta) && (
        <div className={cx('num text-xs font-semibold', delta >= 0 ? 'text-green' : 'text-red')}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ---------- Chips / tab strip ----------
export function Chips<T extends string>({ items, value, onChange, bleed = true }: { items: { id: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; bleed?: boolean }) {
  return (
    <div className={cx('flex gap-2 overflow-x-auto no-scrollbar py-1', bleed && '-mx-gutter px-gutter')}>
      {items.map((it) => (
        <button
          key={it.id}
          disabled={it.disabled}
          onClick={() => onChange(it.id)}
          className={cx(
            'shrink-0 min-h-[36px] px-3.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40',
            value === it.id ? 'bg-gold text-gold-ink border-gold-edge' : 'bg-card text-muted border-line hover:text-text',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Bottom sheet ----------
export function BottomSheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 anim-fade" onClick={onClose} />
      <div className="relative w-full max-w-[520px] max-h-[88vh] flex flex-col rounded-t-2xl border border-line-strong bg-surface anim-sheet pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" />
        <div className="flex items-center gap-2 px-gutter pt-2 pb-3 border-b border-line">
          <div className="font-bold text-lg flex-1 min-w-0">{title}</div>
          <button aria-label="Close" onClick={onClose} className="size-tap -mr-2 grid place-items-center text-muted hover:text-text">
            <IconClose />
          </button>
        </div>
        <div className="overflow-y-auto px-gutter py-3 flex-1">{children}</div>
        {footer && <div className="px-gutter py-3 border-t border-line">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Stars ----------
export function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex gap-px text-sm leading-none" aria-label={`${value.toFixed(1)} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < Math.round(value) ? 'text-gold' : 'text-line-strong'}>★</span>
      ))}
    </span>
  );
}

// ---------- Section label ----------
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mt-5 mb-2">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted">{children}</h3>
      {right}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'good' | 'bad' | 'warn' | 'neutral' | 'gold'; children: ReactNode }) {
  const t = {
    good: 'bg-green-dim text-green border-green/40',
    bad: 'bg-red-dim text-red border-red/40',
    warn: 'bg-amber/15 text-amber border-amber/40',
    neutral: 'bg-card-2 text-muted border-line',
    gold: 'bg-gold/15 text-gold border-gold/40',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold', t)}>{children}</span>;
}

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('px-gutter pb-6', className)}>{children}</div>;
}
