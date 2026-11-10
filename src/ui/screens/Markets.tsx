import { useState } from 'react';
import { useGame } from '../../store/game';
import { INDUSTRIES, INDUSTRY_IDS } from '../../engine/data';
import { companyOf, eps, executionPrice, fairValue, maxFillToday, portfolioValue, stockByTicker } from '../../engine/market';
import { fmtMoney, fmtPct } from '../../engine/news';
import type { IndustryId, Stock, WorldState } from '../../engine/types';
import { BearBadge, BullBadge, TradingFloor, industryColor } from '../art/art';
import { Badge, BottomSheet, Button, Card, Chips, Progress, Screen, SectionTitle, cx } from '../components/core';
import { Delta, LineChart, Num } from '../components/game';
import { IconBack } from '../components/Icons';
import { stockChange } from '../helpers';
import { TimesOnStock } from './MarketWatch';

type T = 'stocks' | 'portfolio' | 'orders' | 'bonds';
type IndFilter = 'all' | 'yours' | 'held' | IndustryId;
type Sort = 'gainers' | 'losers' | 'price' | 'volume' | 'name';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'gainers', label: 'Top gainers' },
  { id: 'losers', label: 'Top losers' },
  { id: 'price', label: 'Highest price' },
  { id: 'volume', label: 'Most traded' },
  { id: 'name', label: 'A to Z' },
];

export function MarketsScreen() {
  const w = useGame((s) => s.world)!;
  const [tab, setTab] = useState<T>('stocks');
  const [ticket, setTicket] = useState<{ ticker: string; side: 'buy' | 'sell' } | null>(null);
  const [ind, setInd] = useState<IndFilter>('all');
  const [sort, setSort] = useState<Sort>('gainers');
  const [query, setQuery] = useState('');
  const mood = w.marketMood;
  const openOrders = w.orders.filter((o) => o.ownerId === 'player' && o.status === 'open');
  return (
    <div>
      <TradingFloor tickers={w.stocks.map((s) => ({ t: s.ticker, up: s.price >= s.prevClose, px: s.price.toFixed(2) }))} />
      <Screen>
        <Card className="mt-3 p-3">
          <div className="flex items-center gap-3">
            <BullBadge />
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold">Market Mood</span>
                <span className="num text-muted">Index {w.marketIndex.toFixed(0)} <Delta v={stockChange(w.marketIndexHist.map((h) => ({ price: h.value })), 1)} className="text-xs" /></span>
              </div>
              <Progress className="mt-1.5" value={mood} tone={mood > 0.55 ? 'green' : mood < 0.45 ? 'red' : 'amber'} height={12} />
              <div className="text-xs text-center text-muted mt-1">{Math.round(mood * 100)}% {mood >= 0.5 ? 'Bullish' : 'Bearish'}</div>
            </div>
            <BearBadge />
          </div>
        </Card>
        <div className="mt-3">
          <Chips<T>
            value={tab}
            onChange={setTab}
            items={[
              { id: 'stocks', label: 'Stocks' },
              { id: 'portfolio', label: 'Portfolio' },
              { id: 'orders', label: `Orders${openOrders.length ? ` (${openOrders.length})` : ''}` },
              { id: 'bonds', label: 'Bonds · Phase 2', disabled: true },
            ]}
          />
        </div>
        {tab === 'stocks' && (
          <StockList w={w} ind={ind} setInd={setInd} sort={sort} setSort={setSort} query={query} setQuery={setQuery} onTrade={(ticker, side) => setTicket({ ticker, side })} />
        )}
        {tab === 'portfolio' && <Portfolio w={w} onTrade={(ticker, side) => setTicket({ ticker, side })} />}
        {tab === 'orders' && <Orders w={w} />}
      </Screen>
      {ticket && <OrderSheet ticker={ticket.ticker} initialSide={ticket.side} onClose={() => setTicket(null)} />}
    </div>
  );
}

function StockList({ w, ind, setInd, sort, setSort, query, setQuery, onTrade }: {
  w: WorldState; ind: IndFilter; setInd: (v: IndFilter) => void; sort: Sort; setSort: (v: Sort) => void;
  query: string; setQuery: (v: string) => void; onTrade: (ticker: string, side: 'buy' | 'sell') => void;
}) {
  const q = query.trim().toLowerCase();
  const list = w.stocks
    .map((s) => ({ s, c: companyOf(w, s), chg: s.price / s.prevClose - 1 }))
    .filter(({ s, c }) => {
      if (ind === 'yours' && !c.isPlayer) return false;
      if (ind === 'held' && !(w.player.holdings[s.ticker]?.shares > 0)) return false;
      if (ind !== 'all' && ind !== 'yours' && ind !== 'held' && c.industry !== ind) return false;
      return !q || s.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'gainers': return b.chg - a.chg;
        case 'losers': return a.chg - b.chg;
        case 'price': return b.s.price - a.s.price;
        case 'volume': return b.s.volume * b.s.price - a.s.volume * a.s.price;
        case 'name': return a.s.ticker.localeCompare(b.s.ticker);
      }
    });
  const hasYours = w.stocks.some((s) => companyOf(w, s).isPlayer);
  return (
    <div className="mt-2">
      <Chips<IndFilter>
        value={ind}
        onChange={setInd}
        items={[
          { id: 'all', label: `All (${w.stocks.length})` },
          ...(hasYours ? [{ id: 'yours' as IndFilter, label: 'Your companies' }] : []),
          { id: 'held', label: 'You own shares' },
          ...INDUSTRY_IDS.filter((i) => w.stocks.some((s) => companyOf(w, s).industry === i)).map((i) => ({ id: i as IndFilter, label: INDUSTRIES[i].name })),
        ]}
      />
      <div className="flex gap-2 mt-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or ticker"
          aria-label="Search stocks"
          className="flex-1 min-w-0 min-h-tap rounded-lg bg-bg border border-line-strong px-3 text-base outline-none focus:border-gold"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort stocks"
          className="min-h-tap rounded-lg bg-bg border border-line-strong px-2 text-sm outline-none focus:border-gold"
        >
          {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      {list.length === 0 && <p className="text-sm text-muted mt-3">No stocks match. Try another filter.</p>}
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        {list.map(({ s }) => <StockCard key={s.ticker} s={s} w={w} onTrade={(side) => onTrade(s.ticker, side)} />)}
      </div>
    </div>
  );
}

function StockCard({ s, w, onTrade }: { s: Stock; w: WorldState; onTrade: (side: 'buy' | 'sell') => void }) {
  const push = useGame((st) => st.push);
  const c = companyOf(w, s);
  const chg = s.price / s.prevClose - 1;
  const held = w.player.holdings[s.ticker]?.shares ?? 0;
  return (
    <Card className="p-2.5" onClick={() => push({ screen: 'stock', ticker: s.ticker })}>
      <div className="flex items-center gap-2">
        <span className="grid place-items-center size-8 rounded-md text-xs font-black text-bg" style={{ background: industryColor(c.industry) }}>{s.ticker[0]}</span>
        <div className="min-w-0">
          <div className="font-bold text-sm leading-tight">{s.ticker}</div>
          <div className="text-xs text-muted truncate">{c.name}</div>
        </div>
      </div>
      <div className="flex items-baseline justify-between mt-2 gap-1">
        <span className="num text-lg font-bold">${s.price.toFixed(2)}</span>
        <Delta v={chg} className="text-xs" />
      </div>
      <div className="text-xs text-dim num">Vol {(s.volume / 1e6).toFixed(2)}M{held > 0 && <span className="text-gold"> · You: {held.toLocaleString()}</span>}</div>
      {c.bankrupt && <Badge tone="bad">Bankrupt</Badge>}
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <Button size="sm" className="px-1" onClick={(e) => { e.stopPropagation(); onTrade('buy'); }} disabled={c.bankrupt}>Buy</Button>
        <Button size="sm" variant="dark" className="px-1" onClick={(e) => { e.stopPropagation(); onTrade('sell'); }} disabled={held <= 0}>Sell</Button>
      </div>
    </Card>
  );
}

function Portfolio({ w, onTrade }: { w: WorldState; onTrade: (t: string, side: 'buy' | 'sell') => void }) {
  const entries = Object.entries(w.player.holdings);
  const value = portfolioValue(w, w.player.holdings);
  const cost = entries.reduce((s, [, h]) => s + h.avgCost * h.shares, 0);
  return (
    <div className="mt-3 space-y-2.5">
      <Card className="p-3">
        <div className="flex justify-between text-sm"><span className="text-muted">Market value</span><span className="num font-bold">{fmtMoney(value)}</span></div>
        <div className="flex justify-between text-sm mt-1"><span className="text-muted">Unrealised P&L</span><span className={cx('num font-bold', value - cost >= 0 ? 'text-green' : 'text-red')}>{fmtMoney(value - cost)}</span></div>
        <div className="flex justify-between text-sm mt-1"><span className="text-muted">Realised P&L</span><span className="num font-bold">{fmtMoney(w.player.realizedPnl)}</span></div>
        <div className="flex justify-between text-sm mt-1"><span className="text-muted">Dividends received</span><span className="num font-bold">{fmtMoney(w.player.dividendsReceived)}</span></div>
      </Card>
      {entries.length === 0 && <p className="text-sm text-muted">You don't own any shares yet. Listed companies pay 30% of quarterly profit as dividends.</p>}
      {entries.map(([t, h]) => {
        const s = stockByTicker(w, t)!;
        const pnl = (s.price - h.avgCost) * h.shares;
        return (
          <Card key={t} className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">{t} <span className="text-muted font-normal text-sm">{h.shares.toLocaleString()} sh</span></div>
                <div className="text-xs text-muted num">Avg {fmtMoney(h.avgCost)} · Now {fmtMoney(s.price)}</div>
              </div>
              <div className="text-right">
                <div className="num font-bold">{fmtMoney(s.price * h.shares)}</div>
                <div className={cx('num text-xs font-semibold', pnl >= 0 ? 'text-green' : 'text-red')}>{fmtMoney(pnl)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button size="sm" onClick={() => onTrade(t, 'buy')}>Buy more</Button>
              <Button size="sm" variant="dark" onClick={() => onTrade(t, 'sell')}>Sell</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Orders({ w }: { w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const orders = w.orders.filter((o) => o.ownerId === 'player').slice().reverse();
  if (!orders.length) return <p className="mt-3 text-sm text-muted">No orders yet. Large orders fill over several days because each order can take at most 10% of a stock's daily volume.</p>;
  return (
    <div className="mt-3 space-y-2">
      {orders.map((o) => (
        <Card key={o.id} className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">
                <span className={o.side === 'buy' ? 'text-green' : 'text-red'}>{o.side.toUpperCase()}</span> {o.ticker} · {o.type}
                {o.limit != null && ` @ ${fmtMoney(o.limit)}`}
              </div>
              <div className="text-xs text-muted num">Filled {o.filled.toLocaleString()} / {o.qty.toLocaleString()}{o.filled > 0 && ` · avg ${fmtMoney(o.avgFill)}`} · day {o.createdDay}</div>
            </div>
            {o.status === 'open' ? <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'cancelOrder', orderId: o.id })}>Cancel</Button> : <Badge tone={o.status === 'filled' ? 'good' : 'neutral'}>{o.status}</Badge>}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function OrderSheet({ ticker, initialSide, onClose }: { ticker: string; initialSide: 'buy' | 'sell'; onClose: () => void }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const s = stockByTicker(w, ticker)!;
  const [side, setSide] = useState(initialSide);
  const [type, setType] = useState<'market' | 'limit'>('market');
  const held = w.player.holdings[ticker]?.shares ?? 0;
  const maxAfford = Math.floor(w.player.cash / (s.price * 1.01));
  const [qty, setQty] = useState(Math.max(1, Math.min(side === 'buy' ? Math.floor(maxAfford / 4) : held, maxFillToday(s))));
  const [limit, setLimit] = useState(+s.price.toFixed(2));
  const liq = maxFillToday(s);
  const todayQty = Math.min(qty, liq);
  const px = executionPrice(s, side, todayQty);
  const est = px * qty;
  const presets = side === 'buy' ? [0.1, 0.25, 0.5, 1].map((f) => Math.max(1, Math.floor(maxAfford * f))) : [0.25, 0.5, 1].map((f) => Math.max(1, Math.floor(held * f)));
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`${side === 'buy' ? 'Buy' : 'Sell'} ${ticker}`}
      footer={
        <Button
          block
          size="lg"
          variant={side === 'buy' ? 'gold' : 'danger'}
          disabled={qty <= 0 || (side === 'sell' && qty > held) || (side === 'buy' && type === 'market' && est > w.player.cash * 1.0001 && todayQty === qty)}
          onClick={() => dispatch({ type: 'placeOrder', ticker, side, orderType: type, qty, limit: type === 'limit' ? limit : undefined }).then((r) => r.ok && onClose())}
        >
          {side === 'buy' ? 'Buy' : 'Sell'} {qty.toLocaleString()} · ~{fmtMoney(est)}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Chips<'buy' | 'sell'> bleed={false} value={side} onChange={setSide} items={[{ id: 'buy', label: 'Buy' }, { id: 'sell', label: 'Sell', disabled: held <= 0 }]} />
        <Chips<'market' | 'limit'> bleed={false} value={type} onChange={setType} items={[{ id: 'market', label: 'Market' }, { id: 'limit', label: 'Limit' }]} />
      </div>
      <div className="flex justify-between text-sm mt-3"><span className="text-muted">Last price</span><span className="num font-bold">${s.price.toFixed(2)}</span></div>
      <div className="flex justify-between text-sm mt-1"><span className="text-muted">{side === 'buy' ? 'Cash available' : 'Shares owned'}</span><span className="num">{side === 'buy' ? fmtMoney(w.player.cash) : held.toLocaleString()}</span></div>
      <label className="block text-sm text-muted mt-4 mb-1" htmlFor="qty">Quantity</label>
      <input id="qty" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="num w-full min-h-tap rounded-lg bg-bg border border-line-strong px-3 text-lg" />
      <div className="flex gap-2 mt-2">
        {presets.map((p, i) => (
          <Button key={i} size="sm" variant="dark" className="flex-1" onClick={() => setQty(p)}>{side === 'buy' ? ['10%', '25%', '50%', 'Max'][i] : ['25%', '50%', 'All'][i]}</Button>
        ))}
      </div>
      {type === 'limit' && (
        <>
          <label className="block text-sm text-muted mt-4 mb-1" htmlFor="limit">Limit price</label>
          <input id="limit" type="number" step="0.01" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="num w-full min-h-tap rounded-lg bg-bg border border-line-strong px-3 text-lg" />
        </>
      )}
      <div className="mt-4 rounded-lg border border-line bg-card p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted">Est. fill price (spread + impact)</span><span className="num">${px.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Max fill per day (10% of volume)</span><span className="num">{liq.toLocaleString()} sh</span></div>
        {qty > liq && <p className="text-amber">This order is larger than today's liquidity. About {Math.ceil(qty / liq)} trading days to fill, at changing prices.</p>}
      </div>
    </BottomSheet>
  );
}

export function StockScreen({ ticker }: { ticker: string }) {
  const w = useGame((s) => s.world)!;
  const back = useGame((s) => s.back);
  const push = useGame((s) => s.push);
  const [ticket, setTicket] = useState<'buy' | 'sell' | null>(null);
  const s = stockByTicker(w, ticker);
  if (!s) return null;
  const c = companyOf(w, s);
  const fv = fairValue(w, s);
  const e = eps(w, s);
  const cap = s.price * s.shares;
  const annualRev = c.sum30.revenue * 12.17;
  const holders = w.rivals.filter((r) => r.holdings[ticker]).map((r) => ({ r, pct: r.holdings[ticker].shares / s.shares }));
  const held = w.player.holdings[ticker]?.shares ?? 0;
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center gap-2 px-2 h-14 border-b border-line bg-surface">
        <button aria-label="Back" onClick={back} className="size-tap grid place-items-center text-muted hover:text-text"><IconBack /></button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg truncate">{s.ticker} · {c.name}</div>
          <div className="text-xs text-muted">{INDUSTRIES[c.industry].name}</div>
        </div>
      </div>
      <Screen className="flex-1">
        <div className="flex items-baseline gap-3 pt-4">
          <span className="num text-3xl font-bold">${s.price.toFixed(2)}</span>
          <Delta v={s.price / s.prevClose - 1} />
          <span className="text-xs text-dim">today</span>
        </div>
        <Card className="mt-3 p-2"><LineChart data={s.hist.map((h) => h.price)} height={150} /></Card>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Metric label="Market cap" value={fmtMoney(cap)} />
          <Metric label="Intrinsic value" value={<Num explain={fv.explain}>{fmtMoney(fv.value)}</Num>} />
          <Metric label="P/E" value={e > 0 ? (s.price / e).toFixed(1) : '—'} />
          <Metric label="EPS (annual)" value={fmtMoney(e)} />
          <Metric label="Revenue (annual)" value={fmtMoney(annualRev)} />
          <Metric label="Debt / equity" value={(c.debt / Math.max(1, cap)).toFixed(2)} />
          <Metric label="Avg daily volume" value={`${(s.adv / 1e6).toFixed(2)}M`} />
          <Metric label="3-month change" value={<Delta v={stockChange(s.hist, 90)} />} />
        </div>
        <TimesOnStock ticker={s.ticker} />
        <SectionTitle>Operating company</SectionTitle>
        <Card className="p-3" onClick={() => push({ screen: 'company', id: c.id })}>
          <div className="flex justify-between text-sm"><span className="text-muted">Net income 30d</span><span className="num font-semibold">{fmtMoney(c.sum30.netIncome)}</span></div>
          <div className="flex justify-between text-sm mt-1"><span className="text-muted">Market share</span><span className="num font-semibold">{fmtPct(c.last.marketShare)}</span></div>
          <div className="text-xs text-gold mt-2">View company →</div>
        </Card>
        {holders.length > 0 && (
          <>
            <SectionTitle>Major holders</SectionTitle>
            <Card className="p-3 space-y-1">
              {holders.map(({ r, pct }) => (
                <button key={r.id} className="flex w-full justify-between text-sm min-h-9" onClick={() => push({ screen: 'rival', id: r.id })}>
                  <span>{r.name}</span><span className="num font-semibold">{fmtPct(pct)}</span>
                </button>
              ))}
              {held > 0 && <div className="flex justify-between text-sm text-gold"><span>You</span><span className="num font-semibold">{fmtPct(held / s.shares, 3)}</span></div>}
            </Card>
          </>
        )}
      </Screen>
      <div className="sticky bottom-0 grid grid-cols-2 gap-2 px-gutter py-2 bg-surface border-t border-line">
        <Button disabled={c.bankrupt} onClick={() => setTicket('buy')}>Buy</Button>
        <Button variant="dark" disabled={held <= 0} onClick={() => setTicket('sell')}>Sell</Button>
      </div>
      {ticket && <OrderSheet ticker={ticker} initialSide={ticket} onClose={() => setTicket(null)} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="num font-bold">{value}</div>
    </div>
  );
}
