import type { NewsCategory, NewsItem, WorldState } from './types';

export function fmtMoney(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e15) return `${sign}$${(a / 1e15).toFixed(2)}Qa`;
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  if (a >= 100) return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
  return `${sign}$${a.toFixed(2)}`;
}

const UNITS: [number, string][] = [[1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/** Short money for tight spaces, always with its unit: $950, $12.4K, $14.5M, $2.31B, $1.20T. */
export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (!Number.isFinite(a)) return `${sign}$∞`;
  for (const [base, unit] of UNITS) {
    if (a >= base * 0.9995) {
      const x = a / base;
      return `${sign}$${x.toFixed(x >= 99.95 ? 0 : x >= 9.995 ? 1 : 2)}${unit}`;
    }
  }
  return `${sign}$${Math.round(a)}`;
}

/** Unit prices: cents below $1,000, else whole dollars. */
export function fmtPrice(v: number): string {
  return Math.abs(v) >= 1000 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`;
}

export function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** Every article is created from a simulation event via one of these template calls. */
export function addNews(
  w: WorldState,
  category: NewsCategory,
  headline: string,
  body: string,
  tone: NewsItem['tone'] = 'neutral',
  entityIds: string[] = [],
): void {
  w.seq += 1;
  w.news.unshift({ id: `n${w.seq}`, day: w.day, category, headline, body, tone, entityIds });
  if (w.news.length > 200) w.news.length = 200;
}
