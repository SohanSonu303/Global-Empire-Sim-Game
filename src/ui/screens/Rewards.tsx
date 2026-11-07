import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import { fmtMoney, fmtPct } from '../../engine/news';
import { UNLOCKS } from '../../engine/rewards';
import type { MonthReport } from '../../engine/types';
import type { Speed } from '../../worker/protocol';
import { Button, Progress, cx } from '../components/core';
import { play } from '../sound';

// ---------- pausing while a reward is on screen ----------

const holds = new Set<string>();
let resumeSpeed: Speed = 0;

/** Pause the days while `active`, and carry on at the same speed once nothing else holds the pause. */
export function usePauseWhile(owner: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const g = useGame.getState();
    if (holds.size === 0 && g.speed !== 0) resumeSpeed = g.speed;
    holds.add(owner);
    if (g.speed !== 0) g.setSpeed(0);
    return () => {
      holds.delete(owner);
      if (holds.size > 0) return;
      const s = useGame.getState();
      if (resumeSpeed !== 0 && s.speed === 0 && !s.world?.pending.length) s.setSpeed(resumeSpeed);
      resumeSpeed = 0;
    };
  }, [owner, active]);
}

function Modal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 anim-fade p-5" role="dialog" aria-modal="true" aria-label={label}>
      <div className="w-full max-w-[360px] max-h-full overflow-y-auto text-center">{children}</div>
    </div>
  );
}

function Seal({ children, color = '#e3b04b', edge = '#9c7320' }: { children?: ReactNode; color?: string; edge?: string }) {
  return (
    <div className="relative mx-auto w-36 anim-seal">
      <svg viewBox="0 0 120 120" className="w-36" aria-hidden>
        {[...Array(16)].map((_, i) => (
          <path key={i} d="M60 4 L66 20 L54 20 Z" fill={edge} transform={`rotate(${i * 22.5} 60 60)`} />
        ))}
        <circle cx="60" cy="60" r="40" fill={color} stroke={edge} strokeWidth="4" />
        <circle cx="60" cy="60" r="31" fill="none" stroke={edge} strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[#241803] font-black text-4xl">{children}</div>
    </div>
  );
}

// ---------- achievement ----------

function AchievementCard() {
  const a = useGame((s) => s.world?.achievements.find((x) => !x.seen));
  const dispatch = useGame((s) => s.dispatch);
  usePauseWhile('achievement', !!a);
  useEffect(() => { if (a) play('record'); }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null;
  return (
    <Modal label={a.title}>
      <Seal>★</Seal>
      <div className="-mt-3 mx-auto inline-block bg-gold text-gold-ink font-black text-xl px-6 py-2 rounded-md border-2 border-gold-edge">{a.title}</div>
      <p className="text-base mt-4">{a.body}</p>
      <div className="mt-4 rounded-card border border-line-strong bg-card p-3">
        <div className="text-sm text-gold font-bold">Rewards</div>
        <div className="flex justify-around mt-2">
          <div><div className="num text-lg font-bold">+{fmtMoney(a.rewardCash)}</div><div className="text-xs text-muted">Cash</div></div>
          <div><div className="num text-lg font-bold">+{a.rewardXp}</div><div className="text-xs text-muted">XP</div></div>
        </div>
      </div>
      <Button block size="lg" className="mt-4" onClick={() => dispatch({ type: 'seenAchievement', id: a.id })}>Awesome!</Button>
    </Modal>
  );
}

// ---------- level up ----------

function LevelUpCard() {
  const level = useGame((s) => s.world?.player.level ?? 1);
  const seen = useGame((s) => s.world?.play.levelSeen ?? 1);
  const dispatch = useGame((s) => s.dispatch);
  const open = level > seen;
  usePauseWhile('level', open);
  useEffect(() => { if (open) play('level'); }, [open, level]);
  if (!open) return null;
  const news = UNLOCKS.filter((u) => u.level > seen && u.level <= level);
  const nextUp = UNLOCKS.find((u) => u.level > level);
  return (
    <Modal label={`Level ${level}`}>
      <div className="text-sm font-bold text-gold tracking-widest uppercase">Level up!</div>
      <Seal>{level}</Seal>
      <p className="text-base mt-2 text-muted">Your reputation in Astoria is growing.</p>
      <div className="mt-4 rounded-card border border-line-strong bg-card p-3 text-left">
        <div className="text-sm text-gold font-bold text-center mb-2">{news.length ? 'You unlocked' : 'Next unlock'}</div>
        {(news.length ? news : nextUp ? [nextUp] : []).map((u) => (
          <div key={u.key} className="flex gap-3 items-start py-2 border-t border-line first:border-t-0">
            <span className="text-2xl leading-none">{u.icon}</span>
            <div>
              <div className="font-bold">{u.title}{!news.length && <span className="text-xs text-dim font-medium"> · level {u.level}</span>}</div>
              <div className="text-sm text-muted">{u.body}</div>
            </div>
          </div>
        ))}
      </div>
      {news.length > 0 && nextUp && <p className="text-xs text-dim mt-3">Next: {nextUp.icon} {nextUp.title} at level {nextUp.level}</p>}
      <Button block size="lg" className="mt-4" onClick={() => dispatch({ type: 'seenLevel' })}>Let's go!</Button>
    </Modal>
  );
}

// ---------- monthly report ----------

const GRADE_COLOR: Record<string, string> = { 'A+': '#3dbb6c', A: '#3dbb6c', B: '#4a8fe0', C: '#e3b04b', D: '#e08a3c', F: '#d94f4f' };

export function ReportBody({ r }: { r: MonthReport }) {
  const change = r.prevProfit !== 0 ? r.profit / Math.abs(r.prevProfit) - (r.prevProfit > 0 ? 1 : -1) : null;
  const moved = r.prevRank - r.rank;
  return (
    <>
      <div className="flex items-center gap-4">
        <div className="size-20 shrink-0 rounded-2xl grid place-items-center text-4xl font-black text-[#0b1220] anim-grade" style={{ background: GRADE_COLOR[r.grade] }}>{r.grade}</div>
        <div className="text-left">
          <div className="text-xs text-muted">Month {r.month} · day {r.day}</div>
          <div className="text-lg font-bold">Score {r.score}/100</div>
          <div className="text-sm text-muted">+{r.xp} XP</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4 text-left">
        <div className="rounded-lg bg-card-2 border border-line p-2.5">
          <div className="text-xs text-muted">Profit this month</div>
          <div className={cx('num font-bold', r.profit >= 0 ? 'text-green' : 'text-red')}>{fmtMoney(r.profit)}</div>
          {change !== null && <div className={cx('text-xs font-semibold', change >= 0 ? 'text-green' : 'text-red')}>{change >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(change), 0)} vs last month</div>}
        </div>
        <div className="rounded-lg bg-card-2 border border-line p-2.5">
          <div className="text-xs text-muted">Rank among billionaires</div>
          <div className="num font-bold">#{r.rank} <span className="text-dim text-xs">of {r.of}</span></div>
          <div className={cx('text-xs font-semibold', moved > 0 ? 'text-green' : moved < 0 ? 'text-red' : 'text-dim')}>{moved > 0 ? `▲ up ${moved}` : moved < 0 ? `▼ down ${-moved}` : 'no change'}</div>
        </div>
        {r.best && <div className="rounded-lg bg-card-2 border border-line p-2.5"><div className="text-xs text-muted">🏆 Best company</div><div className="font-bold truncate">{r.best.name}</div><div className="num text-xs text-green">{fmtMoney(r.best.net)}</div></div>}
        {r.worst && <div className="rounded-lg bg-card-2 border border-line p-2.5"><div className="text-xs text-muted">🐢 Needs work</div><div className="font-bold truncate">{r.worst.name}</div><div className={cx('num text-xs', r.worst.net >= 0 ? 'text-muted' : 'text-red')}>{fmtMoney(r.worst.net)}</div></div>}
      </div>
      <div className="mt-3 space-y-1.5 text-left">
        {r.parts.map((p) => (
          <div key={p.label}>
            <div className="flex justify-between text-xs"><span className="text-muted">{p.label}</span><span className="num font-semibold">{p.points}/{p.max}</span></div>
            <Progress value={p.points / p.max} height={6} tone={p.points / p.max >= 0.7 ? 'green' : p.points / p.max >= 0.4 ? 'gold' : 'red'} />
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-gold-edge/50 bg-gold/10 p-2.5 text-left text-sm"><span className="font-bold text-gold">Tip: </span>{r.tip}</div>
    </>
  );
}

function ReportCard() {
  const r = useGame((s) => s.world?.play.reports.at(-1));
  const seen = useGame((s) => s.world?.play.reportSeen);
  const dispatch = useGame((s) => s.dispatch);
  const open = !!r && r.id !== seen;
  usePauseWhile('report', open);
  useEffect(() => { if (open) play(r!.score >= 68 ? 'record' : 'tap'); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !r) return null;
  return (
    <Modal label="Monthly report">
      <div className="rounded-card border border-line-strong bg-card p-4">
        <div className="text-sm font-bold text-gold tracking-widest uppercase mb-3">Monthly report card</div>
        <ReportBody r={r} />
      </div>
      <Button block size="lg" className="mt-4" onClick={() => dispatch({ type: 'seenReport', id: r.id })}>Back to work</Button>
    </Modal>
  );
}

// ---------- daily streak ----------

function StreakCard() {
  const reward = useGame((s) => s.world?.play.streak.reward);
  const best = useGame((s) => s.world?.play.streak.best ?? 0);
  const dispatch = useGame((s) => s.dispatch);
  const open = !!reward && !reward.seen;
  usePauseWhile('streak', open);
  useEffect(() => { if (open) play('coin'); }, [open]);
  if (!open || !reward) return null;
  const days = [1, 2, 3, 4, 5, 6, 7];
  const inWeek = ((reward.count - 1) % 7) + 1;
  return (
    <Modal label="Daily streak">
      <div className="text-6xl anim-seal">🔥</div>
      <div className="text-2xl font-black mt-2">{reward.count} day streak!</div>
      <p className="text-sm text-muted mt-1">{reward.froze ? '🧊 A streak freeze saved your streak.' : 'Come back tomorrow to keep it going.'}</p>
      <div className="flex justify-center gap-1.5 mt-4">
        {days.map((d) => (
          <div key={d} className={cx('size-9 rounded-lg grid place-items-center text-sm font-bold border', d <= inWeek ? 'bg-gold text-gold-ink border-gold-edge' : 'bg-card border-line text-dim', d === 7 && 'ring-2 ring-gold/40')}>
            {d === 7 ? '🎁' : d}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-card border border-line-strong bg-card p-3">
        <div className="text-sm text-gold font-bold">Today's reward</div>
        <div className="flex justify-around mt-2">
          <div><div className="num text-lg font-bold">+{fmtMoney(reward.cash)}</div><div className="text-xs text-muted">Cash</div></div>
          <div><div className="num text-lg font-bold">+{reward.xp}</div><div className="text-xs text-muted">XP</div></div>
        </div>
        <div className="text-xs text-dim mt-2">Day 7 pays double. Best streak: {best} day{best === 1 ? '' : 's'}.</div>
      </div>
      <Button block size="lg" className="mt-4" onClick={() => dispatch({ type: 'seenStreak' })}>Collect</Button>
    </Modal>
  );
}

// ---------- banners (records, contracts...) ----------

function Banners() {
  const banners = useGame((s) => s.world?.play.banners);
  const [queue, setQueue] = useState<NonNullable<typeof banners>>([]);
  const lastId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!banners) return;
    if (lastId.current === undefined) { lastId.current = banners.at(-1)?.id ?? null; return; } // don't replay old ones on load
    const i = banners.findIndex((b) => b.id === lastId.current);
    const fresh = banners.slice(i + 1);
    if (fresh.length) {
      lastId.current = fresh.at(-1)!.id;
      setQueue((q) => [...q, ...fresh].slice(-4));
      const bad = fresh.every((b) => b.tone === 'bad');
      play(bad ? 'bad' : fresh.some((b) => b.title.startsWith('New record')) ? 'record' : 'coin');
    }
  }, [banners]);
  const top = queue[0];
  useEffect(() => {
    if (!top) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 2800);
    return () => clearTimeout(t);
  }, [top]);
  if (!top) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-[124px] z-[60] w-[min(92vw,460px)] pointer-events-none" role="status">
      <div
        key={top.id}
        className={cx('anim-banner rounded-xl border-2 px-4 py-2.5 shadow-lg pointer-events-auto flex items-center gap-3 relative overflow-hidden',
          top.tone === 'bad' ? 'bg-red-dim border-red/70' : top.tone === 'good' ? 'bg-card-2 border-green/70' : 'bg-card-2 border-gold-edge')}
        onClick={() => setQueue((q) => q.slice(1))}
      >
        {top.tone !== 'bad' && <span className="absolute inset-0 shine pointer-events-none" />}
        <span className="text-2xl">{top.tone === 'bad' ? '⚠️' : top.title.startsWith('New record') ? '🏅' : top.tone === 'good' ? '✅' : '⭐'}</span>
        <div className="min-w-0 flex-1">
          <div className={cx('font-black text-sm', top.tone === 'bad' ? 'text-red' : 'text-gold')}>{top.title}</div>
          <div className="text-sm truncate">{top.body}</div>
        </div>
        {top.xp > 0 && <span className="text-xs font-bold text-gold shrink-0">+{top.xp} XP</span>}
      </div>
    </div>
  );
}

/** Coin sounds for big sales days. */
function usePopSounds() {
  const pops = useGame((s) => s.world?.play.pops);
  const day = useGame((s) => s.world?.day);
  const last = useRef(day);
  useEffect(() => {
    if (day === last.current) return;
    last.current = day;
    if (pops?.some((p) => p.kind === 'big')) play('coin');
  }, [day, pops]);
}

/** All reward pop-ups. Only one modal shows at a time, in this order. */
export function RewardOverlays() {
  usePopSounds();
  const w = useGame((s) => s.world);
  const eventOpen = useGame((s) => s.eventOpen);
  if (!w) return null;
  const p = w.play;
  const showStreak = !!p.streak.reward && !p.streak.reward.seen;
  const showAch = !showStreak && w.achievements.some((a) => !a.seen);
  const showLevel = !showStreak && !showAch && w.player.level > p.levelSeen;
  const r = p.reports.at(-1);
  const showReport = !showStreak && !showAch && !showLevel && !!r && r.id !== p.reportSeen && !eventOpen;
  return (
    <>
      <Banners />
      {showStreak && <StreakCard />}
      {showAch && <AchievementCard />}
      {showLevel && <LevelUpCard />}
      {showReport && <ReportCard />}
    </>
  );
}

