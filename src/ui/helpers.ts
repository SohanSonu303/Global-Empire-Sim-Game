import type { Company, WorldState } from '../engine/types';

export function rating(c: Company): number {
  return Math.max(1, Math.min(5, ((c.brand + c.quality) / 2 - 0.55) * 5));
}

/** Change of a rolling window vs the window before it, from daily history. */
export function histDelta(c: Company, key: 'revenue' | 'net' | 'cash', days = 15): number | null {
  const h = c.hist;
  if (h.length < days * 2) return null;
  if (key === 'cash') {
    const a = h[h.length - 1].cash;
    const b = h[h.length - 1 - days].cash;
    return b !== 0 ? (a - b) / Math.abs(b) : null;
  }
  const sum = (from: number, to: number) => h.slice(from, to).reduce((s, x) => s + x[key], 0);
  const cur = sum(h.length - days, h.length);
  const prev = sum(h.length - 2 * days, h.length - days);
  return prev !== 0 ? (cur - prev) / Math.abs(prev) : null;
}

export function playerCompanies(w: WorldState): Company[] {
  return w.companies.filter((c) => c.isPlayer);
}

export function stockChange(prices: { price: number }[], back: number): number {
  if (prices.length < 2) return 0;
  const past = prices[Math.max(0, prices.length - 1 - back)].price;
  return prices[prices.length - 1].price / past - 1;
}
