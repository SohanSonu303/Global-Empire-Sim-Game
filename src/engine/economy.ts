/**
 * The supply-chain economy. Each day:
 *  1. every company produces from its input store room (Q = min(capacity, labour, inputs));
 *  2. companies restock inputs: contracts first, then sister companies (same owner) at a discount,
 *     then the open market, and importers fill whatever local sellers cannot (at a premium);
 *  3. each good's market clears: households/exports + business buyers, split across sellers by
 *     price, brand, quality and size;
 *  4. P&L and cash are booked; each good's price index moves with shortage, input costs and hype.
 */
import { GOODS, GOOD_IDS, IMPORT_PREMIUM, fixedAt } from './data';
import { clamp, damageMult, drawCredit, emptyDay, finishDay, importPrice, productivity, refPrice, salaryOf, sellPrice, wageIndex, worldIdx } from './company';
import type { Company, DayResult, GoodId, GoodMarket, WorldState } from './types';
import { campaignMult, bookDelivery, jobPace, switchMult } from './strategy';
import { addStock, isStoring, roomFor, store, takeStock, totalRoom } from './warehouse';
import { FUNDING_SHARE, RESERVE_SPEED, expectedLoss, isBank, lenderOf, loanBooks, loanRate } from './banks';

interface Plan {
  c: Company;
  r: DayResult;
  avail: number; // finished units available to sell today
  price: number;
  vcSpend: number;
  attract: number;
  mktDemand: number;
}

interface Request {
  buyer: Plan;
  good: GoodId;
  qty: number;
}

export function createGoodsMarket(): Record<GoodId, GoodMarket> {
  const out = {} as Record<GoodId, GoodMarket>;
  for (const id of GOOD_IDS) out[id] = { idx: 1, finalDemand: 0, b2bDemand: 0, supply: 0, sold: 0, imported: 0, tightness: 1, hist: [] };
  return out;
}

export function effectMult(w: WorldState, kind: 'goodDemand' | 'goodSupply', good: GoodId): number {
  let m = 1;
  for (const e of w.effects) if (e.kind === kind && e.target === good) m += e.delta;
  if (kind === 'goodSupply' && good === 'crude_oil') m *= w.macro.oilSupply;
  return Math.max(0.2, m);
}

/** Expected daily output a company plans its buying around. */
export function plannedOutput(c: Company): number {
  return clamp(Math.max(c.last.demand, c.sum30.demand / 30, c.capacity * 0.25), 0, c.capacity);
}

function addInput(c: Company, good: GoodId, qty: number, unitCost: number): void {
  if (qty <= 0) return;
  const cur = c.inputs[good] ?? { qty: 0, cost: unitCost };
  const total = cur.qty + qty;
  c.inputs[good] = { qty: total, cost: (cur.qty * cur.cost + qty * unitCost) / total };
}

export function operateEconomy(w: WorldState): void {
  const m = w.macro;
  const pl = m.priceLevel;
  const plans: Plan[] = [];
  const byId = new Map<string, Plan>();

  // 1. Production
  for (const c of w.companies) {
    if (c.bankrupt) continue;
    const def = GOODS[c.good];
    const r = emptyDay();
    const effCap = c.capacity * (def.tier === 'raw' ? effectMult(w, 'goodSupply', c.good) : 1) * damageMult(w, c);
    const laborCap = c.strikeUntil > w.day ? 0 : c.workers * productivity(c);
    let materialCap = effCap;
    for (const i of def.inputs) materialCap = Math.min(materialCap, (c.inputs[i.good]?.qty ?? 0) / i.qty);
    const qMax = Math.max(0, Math.min(effCap, laborCap, materialCap));
    const expected = Math.max(c.last.demand, c.capacity * 0.25);
    const keep = expected * (1 + c.automation.inventoryDays);
    // With a warehouse, the plant keeps running when its own stock is full and stores the extra
    const room = isStoring(w, c) ? totalRoom(w, c.good) : 0;
    const produced = clamp(keep - c.inventory + room, 0, qMax);

    let matCost = 0;
    for (const i of def.inputs) {
      const st = c.inputs[i.good]!;
      const use = produced * i.qty;
      matCost += use * st.cost;
      st.qty = Math.max(0, st.qty - use);
    }
    const vcSpend = produced * def.vc * pl;
    if (produced > 0) {
      const total = c.inventory + produced;
      c.invCost = (c.inventory * c.invCost + matCost + vcSpend) / total;
      c.inventory = total;
      r.unitMaterialCost = (matCost + vcSpend) / produced;
      if (room > 0 && c.inventory > keep) c.inventory -= store(w, c.good, c.inventory - keep, c.invCost);
    } else {
      r.unitMaterialCost = c.last.unitMaterialCost;
    }
    r.capacity = c.capacity;
    r.laborCap = laborCap;
    r.materialCap = materialCap;
    r.produced = produced;
    const plan: Plan = { c, r, avail: c.inventory, price: sellPrice(w, c), vcSpend, attract: 0, mktDemand: 0 };
    r.price = plan.price;
    plans.push(plan);
    byId.set(c.id, plan);
  }

  // 2. Restocking requests (limited by what the buyer can pay for)
  const requests: Request[] = [];
  for (const p of plans) {
    const c = p.c;
    const def = GOODS[c.good];
    if (def.inputs.length === 0) continue;
    const planned = isStoring(w, c) ? c.capacity : plannedOutput(c);
    const wants = def.inputs.map((i) => ({ good: i.good, qty: Math.max(0, planned * i.qty * c.automation.supplyDays - (c.inputs[i.good]?.qty ?? 0)) }));
    const cost = wants.reduce((s, x) => s + x.qty * refPrice(w, x.good), 0) * 1.05;
    if (cost > c.cash) {
      // Buying inputs may draw on the credit line: an idle plant costs more than the loan.
      drawCredit(w, c, cost - Math.max(0, c.cash), 'materials');
    }
    const scale = cost > 0 ? clamp(Math.max(0, c.cash) / cost, 0, 1) : 0;
    for (const x of wants) if (x.qty * scale > 1e-6) requests.push({ buyer: p, good: x.good, qty: x.qty * scale });
  }

  const pay = (buyer: Plan, seller: Plan | null, good: GoodId, qty: number, unitPrice: number) => {
    if (qty <= 0) return;
    const cost = qty * unitPrice;
    buyer.c.cash -= cost;
    buyer.r.purchases += cost;
    addInput(buyer.c, good, qty, unitPrice);
    if (seller) {
      seller.avail -= qty;
      seller.r.sold += qty;
      seller.r.revenue += cost;
    } else {
      buyer.r.importedInputs += qty;
    }
  };

  const incomeMult = m.realConsumption * (0.85 + 0.25 * m.confidence);

  // 3. Clear each market
  for (const g of GOOD_IDS) {
    const def = GOODS[g];
    const mk = w.goods[g];
    const sellers = plans.filter((p) => p.c.good === g);
    const supplyStart = sellers.reduce((s, p) => s + p.avail, 0);
    const reqs = requests.filter((q) => q.good === g);
    let b2bTotal = 0;
    let imported = 0;

    // 3a. Delivery jobs from the contracts board and won tenders: plant stock first, then warehouses
    for (const j of w.play?.jobs ?? []) {
      if (j.good !== g || j.status !== 'active') continue;
      const seller = j.companyId ? byId.get(j.companyId) : undefined;
      if (!seller) continue;
      const want = jobPace(w, j);
      const fromPlant = Math.min(want, Math.max(0, seller.avail));
      seller.avail -= fromPlant;
      const fromStore = takeStock(w, g, want - fromPlant).qty;
      const paid = bookDelivery(w, j, fromPlant + fromStore);
      seller.r.sold += fromPlant + fromStore;
      seller.r.contractSold += fromPlant + fromStore;
      seller.r.revenue += paid;
      b2bTotal += fromPlant + fromStore;
    }

    // 3a. Contracts
    for (const k of w.contracts) {
      if (k.good !== g || k.endDay < w.day || k.startDay > w.day) continue;
      const seller = byId.get(k.sellerId);
      const buyer = byId.get(k.buyerId);
      if (!seller || !buyer) continue;
      const qty = Math.min(k.qtyPerDay, Math.max(0, seller.avail), Math.max(0, buyer.c.cash / Math.max(1e-6, k.price)));
      pay(buyer, seller, g, qty, k.price);
      seller.r.contractSold += qty;
      k.delivered += qty;
      k.shortfall += Math.max(0, k.qtyPerDay - qty);
      b2bTotal += qty;
      for (const q of reqs) if (q.buyer === buyer) q.qty = Math.max(0, q.qty - qty);
    }

    // 3b. Sister companies (same owner) supply first, at their discount
    for (const q of reqs) {
      if (q.qty <= 0 || q.buyer.c.ownerId === 'public') continue;
      for (const s of sellers) {
        if (s.c.ownerId !== q.buyer.c.ownerId || s.avail <= 0 || q.qty <= 0) continue;
        const qty = Math.min(q.qty, s.avail);
        pay(q.buyer, s, g, qty, s.price * (1 - s.c.sisterDiscount));
        s.r.sisterSold += qty;
        q.qty -= qty;
        b2bTotal += qty;
      }
    }

    // 3c. Open market: final buyers + remaining business buyers
    const capW = sellers.reduce((s, p) => s + p.c.capacity, 0);
    const base = def.p0 * pl;
    const avgPrice = capW > 0 ? sellers.reduce((s, p) => s + p.price * p.c.capacity, 0) / capW : refPrice(w, g);
    const finalMult = def.tier === 'product' || g === 'electricity' ? incomeMult : 1;
    const finalD = def.d0 * Math.pow(avgPrice / base, -def.elasticity) * finalMult * effectMult(w, 'goodDemand', g);
    // Your warehouse buy orders bid for local supply like any business buyer (no imports)
    const orders = (w.play?.buyOrders ?? []).filter((o) => o.good === g && refPrice(w, g) <= o.maxPrice);
    const whWant = orders.map((o) => {
      const wh = w.play.warehouses.find((x) => x.id === o.warehouseId);
      const afford = Math.max(0, w.player.cash) / (avgPrice * 1.03);
      return { o, wh, qty: wh ? Math.max(0, Math.min(o.perDay, roomFor(wh, g), afford)) : 0 };
    });
    const whQty = whWant.reduce((s, x) => s + x.qty, 0);
    const b2bOpen = reqs.reduce((s, q) => s + q.qty, 0) + whQty;
    const total = finalD + b2bOpen;

    let sumA = 0;
    for (const p of sellers) {
      // Business materials are bought on price (and a little quality); consumer products also on brand.
      const appeal = def.tier === 'product' ? p.c.brand * p.c.quality : Math.sqrt(p.c.quality);
      const camp = w.play ? campaignMult(w, p.c) : 1;
      p.attract = Math.pow(p.price / avgPrice, -def.switchElasticity * switchMult(p.c)) * appeal * camp * Math.pow(p.c.capacity, 0.85);
      sumA += p.attract;
    }
    let soldOpen = 0;
    let revenueOpen = 0;
    if (sumA > 0 && total > 0) {
      let overflow = 0;
      const take = new Map<Plan, number>();
      for (const p of sellers) {
        p.mktDemand = (total * p.attract) / sumA;
        const t = Math.min(p.mktDemand, Math.max(0, p.avail));
        take.set(p, t);
        overflow += p.mktDemand - t;
      }
      if (overflow > 0) {
        const spare = sellers.filter((p) => p.avail - take.get(p)! > 1e-6);
        const sA = spare.reduce((s, p) => s + p.attract, 0);
        let placed = 0;
        for (const p of spare) {
          const extra = Math.min((overflow * p.attract) / sA, p.avail - take.get(p)!);
          take.set(p, take.get(p)! + extra);
          p.mktDemand += extra;
          placed += extra;
        }
        // Orders nobody could fill still tell producers with idle capacity to make more tomorrow.
        const left = overflow - placed;
        const idle = sellers.filter((p) => p.c.capacity > p.r.produced * 1.02);
        const iA = idle.reduce((s, p) => s + p.attract, 0);
        if (left > 0 && iA > 0) for (const p of idle) p.mktDemand += Math.min((left * p.attract) / iA, p.c.capacity - p.r.produced);
      }
      for (const p of sellers) {
        const t = take.get(p)!;
        p.avail -= t;
        p.r.sold += t;
        p.r.revenue += t * p.price;
        soldOpen += t;
        revenueOpen += t * p.price;
      }
    }
    // Business buyers get their share of local supply at the average price; importers cover the rest.
    const localToB2B = total > 0 ? soldOpen * (b2bOpen / total) : 0;
    const fill = b2bOpen > 0 ? localToB2B / b2bOpen : 0;
    const avgPaid = soldOpen > 0 ? revenueOpen / soldOpen : avgPrice;
    const imp = Math.max(importPrice(w, g), avgPaid);
    for (const x of whWant) {
      if (!x.wh || x.qty <= 0) continue;
      const local = x.qty * fill;
      w.player.cash -= local * avgPaid * 1.03;
      addStock(x.wh, g, local, avgPaid * 1.03);
    }
    for (const q of reqs) {
      if (q.qty <= 0) continue;
      const local = q.qty * fill;
      const cost = local * avgPaid;
      q.buyer.c.cash -= cost;
      q.buyer.r.purchases += cost;
      addInput(q.buyer.c, g, local, avgPaid);
      const rest = q.qty - local;
      pay(q.buyer, null, g, rest, imp);
      imported += rest;
    }
    b2bTotal += b2bOpen;

    // Market stats and price index
    const soldAll = sellers.reduce((s, p) => s + p.r.sold, 0);
    for (const p of sellers) {
      p.r.demand = p.mktDemand + p.r.sisterSold + p.r.contractSold;
      p.r.marketShare = soldAll > 0 ? p.r.sold / soldAll : 0;
    }
    mk.finalDemand = finalD;
    mk.b2bDemand = b2bTotal;
    mk.supply = supplyStart;
    mk.sold = soldAll;
    mk.imported = imported;
    const effCap = Math.max(1, capW * (def.tier === 'raw' ? effectMult(w, 'goodSupply', g) : 1));
    const consumption = finalD + usedPerDay(g, plans) + whQty;
    const ratio = consumption / effCap;
    mk.tightness = mk.tightness * 0.9 + ratio * 0.1;
  }

  // 4. Price indices (cost push x shortage pull, capped by import parity)
  for (const g of GOOD_IDS) {
    const def = GOODS[g];
    const mk = w.goods[g];
    let costIdx: number;
    if (def.inputs.length === 0) {
      costIdx = worldIdx(w, g);
    } else {
      const baseIn = def.inputs.reduce((s, i) => s + i.qty * GOODS[i.good].p0, 0);
      const nowIn = def.inputs.reduce((s, i) => s + i.qty * GOODS[i.good].p0 * w.goods[i.good].idx, 0);
      const rest = def.p0 - baseIn;
      costIdx = (nowIn + rest) / def.p0;
    }
    const pull = Math.pow(clamp(mk.tightness / 0.87, 0.5, 2.5), 0.7);
    const target = clamp(costIdx * pull, 0.4, worldIdx(w, g) * IMPORT_PREMIUM * 1.05);
    mk.idx = clamp(mk.idx + 0.025 * (target - mk.idx), 0.35, 4);
    if (w.day % 2 === 0) {
      mk.hist.push({ day: w.day, price: refPrice(w, g) });
      if (mk.hist.length > 120) mk.hist.shift();
    }
  }

  // 5. P&L and cash. Interest goes to each borrower's bank.
  const books = loanBooks(w);
  const owed = new Map<string, number>();
  const bankIncome = new Map<string, number>();
  const bankRisk = new Map<string, number>();
  for (const p of plans) {
    const c = p.c;
    const i = (Math.max(0, c.debt) * loanRate(w, c, books)) / 365;
    owed.set(c.id, i);
    if (c.bankId && lenderOf(w, c)) {
      bankIncome.set(c.bankId, (bankIncome.get(c.bankId) ?? 0) + i);
      bankRisk.set(c.bankId, (bankRisk.get(c.bankId) ?? 0) + expectedLoss(c));
    }
  }
  for (const p of plans) {
    const c = p.c;
    const r = p.r;
    const sold = r.sold;
    r.cogs = sold * c.invCost;
    c.inventory = Math.max(0, p.avail) * 0.997;
    r.grossProfit = r.revenue - r.cogs;
    r.wages = c.workers * salaryOf(c) * c.salaryMult * wageIndex(w);
    r.fixed = fixedAt(c.good, c.level) * pl;
    r.marketing = r.revenue * c.marketingPct;
    r.rd = r.revenue * c.rdPct;
    r.opex = r.wages + r.fixed + r.marketing + r.rd;
    if (isBank(c)) {
      r.interestIncome = bankIncome.get(c.id) ?? 0;
      r.fundingCost = ((books.get(c.id) ?? 0) * m.rate * FUNDING_SHARE) / 365;
      // Set money aside for loans expected to go bad (or release it when borrowers recover)
      const reserve = c.loanReserve ?? 0;
      r.loanLosses = ((bankRisk.get(c.id) ?? 0) - reserve) * RESERVE_SPEED;
      c.loanReserve = reserve + r.loanLosses;
    }
    r.operatingProfit = r.grossProfit - r.opex + r.interestIncome - r.fundingCost - r.loanLosses;
    r.interest = owed.get(c.id) ?? 0;
    const pretax = r.operatingProfit - r.interest;
    r.tax = Math.max(0, pretax) * m.taxRate;
    r.netIncome = pretax - r.tax;
    // Purchases were already paid; production's other variable cost is paid now.
    c.cash += r.revenue - p.vcSpend - r.opex + r.interestIncome - r.fundingCost - r.loanLosses - r.interest - r.tax;
    finishDay(w, c, r);
  }

  // Expired contracts
  if (w.contracts.length) w.contracts = w.contracts.filter((k) => k.endDay >= w.day);
}

/** Input consumption of a good per day across all its users (planned output x recipe). */
function usedPerDay(g: GoodId, plans: Plan[]): number {
  let s = 0;
  for (const p of plans) {
    const i = GOODS[p.c.good].inputs.find((x) => x.good === g);
    if (i) s += plannedOutput(p.c) * i.qty;
  }
  return s;
}

/** Total daily demand for a good if every user ran at its plan: final demand + business use. */
export function demandBreakdown(w: WorldState, g: GoodId): { final: number; business: number; capacity: number } {
  const def = GOODS[g];
  const sellers = w.companies.filter((c) => c.good === g && !c.bankrupt);
  const business = w.companies.reduce((s, c) => {
    if (c.bankrupt) return s;
    const i = GOODS[c.good].inputs.find((x) => x.good === g);
    return i ? s + plannedOutput(c) * i.qty : s;
  }, 0);
  return { final: w.goods[g].finalDemand || def.d0, business, capacity: sellers.reduce((s, c) => s + c.capacity, 0) };
}
