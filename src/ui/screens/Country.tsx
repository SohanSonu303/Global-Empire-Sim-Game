import { useState } from 'react';
import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { refPrice } from '../../engine/company';
import { fmtMoney, fmtPct } from '../../engine/news';
import { totalRoom } from '../../engine/warehouse';
import { STANDING, appetite, blocked, dealOf, exportQuote, importQuote, localPrice, nation, shipDaysOf, spareGoods, standing, tariffOf } from '../../engine/trade';
import type { GoodId } from '../../engine/types';
import { Badge, Button, Card, Chips, Screen, SectionTitle, cx } from '../components/core';
import { SubHeader } from './More';
import { unlocked, unlockLevel } from '../../engine/rewards';
import { Shipments, vsHome } from './World';

type Tab = 'sell' | 'buy' | 'barter';

/** Trade with one country: sell from your warehouses, buy its spare goods, or swap. */
export function CountryScreen({ id }: { id: string }) {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const [tab, setTab] = useState<Tab>('sell');
  const t = w.play.trade;
  const n = nation(id);
  if (!unlocked(w, 'world')) return <div><SubHeader title={n.short} /><Screen><Card className="mt-3 p-4 text-sm text-muted">World trade opens at level {unlockLevel('world')}.</Card></Screen></div>;
  if (!t) return <div><SubHeader title={n.short} /><Screen><Card className="mt-3 p-4 text-sm text-muted">Trade opens tomorrow.</Card></Screen></div>;
  const st = standing(t, id);
  const ships = t.shipments.filter((s) => s.to === id);
  const offers = t.offers.filter((o) => o.nation === id);
  return (
    <div>
      <SubHeader title={`Trade with ${n.short}`} sub={`${STANDING[st].label}${dealOf(t, id) === 'fta' ? ' · free trade' : ''} · tariff ${blocked(t, id) ? '—' : fmtPct(tariffOf(t, id), 0)} · ${shipDaysOf(t, id)} days by sea`} />
      <Screen>
        {st === 'war' ? (
          <Card className="mt-3 p-4 text-sm text-red">Astoria is at war with {n.short}. Trade stops until peace.</Card>
        ) : blocked(t, id) ? (
          <Card className="mt-3 p-4 text-sm text-red">Astoria has sanctions on {n.short}. Trade stops until they are lifted.</Card>
        ) : !w.play.warehouses.length ? (
          <Card className="mt-3 p-4 text-sm">
            <p className="text-muted">Goods ship from and to your warehouses. Build one first.</p>
            <Button block className="mt-2" onClick={() => push({ screen: 'strategy', tab: 'warehouses' })}>Go to warehouses</Button>
          </Card>
        ) : (
          <>
            <div className="mt-3">
              <Chips value={tab} onChange={setTab} items={[{ id: 'sell', label: 'Sell' }, { id: 'buy', label: 'Buy' }, { id: 'barter', label: `Swap${offers.length ? ` (${offers.length})` : ''}` }]} />
            </div>
            {tab === 'sell' && <Sell id={id} />}
            {tab === 'buy' && <Buy id={id} />}
            {tab === 'barter' && <Barter id={id} />}
          </>
        )}
        {ships.length > 0 && (
          <>
            <SectionTitle>Ships to and from {n.short}</SectionTitle>
            <Shipments list={ships} />
          </>
        )}
      </Screen>
    </div>
  );
}

function held(w: ReturnType<typeof useGame.getState>['world'], g: GoodId): number {
  return w!.play.warehouses.reduce((s, wh) => s + (wh.stock[g]?.qty ?? 0), 0);
}

function Sell({ id }: { id: string }) {
  const w = useGame((s) => s.world)!;
  const goods = [...new Set(w.play.warehouses.flatMap((wh) => Object.keys(wh.stock) as GoodId[]))].filter((g) => held(w, g) >= 1);
  goods.sort((a, b) => vsHome(w, id, b) - vsHome(w, id, a));
  if (!goods.length) return <Card className="mt-3 p-3 text-sm text-muted">Your warehouses are empty. Store output from your plants, or buy goods here to bring home.</Card>;
  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs text-muted">Your goods sell when the ship arrives, at that day's price and exchange rate. Selling a lot at once lowers the price you get.</p>
      {goods.map((g) => <SellRow key={g} id={id} g={g} have={held(w, g)} />)}
    </div>
  );
}

function SellRow({ id, g, have }: { id: string; g: GoodId; have: number }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const [pct, setPct] = useState(100);
  const qty = Math.floor(have * pct / 100);
  const q = exportQuote(w, id, g, qty);
  const stockCost = w.play.warehouses.reduce((s, wh) => s + (wh.stock[g] ? wh.stock[g]!.cost * Math.min(qty, wh.stock[g]!.qty) : 0), 0);
  const d = vsHome(w, id, g);
  const better = q.net - q.home;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{GOODS[g].name}</span>
        <span className={cx('num text-xs font-bold', d >= 0 ? 'text-green' : 'text-red')}>{d >= 0 ? '+' : ''}{Math.round(d * 100)}% vs home</span>
      </div>
      <div className="text-xs text-muted">{Math.floor(have).toLocaleString()} {GOODS[g].unit} stored · {Math.round(localPrice(w, id, g)).toLocaleString()} {nation(id).currency} ({fmtMoney(refPrice(w, g) * (1 + d))}) a {GOODS[g].unit} there</div>
      <input type="range" min={5} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-gold)]" aria-label={`Share of ${GOODS[g].name} to send`} />
      <div className="grid grid-cols-2 gap-x-3 text-xs mt-1">
        <span className="text-muted">Sale there</span><span className="num text-right">{fmtMoney(q.gross)}</span>
        <span className="text-muted">Tariff</span><span className="num text-right text-red">−{fmtMoney(q.tariff)}</span>
        <span className="text-muted">Shipping (pay now)</span><span className="num text-right text-red">−{fmtMoney(q.shipping)}</span>
        <span className="text-muted font-semibold">You get</span><span className="num text-right font-bold">{fmtMoney(q.net)}</span>
        <span className="text-muted">Selling at home instead</span><span className="num text-right">{fmtMoney(q.home)}</span>
        <span className="text-muted">Profit on what it cost you</span><span className={cx('num text-right', q.net - stockCost >= 0 ? 'text-green' : 'text-red')}>{fmtMoney(q.net - stockCost)}</span>
      </div>
      <Button block size="sm" className="mt-2" variant={better > 0 ? 'gold' : 'dark'} disabled={qty < 1 || w.player.cash < q.shipping} onClick={() => dispatch({ type: 'exportGoods', to: id, good: g, qty })}>
        Ship {qty.toLocaleString()} {GOODS[g].unit}{better > 0 ? ` (+${fmtMoney(better)} vs home)` : ''}
      </Button>
    </Card>
  );
}

function Buy({ id }: { id: string }) {
  const w = useGame((s) => s.world)!;
  const goods = spareGoods(w, id);
  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs text-muted">Buy what {nation(id).short} has spare and bring it home to your warehouses. Sell it later at home, or use it in deals.</p>
      {goods.map((g) => <BuyRow key={g} id={id} g={g} />)}
    </div>
  );
}

function BuyRow({ id, g }: { id: string; g: GoodId }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const t = w.play.trade!;
  const inbound = t.shipments.filter((s) => s.back === g).reduce((a, s) => a + (s.backQty ?? 0), 0);
  const room = Math.max(0, Math.floor(totalRoom(w, g) - inbound));
  const max = Math.min(room, Math.round(appetite(id, g) * 1.5));
  const [pct, setPct] = useState(50);
  const qty = Math.floor(max * pct / 100);
  const q = importQuote(w, id, g, Math.max(1, qty));
  const home = refPrice(w, g);
  const gain = home / q.perUnit - 1;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{GOODS[g].name}</span>
        <Badge tone={gain > 0 ? 'good' : 'neutral'}>{fmtMoney(q.perUnit)} landed</Badge>
      </div>
      <div className="text-xs text-muted">Worth {fmtMoney(home)} a {GOODS[g].unit} at home · room for {room.toLocaleString()} {GOODS[g].unit}</div>
      {max >= 1 ? (
        <>
          <input type="range" min={5} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-gold)]" aria-label={`Amount of ${GOODS[g].name} to buy`} />
          <div className="text-xs text-muted">Goods {fmtMoney(q.price)} + tariff {fmtMoney(q.tariff)} + shipping {fmtMoney(q.shipping)}</div>
          <Button block size="sm" className="mt-2" variant={gain > 0 ? 'gold' : 'dark'} disabled={qty < 1 || w.player.cash < q.total} onClick={() => dispatch({ type: 'importGoods', from: id, good: g, qty })}>
            Buy {qty.toLocaleString()} for {fmtMoney(q.total)}{gain > 0 ? ` (${Math.round(gain * 100)}% under home)` : ''}
          </Button>
        </>
      ) : <p className="text-xs text-amber mt-1">No warehouse room for this good.</p>}
    </Card>
  );
}

function Barter({ id }: { id: string }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const offers = w.play.trade!.offers.filter((o) => o.nation === id);
  if (!offers.length) return <Card className="mt-3 p-3 text-sm text-muted">No swap offers from {nation(id).short} right now. New ones come each month.</Card>;
  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs text-muted">A swap pays no tariff. Your goods sail now; theirs come back on the same ship, {shipDaysOf(w.play.trade!, id) * 2} days in all.</p>
      {offers.map((o) => {
        const have = held(w, o.want);
        const giveV = o.giveQty * refPrice(w, o.give);
        const wantV = o.wantQty * refPrice(w, o.want);
        return (
          <Card key={o.id} className="p-3">
            <div className="text-sm"><b>You give</b> {Math.round(o.wantQty).toLocaleString()} {GOODS[o.want].unit} of {GOODS[o.want].name.toLowerCase()} <span className="text-muted">({fmtMoney(wantV)} at home)</span></div>
            <div className="text-sm"><b>You get</b> {Math.round(o.giveQty).toLocaleString()} {GOODS[o.give].unit} of {GOODS[o.give].name.toLowerCase()} <span className="text-muted">({fmtMoney(giveV)} at home)</span></div>
            <div className="text-xs text-muted mt-1">You have {Math.floor(have).toLocaleString()} stored · offer ends in {o.until - w.day} days</div>
            <Button block size="sm" className="mt-2" disabled={have < o.wantQty} onClick={() => dispatch({ type: 'acceptBarter', id: o.id })}>
              {have < o.wantQty ? `Need ${Math.ceil(o.wantQty - have).toLocaleString()} more` : `Swap (+${fmtMoney(giveV - wantV)} in value)`}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
