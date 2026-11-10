/**
 * Countries and trade. Astoria is home; eight other countries each have things they lack and
 * things they have spare, their own currency, tariffs and a distance by sea. Countries trade with
 * each other too: a war cuts that trade, so the warring sides (and their friends) run short and
 * pay more. You ship goods out of your warehouses to sell abroad, buy cheap spare goods to bring
 * home, or swap goods in barter deals. Trading with a country builds goodwill and lowers its tariffs.
 */
import { GOODS } from './data';
import { clamp, refPrice } from './company';
import { addNews, fmtMoney } from './news';
import { banner, unlocked, unlockLevel } from './rewards';
import { chance, createRng, normal, pick, range } from './rng';
import { storable, store, takeStock, totalRoom } from './warehouse';
import type { CommandResult, GoodId, Shipment, TradeState, WorldState } from './types';

export interface Nation {
  id: string;
  name: string;
  short: string;
  identity: string;
  advantage: string;
  currency: string;
  /** Dollars per unit of its currency at the start */
  fx0: number;
  /** Tariff on goods you sell there, before relations */
  tariff: number;
  /** Days by sea from Astoria */
  shipDays: number;
  needs: GoodId[];
  spare: GoodId[];
  /** Starting relation with Astoria, -1..1 */
  rel0: number;
  /** Normal yearly growth, and the interest rate its central bank sets when growth is normal */
  trend: number;
  rate0: number;
}

export const HOME = 'astoria';

const RAW: Omit<Nation, 'trend' | 'rate0'>[] = [
  { id: 'astoria', name: 'Republic of Astoria', short: 'Astoria', identity: 'Developed economy', advantage: 'Finance and technology', currency: 'dollar', fx0: 1, tariff: 0, shipDays: 0, needs: [], spare: [], rel0: 1 },
  { id: 'bharatara', name: 'Bharatara', short: 'Bharatara', identity: 'Emerging economy', advantage: 'Manufacturing and workforce', currency: 'rupa', fx0: 0.08, tariff: 0.12, shipDays: 12, needs: ['crude_oil', 'chips', 'medicine', 'cars', 'copper'], spare: ['clothing', 'cotton', 'steel', 'furniture'], rel0: 0.3 },
  { id: 'nordland', name: 'Federation of Nordland', short: 'Nordland', identity: 'Resource economy', advantage: 'Oil, gas and minerals', currency: 'nordmark', fx0: 0.6, tariff: 0.08, shipDays: 9, needs: ['food', 'grain', 'appliances', 'laptops', 'clothing'], spare: ['crude_oil', 'natural_gas', 'iron_ore', 'copper', 'timber'], rel0: 0.4 },
  { id: 'meridian', name: 'East Meridian', short: 'Meridian', identity: 'Export powerhouse', advantage: 'Electronics and shipping', currency: 'mer', fx0: 0.15, tariff: 0.1, shipDays: 14, needs: ['iron_ore', 'silicon', 'lithium', 'plastics', 'grain'], spare: ['phones', 'laptops', 'chips', 'appliances'], rel0: 0.1 },
  { id: 'solvara', name: 'Kingdom of Solvara', short: 'Solvara', identity: 'Desert oil state', advantage: 'Oil and gas, rich buyers', currency: 'sol', fx0: 2.4, tariff: 0.05, shipDays: 16, needs: ['food', 'water', 'cars', 'cement', 'medicine', 'glass'], spare: ['crude_oil', 'natural_gas', 'plastics', 'chemicals'], rel0: 0 },
  { id: 'kestria', name: 'Kestria', short: 'Kestria', identity: 'Farming republic', advantage: 'Grain, cotton and food', currency: 'kesh', fx0: 0.3, tariff: 0.1, shipDays: 8, needs: ['cars', 'appliances', 'chips', 'medicine', 'batteries'], spare: ['grain', 'cotton', 'food', 'timber'], rel0: 0.5 },
  { id: 'varnholm', name: 'Varnholm', short: 'Varnholm', identity: 'Heavy industry', advantage: 'Steel, aluminium and cement', currency: 'mark', fx0: 1.1, tariff: 0.14, shipDays: 11, needs: ['lithium', 'rare_earths', 'natural_gas', 'bauxite', 'food'], spare: ['steel', 'aluminium', 'cement', 'chemicals', 'glass'], rel0: -0.2 },
  { id: 'zanbel', name: 'Zanbel Isles', short: 'Zanbel', identity: 'Island tourism economy', advantage: 'Timber, and buyers who pay well', currency: 'shell', fx0: 0.05, tariff: 0.06, shipDays: 18, needs: ['food', 'medicine', 'phones', 'clothing', 'furniture', 'water'], spare: ['timber', 'limestone'], rel0: 0.2 },
  { id: 'tavora', name: 'Tavora', short: 'Tavora', identity: 'Tech hub', advantage: 'Chips and gadgets', currency: 'tav', fx0: 0.9, tariff: 0.09, shipDays: 13, needs: ['silicon', 'rare_earths', 'lithium', 'copper', 'aluminium'], spare: ['chips', 'robots', 'batteries', 'laptops'], rel0: -0.1 },
];
/** Normal growth and interest rate of each economy: emerging ones grow fast and pay more */
const ECON: Record<string, [number, number]> = {
  astoria: [0.02, 0.03], bharatara: [0.065, 0.065], nordland: [0.02, 0.035], meridian: [0.045, 0.04], solvara: [0.03, 0.04],
  kestria: [0.035, 0.05], varnholm: [0.015, 0.035], zanbel: [0.03, 0.05], tavora: [0.04, 0.03],
};
export const NATIONS: Nation[] = RAW.map((n) => ({ ...n, trend: ECON[n.id][0], rate0: ECON[n.id][1], needs: n.needs.filter(storable), spare: n.spare.filter(storable) }));

export const nation = (id: string): Nation => NATIONS.find((n) => n.id === id)!;
export const FOREIGN = NATIONS.filter((n) => n.id !== HOME);

/** Goods a country at war buys far more of */
const WAR_GOODS: GoodId[] = ['food', 'steel', 'medicine', 'crude_oil', 'defense', 'aluminium', 'grain'];
/** Astoria's tariff on goods you bring home */
export const IMPORT_TARIFF = 0.05;
/** Barter deals skip tariffs; this is what a country adds on top to win your goods */
const BARTER_SWEETENER: [number, number] = [1.05, 1.22];

/** A trade office abroad: what it costs to open and each month to run */
export const OFFICE_COST = 1_500_000;
export const OFFICE_UPKEEP = 40_000;
/** A trade office halves the tariff, and ships there sail faster and cheaper */
export const OFFICE_TARIFF = 0.5;
export const OFFICE_SHIP = 0.7;

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export type Standing = 'ally' | 'friendly' | 'neutral' | 'tense' | 'war';
export const STANDING: Record<Standing, { label: string; tone: 'good' | 'neutral' | 'bad' | 'gold'; tariff: number }> = {
  ally: { label: 'Ally', tone: 'gold', tariff: 0.4 },
  friendly: { label: 'Friendly', tone: 'good', tariff: 0.75 },
  neutral: { label: 'Neutral', tone: 'neutral', tariff: 1 },
  tense: { label: 'Tense', tone: 'bad', tariff: 1.6 },
  war: { label: 'At war', tone: 'bad', tariff: Infinity },
};

// ---------- state ----------

export function tradeState(w: WorldState): TradeState {
  if (w.play.trade) return w.play.trade;
  const rng = createRng((w.seed ^ 0x7a3d51) >>> 0);
  const rel: Record<string, number> = {};
  for (const a of NATIONS) for (const b of NATIONS) {
    if (a.id >= b.id) continue;
    // Relations with Astoria start from rel0; between others: neighbours with clashing needs are cooler
    rel[key(a.id, b.id)] = a.id === HOME ? b.rel0 : b.id === HOME ? a.rel0 : Math.round(range(rng, -0.5, 0.6) * 100) / 100;
  }
  const nations: TradeState['nations'] = {};
  for (const n of FOREIGN) nations[n.id] = { fx: n.fx0, fxHist: [n.fx0], noise: {}, glut: {} };
  const t: TradeState = { rng, rel, wars: [], nations, shipments: [], offers: [], log: [] };
  w.play.trade = t;
  refreshOffers(w, t);
  return t;
}

export function relation(t: TradeState, a: string, b: string): number {
  return t.rel[key(a, b)] ?? 0;
}

export function atWar(t: TradeState, a: string, b: string): boolean {
  return t.wars.includes(key(a, b));
}

export function standing(t: TradeState, a: string, b: string = HOME): Standing {
  if (atWar(t, a, b)) return 'war';
  const r = relation(t, a, b);
  return r >= 0.6 ? 'ally' : r >= 0.2 ? 'friendly' : r >= -0.2 ? 'neutral' : 'tense';
}

/** The tariff a country charges on your goods today */
export function tariffOf(t: TradeState, id: string): number {
  if (dealOf(t, id) === 'fta') return 0;
  return nation(id).tariff * STANDING[standing(t, id)].tariff * (hasOffice(t, id) ? OFFICE_TARIFF : 1);
}

/** Wars a country is fighting */
export function warsOf(t: TradeState, id: string): string[] {
  return t.wars.filter((k) => k.split('|').includes(id)).map((k) => k.split('|').find((x) => x !== id)!);
}

// ---------- economies, deals and offices ----------

export type Phase = 'boom' | 'growing' | 'slowing' | 'recession';
export const PHASE: Record<Phase, { label: string; tone: 'good' | 'neutral' | 'bad' | 'gold' }> = {
  boom: { label: 'Boom', tone: 'gold' },
  growing: { label: 'Growing', tone: 'good' },
  slowing: { label: 'Slowing', tone: 'neutral' },
  recession: { label: 'Recession', tone: 'bad' },
};

export function growthOf(t: TradeState, id: string): number {
  return t.nations[id]?.growth ?? nation(id).trend;
}
export function rateOf(t: TradeState, id: string): number {
  return t.nations[id]?.rate ?? nation(id).rate0;
}
/** How much more (or less) a country buys than normal because its economy is hot or cold */
export function boom(t: TradeState, id: string): number {
  return clamp(1 + 3 * (growthOf(t, id) - nation(id).trend), 0.8, 1.2);
}
export function phaseOf(t: TradeState, id: string): Phase {
  const g = growthOf(t, id);
  const n = nation(id);
  return g < 0 ? 'recession' : g > n.trend + 0.015 ? 'boom' : g < n.trend - 0.01 ? 'slowing' : 'growing';
}
export function dealOf(t: TradeState, id: string): 'fta' | 'sanction' | undefined {
  return t.nations[id]?.deal?.kind;
}
/** Astoria won't trade with it: war or sanctions */
export function blocked(t: TradeState, id: string): boolean {
  return atWar(t, HOME, id) || dealOf(t, id) === 'sanction';
}
export function hasOffice(t: TradeState, id: string): boolean {
  return t.nations[id]?.office != null;
}
/** Days by sea, faster with a trade office there */
export function shipDaysOf(t: TradeState, id: string): number {
  return Math.round(nation(id).shipDays * (hasOffice(t, id) ? OFFICE_SHIP : 1));
}

// ---------- prices ----------

/** How short a country is of a good: 1 = like home, 1.4 = short and paying more, 0.7 = has plenty */
export function priceIdx(w: WorldState, id: string, g: GoodId): number {
  const n = nation(id);
  const t = tradeState(w);
  const s = t.nations[id];
  let idx = n.needs.includes(g) ? 1.4 : n.spare.includes(g) ? 0.7 : 1;
  const wars = warsOf(t, id);
  if (wars.length && WAR_GOODS.includes(g)) idx *= 1.25;
  // Who it normally buys from: friends with spare make it cheaper, enemies with spare are cut off
  for (const o of FOREIGN) {
    if (o.id === id || !o.spare.includes(g)) continue;
    if (atWar(t, id, o.id)) idx *= 1.15;
    else if (relation(t, id, o.id) >= 0.2) idx *= 0.94;
  }
  idx *= s.noise[g] ?? 1;
  idx *= 1 - (s.glut[g] ?? 0);
  // A booming economy pays more for what it buys; a recession pays less
  if (!n.spare.includes(g)) idx *= boom(t, id);
  return clamp(idx, 0.45, 2.2);
}

/** A unit's price there, in dollars at today's exchange rate */
export function foreignPrice(w: WorldState, id: string, g: GoodId): number {
  if (id === HOME) return refPrice(w, g);
  const s = tradeState(w).nations[id];
  return refPrice(w, g) * priceIdx(w, id, g) * (s.fx / nation(id).fx0);
}

/** The same price in the country's own money */
export function localPrice(w: WorldState, id: string, g: GoodId): number {
  return foreignPrice(w, id, g) / tradeState(w).nations[id].fx;
}

/** Units a country takes in a month before its price starts to drop */
export function appetite(id: string, g: GoodId): number {
  const n = nation(id);
  return GOODS[g].baseCapacity * 20 * (n.needs.includes(g) ? 2 : n.spare.includes(g) ? 0.4 : 1);
}

/** Selling a lot at once pushes the price down; this is the average share of the full price you get */
export function depthMult(id: string, g: GoodId, qty: number): number {
  return 1 / (1 + qty / (2 * appetite(id, g)));
}

export function shipRate(id: string): number {
  return 0.03 + 0.004 * nation(id).shipDays;
}

/** Shipping for qty units, paid when the ship leaves */
export function shippingCost(w: WorldState, id: string, g: GoodId, qty: number): number {
  return qty * refPrice(w, g) * shipRate(id) * (hasOffice(tradeState(w), id) ? 0.75 : 1);
}

export interface ExportQuote { gross: number; tariff: number; shipping: number; net: number; perUnit: number; home: number }

/** What selling qty units there would bring today, after tariff and shipping */
export function exportQuote(w: WorldState, id: string, g: GoodId, qty: number): ExportQuote {
  const t = tradeState(w);
  const gross = qty * foreignPrice(w, id, g) * depthMult(id, g, qty);
  const tariff = gross * tariffOf(t, id);
  const shipping = shippingCost(w, id, g, qty);
  const net = gross - tariff - shipping;
  return { gross, tariff, shipping, net, perUnit: qty > 0 ? net / qty : 0, home: qty * refPrice(w, g) };
}

/** What buying qty units there and bringing them home costs, all in */
export function importQuote(w: WorldState, id: string, g: GoodId, qty: number): { price: number; tariff: number; shipping: number; total: number; perUnit: number } {
  const price = qty * foreignPrice(w, id, g) * (1 + qty / (4 * appetite(id, g))); // buying a lot raises their price, gently
  const t = tradeState(w);
  const tariff = price * (standing(t, id) === 'ally' || dealOf(t, id) === 'fta' ? 0 : IMPORT_TARIFF);
  const shipping = shippingCost(w, id, g, qty);
  const total = price + tariff + shipping;
  return { price, tariff, shipping, total, perUnit: qty > 0 ? total / qty : 0 };
}

/** Goods a country sells: its spare goods, plus anything it has a glut of */
export function spareGoods(w: WorldState, id: string): GoodId[] {
  const n = nation(id);
  const s = tradeState(w).nations[id];
  const extra = (Object.keys(s.glut) as GoodId[]).filter((g) => (s.glut[g] ?? 0) > 0.15 && !n.spare.includes(g));
  return [...n.spare, ...extra];
}

/** Units of a good on ships coming home to your warehouses */
function inbound(t: TradeState, g: GoodId): number {
  return t.shipments.filter((s) => s.back === g).reduce((a, s) => a + (s.backQty ?? 0), 0);
}

// ---------- commands ----------

function canTrade(w: WorldState, t: TradeState, id: string): string | null {
  if (!unlocked(w, 'world')) return `World trade opens at level ${unlockLevel('world')}`;
  if (id === HOME || !t.nations[id]) return 'Pick a foreign country';
  if (atWar(t, HOME, id)) return `Astoria is at war with ${nation(id).short}: no trade until peace`;
  if (dealOf(t, id) === 'sanction') return `Astoria has sanctions on ${nation(id).short}: no trade until they are lifted`;
  return null;
}

function payCash(w: WorldState, amount: number): boolean {
  if (w.player.cash < amount) return false;
  w.player.cash -= amount;
  return true;
}

/** Ship goods from your warehouses to sell abroad */
export function exportGoods(w: WorldState, to: string, g: GoodId, qty: number): CommandResult {
  const t = tradeState(w);
  const bad = canTrade(w, t, to);
  if (bad) return { ok: false, message: bad };
  if (!(qty > 0)) return { ok: false, message: 'Choose how much to send' };
  const have = w.play.warehouses.reduce((s, wh) => s + (wh.stock[g]?.qty ?? 0), 0);
  if (have < qty - 1e-6) return { ok: false, message: `You have only ${Math.floor(have).toLocaleString()} ${GOODS[g].unit} in storage` };
  const shipping = shippingCost(w, to, g, qty);
  if (!payCash(w, shipping)) return { ok: false, message: `Shipping costs ${fmtMoney(shipping)} of personal cash` };
  const took = takeStock(w, g, qty);
  t.shipments.push({ id: `sh${++w.seq}`, kind: 'export', to, good: g, qty: took.qty, cost: took.cost, shipping, left: w.day, arrives: w.day + shipDaysOf(t, to) });
  return { ok: true, message: `${Math.round(took.qty).toLocaleString()} ${GOODS[g].unit} of ${GOODS[g].name.toLowerCase()} set sail for ${nation(to).short}: ${shipDaysOf(t, to)} days` };
}

/** Buy spare goods abroad and bring them home to your warehouses */
export function importGoods(w: WorldState, from: string, g: GoodId, qty: number): CommandResult {
  const t = tradeState(w);
  const bad = canTrade(w, t, from);
  if (bad) return { ok: false, message: bad };
  if (!spareGoods(w, from).includes(g)) return { ok: false, message: `${nation(from).short} has no ${GOODS[g].name.toLowerCase()} to spare` };
  if (!(qty > 0)) return { ok: false, message: 'Choose how much to buy' };
  const room = totalRoom(w, g) - inbound(t, g);
  if (room < qty - 1e-6) return { ok: false, message: `Your warehouses have room for only ${Math.max(0, Math.floor(room)).toLocaleString()} ${GOODS[g].unit} more` };
  const q = importQuote(w, from, g, qty);
  if (!payCash(w, q.total)) return { ok: false, message: `This costs ${fmtMoney(q.total)} of personal cash` };
  t.shipments.push({ id: `sh${++w.seq}`, kind: 'import', to: from, good: g, qty: 0, cost: 0, shipping: q.shipping, left: w.day, arrives: w.day + shipDaysOf(t, from), back: g, backQty: qty, backCost: q.total / qty });
  addGlut(t, from, g, -0.15 * qty / appetite(from, g)); // buying their spare makes it scarcer
  goodwill(t, from, q.total);
  return { ok: true, message: `Bought ${Math.round(qty).toLocaleString()} ${GOODS[g].unit} from ${nation(from).short} for ${fmtMoney(q.total)}: home in ${shipDaysOf(t, from)} days` };
}

/** Accept a country's barter offer: your goods go out now, theirs come back by ship */
export function acceptBarter(w: WorldState, offerId: string): CommandResult {
  const t = tradeState(w);
  const o = t.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, message: 'That offer has gone' };
  const bad = canTrade(w, t, o.nation);
  if (bad) return { ok: false, message: bad };
  const have = w.play.warehouses.reduce((s, wh) => s + (wh.stock[o.want]?.qty ?? 0), 0);
  if (have < o.wantQty - 1e-6) return { ok: false, message: `You need ${Math.ceil(o.wantQty).toLocaleString()} ${GOODS[o.want].unit} of ${GOODS[o.want].name.toLowerCase()} in storage` };
  const room = totalRoom(w, o.give) - inbound(t, o.give) + (o.want === o.give ? o.wantQty : 0);
  if (room < o.giveQty * 0.5) return { ok: false, message: `Make room for the ${GOODS[o.give].name.toLowerCase()} first: you have space for ${Math.floor(Math.max(0, room)).toLocaleString()} ${GOODS[o.give].unit}` };
  const shipping = shippingCost(w, o.nation, o.want, o.wantQty);
  if (!payCash(w, shipping)) return { ok: false, message: `Shipping costs ${fmtMoney(shipping)} of personal cash` };
  const took = takeStock(w, o.want, o.wantQty);
  t.shipments.push({
    id: `sh${++w.seq}`, kind: 'barter', to: o.nation, good: o.want, qty: took.qty, cost: took.cost, shipping, left: w.day,
    arrives: w.day + shipDaysOf(t, o.nation) * 2, back: o.give, backQty: o.giveQty, backCost: took.cost / Math.max(1, o.giveQty),
  });
  t.offers = t.offers.filter((x) => x !== o);
  goodwill(t, o.nation, o.wantQty * refPrice(w, o.want) * 1.5); // swaps build trust faster
  return { ok: true, message: `Deal: your ${GOODS[o.want].name.toLowerCase()} sails to ${nation(o.nation).short}, their ${GOODS[o.give].name.toLowerCase()} comes back in ${shipDaysOf(t, o.nation) * 2} days` };
}

// ---------- the living world ----------

function addGlut(t: TradeState, id: string, g: GoodId, d: number): void {
  const s = t.nations[id];
  s.glut[g] = clamp((s.glut[g] ?? 0) + d, -0.3, 0.5);
}

/** Trade makes friends: a bit of goodwill for every dollar of business */
function goodwill(t: TradeState, id: string, value: number): void {
  const k = key(HOME, id);
  t.rel[k] = clamp((t.rel[k] ?? 0) + 0.005 + 0.02 * Math.min(1, value / 2_000_000), -1, 0.95);
}

function log(w: WorldState, t: TradeState, text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
  t.log.unshift({ day: w.day, text, tone });
  if (t.log.length > 30) t.log.length = 30;
}

function arrive(w: WorldState, t: TradeState, s: Shipment): void {
  const n = nation(s.to);
  const war = blocked(t, s.to);
  if (s.kind === 'export') {
    if (war) {
      // War broke out: the ship turns back and the goods go home
      const put = store(w, s.good, s.qty, s.cost / Math.max(1, s.qty));
      w.player.cash += (s.qty - put) * refPrice(w, s.good) * 0.8;
      banner(w, `Ship turned back from ${n.short}`, `War broke out, so your ${GOODS[s.good].name.toLowerCase()} came home unsold. The shipping is lost.`, 0, 'bad');
      return;
    }
    const q = exportQuote(w, s.to, s.good, s.qty);
    const cash = q.gross - q.tariff;
    w.player.cash += cash;
    addGlut(t, s.to, s.good, 0.25 * s.qty / appetite(s.to, s.good));
    goodwill(t, s.to, q.gross);
    const profit = cash - s.shipping - s.cost;
    t.earned = (t.earned ?? 0) + profit;
    banner(w, `Sold in ${n.short}: ${fmtMoney(cash)}`, `${Math.round(s.qty).toLocaleString()} ${GOODS[s.good].unit} of ${GOODS[s.good].name.toLowerCase()} after a ${fmtMoney(q.tariff)} tariff. Profit after shipping and stock cost: ${fmtMoney(profit)}.`, 0, profit >= 0 ? 'good' : 'bad');
    return;
  }
  if (s.kind === 'barter') {
    if (war) {
      const put = store(w, s.good, s.qty, s.cost / Math.max(1, s.qty));
      w.player.cash += (s.qty - put) * refPrice(w, s.good) * 0.8;
      banner(w, `Barter with ${n.short} cancelled`, `War broke out before the swap, so your goods came home.`, 0, 'bad');
      return;
    }
    addGlut(t, s.to, s.good, 0.25 * s.qty / appetite(s.to, s.good));
  }
  // Imports and the return leg of a barter: goods into your warehouses
  if (s.back && s.backQty) {
    const put = store(w, s.back, s.backQty, s.backCost ?? 0);
    const extra = s.backQty - put;
    if (extra > 0) w.player.cash += extra * refPrice(w, s.back) * 0.8;
    banner(w, `Ship in from ${n.short}`, `${Math.round(put).toLocaleString()} ${GOODS[s.back].unit} of ${GOODS[s.back].name.toLowerCase()} are in your warehouses${extra > 0 ? `; ${Math.round(extra).toLocaleString()} that did not fit were sold to traders` : ''}.`, 0, 'good');
  }
}

/** Daily: ships arrive */
export function dailyTrade(w: WorldState): void {
  const t = tradeState(w);
  const due = t.shipments.filter((s) => s.arrives <= w.day);
  if (!due.length) return;
  t.shipments = t.shipments.filter((s) => s.arrives > w.day);
  for (const s of due) arrive(w, t, s);
}

function refreshOffers(w: WorldState, t: TradeState): void {
  t.offers = t.offers.filter((o) => o.until > w.day);
  for (const n of FOREIGN) {
    if (blocked(t, n.id) || t.offers.filter((o) => o.nation === n.id).length >= 2 || !chance(t.rng, 0.6)) continue;
    const want = pick(t.rng, n.needs);
    const give = pick(t.rng, spareGoods(w, n.id).filter((g) => g !== want));
    if (!want || !give) continue;
    const wantQty = Math.round(appetite(n.id, want) * range(t.rng, 0.25, 0.6));
    const value = wantQty * refPrice(w, want) * range(t.rng, ...BARTER_SWEETENER);
    const giveQty = Math.round(value / refPrice(w, give));
    t.offers.push({ id: `bo${w.day}-${n.id}`, nation: n.id, want, wantQty, give, giveQty, until: w.day + 30 });
  }
}

/**
 * How the world reaches home: the average foreign price of each good against normal becomes its
 * world price (what importers charge, what raw materials cost), and foreign demand for exports
 * follows relations, wars and exchange rates.
 */
export function worldLink(w: WorldState, t: TradeState): void {
  const base = (t.worldBase ??= {});
  const world: Partial<Record<GoodId, number>> = {};
  const first = Object.keys(base).length === 0;
  for (const g of Object.keys(w.goods) as GoodId[]) {
    if (!storable(g)) continue;
    let raw = FOREIGN.reduce((s, n) => s + priceIdx(w, n.id, g), 0) / FOREIGN.length;
    // A free-trade partner's spare goods come in cheaper; a sanctioned country's stop coming
    for (const n of FOREIGN) if (n.spare.includes(g)) raw *= dealOf(t, n.id) === 'fta' ? 0.97 : dealOf(t, n.id) === 'sanction' ? 1.04 : 1;
    if (first || base[g] == null) base[g] = raw;
    const v = clamp(raw / base[g]!, 0.8, 1.35);
    if (Math.abs(v - 1) > 0.005) world[g] = Math.round(v * 1000) / 1000;
  }
  t.world = world;
  let mood = 0;
  for (const n of FOREIGN) {
    const st = standing(t, n.id);
    const s = t.nations[n.id];
    const k = blocked(t, n.id) ? 0 : (warsOf(t, n.id).length ? 0.85 : 1) * (st === 'ally' ? 1.1 : st === 'friendly' ? 1.05 : st === 'tense' ? 0.92 : 1)
      * (dealOf(t, n.id) === 'fta' ? 1.08 : 1) * boom(t, n.id);
    mood += k * Math.pow(s.fx / n.fx0, 0.5);
  }
  t.exportMood = clamp(mood / FOREIGN.length, 0.75, 1.2);
}

/** Monthly: exchange rates move, prices drift, relations change, wars start and end */
export function monthlyTrade(w: WorldState): void {
  const t = tradeState(w);
  const r = t.rng;
  monthlyEconomies(w, t);
  for (const n of FOREIGN) {
    const s = t.nations[n.id];
    const war = warsOf(t, n.id).length > 0;
    // Exchange rate: money flows to the higher interest rate, so a country that raises rates
    // above Astoria's sees its currency climb; war weakens it
    const carry = (rateOf(t, n.id) - w.macro.rate) - (n.rate0 - w.macro.neutralRate);
    const fxTarget = n.fx0 * Math.exp(4 * clamp(carry, -0.06, 0.06));
    s.fx = s.fx * Math.exp(normal(r) * 0.025 + 0.12 * Math.log(fxTarget / s.fx) - (war ? 0.03 : 0));
    s.fxHist.push(s.fx);
    if (s.fxHist.length > 12) s.fxHist.shift();
    for (const g of [...n.needs, ...n.spare]) s.noise[g] = clamp((s.noise[g] ?? 1) * Math.exp(normal(r) * 0.05) * Math.pow(1 / (s.noise[g] ?? 1), 0.15), 0.8, 1.25);
    for (const g of Object.keys(s.glut) as GoodId[]) { s.glut[g] = (s.glut[g] ?? 0) * 0.6; if (Math.abs(s.glut[g]!) < 0.01) delete s.glut[g]; }
  }
  // Relations drift, and pull back slowly toward where they began
  for (const k of Object.keys(t.rel)) {
    const [a, b] = k.split('|');
    const base = a === HOME ? nation(b).rel0 : b === HOME ? nation(a).rel0 : 0;
    t.rel[k] = clamp(t.rel[k] + normal(r) * (k.includes(HOME) ? 0.05 : 0.09) + 0.03 * (base - t.rel[k]), -1, 0.95);
  }
  // Wars end...
  for (const k of [...t.wars]) {
    if (chance(r, 0.12)) {
      t.wars = t.wars.filter((x) => x !== k);
      t.rel[k] = -0.3;
      const [a, b] = k.split('|');
      const text = `Peace between ${nation(a).short} and ${nation(b).short}`;
      log(w, t, text, 'good');
      addNews(w, 'economy', text, 'Trade between them resumes and prices for war goods should ease.', 'good');
    }
  }
  // ...and start, between countries that have fallen out
  for (const k of Object.keys(t.rel)) {
    if (t.wars.includes(k) || t.wars.length >= 2) continue;
    const home = k.includes(HOME);
    if (t.rel[k] > (home ? -0.6 : -0.4) || !chance(r, home ? 0.02 : 0.045)) continue;
    t.wars.push(k);
    const [a, b] = k.split('|');
    const text = `War: ${nation(a).short} and ${nation(b).short}`;
    log(w, t, text, 'bad');
    addNews(w, 'economy', home ? `Astoria cuts ties with ${nation(a === HOME ? b : a).short}` : `${text} go to war`,
      home ? 'All trade with them stops. Ships on the way turn back.' : `Both sides now pay more for food, steel, medicine and fuel, and their trade with each other stops.`, 'bad');
    if (home) banner(w, `No more trade with ${nation(a === HOME ? b : a).short}`, 'Relations broke down into conflict. Ships heading there turn back.', 0, 'bad');
  }
  // Friends of a country at war cool toward its enemy
  for (const k of t.wars) {
    const [a, b] = k.split('|');
    for (const n of NATIONS) {
      if (n.id === a || n.id === b) continue;
      if (relation(t, n.id, a) >= 0.6) t.rel[key(n.id, b)] = clamp(relation(t, n.id, b) - 0.04, -1, 0.95);
      if (relation(t, n.id, b) >= 0.6) t.rel[key(n.id, a)] = clamp(relation(t, n.id, a) - 0.04, -1, 0.95);
    }
  }
  monthlyDeals(w, t);
  monthlyOffices(w, t);
  refreshOffers(w, t);
  worldLink(w, t);
}

const goodsList = (gs: GoodId[]) => gs.slice(0, 3).map((g) => GOODS[g].name.toLowerCase()).join(', ');

/**
 * Each economy grows around its normal rate in slow cycles, with the odd crisis; its central
 * bank raises rates when it runs hot and cuts them in a slump. Booms and recessions make news.
 */
function monthlyEconomies(w: WorldState, t: TradeState): void {
  const r = t.rng;
  const gap = FOREIGN.reduce((a, n) => a + growthOf(t, n.id) - n.trend, 0) / FOREIGN.length;
  for (const n of FOREIGN) {
    const s = t.nations[n.id];
    s.growth ??= n.trend;
    s.rate ??= n.rate0;
    const war = warsOf(t, n.id).length > 0;
    let shock = normal(r) * 0.006 - (war ? 0.002 : 0) + 0.02 * gap;
    if (chance(r, 0.005)) {
      shock -= 0.035;
      addNews(w, 'economy', `Financial crisis in ${n.short}`, `Banks there are in trouble and spending is falling fast. It will buy less from abroad for a while.`, 'bad');
    }
    s.growth = clamp(n.trend + 0.87 * (s.growth - n.trend) + shock, -0.06, 0.13);
    const target = clamp(n.rate0 + 1.5 * (s.growth - n.trend), 0.0025, 0.2);
    s.rate = clamp(s.rate + 0.25 * (target - s.rate), 0.0025, 0.2);
    const ph = phaseOf(t, n.id);
    // Only news-worthy when it is clear: a real fall or a real boom, and not twice in half a year
    const clear = ph === 'recession' ? s.growth < -0.005 : ph === 'boom' ? s.growth > n.trend + 0.02 : false;
    if (s.phase && ph !== s.phase && clear && w.day - (s.phaseNews ?? -Infinity) > 180) {
      s.phaseNews = w.day;
      const text = ph === 'boom' ? `${n.short} is booming` : `${n.short} falls into recession`;
      log(w, t, text, ph === 'boom' ? 'good' : 'bad');
      addNews(w, 'economy', text, ph === 'boom'
        ? `Growth there is ${fmtPctN(s.growth)} a year. It pays more for ${goodsList(n.needs)} and its central bank may raise rates, lifting its ${n.currency}.`
        : `Its economy is shrinking. It pays less for imports, and rate cuts there may weaken its ${n.currency}.`, ph === 'boom' ? 'good' : 'bad');
    }
    s.phase = ph;
  }
}

const fmtPctN = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * Astoria's government signs free-trade deals with friends and puts sanctions on countries it has
 * fallen out with, or that attack its allies. Each has winners and losers at home.
 */
function monthlyDeals(w: WorldState, t: TradeState): void {
  const r = t.rng;
  for (const n of FOREIGN) {
    const s = t.nations[n.id];
    const rel = relation(t, HOME, n.id);
    if (s.deal) {
      const sanctionOver = s.deal.kind === 'sanction' && rel > -0.15 && !warsOf(t, n.id).some((e) => relation(t, HOME, e) >= 0.5);
      if (w.day >= s.deal.until || sanctionOver || (s.deal.kind === 'fta' && rel < 0)) {
        const text = s.deal.kind === 'fta' ? `Free-trade deal with ${n.short} ends` : `Sanctions on ${n.short} lifted`;
        log(w, t, text, s.deal.kind === 'fta' ? 'bad' : 'good');
        addNews(w, 'economy', text, s.deal.kind === 'fta' ? 'Normal tariffs return both ways.' : 'Trade can start again.', 'neutral');
        delete s.deal;
      }
      continue;
    }
    if (atWar(t, HOME, n.id)) continue;
    const hitsAlly = warsOf(t, n.id).find((e) => e !== HOME && relation(t, HOME, e) >= 0.5);
    if (rel >= 0.45 && chance(r, 0.03)) {
      s.deal = { kind: 'fta', since: w.day, until: w.day + 360 * (2 + Math.floor(range(r, 0, 3))) };
      t.rel[key(HOME, n.id)] = clamp(rel + 0.05, -1, 0.95);
      const text = `Astoria signs a free-trade deal with ${n.short}`;
      log(w, t, text, 'good');
      addNews(w, 'economy', text,
        `No tariffs either way. Winners: Astoria's makers of ${goodsList(n.needs)}, who can sell there tariff-free. Losers: home makers of ${goodsList(n.spare)}, who now face cheaper imports.`, 'good');
      banner(w, text, `No tariffs on what you sell there or bring home from there.`, 0, 'good');
    } else if ((hitsAlly || rel <= -0.45) && chance(r, 0.15)) {
      s.deal = { kind: 'sanction', since: w.day, until: w.day + 360 + Math.floor(range(r, 0, 360)) };
      t.rel[key(HOME, n.id)] = clamp(rel - 0.15, -1, 0.95);
      const text = `Astoria puts sanctions on ${n.short}`;
      log(w, t, text, 'bad');
      addNews(w, 'economy', text,
        `${hitsAlly ? `It attacked ${nation(hitsAlly).short}, an ally. ` : ''}No trade until they are lifted. Winners: home makers of ${goodsList(n.spare)}, as imports dry up. Losers: exporters who sold ${goodsList(n.needs)} there, and anyone who buys ${goodsList(n.spare)}.`, 'bad');
      banner(w, text, 'Ships heading there turn back. Your trade office there, if any, sits idle.', 0, 'bad');
    }
  }
}

/** Trade offices cost upkeep each month and build a little goodwill */
function monthlyOffices(w: WorldState, t: TradeState): void {
  for (const n of FOREIGN) {
    const s = t.nations[n.id];
    if (s.office == null) continue;
    if (w.player.cash < OFFICE_UPKEEP) {
      delete s.office;
      banner(w, `Trade office in ${n.short} closed`, `You could not pay its ${fmtMoney(OFFICE_UPKEEP)} monthly upkeep.`, 0, 'bad');
      continue;
    }
    w.player.cash -= OFFICE_UPKEEP;
    t.rel[key(HOME, n.id)] = clamp(relation(t, HOME, n.id) + 0.01, -1, 0.95);
  }
}

/** Open a trade office abroad: half the tariff, ships 30% faster and 25% cheaper */
export function openOffice(w: WorldState, id: string): CommandResult {
  const t = tradeState(w);
  const bad = canTrade(w, t, id);
  if (bad) return { ok: false, message: bad };
  if (hasOffice(t, id)) return { ok: false, message: `You already have an office in ${nation(id).short}` };
  if (!payCash(w, OFFICE_COST)) return { ok: false, message: `A trade office costs ${fmtMoney(OFFICE_COST)} of personal cash` };
  t.nations[id].office = w.day;
  log(w, t, `Opened a trade office in ${nation(id).short}`, 'good');
  return { ok: true, message: `Trade office open in ${nation(id).short}: tariffs halved, ships ${Math.round((1 - OFFICE_SHIP) * 100)}% faster` };
}

export function closeOffice(w: WorldState, id: string): CommandResult {
  const t = tradeState(w);
  if (!hasOffice(t, id)) return { ok: false, message: 'No office there' };
  delete t.nations[id].office;
  return { ok: true, message: `Closed your trade office in ${nation(id).short}` };
}

/** Where your stored goods sell best abroad today, after tariff and shipping, against home */
export function bestMarkets(w: WorldState): { good: GoodId; nation: string; qty: number; perUnit: number; home: number; gain: number }[] {
  const t = tradeState(w);
  const out: { good: GoodId; nation: string; qty: number; perUnit: number; home: number; gain: number }[] = [];
  const held: Partial<Record<GoodId, number>> = {};
  for (const wh of w.play.warehouses) for (const g of Object.keys(wh.stock) as GoodId[]) held[g] = (held[g] ?? 0) + (wh.stock[g]?.qty ?? 0);
  for (const g of Object.keys(held) as GoodId[]) {
    const qty = held[g]!;
    if (qty < 1) continue;
    let best: { nation: string; perUnit: number } | null = null;
    for (const n of FOREIGN) {
      if (blocked(t, n.id)) continue;
      const q = exportQuote(w, n.id, g, qty);
      if (!best || q.perUnit > best.perUnit) best = { nation: n.id, perUnit: q.perUnit };
    }
    if (best) out.push({ good: g, nation: best.nation, qty, perUnit: best.perUnit, home: refPrice(w, g), gain: best.perUnit / refPrice(w, g) - 1 });
  }
  return out.sort((a, b) => b.gain - a.gain);
}
