/**
 * Who owns a company, and how ownership changes hands:
 *  - Partner stakes: investors (or you) put money into a private company for a share of it.
 *  - Takeovers: buy a company outright, or more than half of a listed company's shares.
 *  - Selling: rivals and a fund make offers for your private companies.
 */
import { clamp, companyValue } from './company';
import { remember } from './contracts';
import { stockByTicker } from './market';
import { grantLicence } from './licences';
import { addNews, fmtMoney, fmtPct } from './news';
import type { CommandResult, Company, Partner, Rival, WorldState } from './types';

/** Outside partners may own at most this much of your company, so you keep control. */
export const MAX_OUTSIDE = 0.49;
export const FUND_ID = 'fund';
export const FUND_NAME = 'Astoria Growth Fund';
/** Control of a listed company comes with more than half its shares. */
export const CONTROL = 0.5;

const ok = (message: string): CommandResult => ({ ok: true, message });
const fail = (message: string): CommandResult => ({ ok: false, message });

export const partnersOf = (c: Company): Partner[] => c.partners ?? [];
const rivalById = (w: WorldState, id: string): Rival | undefined => w.rivals.find((r) => r.id === id);

/** Fraction owned by partners other than you. */
export function outsidePct(c: Company): number {
  return partnersOf(c).filter((p) => p.ownerId !== 'player').reduce((s, p) => s + p.pct, 0);
}

/** Fraction of a company you own (shares for listed companies, stakes for private ones). */
export function playerPct(w: WorldState, c: Company): number {
  if (c.ticker) {
    const s = stockByTicker(w, c.ticker);
    return s ? (w.player.holdings[c.ticker]?.shares ?? 0) / s.shares : 0;
  }
  if (c.isPlayer) return 1 - outsidePct(c);
  return partnersOf(c).find((p) => p.ownerId === 'player')?.pct ?? 0;
}

function payTo(w: WorldState, ownerId: string, amount: number): void {
  if (ownerId === 'player') w.player.cash += amount;
  else { const rv = rivalById(w, ownerId); if (rv) rv.cash += amount; }
  // the fund and the public are outside the game's books
}

/** Pay money out of a company to its owners in proportion to what they own. Returns your part. */
export function payOwners(w: WorldState, c: Company, amount: number): number {
  if (amount <= 0) return 0;
  let mine = 0;
  if (c.ticker) {
    const s = stockByTicker(w, c.ticker);
    if (!s) return 0;
    const per = amount / s.shares;
    mine = (w.player.holdings[c.ticker]?.shares ?? 0) * per;
    for (const r of w.rivals) { const h = r.holdings[c.ticker]; if (h) r.cash += h.shares * per; }
  } else {
    let rest = 1;
    for (const p of partnersOf(c)) {
      rest -= p.pct;
      if (p.ownerId === 'player') mine += amount * p.pct;
      else payTo(w, p.ownerId, amount * p.pct);
    }
    const ownerPart = amount * Math.max(0, rest);
    if (c.isPlayer) mine += ownerPart;
    else payTo(w, c.ownerId, ownerPart);
  }
  w.player.cash += mine;
  return mine;
}

// ---------- partner stakes ----------

export interface StakeOffer { buyerId: string; name: string; price: number; ok: boolean; why: string }

/**
 * New money for a stake p is priced on the value after the money goes in: X = p * V / (1 - p).
 * So your share keeps its value at a fair price, and the company gets X in cash.
 */
export function fairStakePrice(c: Company, pct: number): number {
  return (companyValue(c) * pct) / Math.max(0.05, 1 - pct);
}

export function stakeOffers(w: WorldState, c: Company, pct: number): StakeOffer[] {
  const fair = fairStakePrice(c, pct);
  const out: StakeOffer[] = [];
  const tooSmall = companyValue(c) < 50_000;
  const tooMuch = outsidePct(c) + pct > MAX_OUTSIDE + 1e-9;
  const base = tooSmall ? 'Worth too little to raise money yet' : tooMuch ? `Partners can own at most ${fmtPct(MAX_OUTSIDE, 0)}` : '';
  out.push({ buyerId: FUND_ID, name: FUND_NAME, price: fair * 0.92, ok: !base, why: base || 'Always buys, at an 8% discount' });
  for (const rv of w.rivals) {
    const focus = rv.focus.includes(c.industry);
    const mult = 0.97 + rv.relation / 400 + (focus ? 0.06 : 0) + rv.personality.ambition * 0.05;
    const price = fair * mult;
    let why = base;
    if (!why && rv.relation < -20) why = 'Does not trust you';
    else if (!why && rv.cash < price) why = 'Not enough cash';
    out.push({ buyerId: rv.id, name: rv.name, price, ok: !why, why: why || (focus ? 'Knows this industry' : mult >= 1 ? 'Pays a premium' : 'Pays a little under value') });
  }
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || b.price - a.price);
}

export function sellStake(w: WorldState, c: Company, pct: number, buyerId: string): CommandResult {
  pct = clamp(Math.round(pct * 100) / 100, 0.01, MAX_OUTSIDE);
  const offer = stakeOffers(w, c, pct).find((o) => o.buyerId === buyerId);
  if (!offer) return fail('Unknown investor');
  if (!offer.ok) return fail(offer.why);
  c.cash += offer.price;
  const rv = rivalById(w, buyerId);
  if (rv) rv.cash -= offer.price;
  const ps = (c.partners ??= []);
  const p = ps.find((x) => x.ownerId === buyerId);
  if (p) { p.pct += pct; p.paid += offer.price; } else ps.push({ ownerId: buyerId, name: offer.name, pct, paid: offer.price, day: w.day });
  if (rv) remember(rv, w, 4, `Bought ${fmtPct(pct, 0)} of ${c.name}.`);
  addNews(w, 'player', `${offer.name} buys ${fmtPct(pct, 0)} of ${c.name}`, `The investment puts ${fmtMoney(offer.price)} into the company.`, 'good', [c.id]);
  return ok(`${offer.name} put ${fmtMoney(offer.price)} into ${c.name} for ${fmtPct(pct, 0)}`);
}

/** Buying a partner out costs their share of today's value plus 10%. */
export function buyBackPrice(c: Company, p: Partner): number {
  return companyValue(c) * p.pct * 1.1;
}

export function buyBackStake(w: WorldState, c: Company, partnerId: string): CommandResult {
  const p = partnersOf(c).find((x) => x.ownerId === partnerId);
  if (!p) return fail('No such partner');
  const price = buyBackPrice(c, p);
  if (w.player.cash < price) return fail(`Buying back costs ${fmtMoney(price)} of personal cash`);
  w.player.cash -= price;
  payTo(w, p.ownerId, price);
  c.partners = partnersOf(c).filter((x) => x !== p);
  const rv = rivalById(w, p.ownerId);
  if (rv) remember(rv, w, 2, `Sold their ${c.name} stake back to you at a profit.`);
  return ok(`Bought back ${p.name}'s ${fmtPct(p.pct, 0)} for ${fmtMoney(price)}`);
}

/** Terms for you buying into a private AI company: new money in, at a premium to value. */
export function buyStakeTerms(w: WorldState, c: Company, pct: number): { price: number; ok: boolean; why: string } {
  const have = playerPct(w, c);
  const rv = rivalById(w, c.ownerId);
  const mult = rv ? 1.05 + Math.max(0, -rv.relation) / 200 : 1.05;
  const price = fairStakePrice(c, pct) * mult;
  let why = '';
  if (c.ticker) why = 'Listed company: buy its shares on the exchange';
  else if (c.isPlayer || c.bankrupt) why = 'Not available';
  else if (outsidePct(c) + have + pct > MAX_OUTSIDE + 1e-9) why = `Partners can own at most ${fmtPct(MAX_OUTSIDE, 0)}; make a takeover bid for more`;
  else if (rv && rv.relation < -10) why = `${rv.name} will not sell to you`;
  else if (companyValue(c) < 50_000) why = 'Worth too little';
  else if (w.player.cash < price) why = `Costs ${fmtMoney(price)} of personal cash`;
  return { price, ok: !why, why };
}

export function buyStake(w: WorldState, c: Company, pct: number): CommandResult {
  pct = clamp(Math.round(pct * 100) / 100, 0.01, MAX_OUTSIDE);
  const t = buyStakeTerms(w, c, pct);
  if (!t.ok) return fail(t.why);
  w.player.cash -= t.price;
  c.cash += t.price;
  const ps = (c.partners ??= []);
  const p = ps.find((x) => x.ownerId === 'player');
  if (p) { p.pct += pct; p.paid += t.price; } else ps.push({ ownerId: 'player', name: w.player.name, pct, paid: t.price, day: w.day });
  remember(rivalById(w, c.ownerId), w, 3, `You invested in ${c.name}.`);
  addNews(w, 'player', `You buy ${fmtPct(pct, 0)} of ${c.name}`, `Your ${fmtMoney(t.price)} goes into the company. You share in its dividends.`, 'good', [c.id]);
  return ok(`Bought ${fmtPct(pct, 0)} of ${c.name} for ${fmtMoney(t.price)}`);
}

// ---------- takeovers ----------

export interface Holder { id: string; name: string; pct: number; shares: number; minPremium: number }

/** Premium over market price (or value) an owner wants before selling. Infinity = will not sell. */
export function minPremium(w: WorldState, c: Company, holderId: string): number {
  const rv = rivalById(w, holderId);
  if (!rv) return c.ticker ? 0.25 : 0.2; // the public and the fund
  if (rv.relation < -50) return Infinity;
  const m = 0.18 + (c.ownerId === rv.id ? 0.15 : 0) + (rv.focus.includes(c.industry) ? 0.05 : 0) + rv.personality.patience * 0.05 - rv.relation / 250;
  return clamp(m, 0.05, 0.6);
}

/** Everyone who owns part of a company besides you. */
export function holdersOf(w: WorldState, c: Company): Holder[] {
  const out: Holder[] = [];
  if (c.ticker) {
    const s = stockByTicker(w, c.ticker);
    if (!s) return out;
    let held = w.player.holdings[c.ticker]?.shares ?? 0;
    for (const r of w.rivals) {
      const h = r.holdings[c.ticker];
      if (!h || h.shares <= 0) continue;
      held += h.shares;
      out.push({ id: r.id, name: r.name, pct: h.shares / s.shares, shares: h.shares, minPremium: minPremium(w, c, r.id) });
    }
    const pub = Math.max(0, s.shares - held);
    if (pub > 0) out.push({ id: 'public', name: 'Public shareholders', pct: pub / s.shares, shares: pub, minPremium: minPremium(w, c, 'public') });
  } else {
    let rest = 1 - playerPct(w, c);
    for (const p of partnersOf(c)) {
      if (p.ownerId === 'player') continue;
      rest -= p.pct;
      out.push({ id: p.ownerId, name: p.name, pct: p.pct, shares: 0, minPremium: minPremium(w, c, p.ownerId) });
    }
    const rv = rivalById(w, c.ownerId);
    out.unshift({ id: c.ownerId, name: rv?.name ?? 'Public owners', pct: Math.max(0, rest), shares: 0, minPremium: minPremium(w, c, c.ownerId) });
  }
  return out;
}

export interface BidQuote {
  ok: boolean;
  why: string;
  /** Price per share (listed) or for 100% (private) */
  unitPrice: number;
  cost: number;
  /** Fraction you would own after the bid */
  after: number;
  holders: (Holder & { accepts: boolean })[];
}

export function bidQuote(w: WorldState, c: Company, premium: number, mode: 'all' | 'majority'): BidQuote {
  const holders = holdersOf(w, c).map((h) => ({ ...h, accepts: premium + 1e-9 >= h.minPremium }));
  const target = c.ticker && mode === 'majority' ? Math.max(0.51, playerPct(w, c)) : 1;
  const empty = (why: string): BidQuote => ({ ok: false, why, unitPrice: 0, cost: 0, after: target, holders });
  if (c.isPlayer) return empty('You already control it');
  if (c.bankrupt) return empty('Bankrupt');
  if (c.ticker) {
    const s = stockByTicker(w, c.ticker)!;
    const px = s.price * (1 + premium);
    const mineShares = w.player.holdings[c.ticker]?.shares ?? 0;
    const willing = holders.filter((h) => h.accepts).reduce((t, h) => t + h.shares, 0);
    if (mode === 'all') {
      const cost = (s.shares - mineShares) * px;
      if ((mineShares + willing) / s.shares <= CONTROL) return { ...empty('Too few owners would sell at this price'), unitPrice: px, cost };
      if (w.player.cash < cost) return { ...empty(`Needs ${fmtMoney(cost)} of personal cash`), unitPrice: px, cost };
      return { ok: true, why: 'Holders of over half the shares accept, so the rest must sell too', unitPrice: px, cost, after: 1, holders };
    }
    const need = Math.ceil(s.shares * 0.51) - mineShares;
    const cost = need * px;
    if (willing < need) return { ...empty('Too few owners would sell at this price'), unitPrice: px, cost };
    if (w.player.cash < cost) return { ...empty(`Needs ${fmtMoney(cost)} of personal cash`), unitPrice: px, cost };
    return { ok: true, why: 'Buys just over half the shares from willing sellers', unitPrice: px, cost, after: (mineShares + need) / s.shares, holders };
  }
  const value = companyValue(c);
  const price = value * (1 + premium);
  const cost = price * (1 - playerPct(w, c));
  if (value < 1) return empty('Worth nothing');
  const refuse = holders.find((h) => !h.accepts && h.pct > 0);
  if (refuse) return { ...empty(`${refuse.name} wants at least ${fmtPct(refuse.minPremium, 0)} over value`), unitPrice: price, cost };
  if (w.player.cash < cost) return { ...empty(`Needs ${fmtMoney(cost)} of personal cash`), unitPrice: price, cost };
  return { ok: true, why: 'The owners accept', unitPrice: price, cost, after: 1, holders };
}

/** Remove a company from the exchange (keeps the index level continuous). */
export function delist(w: WorldState, c: Company): void {
  const t = c.ticker;
  if (!t) return;
  const capBefore = w.stocks.reduce((s, x) => s + x.price * x.shares, 0);
  w.stocks = w.stocks.filter((s) => s.ticker !== t);
  const capAfter = w.stocks.reduce((s, x) => s + x.price * x.shares, 0);
  if (capBefore > 0 && w.indexBase) w.indexBase *= capAfter / capBefore;
  delete w.player.holdings[t];
  for (const r of w.rivals) delete r.holdings[t];
  for (const o of w.orders) if (o.ticker === t && o.status === 'open') o.status = 'cancelled';
  c.ticker = null;
}

/** You now run the company. */
function takeControl(w: WorldState, c: Company, how: string, grudge = -12): void {
  const rv = rivalById(w, c.ownerId);
  c.isPlayer = true;
  c.ownerId = 'player';
  grantLicence(w, c.industry); // the company's licence comes with it
  c.partners = partnersOf(c).filter((p) => p.ownerId !== 'player');
  if (!c.partners.length) delete c.partners;
  c.automation = { ...c.automation, dividendPct: c.ticker ? 30 : 50, minCash: Math.max(5_000, c.automation.minCash) };
  delete c.priceSetDay;
  // Deals between two of your own companies are just internal transfers now
  w.contracts = w.contracts.filter((k) => {
    if (k.sellerId !== c.id && k.buyerId !== c.id) return true;
    const other = w.companies.find((x) => x.id === (k.sellerId === c.id ? k.buyerId : k.sellerId));
    return !other?.isPlayer;
  });
  if (rv) remember(rv, w, grudge, grudge <= -8 ? `You took ${c.name} from me.` : `Sold ${c.name} to you.`);
  addNews(w, 'player', `You take control of ${c.name}`, how, 'good', [c.id]);
}

function loseControl(w: WorldState, c: Company): void {
  const t = c.ticker!;
  let owner = 'public';
  let most = 0;
  for (const r of w.rivals) { const h = r.holdings[t]?.shares ?? 0; if (h > most) { most = h; owner = r.id; } }
  c.isPlayer = false;
  c.ownerId = owner;
  c.automation = { ...c.automation, dividendPct: 0 };
  addNews(w, 'player', `You lose control of ${c.name}`, 'You now own less than half its shares.', 'bad', [c.id]);
}

export function bidCompany(w: WorldState, c: Company, premium: number, mode: 'all' | 'majority'): CommandResult {
  premium = clamp(premium, 0, 1);
  const q = bidQuote(w, c, premium, c.ticker ? mode : 'all');
  if (!q.ok) return fail(q.why);
  w.player.cash -= q.cost;
  if (c.ticker) {
    const s = stockByTicker(w, c.ticker)!;
    const mine = w.player.holdings[c.ticker] ?? { shares: 0, avgCost: 0 };
    if (mode === 'all') {
      for (const r of w.rivals) {
        const h = r.holdings[c.ticker];
        if (h) {
          r.cash += h.shares * q.unitPrice;
          remember(r, w, q.holders.find((x) => x.id === r.id)?.accepts ? 2 : -6, `Bought out my ${c.ticker} shares.`);
        }
      }
      const name = s.ticker;
      const ownerAccepts = q.holders.find((x) => x.id === c.ownerId)?.accepts ?? true;
      delist(w, c);
      takeControl(w, c, `You bought every share at ${fmtMoney(q.unitPrice)} (${fmtPct(premium, 0)} over market), ${fmtMoney(q.cost)} in all. ${name} leaves the exchange.`, ownerAccepts ? -4 : -12);
      return ok(`You now own all of ${c.name}`);
    }
    // Majority: buy pro rata from the willing sellers until you hold just over half
    const need = Math.ceil(s.shares * 0.51) - mine.shares;
    const willing = q.holders.filter((h) => h.accepts);
    const pool = willing.reduce((t, h) => t + h.shares, 0);
    const frac = need / pool;
    for (const h of willing) {
      const rv = rivalById(w, h.id);
      if (!rv) continue;
      const hh = rv.holdings[c.ticker]!;
      const n = hh.shares * frac;
      hh.shares -= n;
      rv.cash += n * q.unitPrice;
      if (hh.shares <= 0.0001) delete rv.holdings[c.ticker];
    }
    mine.avgCost = (mine.avgCost * mine.shares + q.cost) / (mine.shares + need);
    mine.shares += need;
    w.player.holdings[c.ticker] = mine;
    s.newsImpact += 0.03;
    const ownerSold = q.holders.find((x) => x.id === c.ownerId)?.accepts ?? false;
    takeControl(w, c, `You bought ${Math.round(need).toLocaleString()} shares at ${fmtMoney(q.unitPrice)} and now own ${fmtPct(q.after, 0)}. It stays listed and other shareholders share its dividends.`, ownerSold ? -6 : -12);
    return ok(`You control ${c.name} with ${fmtPct(q.after, 0)} of its shares`);
  }
  // Private company: pay every other owner their share
  const value = q.unitPrice;
  for (const h of q.holders) payTo(w, h.id, value * h.pct);
  for (const h of q.holders) { const rv = rivalById(w, h.id); if (rv && h.id !== c.ownerId) remember(rv, w, 2, `Sold you their part of ${c.name}.`); }
  c.partners = [];
  takeControl(w, c, `You bought ${c.name} for ${fmtMoney(q.cost)}.`, -2);
  return ok(`You bought ${c.name}`);
}

/** Daily: whoever owns more than half the shares of a listed company runs it. */
export function checkControl(w: WorldState): void {
  for (const s of w.stocks) {
    const c = w.companies.find((x) => x.id === s.companyId);
    if (!c || c.bankrupt) continue;
    const pct = (w.player.holdings[s.ticker]?.shares ?? 0) / s.shares;
    if (!c.isPlayer && pct > CONTROL) takeControl(w, c, `You now own ${fmtPct(pct, 0)} of its shares.`);
    else if (c.isPlayer && pct <= CONTROL) loseControl(w, c);
  }
}

// ---------- selling a company ----------

export interface SaleOffer { buyerId: string; name: string; price: number; ok: boolean; why: string }

/** Offers for 100% of one of your private companies. Partners are paid their share. */
export function saleOffers(w: WorldState, c: Company): SaleOffer[] {
  const value = companyValue(c);
  const out: SaleOffer[] = [{ buyerId: FUND_ID, name: FUND_NAME, price: value * 0.85, ok: value > 0, why: 'Always buys, at a 15% discount' }];
  for (const rv of w.rivals) {
    const focus = rv.focus.includes(c.industry);
    const price = value * (0.92 + rv.relation / 400 + (focus ? 0.12 : 0) + rv.personality.ambition * 0.06);
    let why = '';
    if (rv.relation < -40) why = 'Will not deal with you';
    else if (rv.cash < price) why = 'Not enough cash';
    out.push({ buyerId: rv.id, name: rv.name, price, ok: !why && value > 0, why: why || (focus ? 'Wants this industry' : 'Fair offer') });
  }
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || b.price - a.price);
}

/** Hand a company over to a buyer and split the money with its partners. Returns your part. */
export function transferCompany(w: WorldState, c: Company, buyerId: string, price: number): number {
  const rv = rivalById(w, buyerId);
  if (rv) rv.cash -= price;
  let rest = 1;
  for (const p of partnersOf(c)) { rest -= p.pct; payTo(w, p.ownerId, price * p.pct); }
  const mine = price * Math.max(0, rest);
  w.player.cash += mine;
  c.isPlayer = false;
  c.ownerId = rv ? rv.id : 'public';
  delete c.partners;
  c.automation = { ...c.automation, dividendPct: rv ? 30 : 0 };
  if (rv) remember(rv, w, 8, `Bought ${c.name} from you.`);
  addNews(w, 'business', `${rv?.name ?? FUND_NAME} acquires ${c.name}`, `The deal is worth ${fmtMoney(price)}.`, 'neutral', [c.id]);
  return mine;
}

export function sellCompany(w: WorldState, c: Company, buyerId: string): CommandResult {
  if (c.ticker) return fail('Listed company: sell its shares on the exchange');
  const o = saleOffers(w, c).find((x) => x.buyerId === buyerId);
  if (!o) return fail('Unknown buyer');
  if (!o.ok) return fail(o.why);
  const mine = transferCompany(w, c, buyerId, o.price);
  return ok(`Sold ${c.name} to ${o.name}${mine < o.price ? `: ${fmtMoney(mine)} is your share` : ` for ${fmtMoney(o.price)}`}`);
}
