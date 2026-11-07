import { normal } from './rng';
import { clamp } from './company';
import { GOODS, GOOD_IDS } from './data';
import type { Macro, WorldState } from './types';

/** Base-year GDP components (annual, game currency). */
const BASE = { c: 1_400e9, i: 420e9, g: 480e9, x: 380e9, m: 330e9 };

export function createMacro(): Macro {
  const gdp = BASE.c + BASE.i + BASE.g + BASE.x - BASE.m;
  return {
    gdp, gdpPrev: gdp, c: BASE.c, i: BASE.i, g: BASE.g, x: BASE.x, m: BASE.m,
    growth: 0.022, trendGrowth: 0.022, inflation: 0.024, inflationTarget: 0.02,
    unemployment: 0.052, naturalUnemployment: 0.05, rate: 0.035, neutralRate: 0.01,
    priceLevel: 1, realConsumption: 1, confidence: 0.62, oilPrice: 1, oilSupply: 1,
    wageGrowth: 0.03, taxRate: 0.22, govDebt: gdp * 0.65,
    realOutputPrev: 0, capexMonth: 0, govRevenue: 0, govSpending: 0,
    rateExplain: { title: 'Policy rate', lines: [] },
    gdpExplain: { title: 'GDP', lines: [] },
    hist: [],
  };
}

/** Daily: oil market responds to supply effects (events change supply, not outcomes). */
export function dailyMacro(w: WorldState): void {
  const m = w.macro;
  let supply = 1;
  for (const e of w.effects) if (e.kind === 'oilSupply') supply += e.delta;
  m.oilSupply = clamp(supply, 0.6, 1.5);
  const target = Math.pow(1 / m.oilSupply, 1.3);
  m.oilPrice = clamp(m.oilPrice + 0.04 * (target - m.oilPrice) + 0.01 * normal(w.rng), 0.4, 2.5);
}

/** Monthly macro update: GDP = C + I + G + (X - M), inflation with inertia, Okun's law, Taylor rule. */
export function monthlyMacro(w: WorldState): { prevRate: number; prevInflation: number; prevUnemployment: number } {
  const prevInflation = w.macro.inflation;
  const prevUnemployment = w.macro.unemployment;
  const m = w.macro;
  let confEffect = 0;
  for (const e of w.effects) if (e.kind === 'confidence') confEffect += e.delta;

  // Real activity from the company sector feeds back into consumption
  const realOutput = w.companies.reduce((s, c) => s + (c.bankrupt ? 0 : c.sum30.sold * GOODS[c.good].p0), 0);
  const sectorGrowth = m.realOutputPrev > 0 ? clamp(Math.pow(realOutput / m.realOutputPrev, 12) - 1, -0.15, 0.15) : m.trendGrowth;
  m.realOutputPrev = realOutput;

  const realRate = m.rate - m.inflation;
  const rcGrowth =
    m.trendGrowth +
    0.08 * (m.confidence - 0.6) -
    0.5 * (realRate - m.neutralRate) -
    0.03 * (m.oilPrice - 1) +
    0.1 * (sectorGrowth - m.trendGrowth) +
    0.004 * normal(w.rng);
  m.realConsumption *= 1 + clamp(rcGrowth, -0.12, 0.12) / 12;

  // Prices move first with last month's inflation; real growth deflates by the change.
  const plOld = m.priceLevel;
  m.priceLevel *= Math.pow(1 + m.inflation, 1 / 12);
  const pl = m.priceLevel;
  const realPrev = m.gdp / plOld;
  const years = w.day / 365;
  const c = BASE.c * m.realConsumption * pl;
  const i = BASE.i * m.realConsumption * clamp(1 - 3 * (m.rate - 0.035), 0.5, 1.4) * (0.8 + 0.35 * m.confidence) + m.capexMonth * 12;
  const g = BASE.g * pl * Math.pow(1.02, years);
  const x = BASE.x * pl * (1 + 0.45 * (m.oilPrice - 1)) * Math.pow(1.02, years);
  const mm = BASE.m * m.realConsumption * pl * (1 + 0.25 * (m.oilPrice - 1));
  const gdp = c + i + g + x - mm;

  m.gdpPrev = m.gdp;
  const realGrowth = clamp(Math.pow(gdp / pl / realPrev, 12) - 1, -0.2, 0.2);
  m.growth = m.growth * 0.6 + realGrowth * 0.4;
  Object.assign(m, { gdp, c, i, g, x, m: mm });
  m.gdpExplain = {
    title: 'GDP (annualised, expenditure approach)',
    lines: [
      { label: 'Consumption C', value: c, op: '' },
      { label: 'Investment I (incl. company capex)', value: i, op: '+' },
      { label: 'Government G', value: g, op: '+' },
      { label: 'Exports X', value: x, op: '+' },
      { label: 'Imports M', value: mm, op: '-' },
      { label: 'GDP', value: gdp, op: '=' },
    ],
    note: 'Higher rates reduce consumption and investment; oil prices lift exports and import costs.',
  };
  m.capexMonth = 0;

  // Inflation: inertia + demand pressure + wages + energy
  const gap = m.growth - m.trendGrowth;
  const pi =
    0.8 * m.inflation +
    0.2 * m.inflationTarget +
    0.18 * gap +
    0.15 * (m.wageGrowth - 0.03) +
    0.02 * (m.oilPrice - 1) +
    0.03 * goodsPressure(w) +
    0.0015 * normal(w.rng);
  m.inflation = clamp(pi, -0.03, 0.3);

  // Okun's law with drift back to natural rate
  const du = (-0.5 * gap) / 12 + 0.03 * (m.naturalUnemployment - m.unemployment) + 0.0008 * normal(w.rng);
  m.unemployment = clamp(m.unemployment + du, 0.02, 0.25);
  m.wageGrowth = clamp(0.02 + 0.6 * m.inflation - 0.8 * (m.unemployment - m.naturalUnemployment), -0.03, 0.15);

  // Confidence
  const idxRet = indexReturn(w, 90);
  const confTarget = clamp(0.72 - 2.2 * (m.unemployment - 0.05) - 1.4 * Math.max(0, m.inflation - 0.03) + 0.4 * idxRet + confEffect, 0.05, 0.95);
  m.confidence += (confTarget - m.confidence) * 0.35;

  // Central bank: Taylor rule, smoothed and rounded to 25bp
  const taylor = m.neutralRate + m.inflation + 0.5 * (m.inflation - m.inflationTarget) + 0.5 * gap;
  const smoothed = 0.7 * m.rate + 0.3 * taylor;
  const newRate = clamp(Math.round(smoothed / 0.0025) * 0.0025, 0.0025, 0.15);
  m.rateExplain = {
    title: 'Central bank rate rule',
    lines: [
      { label: 'Neutral real rate', value: m.neutralRate, op: '', fmt: 'pct' },
      { label: 'Inflation', value: m.inflation, op: '+', fmt: 'pct' },
      { label: '0.5 x (inflation - 2% target)', value: 0.5 * (m.inflation - m.inflationTarget), op: '+', fmt: 'pct' },
      { label: '0.5 x (growth - trend)', value: 0.5 * gap, op: '+', fmt: 'pct' },
      { label: 'Rule rate', value: taylor, op: '=', fmt: 'pct' },
      { label: 'Smoothed (70% old rate), rounded', value: newRate, op: '=', fmt: 'pct' },
    ],
    note: 'The central bank is independent: it moves gradually toward the rule rate every month.',
  };
  const prevRate = m.rate;
  m.rate = newRate;

  // Government finances (simple)
  const corpProfits = w.companies.reduce((s, co) => s + Math.max(0, co.sum30.operatingProfit), 0) * 12;
  m.govRevenue = 0.18 * gdp + m.taxRate * corpProfits * 0.2;
  m.govSpending = g + m.govDebt * 0.03;
  m.govDebt = Math.max(0, m.govDebt + (m.govSpending - m.govRevenue) / 12);

  m.hist.push({ day: w.day, gdp, inflation: m.inflation, unemployment: m.unemployment, rate: m.rate, growth: m.growth });
  if (m.hist.length > 360) m.hist.shift();

  return { prevRate, prevInflation, prevUnemployment };
}

export function indexReturn(w: WorldState, days: number): number {
  const h = w.marketIndexHist;
  if (h.length < 2) return 0;
  const past = h[Math.max(0, h.length - 1 - days)].value;
  return w.marketIndex / past - 1;
}

/** Average price-index deviation of consumer products (shortages feed inflation). */
export function goodsPressure(w: WorldState): number {
  const ids = GOOD_IDS.filter((g) => GOODS[g].tier === 'product');
  return ids.reduce((s, g) => s + (w.goods[g].idx - 1), 0) / ids.length;
}
