import { useState } from 'react';
import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { refPrice } from '../../engine/company';
import { fmtMoney, fmtPct } from '../../engine/news';
import { FOREIGN, HOME, NATIONS, OFFICE_COST, OFFICE_UPKEEP, PHASE, STANDING, bestMarkets, blocked, dealOf, foreignPrice, growthOf, hasOffice, nation, phaseOf, rateOf, shipDaysOf, spareGoods, standing, tariffOf, warsOf, type Standing } from '../../engine/trade';
import type { GoodId, TradeState, WorldState } from '../../engine/types';
import { WorldMap } from '../art/art';
import { unlocked, unlockLevel } from '../../engine/rewards';
import { Badge, Button, Card, Chips, Progress, Screen, SectionTitle, cx } from '../components/core';
import { Num } from '../components/game';

export const STANDING_COLOR: Record<Standing, string> = { ally: '#e3b04b', friendly: '#3dbb6c', neutral: '#9aa9c4', tense: '#f0a33a', war: '#e2574c' };

type Layer = 'economy' | 'resources' | 'trade' | 'diplomacy';

export function WorldScreen() {
  const w = useGame((s) => s.world)!;
  if (!unlocked(w, 'world')) return <WorldLocked />;
  return <WorldOpen />;
}

function WorldLocked() {
  const w = useGame((s) => s.world)!;
  const lvl = unlockLevel('world');
  return (
    <Screen>
      <Card className="mt-4 p-4 text-center">
        <div className="text-4xl">🌍</div>
        <div className="font-bold text-lg mt-2">The world opens at level {lvl}</div>
        <p className="text-sm text-muted mt-1">For now your empire grows inside Astoria. At level {lvl} you can see 8 countries with their own needs, money, friendships and wars, and ship goods from your warehouses to sell abroad, buy cheap or swap.</p>
        <Progress value={Math.min(1, w.player.level / lvl)} tone="gold" className="mt-3" />
        <div className="text-xs text-muted mt-1">Level {w.player.level} of {lvl}</div>
      </Card>
    </Screen>
  );
}

function WorldOpen() {
  const w = useGame((s) => s.world)!;
  const [sel, setSel] = useState(HOME);
  const [layer, setLayer] = useState<Layer>('economy');
  const t = w.play.trade;
  const marks: Record<string, string> = {};
  if (t) for (const n of FOREIGN) marks[n.id] = STANDING_COLOR[standing(t, n.id)];
  return (
    <div>
      <div className="px-gutter pt-3">
        <Chips
          value={layer}
          onChange={setLayer}
          items={[
            { id: 'economy', label: 'Economy' },
            { id: 'resources', label: 'Resources' },
            { id: 'trade', label: 'Trade' },
            { id: 'diplomacy', label: 'Diplomacy' },
          ]}
        />
      </div>
      <div className="mt-2 border-y border-line">
        <WorldMap selected={sel} onSelect={setSel} marks={marks} />
      </div>
      {t && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-gutter pt-2 text-[11px] text-muted">
          {(Object.keys(STANDING) as Standing[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: STANDING_COLOR[s] }} />{STANDING[s].label}</span>
          ))}
        </div>
      )}
      <Screen>
        {sel === HOME || !t ? <Home layer={layer} /> : <Foreign id={sel} t={t} />}
        {t && layer === 'trade' && <TradePanel t={t} />}
        {t && layer === 'diplomacy' && <Diplomacy t={t} />}
      </Screen>
    </div>
  );
}

function Home({ layer }: { layer: Layer }) {
  const w = useGame((s) => s.world)!;
  const setTab = useGame((s) => s.setTab);
  const push = useGame((s) => s.push);
  const m = w.macro;
  const country = nation(HOME);
  const econScore = Math.max(0, Math.min(1, 0.5 + m.growth * 6 - Math.max(0, m.inflation - 0.02) * 4 - (m.unemployment - 0.05) * 4));
  const stability = Math.max(0, Math.min(1, m.confidence * 0.8 + 0.2));
  return (
    <Card className="mt-3 p-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="font-bold text-lg">{country.name}</div>
          <div className="text-sm text-muted">{country.identity} · {country.advantage}</div>
        </div>
        <Badge tone="gold">Home</Badge>
      </div>
      {layer !== 'resources' ? (
        <>
          <Bar label="Economy" v={econScore} tone="green" />
          <Bar label="Stability" v={stability} tone="gold" />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Stat label="GDP (annual)" value={<Num explain={m.gdpExplain}>{fmtMoney(m.gdp)}</Num>} />
            <Stat label="Real growth" value={fmtPct(m.growth)} tone={m.growth >= 0 ? 'good' : 'bad'} />
            <Stat label="Inflation" value={fmtPct(m.inflation)} tone={m.inflation > 0.04 ? 'bad' : undefined} />
            <Stat label="Unemployment" value={fmtPct(m.unemployment)} tone={m.unemployment > 0.07 ? 'bad' : undefined} />
            <Stat label="Central bank rate" value={<Num explain={m.rateExplain}>{fmtPct(m.rate, 2)}</Num>} />
            <Stat label="Consumer confidence" value={`${Math.round(m.confidence * 100)}`} />
            <Stat label="Gov. debt / GDP" value={fmtPct(m.govDebt / m.gdp, 0)} />
            <Stat label="Corporate tax" value={fmtPct(m.taxRate, 0)} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Stat label="Oil price index" value={m.oilPrice.toFixed(2)} tone={m.oilPrice > 1.2 ? 'bad' : undefined} />
          <Stat label="Oil supply" value={fmtPct(m.oilSupply, 0)} tone={m.oilSupply < 0.95 ? 'bad' : undefined} />
          <Stat label="Price level" value={m.priceLevel.toFixed(3)} />
          <Stat label="Real consumption" value={m.realConsumption.toFixed(3)} />
        </div>
      )}
      <p className="text-xs text-muted mt-3">Tap another country on the map to see what it needs and trade with it. Goods ship from your warehouses.</p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button variant="dark" onClick={() => push({ screen: 'stats' })}>Statistics</Button>
        <Button onClick={() => setTab('business')}>Found business</Button>
      </div>
    </Card>
  );
}

/** Price there against home, as "+35%" */
export function vsHome(w: WorldState, id: string, g: GoodId): number {
  return foreignPrice(w, id, g) / refPrice(w, g) - 1;
}

function Foreign({ id, t }: { id: string; t: TradeState }) {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const dispatch = useGame((s) => s.dispatch);
  const n = nation(id);
  const st = standing(t, id);
  const ph = phaseOf(t, id);
  const deal = dealOf(t, id);
  const office = hasOffice(t, id);
  const stop = blocked(t, id);
  const s = t.nations[id];
  const fxMove = s.fx / (s.fxHist[0] ?? s.fx) - 1;
  const wars = warsOf(t, id);
  return (
    <Card className="mt-3 p-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg">{n.name}</div>
          <div className="text-sm text-muted">{n.identity} · {n.advantage}</div>
        </div>
        <Badge tone={STANDING[st].tone === 'gold' ? 'gold' : STANDING[st].tone}>{STANDING[st].label}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat label={`1 ${n.currency}`} value={<>${s.fx.toFixed(s.fx < 0.1 ? 3 : 2)} <span className={cx('text-xs', fxMove >= 0 ? 'text-green' : 'text-red')}>{fxMove >= 0 ? '▲' : '▼'}{Math.abs(fxMove * 100).toFixed(0)}%</span></>} />
        <Stat label="Tariff on you" value={stop ? '—' : fmtPct(tariffOf(t, id), 0)} />
        <Stat label="By sea" value={`${shipDaysOf(t, id)} days`} />
        <Stat label="Economy" value={PHASE[ph].label} tone={ph === 'recession' ? 'bad' : ph === 'boom' ? 'good' : undefined} />
        <Stat label="Growth" value={fmtPct(growthOf(t, id), 1)} tone={growthOf(t, id) < 0 ? 'bad' : undefined} />
        <Stat label="Interest rate" value={fmtPct(rateOf(t, id), 1)} />
      </div>
      <p className="text-[11px] text-dim mt-1">{ph === 'boom' ? 'Booming: it pays more for what it buys.' : ph === 'recession' ? 'In recession: it pays less for imports.' : 'Higher rates there than here pull its currency up; lower rates push it down.'}</p>
      {deal === 'fta' && <p className="text-sm text-green mt-2">Free-trade deal with Astoria: no tariffs either way.</p>}
      {deal === 'sanction' && <p className="text-sm text-red mt-2">Astoria has sanctions on {n.short}: no trade until they are lifted.</p>}
      {wars.length > 0 && <p className="text-sm text-red mt-2">At war with {wars.map((x) => nation(x).short).join(' and ')}: it pays more for food, steel, medicine and fuel.</p>}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <GoodList title="Short of" goods={n.needs} id={id} />
        <GoodList title="Has spare" goods={spareGoods(w, id)} id={id} />
      </div>
      <p className="text-[11px] text-dim mt-2">Prices are against home, in dollars at today's exchange rate. If its currency falls while your ship is at sea, you get fewer dollars.</p>
      <Button block className="mt-3" disabled={stop} onClick={() => push({ screen: 'country', id })}>{st === 'war' ? 'No trade during war' : stop ? 'No trade under sanctions' : `Trade with ${n.short}`}</Button>
      <div className="mt-2 text-xs text-muted">
        {office
          ? <div className="flex items-center justify-between gap-2"><span>Your trade office here halves the tariff and speeds up ships. {fmtMoney(OFFICE_UPKEEP)} a month.</span><Button size="sm" variant="dark" onClick={() => dispatch({ type: 'closeOffice', nation: id })}>Close</Button></div>
          : <Button block size="sm" variant="dark" disabled={stop || w.player.cash < OFFICE_COST} onClick={() => dispatch({ type: 'openOffice', nation: id })}>Open trade office: {fmtMoney(OFFICE_COST)} (half tariff, ships 30% faster)</Button>}
      </div>
    </Card>
  );
}

function GoodList({ title, goods, id }: { title: string; goods: GoodId[]; id: string }) {
  const w = useGame((s) => s.world)!;
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted">{title}</div>
      {goods.map((g) => {
        const d = vsHome(w, id, g);
        return (
          <div key={g} className="flex justify-between text-sm py-0.5">
            <span className="truncate">{GOODS[g].name}</span>
            <span className={cx('num text-xs font-semibold', d >= 0 ? 'text-green' : 'text-red')}>{d >= 0 ? '+' : ''}{Math.round(d * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function TradePanel({ t }: { t: TradeState }) {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const best = bestMarkets(w).slice(0, 6);
  return (
    <>
      <SectionTitle>Ships at sea</SectionTitle>
      {t.shipments.length === 0 ? <Card className="p-3 text-sm text-muted">No ships out. Pick a country to sell, buy or swap goods.</Card> : <Shipments list={t.shipments} />}
      <SectionTitle>Best markets for your stock</SectionTitle>
      {!w.play.warehouses.length ? (
        <Card className="p-3 text-sm text-muted">Exports ship from your warehouses. Build one under Deals &amp; Strategies › Warehouses.</Card>
      ) : best.length === 0 ? (
        <Card className="p-3 text-sm text-muted">Your warehouses are empty.</Card>
      ) : (
        <div className="space-y-2">
          {best.map((b) => (
            <Card key={b.good} className="p-3" onClick={() => push({ screen: 'country', id: b.nation })}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{GOODS[b.good].name}</span>
                <span className={cx('num text-sm font-bold', b.gain >= 0 ? 'text-green' : 'text-red')}>{b.gain >= 0 ? '+' : ''}{Math.round(b.gain * 100)}%</span>
              </div>
              <div className="text-xs text-muted">Best in {nation(b.nation).short}: {fmtMoney(b.perUnit)} a {GOODS[b.good].unit} after tariff and shipping, against {fmtMoney(b.home)} at home</div>
            </Card>
          ))}
        </div>
      )}
      {(t.earned ?? 0) !== 0 && <p className="text-xs text-muted mt-2">Profit from exports so far: <b className="num">{fmtMoney(t.earned ?? 0)}</b></p>}
    </>
  );
}

export function Shipments({ list }: { list: TradeState['shipments'] }) {
  const w = useGame((s) => s.world)!;
  return (
    <div className="space-y-2">
      {list.map((s) => {
        const total = Math.max(1, s.arrives - s.left);
        const what = s.kind === 'import' ? `${GOODS[s.back!].name} from ${nation(s.to).short}`
          : s.kind === 'barter' ? `${GOODS[s.good].name} ⇄ ${GOODS[s.back!].name}, ${nation(s.to).short}`
          : `${GOODS[s.good].name} to ${nation(s.to).short}`;
        const qty = s.kind === 'import' ? s.backQty! : s.qty;
        return (
          <Card key={s.id} className="p-3">
            <div className="flex justify-between text-sm"><span className="font-semibold">🚢 {what}</span><span className="text-muted">{Math.max(0, s.arrives - w.day)} d</span></div>
            <div className="text-xs text-muted mb-1.5">{Math.round(qty).toLocaleString()} {GOODS[s.kind === 'import' ? s.back! : s.good].unit} · {s.kind === 'export' ? 'sold on arrival at the price then' : 'into your warehouses on arrival'}</div>
            <Progress value={(w.day - s.left) / total} tone="blue" height={6} />
          </Card>
        );
      })}
    </div>
  );
}

function Diplomacy({ t }: { t: TradeState }) {
  const pairs = NATIONS.filter((n) => n.id !== HOME).map((n) => ({ n, st: standing(t, n.id) }));
  return (
    <>
      <SectionTitle>Astoria and the world</SectionTitle>
      <Card className="p-3">
        {pairs.map(({ n, st }) => (
          <div key={n.id} className="flex items-center justify-between py-1 text-sm">
            <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: STANDING_COLOR[st] }} />{n.short}</span>
            <span className="text-muted">{STANDING[st].label}{st !== 'war' && ` · tariff ${fmtPct(tariffOf(t, n.id), 0)}`}</span>
          </div>
        ))}
        <p className="text-[11px] text-dim mt-2">Every sale, purchase and swap builds goodwill. Friends charge lower tariffs; allies charge less than half and sell to you tariff-free.</p>
      </Card>
      <SectionTitle>Wars</SectionTitle>
      <Card className="p-3 text-sm">
        {t.wars.length === 0 ? <span className="text-muted">The world is at peace for now.</span> : t.wars.map((k) => {
          const [a, b] = k.split('|');
          return <div key={k} className="py-0.5">⚔️ {nation(a).short} vs {nation(b).short}</div>;
        })}
      </Card>
      {t.log.length > 0 && (
        <>
          <SectionTitle>World news</SectionTitle>
          <Card className="p-3 space-y-1">
            {t.log.slice(0, 10).map((l, i) => (
              <div key={i} className={cx('text-sm', l.tone === 'bad' ? 'text-red' : l.tone === 'good' ? 'text-green' : '')}><span className="text-xs text-dim mr-2">Day {l.day}</span>{l.text}</div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function Bar({ label, v, tone }: { label: string; v: number; tone: 'green' | 'gold' | 'red' }) {
  return (
    <div className="flex items-center gap-3 mt-3">
      <span className="w-20 text-sm text-muted">{label}</span>
      <Progress value={v} tone={tone} />
      <span className="num w-10 text-right text-sm font-semibold">{Math.round(v * 100)}%</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 min-w-0">
      <div className="text-xs text-muted truncate">{label}</div>
      <div className={'num font-bold ' + (tone === 'good' ? 'text-green' : tone === 'bad' ? 'text-red' : '')}>{value}</div>
    </div>
  );
}
