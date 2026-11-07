import { useState } from 'react';
import { useGame } from '../../store/game';
import { activeGoals, netWorth, netWorthExplain } from '../../engine/progress';
import { portfolioValue } from '../../engine/market';
import { fmtMoney } from '../../engine/news';
import type { Goal } from '../../engine/types';
import type { Advice } from '../../engine/advisor';
import { CityScene } from '../art/art';
import { Badge, Button, Card, Progress, Ribbon, Screen, SectionTitle, cx } from '../components/core';
import { Num } from '../components/game';
import { IconNews, IconTarget } from '../components/Icons';
import { playerCompanies } from '../helpers';
import { runAction, useAdvice } from '../advice';

export function HomeScreen() {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const dispatch = useGame((s) => s.dispatch);
  const mine = playerCompanies(w);
  const profitDay = mine.reduce((s, c) => s + (c.bankrupt ? 0 : c.last.netIncome), 0);
  const goals = activeGoals(w);

  return (
    <div>
      <div className="relative border-b border-line">
        <CityScene companies={mine} onOpen={(id) => push({ screen: 'company', id })} onEmpty={(ind) => push({ screen: 'planner', industry: ind })} fx={{ pops: w.play.pops, upgraded: w.play.upgraded, day: w.day, level: w.player.level }} />
        {mine.length === 0 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
            <span className="pointer-events-auto"><Badge tone="gold">Tap a plot to found your first company</Badge></span>
          </div>
        )}
      </div>
      <Screen>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <MiniStat label="Net worth" value={<Num explain={() => netWorthExplain(useGame.getState().world!)}>{fmtMoney(netWorth(w))}</Num>} />
          <MiniStat label="Profit / day" value={<span className={profitDay >= 0 ? 'text-green' : 'text-red'}>{fmtMoney(profitDay)}</span>} />
          <MiniStat label="Portfolio" value={fmtMoney(portfolioValue(w, w.player.holdings))} />
        </div>

        <Assistant />

        {w.player.level < 4 && (
          <Card className="mt-3 p-3 border-gold/50 bg-gradient-to-r from-gold/15 to-card" onClick={() => push({ screen: 'guide' })}>
            <div className="flex items-center gap-3">
              <span className="grid place-items-center size-10 shrink-0 rounded-full bg-gold text-gold-ink text-lg font-black">?</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold">New here? Read How to Play</div>
                <div className="text-xs text-muted">Goals, growing, takeovers, banks and beating rivals, in 8 short pages</div>
              </div>
              <span className="text-gold font-bold text-sm">Open</span>
            </div>
          </Card>
        )}

        <Card className="mt-4">
          <Ribbon icon={<IconTarget size={18} />}>Today's Goals</Ribbon>
          <div className="divide-y divide-line">
            {goals.map((g) => <GoalRow key={g.id} g={g} onClaim={() => dispatch({ type: 'claimGoal', goalId: g.id })} />)}
            {goals.length === 0 && <p className="p-4 text-sm text-muted">All goals complete. You are a tycoon.</p>}
          </div>
        </Card>

        <SectionTitle right={<button className="text-sm text-gold font-semibold min-h-tap" onClick={() => push({ screen: 'news' })}>Read the paper</button>}>
          <span className="inline-flex items-center gap-1.5"><IconNews size={16} /> The Astoria Times</span>
        </SectionTitle>
        <Card>
          <div className="divide-y divide-line">
            {w.news.slice(0, 4).map((n) => (
              <button key={n.id} onClick={() => push({ screen: 'article', id: n.id })} className="w-full text-left px-3 py-2.5 min-h-tap flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 text-xs text-dim">
                    <span className="uppercase font-bold tracking-wider">{n.category}</span>
                    <span>Day {n.day}</span>
                  </span>
                  <span className={n.tone === 'bad' ? 'block text-red font-semibold' : n.tone === 'good' ? 'block text-green font-semibold' : 'block font-semibold'}>{n.headline}</span>
                </span>
                <span className="text-dim" aria-hidden>›</span>
              </button>
            ))}
          </div>
        </Card>
      </Screen>
    </div>
  );
}

const TONE: Record<Advice['severity'], { dot: string; ring: string; label: string }> = {
  urgent: { dot: 'bg-red', ring: 'border-red/50', label: 'Now' },
  warn: { dot: 'bg-amber', ring: 'border-amber/40', label: 'Soon' },
  good: { dot: 'bg-green', ring: 'border-green/40', label: 'Good news' },
  tip: { dot: 'bg-blue', ring: 'border-line', label: 'Idea' },
};

/** The PA: a short, prioritised to-do list with one-tap fixes. */
function Assistant() {
  const advice = useAdvice();
  const [all, setAll] = useState(false);
  const urgent = advice.filter((a) => a.severity === 'urgent' || a.severity === 'warn').length;
  const shown = all ? advice : advice.slice(0, 3);
  return (
    <Card className={cx('mt-3', urgent > 0 && 'border-amber/60')}>
      <div className="flex items-center gap-3 px-3 pt-3">
        <span className="grid place-items-center size-10 shrink-0 rounded-full bg-gradient-to-b from-gold to-gold-edge text-gold-ink font-black">PA</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold">Your assistant</div>
          <div className="text-xs text-muted">
            {advice.length === 0 ? 'Everything is running smoothly.' : urgent > 0 ? `${urgent} thing${urgent > 1 ? 's' : ''} need${urgent > 1 ? '' : 's'} your attention` : 'Nothing urgent. Some ideas to grow:'}
          </div>
        </div>
      </div>
      <div className="divide-y divide-line mt-2">
        {shown.map((a) => <AdviceRow key={a.id} a={a} />)}
        {advice.length === 0 && <p className="px-3 py-3 text-sm text-muted">No problems. Speed up time, or open the planner to start something new.</p>}
      </div>
      {advice.length > 3 && (
        <button className="w-full min-h-tap text-sm font-semibold text-gold border-t border-line" onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show all ${advice.length}`}
        </button>
      )}
    </Card>
  );
}

function AdviceRow({ a }: { a: Advice }) {
  const t = TONE[a.severity];
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <span className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', t.dot)} aria-label={t.label} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{a.title}</div>
        <div className="text-xs text-muted">{a.body}</div>
      </div>
      {a.action && (
        <Button size="sm" variant={a.severity === 'urgent' ? 'gold' : 'dark'} className="shrink-0 max-w-[42%] whitespace-normal leading-tight" onClick={() => runAction(a.action!)}>
          {a.action.label}
        </Button>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card px-2.5 py-2 min-w-0">
      <div className="text-xs text-muted truncate">{label}</div>
      <div className="num font-bold truncate">{value}</div>
    </div>
  );
}

function GoalRow({ g, onClaim }: { g: Goal; onClaim: () => void }) {
  const done = g.progress >= g.target;
  const fmt = (v: number) =>
    g.kind === 'profitTotal' || g.kind === 'netWorth' ? fmtMoney(v) : g.kind === 'share' ? `${(v * 100).toFixed(1)}%` : String(Math.floor(v));
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{g.label}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <Progress value={g.progress / g.target} tone={done ? 'gold' : 'green'} />
          <span className="num text-xs text-muted shrink-0">{fmt(Math.min(g.progress, g.target))} / {fmt(g.target)}</span>
        </div>
        <div className="text-xs text-dim mt-1">Reward {fmtMoney(g.rewardCash)} · {g.rewardXp} XP</div>
      </div>
      <Button size="sm" variant={done ? 'gold' : 'dark'} disabled={!done} onClick={onClaim}>Claim</Button>
    </div>
  );
}
