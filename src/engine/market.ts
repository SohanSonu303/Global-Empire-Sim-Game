import { normal } from './rng';
import { clamp } from './company';
import { INDUSTRY_IDS } from './data';
import { noteDividend, noteStockSale } from './traits';
import type { Company, Explanation, Holding, IndustryId, Order, Stock, WorldState } from './types';

export const SPREAD = 0.002; // full bid-ask spread
export const MAX_DAILY_ADV_FRACTION = 0.1; // one owner can trade at most 10% of ADV per day per order
export const EQUITY_PREMIUM = 0.055;
/** Normal daily trading volume stays between 0.1% and 1% of all shares (it starts at 0.3%). */
export const ADV_MIN = 0.001;
export const ADV_MAX = 0.01;
/** On load, a rival never keeps more cash than this share of yearly GDP (repairs saves hit by the share bug). */
const RIVAL_CASH_CAP = 0.01;

export function companyOf(w: WorldState, s: Stock): Company {
  return w.companies.find((c) => c.id === s.companyId)!;
}

export function stockByTicker(w: WorldState, t: string): Stock | undefined {
  return w.stocks.find((s) => s.ticker === t);
}

/** Intrinsic value per share from a growing-perpetuity DCF of trailing earnings plus net cash. */
export function fairValue(w: WorldState, s: Stock): { value: number; explain: Explanation } {
  const c = companyOf(w, s);
  const annualNet = c.sum30.netIncome * 12.17;
  const annualRev = c.sum30.revenue * 12.17;
  const q = c.quarters;
  // Investors expect long-run growth near 2%, nudged by the last year's revenue growth (or, early on,
  // a damped quarter-on-quarter rate). One noisy quarter must not swing the value of the company.
  let g = 0.02;
  const n = q.length;
  if (n >= 5 && q[n - 5].revenue > 0) g = 0.02 + 0.5 * (q[n - 1].revenue / q[n - 5].revenue - 1 - 0.02);
  else if (n >= 2 && q[n - 2].revenue > 0) g = 0.02 + 0.25 * ((q[n - 1].revenue / q[n - 2].revenue) ** 4 - 1 - 0.02);
  g = clamp(g, -0.03, 0.05);
  const lev = clamp(c.debt / Math.max(1, annualRev), 0, 2);
  const r = w.macro.rate + EQUITY_PREMIUM + 0.02 * lev;
  const denom = Math.max(r - g, 0.05);
  const dcf = (Math.max(annualNet, 0) * (1 + g)) / denom;
  const equity = Math.max(dcf + c.cash - c.debt, annualRev * 0.08, 1);
  const value = c.bankrupt ? 0.01 : equity / s.shares;
  return {
    value,
    explain: {
      title: `${s.ticker} intrinsic value`,
      lines: [
        { label: 'Annual net income (trailing)', value: annualNet, op: '' },
        { label: 'Expected growth g', value: g, op: '', fmt: 'pct' },
        { label: 'Discount rate r (policy + 5.5% + leverage)', value: r, op: '', fmt: 'pct' },
        { label: 'DCF = FCF(1+g)/(r-g)', value: dcf, op: '=' },
        { label: 'Plus cash', value: c.cash, op: '+' },
        { label: 'Minus debt', value: c.debt, op: '-' },
        { label: 'Equity value', value: equity, op: '=' },
        { label: 'Per share', value, op: '=' },
      ],
      note: 'The traded price drifts toward this value, pushed around by market, industry, news and sentiment.',
    },
  };
}

export function eps(w: WorldState, s: Stock): number {
  return (companyOf(w, s).sum30.netIncome * 12.17) / s.shares;
}

/** Daily price update: R = a + bm*Rm + bi*Ri + bn*N + bs*S + reversion + pressure + e */
export function updatePrices(w: WorldState): void {
  const m = w.macro;
  const rateDrag = -2 * (m.rate - (w.macro.hist.at(-2)?.rate ?? m.rate)) / 30;
  const Rm = 0.00025 + 0.002 * (w.marketMood - 0.5) + rateDrag + 0.0075 * normal(w.rng);
  const Ri: Record<string, number> = {};
  for (const ind of INDUSTRY_IDS) Ri[ind] = 0.005 * normal(w.rng) + (ind === 'energy' ? 0.02 * (m.oilPrice - 1) / 30 : 0);

  for (const s of w.stocks) {
    const c = companyOf(w, s);
    s.prevClose = s.price;
    s.open = s.price;
    const fv = fairValue(w, s).value;
    s.fair = fv;
    if (c.bankrupt) {
      s.price = Math.max(0.01, s.price * 0.8);
      s.halted = true;
      pushHist(w, s);
      continue;
    }
    const reversion = 0.015 * Math.log(fv / s.price);
    let R =
      s.beta * Rm +
      0.6 * Ri[c.industry as IndustryId] +
      s.newsImpact +
      0.003 * s.sentiment +
      reversion +
      0.4 * s.pressure +
      0.011 * normal(w.rng);
    R = clamp(R, -0.1, 0.1);
    s.halted = Math.abs(R) >= 0.1;
    s.price = Math.max(0.01, s.price * (1 + R));
    s.volume = s.adv * (0.7 + Math.abs(R) * 25 + Math.abs(s.pressure) * 3) * Math.exp(0.25 * normal(w.rng));
    s.adv = clamp(s.adv * 0.97 + s.volume * 0.03, s.shares * ADV_MIN, s.shares * ADV_MAX);
    s.sentiment = clamp(s.sentiment * 0.9 + 4 * R, -1, 1);
    s.newsImpact *= 0.4;
    s.pressure = 0;
    pushHist(w, s);
  }

  // Market index (cap weighted, base 1000) and mood
  const cap = w.stocks.reduce((sum, s) => sum + s.price * s.shares, 0);
  if (!w.indexBase) w.indexBase = cap;
  w.marketIndex = (1000 * cap) / w.indexBase;
  w.marketIndexHist.push({ day: w.day, value: w.marketIndex });
  if (w.marketIndexHist.length > 400) w.marketIndexHist.shift();
  const h = w.marketIndexHist;
  const r20 = h.length > 20 ? w.marketIndex / h[h.length - 21].value - 1 : 0;
  const avgSent = w.stocks.reduce((sum, s) => sum + s.sentiment, 0) / w.stocks.length;
  const moodTarget = 1 / (1 + Math.exp(-(r20 * 8 + avgSent * 1 + (w.macro.confidence - 0.6) * 3)));
  w.marketMood += (moodTarget - w.marketMood) * 0.2;
}

function pushHist(w: WorldState, s: Stock): void {
  s.hist.push({ day: w.day, price: s.price });
  if (s.hist.length > 120) s.hist.shift();
  if (w.day % 30 === 0) {
    s.monthly.push({ day: w.day, price: s.price });
    if (s.monthly.length > 120) s.monthly.shift();
  }
}

// ---------- ownership helpers ----------

/** Shares of this stock held by you and the rivals together. */
export function sharesHeld(w: WorldState, ticker: string): number {
  let n = w.player.holdings[ticker]?.shares ?? 0;
  for (const r of w.rivals) n += r.holdings[ticker]?.shares ?? 0;
  return n;
}

/** Shares still in public hands, the only ones a buyer can get on the exchange. */
export function floatLeft(w: WorldState, s: Stock): number {
  return Math.max(0, s.shares - sharesHeld(w, s.ticker));
}

/**
 * Repairs saves made before trading was limited to real shares: rival holdings above the shares
 * that exist are scaled back, runaway volume is reset and rival cash is capped.
 */
export function repairMarket(w: WorldState): void {
  for (const s of w.stocks) {
    s.adv = clamp(Number.isFinite(s.adv) ? s.adv : 0, s.shares * ADV_MIN, s.shares * ADV_MAX);
    const mine = w.player.holdings[s.ticker]?.shares ?? 0;
    const theirs = sharesHeld(w, s.ticker) - mine;
    const room = Math.max(0, s.shares * 0.98 - mine);
    if (theirs > room && theirs > 0) {
      const k = room / theirs;
      for (const r of w.rivals) {
        const h = r.holdings[s.ticker];
        if (!h) continue;
        h.shares *= k;
        if (h.shares < 1) delete r.holdings[s.ticker];
      }
    }
  }
  const cap = Math.max(5e9, (w.macro.gdp || 0) * RIVAL_CASH_CAP);
  for (const r of w.rivals) if (!Number.isFinite(r.cash) || r.cash > cap) r.cash = cap;
}

export function holdingsOf(w: WorldState, ownerId: string): Record<string, Holding> {
  if (ownerId === 'player') return w.player.holdings;
  return w.rivals.find((r) => r.id === ownerId)!.holdings;
}

export function cashOf(w: WorldState, ownerId: string): number {
  if (ownerId === 'player') return w.player.cash;
  return w.rivals.find((r) => r.id === ownerId)!.cash;
}

export function addCash(w: WorldState, ownerId: string, delta: number): void {
  if (ownerId === 'player') w.player.cash += delta;
  else w.rivals.find((r) => r.id === ownerId)!.cash += delta;
}

/** Price for executing qty shares now, including half-spread and linear impact vs ADV. */
export function executionPrice(s: Stock, side: 'buy' | 'sell', qty: number): number {
  const impact = SPREAD / 2 + 0.15 * (qty / Math.max(1, s.adv));
  return side === 'buy' ? s.price * (1 + impact) : s.price * (1 - impact);
}

export function maxFillToday(s: Stock): number {
  return Math.floor(s.adv * MAX_DAILY_ADV_FRACTION);
}

/** Try to fill (part of) an order against today's liquidity. Returns shares filled. */
export function tryFill(w: WorldState, o: Order): number {
  const s = stockByTicker(w, o.ticker);
  if (!s || o.status !== 'open') return 0;
  if (s.halted && companyOf(w, s).bankrupt) return 0;
  if (o.lastFillDay !== w.day) {
    o.lastFillDay = w.day;
    o.filledToday = 0;
  }
  const room = maxFillToday(s) - o.filledToday;
  let qty = Math.min(o.qty - o.filled, room);
  if (qty <= 0) return 0;
  const holdings = holdingsOf(w, o.ownerId);
  if (o.side === 'sell') qty = Math.min(qty, Math.floor(holdings[o.ticker]?.shares ?? 0));
  else qty = Math.min(qty, Math.floor(floatLeft(w, s))); // you cannot buy shares nobody is selling
  let px = executionPrice(s, o.side, qty);
  if (o.type === 'limit' && o.limit != null) {
    if (o.side === 'buy' && px > o.limit) return 0;
    if (o.side === 'sell' && px < o.limit) return 0;
  }
  if (o.side === 'buy') {
    const cash = cashOf(w, o.ownerId);
    if (cash < px * qty) {
      qty = Math.floor(cash / px);
      px = executionPrice(s, 'buy', qty);
    }
  }
  if (qty <= 0) return 0;

  const value = px * qty;
  const h = holdings[o.ticker] ?? { shares: 0, avgCost: 0 };
  if (o.side === 'buy') {
    h.avgCost = (h.avgCost * h.shares + value) / (h.shares + qty);
    h.shares += qty;
    if (o.ownerId === 'player') h.since = w.day;
    addCash(w, o.ownerId, -value);
    s.pressure += qty / s.adv;
  } else {
    if (o.ownerId === 'player') {
      w.player.realizedPnl += (px - h.avgCost) * qty;
      noteStockSale(w, (px - h.avgCost) * qty, w.day - (h.since ?? -999));
    }
    h.shares -= qty;
    addCash(w, o.ownerId, value);
    s.pressure -= qty / s.adv;
  }
  if (h.shares <= 0.0001) delete holdings[o.ticker];
  else holdings[o.ticker] = h;

  o.avgFill = (o.avgFill * o.filled + value) / (o.filled + qty);
  o.filled += qty;
  o.filledToday += qty;
  if (o.filled >= o.qty) o.status = 'filled';
  return qty;
}

export function processOrders(w: WorldState): void {
  for (const o of w.orders) if (o.status === 'open') tryFill(w, o);
  // Drop old finished orders
  w.orders = w.orders.filter((o) => o.status === 'open' || w.day - o.createdDay < 30).slice(-60);
}

/** Quarterly dividends: listed companies pay out part of quarterly profit. */
export function payDividends(w: WorldState): void {
  // Private AI companies pay their partners (you, maybe) 30% of profit for their share
  for (const c of w.companies) {
    if (c.ticker || c.isPlayer || c.bankrupt || !c.partners?.length || c.automation.dividendPct > 0 || c.qAcc.net <= 0 || c.cash < c.qAcc.net) continue;
    for (const p of c.partners) {
      const part = c.qAcc.net * 0.3 * p.pct;
      c.cash -= part;
      if (p.ownerId === 'player') { w.player.cash += part; w.player.dividendsReceived += part; noteDividend(w, part); }
      else { const r = w.rivals.find((x) => x.id === p.ownerId); if (r) r.cash += part; }
    }
  }
  for (const s of w.stocks) {
    const c = companyOf(w, s);
    // companies you control pay dividends daily, per share, from their own settings
    if (c.isPlayer || c.bankrupt || c.qAcc.net <= 0 || c.cash < c.qAcc.net) continue;
    const total = c.qAcc.net * 0.3;
    const perShare = total / s.shares;
    c.cash -= total;
    const ph = w.player.holdings[s.ticker];
    if (ph) {
      w.player.cash += ph.shares * perShare;
      w.player.dividendsReceived += ph.shares * perShare;
      noteDividend(w, ph.shares * perShare);
    }
    for (const r of w.rivals) {
      const h = r.holdings[s.ticker];
      if (h) r.cash += h.shares * perShare;
    }
  }
}

export function portfolioValue(w: WorldState, holdings: Record<string, Holding>): number {
  let v = 0;
  for (const [t, h] of Object.entries(holdings)) {
    const s = stockByTicker(w, t);
    if (s) v += s.price * h.shares;
  }
  return v;
}
