/**
 * Supply chain shocks: when a material gets much dearer (a mine disaster, a war abroad, a shortage),
 * the cost reaches the goods made from it a few weeks later, then the goods made from those.
 * The news warns, and your assistant tells you which of your companies are in the way.
 */
import { GOODS, GOOD_IDS, usedBy } from './data';
import { addNews } from './news';
import type { GoodId, WorldState } from './types';

/** A rise this big over 30 days counts as a shock */
export const SHOCK_RISE = 0.12;
const COOLDOWN = 60;

/** Price change of a good over the last `days` days (from its two-day price history) */
export function priceChange(w: WorldState, g: GoodId, days = 30): number {
  const h = w.goods[g]?.hist ?? [];
  if (h.length < 2) return 0;
  const back = h[Math.max(0, h.length - 1 - Math.round(days / 2))].price;
  const now = h[h.length - 1].price;
  return back > 0 ? now / back - 1 : 0;
}

/** Goods made from g (one step), and from those (two steps) */
export function downstream(g: GoodId): { first: GoodId[]; second: GoodId[] } {
  const first = usedBy(g);
  const second = [...new Set(first.flatMap((x) => usedBy(x)))].filter((x) => x !== g && !first.includes(x));
  return { first, second };
}

/** Weekly: spot materials that just got much dearer and warn about what follows */
export function weeklyShocks(w: WorldState): void {
  const list = (w.play.shocks ??= []);
  for (const g of GOOD_IDS) {
    if (GOODS[g].tier === 'product') continue;
    const rise = priceChange(w, g, 30);
    if (rise < SHOCK_RISE) continue;
    if (list.some((s) => s.good === g && w.day - s.day < COOLDOWN)) continue;
    const { first, second } = downstream(g);
    if (!first.length) continue;
    list.push({ good: g, day: w.day, rise });
    const names = (xs: GoodId[]) => xs.slice(0, 4).map((x) => GOODS[x].name.toLowerCase()).join(', ');
    addNews(w, 'commodities', `${GOODS[g].name} up ${Math.round(rise * 100)}% in a month`,
      `Makers of ${names(first)} will feel it within 2–4 weeks${second.length ? `, and ${names(second)} after that` : ''}. Buyers who stock up or sign supply deals now pay less.`, 'bad');
  }
  w.play.shocks = list.filter((s) => w.day - s.day < 120);
}
