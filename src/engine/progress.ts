import { xpForLevel } from './data';
import { companyValue, companyValueExplain } from './company';
import { portfolioValue } from './market';
import { addNews, fmtMoney } from './news';
import { playerPct } from './ownership';
import { stockValue } from './warehouse';
import type { Company, Explanation, Goal, WorldState } from './types';

export function createGoals(): Goal[] {
  const g = (id: string, label: string, kind: Goal['kind'], target: number, rewardCash: number, rewardXp: number): Goal =>
    ({ id, label, kind, target, progress: 0, rewardCash, rewardXp, claimed: false });
  return [
    g('g1', 'Found your first company', 'companies', 1, 5_000, 150),
    g('g2', 'Earn $25K profit from businesses', 'profitTotal', 25_000, 5_000, 200),
    g('g3', 'Buy your first stock', 'stocks', 1, 2_500, 150),
    g('g4', 'Upgrade any business to level 3', 'level', 3, 15_000, 300),
    g('g5', 'Reach $500K net worth', 'netWorth', 500_000, 25_000, 400),
    g('g6', 'Own 2 companies', 'companies', 2, 25_000, 400),
    g('g7', 'Earn $500K profit from businesses', 'profitTotal', 500_000, 50_000, 600),
    g('g8', 'Reach 5% market share in any product', 'share', 0.05, 100_000, 800),
    g('g9', 'Upgrade any business to level 6', 'level', 6, 150_000, 900),
    g('g10', 'Reach $10M net worth', 'netWorth', 10_000_000, 400_000, 1500),
    g('g11', 'Own 4 companies', 'companies', 4, 500_000, 1500),
    g('g12', 'Reach 15% market share in any product', 'share', 0.15, 2_000_000, 3000),
    g('g13', 'Reach $250M net worth', 'netWorth', 250_000_000, 5_000_000, 5000),
    g('g14', 'Reach $1B net worth', 'netWorth', 1_000_000_000, 20_000_000, 10000),
  ];
}

/** Private companies you own all or part of (listed ones count through your shares). */
export function ownedPrivate(w: WorldState): { c: Company; pct: number; value: number }[] {
  return w.companies
    .filter((c) => !c.ticker && (c.isPlayer || c.partners?.some((p) => p.ownerId === 'player')))
    .map((c) => { const pct = playerPct(w, c); return { c, pct, value: companyValue(c) * pct }; });
}

export function netWorth(w: WorldState): number {
  const companies = ownedPrivate(w).reduce((s, x) => s + x.value, 0);
  return w.player.cash + portfolioValue(w, w.player.holdings) + companies + (w.play ? stockValue(w) : 0);
}

export function netWorthExplain(w: WorldState): Explanation {
  const mine = w.companies.filter((c) => c.isPlayer);
  const owned = ownedPrivate(w);
  return {
    title: 'Your net worth',
    lines: [
      { label: 'Personal cash', value: w.player.cash, op: '' },
      { label: 'Stock portfolio (market value)', value: portfolioValue(w, w.player.holdings), op: '+' },
      ...owned.map(({ c, pct, value }) => ({ label: `${c.name} (${pct < 0.999 ? `your ${Math.round(pct * 100)}% of ` : ''}est. value)`, value, op: '+' as const })),
      ...(w.play?.warehouses.length ? [{ label: 'Warehouse stock (market value)', value: stockValue(w), op: '+' as const }] : []),
      { label: 'Net worth', value: netWorth(w), op: '=' },
    ],
    note: mine.length ? companyValueExplain(mine[0]).note : 'Personal wealth is separate from the cash inside your companies.',
  };
}

export function activeGoals(w: WorldState): Goal[] {
  return w.goals.filter((g) => !g.claimed).slice(0, 3);
}

export function updateProgress(w: WorldState): void {
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  const nw = netWorth(w);
  for (const g of w.goals) {
    if (g.claimed) continue;
    switch (g.kind) {
      case 'companies': g.progress = mine.length; break;
      case 'profitTotal': g.progress = w.player.lifetimeProfit; break;
      case 'stocks': g.progress = Object.keys(w.player.holdings).length; break;
      case 'level': g.progress = mine.reduce((m, c) => Math.max(m, c.level), 0); break;
      case 'netWorth': g.progress = nw; break;
      case 'share': g.progress = mine.reduce((m, c) => Math.max(m, c.last.marketShare), 0); break;
    }
  }

  const award = (id: string, title: string, body: string, rewardCash: number, rewardXp: number) => {
    if (w.achievements.some((a) => a.id === id)) return;
    w.achievements.push({ id, title, body, day: w.day, rewardCash, rewardXp, seen: false });
    w.player.cash += rewardCash;
    addXp(w, rewardXp);
    addNews(w, 'player', `Milestone: ${title}`, body, 'good');
  };
  if (mine.length >= 1) award('a_company', 'First Company!', 'You founded your first business. The empire begins.', 10_000, 250);
  if (Object.keys(w.player.holdings).length >= 1) award('a_stock', 'First Trade!', 'You bought your first shares on the exchange.', 5_000, 150);
  if (nw >= 1_000_000) award('a_million', 'First Million!', 'Your net worth passed $1 million.', 50_000, 1000);
  if (mine.some((c) => c.level >= 5)) award('a_lvl5', 'Industrial Scale!', 'One of your businesses reached level 5.', 100_000, 1200);
  if (mine.some((c) => c.last.marketShare >= 0.1)) award('a_share10', 'Market Leader!', 'You control 10% of a product market.', 500_000, 2500);
  if (nw >= 100_000_000) award('a_100m', 'Nine Figures!', 'Your net worth passed $100 million.', 2_000_000, 5000);
  if (nw >= 1_000_000_000) award('a_billion', 'Billionaire!', 'You joined the ranks of Astoria’s billionaires.', 10_000_000, 10000);

  if (w.play?.xpOwed) {
    addXp(w, w.play.xpOwed);
    w.play.xpOwed = 0;
  }

  if (w.day % 7 === 0) {
    w.player.netWorthHist.push({ day: w.day, value: nw });
    if (w.player.netWorthHist.length > 300) w.player.netWorthHist.shift();
  }
}

export function addXp(w: WorldState, xp: number): void {
  const p = w.player;
  p.xp += xp;
  while (p.xp >= xpForLevel(p.level)) {
    p.level += 1;
    addNews(w, 'player', `You reached level ${p.level}`, 'Your growing reputation opens new doors.', 'good');
  }
}

export function claimGoal(w: WorldState, id: string): { ok: boolean; message: string } {
  const g = w.goals.find((x) => x.id === id);
  if (!g || g.claimed) return { ok: false, message: 'Goal not available' };
  if (g.progress < g.target) return { ok: false, message: 'Goal not complete yet' };
  g.claimed = true;
  w.player.cash += g.rewardCash;
  addXp(w, g.rewardXp);
  return { ok: true, message: `+${fmtMoney(g.rewardCash)} · +${g.rewardXp} XP` };
}
