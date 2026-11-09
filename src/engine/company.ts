import { isStoring } from './warehouse';
import { AI_UPGRADE_COST_GROWTH, GOODS, INDUSTRIES, IMPORT_PREMIUM, UPGRADE_COST_GROWTH, fixedAt, upgradeCost, LEVEL_CAP_MULT, MAX_LEVEL, maxPriceMult } from './data';
import { payOwners } from './ownership';
import { noteOpsSaved } from './traits';
import type { Boost, Company, DayResult, Explanation, GoodId, LoanReason, MaintLevel, ManagerId, WorldState } from './types';

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function emptyDay(): DayResult {
  return {
    produced: 0, demand: 0, sold: 0, price: 0, revenue: 0, cogs: 0, grossProfit: 0, wages: 0, fixed: 0,
    marketing: 0, rd: 0, opex: 0, operatingProfit: 0, interest: 0, tax: 0, netIncome: 0,
    capacity: 0, laborCap: 0, materialCap: 0, marketShare: 0,
    purchases: 0, unitMaterialCost: 0, importedInputs: 0, sisterSold: 0, contractSold: 0, interestIncome: 0, fundingCost: 0, loanLosses: 0,
  };
}

/** Market reference price for a good today (base price x price level x market index). */
export function refPrice(w: WorldState, good: GoodId): number {
  return GOODS[good].p0 * w.macro.priceLevel * (w.goods?.[good]?.idx ?? 1);
}

/** World price index for a good (only oil moves with world events). */
export function worldIdx(w: WorldState, good: GoodId): number {
  return good === 'crude_oil' ? w.macro.oilPrice : 1;
}

/** What an importer charges: always available, never cheap. */
export function importPrice(w: WorldState, good: GoodId): number {
  return GOODS[good].p0 * w.macro.priceLevel * worldIdx(w, good) * IMPORT_PREMIUM;
}

/** A company's selling price today. */
export function sellPrice(w: WorldState, c: Company): number {
  return refPrice(w, c.good) * Math.min(c.priceMult * boostMult(c, 'price'), maxPriceMult(c.good));
}

// ---------- running a business: customers, machines, staff, managers ----------

/** Product of the company's active boosts of one kind (expired ones are cleared each day). */
export function boostMult(c: Company, kind: Boost['kind']): number {
  let m = 1;
  for (const b of c.boosts ?? []) if (b.kind === kind) m *= b.mult;
  return m;
}

export function addBoost(w: WorldState, c: Company, kind: Boost['kind'], mult: number, days: number, why: string): void {
  (c.boosts ??= []).push({ kind, mult, until: w.day + days, why });
}

/** Customers relative to an established firm (1). */
export function reachOf(c: Company): number {
  return c.reach ?? 1;
}

/** A new company's starting customers and team */
export const NEW_REACH = 0.25;
export const NEW_SKILL = 0.95;
/** A new hire's output while learning, against a trained worker */
export const NEW_HIRE_SKILL = 0.85;

/** Maintenance: daily cost as a share of the plant's fixed costs, and how much condition it restores a day */
export const MAINT: Record<MaintLevel, { label: string; cost: number; fix: number }> = {
  low: { label: 'Low', cost: 0, fix: 0 },
  normal: { label: 'Normal', cost: 0.06, fix: 0.0011 },
  high: { label: 'High', cost: 0.18, fix: 0.0028 },
};
/** Condition lost per day when the plant runs flat out */
export const WEAR_PER_DAY = 0.0012;

/** Day-to-day managers for your companies: a share of revenue, with a daily minimum */
export const MANAGERS: Record<ManagerId, { label: string; pct: number; min: number; blurb: string }> = {
  none: { label: 'You', pct: 0, min: 0, blurb: 'You answer every decision yourself. Free, and the best results if you pay attention.' },
  basic: { label: 'Manager', pct: 0.01, min: 250, blurb: 'Answers the inbox with safe, middle-of-the-road choices after a couple of days.' },
  pro: { label: 'Top manager', pct: 0.025, min: 900, blurb: 'Answers the inbox with the best choice right away, keeps maintenance up and tunes the price each week.' },
};

export function maintCostPerDay(w: WorldState, c: Company): number {
  return fixedAt(c.good, c.level) * w.macro.priceLevel * (c.fixedScale ?? 1) * MAINT[c.maintenance ?? 'normal'].cost;
}

export function managerCostPerDay(w: WorldState, c: Company): number {
  const m = MANAGERS[c.manager ?? 'none'];
  if (!c.isPlayer || m.pct === 0) return 0;
  return Math.max(m.min * w.macro.priceLevel, c.sum30.revenue / 30 * m.pct);
}

/** Output per worker lost to worn machines: none at condition 1, 15% at 0 */
export function conditionMult(c: Company): number {
  return 0.85 + 0.15 * (c.condition ?? 1);
}

export function wageIndex(w: WorldState): number {
  return w.macro.priceLevel;
}

export function salaryOf(c: Pick<Company, 'industry'>): number {
  return INDUSTRIES[c.industry].salary;
}

/** Per-unit cost breakdown at today's market prices for a company (or a new level-1 one). */
export function unitEconomics(w: WorldState, good: GoodId, opts?: { level?: number; util?: number; salaryMult?: number; morale?: number; inputs?: Company['inputs'] }) {
  const def = GOODS[good];
  const pl = w.macro.priceLevel;
  const level = opts?.level ?? 1;
  const util = clamp(opts?.util ?? 0.85, 0.05, 1);
  const inputs = def.inputs.map((i) => {
    const held = opts?.inputs?.[i.good];
    const unitPrice = held && held.qty > 0 ? held.cost : refPrice(w, i.good);
    return { good: i.good, qty: i.qty, unitPrice, cost: i.qty * unitPrice };
  });
  const materials = inputs.reduce((s, i) => s + i.cost, 0);
  const other = def.vc * pl;
  const prod = def.unitsPerWorker * (0.6 + 0.5 * (opts?.morale ?? 0.75));
  const labour = (INDUSTRIES[def.industry].salary * (opts?.salaryMult ?? 1) * pl) / prod;
  const capacity = def.baseCapacity * Math.pow(LEVEL_CAP_MULT, level - 1);
  const fixed = (fixedAt(good, level) * pl) / (capacity * util);
  const total = materials + other + labour + fixed;
  const price = refPrice(w, good);
  return { inputs, materials, other, labour, fixed, total, price, margin: price > 0 ? (price - total) / price : 0, capacity };
}

export function productivity(c: Company): number {
  return GOODS[c.good].unitsPerWorker * (0.6 + 0.5 * c.morale) * (c.isPlayer && c.ops ? 1.05 : 1) * (c.skill ?? 1) * conditionMult(c) * boostMult(c, 'productivity');
}

/** Staff needed to run at full capacity. */
export function workersNeeded(c: Company): number {
  return Math.ceil(c.capacity / productivity(c));
}

/** Staff needed for the output the company actually expects to sell (+10%). */
export function workersForDemand(c: Company): number {
  const avgDemand = Math.max(c.last.demand, c.sum30.demand / 30);
  const units = Math.min(c.capacity, Math.max(avgDemand * 1.1, c.capacity * 0.2));
  return Math.ceil(units / productivity(c));
}

/** Days of production the input store room covers (Infinity when no inputs). */
export function supplyCover(c: Company): { good: GoodId; days: number; qty: number }[] {
  const daily = Math.max(c.last.produced, c.capacity * 0.25);
  return GOODS[c.good].inputs.map((i) => {
    const qty = c.inputs[i.good]?.qty ?? 0;
    return { good: i.good, qty, days: qty / Math.max(1e-6, daily * i.qty) };
  });
}

export function loanSpread(c: Company): number {
  const annualRev = Math.max(1, c.sum30.revenue * 12.17);
  const leverage = c.debt / annualRev;
  return 0.02 + clamp(leverage, 0, 2) * 0.04;
}

export function creditLimit(c: Company): number {
  return Math.max(50_000, c.sum30.revenue * 2 + c.assets * 0.5);
}

/** Borrow up to `amount` on the credit line and note why. Returns what was borrowed. */
export function drawCredit(w: WorldState, c: Company, amount: number, reason: LoanReason): number {
  const amt = Math.min(amount, creditLimit(c) - c.debt);
  if (amt <= 0) return 0;
  c.debt += amt;
  c.cash += amt;
  const log = (c.loanLog ??= []);
  const top = log[0];
  if (top && top.day === w.day && top.reason === reason) top.amount += amt;
  else { log.unshift({ day: w.day, amount: amt, reason }); if (log.length > 12) log.length = 12; }
  return amt;
}

/** Output limit from accident damage today (1 = undamaged). */
export function damageMult(w: WorldState, c: Company): number {
  return c.damage && c.damage.untilDay > w.day ? c.damage.mult : 1;
}

/** Cash a company keeps before repaying loans: its buffer plus about 5 days of spending. */
export function repayBuffer(c: Company): number {
  return c.automation.minCash + (c.lockedCapital ?? 0) + ((c.sum30.purchases + c.sum30.opex) / 30) * 5;
}

export function nextUpgradeCost(c: Company): number {
  return upgradeCost(c.good, c.level + 1, c.isPlayer ? UPGRADE_COST_GROWTH : AI_UPGRADE_COST_GROWTH) * (c.isPlayer && c.ops ? 0.9 : 1);
}

export function canUpgrade(c: Company): boolean {
  return c.level < MAX_LEVEL && !c.bankrupt;
}

export function applyUpgrade(w: WorldState, c: Company): void {
  const cost = nextUpgradeCost(c);
  c.level += 1;
  c.capacity *= LEVEL_CAP_MULT;
  if (c.isPlayer && w.play) w.play.upgraded[c.id] = w.day;
  c.assets += cost;
  w.macro.capexMonth += cost;
}

/** Brand, quality, morale drift and history bookkeeping after a day's result. */
export function finishDay(w: WorldState, c: Company, r: DayResult): void {
  const brandTarget = clamp(0.7 + c.marketingPct * 9, 0.6, 1.6);
  c.brand += (brandTarget - c.brand) * 0.01;
  const qualTarget = clamp(0.8 + c.rdPct * INDUSTRIES[c.industry].rdK, 0.6, 1.6);
  c.quality += (qualTarget - c.quality) * 0.004;

  const overwork = clamp(r.produced / Math.max(1, c.workers * productivity(c)) - 1, 0, 1);
  const moraleTarget = clamp(0.3 + 0.5 * c.salaryMult - 0.3 * overwork - (c.cash < 0 ? 0.15 : 0), 0, 1);
  c.morale += (moraleTarget - c.morale) * 0.04;
  if (c.morale < 0.45) c.workers = Math.max(0, c.workers * (1 - (0.45 - c.morale) * 0.02));

  const k = 29 / 30;
  for (const key of Object.keys(r) as (keyof DayResult)[]) {
    if (key === 'price' || key === 'marketShare' || key === 'capacity' || key === 'laborCap' || key === 'materialCap' || key === 'unitMaterialCost') {
      c.sum30[key] = r[key];
    } else {
      c.sum30[key] = (c.sum30[key] ?? 0) * k + r[key];
    }
  }
  c.last = r;
  c.qAcc.revenue += r.revenue;
  c.qAcc.net += r.netIncome;
  c.hist.push({ day: w.day, revenue: r.revenue, net: r.netIncome, cash: c.cash });
  if (c.hist.length > 180) c.hist.shift();
}

/** Automation policies that run daily (for player companies and AI alike). */
export function runAutomation(w: WorldState, c: Company): void {
  if (c.bankrupt) return;
  const salary = salaryOf(c);
  const a = c.automation;
  if (a.autoRecruit) {
    // With warehouse room, staff the whole plant so the extra output can be stored
    const need = isStoring(w, c) ? workersNeeded(c) : workersForDemand(c);
    if (c.workers < need) {
      const hires = Math.ceil(Math.min(need - c.workers, Math.max(2, c.workers * 0.15)));
      const hireCost = hires * salary * 5 * wageIndex(w);
      if (c.cash < hireCost) {
        // Recruiting may draw on the credit line: idle capacity costs more than the loan
        drawCredit(w, c, hireCost - c.cash, 'hiring');
      }
      if (c.cash >= hireCost) {
        // New hires start slower than trained workers and dilute the team's experience
        if (c.isPlayer) c.skill = ((c.skill ?? 1) * c.workers + NEW_HIRE_SKILL * hires) / Math.max(1, c.workers + hires);
        c.workers += hires;
        c.cash -= hireCost;
      }
    } else if (c.workers > need * 1.25) {
      c.workers = Math.max(need, c.workers * 0.97);
      c.morale = Math.max(0, c.morale - 0.01);
    }
  }
  // Keep minimum cash by drawing on credit
  if (c.cash < a.minCash) drawCredit(w, c, a.minCash - c.cash, 'cash buffer');
  // Your companies pay loans back from spare cash before paying you dividends
  if (c.isPlayer && a.autoRepay !== false && c.debt > 0) {
    const spare = c.cash - repayBuffer(c);
    if (spare > 0) { const amt = Math.min(spare, c.debt); c.debt -= amt; c.cash -= amt; }
  }
  if (c.cash < 0) c.lowCashDays += 1;
  else c.lowCashDays = Math.max(0, c.lowCashDays - 1);

  // Dividends to the owner
  // Your companies keep about 10 days of running costs before paying you: customers pay late and bills come early
  const keep = a.minCash + (c.lockedCapital ?? 0) + (c.isPlayer ? (c.last.opex + c.last.purchases) * 10 : 0);
  if (c.last.netIncome > 0 && a.dividendPct > 0 && c.cash > keep) {
    const div = Math.min(c.cash - keep, (c.last.netIncome * a.dividendPct) / 100);
    if (div > 0) {
      c.cash -= div;
      payOwners(w, c, div); // partners and other shareholders get their share
    }
  }

  if (a.autoUpgrade && canUpgrade(c)) {
    const util = c.last.sold / Math.max(1, c.capacity);
    const cost = nextUpgradeCost(c);
    // A monopoly (40%+ share) has no buyers left to grow into: extra levels only add fixed costs
    const monopoly = c.isPlayer && c.last.marketShare > 0.4;
    if (!monopoly && util > 0.9 && c.last.demand > c.capacity * 0.95 && c.cash > cost + a.minCash) {
      c.cash -= cost;
      if (c.isPlayer && c.ops) noteOpsSaved(w, cost / 0.9 - cost);
      applyUpgrade(w, c);
    }
  }
}

/** Private valuation: book equity plus a multiple of trailing earnings. */
export function companyValue(c: Company): number {
  const annualNet = c.sum30.netIncome * 12.17;
  return Math.max(0, c.cash + (c.receivables ?? 0) - c.debt + c.assets * 0.6 + Math.max(0, annualNet) * 3);
}

export function companyValueExplain(c: Company): Explanation {
  const annualNet = c.sum30.netIncome * 12.17;
  return {
    title: `${c.name} valuation`,
    lines: [
      { label: 'Cash', value: c.cash, op: '' },
      ...(c.receivables ? [{ label: 'Owed by customers', value: c.receivables, op: '+' as const }] : []),
      { label: 'Debt', value: c.debt, op: '-' },
      { label: 'Fixed assets x 0.6', value: c.assets * 0.6, op: '+' },
      { label: 'Annual net income x 3', value: Math.max(0, annualNet) * 3, op: '+' },
      { label: 'Estimated value', value: companyValue(c), op: '=' },
    ],
    note: 'Private companies are valued at book assets plus three years of trailing earnings (never below zero).',
  };
}

export function pnlExplain(c: Company, period: 'day' | '30d'): Explanation {
  const r = period === 'day' ? c.last : c.sum30;
  const label = period === 'day' ? 'yesterday' : 'last ~30 days';
  return {
    title: `${c.name} net income (${label})`,
    lines: [
      { label: `Revenue (${Math.round(r.sold).toLocaleString()} sold x price)`, value: r.revenue, op: '' },
      { label: 'Cost of goods sold (inputs + materials)', value: r.cogs, op: '-' },
      { label: 'Gross profit', value: r.grossProfit, op: '=' },
      { label: 'Wages', value: r.wages, op: '-' },
      { label: 'Fixed costs (rent, equipment, overhead)', value: r.fixed, op: '-' },
      { label: 'Marketing', value: r.marketing, op: '-' },
      { label: 'R&D', value: r.rd, op: '-' },
      ...(r.interestIncome || r.fundingCost ? [
        { label: 'Interest earned on loans', value: r.interestIncome, op: '+' as const },
        { label: 'Deposit funding cost', value: r.fundingCost, op: '-' as const },
        { label: 'Provisions for bad loans', value: r.loanLosses ?? 0, op: '-' as const },
      ] : []),
      { label: 'Operating profit', value: r.operatingProfit, op: '=' },
      { label: 'Interest', value: r.interest, op: '-' },
      { label: 'Tax', value: r.tax, op: '-' },
      { label: 'Net income', value: r.netIncome, op: '=' },
    ],
  };
}

export function outputExplain(c: Company): Explanation {
  const r = c.last;
  return {
    title: `${c.name} output`,
    lines: [
      { label: 'Capacity C', value: r.capacity, op: '', fmt: 'num' },
      { label: 'Labour x productivity (L x P)', value: r.laborCap, op: '', fmt: 'num' },
      { label: 'Inputs in store allow M', value: r.materialCap, op: '', fmt: 'num' },
      { label: 'Max output = min(C, LxP, M)', value: Math.min(r.capacity, r.laborCap, r.materialCap), op: '=', fmt: 'num' },
      { label: 'Produced (inventory policy)', value: r.produced, op: '', fmt: 'num' },
      { label: 'Customer demand', value: r.demand, op: '', fmt: 'num' },
      { label: 'Sold = min(demand, supply)', value: r.sold, op: '=', fmt: 'num' },
    ],
    note: 'Production follows Q = min(C, L x P, M), where M is how much your input store room can feed. Sales are capped by inventory plus production.',
  };
}
