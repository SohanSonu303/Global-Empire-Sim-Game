/**
 * Warehouses: extra storage you own personally. Plants can send output they cannot keep to a
 * warehouse, you can buy stock from the market into one, and sell it later when prices are higher.
 * Stored goods cost money to keep and some spoil.
 */
import { GOODS, GOOD_IDS } from './data';
import { clamp, refPrice } from './company';
import { remember } from './contracts';
import { addNews, fmtMoney } from './news';
import { banner, unlocked } from './rewards';
import type { CommandResult, Company, GoodId, Warehouse, WorldState } from './types';

/** Goods that cannot be put on a shelf. */
export const NOT_STORABLE: GoodId[] = ['electricity', 'software', 'telecom', 'freight', 'clinics', 'banking'];

/** Share lost per day in storage. */
const SPOIL: Partial<Record<GoodId, number>> = { food: 0.004, grain: 0.002, cotton: 0.0015, medicine: 0.001, timber: 0.0008 };
const SPOIL_DEFAULT = 0.0003;

export const WAREHOUSE_SPACE = 6_000; // level 1
export const WAREHOUSE_GROWTH = 1.6; // space per level
export const WAREHOUSE_COST = 150_000;
export const MAX_WAREHOUSE_LEVEL = 10;
/** Storage cost per day as a share of the stock's value */
export const HOLD_RATE = 0.0004;

export function storable(g: GoodId): boolean {
  return !NOT_STORABLE.includes(g);
}

export function spoilRate(g: GoodId): number {
  return SPOIL[g] ?? SPOIL_DEFAULT;
}

/** Space one unit takes: a level-1 plant's daily output fills about 100 space. */
export function spacePer(g: GoodId): number {
  return 100 / GOODS[g].baseCapacity;
}

export function spaceOf(wh: Warehouse): number {
  return WAREHOUSE_SPACE * Math.pow(WAREHOUSE_GROWTH, wh.level - 1);
}

export function usedSpace(wh: Warehouse, good?: GoodId): number {
  let s = 0;
  for (const g of GOOD_IDS) {
    if (good && g !== good) continue;
    s += (wh.stock[g]?.qty ?? 0) * spacePer(g);
  }
  return s;
}

/** Units of a good this warehouse can still take, within its limit for that good. */
export function roomFor(wh: Warehouse, g: GoodId): number {
  if (!storable(g)) return 0;
  const total = spaceOf(wh);
  const free = total - usedSpace(wh);
  const limit = total * (wh.limits[g] ?? 1) - usedSpace(wh, g);
  return Math.max(0, Math.min(free, limit)) / spacePer(g);
}

export function totalRoom(w: WorldState, g: GoodId): number {
  return w.play.warehouses.reduce((s, wh) => s + roomFor(wh, g), 0);
}

/** A company of yours that keeps running at full capacity and stores the extra. */
export function isStoring(w: WorldState, c: Company): boolean {
  return c.isPlayer && !!c.automation.toWarehouse && (w.play?.warehouses.length ?? 0) > 0 && totalRoom(w, c.good) > c.capacity * 0.5;
}

export function storedQty(w: WorldState, g: GoodId): number {
  return w.play.warehouses.reduce((s, wh) => s + (wh.stock[g]?.qty ?? 0), 0);
}

export function stockValue(w: WorldState): number {
  let v = 0;
  for (const wh of w.play.warehouses) for (const g of GOOD_IDS) v += (wh.stock[g]?.qty ?? 0) * refPrice(w, g);
  return v;
}

export function buildCost(w: WorldState): number {
  return Math.round(WAREHOUSE_COST * Math.pow(1.35, w.play.warehouses.length) / 1000) * 1000;
}

export function upgradeCostOf(wh: Warehouse): number {
  return Math.round(WAREHOUSE_COST * 0.8 * Math.pow(1.7, wh.level) / 1000) * 1000;
}

export function runningCost(wh: Warehouse): number {
  return 250 * Math.pow(wh.level, 0.9);
}

/** Daily cost of a warehouse: rent and staff plus a share of the stock's value. */
export function dailyCost(w: WorldState, wh: Warehouse): number {
  let value = 0;
  for (const g of GOOD_IDS) value += (wh.stock[g]?.qty ?? 0) * refPrice(w, g);
  return runningCost(wh) + value * HOLD_RATE;
}

export function addStock(wh: Warehouse, g: GoodId, qty: number, unitCost: number): void {
  if (qty <= 0) return;
  const cur = wh.stock[g] ?? { qty: 0, cost: unitCost };
  const total = cur.qty + qty;
  wh.stock[g] = { qty: total, cost: (cur.qty * cur.cost + qty * unitCost) / total };
}

/** Put up to qty units into your warehouses (in order). Returns what fit. */
export function store(w: WorldState, g: GoodId, qty: number, unitCost: number): number {
  let left = qty;
  for (const wh of w.play.warehouses) {
    if (left <= 0) break;
    const put = Math.min(left, roomFor(wh, g));
    addStock(wh, g, put, unitCost);
    left -= put;
  }
  return qty - left;
}

/** Take up to qty units out of your warehouses. Returns units taken and their cost. */
export function takeStock(w: WorldState, g: GoodId, qty: number, from?: Warehouse): { qty: number; cost: number } {
  let left = qty;
  let cost = 0;
  for (const wh of from ? [from] : w.play.warehouses) {
    const st = wh.stock[g];
    if (!st || left <= 0) continue;
    const t = Math.min(left, st.qty);
    st.qty -= t;
    cost += t * st.cost;
    left -= t;
    if (st.qty < 1e-6) delete wh.stock[g];
  }
  return { qty: qty - left, cost };
}

/** Pay a warehouse bill from your personal cash, then from your richest company. */
function payPersonal(w: WorldState, amount: number): void {
  const fromPlayer = Math.min(Math.max(0, w.player.cash), amount);
  w.player.cash -= fromPlayer;
  let rest = amount - fromPlayer;
  if (rest <= 0) return;
  const rich = w.companies.filter((c) => c.isPlayer && !c.bankrupt).sort((a, b) => b.cash - a.cash)[0];
  if (rich) { rich.cash -= rest; rest = 0; }
  else w.player.cash -= rest;
}

/** The company of yours that makes this good (to sell released stock through). */
export function sellerFor(w: WorldState, g: GoodId): Company | undefined {
  return w.companies.filter((c) => c.isPlayer && !c.bankrupt && c.good === g).sort((a, b) => b.capacity - a.capacity)[0];
}

/** Sell stock: back into your company's stock if you make it, otherwise to traders at 95% of the market price. */
function release(w: WorldState, wh: Warehouse, g: GoodId, qty: number): { qty: number; cash: number; via: string } {
  const got = takeStock(w, g, qty, wh);
  if (got.qty <= 0) return { qty: 0, cash: 0, via: '' };
  const co = sellerFor(w, g);
  if (co) {
    const total = co.inventory + got.qty;
    co.invCost = (co.inventory * co.invCost + got.cost) / total;
    co.inventory = total;
    return { qty: got.qty, cash: 0, via: co.name };
  }
  const cash = got.qty * refPrice(w, g) * 0.95;
  w.player.cash += cash;
  // traders sell it on, which eases a shortage a little
  const mk = w.goods[g];
  const daily = Math.max(1, mk.finalDemand + mk.b2bDemand);
  mk.tightness = Math.max(0.3, mk.tightness - 0.1 * (got.qty / daily));
  return { qty: got.qty, cash, via: 'traders' };
}

// ---------- daily ----------

export function dailyWarehouses(w: WorldState): void {
  const p = w.play;
  for (const wh of p.warehouses) {
    for (const g of GOOD_IDS) {
      const st = wh.stock[g];
      if (!st) continue;
      st.qty *= 1 - spoilRate(g);
      // Auto-sell rules: up to 10% of the stock a day while the rule holds
      const rule = wh.rules[g];
      if (rule && st.qty > 0) {
        const price = refPrice(w, g);
        const hit = (rule.above !== undefined && price >= st.cost * (1 + rule.above))
          || (rule.shortage && unlocked(w, 'squeeze') && w.goods[g].tightness > 1.08);
        if (hit) release(w, wh, g, Math.max(1, st.qty * 0.1));
      }
    }
    payPersonal(w, dailyCost(w, wh));
  }
  if (w.day % 7 === 0) squeezeAnger(w);
}

/** Rivals who need a good you are hoarding during a shortage get angry. */
function squeezeAnger(w: WorldState): void {
  for (const g of GOOD_IDS) {
    const held = storedQty(w, g);
    if (held <= 0) continue;
    const mk = w.goods[g];
    const daily = Math.max(1, mk.finalDemand + mk.b2bDemand);
    if (held / daily < 3 || mk.tightness < 1.1) continue;
    const users = new Set(w.companies.filter((c) => !c.isPlayer && !c.bankrupt && GOODS[c.good].inputs.some((i) => i.good === g)).map((c) => c.ownerId));
    for (const rv of w.rivals) if (users.has(rv.id)) remember(rv, w, -1, `You are hoarding ${GOODS[g].name.toLowerCase()} while they are short.`);
  }
}

/** Rivals with a taste for risk stockpile cheap goods and sell into shortages. Monthly. */
export function rivalStockpiles(w: WorldState, rand: () => number): void {
  const p = w.play;
  for (const s of [...p.aiStores]) {
    const mk = w.goods[s.good];
    if (mk.tightness > 1.05 || w.day - s.day > 240) {
      const rv = w.rivals.find((r) => r.id === s.rivalId);
      const price = refPrice(w, s.good);
      if (rv) rv.cash += s.qty * price;
      const daily = Math.max(1, mk.finalDemand + mk.b2bDemand);
      w.effects.push({ id: `e${++w.seq}`, kind: 'goodDemand', target: s.good, delta: -Math.min(0.15, (s.qty / daily) / 20), untilDay: w.day + 20 });
      mk.tightness = Math.max(0.3, mk.tightness - Math.min(0.2, s.qty / daily / 20));
      p.aiStores = p.aiStores.filter((x) => x !== s);
      addNews(w, 'commodities', `${rv?.name ?? 'A trader'} sells a stockpile of ${GOODS[s.good].name.toLowerCase()}`,
        `About ${Math.round(s.qty).toLocaleString()} ${GOODS[s.good].unit} hit the market, easing prices.`, 'neutral');
    }
  }
  if (p.aiStores.length >= 3 || rand() > 0.35) return;
  const cheap = GOOD_IDS.filter((g) => storable(g) && GOODS[g].tier !== 'product' && w.goods[g].idx < 0.95 && !p.aiStores.some((s) => s.good === g));
  const rv = w.rivals.filter((r) => r.personality.risk > 0.5 && r.cash > 5e6).sort((a, b) => b.personality.risk - a.personality.risk)[0];
  if (!cheap.length || !rv) return;
  const g = cheap[Math.floor(rand() * cheap.length)];
  const mk = w.goods[g];
  const daily = Math.max(1, mk.finalDemand + mk.b2bDemand);
  const qty = Math.min(daily * 10, (rv.cash * 0.1) / refPrice(w, g));
  rv.cash -= qty * refPrice(w, g);
  p.aiStores.push({ rivalId: rv.id, good: g, qty, cost: refPrice(w, g), day: w.day });
  w.effects.push({ id: `e${++w.seq}`, kind: 'goodDemand', target: g, delta: Math.min(0.15, (qty / daily) / 20), untilDay: w.day + 20 });
  addNews(w, 'commodities', `${rv.name} stockpiles ${GOODS[g].name.toLowerCase()}`,
    `Traders say ${rv.name} is buying cheap ${GOODS[g].name.toLowerCase()} to sell later. Prices may firm up.`, 'neutral');
}

// ---------- commands ----------

const ok = (message: string): CommandResult => ({ ok: true, message });
const fail = (message: string): CommandResult => ({ ok: false, message });

export function buildWarehouse(w: WorldState): CommandResult {
  if (!unlocked(w, 'warehouse')) return fail('Warehouses unlock at level 3');
  const cost = buildCost(w);
  if (w.player.cash < cost) return fail(`A new warehouse costs ${fmtMoney(cost)}`);
  w.player.cash -= cost;
  const n = w.play.warehouses.length + 1;
  w.play.warehouses.push({ id: `wh${++w.seq}`, name: `Warehouse ${n}`, level: 1, stock: {}, limits: {}, rules: {}, built: w.day });
  w.macro.capexMonth += cost;
  if (n === 1) banner(w, 'First warehouse!', 'Turn on "Send extra output to the warehouse" in a company\'s Automation tab.', 100, 'good');
  addNews(w, 'player', `You open Warehouse ${n}`, `Storage for your businesses, built for ${fmtMoney(cost)}.`, 'good');
  return ok(`Warehouse ${n} built`);
}

export function upgradeWarehouse(w: WorldState, id: string): CommandResult {
  const wh = w.play.warehouses.find((x) => x.id === id);
  if (!wh) return fail('Warehouse not found');
  if (wh.level >= MAX_WAREHOUSE_LEVEL) return fail('Already at the top level');
  const cost = upgradeCostOf(wh);
  if (w.player.cash < cost) return fail(`The upgrade costs ${fmtMoney(cost)}`);
  w.player.cash -= cost;
  wh.level += 1;
  w.macro.capexMonth += cost;
  return ok(`${wh.name} is now level ${wh.level}`);
}

export function setLimit(w: WorldState, id: string, g: GoodId, share: number): CommandResult {
  const wh = w.play.warehouses.find((x) => x.id === id);
  if (!wh) return fail('Warehouse not found');
  wh.limits[g] = clamp(share, 0, 1);
  return ok(`${GOODS[g].name} may use up to ${Math.round(wh.limits[g]! * 100)}% of ${wh.name}`);
}

export function releaseStock(w: WorldState, id: string, g: GoodId, qty: number): CommandResult {
  const wh = w.play.warehouses.find((x) => x.id === id);
  if (!wh) return fail('Warehouse not found');
  const r = release(w, wh, g, Math.max(0, qty));
  if (r.qty <= 0) return fail('Nothing to release');
  return ok(r.via === 'traders'
    ? `Sold ${Math.round(r.qty).toLocaleString()} ${GOODS[g].unit} to traders for ${fmtMoney(r.cash)}`
    : `${Math.round(r.qty).toLocaleString()} ${GOODS[g].unit} sent to ${r.via} to sell`);
}

export function setSellRule(w: WorldState, id: string, g: GoodId, above?: number, shortage?: boolean): CommandResult {
  const wh = w.play.warehouses.find((x) => x.id === id);
  if (!wh) return fail('Warehouse not found');
  if (shortage && !unlocked(w, 'squeeze')) return fail('Selling on shortages unlocks at level 10');
  if (above === undefined && !shortage) delete wh.rules[g];
  else wh.rules[g] = { above, shortage };
  return ok('Sell rule saved');
}

export function setBuyOrder(w: WorldState, warehouseId: string, g: GoodId, perDay: number, maxPrice: number): CommandResult {
  if (!unlocked(w, 'marketBuy')) return fail('Buying from the market unlocks at level 6');
  const wh = w.play.warehouses.find((x) => x.id === warehouseId);
  if (!wh) return fail('Warehouse not found');
  if (!storable(g)) return fail(`${GOODS[g].name} cannot be stored`);
  w.play.buyOrders = w.play.buyOrders.filter((o) => !(o.warehouseId === warehouseId && o.good === g));
  if (perDay <= 0) return ok('Buy order cancelled');
  w.play.buyOrders.push({ id: `bo${++w.seq}`, warehouseId, good: g, perDay, maxPrice });
  return ok(`Buying up to ${Math.round(perDay).toLocaleString()} ${GOODS[g].unit} a day`);
}

/** Rivals who are short of a good buy your stock at a premium (level 10). */
export function rivalBuyers(w: WorldState, g: GoodId): Company[] {
  return w.companies.filter((c) => !c.isPlayer && !c.bankrupt && c.cash > 0 && GOODS[c.good].inputs.some((i) => i.good === g)
    && (c.inputs[g]?.qty ?? 0) < c.capacity * (GOODS[c.good].inputs.find((i) => i.good === g)!.qty) * 3);
}

export function premiumPrice(w: WorldState, g: GoodId): number {
  return refPrice(w, g) * (1 + Math.min(0.3, 0.1 + Math.max(0, w.goods[g].tightness - 1)));
}

export function sellToRivals(w: WorldState, id: string, g: GoodId, qty: number): CommandResult {
  if (!unlocked(w, 'squeeze')) return fail('Selling to rivals unlocks at level 10');
  const wh = w.play.warehouses.find((x) => x.id === id);
  if (!wh) return fail('Warehouse not found');
  const buyers = rivalBuyers(w, g);
  if (!buyers.length) return fail('No rival is short of this right now');
  const price = premiumPrice(w, g);
  let left = Math.min(qty, wh.stock[g]?.qty ?? 0);
  let cash = 0;
  let sold = 0;
  for (const b of buyers) {
    if (left <= 0) break;
    const need = b.capacity * GOODS[b.good].inputs.find((i) => i.good === g)!.qty * 10;
    const t = Math.min(left, need, b.cash / price);
    if (t <= 0) continue;
    takeStock(w, g, t, wh);
    b.cash -= t * price;
    const cur = b.inputs[g] ?? { qty: 0, cost: price };
    b.inputs[g] = { qty: cur.qty + t, cost: (cur.qty * cur.cost + t * price) / (cur.qty + t) };
    cash += t * price;
    sold += t;
    left -= t;
    remember(w.rivals.find((r) => r.id === b.ownerId), w, -2, `Had to pay you a premium for ${GOODS[g].name.toLowerCase()}.`);
  }
  if (sold <= 0) return fail('No rival could pay');
  w.player.cash += cash;
  return ok(`Sold ${Math.round(sold).toLocaleString()} ${GOODS[g].unit} to rivals for ${fmtMoney(cash)}`);
}
