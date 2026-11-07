import { next, normal } from './rng';
import { GOODS, LEVEL_CAP_MULT } from './data';
import { applyUpgrade, canUpgrade, clamp, nextUpgradeCost, creditLimit, importPrice, refPrice } from './company';
import { fairValue, tryFill } from './market';
import { addNews, fmtMoney } from './news';
import type { Company, Personality, Rival, WorldState } from './types';

const DEFAULT_PERSONALITY: Personality = {
  risk: 0.5, aggression: 0.5, patience: 0.5, ambition: 0.5, loyalty: 0.5, negotiation: 0.5, financial: 0.5, political: 0.5, ethics: 0.5,
};

function personalityFor(w: WorldState, c: Company): Personality {
  return w.rivals.find((r) => r.id === c.ownerId)?.personality ?? DEFAULT_PERSONALITY;
}

interface Candidate {
  id: string;
  utility: number;
  apply: () => void;
}

/**
 * Weekly corporate strategy: score candidate actions with
 * U(a) = w1 Profit + w2 Growth + w3 Synergy + w4 Strategic - w5 Risk - w6 Cost, pick the best.
 */
export function corporateAI(w: WorldState, c: Company): void {
  if (c.isPlayer || c.bankrupt) return;
  const pers = personalityFor(w, c);
  const r = c.sum30;
  const util = r.sold / Math.max(1, r.capacity * 30);
  const fillRate = r.demand > 0 ? r.sold / r.demand : 1;
  const invDays = c.inventory / Math.max(1, c.last.demand);
  const margin = r.revenue > 0 ? r.operatingProfit / r.revenue : -1;
  const opexDay = c.last.opex + c.last.cogs;
  const cashDays = c.cash / Math.max(1, opexDay);
  const cands: Candidate[] = [{ id: 'hold', utility: 0.05, apply: () => {} }];

  if (canUpgrade(c) && aiNeedsCapacity(w, c, r.demand / 30)) {
    const cost = nextUpgradeCost(c);
    const affordable = c.cash > cost * (1.3 - pers.risk * 0.6);
    const canBorrow = creditLimit(c) - c.debt > cost;
    // Own orders can be inflated by shortage signals, so also require the whole market to be tight.
    // Judge it on how tight the market would be after the new capacity comes online.
    const marketCap = w.companies.reduce((s, x) => (x.good === c.good && !x.bankrupt ? s + x.capacity : s), 0);
    const added = c.capacity * (LEVEL_CAP_MULT - 1);
    const marketTight = ((w.goods[c.good]?.tightness ?? 0.87) * marketCap) / (marketCap + added) / 0.8;
    const demandRatio = Math.min(r.demand / 30 / Math.max(1, c.capacity), marketTight);
    const payback = cost / Math.max(1, (c.last.grossProfit - c.last.wages) * (LEVEL_CAP_MULT - 1));
    const u =
      3 * (demandRatio - 0.92) * (0.6 + 0.6 * pers.ambition) +
      0.5 * margin -
      clamp(payback / 365, 0, 2) * (1 - pers.risk) -
      (affordable ? 0 : canBorrow ? 0.4 * (1 - pers.risk) : 9);
    cands.push({
      id: 'upgrade',
      utility: u,
      apply: () => {
        if (c.cash < cost) {
          const draw = cost - c.cash + opexDay * 5;
          c.debt += draw;
          c.cash += draw;
        }
        c.cash -= cost;
        applyUpgrade(w, c);
        if (c.level % 3 === 0) {
          addNews(w, 'business', `${c.name} expands capacity`, `${c.name} invested ${fmtMoney(cost)} to raise output to level ${c.level}.`, 'neutral', [c.id]);
        }
      },
    });
  }
  // Pricing: never above what importers charge, never below what it costs to make
  const ref = refPrice(w, c.good);
  const pmCap = Math.min(1.35, (importPrice(w, c.good) / ref) * 0.97);
  const unitCost = (r.cogs + r.wages + r.fixed) / Math.max(1, r.sold);
  const canRaise = c.priceMult * 1.03 < pmCap;
  const canCut = c.priceMult > 0.7 && ref * c.priceMult * 0.97 > unitCost * 1.03;
  if (c.priceMult > pmCap) c.priceMult = pmCap;
  cands.push({
    id: 'raisePrice',
    utility: canRaise ? (fillRate < 0.97 ? 0.45 : 0) + (invDays < 0.3 ? 0.2 : 0) + 0.2 * pers.aggression * (margin < 0.05 ? 1 : 0) - (invDays > 2 ? 0.8 : 0) : -1,
    apply: () => { c.priceMult = clamp(c.priceMult * 1.03, 0.6, pmCap); },
  });
  cands.push({
    id: 'cutPrice',
    utility: canCut ? (invDays > 1.5 ? 0.6 : 0) + (util < 0.7 ? 0.4 : 0) * pers.aggression + (fillRate >= 0.999 && margin > 0.15 ? 0.15 : 0) : -1,
    apply: () => { c.priceMult = clamp(c.priceMult * 0.97, 0.6, pmCap); },
  });
  if (margin < -0.02 && c.priceMult < 1 && ref * c.priceMult < unitCost) {
    cands.push({ id: 'stopLoss', utility: 0.7, apply: () => { c.priceMult = clamp(c.priceMult * 1.04, 0.6, pmCap); } });
  }
  // Debt management: like real firms, keep some cheap debt (more for risk takers) and repay the rest
  const keepDebt = r.revenue * 12.17 * (0.04 + 0.2 * pers.risk);
  if (c.debt < keepDebt * 0.6 && margin > 0.03) {
    cands.push({
      id: 'borrow',
      utility: 0.15 + 0.2 * pers.risk,
      apply: () => {
        const amt = Math.min(keepDebt - c.debt, Math.max(0, creditLimit(c) - c.debt)) * 0.25; // step toward the target
        if (amt > 0) { c.debt += amt; c.cash += amt; }
      },
    });
  }
  if (c.debt > keepDebt) {
    cands.push({
      id: 'repay',
      utility: (cashDays > 40 ? 0.5 : 0) + 0.3 * (1 - pers.risk) + (c.debt / Math.max(1, r.revenue * 12) > 0.5 ? 0.3 : 0),
      apply: () => {
        const amt = Math.min(c.debt - keepDebt, c.cash - opexDay * 25);
        if (amt > 0) { c.debt -= amt; c.cash -= amt; }
      },
    });
  }
  // People
  cands.push({
    id: 'raiseSalary',
    utility: c.morale < 0.55 ? 0.7 : 0,
    apply: () => { c.salaryMult = clamp(c.salaryMult + 0.04, 0.7, 1.6); },
  });
  cands.push({
    id: 'cutSalary',
    utility: margin < 0.02 && c.morale > 0.7 ? 0.45 * (1 - pers.ethics) : 0,
    apply: () => { c.salaryMult = clamp(c.salaryMult - 0.03, 0.7, 1.6); },
  });
  // Marketing / R&D
  // Spending targets like real firms: marketing ~2-5% of revenue, R&D ~2-5% (tech up to ~8%).
  // Brand and quality are relative, so spending past these levels is an arms race nobody wins.
  const mktTarget = 0.015 + 0.03 * pers.ambition;
  const rdTarget = (c.industry === 'tech' || c.industry === 'health' ? 0.045 : 0.015) + 0.03 * pers.patience;
  cands.push({
    id: 'moreMarketing',
    utility: c.marketingPct + 0.005 <= mktTarget && margin > 0.08 ? (c.brand < 1.05 ? 0.35 : 0.1) + 0.1 * pers.ambition : -1,
    apply: () => { c.marketingPct = clamp(c.marketingPct + 0.005, 0, 0.08); },
  });
  cands.push({
    id: 'moreRD',
    utility: c.rdPct + 0.005 <= rdTarget && margin > 0.05 ? (c.industry === 'tech' ? 0.35 : 0.15) * (0.5 + pers.patience) : -1,
    apply: () => { c.rdPct = clamp(c.rdPct + 0.005, 0, 0.1); },
  });
  const over = c.marketingPct > mktTarget + 0.005 || c.rdPct > rdTarget + 0.005;
  cands.push({
    id: 'cutSpend',
    utility: margin < 0 ? 0.65 : over ? 0.3 : 0,
    apply: () => {
      c.marketingPct = clamp(Math.max(c.marketingPct - 0.01, margin < 0 ? 0 : Math.min(c.marketingPct, mktTarget)), 0, 0.08);
      c.rdPct = clamp(Math.max(c.rdPct - 0.01, margin < 0 ? 0 : Math.min(c.rdPct, rdTarget)), 0, 0.1);
    },
  });

  // Small deterministic noise so AIs don't move in lockstep
  for (const cand of cands) cand.utility += 0.05 * normal(w.rng);
  cands.sort((a, b) => b.utility - a.utility);
  cands[0].apply();
  c.aiLastAction = cands[0].id;
}

/** Weekly investor AI: rivals buy undervalued stocks in their focus, trim overvalued ones. */
export function rivalInvestorAI(w: WorldState, rv: Rival): void {
  const p = rv.personality;
  const scored = w.stocks
    .filter((s) => !s.halted)
    .map((s) => {
      const c = w.companies.find((x) => x.id === s.companyId)!;
      const val = Math.log(fairValue(w, s).value / s.price);
      const mom = s.hist.length > 20 ? s.price / s.hist[s.hist.length - 21].price - 1 : 0;
      const focus = rv.focus.includes(c.industry) ? 0.08 : 0;
      return { s, score: val * (0.5 + p.financial) + mom * p.aggression + focus + 0.03 * normal(w.rng) };
    })
    .sort((a, b) => b.score - a.score);

  const threshold = 0.12 * (1.2 - p.risk);
  const best = scored[0];
  if (best && best.score > threshold && rv.cash > 1e6) {
    const budget = rv.cash * 0.08 * (0.5 + p.risk);
    const qty = Math.floor(Math.min(budget / best.s.price, best.s.adv * 0.08));
    if (qty > 0) execute(w, rv.id, best.s.ticker, 'buy', qty);
  }
  for (const { s, score } of scored) {
    const h = rv.holdings[s.ticker];
    if (h && score < -threshold && next(w.rng) < 0.6) {
      execute(w, rv.id, s.ticker, 'sell', Math.floor(Math.min(h.shares * 0.25, s.adv * 0.08)));
    }
  }
}

function execute(w: WorldState, ownerId: string, ticker: string, side: 'buy' | 'sell', qty: number): void {
  if (qty <= 0) return;
  w.seq += 1;
  tryFill(w, {
    id: `ai${w.seq}`, ownerId, ticker, side, type: 'market', qty, filled: 0, limit: null, createdDay: w.day,
    status: 'open', avgFill: 0, lastFillDay: -1, filledToday: 0,
  });
}

/** Weekly: rivals remember when the player competes in their industries. */
export function rivalRelations(w: WorldState): void {
  for (const rv of w.rivals) {
    for (const c of w.companies) {
      if (!c.isPlayer || !rv.focus.includes(c.industry)) continue;
      if (c.last.marketShare > 0.05 && next(w.rng) < 0.15) {
        rv.relation = clamp(rv.relation - 3, -100, 100);
        rv.memory.unshift({ day: w.day, text: `${c.name} is taking share in ${GOODS[c.good].name.toLowerCase()}.`, delta: -3 });
        rv.memory.length = Math.min(rv.memory.length, 20);
      }
    }
  }
}

/**
 * Rivals only expand when buyers need it: their own orders exceed capacity and the whole market
 * would still be busy after the new capacity comes online. Cheap upgrades alone are no reason.
 */
function aiNeedsCapacity(w: WorldState, c: Company, demandPerDay: number): boolean {
  const marketCap = w.companies.reduce((s, x) => (x.good === c.good && !x.bankrupt ? s + x.capacity : s), 0);
  const added = c.capacity * (LEVEL_CAP_MULT - 1);
  const after = ((w.goods[c.good]?.tightness ?? 0.87) * marketCap) / (marketCap + added) / 0.8;
  return demandPerDay > c.capacity * 0.92 && after >= 0.92;
}
