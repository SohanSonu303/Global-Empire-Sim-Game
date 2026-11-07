import { useState, type ReactNode } from 'react';
import { useGame, type StrategyTab } from '../../store/game';
import { GOODS, GOOD_IDS } from '../../engine/data';
import { refPrice } from '../../engine/company';
import { fmtMoney, fmtPct, fmtPrice } from '../../engine/news';
import { unlockLevel, unlocked, type UnlockKey } from '../../engine/rewards';
import { tenderScore } from '../../engine/strategy';
import {
  MAX_WAREHOUSE_LEVEL, buildCost, dailyCost, premiumPrice, rivalBuyers, roomFor, spaceOf, spacePer, spoilRate, storable, upgradeCostOf, usedSpace,
} from '../../engine/warehouse';
import type { GoodId, Job, Tender, Warehouse, WorldState } from '../../engine/types';
import { Badge, Button, Card, Chips, Progress, Screen, SectionTitle, cx } from '../components/core';
import { SubHeader } from './More';
import { Row, Slider } from './Company';
import { GoodThumb } from '../art/plants';

const TABS: { id: StrategyTab; label: string; key: UnlockKey }[] = [
  { id: 'contracts', label: '📋 Contracts', key: 'contracts' },
  { id: 'tenders', label: '🏛️ Tenders', key: 'tenders' },
  { id: 'warehouses', label: '🏬 Warehouses', key: 'warehouse' },
  { id: 'wars', label: '⚔️ Price wars', key: 'wars' },
  { id: 'tips', label: '🤫 Tips', key: 'tips' },
];

export function StrategyScreen({ tab: initial }: { tab?: StrategyTab }) {
  const w = useGame((s) => s.world)!;
  const [tab, setTab] = useState<StrategyTab>(initial ?? 'contracts');
  const t = TABS.find((x) => x.id === tab)!;
  return (
    <div>
      <SubHeader title="Deals & Strategies" sub="Ways to win beyond making things" />
      <Screen>
        <div className="mt-3"><Chips items={TABS.map((x) => ({ id: x.id, label: x.label }))} value={tab} onChange={setTab} /></div>
        {!unlocked(w, t.key) ? <Locked w={w} k={t.key} /> : (
          <div className="mt-2">
            {tab === 'contracts' && <Contracts w={w} />}
            {tab === 'tenders' && <Tenders w={w} />}
            {tab === 'warehouses' && <Warehouses w={w} />}
            {tab === 'wars' && <Wars w={w} />}
            {tab === 'tips' && <Tips w={w} />}
          </div>
        )}
      </Screen>
    </div>
  );
}

function Locked({ w, k }: { w: WorldState; k: UnlockKey }) {
  const lvl = unlockLevel(k);
  return (
    <Card className="mt-3 p-5 text-center">
      <div className="text-4xl">🔒</div>
      <div className="font-bold text-lg mt-2">Unlocks at level {lvl}</div>
      <p className="text-sm text-muted mt-1">You are level {w.player.level}. Earn XP from goals, records, contracts and good monthly reports.</p>
      <div className="mt-3"><Progress value={w.player.level / lvl} tone="gold" /></div>
    </Card>
  );
}

const makers = (w: WorldState, g: GoodId) => w.companies.filter((c) => c.isPlayer && !c.bankrupt && c.good === g);
const days = (w: WorldState, d: number) => Math.max(0, d - w.day);

// ---------- contracts ----------

function Contracts({ w }: { w: WorldState }) {
  const jobs = w.play.jobs.filter((j) => j.source !== 'tender' || j.status !== 'offer');
  const active = jobs.filter((j) => j.status === 'active');
  const offers = jobs.filter((j) => j.status === 'offer');
  const past = jobs.filter((j) => j.status === 'done' || j.status === 'failed').slice(-5).reverse();
  return (
    <>
      <Intro>Deliver a quantity by a deadline for a fixed price above market. Finish early for a bonus; miss it and you pay a penalty. Deliveries come out of your stock before normal sales, then from your warehouses.</Intro>
      {active.length > 0 && <SectionTitle>Active</SectionTitle>}
      <div className="space-y-2">{active.map((j) => <JobCard key={j.id} w={w} j={j} />)}</div>
      <SectionTitle>Offers</SectionTitle>
      {offers.length === 0 && <Card className="p-3 text-sm text-muted">No offers right now. New ones arrive every few days.</Card>}
      <div className="space-y-2">{offers.map((j) => <JobCard key={j.id} w={w} j={j} />)}</div>
      {past.length > 0 && <SectionTitle>Recent</SectionTitle>}
      <div className="space-y-2">{past.map((j) => <JobCard key={j.id} w={w} j={j} />)}</div>
    </>
  );
}

function JobCard({ w, j }: { w: WorldState; j: Job }) {
  const dispatch = useGame((s) => s.dispatch);
  const def = GOODS[j.good];
  const unit = j.pay / j.qty;
  const vsMarket = unit / refPrice(w, j.good) - 1;
  const cos = makers(w, j.good);
  const [pick, setPick] = useState(cos[0]?.id ?? '');
  const dailyCap = cos.reduce((s, c) => s + c.capacity, 0);
  const need = j.qty / j.days;
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold">{j.buyerName} {j.source === 'gov' && <Badge tone="gold">Government</Badge>} {j.source === 'tender' && <Badge tone="gold">Tender</Badge>}</div>
          <div className="text-sm">{j.qty.toLocaleString()} {def.unit} of {def.name.toLowerCase()} in {j.days} days</div>
        </div>
        <div className="text-right">
          <div className="num font-bold text-green">{fmtMoney(j.pay)}</div>
          <div className={cx('text-xs font-semibold', vsMarket >= 0 ? 'text-green' : 'text-red')}>{fmtPrice(unit)}/{def.unit} · {vsMarket >= 0 ? '+' : ''}{fmtPct(vsMarket, 0)} vs market</div>
        </div>
      </div>
      {j.status === 'active' && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted"><span>{Math.round(j.delivered).toLocaleString()} / {j.qty.toLocaleString()} delivered</span><span>{days(w, j.deadline)} days left</span></div>
          <Progress value={j.delivered / j.qty} height={8} tone={j.delivered / j.qty >= (w.day - j.startDay) / j.days ? 'green' : 'amber'} />
          {j.bonus > 0 && <div className="text-xs text-dim mt-1">Bonus {fmtMoney(j.bonus)} if done by day {Math.floor(j.startDay + j.days * 0.75)} · penalty {fmtMoney(j.penalty)} if late</div>}
        </div>
      )}
      {j.status === 'offer' && (
        <div className="mt-2">
          <div className="text-xs text-muted">Needs about {Math.round(need).toLocaleString()} {def.unit}/day · bonus {fmtMoney(j.bonus)} if early · penalty {fmtMoney(j.penalty)} · offer ends in {days(w, j.offerUntil)} days</div>
          {cos.length === 0 ? (
            <div className="text-xs text-amber mt-2">You need a company that makes {def.name.toLowerCase()} to take this.</div>
          ) : (
            <div className="flex gap-2 mt-2">
              {cos.length > 1 && (
                <select className="flex-1 min-w-0 rounded-lg bg-card-2 border border-line px-2 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
                  {cos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <Button size="sm" className="flex-1" onClick={() => dispatch({ type: 'acceptJob', jobId: j.id, companyId: pick })}>Accept</Button>
            </div>
          )}
          {cos.length > 0 && need > dailyCap * 0.8 && <div className="text-xs text-amber mt-1">That is {fmtPct(need / dailyCap, 0)} of your daily capacity: it will eat into normal sales.</div>}
        </div>
      )}
      {(j.status === 'done' || j.status === 'failed') && (
        <div className={cx('text-sm font-semibold mt-1', j.status === 'done' ? 'text-green' : 'text-red')}>{j.status === 'done' ? (j.early ? '✅ Done early, bonus paid' : '✅ Delivered') : '❌ Missed: penalty paid'}</div>
      )}
    </Card>
  );
}

// ---------- tenders ----------

function Tenders({ w }: { w: WorldState }) {
  const open = w.play.tenders.filter((t) => t.status === 'open');
  const past = w.play.tenders.filter((t) => t.status !== 'open').slice(-5).reverse();
  return (
    <>
      <Intro>The government buys big amounts over several months. Send a price per unit: the lowest price wins, but better quality counts too. Winning gives you a guaranteed buyer; a short delivery costs a penalty.</Intro>
      <SectionTitle>Open tenders</SectionTitle>
      {open.length === 0 && <Card className="p-3 text-sm text-muted">No open tenders. More come when the economy slows down.</Card>}
      <div className="space-y-2">{open.map((t) => <TenderCard key={t.id} w={w} t={t} />)}</div>
      {past.length > 0 && <SectionTitle>Results</SectionTitle>}
      <div className="space-y-2">
        {past.map((t) => (
          <Card key={t.id} className="p-3 text-sm flex items-center gap-2">
            <span className="text-xl">{t.status === 'won' ? '🏆' : t.status === 'lost' ? '❌' : '📁'}</span>
            <div className="flex-1 min-w-0"><div className="font-semibold">{t.buyer} · {GOODS[t.good].name}</div><div className="text-xs text-muted">Won by {t.winner ?? 'nobody'}{t.winPrice ? ` at ${fmtPrice(t.winPrice)}` : ''}</div></div>
          </Card>
        ))}
      </div>
    </>
  );
}

function TenderCard({ w, t }: { w: WorldState; t: Tender }) {
  const dispatch = useGame((s) => s.dispatch);
  const def = GOODS[t.good];
  const cos = makers(w, t.good);
  const co = cos[0];
  const [mult, setMult] = useState(t.mine ? t.mine.price / t.ref : 0.95);
  const price = t.ref * mult;
  const cost = co?.last.unitMaterialCost ?? 0;
  const myScore = co ? tenderScore(t, price, co.quality) : 9;
  const rank = 1 + t.bids.filter((b) => tenderScore(t, b.price, b.quality) < myScore).length;
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-bold">{t.buyer}</div>
          <div className="text-sm">{t.qtyPerMonth.toLocaleString()} {def.unit} of {def.name.toLowerCase()} a month for {t.months} months</div>
          <div className="text-xs text-muted">Worth about {fmtMoney(t.qtyPerMonth * t.months * t.ref)} · closes in {days(w, t.closes)} days · {t.bids.length} rival bid{t.bids.length === 1 ? '' : 's'}</div>
        </div>
        {t.mine && <Badge tone="good">Bid sent</Badge>}
      </div>
      {!co ? <div className="text-xs text-amber mt-2">You need a company that makes {def.name.toLowerCase()} to bid.</div> : (
        <>
          <Slider label="Your price (% of market)" value={Math.round(mult * 100)} min={60} max={130} step={1} suffix="%" onCommit={(v) => setMult(v / 100)} />
          <Row label="Price per unit" value={`${fmtPrice(price)} (your cost ${fmtPrice(cost)})`} tone={price > cost ? 'good' : 'bad'} />
          <Row label="Your chance" value={rank === 1 ? 'Leading (rival bids are sealed, but this would win today)' : `About #${rank} of ${t.bids.length + 1}`} tone={rank === 1 ? 'good' : undefined} />
          <Button block size="sm" className="mt-1" onClick={() => dispatch({ type: 'bidTender', tenderId: t.id, companyId: co.id, price })}>{t.mine ? 'Change bid' : 'Send bid'}</Button>
        </>
      )}
    </Card>
  );
}

// ---------- warehouses ----------

function Warehouses({ w }: { w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const cost = buildCost(w);
  return (
    <>
      <Intro>Store extra output, or stock you buy from the market, and sell it later when prices are higher. Storage costs money every day and food, grain and cotton spoil. Electricity and services cannot be stored.</Intro>
      <div className="space-y-2 mt-2">{w.play.warehouses.map((wh) => <WarehouseCard key={wh.id} w={w} wh={wh} />)}</div>
      <Button block className="mt-3" disabled={w.player.cash < cost} onClick={() => dispatch({ type: 'buildWarehouse' })}>🏗️ Build {w.play.warehouses.length ? 'another' : 'a'} warehouse · {fmtMoney(cost)}</Button>
      <p className="text-xs text-dim mt-2">Each new warehouse costs more than the last. Turn on "Send extra output to the warehouse" in a company's Automation tab.</p>
    </>
  );
}

function WarehouseCard({ w, wh }: { w: WorldState; wh: Warehouse }) {
  const dispatch = useGame((s) => s.dispatch);
  const [sel, setSel] = useState<GoodId | null>(null);
  const total = spaceOf(wh);
  const used = usedSpace(wh);
  const value = GOOD_IDS.reduce((s, g) => s + (wh.stock[g]?.qty ?? 0) * refPrice(w, g), 0);
  const upCost = upgradeCostOf(wh);
  // Every product you make, plus anything else stored or being bought here
  const made = [...new Set(w.companies.filter((c) => c.isPlayer && !c.bankrupt).map((c) => c.good))];
  const extra = GOOD_IDS.filter((g) => !made.includes(g) && ((wh.stock[g]?.qty ?? 0) > 0.5 || w.play.buyOrders.some((o) => o.warehouseId === wh.id && o.good === g)));
  const tiles = [...made.filter(storable), ...extra];
  const blocked = made.filter((g) => !storable(g));
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center size-12 rounded-xl bg-card-2 border border-line text-3xl">🏬</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg leading-tight">{wh.name}</div>
          <div className="text-xs text-muted">Level {wh.level} of {MAX_WAREHOUSE_LEVEL} · stock worth {fmtMoney(value)} · {fmtMoney(dailyCost(w, wh))}/day</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs"><span className="text-muted">Space used</span><span className="num font-semibold">{fmtPct(used / total, 0)}</span></div>
        <Progress value={used / total} height={10} tone={used / total > 0.9 ? 'red' : 'gold'} />
        <p className="text-[11px] text-dim mt-1">All products share this space. Each one also has its own limit, so one product cannot fill the whole warehouse.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {tiles.map((g) => (
          <StockTile key={g} w={w} wh={wh} g={g} active={sel === g} onClick={() => setSel(sel === g ? null : g)} />
        ))}
        {blocked.map((g) => (
          <div key={g} className="rounded-xl border border-line bg-card-2/50 p-2 opacity-60">
            <div className="flex items-center gap-2">
              <GoodThumb good={g} size={36} />
              <div className="min-w-0"><div className="text-sm font-semibold truncate">{GOODS[g].name}</div><div className="text-[11px] text-dim">Can't be stored</div></div>
            </div>
          </div>
        ))}
      </div>
      {tiles.length === 0 && <p className="text-sm text-muted mt-2">Nothing to store yet. Found a company that makes goods, or buy stock from the market.</p>}
      {sel && <StockPanel w={w} wh={wh} g={sel} />}

      <BuyPanel w={w} wh={wh} />
      <Button block size="sm" variant="dark" className="mt-2" disabled={wh.level >= MAX_WAREHOUSE_LEVEL || w.player.cash < upCost} onClick={() => dispatch({ type: 'upgradeWarehouse', id: wh.id })}>
        {wh.level >= MAX_WAREHOUSE_LEVEL ? 'Top level' : `⬆ Upgrade to level ${wh.level + 1} (+60% space for every product) · ${fmtMoney(upCost)}`}
      </Button>
    </Card>
  );
}

/** Most units of a product this warehouse can hold (its own limit, if the rest were empty). */
function maxUnits(wh: Warehouse, g: GoodId): number {
  return (spaceOf(wh) * (wh.limits[g] ?? 1)) / spacePer(g);
}

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : Math.round(n).toLocaleString());

function StockTile({ w, wh, g, active, onClick }: { w: WorldState; wh: Warehouse; g: GoodId; active: boolean; onClick: () => void }) {
  const qty = wh.stock[g]?.qty ?? 0;
  const max = maxUnits(wh, g);
  const room = roomFor(wh, g);
  const cos = makers(w, g);
  const auto = cos.some((c) => c.automation.toWarehouse);
  const buying = w.play.buyOrders.some((o) => o.warehouseId === wh.id && o.good === g);
  const full = room < 1;
  return (
    <button onClick={onClick} className={cx('rounded-xl border p-2 text-left transition-colors', active ? 'border-gold bg-gold/10' : 'border-line bg-card-2 hover:border-line-strong')}>
      <div className="flex items-center gap-2">
        <GoodThumb good={g} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{GOODS[g].name}</div>
          <div className="text-[11px] text-muted truncate">{auto ? '🔄 auto-storing' : buying ? '🛒 buying' : cos.length ? 'auto-store off' : 'bought stock'}</div>
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="num text-lg font-black">{compact(qty)}</span>
        <span className="num text-xs text-muted">/ {compact(max)} {GOODS[g].unit}</span>
      </div>
      <Progress value={max > 0 ? qty / max : 0} height={6} tone={full ? 'red' : qty / Math.max(1, max) > 0.75 ? 'amber' : 'green'} />
      {full && qty < max * 0.98 && <div className="text-[10px] text-red mt-0.5">Warehouse full</div>}
    </button>
  );
}

function StockPanel({ w, wh, g }: { w: WorldState; wh: Warehouse; g: GoodId }) {
  const dispatch = useGame((s) => s.dispatch);
  const st = wh.stock[g];
  const rule = wh.rules[g];
  const limit = wh.limits[g] ?? 1;
  const squeeze = unlocked(w, 'squeeze');
  const buyers = squeeze ? rivalBuyers(w, g) : [];
  const cos = makers(w, g);
  const own = cos[0];
  const auto = cos.some((c) => c.automation.toWarehouse);
  const now = refPrice(w, g);
  const gain = st ? st.qty * (now - st.cost) : 0;
  return (
    <div className="mt-2 rounded-xl bg-card-2 border border-gold-edge/50 p-3 anim-fade">
      <div className="flex items-center gap-2">
        <GoodThumb good={g} size={44} />
        <div className="flex-1 min-w-0">
          <div className="font-bold">{GOODS[g].name}</div>
          <div className="text-xs text-muted">{st ? `${Math.round(st.qty).toLocaleString()} ${GOODS[g].unit} · paid ${fmtPrice(st.cost)} · now ${fmtPrice(now)}` : `Empty · market price ${fmtPrice(now)}`}{w.goods[g].tightness > 1.08 ? ' · 🔥 shortage' : ''}</div>
        </div>
        {st && <span className={cx('num text-sm font-bold', gain >= 0 ? 'text-green' : 'text-red')}>{gain >= 0 ? '+' : ''}{fmtMoney(gain)}</span>}
      </div>
      {cos.length > 0 && (
        <label className="flex items-center justify-between gap-2 mt-2 rounded-lg border border-line px-2.5 py-2 cursor-pointer">
          <span className="text-sm"><b>Store extra output</b><span className="block text-xs text-muted">{cos.map((c) => c.name).join(', ')} keep{cos.length === 1 ? 's' : ''} running at full capacity and send{cos.length === 1 ? 's' : ''} what {cos.length === 1 ? 'it' : 'they'} can't sell here</span></span>
          <input type="checkbox" className="size-5 accent-[var(--color-gold)]" checked={auto}
            onChange={(e) => cos.forEach((c) => dispatch({ type: 'setAutomation', companyId: c.id, automation: { toWarehouse: e.target.checked } }))} />
        </label>
      )}
      <Slider label={`Limit: up to ${Math.round(maxUnits(wh, g)).toLocaleString()} ${GOODS[g].unit} (share of space)`} value={Math.round(limit * 100)} min={10} max={100} step={5} suffix="%" onCommit={(v) => dispatch({ type: 'setWarehouseLimit', id: wh.id, good: g, share: v / 100 })} />
      <div className="text-xs text-muted">Loses {fmtPct(spoilRate(g), 2)} a day in storage. {own ? `Sold stock goes to ${own.name} to sell.` : 'You do not make this, so sold stock goes to traders at 95% of the market price.'}</div>
      {st && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[0.25, 0.5, 1].map((f) => (
            <Button key={f} size="sm" variant="dark" onClick={() => dispatch({ type: 'releaseStock', id: wh.id, good: g, qty: st.qty * f })}>Sell {f === 1 ? 'all' : `${f * 100}%`}</Button>
          ))}
        </div>
      )}
      <div className="text-sm font-semibold mt-1">Auto-sell</div>
      <div className="flex gap-2 mt-1 flex-wrap">
        {[undefined, 0.1, 0.2, 0.4].map((a) => (
          <button key={String(a)} onClick={() => dispatch({ type: 'setSellRule', id: wh.id, good: g, above: a, shortage: rule?.shortage })}
            className={cx('px-2.5 h-8 rounded-lg text-xs font-semibold border', rule?.above === a ? 'bg-gold text-gold-ink border-gold-edge' : 'bg-card border-line text-muted')}>
            {a === undefined ? 'Off' : `+${a * 100}% over cost`}
          </button>
        ))}
        <button disabled={!squeeze} onClick={() => dispatch({ type: 'setSellRule', id: wh.id, good: g, above: rule?.above, shortage: !rule?.shortage })}
          className={cx('px-2.5 h-8 rounded-lg text-xs font-semibold border disabled:opacity-40', rule?.shortage ? 'bg-gold text-gold-ink border-gold-edge' : 'bg-card border-line text-muted')}>
          🔥 On shortage{!squeeze && ' (lv 10)'}
        </button>
      </div>
      {squeeze && st && (
        <Button block size="sm" className="mt-2" disabled={!buyers.length} onClick={() => dispatch({ type: 'sellToRivals', id: wh.id, good: g, qty: st.qty })}>
          {buyers.length ? `🗜️ Sell to ${buyers.length} short rival${buyers.length > 1 ? 's' : ''} at ${fmtPrice(premiumPrice(w, g))}` : 'No rival is short of this right now'}
        </Button>
      )}
    </div>
  );
}

function BuyPanel({ w, wh }: { w: WorldState; wh: Warehouse }) {
  const dispatch = useGame((s) => s.dispatch);
  const [g, setG] = useState<GoodId>('iron_ore');
  const [perDay, setPerDay] = useState(100);
  const orders = w.play.buyOrders.filter((o) => o.warehouseId === wh.id);
  if (!unlocked(w, 'marketBuy')) return <div className="text-xs text-dim mt-2">🔒 Buying stock from the market unlocks at level {unlockLevel('marketBuy')}.</div>;
  const mk = w.goods[g];
  const daily = Math.max(1, mk.finalDemand + mk.b2bDemand);
  return (
    <div className="mt-2 rounded-lg border border-line p-2.5">
      <div className="text-sm font-semibold">🛒 Buy from the market</div>
      {orders.map((o) => (
        <div key={o.id} className="flex items-center justify-between text-xs py-1">
          <span>{GOODS[o.good].name}: up to {Math.round(o.perDay).toLocaleString()} {GOODS[o.good].unit}/day under {fmtPrice(o.maxPrice)}</span>
          <button className="text-red font-semibold" onClick={() => dispatch({ type: 'setBuyOrder', warehouseId: wh.id, good: o.good, perDay: 0, maxPrice: 0 })}>Stop</button>
        </div>
      ))}
      <div className="flex gap-2 mt-1">
        <select className="flex-1 min-w-0 rounded-lg bg-card-2 border border-line px-2 h-9 text-sm" value={g} onChange={(e) => setG(e.target.value as GoodId)}>
          {GOOD_IDS.filter(storable).map((x) => <option key={x} value={x}>{GOODS[x].name} · {fmtPrice(refPrice(w, x))}</option>)}
        </select>
      </div>
      <Slider label={`Per day (market uses ${Math.round(daily).toLocaleString()} ${GOODS[g].unit}/day)`} value={perDay} min={10} max={Math.max(100, Math.round(daily * 0.5 / 10) * 10)} step={10} onCommit={setPerDay} />
      <div className="text-xs text-muted">Costs about {fmtMoney(perDay * refPrice(w, g) * 1.03)}/day from your cash (3% fee). Big orders push the price up and take supply from rivals.</div>
      <Button block size="sm" className="mt-2" onClick={() => dispatch({ type: 'setBuyOrder', warehouseId: wh.id, good: g, perDay, maxPrice: refPrice(w, g) * 1.25 })}>Start buying (stop if price rises 25%)</Button>
    </div>
  );
}

// ---------- price wars ----------

function Wars({ w }: { w: WorldState }) {
  const push = useGame((s) => s.push);
  const dispatch = useGame((s) => s.dispatch);
  const wars = [...w.play.wars].reverse();
  return (
    <>
      <Intro>Set a company's price to 85% of the market or lower while a rival sells at least 10% of that market, and the rival answers: it matches you, cuts deeper, or backs off. Raise your price above 90% to stop. The side that runs out of cash first loses.</Intro>
      {wars.length === 0 && <Card className="p-3 text-sm text-muted mt-2">No price wars yet. Lower a price on a company's Overview tab to start one.</Card>}
      <div className="space-y-2 mt-2">
        {wars.map((x) => {
          const me = w.companies.find((c) => c.id === x.playerCoId);
          const them = w.companies.find((c) => c.id === x.rivalCoId);
          const rv = w.rivals.find((r) => r.id === x.rivalId);
          return (
            <Card key={x.id} className="p-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{x.status === 'active' ? '⚔️' : x.status === 'won' ? '🏆' : x.status === 'lost' ? '💀' : '🤝'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{GOODS[x.good].name}: {me?.name ?? 'you'} vs {them?.name ?? 'rival'}</div>
                  <div className="text-xs text-muted">{rv?.name} · {x.status === 'active' ? `${x.mode === 'undercut' ? 'cutting deeper' : x.mode === 'match' ? 'matching your price' : 'backing off'} · day ${w.day - x.start}` : x.status}</div>
                </div>
              </div>
              {me && them && (
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <Side name={me.name} share={me.last.marketShare} from={x.startShare} cash={me.cash} price={me.priceMult} good />
                  <Side name={them.name} share={them.last.marketShare} from={x.rivalStartShare} cash={them.cash} price={them.priceMult} />
                </div>
              )}
              {x.status === 'active' && (
                <div className="flex gap-2 mt-2">
                  {me && <Button size="sm" variant="dark" className="flex-1" onClick={() => push({ screen: 'company', id: me.id })}>Open {me.name}</Button>}
                  <Button size="sm" className="flex-1" onClick={() => dispatch({ type: 'endWar', warId: x.id })}>Raise price, stop</Button>
                </div>
              )}
              {x.cost > 0 && <div className="text-xs text-dim mt-1">Your losses so far: {fmtMoney(x.cost)}</div>}
            </Card>
          );
        })}
      </div>
      <MonopolyNote w={w} />
    </>
  );
}

function Side({ name, share, from, cash, price, good }: { name: string; share: number; from: number; cash: number; price: number; good?: boolean }) {
  return (
    <div className={cx('rounded-lg border p-2', good ? 'border-green/50 bg-green/5' : 'border-red/50 bg-red/5')}>
      <div className="font-semibold truncate">{name}</div>
      <div>Share {fmtPct(share, 1)} <span className={share >= from ? 'text-green' : 'text-red'}>({share >= from ? '+' : ''}{fmtPct(share - from, 1)})</span></div>
      <div>Price {Math.round(price * 100)}% · cash <span className={cash < 0 ? 'text-red' : ''}>{fmtMoney(cash)}</span></div>
    </div>
  );
}

function MonopolyNote({ w }: { w: WorldState }) {
  const big = w.companies.filter((c) => c.isPlayer && !c.bankrupt && c.last.marketShare > 0.3);
  return (
    <>
      <SectionTitle>Monopoly power</SectionTitle>
      <Card className="p-3 text-sm">
        <p className="text-muted">Sell more than 40% of a market and buyers find it harder to switch away, so you can raise prices further. Each month the government may investigate: the higher your share, the likelier.</p>
        {big.map((c) => (
          <div key={c.id} className="mt-2">
            <div className="flex justify-between text-xs"><span className="font-semibold">{c.name}</span><span>{fmtPct(c.last.marketShare, 0)} of {GOODS[c.good].name.toLowerCase()}</span></div>
            <Progress value={c.last.marketShare / 0.6} height={6} tone={c.last.marketShare > 0.4 ? 'red' : 'amber'} />
          </div>
        ))}
      </Card>
    </>
  );
}

// ---------- tips ----------

function Tips({ w }: { w: WorldState }) {
  const push = useGame((s) => s.push);
  const tips = [...w.play.tips].reverse();
  const friends = w.rivals.filter((r) => r.relation >= 40);
  return (
    <>
      <Intro>Rivals who like you (relationship 40+) sometimes hint at what is about to happen to a listed company. Most tips are right, about 1 in 5 is wrong. Trading big amounts just before the news can bring a fine.</Intro>
      <div className="text-xs text-muted mt-2">Friends who might tip you: {friends.length ? friends.map((r) => r.name).join(', ') : 'none yet. Sign deals and deliver contracts to build relationships.'}</div>
      {tips.length === 0 && <Card className="p-3 text-sm text-muted mt-2">No tips yet.</Card>}
      <div className="space-y-2 mt-2">
        {tips.map((t) => {
          const rv = w.rivals.find((r) => r.id === t.rivalId);
          return (
            <Card key={t.id} className="p-3">
              <div className="text-xs text-muted">From {rv?.name} · day {t.day}</div>
              <div className="font-semibold mt-0.5">"{t.text}"</div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs">{t.done ? (t.truth ? '✅ It came true' : '❌ It was wrong') : `⏳ News expected in about ${days(w, t.dueDay)} days`}</span>
                <Button size="sm" variant="dark" onClick={() => push({ screen: 'stock', ticker: t.ticker })}>{t.ticker}</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Intro({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted mt-2">{children}</p>;
}
