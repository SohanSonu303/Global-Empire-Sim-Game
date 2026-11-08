/**
 * Raw producers you run need no inputs, so they pay for it in other ways: dearer licences and
 * plants, higher upkeep, and reserves that run down as you dig, pump or farm. Thin reserves raise
 * the cost of each unit and finally cut output, until you pay for new exploration.
 */
import { GOODS, startCost } from './data';
import { addNews, fmtMoney } from './news';
import { payBill } from './events';
import type { Company, CommandResult, WorldState } from './types';

/** Full-capacity days until a fresh mine, field or well is spent. */
export const DEPLETION_DAYS = 1500;
/** Upkeep of a raw producer you run, against the normal fixed cost. */
export const RAW_UPKEEP = 1.15;
/** Below this, output falls off as the reserve runs dry. */
export const THIN_RESERVES = 0.25;
/** Auto-explore starts when reserves fall below this. */
export const AUTO_EXPLORE_AT = 0.3;

export function isRawMine(c: Company): boolean {
  return c.isPlayer && GOODS[c.good].tier === 'raw';
}

export function reservesOf(c: Company): number {
  return c.reserves ?? 1;
}

/** Multiplier on the variable cost of each unit: once half the reserve is gone, digging deeper costs more (up to 2x). */
export function extractionMult(c: Company): number {
  return isRawMine(c) ? 1 + Math.max(0, 0.5 - reservesOf(c)) * 2 : 1;
}

/** Output limit from thin reserves (1 = no limit). */
export function reserveCapMult(c: Company): number {
  if (!isRawMine(c)) return 1;
  const r = reservesOf(c);
  return r >= THIN_RESERVES ? 1 : Math.max(0.1, r / THIN_RESERVES);
}

/** Run the reserve down by a day's output. */
export function deplete(c: Company, produced: number): void {
  if (!isRawMine(c) || produced <= 0) return;
  c.reserves = Math.max(0, reservesOf(c) - produced / (Math.max(1, c.capacity) * DEPLETION_DAYS));
}

/** What new exploration costs: more the further the reserve has run down. */
export function exploreCost(c: Company): number {
  const base = Math.max(startCost(c.good) * 0.6, c.assets * 0.25);
  return Math.round((base * Math.max(0.1, 1 - reservesOf(c))) / 1000) * 1000;
}

/**
 * Pay for new exploration. You pay from the company's cash; the automatic top-up pays like a
 * repair bill (company cash, then its credit line, then your own cash).
 */
export function explore(w: WorldState, c: Company, auto = false): CommandResult {
  if (!isRawMine(c)) return { ok: false, message: 'Only raw producers have reserves' };
  if (c.bankrupt) return { ok: false, message: 'Company is bankrupt' };
  if (reservesOf(c) > 0.9) return { ok: false, message: 'Reserves are still nearly full' };
  const cost = exploreCost(c);
  if (auto) {
    if (!payBill(w, c, cost)) return { ok: false, message: 'Not enough money to explore' };
  } else {
    if (c.cash < cost) return { ok: false, message: `Exploration costs ${fmtMoney(cost)}: the company has ${fmtMoney(c.cash)}` };
    c.cash -= cost;
  }
  c.assets += cost * 0.5;
  c.reserves = 1;
  addNews(w, 'player', `${c.name} ${auto ? 'opens' : 'finds'} new reserves`, `Exploration cost ${fmtMoney(cost)}. Output and unit costs are back to normal.`, 'good', [c.id]);
  return { ok: true, message: `New reserves found for ${fmtMoney(cost)}` };
}

/** Daily: auto-exploration and a warning when reserves get thin. */
export function dailyResources(w: WorldState): void {
  for (const c of w.companies) {
    if (c.bankrupt || !isRawMine(c)) continue;
    const r = reservesOf(c);
    if (r < AUTO_EXPLORE_AT && c.automation.autoExplore !== false) {
      explore(w, c, true);
    }
    if (r < THIN_RESERVES && w.day % 30 === 0) {
      addNews(w, 'player', `${c.name} is running out of reserves`, `Only ${Math.round(r * 100)}% is left, so output is falling. Exploring costs ${fmtMoney(exploreCost(c))}.`, 'bad', [c.id]);
    }
  }
}
