/**
 * Budget and forecast: a 12-month plan from how each company is doing now, with "what if"
 * levers (price, wages, marketing, an upgrade). Save it as your plan and each month the
 * game shows how you did against it.
 */
import { LEVEL_CAP_MULT, fixedAt } from './data';
import { canUpgrade, clamp, nextUpgradeCost } from './company';
import type { Company, CommandResult, DayResult, WorldState } from './types';

/** How strongly buyers react to price: 1% dearer loses about 1.8% of sales */
export const PRICE_ELASTICITY = 1.8;
export const FORECAST_MONTHS = 12;

export interface WhatIf {
  /** Price change, e.g. 0.05 = 5% dearer */
  price?: number;
  /** Wage change */
  wages?: number;
  /** Marketing as a share of revenue (replaces today's) */
  marketing?: number;
  /** Upgrade the plant in month 1 */
  upgrade?: boolean;
}

export interface ForecastMonth { month: number; revenue: number; costs: number; profit: number; cash: number }
export interface Forecast { months: ForecastMonth[]; upfront: number; revenue: number; profit: number; endCash: number; unitsNow: number; unitsAfter: number }

/** Days of history in the decaying 30-day sums */
function histDays(w: WorldState, c: Company): number {
  const age = Math.max(1, w.day - c.founded);
  return Math.max(1, 30 * (1 - Math.pow(29 / 30, age)));
}

/** A 30-day figure, corrected for young companies */
export function monthly(w: WorldState, c: Company, key: keyof DayResult): number {
  return ((c.sum30[key] as number) / histDays(w, c)) * 30;
}

export function forecastCompany(w: WorldState, c: Company, wi: WhatIf = {}): Forecast {
  const R = monthly(w, c, 'revenue');
  const S = Math.max(1, monthly(w, c, 'sold'));
  const D = Math.max(S, monthly(w, c, 'demand'));
  const M = monthly(w, c, 'cogs');
  const W = monthly(w, c, 'wages');
  const F = monthly(w, c, 'fixed');
  const Mk = monthly(w, c, 'marketing');
  const Rd = monthly(w, c, 'rd');
  const I = monthly(w, c, 'interest');
  const cap = c.capacity * 30;
  const up = !!wi.upgrade && canUpgrade(c);
  const capAfter = up ? cap * LEVEL_CAP_MULT : cap;
  const dp = wi.price ?? 0;
  // A bigger plant also wins more buyers (appeal grows with capacity^0.85), taken at 85% to stay safe
  const demandAfter = (up ? D * Math.pow(LEVEL_CAP_MULT, 0.85) * 0.85 : D) * clamp(1 - PRICE_ELASTICITY * dp, 0.2, 2);
  const units = clamp(Math.min(demandAfter, capAfter), 0, capAfter);
  const unitPrice = (R / S) * (1 + dp);
  const unitMat = M / S;
  const extraFixed = up ? (fixedAt(c.good, c.level + 1) - fixedAt(c.good, c.level)) * w.macro.priceLevel * 30 : 0;
  // More output needs more staff, roughly in proportion
  const wages = W * (1 + (wi.wages ?? 0)) * (0.4 + 0.6 * units / S);
  const upfront = up ? nextUpgradeCost(c) : 0;
  const growth = w.macro.growth / 12;
  const tax = w.macro.taxRate;
  const months: ForecastMonth[] = [];
  let cash = c.cash - upfront;
  let revenue = 0;
  let profit = 0;
  for (let m = 1; m <= FORECAST_MONTHS; m++) {
    const g = Math.pow(1 + growth, m - 1);
    const rev = unitPrice * units * g;
    const mkt = wi.marketing != null ? rev * wi.marketing : Mk * g;
    const costs = unitMat * units * g + wages * g + F + extraFixed + mkt + Rd * g + I;
    const pre = rev - costs;
    const net = pre - Math.max(0, pre) * tax;
    const div = Math.max(0, net) * (c.automation.dividendPct / 100);
    cash += net - div;
    revenue += rev;
    profit += net;
    months.push({ month: m, revenue: rev, costs: costs + Math.max(0, pre) * tax, profit: net, cash });
  }
  return { months, upfront, revenue, profit, endCash: cash, unitsNow: S, unitsAfter: units };
}

/** All your companies together, as they run today */
export function forecastAll(w: WorldState): Forecast {
  const cos = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  const all = cos.map((c) => forecastCompany(w, c));
  const months = Array.from({ length: FORECAST_MONTHS }, (_, i) => ({
    month: i + 1,
    revenue: all.reduce((s, f) => s + f.months[i].revenue, 0),
    costs: all.reduce((s, f) => s + f.months[i].costs, 0),
    profit: all.reduce((s, f) => s + f.months[i].profit, 0),
    cash: all.reduce((s, f) => s + f.months[i].cash, 0),
  }));
  return {
    months, upfront: 0, revenue: months.reduce((s, m) => s + m.revenue, 0), profit: months.reduce((s, m) => s + m.profit, 0),
    endCash: months.at(-1)?.cash ?? 0, unitsNow: 0, unitsAfter: 0,
  };
}

/** Save today's forecast of profit as your plan for the next 12 months. */
export function saveBudget(w: WorldState): CommandResult {
  if (!w.companies.some((c) => c.isPlayer && !c.bankrupt)) return { ok: false, message: 'Found a company first' };
  const f = forecastAll(w);
  w.play.budget = { start: w.day, plan: f.months.map((m) => Math.round(m.profit)), actual: [], acc: 0 };
  return { ok: true, message: 'Plan saved: each month shows your real profit against it' };
}

/** Daily: add up what your companies really earn, and close each plan month */
export function dailyBudget(w: WorldState): void {
  const b = w.play.budget;
  if (!b || b.actual.length >= b.plan.length) return;
  for (const c of w.companies) if (c.isPlayer && !c.bankrupt) b.acc += c.last.netIncome;
  const days = w.day - b.start;
  if (days > 0 && days % 30 === 0) { b.actual.push(Math.round(b.acc)); b.acc = 0; }
}
