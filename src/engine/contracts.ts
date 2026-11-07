/**
 * Supply contracts between companies. The player can offer a deal from one of their companies to
 * an AI company that makes or uses the same good. AI partners judge the price against the market,
 * and rival owners remember generous (or stingy) deals.
 */
import { GOODS } from './data';
import { clamp, refPrice } from './company';
import { plannedOutput } from './economy';
import { addNews, fmtPct, fmtPrice } from './news';
import type { CommandResult, Company, Contract, GoodId, Rival, WorldState } from './types';

export const MIN_DAYS = 14;
export const MAX_DAYS = 180;

export function ownerRival(w: WorldState, c: Company): Rival | undefined {
  return w.rivals.find((r) => r.id === c.ownerId);
}

export function remember(rv: Rival | undefined, w: WorldState, delta: number, text: string): void {
  if (!rv || delta === 0) return;
  rv.relation = clamp(rv.relation + delta, -100, 100);
  rv.memory.unshift({ day: w.day, text, delta });
  rv.memory.length = Math.min(rv.memory.length, 20);
}

/** Daily units a company needs of an input good at its planned output. */
export function dailyNeed(c: Company, good: GoodId): number {
  const i = GOODS[c.good].inputs.find((x) => x.good === good);
  return i ? plannedOutput(c) * i.qty : 0;
}

/** AI companies the player could sign a deal with for this company. */
export function dealPartners(w: WorldState, c: Company): { buyers: Company[]; sellers: { good: GoodId; companies: Company[] }[] } {
  const others = w.companies.filter((x) => !x.isPlayer && !x.bankrupt);
  const buyers = others.filter((x) => GOODS[x.good].inputs.some((i) => i.good === c.good));
  const sellers = GOODS[c.good].inputs.map((i) => ({ good: i.good, companies: others.filter((x) => x.good === i.good) }));
  return { buyers, sellers };
}

/** How the AI partner judges an offer; positive score = accept. */
export function judgeOffer(
  w: WorldState, mine: Company, partner: Company, side: 'sell' | 'buy', qtyPerDay: number, price: number,
): { accept: boolean; reason: string; fair: number } {
  const good = side === 'sell' ? mine.good : partner.good;
  const ref = refPrice(w, good);
  const rv = ownerRival(w, partner);
  const rel = rv ? rv.relation / 100 : 0;
  if (rv && rv.relation <= -40) return { accept: false, reason: `${rv.name} refuses to deal with you`, fair: ref };
  if (side === 'sell') {
    const need = dailyNeed(partner, good);
    if (need <= 0) return { accept: false, reason: `${partner.name} does not use ${GOODS[good].name.toLowerCase()}`, fair: ref };
    if (qtyPerDay > need * 1.2) return { accept: false, reason: `Too much: they only use about ${Math.round(need).toLocaleString()} ${GOODS[good].unit} a day`, fair: ref };
    const maxPrice = ref * (0.99 + 0.06 * rel);
    return price <= maxPrice
      ? { accept: true, reason: 'Accepted', fair: maxPrice }
      : { accept: false, reason: `Too expensive: they would pay up to ${fmtPrice(maxPrice)}`, fair: maxPrice };
  }
  const spare = partner.capacity * 0.5;
  if (qtyPerDay > spare) return { accept: false, reason: `Too much: they can commit about ${Math.round(spare).toLocaleString()} a day`, fair: ref };
  const minPrice = ref * (1.01 - 0.06 * rel);
  return price >= minPrice
    ? { accept: true, reason: 'Accepted', fair: minPrice }
    : { accept: false, reason: `Too cheap: they want at least ${fmtPrice(minPrice)}`, fair: minPrice };
}

export function offerContract(
  w: WorldState, mine: Company, partner: Company, side: 'sell' | 'buy', qtyPerDay: number, price: number, days: number,
): CommandResult {
  if (qtyPerDay <= 0 || price <= 0) return { ok: false, message: 'Enter a quantity and price' };
  const d = Math.round(clamp(days, MIN_DAYS, MAX_DAYS));
  const verdict = judgeOffer(w, mine, partner, side, qtyPerDay, price);
  const rv = ownerRival(w, partner);
  if (!verdict.accept) return { ok: false, message: verdict.reason };
  const good = side === 'sell' ? mine.good : partner.good;
  w.seq += 1;
  const k: Contract = {
    id: `k${w.seq}`, good, sellerId: side === 'sell' ? mine.id : partner.id, buyerId: side === 'sell' ? partner.id : mine.id,
    qtyPerDay, price, startDay: w.day + 1, endDay: w.day + d, shortfall: 0, delivered: 0,
  };
  w.contracts.push(k);
  const ref = refPrice(w, good);
  const discount = side === 'sell' ? 1 - price / ref : price / ref - 1; // generosity toward the partner
  if (rv) {
    const delta = Math.round(clamp(discount * 60, -6, 15));
    remember(rv, w, delta, delta > 0 ? `${mine.name} gave ${partner.name} a generous ${GOODS[good].name.toLowerCase()} deal.` : `Signed a ${GOODS[good].name.toLowerCase()} deal with ${mine.name}.`);
  }
  addNews(w, 'player', `${mine.name} signs ${GOODS[good].name.toLowerCase()} deal with ${partner.name}`,
    `${Math.round(qtyPerDay).toLocaleString()} ${GOODS[good].unit} a day at ${fmtPrice(price)} for ${d} days (${discount >= 0 ? `${fmtPct(discount, 0)} better than market for them` : `${fmtPct(-discount, 0)} in your favour`}).`, 'good', [mine.id, partner.id]);
  return { ok: true, message: `Deal signed with ${partner.name}` };
}

export function cancelContract(w: WorldState, id: string): CommandResult {
  const k = w.contracts.find((x) => x.id === id);
  if (!k) return { ok: false, message: 'Deal not found' };
  const mine = w.companies.find((c) => c.isPlayer && (c.id === k.sellerId || c.id === k.buyerId));
  if (!mine) return { ok: false, message: 'Not your deal' };
  const partner = w.companies.find((c) => c.id === (k.sellerId === mine.id ? k.buyerId : k.sellerId));
  w.contracts = w.contracts.filter((x) => x.id !== id);
  if (partner) remember(ownerRival(w, partner), w, -8, `${mine.name} broke our ${GOODS[k.good].name.toLowerCase()} deal.`);
  return { ok: true, message: 'Deal cancelled. The partner will remember.' };
}

/** Contracts a company is part of. */
export function contractsOf(w: WorldState, c: Company): Contract[] {
  return w.contracts.filter((k) => k.sellerId === c.id || k.buyerId === c.id);
}
