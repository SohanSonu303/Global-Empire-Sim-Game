/**
 * Small, frequent rewards: money pops on the city map, records, the level-up unlocks, a report
 * card every 30 days and a daily streak for opening the game on real days in a row.
 */
import { portfolioValue } from './market';
import { addNews, fmtMoney, fmtPct } from './news';
import { companyValue } from './company';
import type { Banner, MonthReport, Play, RecordId, Rival, WorldState } from './types';

// ---------- level unlocks ----------

export type UnlockKey =
  | 'contracts' | 'campaigns' | 'warehouse' | 'tenders' | 'freeze' | 'licence10' | 'wars' | 'marketBuy'
  | 'ventures' | 'tips' | 'squeeze' | 'licence20' | 'lookGold' | 'lookHeli' | 'lookNeon' | 'world';

export const UNLOCKS: { level: number; key: UnlockKey; title: string; body: string; icon: string }[] = [
  { level: 2, key: 'contracts', icon: '📋', title: 'Contracts board', body: 'Rivals and the government post delivery jobs: a guaranteed buyer, usually near the market price.' },
  { level: 3, key: 'campaigns', icon: '📣', title: 'Brand campaigns', body: 'Run your own ad campaigns to lift sales for a few weeks.' },
  { level: 3, key: 'warehouse', icon: '🏬', title: 'Warehouses', body: 'Store extra output and sell it later when prices are higher.' },
  { level: 4, key: 'tenders', icon: '🏛️', title: 'Government tenders', body: 'Bid against rivals for big public orders.' },
  { level: 5, key: 'world', icon: '🌍', title: 'World trade', body: 'The World map opens: 8 countries with their own needs, money and politics. Ship goods abroad, buy cheap, swap.' },
  { level: 5, key: 'freeze', icon: '🧊', title: 'Streak freeze', body: 'Miss one day a week without losing your streak.' },
  { level: 5, key: 'licence10', icon: '📜', title: 'Licences 10% cheaper', body: 'The government trusts you more.' },
  { level: 6, key: 'wars', icon: '⚔️', title: 'Price wars', body: 'Undercut a rival hard enough and you can push them out of a market.' },
  { level: 6, key: 'marketBuy', icon: '🛒', title: 'Buy stock from the market', body: 'Fill your warehouses from the market with standing buy orders.' },
  { level: 7, key: 'ventures', icon: '🤝', title: 'Joint ventures', body: 'Friendly rivals offer to build big plants with you.' },
  { level: 8, key: 'tips', icon: '🤫', title: 'Insider tips', body: 'Rivals who like you sometimes hint at their next move.' },
  { level: 10, key: 'squeeze', icon: '🗜️', title: 'Supply squeeze tools', body: 'Auto-sell on shortages and sell stock to desperate rivals at a premium.' },
  { level: 10, key: 'licence20', icon: '📜', title: 'Licences 20% cheaper', body: 'Bigger discount on new industries.' },
  { level: 12, key: 'lookGold', icon: '✨', title: 'Gold trim', body: 'Your buildings on the city map get gold trim.' },
  { level: 15, key: 'lookHeli', icon: '🚁', title: 'Helipads', body: 'Your biggest buildings get a helipad.' },
  { level: 20, key: 'lookNeon', icon: '🌃', title: 'Neon signs', body: 'Your buildings light up at night.' },
];

export function unlockLevel(key: UnlockKey): number {
  return UNLOCKS.find((u) => u.key === key)!.level;
}

export function unlocked(w: WorldState, key: UnlockKey): boolean {
  return w.player.level >= unlockLevel(key);
}

/** Discount on industry licences from your level. */
export function licenceDiscount(w: WorldState): number {
  return unlocked(w, 'licence20') ? 0.2 : unlocked(w, 'licence10') ? 0.1 : 0;
}

// ---------- state ----------

export function emptyPlay(level = 1): Play {
  return {
    records: {}, banners: [], pops: [], levelSeen: level, reports: [], reportSeen: null,
    streak: { last: '', count: 0, best: 0 },
    jobs: [], tenders: [], campaigns: [], warehouses: [], buyOrders: [], wars: [], tips: [], aiStores: [],
    probes: {}, upgraded: {}, xpOwed: 0, auctions: [], disasters: [],
  };
}

/** Fill in anything an older save is missing. */
export function ensurePlay(w: WorldState): void {
  const d = emptyPlay(w.player.level);
  if (!w.play) { w.play = d; return; }
  for (const k of Object.keys(d) as (keyof Play)[]) {
    if (w.play[k] === undefined) (w.play as unknown as Record<string, unknown>)[k] = d[k];
  }
}

export function banner(w: WorldState, title: string, body: string, xp = 0, tone: Banner['tone'] = 'gold'): void {
  w.play.banners.push({ id: `b${++w.seq}`, day: w.day, title, body, xp, tone });
  if (w.play.banners.length > 20) w.play.banners.shift();
}

// ---------- daily: pops and records ----------

/** A new record must beat the old one by 25%, so a growing empire does not level up from records alone. */
const RECORD_STEP = 1.25;

/** A rival's wealth: cash, shares, and the private companies it owns outright. */
export function rivalWorth(w: WorldState, r: Rival): number {
  let v = r.cash + portfolioValue(w, r.holdings);
  for (const c of w.companies) if (c.ownerId === r.id && !c.ticker && !c.bankrupt) v += Math.max(0, companyValue(c));
  return v;
}

function rivalWorths(w: WorldState): number[] {
  return w.rivals.map((r) => rivalWorth(w, r));
}

export function playerRank(w: WorldState, nw: number): { rank: number; of: number } {
  const others = rivalWorths(w);
  return { rank: 1 + others.filter((x) => x > nw).length, of: others.length + 1 };
}

/**
 * Runs after the day's results are in. addXp is passed in to avoid an import cycle with progress.ts.
 */
export function dailyRewards(w: WorldState, nw: number, addXp: (xp: number) => void): void {
  const p = w.play;
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  p.pops = [];

  // A pop when a company sells clearly more than usual today
  for (const c of mine) {
    const avg = c.sum30.revenue / 30;
    if (w.day - c.founded > 7 && avg > 0 && c.last.revenue > avg * 1.25 && c.last.revenue > 500) {
      p.pops.push({ companyId: c.id, amount: c.last.revenue, kind: 'big' });
    }
  }

  const record = (id: RecordId, value: number, title: (v: number) => string, xp: number, companyId?: string) => {
    const old = p.records[id];
    if (old === undefined) { if (value > 0) p.records[id] = value; return; } // the first value is the starting point
    if (value <= 0 || value < old * RECORD_STEP) return;
    p.records[id] = value;
    banner(w, 'New record!', title(value), xp);
    addXp(xp);
    if (companyId) {
      const pop = p.pops.find((x) => x.companyId === companyId);
      if (pop) pop.kind = 'record';
      else p.pops.push({ companyId, amount: value, kind: 'record' });
    }
  };

  const profitDay = mine.reduce((s, c) => s + c.last.netIncome, 0);
  const best = mine.reduce<(typeof mine)[number] | null>((b, c) => (!b || c.last.netIncome > b.last.netIncome ? c : b), null);
  if (w.day > 5) {
    record('bestDay', profitDay, (v) => `Best profit day: ${fmtMoney(v)}`, 40, best?.id);
    record('netWorth', nw, (v) => `Highest net worth: ${fmtMoney(v)}`, 30);
    record('companies', mine.length, (v) => `Most companies: ${v}`, 60);
    const share = mine.reduce((m, c) => Math.max(m, c.last.marketShare), 0);
    if (share >= 0.01) record('share', share, (v) => `Biggest market share: ${fmtPct(v, 1)}`, 50);
    if (w.day % 30 === 0) record('bestMonth', mine.reduce((s, c) => s + c.sum30.netIncome, 0), (v) => `Biggest month ever: ${fmtMoney(v)} profit`, 80);
  }
  if (!p.records.bigCompany && mine.some((c) => c.assets >= 1_000_000)) {
    p.records.bigCompany = 1;
    banner(w, 'New record!', 'Your first $1M company', 100);
    addXp(100);
  }
}

// ---------- monthly report card ----------

export function gradeOf(score: number): string {
  if (score >= 92) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 68) return 'B';
  if (score >= 54) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/** Every 30 game days. tip comes from the assistant (passed in to avoid an import cycle). */
export function monthlyReport(w: WorldState, nw: number, tip: string, addXp: (xp: number) => void): MonthReport | null {
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  if (mine.length === 0) return null;
  const prev = w.play.reports.at(-1);
  const profit = mine.reduce((s, c) => s + c.sum30.netIncome, 0);
  const prevProfit = prev?.profit ?? 0;
  const { rank, of } = playerRank(w, nw);
  const prevNw = prev?.netWorth ?? w.player.netWorthHist.at(-5)?.value ?? nw;

  // Score out of 100
  const growth = prevProfit > 0 ? profit / prevProfit - 1 : profit > 0 ? 0.2 : -0.5;
  const pGrowth = Math.round(Math.max(0, Math.min(30, 15 + growth * 60)));
  const pProfit = profit > 0 ? 25 : profit > -5_000 ? 10 : 0;
  const troubled = mine.filter((c) => c.cash < 0 || c.lowCashDays > 0).length;
  const pCash = Math.round(20 * (1 - troubled / mine.length));
  const share = mine.reduce((m, c) => Math.max(m, c.last.marketShare), 0);
  const pShare = Math.round(Math.min(15, 5 + share * 100));
  const nwGrowth = prevNw > 0 ? nw / prevNw - 1 : 0;
  const pWorth = Math.round(Math.max(0, Math.min(10, 5 + nwGrowth * 50)));
  const parts = [
    { label: 'Profit growth', points: pGrowth, max: 30 },
    { label: 'Making a profit', points: pProfit, max: 25 },
    { label: 'Cash safety', points: pCash, max: 20 },
    { label: 'Market share', points: pShare, max: 15 },
    { label: 'Net worth growth', points: pWorth, max: 10 },
  ];
  const score = parts.reduce((s, x) => s + x.points, 0);
  const grade = gradeOf(score);
  const xp = grade === 'A+' ? 300 : grade === 'A' ? 200 : grade === 'B' ? 80 : 30;
  const sorted = [...mine].sort((a, b) => b.sum30.netIncome - a.sum30.netIncome);
  const r: MonthReport = {
    id: `m${++w.seq}`, day: w.day, month: Math.round(w.day / 30), grade, score, profit, prevProfit, netWorth: nw, prevNetWorth: prevNw,
    rank, prevRank: prev?.rank ?? rank, of, tip, xp, parts,
    best: sorted[0] ? { name: sorted[0].name, net: sorted[0].sum30.netIncome } : undefined,
    worst: sorted.length > 1 ? { name: sorted.at(-1)!.name, net: sorted.at(-1)!.sum30.netIncome } : undefined,
  };
  w.play.reports.push(r);
  if (w.play.reports.length > 24) w.play.reports.shift();
  addXp(xp);
  addNews(w, 'player', `Monthly report: grade ${grade}`, `Profit this month ${fmtMoney(profit)}. You rank #${rank} of ${of}.`, score >= 68 ? 'good' : 'neutral');
  return r;
}

// ---------- daily streak (real days) ----------

function dayNumber(date: string): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : NaN;
}

export function streakReward(count: number, nw: number): { cash: number; xp: number } {
  const n = Math.min(count, 7);
  const week = count % 7 === 0;
  const cash = Math.round(Math.min(250_000, Math.max(2_000, nw * 0.002)) * n * (week ? 2 : 1) / 100) * 100;
  return { cash, xp: 40 + 10 * n + (week ? 100 : 0) };
}

/** Called by the UI with today's local date (YYYY-MM-DD) when a save is opened. */
export function checkIn(w: WorldState, date: string, nw: number, addXp: (xp: number) => void): { ok: boolean; message: string } {
  const s = w.play.streak;
  const today = dayNumber(date);
  if (!Number.isFinite(today)) return { ok: false, message: '' };
  if (s.last === date) return { ok: true, message: '' };
  const gap = s.last ? today - dayNumber(s.last) : Infinity;
  if (gap < 1) return { ok: true, message: '' }; // clock went backwards
  let froze = false;
  if (gap === 1) s.count += 1;
  else if (gap === 2 && unlocked(w, 'freeze') && (!s.freezeUsed || today - dayNumber(s.freezeUsed) >= 7)) {
    s.count += 1;
    s.freezeUsed = date;
    froze = true;
  } else s.count = 1;
  s.last = date;
  s.best = Math.max(s.best, s.count);
  const { cash, xp } = streakReward(s.count, nw);
  w.player.cash += cash;
  addXp(xp);
  s.reward = { cash, xp, count: s.count, froze, date, seen: false };
  return { ok: true, message: '' };
}
