import { useState } from 'react';
import { useGame } from '../../store/game';
import { GOODS, INDUSTRIES, INDUSTRY_IDS, MAX_LEVEL } from '../../engine/data';
import { nextUpgradeCost, pnlExplain } from '../../engine/company';
import { cashRisk, lowSupply } from '../../engine/advisor';
import { fmtMoney } from '../../engine/news';
import type { Company, IndustryId } from '../../engine/types';
import { GoodThumb } from '../art/plants';
import { Badge, Button, Card, Chips, Screen, Stars, cx } from '../components/core';
import { Num } from '../components/game';
import { IconPlus } from '../components/Icons';
import { playerCompanies, rating } from '../helpers';
import { useAttention } from '../advice';
import { ChainMapCard } from './Chain';
import { unlocked } from '../../engine/rewards';

type Filter = 'all' | IndustryId;

/** Entry to the contracts board, tenders, warehouses, wars and tips. */
function StrategyCard() {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const p = w.play;
  const offers = p.jobs.filter((j) => j.status === 'offer').length;
  const active = p.jobs.filter((j) => j.status === 'active').length;
  const tenders = p.tenders.filter((t) => t.status === 'open').length;
  const wars = p.wars.filter((x) => x.status === 'active').length;
  const bits = [
    active ? `${active} active contract${active > 1 ? 's' : ''}` : offers ? `${offers} contract offer${offers > 1 ? 's' : ''}` : null,
    tenders ? `${tenders} open tender${tenders > 1 ? 's' : ''}` : null,
    p.warehouses.length ? `${p.warehouses.length} warehouse${p.warehouses.length > 1 ? 's' : ''}` : null,
    wars ? `⚔️ ${wars} price war${wars > 1 ? 's' : ''}` : null,
  ].filter(Boolean);
  const open = unlocked(w, 'contracts');
  return (
    <Card className="p-3 flex items-center gap-3" onClick={() => push({ screen: 'strategy' })}>
      <span className="grid place-items-center size-11 rounded-lg bg-card-2 border border-line text-2xl">🤝</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold">Deals & Strategies</div>
        <div className="text-sm text-muted truncate">{open ? (bits.length ? bits.join(' · ') : 'Contracts, tenders, warehouses, price wars') : 'Contracts board unlocks at level 2'}</div>
      </div>
      {offers + tenders > 0 && <Badge tone="gold">{offers + tenders} new</Badge>}
    </Card>
  );
}

export function BusinessScreen() {
  const w = useGame((s) => s.world)!;
  const [filter, setFilter] = useState<Filter>('all');
  const push = useGame((s) => s.push);
  const attention = useAttention();
  const plan = () => push({ screen: 'planner', industry: filter === 'all' ? undefined : filter });
  const mine = playerCompanies(w).filter((c) => filter === 'all' || c.industry === filter);

  return (
    <Screen>
      <div className="flex items-center justify-between pt-4 pb-2">
        <h1 className="text-2xl font-bold">My Businesses</h1>
        <Button size="sm" onClick={plan}><IconPlus size={18} /> New</Button>
      </div>
      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        items={[{ id: 'all', label: 'All' }, ...INDUSTRY_IDS.map((i) => ({ id: i, label: INDUSTRIES[i].name }))]}
      />
      <div className="mt-3 space-y-2.5">
        <ChainMapCard />
        <StrategyCard />
        {mine.map((c) => <BusinessRow key={c.id} c={c} flag={attention[c.id]} />)}
        <button
          onClick={plan}
          className="w-full flex items-center gap-3 rounded-card border-2 border-dashed border-line-strong p-4 text-left hover:border-gold"
        >
          <span className="grid place-items-center size-11 rounded-full bg-card-2 border border-line-strong text-gold"><IconPlus /></span>
          <span>
            <span className="block font-bold">Plan a New Company</span>
            <span className="block text-sm text-muted">See what is in demand, its costs and a profit forecast</span>
          </span>
        </button>
      </div>
    </Screen>
  );
}

function BusinessRow({ c, flag }: { c: Company; flag?: 'urgent' | 'warn' | 'tip' | 'good' }) {
  const push = useGame((s) => s.push);
  const dispatch = useGame((s) => s.dispatch);
  const cost = nextUpgradeCost(c);
  const net = c.last.netIncome;
  const w = useGame((s) => s.world)!;
  const low = lowSupply(c);
  return (
    <Card onClick={() => push({ screen: 'company', id: c.id })} className="p-2.5">
      <div className="flex items-center gap-3">
        <span className="relative">
          <GoodThumb good={c.good} level={c.level} size={60} />
          {flag && <span className={cx('absolute -top-1 -right-1 size-3.5 rounded-full border-2 border-card', flag === 'urgent' ? 'bg-red' : 'bg-amber')} aria-label="Needs attention" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold truncate">{c.name}</span>
            {c.bankrupt && <Badge tone="bad">Bankrupt</Badge>}
            {!c.bankrupt && cashRisk(w, c) && <Badge tone="bad">Low cash</Badge>}
            {!c.bankrupt && c.strikeUntil > 0 && c.last.laborCap === 0 && <Badge tone="warn">Strike</Badge>}
            {!c.bankrupt && low.length > 0 && <Badge tone="warn">Low {GOODS[low[0].good].name.toLowerCase()}</Badge>}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>{GOODS[c.good].name} · Lv {c.level}</span>
            <Stars value={rating(c)} />
          </div>
          <div className={cx('mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold num', net >= 0 ? 'bg-green-dim text-green' : 'bg-red-dim text-red')}>
            <Num explain={() => pnlExplain(c, 'day')} className="no-underline">{fmtMoney(net)} / day</Num>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            size="sm"
            disabled={c.bankrupt || c.level >= MAX_LEVEL}
            onClick={(e) => {
              e.stopPropagation();
              void dispatch({ type: 'upgrade', companyId: c.id });
            }}
          >
            Upgrade
          </Button>
          <span className="num text-xs text-dim">{fmtMoney(cost)}</span>
        </div>
      </div>
    </Card>
  );
}
