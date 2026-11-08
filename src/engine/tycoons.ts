/**
 * Hands-on tycoons. Besides trading shares like the other rivals, once a month each may:
 *  - found a company in a short, growing market inside its industries (or one that feeds a
 *    company it already owns), sized to win a real slice of that market;
 *  - offer to buy a stake in one of your fast-growing private companies, at a premium.
 * They also bid at bankruptcy auctions (see auctions.ts).
 */
import { rivalHasPermit } from './licences';
import { GOODS, GOOD_IDS, LEVEL_CAP_MULT, RIVALS } from './data';
import { clamp, companyValue } from './company';
import { remember } from './contracts';
import { shareAfter } from './auctions';
import { MAX_OUTSIDE, fairStakePrice, outsidePct } from './ownership';
import { MONOPOLY_SHARE } from './strategy';
import { addNews, fmtMoney, fmtPct } from './news';
import { chance, next } from './rng';
import { newCompany, seedInputs } from './world';
import type { CommandResult, Company, GoodId, PendingEvent, Rival, WorldState } from './types';

/** Most private companies one tycoon will found. */
export const MAX_FOUNDED = 4;
/** Days between a tycoon's own new companies. */
const FOUND_GAP = 180;
/** Days between any two tycoon offers to you. */
const OFFER_GAP = 90;
/** A new tycoon company aims for this share of its market. */
const TARGET_SHARE = 0.08;
/** Only enter markets this short of supply (demand / supply). */
const MIN_TIGHTNESS = 1.08;
/** One new tycoon company per market in this many days, so they do not flood it together. */
const MARKET_GAP = 240;

const BRANDS: Record<string, string> = {
  eusk: 'Starforge', saltman: 'Cortex', bates: 'Gatewell', mambani: 'Mambani',
  bozes: 'Riverstore', muckerberg: 'Facelink', juang: 'Greencore', wuffett: 'Berkfield',
};

/** Add rivals that a save from an older version does not have yet. */
export function ensureRivals(w: WorldState): void {
  for (const r of RIVALS) {
    const have = w.rivals.find((x) => x.id === r.id);
    if (have) { if (r.tycoon) have.tycoon = true; continue; }
    w.rivals.push({
      id: r.id, name: r.name, title: r.title, focus: r.focus, weakness: r.weakness, quote: r.quote, flag: r.flag,
      personality: r.personality, cash: r.cash, holdings: {}, relation: 0, memory: [], avatarColor: r.avatarColor,
      ...(r.tycoon ? { tycoon: true } : {}),
    });
  }
}

export const tycoons = (w: WorldState): Rival[] => w.rivals.filter((r) => r.tycoon);
export const foundedBy = (w: WorldState, r: Rival): Company[] => w.companies.filter((c) => c.ownerId === r.id && !c.ticker && !c.bankrupt);

/** Goods this tycoon cares about: its industries, plus inputs and buyers of what it already owns. */
function interests(w: WorldState, r: Rival): GoodId[] {
  const owned = new Set(w.companies.filter((c) => c.ownerId === r.id && !c.bankrupt).map((c) => c.good));
  return GOOD_IDS.filter((g) => r.focus.includes(GOODS[g].industry)
    || [...owned].some((o) => GOODS[o].inputs.some((i) => i.good === g) || GOODS[g].inputs.some((i) => i.good === o)));
}

/** The best market for this tycoon to enter now, or null. */
export function foundingTarget(w: WorldState, r: Rival): { good: GoodId; score: number } | null {
  let best: { good: GoodId; score: number } | null = null;
  for (const g of interests(w, r)) {
    if (g === 'banking') continue;
    const m = w.goods[g];
    if (!m || m.tightness < MIN_TIGHTNESS) continue;
    // A real shortage of plants, not a passing supply shock: demand close to everyone's capacity
    const cap = w.companies.filter((c) => c.good === g && !c.bankrupt).reduce((s, c) => s + c.capacity, 0);
    if ((m.finalDemand + m.b2bDemand) < cap * 0.95) continue;
    if (w.companies.some((c) => c.good === g && c.id.startsWith('t') && w.day - c.founded < MARKET_GAP)) continue;
    const hist = m.hist;
    const old = hist.length > 6 ? hist[hist.length - 7].price : hist[0]?.price ?? 0;
    const now = hist[hist.length - 1]?.price ?? 0;
    const rising = old > 0 ? now / old : 1;
    const score = (m.tightness - 1) * 2 + (rising - 1) + (r.focus.includes(GOODS[g].industry) ? 0.05 : 0);
    if (!best || score > best.score) best = { good: g, score };
  }
  return best;
}

function companyName(w: WorldState, r: Rival, g: GoodId): string {
  const base = `${BRANDS[r.id] ?? r.name.split(' ').pop()} ${GOODS[g].name}`;
  let name = base;
  for (let i = 2; w.companies.some((c) => c.name === name); i++) name = `${base} ${i}`;
  return name;
}

/** Found a company: returns it, or null if there is no good market or not enough money. */
export function tycoonFound(w: WorldState, r: Rival, good?: GoodId): Company | null {
  if (foundedBy(w, r).length >= MAX_FOUNDED) return null;
  const g = good ?? foundingTarget(w, r)?.good;
  if (!g) return null;
  const def = GOODS[g];
  const market = w.companies.filter((c) => c.good === g && !c.bankrupt).reduce((s, c) => s + c.capacity, 0);
  const cap = Math.max(def.baseCapacity, market * TARGET_SHARE);
  const level = Math.max(1, 1 + Math.round(Math.log(cap / def.baseCapacity) / Math.log(LEVEL_CAP_MULT)));
  w.seq += 1;
  const c = newCompany(w, { id: `t${w.seq}`, name: companyName(w, r, g), good: g, ownerId: r.id, isPlayer: false, ticker: null, level, capacity: cap });
  if (shareAfter(w, c, r.id) > MONOPOLY_SHARE) return null;
  const working = cap * def.p0 * 30;
  const permit = rivalHasPermit(w, r.id, g) ? 0 : def.permit ?? 0;
  const cost = c.assets + working + permit;
  // A mega business is a once-in-a-career bet: they will spend up to half their cash on one
  if (cost > r.cash * (permit ? 0.5 : 0.18)) return null;
  r.cash -= cost;
  if (permit) w.macro.govDebt = Math.max(0, w.macro.govDebt - permit);
  c.cash = working;
  c.automation = { ...c.automation, dividendPct: 30 };
  c.inventory = cap * 0.2;
  c.invCost = def.p0 * 0.5;
  seedInputs(w, c, 6, cap * 0.7);
  w.companies.push(c);
  r.lastMoveDay = w.day;
  addNews(w, 'business', `${r.name} launches ${c.name}`,
    `The ${r.title.replace(/^The /, '').toLowerCase()} spends ${fmtMoney(cost)} to grab ${fmtPct(TARGET_SHARE, 0)} of the ${def.name.toLowerCase()} market.`, 'neutral', [c.id]);
  return c;
}

/** Revenue now against two months ago (1 = flat). */
function growth(c: Company): number {
  const h = c.hist;
  if (h.length < 60) return 1;
  const avg = (a: number, b: number) => h.slice(a, b).reduce((s, x) => s + x.revenue, 0) / Math.max(1, b - a);
  const now = avg(h.length - 15, h.length);
  const then = avg(h.length - 60, h.length - 45);
  return then > 0 ? now / then : 1;
}

/** One of your private companies a tycoon would buy into, with the stake and price. */
export function stakeTarget(w: WorldState, r: Rival): { c: Company; pct: number; price: number } | null {
  let best: { c: Company; pct: number; price: number; score: number } | null = null;
  for (const c of w.companies) {
    if (!c.isPlayer || c.bankrupt || c.ticker || c.sum30.netIncome <= 0) continue;
    if (companyValue(c) < 200_000) continue;
    const room = MAX_OUTSIDE - outsidePct(c);
    if (room < 0.1) continue;
    const gr = growth(c);
    const short = (w.goods[c.good]?.tightness ?? 1) > 1.06;
    if (gr < 1.05 && !short) continue;
    const fits = r.focus.includes(c.industry) || interests(w, r).includes(c.good);
    if (!fits) continue;
    const pct = Math.min(room, gr > 1.25 ? 0.2 : 0.15);
    const price = fairStakePrice(c, pct) * (1.1 + r.personality.ambition * 0.2 + r.relation / 500);
    if (price > r.cash * 0.1) continue;
    const score = gr + (short ? 0.1 : 0);
    if (!best || score > best.score) best = { c, pct, price, score };
  }
  return best;
}

function offerStake(w: WorldState, r: Rival): boolean {
  const t = stakeTarget(w, r);
  if (!t) return false;
  const { c, pct, price } = t;
  const ev: PendingEvent = {
    id: `ev${++w.seq}`, template: 'tycoonStake', day: w.day, companyId: c.id, rivalId: r.id, expiresDay: w.day + 10, amount: price, pct,
    title: `${r.name} wants in on ${c.name}`,
    body: `"${r.quote}" ${r.name} offers ${fmtMoney(price)} for ${fmtPct(pct, 0)} of ${c.name}, about ${fmtPct(price / Math.max(1, fairStakePrice(c, pct)) - 1, 0)} over its fair price. The money goes into the company, and ${r.name.split(' ')[0]} takes that share of its dividends.`,
    choices: [
      { id: 'accept', label: `Accept ${fmtMoney(price)}`, detail: `${fmtPct(pct, 0)} stake · cash into the company · +Relations` },
      { id: 'counter', label: `Ask for ${fmtMoney(price * 1.25)}`, detail: 'They may agree, or walk away annoyed' },
      { id: 'decline', label: 'Decline', detail: 'Keep all of it' },
    ],
  };
  w.pending.push(ev);
  r.lastOfferDay = w.day;
  return true;
}

function addPartner(w: WorldState, c: Company, r: Rival, pct: number, price: number): void {
  c.cash += price;
  r.cash -= price;
  const ps = (c.partners ??= []);
  const p = ps.find((x) => x.ownerId === r.id);
  if (p) { p.pct += pct; p.paid += price; } else ps.push({ ownerId: r.id, name: r.name, pct, paid: price, day: w.day });
  addNews(w, 'player', `${r.name} buys ${fmtPct(pct, 0)} of ${c.name}`, `The deal puts ${fmtMoney(price)} into the company.`, 'good', [c.id]);
}

export function resolveTycoonEvent(w: WorldState, ev: PendingEvent, c: Company, choiceId: string): CommandResult {
  const r = w.rivals.find((x) => x.id === ev.rivalId);
  if (!r) return { ok: true, message: 'The offer lapsed.' };
  const pct = ev.pct ?? 0.1;
  const price = ev.amount ?? 0;
  const fits = (p: number) => outsidePct(c) + pct <= MAX_OUTSIDE + 1e-9 && r.cash >= p;
  if (choiceId === 'accept') {
    if (!fits(price)) return { ok: true, message: 'The deal no longer fits: partners can own at most 49%.' };
    addPartner(w, c, r, pct, price);
    remember(r, w, 6, `Took my money for ${c.name}.`);
    return { ok: true, message: `${r.name} put ${fmtMoney(price)} into ${c.name} for ${fmtPct(pct, 0)}` };
  }
  if (choiceId === 'counter') {
    const yes = next(w.rng) < clamp(0.6 - r.personality.negotiation * 0.35 + r.relation / 200 + r.personality.ambition * 0.15, 0.1, 0.8);
    if (yes && fits(price * 1.25)) {
      addPartner(w, c, r, pct, price * 1.25);
      remember(r, w, 2, `Drove a hard bargain on ${c.name}.`);
      return { ok: true, message: `${r.name} agreed: ${fmtMoney(price * 1.25)} for ${fmtPct(pct, 0)}` };
    }
    remember(r, w, -5, `Got greedy over ${c.name}.`);
    return { ok: true, message: `${r.name} walked away.` };
  }
  remember(r, w, -2, `Turned down my offer for ${c.name}.`);
  return { ok: true, message: 'Offer declined.' };
}

/** Monthly: each tycoon may found a company or make you an offer. */
export function monthlyTycoons(w: WorldState): void {
  const list = tycoons(w);
  const lastOffer = Math.max(-Infinity, ...list.map((r) => r.lastOfferDay ?? -Infinity));
  let offered = w.day - lastOffer < OFFER_GAP || w.pending.length > 0;
  for (const r of list) {
    const p = r.personality;
    if (w.day - (r.lastMoveDay ?? -Infinity) >= FOUND_GAP && chance(w.rng, 0.15 + p.ambition * 0.15 + p.risk * 0.1)) tycoonFound(w, r);
    if (!offered && w.day > 120 && chance(w.rng, 0.12 + p.aggression * 0.1)) offered = offerStake(w, r);
  }
}
