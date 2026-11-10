/**
 * Hired managers run your companies week to week.
 * A Manager keeps the machines and the stock room in order. A Top manager runs the whole
 * company: price, marketing, R&D, pay, stock, the warehouse share and the cash buffer. Big
 * moves (upgrades, supply deals, loans) are never made alone: the manager recommends them
 * in its weekly report and you approve them from the assistant.
 */
import { GOODS, maxPriceMult } from './data';
import { clamp, reachOf, refPrice } from './company';
import { fillRate, marketQuality } from './business';
import { cashRisk, lowSupply } from './advisor';
import { cleanSplit, marketShareOf, storable, totalRoom } from './warehouse';
import { fmtPct } from './news';
import type { Company, WorldState } from './types';

/** Marketing a Top manager spends while it still needs customers, and once it has them */
export const MGR_MKT_GROW = 0.05;
export const MGR_MKT_KEEP = 0.03;
/** R&D a Top manager spends when rivals make better products */
export const MGR_RD = 0.04;
/** Warehouse share a Top manager uses while prices are low */
export const MGR_STORE = 0.1;

const pctTxt = (v: number) => `${Math.round(v * 100)}%`;

/** Machines and supplies: what any hired manager looks after. */
function basics(c: Company, did: string[]): void {
  const cond = c.condition ?? 1;
  const was = c.maintenance ?? 'normal';
  if (cond < 0.8 && was !== 'high') c.maintenance = 'high';
  else if (was === 'low') c.maintenance = 'normal';
  else if (was === 'high' && cond > 0.95) c.maintenance = 'normal';
  if ((c.maintenance ?? 'normal') !== was) did.push(`maintenance to ${c.maintenance} (machines at ${pctTxt(cond)})`);
  if (lowSupply(c).length && c.automation.supplyDays < 6) {
    c.automation.supplyDays += 1;
    did.push(`keeps ${c.automation.supplyDays} days of materials (was running short)`);
  }
}

function runPro(w: WorldState, c: Company, did: string[]): void {
  const r = c.sum30;
  const fill = r.demand > 0 ? r.sold / r.demand : 1;
  const invDays = c.inventory / Math.max(1, c.last.demand);
  const util = r.sold / Math.max(1, r.capacity * 30);
  const unitCost = (r.cogs + r.wages + r.fixed) / Math.max(1, r.sold);
  const ref = refPrice(w, c.good);
  const cap = Math.min(1.3, maxPriceMult(c.good));
  // Price: charge more while orders go unfilled, less while stock piles up (never below cost)
  const before = c.priceMult;
  if (fill < 0.97 && invDays < 0.3 && c.priceMult * 1.02 <= cap) c.priceMult *= 1.02;
  else if ((invDays > 1.5 || util < 0.7) && ref * c.priceMult * 0.98 > unitCost * 1.03) c.priceMult *= 0.98;
  c.priceMult = clamp(c.priceMult, 0.6, cap);
  if (c.priceMult > before * 1.001) did.push('price +2% (orders not being met)');
  else if (c.priceMult < before * 0.999) did.push('price -2% (stock piling up)');

  // Customers: market harder until the company is well known, then ease off
  const reach = reachOf(c);
  if (reach < 0.8 && c.marketingPct < MGR_MKT_GROW) { c.marketingPct = MGR_MKT_GROW; did.push(`marketing to ${pctTxt(MGR_MKT_GROW)} to win customers (${pctTxt(reach)} so far)`); }
  else if (reach > 1 && c.marketingPct > MGR_MKT_KEEP + 0.01) { c.marketingPct = MGR_MKT_KEEP; did.push(`marketing down to ${pctTxt(MGR_MKT_KEEP)} (customers won)`); }

  // Quality: keep up with rivals
  const mq = marketQuality(w, c.good);
  if (c.quality < mq * 0.95 && c.rdPct < MGR_RD) { c.rdPct = MGR_RD; did.push(`R&D to ${pctTxt(MGR_RD)} (quality ${c.quality.toFixed(2)} vs ${mq.toFixed(2)})`); }

  // Staff: pay a little more when morale is low
  if (c.morale < 0.55 && c.salaryMult < 1.25) { c.salaryMult = Math.round((c.salaryMult + 0.05) * 100) / 100; did.push(`pay +5% (morale ${pctTxt(c.morale)})`); }

  // Warehouse: store some output while prices are low, sell it all on the market when they recover
  const idx = w.goods[c.good]?.idx ?? 1;
  if (storable(c.good) && w.play.warehouses.length) {
    const s = c.split ?? { deals: 0, contracts: 0, warehouse: 0 };
    if (idx < 0.93 && s.warehouse < MGR_STORE && totalRoom(w, c.good) > c.capacity * 14 && marketShareOf(s) >= 0.5 + MGR_STORE) {
      c.split = cleanSplit({ ...s, warehouse: MGR_STORE });
      did.push(`stores ${pctTxt(MGR_STORE)} of output (price ${fmtPct(idx - 1, 0)} vs normal)`);
    } else if (idx > 1.03 && s.warehouse > 0 && c.split) {
      c.split = cleanSplit({ ...s, warehouse: 0 });
      did.push('stopped storing (prices recovered)');
    }
  }

  // Cash: keep more in the company while it is short
  if (cashRisk(w, c) && c.automation.dividendPct > 25) {
    c.automation.dividendPct = 25;
    did.push('takes 25% of profit as dividends until cash recovers');
  }
}

/** Weekly: hired managers do their rounds and write a short report for the assistant. */
export function weeklyManagers(w: WorldState): void {
  for (const c of w.companies) {
    if (!c.isPlayer || c.bankrupt) continue;
    const m = c.manager ?? 'none';
    if (m === 'none') { delete c.mgrLog; continue; }
    const did: string[] = [];
    basics(c, did);
    if (m === 'pro') runPro(w, c, did);
    c.mgrLog = { day: w.day, did };
  }
}

/** The status line a manager's report opens with */
export function managerStatus(w: WorldState, c: Company): string {
  const r = c.sum30;
  const util = r.sold / Math.max(1, r.capacity * 30);
  const idx = w.goods[c.good]?.idx ?? 1;
  return `Plant ${pctTxt(Math.min(1, util))} used · orders filled ${pctTxt(fillRate(c))} · customers ${pctTxt(reachOf(c))} · satisfaction ${pctTxt(c.satisfaction ?? 0.75)} · ${GOODS[c.good].name.toLowerCase()} price ${idx >= 1 ? '+' : ''}${fmtPct(idx - 1, 0)} vs normal`;
}
