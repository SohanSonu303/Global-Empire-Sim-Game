import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SPEED_MS } from '../../worker/protocol';
import type { Speed } from '../../worker/protocol';
import { fmtMoney, fmtPct } from '../../engine/news';
import type { Explanation } from '../../engine/types';
import { netWorthExplain } from '../../engine/progress';
import { xpForLevel } from '../../engine/data';
import { useAttention } from '../advice';
import { useGame, type Tab } from '../../store/game';
import { BottomSheet, cx } from './core';
import {
  IconBriefcase, IconCalendar, IconCash, IconChart, IconDots, IconGlobe, IconHome, IconInfo, IconPause, IconPlay,
} from './Icons';

/** A number the player can tap to see how it was computed. */
export function Num({ children, explain, className }: { children: ReactNode; explain: Explanation | (() => Explanation); className?: string }) {
  const show = useGame((s) => s.showExplain);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        show(typeof explain === 'function' ? explain() : explain);
      }}
      className={cx('num underline decoration-dotted decoration-dim underline-offset-4 hover:decoration-gold', className)}
    >
      {children}
    </button>
  );
}

export function ExplainSheet() {
  const e = useGame((s) => s.explain);
  const close = useGame((s) => s.showExplain);
  if (!e) return null;
  const fmt = (v: number, f?: string) => (f === 'pct' ? fmtPct(v, 2) : f === 'num' ? Math.round(v).toLocaleString() : fmtMoney(v));
  return (
    <BottomSheet open onClose={() => close(null)} title={<span className="flex items-center gap-2"><IconInfo className="text-gold" /> {e.title}</span>}>
      <div className="divide-y divide-line">
        {e.lines.map((l, i) => (
          <div key={i} className={cx('flex items-baseline gap-3 py-2.5', l.op === '=' && 'font-bold')}>
            <span className="w-4 text-center text-gold font-bold">{l.op === 'x' ? '×' : l.op === '=' ? '=' : l.op}</span>
            <span className="flex-1 text-sm text-muted">{l.label}</span>
            <span className={cx('num text-base', l.op === '=' ? 'text-text' : '', l.value < 0 && 'text-red')}>{fmt(l.value, l.fmt)}</span>
          </div>
        ))}
      </div>
      {e.note && <p className="mt-3 text-sm text-muted leading-relaxed">{e.note}</p>}
    </BottomSheet>
  );
}

export function TopBar() {
  const world = useGame((s) => s.world)!;
  const p = world.player;
  const need = xpForLevel(p.level);
  const year = Math.floor(world.day / 360) + 1;
  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 px-3 h-12">
        <div className="relative flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-lg bg-card border border-line" title={`${Math.round(p.xp)} / ${need} XP`}>
          <svg width="22" height="25" viewBox="0 0 22 25" aria-hidden className="shrink-0 -my-1">
            <path d="M11 1 L20.5 4.5 V12 C20.5 18 16 22 11 24 C6 22 1.5 18 1.5 12 V4.5 Z" fill="#e3b04b" stroke="#9c7320" strokeWidth="1.2" />
            <path d="M11 3.4 L18.3 6 V12 C18.3 16.6 15 19.7 11 21.4 C7 19.7 3.7 16.6 3.7 12 V6 Z" fill="#f0c565" />
            <path d="M11 6.5 l1.7 3.6 3.9 .5 -2.9 2.7 .8 3.9 -3.5 -1.9 -3.5 1.9 .8 -3.9 -2.9 -2.7 3.9 -.5 Z" fill="#241803" />
          </svg>
          <span className="text-sm font-bold whitespace-nowrap">Lv {p.level}</span>
          {world.play.streak.count > 0 && (
            <span className="absolute -top-1.5 -right-2 flex items-center h-4 px-1 rounded-full bg-[#3a1d0b] border border-[#e08a3c] text-[10px] font-black leading-none" title={`${world.play.streak.count} day streak (best ${world.play.streak.best})`}>
              🔥{world.play.streak.count}
            </span>
          )}
          <span className="absolute left-1 right-1 -bottom-px h-0.5 rounded bg-line overflow-hidden">
            <span className="block h-full bg-gold" style={{ width: `${Math.min(100, (p.xp / need) * 100)}%` }} />
          </span>
        </div>
        <Num explain={() => netWorthExplain(useGame.getState().world!)} className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-card border border-line no-underline min-w-0">
          <IconCash size={18} className="text-green shrink-0" />
          <span className="text-sm font-bold truncate">{fmtMoney(p.cash)}</span>
        </Num>
        <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-card border border-line" title={`Year ${year}`}>
          <IconCalendar size={16} className="text-muted" />
          <span className="num text-sm font-bold whitespace-nowrap">Day {world.day}</span>
        </div>
        <button
          aria-label="How to play"
          onClick={() => useGame.getState().push({ screen: 'guide' })}
          className="ml-auto grid place-items-center size-9 rounded-full bg-card border border-line text-gold font-black hover:border-gold-edge"
        >
          ?
        </button>
      </div>
    </header>
  );
}

/** Time controls, docked above the tab bar. */
export function TimeBar() {
  const world = useGame((s) => s.world)!;
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const last = useRef<Exclude<Speed, 0>>(1);
  if (speed !== 0) last.current = speed;
  const running = speed !== 0;
  const year = Math.floor(world.day / 360) + 1;
  return (
    <div className="z-30 border-t border-line bg-surface/95 backdrop-blur px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          aria-label={running ? 'Pause' : 'Play'}
          onClick={() => setSpeed(running ? 0 : last.current)}
          className={cx(
            'relative grid place-items-center size-11 shrink-0 rounded-full border transition-transform active:scale-90',
            running ? 'bg-card-2 border-line-strong text-text' : 'bg-gold border-gold-edge text-gold-ink btn-edge',
          )}
        >
          {!running && <span className="absolute inset-0 rounded-full anim-ping-soft" aria-hidden />}
          <span key={running ? 'run' : 'stop'} className="anim-pop grid place-items-center">
            {running ? <IconPause size={20} /> : <IconPlay size={20} />}
          </span>
        </button>
        <div className="flex p-0.5 rounded-lg bg-card border border-line" role="group" aria-label="Game speed">
          {([1, 2, 5] as const).map((s) => (
            <button
              key={s}
              aria-pressed={speed === s}
              aria-label={`${s}x speed`}
              onClick={() => setSpeed(s)}
              className={cx(
                'h-9 min-w-11 px-2 rounded-md text-xs font-bold transition-[background-color,color,transform] active:scale-90',
                speed === s ? 'bg-gold text-gold-ink' : 'text-muted hover:text-text',
              )}
            >
              {s}x
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-0 pl-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className={cx('font-bold', running ? 'text-text' : 'text-gold')}>{running ? 'Running' : 'Paused'}</span>
            <span className="num text-dim truncate">Year {year}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-line overflow-hidden">
            {running ? (
              <span key={`${world.day}-${speed}`} className="block h-full bg-gold anim-day" style={{ animationDuration: `${SPEED_MS[speed]}ms` }} />
            ) : (
              <span className="block h-full w-full bg-line-strong" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <IconHome /> },
  { id: 'business', label: 'Business', icon: <IconBriefcase /> },
  { id: 'markets', label: 'Markets', icon: <IconChart /> },
  { id: 'world', label: 'World', icon: <IconGlobe /> },
  { id: 'more', label: 'More', icon: <IconDots /> },
];

export function TabBar() {
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const pendingEvents = useGame((s) => s.world?.pending.length ?? 0);
  const attention = useAttention();
  const flagged = Object.values(attention).some((v) => v === 'urgent' || v === 'warn');
  return (
    <nav className="sticky bottom-0 z-30 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx('relative flex flex-col items-center justify-center gap-0.5 h-14 text-xs font-semibold', tab === t.id ? 'text-gold' : 'text-muted')}
          >
            {tab === t.id && <span className="absolute top-0 inset-x-3 h-0.5 rounded-b bg-gold" />}
            {t.icon}
            {t.label}
            {t.id === 'home' && pendingEvents > 0 && <span className="absolute top-2 right-[30%] size-2 rounded-full bg-red" />}
            {t.id === 'business' && flagged && <span className="absolute top-2 right-[30%] size-2 rounded-full bg-amber" />}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function Toast() {
  const toast = useGame((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast || !toast.text) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible || !toast.text) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-16 z-[80] w-[min(92vw,460px)] anim-fade" role="status">
      <div className={cx('rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg', toast.ok ? 'bg-card-2 border-line-strong' : 'bg-red-dim border-red/60')}>
        {toast.text}
      </div>
    </div>
  );
}

/** Minimal SVG line chart (no deps) for price/history series. */
export function LineChart({ data, height = 140, tone = 'auto', area = true }: { data: number[]; height?: number; tone?: 'auto' | 'gold' | 'blue'; area?: boolean }) {
  if (data.length < 2) return <div style={{ height }} className="grid place-items-center text-sm text-dim">Not enough history yet</div>;
  const w = 320;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const up = data[data.length - 1] >= data[0];
  const color = tone === 'gold' ? 'var(--color-gold)' : tone === 'blue' ? 'var(--color-blue)' : up ? 'var(--color-green)' : 'var(--color-red)';
  const id = `g${Math.round(Math.random() * 1e9)}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full block" style={{ height }} role="img" aria-label="Price chart">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={height * f} y2={height * f} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      ))}
      {area && <path d={`${d}L${w},${height}L0,${height}Z`} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Bars({ data, labels, height = 110 }: { data: number[]; labels: string[]; height?: number }) {
  const max = Math.max(1, ...data.map(Math.abs));
  return (
    <div className="flex items-end gap-2" style={{ height: height + 18 }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex items-end" style={{ height }}>
            <div className={cx('w-full rounded-t', v >= 0 ? 'bg-blue' : 'bg-red')} style={{ height: `${(Math.abs(v) / max) * 100}%`, minHeight: 2 }} />
          </div>
          <span className="text-xs text-dim truncate w-full text-center">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export function Delta({ v, className }: { v: number; className?: string }) {
  if (!Number.isFinite(v)) return null;
  return (
    <span className={cx('num font-semibold', v >= 0 ? 'text-green' : 'text-red', className)}>
      {v >= 0 ? '▲' : '▼'} {Math.abs(v * 100).toFixed(1)}%
    </span>
  );
}
