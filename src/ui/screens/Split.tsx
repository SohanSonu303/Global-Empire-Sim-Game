import { useEffect, useState } from 'react';
import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { bookedPerDay } from '../../engine/strategy';
import { marketShareOf, storable, totalRoom } from '../../engine/warehouse';
import type { Company, OutputSplit, WorldState } from '../../engine/types';
import { Button, Card, cx } from '../components/core';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Units a day this company has promised to supply deals (as seller) */
function dealsPerDay(w: WorldState, c: Company): number {
  return w.contracts.filter((k) => k.sellerId === c.id && k.endDay >= w.day).reduce((s, k) => s + k.qtyPerDay, 0);
}

/** A split that matches what the company already does, as a starting point */
function suggested(w: WorldState, c: Company): OutputSplit {
  const r5 = (x: number) => Math.min(1, Math.ceil((x * 20) - 1e-9) / 20);
  return { deals: r5(dealsPerDay(w, c) / c.capacity), contracts: r5(bookedPerDay(w, c.id) / c.capacity), warehouse: 0 };
}

const PARTS: { key: keyof OutputSplit; label: string; icon: string; color: string; help: string }[] = [
  { key: 'deals', label: 'Deals', icon: '🤝', color: 'bg-blue', help: 'Supply deals you signed with other companies' },
  { key: 'contracts', label: 'Contracts', icon: '📋', color: 'bg-amber', help: 'Contracts board jobs and government tenders' },
  { key: 'warehouse', label: 'Warehouse', icon: '🏬', color: 'bg-gold', help: 'Stored to sell later, when prices are higher' },
];

/** Decide how each day's output is shared between deals, contracts, the warehouse and the market. */
export function SplitCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const [draft, setDraft] = useState<OutputSplit>(() => c.split ?? suggested(w, c));
  useEffect(() => { setDraft(c.split ?? suggested(w, c)); }, [c.id, c.split]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = GOODS[c.good].unit;
  const hasWh = w.play.warehouses.length > 0;
  const canStore = storable(c.good);
  const market = marketShareOf(draft);
  const changed = !c.split || (['deals', 'contracts', 'warehouse'] as const).some((k) => Math.abs(c.split![k] - draft[k]) > 1e-6);
  const set = (k: keyof OutputSplit, v: number) => {
    const others = (['deals', 'contracts', 'warehouse'] as const).filter((x) => x !== k).reduce((s, x) => s + draft[x], 0);
    setDraft({ ...draft, [k]: Math.min(v, Math.max(0, 1 - others)) });
  };
  const deals = dealsPerDay(w, c);
  const jobs = bookedPerDay(w, c.id);
  const warn: string[] = [];
  if (deals > draft.deals * c.capacity + 1e-6) warn.push(`Your deals need ${pct(deals / c.capacity)} of output. With ${pct(draft.deals)} some deliveries will fall short and partners will be unhappy.`);
  if (jobs > draft.contracts * c.capacity + 1e-6) warn.push(`Your contracts need ${pct(jobs / c.capacity)} of output. With ${pct(draft.contracts)} the rest must come from the warehouse, or you may miss a deadline.`);
  if (draft.warehouse > 0 && hasWh && totalRoom(w, c.good) < c.capacity * draft.warehouse) warn.push('Your warehouses are nearly full for this product: build or upgrade one, or the extra stays here.');

  return (
    <Card className="col-span-2 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-gold">Where your output goes</div>
        <span className="text-[11px] text-muted">{c.split ? 'Your split' : 'No limits yet'}</span>
      </div>
      <p className="text-xs text-muted mt-1">
        Share {c.name}'s daily output of about {Math.round(c.capacity).toLocaleString()} {unit}. These are the most each may take: anything deals or contracts don't use goes to the market.
      </p>
      <div className="flex h-3 rounded-full overflow-hidden mt-2 bg-card-2" aria-hidden>
        <div className="bg-green" style={{ width: pct(market) }} />
        {PARTS.map((p) => <div key={p.key} className={p.color} style={{ width: pct(draft[p.key]) }} />)}
      </div>
      <div className="flex justify-between text-sm mt-2.5">
        <span><span aria-hidden>🛒</span> Market <span className="text-[11px] text-muted">· everyone else, and your own factories</span></span>
        <b className="num text-green">{pct(market)}</b>
      </div>
      {PARTS.map((p) => {
        const off = p.key === 'warehouse' && (!hasWh || !canStore);
        return (
          <div key={p.key} className={cx('mt-2', off && 'opacity-50')}>
            <div className="flex justify-between text-sm">
              <span><span aria-hidden>{p.icon}</span> {p.label} <span className="text-[11px] text-muted">· {off ? (!canStore ? `${GOODS[c.good].name} can't be stored` : 'build a warehouse first') : p.help}</span></span>
              <b className="num">{pct(draft[p.key])}</b>
            </div>
            <input type="range" min={0} max={100} step={5} value={Math.round(draft[p.key] * 100)} disabled={off}
              aria-label={`${p.label} share`} className="w-full accent-[var(--color-gold)]"
              onChange={(e) => set(p.key, Number(e.target.value) / 100)} />
          </div>
        );
      })}
      {warn.map((t) => <p key={t} className="text-xs text-amber mt-1.5">⚠️ {t}</p>)}
      <div className="flex gap-2 mt-2.5">
        <Button className="flex-1" disabled={!changed} onClick={() => dispatch({ type: 'setSplit', companyId: c.id, split: draft })}>Save split</Button>
        {c.split && <Button variant="ghost" onClick={() => dispatch({ type: 'setSplit', companyId: c.id, split: null })}>No limits</Button>}
      </div>
    </Card>
  );
}
