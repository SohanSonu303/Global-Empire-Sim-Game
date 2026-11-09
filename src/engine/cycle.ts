/**
 * Markets rise and fall: a business cycle with recessions every few years (economists warn you
 * a couple of months ahead), and long-run trends that grow some products and fade others.
 */
import { GOODS, GOOD_IDS } from './data';
import { clamp } from './company';
import { addNews } from './news';
import { int, normal, range } from './rng';
import type { Cycle, GoodId, WorldState } from './types';

/** Long-run yearly change in household demand. New tech grows; older products slowly fade. */
export const TRENDS: Partial<Record<GoodId, number>> = {
  ai: 0.07, robots: 0.05, ecommerce: 0.045, gaming: 0.03, space: 0.03, software: 0.025, wellness: 0.02, telecom: 0.01,
  phones: -0.015, laptops: -0.02, clothing: -0.008, furniture: -0.005, appliances: -0.005,
};
/** How far a trend can take demand */
const TREND_MIN = 0.65;
const TREND_MAX = 1.8;
/** Demand lost across products in a recession, and the share it takes from business confidence */
export const RECESSION_HIT = 0.1;

export function cycleOf(w: WorldState): Cycle {
  return (w.play.cycle ??= { phase: 'normal', until: 0, nextDown: w.day + int(w.rng, 900, 1500) });
}

/** Monthly: move the cycle along and nudge each product's long-run trend. */
export function monthlyCycle(w: WorldState): void {
  const cy = cycleOf(w);
  const r = w.rng;
  if (cy.phase === 'normal' && w.day >= cy.nextDown) {
    cy.phase = 'warning';
    cy.until = w.day + 60;
    addNews(w, 'economy', 'Economists warn a recession is coming', 'Orders are slowing and banks are getting nervous. Forecasters expect a downturn within two months: a good time to build cash and avoid big new loans.', 'bad');
  } else if (cy.phase === 'warning' && w.day >= cy.until) {
    cy.phase = 'recession';
    const months = int(r, 6, 11);
    cy.until = w.day + months * 30;
    w.effects.push({ id: `e${++w.seq}`, kind: 'confidence', delta: -0.22, untilDay: cy.until });
    for (const g of GOOD_IDS) {
      if (GOODS[g].tier !== 'product' || GOODS[g].reg) continue;
      w.effects.push({ id: `e${++w.seq}`, kind: 'goodDemand', target: g, delta: -RECESSION_HIT * (0.6 + GOODS[g].elasticity * 0.4), untilDay: cy.until });
    }
    addNews(w, 'economy', 'Recession hits Astoria', `Shoppers are cutting back and factories are ordering less. It should last about ${months} months. Companies with cash and low debt come out stronger.`, 'bad');
  } else if (cy.phase === 'recession' && w.day >= cy.until) {
    cy.phase = 'recovery';
    cy.until = w.day + int(r, 150, 240);
    w.effects.push({ id: `e${++w.seq}`, kind: 'confidence', delta: 0.08, untilDay: cy.until });
    for (const g of GOOD_IDS) {
      if (GOODS[g].tier !== 'product' || GOODS[g].reg) continue;
      w.effects.push({ id: `e${++w.seq}`, kind: 'goodDemand', target: g, delta: 0.04, untilDay: cy.until });
    }
    addNews(w, 'economy', 'The recession is over', 'Spending is picking up again. Firms that kept their customers through the downturn are first to grow.', 'good');
  } else if (cy.phase === 'recovery' && w.day >= cy.until) {
    cy.phase = 'normal';
    cy.nextDown = w.day + int(r, 900, 1600);
  }

  // Long-run trends, with a little noise so no two games are the same
  for (const g of GOOD_IDS) {
    const mk = w.goods[g];
    if (!mk || GOODS[g].tier !== 'product') continue;
    const yearly = (TRENDS[g] ?? 0) + 0.01 * normal(r);
    mk.trend = clamp((mk.trend ?? 1) * (1 + yearly / 12), TREND_MIN, TREND_MAX);
  }
  // Once a year, a trend story
  if (w.day % 360 === 0) {
    const rising = (Object.keys(TRENDS) as GoodId[]).filter((g) => (TRENDS[g] ?? 0) > 0);
    const g = rising[Math.floor(range(r, 0, rising.length))];
    if (g) addNews(w, 'technology', `${GOODS[g].name} keeps growing`, `Household demand for ${GOODS[g].name.toLowerCase()} is up ${Math.round(((w.goods[g].trend ?? 1) - 1) * 100)}% since the game began, while some older products slowly fade.`, 'neutral');
  }
}

/** Human label for the phase */
export function cycleLabel(w: WorldState): string {
  const p = cycleOf(w).phase;
  return p === 'warning' ? 'Recession warning' : p === 'recession' ? 'Recession' : p === 'recovery' ? 'Recovery' : 'Normal';
}
