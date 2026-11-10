/**
 * What rivals do with their money. Rich rivals buy out weaker companies in markets where they
 * already sell (a merger: the two now act as one group), unless the regulator steps in because
 * the group would sell more than 40% of the market. They also pay down their companies' debts
 * and spend part of a huge fortune on homes, charity and politics, so cash doesn't pile up forever.
 */
import { GOODS } from './data';
import { companyValue } from './company';
import { shareAfter } from './auctions';
import { MONOPOLY_SHARE } from './strategy';
import { addNews, fmtMoney, fmtPct } from './news';
import { chance, pick } from './rng';
import type { Company, Rival, WorldState } from './types';

/** Premium a buyer pays over a company's value */
export const MERGER_PREMIUM = 1.25;
/** Days a rival waits between takeover attempts */
const MERGER_GAP = 300;
/** Fortune a rival keeps before it starts spending on itself */
const KEEP_CASH = 2e9;
/** Share of the fortune above that spent each month */
const SPEND_RATE = 0.006;

const owner = (w: WorldState, id: string): Rival | undefined => w.rivals.find((r) => r.id === id);

/** A company a rival could take over: private, not yours, no partners of yours, not just founded */
function takeable(w: WorldState, c: Company): boolean {
  return !c.bankrupt && !c.isPlayer && !c.ticker && !c.partners?.some((p) => p.ownerId === 'player') && w.day - c.founded > 365;
}

/** Margin over the last month */
const margin = (c: Company) => (c.sum30.revenue > 0 ? c.sum30.netIncome / c.sum30.revenue : -1);

export function mergerPrice(c: Company): number {
  return Math.max(c.assets * 0.5, companyValue(c)) * MERGER_PREMIUM;
}

/** The best target for a rival: a weak company in a market where it already sells */
export function mergerTarget(w: WorldState, r: Rival): { buyer: Company; target: Company; price: number; blocked: boolean } | null {
  let best: { buyer: Company; target: Company; price: number; blocked: boolean; score: number } | null = null;
  for (const buyer of w.companies) {
    if (buyer.bankrupt || buyer.ownerId !== r.id) continue;
    for (const target of w.companies) {
      if (target.good !== buyer.good || target.ownerId === r.id || !takeable(w, target)) continue;
      const price = mergerPrice(target);
      if (price > r.cash * 0.3) continue;
      // Weak, cheap companies first: buying a struggling rival is how markets consolidate
      const score = (margin(buyer) - margin(target)) + target.capacity / Math.max(1, buyer.capacity) * 0.2;
      if (score <= 0.03) continue;
      if (!best || score > best.score) best = { buyer, target, price, blocked: shareAfter(w, target, r.id) > MONOPOLY_SHARE, score };
    }
  }
  return best;
}

/** Hand a company to its new owner. Any rival partners are paid out at the same price. */
function takeOver(w: WorldState, r: Rival, target: Company, price: number): void {
  r.cash -= price;
  const outside = (target.partners ?? []).reduce((s, p) => s + p.pct, 0);
  for (const p of target.partners ?? []) {
    const o = owner(w, p.ownerId);
    if (o) o.cash += price * p.pct;
  }
  const seller = owner(w, target.ownerId);
  if (seller) seller.cash += price * (1 - outside);
  target.partners = [];
  target.ownerId = r.id;
}

/** Monthly: rivals try takeovers, pay down debts and spend some of their fortune */
export function monthlyMergers(w: WorldState): void {
  for (const r of [...w.rivals].sort((a, b) => b.cash - a.cash)) {
    if (w.day - (r.lastMergerDay ?? -Infinity) < MERGER_GAP || !chance(w.rng, 0.08 + 0.1 * r.personality.ambition)) continue;
    const m = mergerTarget(w, r);
    if (!m) continue;
    r.lastMergerDay = w.day;
    const good = GOODS[m.buyer.good].name.toLowerCase();
    if (m.blocked) {
      addNews(w, 'business', `Regulator blocks ${m.buyer.name} deal for ${m.target.name}`,
        `${r.name} offered ${fmtMoney(m.price)}, but together they would sell more than ${fmtPct(MONOPOLY_SHARE, 0)} of all ${good}. Buyers keep their choice.`, 'neutral', [m.buyer.id, m.target.id]);
      continue;
    }
    const share = shareAfter(w, m.target, r.id);
    takeOver(w, r, m.target, m.price);
    addNews(w, 'business', `${r.name} buys ${m.target.name}`,
      `${fmtMoney(m.price)} for a ${good} maker. With ${m.buyer.name}, the group now sells about ${fmtPct(share, 0)} of the market and can set prices together.`, 'neutral', [m.buyer.id, m.target.id]);
    break; // one takeover a month across the whole economy
  }
  for (const r of w.rivals) {
    // Pay down debts of their own companies before spending on themselves
    for (const c of w.companies) {
      if (c.bankrupt || c.ownerId !== r.id || c.debt <= 0 || r.cash < KEEP_CASH) continue;
      const pay = Math.min(c.debt * 0.25, (r.cash - KEEP_CASH) * 0.03);
      r.cash -= pay;
      c.debt -= pay;
    }
    if (r.cash > KEEP_CASH) {
      const spend = (r.cash - KEEP_CASH) * SPEND_RATE;
      r.cash -= spend;
      if (spend > 2e7 && chance(w.rng, 0.03)) {
        const what = pick(w.rng, ['gives to charity', 'buys a football club', 'funds a new museum', 'backs a political campaign', 'buys a private island'])!;
        addNews(w, 'business', `${r.name} ${what}`, `About ${fmtMoney(spend * 6)} from a fortune of ${fmtMoney(r.cash)}.`, 'neutral');
      }
    }
  }
}
