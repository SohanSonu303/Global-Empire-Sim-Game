import { GOODS } from './data';
import { runAutomation } from './company';
import { operateEconomy } from './economy';
import { corporateAI, rivalInvestorAI, rivalRelations } from './ai';
import { dailyEvents, expireEvents } from './events';
import { dailyMacro, monthlyMacro } from './macro';
import { payDividends, processOrders, updatePrices } from './market';
import { addNews, fmtMoney, fmtPct } from './news';
import { addXp, netWorth, updateProgress } from './progress';
import { dailyRewards, monthlyReport } from './rewards';
import { dailyStrategies } from './strategy';
import { monthlyTraits, syncTraitPerks } from './traits';
import { dailyWarehouses, rivalStockpiles } from './warehouse';
import { computeAdvice } from './advisor';
import { next } from './rng';
import { creditEvents, ensureBanks, rebalanceLoans } from './banks';
import { checkControl } from './ownership';
import { dailyDisasters } from './disasters';
import { dailyResources } from './resources';
import { dailyAuctions, failCompany, monthlyExits } from './auctions';
import { monthlyTycoons } from './tycoons';
import { dailyBusiness, weeklyManagers } from './business';
import { dailyInbox, monthlyInbox } from './inbox';
import { weeklyRivalry } from './rivalry';
import { monthlyCycle } from './cycle';
import type { WorldState } from './types';

/**
 * Advance the world by one in-game day. Systems run at their own cadence:
 * operations daily, corporate & investor AI weekly, macro monthly, earnings quarterly.
 */
export function step(w: WorldState): void {
  w.day += 1;
  const day = w.day;

  syncTraitPerks(w);
  dailyEvents(w);
  dailyDisasters(w);
  dailyMacro(w);
  ensureBanks(w);
  operateEconomy(w);
  dailyBusiness(w);

  for (const c of w.companies) {
    if (c.bankrupt) continue;
    runAutomation(w, c);
    if (c.isPlayer) w.player.lifetimeProfit += Math.max(0, c.last.netIncome);
    checkSolvency(w, c);
  }

  if (day % 7 === 0) {
    for (const c of w.companies) corporateAI(w, c);
    for (const r of w.rivals) rivalInvestorAI(w, r);
    rivalRelations(w);
    weeklyRivalry(w);
    weeklyManagers(w);
  }

  dailyResources(w);
  dailyAuctions(w);
  dailyWarehouses(w);
  dailyStrategies(w);
  dailyInbox(w);

  updatePrices(w);
  processOrders(w);
  checkControl(w);

  if (day % 30 === 0) {
    rivalStockpiles(w, () => next(w.rng));
    monthlyTycoons(w);
    monthlyExits(w);
    monthlyCycle(w);
    monthlyInbox(w);
    rebalanceLoans(w);
    creditEvents(w);
    const { prevRate, prevInflation, prevUnemployment } = monthlyMacro(w);
    const m = w.macro;
    if (m.rate !== prevRate) {
      const up = m.rate > prevRate;
      addNews(w, 'economy', `Central bank ${up ? 'raises' : 'cuts'} rates to ${fmtPct(m.rate, 2)}`,
        up ? `With inflation at ${fmtPct(m.inflation)}, borrowing gets more expensive and valuations come under pressure.`
          : `With growth at ${fmtPct(m.growth)}, cheaper credit should support spending and investment.`,
        up ? 'bad' : 'good');
    }
    if (prevInflation < 0.05 && m.inflation >= 0.05) addNews(w, 'economy', 'Inflation crosses 5%', 'Prices are rising faster than wages for many households.', 'bad');
    if (prevUnemployment < 0.07 && m.unemployment >= 0.07) addNews(w, 'economy', 'Unemployment climbs above 7%', 'Job losses are spreading; consumer spending may follow.', 'bad');
    if (day % 90 !== 0) {
      addNews(w, 'economy', `Monthly report: growth ${fmtPct(m.growth)}, inflation ${fmtPct(m.inflation)}`,
        `Unemployment stands at ${fmtPct(m.unemployment)}. GDP runs at ${fmtMoney(m.gdp)} a year.`, 'neutral');
    }
  }

  if (day % 90 === 0) quarterEnd(w);

  expireEvents(w);
  updateProgress(w);
  const nw = netWorth(w);
  dailyRewards(w, nw, (xp) => addXp(w, xp));
  if (day % 30 === 0) {
    const advice = computeAdvice(w).find((a) => a.severity !== 'good');
    const perks = monthlyTraits(w);
    const rep = monthlyReport(w, nw, advice ? advice.title : 'Keep it up: your companies look healthy.', (xp) => addXp(w, xp));
    if (rep && perks.length) rep.traits = perks;
  }
}

function quarterEnd(w: WorldState): void {
  payDividends(w);
  const q = Math.floor((w.day / 90 - 1) % 4) + 1;
  const y = Math.floor((w.day - 1) / 360) + 1;
  const reports: { name: string; growth: number; net: number }[] = [];
  for (const c of w.companies) {
    const prev = c.quarters.at(-1);
    c.quarters.push({ label: `Q${q} Y${y}`, revenue: c.qAcc.revenue, net: c.qAcc.net });
    if (c.quarters.length > 8) c.quarters.shift();
    if (c.ticker && prev && prev.revenue > 0) {
      const g = c.qAcc.revenue / prev.revenue - 1;
      reports.push({ name: c.name, growth: g, net: c.qAcc.net });
      const s = w.stocks.find((x) => x.ticker === c.ticker);
      if (s) s.newsImpact += Math.max(-0.06, Math.min(0.06, g * 0.4)); // earnings surprise
    }
    c.qAcc = { revenue: 0, net: 0 };
  }
  reports.sort((a, b) => b.growth - a.growth);
  if (reports.length >= 2) {
    const best = reports[0];
    const worst = reports[reports.length - 1];
    addNews(w, 'market', `Earnings: ${best.name} leads with ${fmtPct(best.growth)} revenue growth`,
      `${best.name} earned ${fmtMoney(best.net)} this quarter. ${worst.name} lagged with ${fmtPct(worst.growth)} growth.`, 'neutral');
  }
}

function checkSolvency(w: WorldState, c: WorldState['companies'][number]): void {
  if (c.cash < 0 && c.lowCashDays === 1) {
    addNews(w, c.isPlayer ? 'player' : 'business', `${c.name} runs low on cash`,
      `The company is out of cash and its credit line is ${c.debt > 0 ? 'stretched' : 'unused'}.`, 'bad', [c.id]);
  }
  if (c.lowCashDays > 45) failCompany(w, c, `After weeks without cash, ${c.name} has stopped making ${GOODS[c.good].name.toLowerCase()}.`);
}

