/**
 * The Astoria Times markets desk.
 *
 * The Tipster: each week the paper names a listed company it thinks will rise or fall, with what
 * it has heard and the numbers behind it. Like real tips, they are guesses: whether the story comes
 * true is a coin flip, so about half the calls are right. The paper keeps a public scorecard.
 *
 * Industry Watch: which industries are heating up or cooling, from real data (long-run demand,
 * shortages, prices, margins, newcomers and wages). This part is never random: it is what the
 * economy is actually doing, so it is the best guide to where to invest and what to found.
 */
import { GOODS, INDUSTRIES, INDUSTRY_IDS } from './data';
import { clamp } from './company';
import { TRENDS } from './cycle';
import { fairValue } from './market';
import { addNews, fmtPct } from './news';
import { chance, createRng, int, pick } from './rng';
import { priceChange } from './shocks';
import type { Company, GoodId, IndustryId, Stock, StockCall, WorldState } from './types';

/** Calls the paper keeps open at once */
const MAX_OPEN = 3;
/** Days after a story breaks that a call is judged */
export const JUDGE_DAYS = 7;
/** How hard a story that comes true (or falls through) moves the share price */
const TRUE_PUSH = 0.05;
const FALSE_PUSH = 0.035;

const UP_STORY = [
  'talks on a big new supply deal', 'a new product launch', 'a possible takeover bid', 'a bigger-than-expected order book',
  'plans to cut costs with new machines', 'a government contract it may win',
];
const DOWN_STORY = [
  'a big customer that may leave', 'trouble at one of its plants', 'a boardroom fight', 'a product recall it may face',
  'a bank that is nervous about its loans', 'a price war it may lose',
];

function pressRng(w: WorldState) {
  return (w.play.pressRng ??= createRng((w.seed ^ 0x51ed27) >>> 0));
}

/** Share price change over the last `days` days */
export function stockChange(s: Stock, days: number): number {
  const h = s.hist;
  if (h.length < 2) return 0;
  const back = h[Math.max(0, h.length - 1 - days)].price;
  return back > 0 ? s.price / back - 1 : 0;
}

/** Revenue growth over the last quarter */
function quarterGrowth(c: Company): number | null {
  const q = c.quarters;
  return q.length >= 2 && q[q.length - 2].revenue > 0 ? q[q.length - 1].revenue / q[q.length - 2].revenue - 1 : null;
}

/** The numbers behind a call: real facts that point the same way (there may be none) */
export function callReasons(w: WorldState, s: Stock, c: Company, dir: 1 | -1): string[] {
  const out: string[] = [];
  const gap = Math.log(fairValue(w, s).value / s.price);
  const g = quarterGrowth(c);
  const mk = w.goods[c.good];
  const trend = TRENDS[c.good] ?? 0;
  const good = GOODS[c.good].name.toLowerCase();
  if (dir > 0) {
    if (gap > 0.08) out.push(`the shares trade about ${Math.round((1 - Math.exp(-gap)) * 100)}% below what its profits are worth`);
    if (g != null && g > 0.03) out.push(`sales grew ${fmtPct(g, 0)} last quarter`);
    if (mk && mk.tightness > 0.97) out.push(`${good} is in short supply, so prices are climbing`);
    if (trend > 0.015) out.push(`buyers want more ${good} every year`);
  } else {
    if (gap < -0.08) out.push(`the shares cost about ${Math.round((Math.exp(-gap) - 1) * 100)}% more than its profits are worth`);
    if (g != null && g < -0.03) out.push(`sales fell ${fmtPct(-g, 0)} last quarter`);
    if (mk && mk.tightness < 0.78) out.push(`there are more ${good} makers than buyers need`);
    if (trend < -0.004) out.push(`demand for ${good} is slowly fading`);
    if (c.debt > c.sum30.revenue * 12 * 0.6) out.push('it carries heavy debt');
  }
  return out;
}

/** Weekly: judge old calls, let stories break, and print a new call */
export function weeklyPress(w: WorldState): void {
  const r = pressRng(w);
  const calls = (w.play.calls ??= []);
  const score = (w.play.callScore ??= { right: 0, total: 0 });
  for (const k of calls) {
    const s = w.stocks.find((x) => x.ticker === k.ticker);
    const c = w.companies.find((x) => x.id === k.companyId);
    // The story breaks: it comes true, or falls through
    if (!k.broke && w.day >= k.due) {
      k.broke = true;
      if (!s || !c || s.halted) continue;
      const up = (k.dir > 0) === k.truth;
      s.newsImpact += k.truth ? k.dir * TRUE_PUSH : -k.dir * FALSE_PUSH;
      s.sentiment = clamp(s.sentiment + (up ? 0.3 : -0.3), -1, 1);
      addNews(w, 'market',
        k.truth ? `${c.name}: the Tipster was right about ${k.story}` : `${c.name}: talk of ${k.story} comes to nothing`,
        k.truth
          ? `The story is confirmed and ${s.ticker} shares ${up ? 'jump' : 'slide'}. We will judge the call in a week.`
          : `Investors who traded on the tip are disappointed and ${s.ticker} shares ${up ? 'bounce' : 'slip'}. Tips are guesses; this one missed.`,
        up ? 'good' : 'bad', [c.id]);
    }
    // A week later, the call is judged on the share price
    if (k.broke && !k.judged && w.day >= k.due + JUDGE_DAYS) {
      k.judged = true;
      k.end = s?.price ?? k.start;
      k.hit = (k.end / k.start - 1) * k.dir > 0;
      score.total += 1;
      if (k.hit) score.right += 1;
    }
  }
  w.play.calls = calls.filter((k) => !k.judged || w.day - k.due < 90).slice(-20);

  const open = w.play.calls.filter((k) => !k.broke);
  if (open.length >= MAX_OPEN || !chance(r, 0.8)) return;
  const listed = w.stocks.filter((s) => !s.halted && !open.some((k) => k.ticker === s.ticker) && w.companies.some((c) => c.id === s.companyId && !c.bankrupt));
  const s = pick(r, listed);
  if (!s) return;
  const c = w.companies.find((x) => x.id === s.companyId)!;
  const dir: 1 | -1 = chance(r, 0.5) ? 1 : -1;
  const used = open.map((k) => k.story);
  const story = pick(r, (dir > 0 ? UP_STORY : DOWN_STORY).filter((x) => !used.includes(x)))!;
  const reasons = callReasons(w, s, c, dir);
  const days = int(r, 8, 20);
  const call: StockCall = {
    id: `call${++w.seq}`, ticker: s.ticker, companyId: c.id, dir, day: w.day, due: w.day + days, story,
    reasons, truth: chance(r, 0.5), start: s.price,
  };
  w.play.calls.push(call);
  const why = reasons.length ? ` On top of that, ${reasons.slice(0, 2).join(' and ')}.` : ' The numbers alone say little either way.';
  addNews(w, 'market', `Tipster: ${c.name} (${s.ticker}) could ${dir > 0 ? 'rise' : 'fall'}`,
    `Our markets desk hears of ${story}.${why} We expect news within about ${Math.round(days / 7)} week${days >= 14 ? 's' : ''}. Tips are guesses: about half come true.`,
    dir > 0 ? 'good' : 'bad', [c.id]);
}

// ---------------------------------------------------------------- Industry Watch

export type Outlook = 'hot' | 'warm' | 'steady' | 'cooling' | 'cold';
export const OUTLOOK: Record<Outlook, { label: string; arrow: string; tone: 'good' | 'bad' | 'neutral' }> = {
  hot: { label: 'Heating up', arrow: '▲▲', tone: 'good' },
  warm: { label: 'Growing', arrow: '▲', tone: 'good' },
  steady: { label: 'Steady', arrow: '■', tone: 'neutral' },
  cooling: { label: 'Cooling', arrow: '▼', tone: 'bad' },
  cold: { label: 'Under pressure', arrow: '▼▼', tone: 'bad' },
};

export interface SectorView {
  industry: IndustryId;
  name: string;
  score: number;
  outlook: Outlook;
  /** Average long-run yearly demand change of its products */
  demandTrend: number;
  /** Average shortage (1 = buyers want exactly what is made) */
  tight: number;
  /** Average price change of its goods over 30 days */
  price30: number;
  margin: number;
  /** Companies founded in it in the last year (not yours) */
  newcomers: number;
  /** Wages against normal */
  wages: number;
  /** Average share price change of its listed companies over 30 days */
  stocks30: number;
  /** Why it scores as it does, most important first */
  reasons: string[];
  /** The same as one line: the good points, then "but" the bad ones */
  summary: string;
  /** Its most promising good */
  best: GoodId | null;
}

/** Where each industry stands and is heading, from real data (no dice). */
export function sectorOutlook(w: WorldState): SectorView[] {
  const out: SectorView[] = [];
  for (const ind of INDUSTRY_IDS) {
    const goods = (Object.keys(w.goods) as GoodId[]).filter((g) => GOODS[g]?.industry === ind);
    if (!goods.length) continue;
    const cs = w.companies.filter((c) => c.industry === ind && !c.bankrupt);
    const avg = (f: (g: GoodId) => number) => goods.reduce((s, g) => s + f(g), 0) / goods.length;
    const demandTrend = avg((g) => (TRENDS[g] ?? 0) + (w.effects.filter((e) => e.kind === 'goodDemand' && e.target === g).reduce((s, e) => s + e.delta, 0)) / 4);
    const tight = avg((g) => w.goods[g].tightness);
    const price30 = avg((g) => priceChange(w, g, 30));
    const rev = cs.reduce((s, c) => s + c.sum30.revenue, 0);
    const margin = rev > 0 ? cs.reduce((s, c) => s + c.sum30.netIncome, 0) / rev : 0;
    const newcomers = cs.filter((c) => !c.isPlayer && w.day - c.founded < 365 && c.founded > 0).length;
    const wages = w.macro.labour?.[ind]?.mult ?? 1;
    const stocks = w.stocks.filter((s) => w.companies.find((c) => c.id === s.companyId)?.industry === ind);
    const stocks30 = stocks.length ? stocks.reduce((s, x) => s + stockChange(x, 30), 0) / stocks.length : 0;
    const parts: { v: number; up: string; down: string }[] = [
      { v: demandTrend * 3, up: 'demand grows every year', down: 'demand is slowly fading' },
      { v: clamp(tight - 0.88, -0.15, 0.15) * 0.6, up: 'supply is short', down: 'there is more capacity than buyers need' },
      { v: clamp(price30, -0.2, 0.2) * 1.2, up: `prices are up ${fmtPct(Math.abs(price30), 0)} this month`, down: `prices are down ${fmtPct(Math.abs(price30), 0)} this month` },
      { v: clamp(margin - 0.12, -0.1, 0.1) * 0.6, up: `fat margins (${fmtPct(margin, 0)})`, down: `thin margins (${fmtPct(margin, 0)})` },
      { v: -0.012 * newcomers, up: '', down: `${newcomers} newcomer${newcomers === 1 ? '' : 's'} competing for buyers` },
      { v: -(wages - 1) * 0.4, up: 'workers are easy to find', down: `wages are ${fmtPct(wages - 1, 0)} above normal` },
    ];
    const score = parts.reduce((s, p) => s + p.v, 0);
    const reasons = parts.filter((p) => Math.abs(p.v) > 0.006 && (p.v > 0 ? p.up : p.down)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).map((p) => (p.v > 0 ? p.up : p.down));
    const strong = parts.filter((p) => Math.abs(p.v) > 0.006 && (p.v > 0 ? p.up : p.down)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const pos = strong.filter((p) => p.v > 0).slice(0, 2).map((p) => p.up);
    const neg = strong.filter((p) => p.v < 0).slice(0, 2).map((p) => p.down);
    const summary = pos.length
      ? `${capital(pos.join(' and '))}${neg.length ? `, but ${neg.join(' and ')}` : ''}.`
      : neg.length ? `${capital(neg.join(' and '))}.` : 'Nothing much changing.';
    const outlook: Outlook = score > 0.12 ? 'hot' : score > 0.04 ? 'warm' : score > -0.04 ? 'steady' : score > -0.12 ? 'cooling' : 'cold';
    const best = [...goods].sort((a, b) => goodScore(w, b) - goodScore(w, a))[0] ?? null;
    out.push({ industry: ind, name: INDUSTRIES[ind].name, score, outlook, demandTrend, tight, price30, margin, newcomers, wages, stocks30, reasons: reasons.slice(0, 3), summary, best });
  }
  return out.sort((a, b) => b.score - a.score);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function goodScore(w: WorldState, g: GoodId): number {
  return (TRENDS[g] ?? 0) * 3 + (w.goods[g].tightness - 0.88) + priceChange(w, g, 30);
}

/** Monthly: the paper's Industry Watch column */
export function monthlyPress(w: WorldState): void {
  if (w.day < 60) return;
  const s = sectorOutlook(w);
  if (s.length < 2) return;
  const top = s[0];
  const low = s[s.length - 1];
  addNews(w, 'economy', `Industry Watch: ${top.name} ${top.outlook === 'hot' ? 'heats up' : 'leads'}, ${low.name} ${low.outlook === 'cold' ? 'under pressure' : 'lags'}`,
    `${top.name}: ${top.reasons.slice(0, 2).join(', ') || 'steady demand'}. ${low.name}: ${low.reasons.slice(0, 2).join(', ') || 'little growth'}. Growing industries tend to lift profits, and over time share prices follow profits.`,
    'neutral');
}
