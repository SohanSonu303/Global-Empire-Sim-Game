import { importedMuch, lowSupply, usableCap } from '../../engine/advisor';
import { useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import { GOODS, INDUSTRIES, MAX_LEVEL, maxPriceMult } from '../../engine/data';
import {
  companyValue, companyValueExplain, creditLimit, damageMult, repayBuffer, nextUpgradeCost, outputExplain, pnlExplain, productivity, refPrice, unitEconomics, workersForDemand,
} from '../../engine/company';
import { fmtMoney, fmtPct, fmtPrice } from '../../engine/news';
import { SupplyTab } from './Supply';
import type { Company, DayResult, WorldState } from '../../engine/types';
import { Cutaway } from '../art/art';
import { IndustrialPark } from '../art/Park';
import { useAttention } from '../advice';
import { ShortageNote } from './Chain';
import { OwnersTab } from './Owners';
import { RunningCard } from './Running';
import { SplitCard } from './Split';
import { isBank } from '../../engine/banks';
import { outsidePct, playerPct } from '../../engine/ownership';
import { Badge, BottomSheet, Button, Card, Chips, Progress, Screen, StatPill, cx } from '../components/core';
import { Bars, LineChart, Num } from '../components/game';
import { IconArrowUp, IconBack, IconTag, IconUsers } from '../components/Icons';
import { histDelta } from '../helpers';
import { unlocked, unlockLevel } from '../../engine/rewards';
import { CAMPAIGN, CAMPAIGN_FADE, MONOPOLY_SHARE, WAR_PRICE, activeWar, campaignCost, campaignFatigue, campaignMult, campaignResult, probeChance, warTarget } from '../../engine/strategy';
import { storable, totalRoom } from '../../engine/warehouse';
import type { CampaignSize } from '../../engine/types';
import { AUTO_EXPLORE_AT, DEPLETION_DAYS, RAW_UPKEEP, THIN_RESERVES, exploreCost, extractionMult, isRawMine, reserveCapMult, reservesOf } from '../../engine/resources';
import { COVER, PREMIUM_RATE, disasterInfo } from '../../engine/disasters';

type T = 'overview' | 'supply' | 'financials' | 'owners' | 'operations' | 'employees' | 'automation';

export function CompanyScreen({ id }: { id: string }) {
  const w = useGame((s) => s.world)!;
  const back = useGame((s) => s.back);
  const dispatch = useGame((s) => s.dispatch);
  const [tab, setTab] = useState<T>('overview');
  const [sheet, setSheet] = useState<'hire' | 'price' | null>(null);
  const c = w.companies.find((x) => x.id === id);
  if (!c) return <Screen><p className="pt-6 text-muted">Company not found.</p></Screen>;
  const mine = c.isPlayer;
  const s30 = c.sum30;
  const cost = nextUpgradeCost(c);

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center gap-2 px-2 h-14 border-b border-line bg-surface">
        <button aria-label="Back" onClick={back} className="size-tap grid place-items-center text-muted hover:text-text"><IconBack /></button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg truncate">{c.name}</div>
          <div className="text-xs text-muted">{GOODS[c.good].name} · {INDUSTRIES[c.industry].name}{!mine && ' · AI company'}{c.ticker && ` · ${c.ticker}`}</div>
        </div>
        {c.bankrupt ? <Badge tone="bad">Bankrupt</Badge> : <Badge tone="gold">Lv {c.level}</Badge>}
      </div>
      <Screen className="flex-1">
        <div className="flex gap-2 pt-3">
          <StatPill label="Revenue 30d" value={<Num explain={() => pnlExplain(c, '30d')}>{fmtMoney(s30.revenue)}</Num>} delta={histDelta(c, 'revenue')} />
          <StatPill label="Profit 30d" value={<Num explain={() => pnlExplain(c, '30d')} className={s30.netIncome < 0 ? 'text-red' : ''}>{fmtMoney(s30.netIncome)}</Num>} delta={histDelta(c, 'net')} />
          <StatPill label="Cash" value={fmtMoney(c.cash)} delta={histDelta(c, 'cash')} />
        </div>
        <div className="mt-3">
          <Chips<T>
            value={tab}
            onChange={setTab}
            items={[
              { id: 'overview', label: 'Overview' },
              { id: 'supply', label: 'Supply & Deals' },
              { id: 'financials', label: 'Financials' },
              { id: 'owners', label: isBank(c) ? 'Owners & Loans' : 'Owners & Bank' },
              { id: 'operations', label: 'Operations' },
              { id: 'employees', label: 'Employees' },
              { id: 'automation', label: 'Automation', disabled: !mine },
            ]}
          />
        </div>
        <div className="mt-3">
          {tab === 'overview' && <Overview c={c} w={w} />}
          {tab === 'supply' && <SupplyTab c={c} w={w} />}
          {tab === 'financials' && <Financials c={c} />}
          {tab === 'owners' && <OwnersTab c={c} w={w} />}
          {tab === 'operations' && <Operations c={c} w={w} />}
          {tab === 'employees' && <Employees c={c} />}
          {tab === 'automation' && mine && <AutomationTab c={c} />}
        </div>
      </Screen>
      {mine && !c.bankrupt && (
        <div className="sticky bottom-0 grid grid-cols-3 gap-2 px-gutter py-2 bg-surface border-t border-line">
          <Button variant="dark" size="sm" onClick={() => setSheet('hire')}><IconUsers size={16} /> Hire</Button>
          <Button disabled={c.level >= MAX_LEVEL} onClick={() => dispatch({ type: 'upgrade', companyId: c.id })} className="flex-col gap-0 leading-tight">
            <span className="inline-flex items-center gap-1"><IconArrowUp size={16} /> Upgrade</span>
            <span className="num text-xs font-semibold opacity-80">{fmtMoney(cost)}</span>
          </Button>
          <Button variant="dark" size="sm" className="whitespace-nowrap" onClick={() => setSheet('price')}><IconTag size={16} /> Price</Button>
        </div>
      )}
      {sheet === 'hire' && <HireSheet c={c} onClose={() => setSheet(null)} />}
      {sheet === 'price' && <PriceSheet c={c} w={w} onClose={() => setSheet(null)} />}
    </div>
  );
}

export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={cx('num font-semibold', tone === 'good' && 'text-green', tone === 'bad' && 'text-red')}>{value}</span>
    </div>
  );
}

function Mood({ v }: { v: number }) {
  return <span className={v > 0.65 ? 'text-green' : v > 0.45 ? 'text-amber' : 'text-red'}>{v > 0.65 ? '☺' : v > 0.45 ? '😐' : '☹'} {Math.round(v * 100)}%</span>;
}

/** This company's site: its plant, sister suppliers and buyers, the market depot and customers */
function SiteCard({ c, w }: { c: Company; w: WorldState }) {
  const push = useGame((s) => s.push);
  const attention = useAttention();
  const inputs = new Set(GOODS[c.good].inputs.map((i) => i.good));
  const sisters = w.companies.filter((x) => x.id !== c.id && !x.bankrupt && x.ownerId === c.ownerId && (inputs.has(x.good) || GOODS[x.good].inputs.some((i) => i.good === c.good)));
  const deals = w.contracts.filter((k) => k.sellerId === c.id || k.buyerId === c.id).length;
  return (
    <Card className="col-span-2 overflow-hidden">
      <IndustrialPark companies={[c, ...sisters]} flags={attention} focusId={c.id} onOpen={(id) => id !== c.id && push({ screen: 'company', id })} />
      <div className="px-3 py-2 text-xs text-muted border-t border-line">
        {sisters.length > 0 ? 'Gold conveyors link your own companies (tap one to open it). ' : ''}
        Grey roads bring supplies from the open market; the gold road carries what you sell{deals > 0 ? `, including ${deals} deal${deals > 1 ? 's' : ''}` : ''}.
      </div>
    </Card>
  );
}

function Overview({ c, w }: { c: Company; w: WorldState }) {
  const unit = GOODS[c.good].unit;
  const low = lowSupply(c);
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-2.5">
      {!c.bankrupt && <SiteCard c={c} w={w} />}
      {!c.bankrupt && c.isPlayer && <div className="col-span-2 -mt-3"><ShortageNote w={w} good={c.good} mine={c} /></div>}
      {!c.bankrupt && c.isPlayer && <RunningCard c={c} w={w} />}
      {!c.bankrupt && c.isPlayer && <SplitCard c={c} w={w} />}
      <Cutaway c={c} />
      <div className="space-y-2">
        <FloorCard title="Production">
          <Row label="Output" value={<Num explain={() => outputExplain(c)}>{Math.round(c.last.produced).toLocaleString()}</Num>} />
          <Row label="Capacity" value={usableCap(w, c) < c.capacity * 0.99 ? <span title={damageMult(w, c) < 1 ? c.damage!.cause : 'A supply shock limits output'}>{Math.round(usableCap(w, c)).toLocaleString()} <span className="text-red">of {Math.round(c.capacity).toLocaleString()}</span></span> : Math.round(c.capacity).toLocaleString()} />
          <Row label="Mood" value={<Mood v={c.morale} />} />
        </FloorCard>
        <FloorCard title="Office">
          <Row label="Brand" value={c.brand.toFixed(2)} />
          <Row label="Quality" value={c.quality.toFixed(2)} />
        </FloorCard>
        <FloorCard title="Storage">
          <Row label="Inventory" value={Math.round(c.inventory).toLocaleString()} />
          <Row label="Unit" value={unit} />
        </FloorCard>
      </div>
      <Card className="col-span-2 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Market share in {GOODS[c.good].name.toLowerCase()}</span>
          <span className="num font-bold">{fmtPct(c.last.marketShare)}</span>
        </div>
        <Progress className="mt-2" value={c.last.marketShare} tone="gold" />
        {c.isPlayer && c.last.marketShare > MONOPOLY_SHARE * 0.75 && (
          <p className={cx('mt-1 text-xs', c.last.marketShare > MONOPOLY_SHARE ? 'text-amber' : 'text-muted')}>
            {c.last.marketShare > MONOPOLY_SHARE
              ? `👑 Monopoly power: buyers switch away less when you raise prices. Antitrust risk about ${fmtPct(probeChance(c), 0)} a month.`
              : `Above ${fmtPct(MONOPOLY_SHARE, 0)} share you get monopoly power (and government attention).`}
          </p>
        )}
        {c.isPlayer && activeWar(w, c) && <p className="mt-1 text-xs text-red font-semibold">⚔️ In a price war. See Deals & Strategies.</p>}
        <div className="flex items-center justify-between text-sm mt-3">
          <span className="text-muted">Plant used (sold ÷ capacity)</span>
          <span className="num font-bold">{fmtPct(c.last.sold / Math.max(1, c.capacity), 0)}</span>
        </div>
        <Progress className="mt-2" value={c.last.sold / Math.max(1, c.capacity)} tone="blue" />
        <p className="mt-1 text-xs text-muted">
          {c.last.sold >= c.capacity * 0.95
            ? 'Sold out: you sell everything the plant can make.'
            : c.last.sold >= c.capacity * 0.8
              ? 'Healthy: a little spare room in the plant.'
              : 'Lots of idle capacity: buyers are going to rivals or the market is crowded.'}
        </p>
        {c.isPlayer && (
          <div className="flex items-center justify-between text-sm mt-3">
            <span className="text-muted">Estimated value{playerPct(w, c) < 0.999 ? ` (yours: ${fmtPct(playerPct(w, c), 0)})` : ''}</span>
            <Num explain={() => companyValueExplain(c)} className="font-bold">{fmtMoney(companyValue(c))}</Num>
          </div>
        )}
        {c.last.demand > c.capacity * 1.05 && <p className="mt-3 text-sm text-amber">Customers want {Math.round(c.last.demand).toLocaleString()} {unit}/day but you can make {Math.round(c.capacity).toLocaleString()}. Upgrading adds capacity.</p>}
        {damageMult(w, c) < 1 && <p className="mt-3 text-sm text-red">{c.damage!.cause}: output is limited to {fmtPct(c.damage!.mult, 0)} of capacity for {c.damage!.untilDay - w.day} more day{c.damage!.untilDay - w.day === 1 ? '' : 's'}.</p>}
        {low.map((x) => <p key={x.good} className="mt-2 text-sm text-amber">Only {x.days.toFixed(1)} days of {GOODS[x.good].name.toLowerCase()} left. See Supply & Deals.</p>)}
        {importedMuch(c) && <p className="mt-2 text-sm text-amber">Some materials had to be imported at a premium today.</p>}
      </Card>
    </div>
  );
}

function FloorCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="px-3 py-1.5">
      <div className="text-xs font-bold uppercase tracking-wider text-gold pt-1">{title}</div>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  );
}

const PNL: [keyof DayResult, string, boolean][] = [
  ['revenue', 'Revenue', false], ['cogs', 'Cost of goods sold', true], ['grossProfit', 'Gross profit', false],
  ['opex', 'Operating expenses', true], ['interestIncome', 'Interest earned on loans', false], ['fundingCost', 'Deposit funding cost', true], ['loanLosses', 'Provisions for bad loans', true], ['operatingProfit', 'Operating profit (EBITDA)', false], ['interest', 'Interest', true],
  ['tax', 'Tax', true], ['netIncome', 'Net profit', false],
];

function Financials({ c }: { c: Company }) {
  const dispatch = useGame((s) => s.dispatch);
  const playerCash = useGame((s) => s.world!.player.cash);
  const r = c.sum30;
  const q = c.quarters.slice(-4);
  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="text-sm font-bold mb-1">Last ~30 days</div>
        <div className="divide-y divide-line">
          {PNL.filter(([k]) => !['interestIncome', 'fundingCost', 'loanLosses'].includes(k) || isBank(c)).map(([k, label, neg]) => (
            <div key={k} className="flex items-center justify-between py-2 text-sm">
              <span className={neg ? 'text-muted' : 'font-semibold'}>{label}</span>
              <Num explain={() => pnlExplain(c, '30d')} className={cx(!neg && 'font-semibold', r[k] < 0 && 'text-red')}>{neg ? '-' : ''}{fmtMoney((r[k] as number) ?? 0)}</Num>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-3">
        <div className="text-sm font-bold mb-2">Quarterly revenue</div>
        {q.length ? <Bars data={q.map((x) => x.revenue)} labels={q.map((x) => x.label.split(' ')[0])} /> : <p className="text-sm text-dim">First quarter closes on day 90.</p>}
      </Card>
      <Card className="p-3">
        <div className="text-sm font-bold mb-2">Daily net income</div>
        <LineChart data={c.hist.map((h) => h.net)} height={100} />
      </Card>
      <Card className="p-3">
        <div className="text-sm font-bold">Balance sheet</div>
        <div className="divide-y divide-line">
          <Row label="Cash" value={fmtMoney(c.cash)} />
          <Row label="Debt" value={fmtMoney(c.debt)} tone={c.debt > 0 ? 'bad' : undefined} />
          <Row label="Credit limit" value={fmtMoney(creditLimit(c))} />
          {c.debt > 0 && c.isPlayer && <DebtNote c={c} />}
          {(c.lockedCapital ?? 0) > 0 && <Row label="Required bank capital (locked)" value={fmtMoney(c.lockedCapital!)} />}
          <Row label="Fixed assets" value={fmtMoney(c.assets)} />
        </div>
        {c.isPlayer && !c.bankrupt && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button variant="dark" size="sm" onClick={() => dispatch({ type: 'borrow', companyId: c.id, amount: Math.max(10_000, c.sum30.revenue * 0.25) })}>Borrow</Button>
            <Button variant="dark" size="sm" disabled={c.debt <= 0} onClick={() => dispatch({ type: 'repay', companyId: c.id, amount: c.debt })}>Repay</Button>
            <Button variant="dark" size="sm" disabled={playerCash <= 0} onClick={() => dispatch({ type: 'transfer', companyId: c.id, amount: Math.min(playerCash, Math.max(10_000, playerCash * 0.25)) })}>Invest 25% of cash</Button>
            <Button variant="dark" size="sm" disabled={c.cash <= c.automation.minCash + (c.lockedCapital ?? 0) || !!c.ticker || outsidePct(c) > 0} onClick={() => dispatch({ type: 'transfer', companyId: c.id, amount: -(c.cash - c.automation.minCash - (c.lockedCapital ?? 0)) })}>Withdraw spare</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

const WHY: Record<string, string> = {
  materials: 'to buy materials when cash ran short',
  hiring: 'to hire staff (auto-recruit)',
  'cash buffer': 'to keep the minimum cash buffer',
  repairs: 'for repairs and unexpected bills',
  'you borrowed': 'when you tapped Borrow',
  expansion: 'to expand',
};

/** Why this company owes money: the credit line is drawn automatically when cash runs out. */
function DebtNote({ c }: { c: Company }) {
  const log = c.loanLog ?? [];
  const sums = new Map<string, number>();
  for (const x of log) sums.set(x.reason, (sums.get(x.reason) ?? 0) + x.amount);
  return (
    <div className="py-2 text-xs text-muted leading-relaxed">
      <p>
        You don't have to take a loan yourself: when the company runs out of cash, it draws on its credit line automatically to keep running.
        {sums.size > 0 && <> Recently it borrowed {[...sums].map(([k, v], i) => <span key={k}>{i > 0 ? ', ' : ''}<b className="text-text">{fmtMoney(v)}</b> {WHY[k] ?? k}</span>)}.</>}
      </p>
      <p className="mt-1">
        {c.automation.autoRepay !== false
          ? `It pays the loan back by itself once it holds more than ${fmtMoney(repayBuffer(c))} (its buffer plus about 5 days of spending), before paying you dividends.`
          : 'Auto-repay is off (Automation tab), so the loan stays until you tap Repay.'}
        {' '}Paying high dividends or keeping a big stock of materials leaves less cash and causes more borrowing.
      </p>
    </div>
  );
}

function Operations({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const ref = refPrice(w, c.good);
  const ue = unitEconomics(w, c.good, { level: c.level, util: Math.max(0.2, c.last.sold / Math.max(1, c.capacity)), salaryMult: c.salaryMult, morale: c.morale, inputs: c.inputs });
  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="divide-y divide-line">
          <Row label="Your price" value={`${fmtPrice(ref * c.priceMult)} (${Math.round(c.priceMult * 100)}% of market)`} />
          <Row label="Market price" value={fmtPrice(ref)} />
          <Row label="Unit cost (at today's output)" value={fmtPrice(ue.total)} tone={ue.total > ref * c.priceMult ? 'bad' : undefined} />
          <Row label="  of which materials" value={fmtPrice(ue.materials)} />
          <Row label="Demand / day" value={Math.round(c.last.demand).toLocaleString()} />
          <Row label="Sold / day" value={<Num explain={() => outputExplain(c)}>{Math.round(c.last.sold).toLocaleString()}</Num>} />
          <Row label="Capacity / day" value={Math.round(c.capacity).toLocaleString()} />
        </div>
      </Card>
      {c.isPlayer && !c.bankrupt && (
        <Card className="p-3">
          <div className="text-sm font-bold mb-2">Budgets (% of revenue)</div>
          <Slider label="Marketing → brand" value={c.marketingPct * 100} min={0} max={15} step={0.5} suffix="%" onCommit={(v) => dispatch({ type: 'setSpend', companyId: c.id, marketingPct: v / 100, rdPct: c.rdPct })} />
          <Slider label="R&D → quality" value={c.rdPct * 100} min={0} max={15} step={0.5} suffix="%" onCommit={(v) => dispatch({ type: 'setSpend', companyId: c.id, marketingPct: c.marketingPct, rdPct: v / 100 })} />
          <p className="text-xs text-dim mt-1">Brand and quality move slowly toward what your budget supports. Marketing also wins new customers faster. Shoppers care about brands ({fmtPct(0.05, 0)} is typical); factories buying materials mostly compare price ({fmtPct(0.02, 0)}–{fmtPct(0.03, 0)} is plenty).</p>
        </Card>
      )}
      {c.isPlayer && !c.bankrupt && <CampaignCard c={c} w={w} />}
      {isRawMine(c) && !c.bankrupt && <ReservesCard c={c} />}
      {c.isPlayer && !c.bankrupt && <InsuranceCard c={c} w={w} />}
      {!c.isPlayer && <p className="text-sm text-muted">Last strategic move: <span className="text-text font-semibold">{c.aiLastAction}</span></p>}
    </div>
  );
}

function Employees({ c }: { c: Company }) {
  const dispatch = useGame((s) => s.dispatch);
  const def = INDUSTRIES[c.industry];
  return (
    <Card className="p-3">
      <div className="divide-y divide-line">
        <Row label="Staff" value={Math.round(c.workers).toLocaleString()} />
        <Row label="Needed for demand" value={workersForDemand(c).toLocaleString()} />
        <Row label="Output per worker / day" value={productivity(c).toFixed(1)} />
        <Row label="Salary vs market" value={`${Math.round(c.salaryMult * 100)}%`} />
        <Row label="Market salary / day" value={fmtMoney(def.salary)} />
        <Row label="Morale" value={<Mood v={c.morale} />} />
      </div>
      {c.isPlayer && !c.bankrupt && (
        <Slider
          label="Pay level"
          value={c.salaryMult * 100}
          min={60}
          max={180}
          step={5}
          suffix="%"
          onCommit={(v) => dispatch({ type: 'setSalary', companyId: c.id, salaryMult: v / 100 })}
        />
      )}
      <p className="text-xs text-dim mt-2">Low pay lifts margins briefly but lowers morale. Below 45% morale staff quit; below 30% they may strike.</p>
    </Card>
  );
}

function AutomationTab({ c }: { c: Company }) {
  const dispatch = useGame((s) => s.dispatch);
  const a = c.automation;
  const set = (patch: Partial<Company['automation']>) => dispatch({ type: 'setAutomation', companyId: c.id, automation: patch });
  return (
    <Card className="p-3 space-y-1">
      <Toggle label="Auto-recruit to meet demand" checked={a.autoRecruit} onChange={(v) => set({ autoRecruit: v })} />
      <Toggle label="Auto-upgrade when sold out" checked={a.autoUpgrade} onChange={(v) => set({ autoUpgrade: v })} />
      <DownsizeRow c={c} />
      <Toggle label="Repay loans from spare cash first" checked={a.autoRepay !== false} onChange={(v) => set({ autoRepay: v })} />
      <Slider label="Dividends to you (of daily profit)" value={a.dividendPct} min={0} max={100} step={5} suffix="%" onCommit={(v) => set({ dividendPct: v })} />
      <Slider label="Inventory buffer (days of sales)" value={a.inventoryDays} min={0} max={3} step={0.1} onCommit={(v) => set({ inventoryDays: v })} />
      <WarehouseToggle c={c} on={!!a.toWarehouse} set={(v) => set({ toWarehouse: v })} />
      {isRawMine(c) && <Toggle label={`Explore for new reserves below ${Math.round(AUTO_EXPLORE_AT * 100)}%`} checked={a.autoExplore !== false} onChange={(v) => set({ autoExplore: v })} />}
      <Slider label="Minimum cash (borrows to keep it)" value={a.minCash} min={0} max={Math.max(100_000, c.sum30.revenue)} step={1000} money onCommit={(v) => set({ minCash: v })} />
    </Card>
  );
}

function ReservesCard({ c }: { c: Company }) {
  const dispatch = useGame((s) => s.dispatch);
  const r = reservesOf(c);
  const cost = exploreCost(c);
  const thin = r < THIN_RESERVES;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">⛏️ Reserves left</div>
        <div className={cx('text-sm font-bold tabular-nums', thin ? 'text-red' : r < 0.5 ? 'text-amber' : 'text-green')}>{Math.round(r * 100)}%</div>
      </div>
      <Progress className="mt-2" value={r} tone={thin ? 'red' : r < 0.5 ? 'amber' : 'green'} />
      <div className="divide-y divide-line mt-1">
        <Row label="Cost per unit to extract" value={`×${extractionMult(c).toFixed(2)}`} tone={extractionMult(c) > 1.2 ? 'bad' : undefined} />
        <Row label="Output limit" value={reserveCapMult(c) < 1 ? `${Math.round(reserveCapMult(c) * 100)}% of the plant` : 'None'} tone={reserveCapMult(c) < 1 ? 'bad' : undefined} />
        <Row label="Upkeep" value={`+${Math.round((RAW_UPKEEP - 1) * 100)}% on fixed costs`} />
      </div>
      <p className="text-xs text-dim mt-1">Every unit you dig, pump or harvest uses up the reserve. A full plant runs dry in about {Math.round(DEPLETION_DAYS / 365)} years. Below half, each unit costs more; below {Math.round(THIN_RESERVES * 100)}%, output falls.</p>
      <Button block size="sm" className="mt-2" disabled={r > 0.9 || c.cash < cost} onClick={() => dispatch({ type: 'explore', companyId: c.id })}>
        {r > 0.9 ? 'Reserves are nearly full' : `🔎 Explore for new reserves · ${fmtMoney(cost)}`}
      </Button>
      {r <= 0.9 && c.cash < cost && <p className="text-xs text-amber mt-1">The company has {fmtMoney(c.cash)}. Put money in from Financials, or let auto-explore pay (it can borrow).</p>}
    </Card>
  );
}

function InsuranceCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const on = !!c.insured;
  const yearly = (Math.max(0, c.assets) * PREMIUM_RATE);
  const last = w.play.disasters[w.play.disasters.length - 1];
  return (
    <Card className="p-3">
      <Toggle label={`🛡️ Disaster insurance · ${fmtMoney(yearly)} a year`} checked={on} onChange={(v) => dispatch({ type: 'setInsurance', companyId: c.id, on: v })} />
      <p className="text-xs text-dim">Pays {Math.round(COVER * 100)}% of repairs after earthquakes, floods, storms, wildfires, pandemics and fires. The premium is {fmtPct(PREMIUM_RATE, 1)} of the plant's value a year, added to fixed costs. Disasters are rare (about one every two or three years) and nobody can see them coming.{last ? ` The last one was a ${disasterInfo(last.kind).name.toLowerCase()} on day ${last.day}.` : ''}</p>
    </Card>
  );
}

function DownsizeRow({ c }: { c: Company }) {
  const dispatch = useGame((s) => s.dispatch);
  const [sure, setSure] = useState(false);
  if (c.level <= 1) return null;
  const util = c.sum30.sold / Math.max(1, c.capacity * 30);
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <b>Close a production line</b>
          <span className="block text-xs text-muted">Level {c.level} → {c.level - 1}: about 41% less capacity and 31% lower fixed costs. You sell some equipment. Plant used: {fmtPct(util, 0)}.</span>
        </div>
        <Button size="sm" variant={sure ? 'danger' : 'dark'} onClick={() => { if (sure) { void dispatch({ type: 'downsize', companyId: c.id }); setSure(false); } else setSure(true); }}>
          {sure ? 'Confirm' : 'Close'}
        </Button>
      </div>
      {sure && <p className="text-xs text-amber mt-1">Only worth it when the plant is much bigger than what you sell. Tap Confirm to close it.</p>}
    </div>
  );
}

function WarehouseToggle({ c, on, set }: { c: Company; on: boolean; set: (v: boolean) => void }) {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  if (!storable(c.good)) return <p className="text-xs text-dim py-2">{GOODS[c.good].name} cannot be stored in a warehouse.</p>;
  if (!unlocked(w, 'warehouse')) return <p className="text-xs text-dim py-2">🔒 Warehouses unlock at level {unlockLevel('warehouse')}: keep the plant running when its stock is full.</p>;
  if (!w.play.warehouses.length) return <button className="text-xs text-gold font-semibold py-2" onClick={() => push({ screen: 'strategy', tab: 'warehouses' })}>🏬 Build a warehouse to store extra output →</button>;
  const room = totalRoom(w, c.good);
  return (
    <div>
      <Toggle label="Send extra output to the warehouse" checked={on} onChange={set} />
      <p className="text-xs text-dim -mt-1 pb-1">The plant keeps running at full capacity (if it has workers and materials) and stores what it cannot sell. Room left: {Math.round(room).toLocaleString()} {GOODS[c.good].unit}.</p>
    </div>
  );
}

function CampaignCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const [size, setSize] = useState<CampaignSize>('m');
  const [weeks, setWeeks] = useState(4);
  if (!unlocked(w, 'campaigns')) return <Card className="p-3 text-sm text-dim">🔒 Brand campaigns unlock at level {unlockLevel('campaigns')}.</Card>;
  const running = w.play.campaigns.find((x) => x.companyId === c.id && !x.done);
  const last = [...w.play.campaigns].reverse().find((x) => x.companyId === c.id && x.done);
  const cost = campaignCost(c, size, weeks);
  const fat = campaignFatigue(w, c);
  return (
    <Card className="p-3">
      <div className="text-sm font-bold mb-1">📣 Brand campaign</div>
      {running ? (
        <>
          <Row label={w.day <= running.end ? 'Running' : 'Fading out'} value={`day ${Math.max(0, w.day - running.start + 1)} of ${running.end - running.start + 1 + CAMPAIGN_FADE}`} />
          <Row label="Extra appeal today" value={`+${fmtPct(campaignMult(w, c) - 1, 0)}`} tone="good" />
          <Row label="Sales so far vs before" value={`${fmtMoney(running.rev)} vs ${fmtMoney(running.baseRev * Math.max(1, w.day - running.start + 1))}`} />
          <Progress value={(w.day - running.start + 1) / (running.end - running.start + 1 + CAMPAIGN_FADE)} height={6} tone="gold" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(['s', 'm', 'l'] as CampaignSize[]).map((k) => (
              <button key={k} onClick={() => setSize(k)} className={cx('rounded-lg border p-2 text-center', size === k ? 'bg-gold text-gold-ink border-gold-edge' : 'bg-card-2 border-line')}>
                <div className="font-bold text-sm">{CAMPAIGN[k].label}</div>
                <div className="text-xs">+{Math.round(CAMPAIGN[k].lift * fat * 100)}% appeal</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            {[2, 4, 8].map((n) => (
              <button key={n} onClick={() => setWeeks(n)} className={cx('flex-1 h-9 rounded-lg border text-sm font-semibold', weeks === n ? 'bg-gold text-gold-ink border-gold-edge' : 'bg-card-2 border-line text-muted')}>{n} weeks</button>
            ))}
          </div>
          {fat < 1 && <p className="text-xs text-amber mt-2">Buyers are tired of your ads: campaigns work {fmtPct(1 - fat, 0)} less right after another one.</p>}
          <Button block size="sm" className="mt-2" disabled={c.cash < cost} onClick={() => dispatch({ type: 'startCampaign', companyId: c.id, size, weeks })}>Launch · {fmtMoney(cost)} from company cash</Button>
          <p className="text-xs text-dim mt-1">Demand rises during the campaign, then fades over {CAMPAIGN_FADE} days. A little brand stays for good.</p>
        </>
      )}
      {last && !running && (() => {
        const r = campaignResult(c, last);
        return <div className={cx('mt-2 rounded-lg border p-2 text-sm', r.great ? 'border-green/60 bg-green/5' : 'border-line')}>{r.great ? '⭐ Great value! ' : 'Last campaign: '}{fmtMoney(r.extra)} extra sales (≈{fmtMoney(r.profit)} profit) for {fmtMoney(last.cost)}.</div>;
      })()}
    </Card>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between min-h-tap gap-3 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative w-12 h-7 rounded-full border transition-colors', checked ? 'bg-gold border-gold-edge' : 'bg-bg border-line-strong')}
      >
        <span className={cx('absolute top-0.5 size-5.5 rounded-full bg-text transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Slider({ label, value, min, max, step, suffix = '', money, onCommit }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; money?: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState<number | null>(null);
  const shown = v ?? value;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="num font-semibold">{money ? fmtMoney(shown) : `${+shown.toFixed(1)}${suffix}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v != null && (onCommit(v), setV(null))}
        onKeyUp={() => v != null && (onCommit(v), setV(null))}
        className="w-full h-tap accent-[var(--color-gold)]"
      />
    </div>
  );
}

function HireSheet({ c, onClose }: { c: Company; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const need = workersForDemand(c) - Math.round(c.workers);
  const [n, setN] = useState(Math.max(1, need));
  const cost = n * INDUSTRIES[c.industry].salary * 5;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Hire at ${c.name}`}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="dark" onClick={() => dispatch({ type: 'hire', companyId: c.id, count: -n }).then(onClose)}>Lay off {n}</Button>
          <Button onClick={() => dispatch({ type: 'hire', companyId: c.id, count: n }).then((r) => r.ok && onClose())}>Hire {n} · {fmtMoney(cost)}</Button>
        </div>
      }
    >
      <p className="text-sm text-muted">Staff now: <b className="text-text">{Math.round(c.workers)}</b>. Needed for current demand: <b className="text-text">{workersForDemand(c)}</b>.</p>
      <div className="flex items-center gap-2 mt-4">
        <Button variant="dark" onClick={() => setN(Math.max(1, n - 10))}>-10</Button>
        <Button variant="dark" onClick={() => setN(Math.max(1, n - 1))}>-1</Button>
        <input type="number" min={1} value={n} onChange={(e) => setN(Math.max(1, Math.round(Number(e.target.value) || 1)))} className="num flex-1 min-w-0 min-h-tap rounded-lg bg-bg border border-line-strong text-center text-lg" aria-label="Number of staff" />
        <Button variant="dark" onClick={() => setN(n + 1)}>+1</Button>
        <Button variant="dark" onClick={() => setN(n + 10)}>+10</Button>
      </div>
      <p className="text-xs text-dim mt-3">Hiring costs about five days' salary per person (recruiting and training), paid from company cash.</p>
    </BottomSheet>
  );
}

function WarWarning({ c, w, pm }: { c: Company; w: WorldState; pm: number }) {
  if (pm > WAR_PRICE || activeWar(w, c)) return null;
  const t = warTarget(w, c);
  const rv = t && w.rivals.find((r) => r.id === t.ownerId);
  if (!t || !rv) return null;
  if (!unlocked(w, 'wars')) return <p className="mt-3 text-xs text-dim">Price wars unlock at level {unlockLevel('wars')}.</p>;
  return (
    <div className="mt-3 rounded-lg border border-red/60 bg-red-dim/40 p-2.5 text-sm">
      ⚔️ <b>{rv.name} may answer this.</b> A price this low starts a price war with {t.name} ({fmtPct(t.last.marketShare, 0)} of the market). They could match you or cut even deeper. Whoever runs out of cash first loses.
    </div>
  );
}

function PriceSheet({ c, w, onClose }: { c: Company; w: WorldState; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const [pm, setPm] = useState(c.priceMult);
  const ref = refPrice(w, c.good);
  const vc = unitEconomics(w, c.good, { level: c.level, util: 0.85, salaryMult: c.salaryMult, morale: c.morale, inputs: c.inputs }).total;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Set price"
      footer={<Button block size="lg" onClick={() => dispatch({ type: 'setPrice', companyId: c.id, priceMult: pm }).then(onClose)}>Set {fmtPrice(ref * pm)}</Button>}
    >
      <div className="text-center">
        <div className="num text-3xl font-bold">{fmtPrice(ref * pm)}</div>
        <div className="text-sm text-muted">{Math.round(pm * 100)}% of the market price {fmtPrice(ref)}</div>
      </div>
      <input type="range" min={0.5} max={maxPriceMult(c.good)} step={0.01} value={pm} onChange={(e) => setPm(Number(e.target.value))} className="w-full h-tap mt-4 accent-[var(--color-gold)]" aria-label="Price" />
      {GOODS[c.good].reg && <p className="text-xs text-muted mt-1">Regulated: the government caps your price at the market price.</p>}
      <div className="divide-y divide-line mt-2">
        <Row label="Unit cost (near full output)" value={fmtPrice(vc)} />
        <Row label="Margin per unit" value={fmtPrice(ref * pm - vc)} tone={ref * pm - vc > 0 ? 'good' : 'bad'} />
      </div>
      <WarWarning c={c} w={w} pm={pm} />
      <p className="text-xs text-dim mt-3">{GOODS[c.good].tier === 'product' ? 'Shoppers compare price, brand and quality.' : 'Business buyers mostly compare price, and will import if everyone is too expensive.'} Pricing above the market costs you share; below it wins share but earns less per sale.</p>
    </BottomSheet>
  );
}
