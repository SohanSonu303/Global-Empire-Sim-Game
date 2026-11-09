import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { MAINT, MANAGERS, conditionMult, maintCostPerDay, managerCostPerDay, reachOf } from '../../engine/company';
import { daysToReach, fillRate, marketQuality, reachLabel } from '../../engine/business';
import { rivalMoves } from '../../engine/rivalry';
import { fmtMoney, fmtPct } from '../../engine/news';
import type { Company, MaintLevel, ManagerId, WorldState } from '../../engine/types';
import { Card, Chips, Progress, cx } from '../components/core';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Meter({ label, value, max = 1, tone, right, note }: { label: string; value: number; max?: number; tone: 'green' | 'gold' | 'red' | 'amber' | 'blue'; right: string; note?: string }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="num font-semibold">{right}</span>
      </div>
      <Progress className="mt-1.5" value={Math.min(1, value / max)} tone={tone} height={8} />
      {note && <p className="text-xs text-dim mt-1">{note}</p>}
    </div>
  );
}

/** Customers, machines, staff and who runs the place: the levers of running a business. */
export function RunningCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const push = useGame((s) => s.push);
  const def = GOODS[c.good];
  const reach = reachOf(c);
  const sat = c.satisfaction ?? 0.75;
  const cond = c.condition ?? 1;
  const skill = c.skill ?? 1;
  const to80 = daysToReach(w, c, 0.8);
  const mq = marketQuality(w, c.good);
  const fill = fillRate(c);
  const satWhy = fill < 0.9 ? `Orders filled: ${pct(fill)}. Running out of stock costs customers.`
    : c.priceMult > 1.05 ? `Your price is ${fmtPct(c.priceMult - 1, 0)} above the market.`
      : c.quality < mq * 0.95 ? `Quality ${c.quality.toFixed(2)} vs ${mq.toFixed(2)} for rivals: more R&D helps.`
        : 'Orders filled, fair price, decent quality.';
  const moves = rivalMoves(w, c);
  const boosts = (c.boosts ?? []).filter((b) => b.until > w.day);
  return (
    <Card className="col-span-2 p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-gold">Running the business</div>
      <div className="divide-y divide-line">
        <Meter
          label="Customers" value={reach} max={1.2} tone={reach < 0.5 ? 'amber' : 'green'} right={`${pct(reach)} · ${reachLabel(c)}`}
          note={reach < 0.8 && Number.isFinite(to80) ? `About ${Math.max(1, Math.round(to80 / 7))} weeks to 80% at ${fmtPct(c.marketingPct, 0)} marketing. More marketing wins them faster.` : reach < 0.8 ? 'At this marketing level you will not win many more. Spend more, or improve satisfaction.' : `Compared with an established ${def.name.toLowerCase()} firm. Happy customers stay; marketing brings new ones.`}
        />
        <Meter label="Customer satisfaction" value={sat} tone={sat < 0.5 ? 'red' : sat < 0.65 ? 'amber' : 'green'} right={pct(sat)} note={satWhy} />
        <div className="py-2">
          <Meter label="Machines" value={cond} tone={cond < 0.6 ? 'red' : cond < 0.8 ? 'amber' : 'green'} right={`${pct(cond)} · ${pct(conditionMult(c))} output`} note="Machines wear as they run. Worn machines make less and break down more often." />
          <Chips<MaintLevel>
            bleed={false}
            value={c.maintenance ?? 'normal'}
            onChange={(v) => dispatch({ type: 'setMaintenance', companyId: c.id, level: v })}
            items={(Object.keys(MAINT) as MaintLevel[]).map((k) => ({ id: k, label: `${MAINT[k].label} ${fmtMoney(maintCostPerDay(w, { ...c, maintenance: k }))}/d` }))}
          />
        </div>
        <Meter label="Team experience" value={skill} max={1.15} tone={skill < 0.9 ? 'amber' : 'green'} right={pct(skill)} note={skill < 0.97 ? 'New hires start slower and learn over a few weeks. Unhappy staff quit, so keep morale up.' : 'A trained team. Training courses in the inbox push it higher.'} />
        {(c.receivables ?? 0) > 1 && (
          <div className="flex items-center justify-between py-2 text-sm">
            <span className="text-muted">Owed by customers</span>
            <span className="num font-semibold">{fmtMoney(c.receivables ?? 0)}</span>
          </div>
        )}
        <div className="py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Who runs it day to day</span>
            <span className="num font-semibold">{managerCostPerDay(w, c) > 0 ? `${fmtMoney(managerCostPerDay(w, c))}/day` : 'Free'}</span>
          </div>
          <div className="mt-1.5">
            <Chips<ManagerId>
              bleed={false}
              value={c.manager ?? 'none'}
              onChange={(v) => dispatch({ type: 'setManager', companyId: c.id, manager: v })}
              items={(Object.keys(MANAGERS) as ManagerId[]).map((k) => ({ id: k, label: k === 'none' ? 'You' : `${MANAGERS[k].label} ${fmtMoney(managerCostPerDay(w, { ...c, manager: k }))}/d` }))}
            />
          </div>
          <p className="text-xs text-dim mt-1">{MANAGERS[c.manager ?? 'none'].blurb}</p>
        </div>
        {(moves.length > 0 || boosts.length > 0) && (
          <div className="py-2 space-y-1">
            {moves.map((m) => <p key={m.name} className="text-xs text-red">⚔️ {m.name}: {m.why.toLowerCase()} for {m.until - w.day} more days.</p>)}
            {boosts.map((b, i) => (
              <p key={i} className={cx('text-xs', b.mult >= 1 === (b.kind !== 'price' && b.kind !== 'cost') ? 'text-green' : 'text-amber')}>
                {b.why}: {b.kind === 'attract' ? 'orders' : b.kind === 'price' ? 'price' : b.kind === 'cost' ? 'other costs' : 'output per worker'} {b.mult >= 1 ? '+' : ''}{fmtPct(b.mult - 1, 0)} for {b.until - w.day} more days
              </p>
            ))}
          </div>
        )}
      </div>
      <button className="w-full min-h-tap text-sm font-semibold text-gold border-t border-line mt-1" onClick={() => push({ screen: 'inbox' })}>Open the inbox</button>
    </Card>
  );
}
