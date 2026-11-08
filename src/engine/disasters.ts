/**
 * Natural disasters: rare, unannounced, and wide. One strikes about every two and a half years
 * and hits most companies in the industries it touches, cutting output and leaving a repair bill.
 * Insurance costs a small yearly premium and pays most of the bill.
 */
import { GOODS, GOOD_IDS } from './data';
import { clamp } from './company';
import { payBill } from './events';
import { isBank } from './banks';
import { failCompany } from './auctions';
import { stockByTicker } from './market';
import { addNews, fmtMoney, fmtPct } from './news';
import { banner } from './rewards';
import { chance, hashString, int, next, pick, range } from './rng';
import type { Company, DisasterKind, GoodId, WorldState } from './types';

/** Chance of a disaster on any day (about one every 2.5 years). */
export const DISASTER_CHANCE = 1 / 900;
/** No two disasters within this many days. */
const QUIET_DAYS = 180;
/** Insurance: yearly premium as a share of the plant's book value, and the share of a bill it pays. */
export const PREMIUM_RATE = 0.012;
export const COVER = 0.8;
/** An uninsured AI company that is badly hit may never recover (at most one per disaster). */
const COLLAPSE_CHANCE = 0.15;

interface Kind {
  kind: DisasterKind;
  name: string;
  icon: string;
  /** Goods it can hit (all goods if empty) */
  goods: GoodId[];
  /** Chance each company in those goods is hit */
  hit: number;
  /** Output limit while repairing */
  mult: [number, number];
  days: [number, number];
  /** Repair bill as a share of book value */
  bill: [number, number];
  headline: string;
  body: string;
}

const ALL: GoodId[] = [];

export const DISASTERS: Kind[] = [
  { kind: 'earthquake', name: 'Earthquake', icon: '🌋', goods: ALL, hit: 0.35, mult: [0.3, 0.6], days: [40, 100], bill: [0.06, 0.12],
    headline: 'Major earthquake shakes the country', body: 'Factories, mines and offices across every industry report damage.' },
  { kind: 'flood', name: 'Flood', icon: '🌊', goods: ['grain', 'cotton', 'timber', 'food', 'freight', 'electricity', 'clothing', 'water', 'construction', 'real_estate', 'ecommerce'], hit: 0.5, mult: [0.35, 0.6], days: [30, 80], bill: [0.05, 0.1],
    headline: 'Floods swamp farms and river towns', body: 'Fields, warehouses, power stations and shops are under water.' },
  { kind: 'hurricane', name: 'Hurricane', icon: '🌀', goods: ['crude_oil', 'natural_gas', 'electricity', 'plastics', 'chemicals', 'freight', 'airlines', 'space'], hit: 0.55, mult: [0.3, 0.55], days: [30, 70], bill: [0.06, 0.12],
    headline: 'Hurricane batters the coast', body: 'Oil rigs, refineries, ports and power lines are knocked out.' },
  { kind: 'wildfire', name: 'Wildfire', icon: '🔥', goods: ['timber', 'grain', 'cotton', 'electricity', 'real_estate'], hit: 0.45, mult: [0.3, 0.6], days: [30, 90], bill: [0.05, 0.1],
    headline: 'Wildfires rage across the countryside', body: 'Forests, farms and power lines burn.' },
  { kind: 'drought', name: 'Drought', icon: '☀️', goods: ['grain', 'cotton', 'food', 'electricity', 'timber', 'water'], hit: 0.6, mult: [0.65, 0.85], days: [60, 140], bill: [0.01, 0.03],
    headline: 'Worst drought in decades', body: 'Crops fail, rivers run low and power plants cannot cool their turbines.' },
  { kind: 'pandemic', name: 'Pandemic', icon: '🦠', goods: ALL, hit: 0.7, mult: [0.75, 0.9], days: [60, 150], bill: [0.005, 0.015],
    headline: 'A new virus spreads fast', body: 'Workers fall sick everywhere. Shoppers stay home, and clinics fill up.' },
  { kind: 'blackout', name: 'Solar storm', icon: '⚡', goods: ['electricity', 'chips', 'telecom', 'software', 'banking', 'phones', 'laptops', 'ai', 'gaming', 'ecommerce'], hit: 0.6, mult: [0.45, 0.6], days: [10, 25], bill: [0.02, 0.05],
    headline: 'Solar storm knocks out the grid', body: 'Power, networks and data centres go dark for days.' },
];

export function disasterInfo(kind: DisasterKind): Kind {
  return DISASTERS.find((d) => d.kind === kind)!;
}

/** Whether this company carries disaster insurance. AI owners: a fixed half insure. */
export function isInsured(c: Company): boolean {
  return c.isPlayer ? !!c.insured : hashString(c.id) % 2 === 0;
}

/** Daily insurance premium. */
export function premiumPerDay(c: Company): number {
  return isInsured(c) ? (Math.max(0, c.assets) * PREMIUM_RATE) / 365 : 0;
}

/** What the company pays itself out of a bill once insurance has paid its share. */
export function ownShare(c: Company, bill: number): number {
  return isInsured(c) ? bill * (1 - COVER) : bill;
}

function hits(kind: Kind, good: GoodId): boolean {
  return kind.goods.length === 0 || kind.goods.includes(good);
}

/** Effects on the wider economy beyond the damaged plants. */
function sideEffects(w: WorldState, kind: Kind, until: number): void {
  const add = (k: WorldState['effects'][number]['kind'], delta: number, target?: GoodId) =>
    w.effects.push({ id: `e${++w.seq}`, kind: k, target, delta, untilDay: until });
  if (kind.kind === 'hurricane') add('oilSupply', -0.2);
  if (kind.kind === 'drought') { add('goodSupply', -0.3, 'grain'); add('goodSupply', -0.2, 'cotton'); }
  if (kind.kind === 'pandemic') {
    add('goodDemand', 0.3, 'medicine');
    add('goodDemand', 0.25, 'clinics');
    add('goodDemand', 0.2, 'hospitals');
    add('goodDemand', 0.15, 'software');
    add('goodDemand', 0.2, 'ecommerce');
    add('goodDemand', 0.15, 'gaming');
    add('goodDemand', -0.4, 'airlines');
    for (const g of ['clothing', 'cars', 'furniture', 'phones', 'wellness', 'real_estate'] as GoodId[]) add('goodDemand', -0.18, g);
    add('confidence', -0.12);
  }
  if (kind.kind === 'earthquake') add('confidence', -0.06);
}

/** Strike now: used by the daily roll and by tests. */
export function strike(w: WorldState, kindId?: DisasterKind): void {
  const r = w.rng;
  const kind = kindId ? disasterInfo(kindId) : pick(r, DISASTERS);
  let hit = 0;
  let cost = 0;
  let covered = 0;
  const yours: string[] = [];
  const lines: string[] = [];
  let collapsed: Company | null = null;
  for (const c of w.companies) {
    if (c.bankrupt || !hits(kind, c.good) || !chance(r, kind.hit)) continue;
    hit++;
    const mult = range(r, kind.mult[0], kind.mult[1]);
    const until = w.day + int(r, kind.days[0], kind.days[1]);
    // Keep whichever damage is worse
    if (!c.damage || c.damage.untilDay <= w.day || c.damage.mult > mult) c.damage = { mult, untilDay: Math.max(until, c.damage?.untilDay ?? 0), cause: `${kind.name} damage` };
    c.inventory *= clamp(1 - (1 - mult) * 0.5, 0.5, 1);
    const bill = Math.max(5_000, c.assets * range(r, kind.bill[0], kind.bill[1]));
    const own = ownShare(c, bill);
    payBill(w, c, own);
    if (kind.kind === 'pandemic') c.morale = clamp(c.morale - 0.05, 0, 1);
    if (!collapsed && !c.isPlayer && !isInsured(c) && !isBank(c) && mult < 0.5 && next(r) < COLLAPSE_CHANCE
      && w.companies.filter((x) => x.good === c.good && !x.bankrupt).length > 2) collapsed = c;
    const s = c.ticker ? stockByTicker(w, c.ticker) : undefined;
    if (s) s.newsImpact -= 0.04 * (1 - mult);
    if (c.isPlayer) {
      yours.push(c.id);
      cost += own;
      covered += bill - own;
      lines.push(`${c.name}: output ${fmtPct(mult, 0)} for ${until - w.day} days, repairs ${fmtMoney(own)}${bill > own ? ` (insurance paid ${fmtMoney(bill - own)})` : ''}`);
    }
  }
  sideEffects(w, kind, w.day + int(r, kind.days[0], kind.days[1]));
  if (collapsed) failCompany(w, collapsed, `Uninsured and badly damaged by the ${kind.name.toLowerCase()}, ${collapsed.name} cannot afford to rebuild.`);
  w.play.disasters.push({ id: `d${++w.seq}`, day: w.day, kind: kind.kind, hit, yours, cost, covered });
  if (w.play.disasters.length > 30) w.play.disasters.shift();
  const where = kind.goods.length ? kind.goods.slice(0, 4).map((g) => GOODS[g].name.toLowerCase()).join(', ') : 'every industry';
  addNews(w, 'economy', `${kind.icon} ${kind.headline}`, `${kind.body} ${hit} companies are damaged (${where}).`, 'bad', yours);
  if (yours.length) {
    addNews(w, 'player', `${kind.name} hits ${yours.length === 1 ? 'your company' : `${yours.length} of your companies`}`, lines.join('. ') + '.', 'bad', yours);
    banner(w, `${kind.icon} ${kind.name}!`, lines.slice(0, 2).join('. ') + (lines.length > 2 ? ` and ${lines.length - 2} more.` : '.'), 0, 'bad');
  }
}

/** Daily roll. Nobody can see it coming. */
export function dailyDisasters(w: WorldState): void {
  const last = w.play.disasters[w.play.disasters.length - 1];
  if (last && w.day - last.day < QUIET_DAYS) return;
  if (w.day < 60) return;
  if (next(w.rng) < DISASTER_CHANCE) strike(w);
}

/** Every good a disaster can touch (for the guide). */
export function exposedGoods(kind: DisasterKind): GoodId[] {
  const k = disasterInfo(kind);
  return k.goods.length ? k.goods : GOOD_IDS;
}
