/**
 * The personal assistant: reads the world and returns a prioritised to-do list.
 * Pure function of state, so the UI can recompute it every snapshot.
 */
import { GOODS, GOOD_IDS, INDUSTRIES, LEVEL_CAP_MULT, fixedAt, maxPriceMult, startCost } from './data';
import { licenceFee, permitFee } from './licences';
import { MONOPOLY_SHARE, probeChance } from './strategy';
import { foundPrice } from './traits';
import { companyValue, creditLimit, damageMult, importPrice, nextUpgradeCost, productivity, refPrice, supplyCover, unitEconomics } from './company';
import { effectMult } from './economy';
import { contractsOf, dailyNeed, dealPartners, judgeOffer, ownerRival } from './contracts';
import { fmtMoney, fmtPct, fmtPrice } from './news';
import { daysToReach, fillRate, marketQuality } from './business';
import { MANAGERS, clamp, maintCostPerDay, managerCostPerDay, reachOf } from './company';
import { cycleOf } from './cycle';
import { inbox, openCards } from './inbox';
import { RECEIVABLE_DAYS } from './economy';
import type { Command, Company, DayResult, GoodId, WorldState } from './types';

export type Severity = 'urgent' | 'warn' | 'tip' | 'good';

export type AdviceAction =
  | { type: 'command'; label: string; cmd: Command }
  | { type: 'openCompany'; label: string; companyId: string }
  | { type: 'openPlanner'; label: string; good?: GoodId }
  | { type: 'openEvent'; label: string }
  | { type: 'openInbox'; label: string }
  | { type: 'openMarkets'; label: string };

export interface Advice {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  companyId?: string;
  action?: AdviceAction;
}

const RANK: Record<Severity, number> = { urgent: 0, warn: 1, good: 2, tip: 3 };

function dailyCosts(c: Company): number {
  return Math.max(1, c.last.opex + c.last.purchases + c.last.interest);
}

/**
 * Days of history in the rolling 30-day sums. They decay by 29/30 a day from zero,
 * so a young company has far less than 30 days in them.
 */
function histDays(w: WorldState, c: Company): number {
  const age = Math.max(1, w.day - c.founded);
  return Math.max(1, 30 * (1 - Math.pow(29 / 30, age)));
}

/** Average per day over the last ~30 days (age-aware). */
function perDay(w: WorldState, c: Company, key: keyof DayResult): number {
  return (c.sum30[key] as number) / histDays(w, c);
}

/** Share of a good's local market that had to be imported yesterday. */
export function importShare(w: WorldState, g: GoodId): number {
  const made = w.companies.filter((x) => x.good === g && !x.bankrupt).reduce((s, x) => s + x.last.sold, 0);
  const imp = Math.max(0, w.goods[g].imported);
  return made + imp > 0 ? imp / (made + imp) : 0;
}

export interface ShortageOutlook {
  /** Why the market is short, in plain words */
  cause: string;
  /** Days until the event behind it ends, or null when it lasts until producers expand */
  daysLeft: number | null;
  /** Import price as a multiple of the market price: roughly the most buyers will pay */
  importMult: number;
  /** Sellers are out of stock and imports fill the gap (not just a busy market) */
  severe: boolean;
}

/** Is this market short of supply, why, and for how long. Null when it isn't tight. */
export function shortageOutlook(w: WorldState, g: GoodId): ShortageOutlook | null {
  const t = w.goods[g].tightness;
  if (importShare(w, g) <= 0.05 && t <= 0.93) return null;
  const importMult = importPrice(w, g) / refPrice(w, g);
  const severe = importShare(w, g) > 0.05 || t > 1.0;
  const left = (d: number) => Math.max(1, d - w.day);
  const supply = w.effects.find((e) => e.kind === 'goodSupply' && e.target === g && e.delta < 0);
  if (supply) return { cause: `Output was cut by about ${fmtPct(-supply.delta, 0)} after a supply shock`, daysLeft: left(supply.untilDay), importMult, severe };
  const oil = g === 'crude_oil' ? w.effects.find((e) => e.kind === 'oilSupply' && e.delta < 0) : undefined;
  if (oil) return { cause: 'World oil supply is down', daysLeft: left(oil.untilDay), importMult, severe };
  const hype = w.effects.find((e) => e.kind === 'goodDemand' && e.target === g && e.delta > 0);
  if (hype) return { cause: `Demand jumped about ${fmtPct(hype.delta, 0)}`, daysLeft: left(hype.untilDay), importMult, severe };
  // Hype for a product pulls on its materials too
  const down = w.effects.find((e) => e.kind === 'goodDemand' && e.delta > 0 && e.target && GOODS[e.target].inputs.some((i) => i.good === g));
  if (down) return { cause: `${GOODS[down.target!].name} makers are buying more`, daysLeft: left(down.untilDay), importMult, severe };
  return { cause: 'Demand has outgrown what producers can make', daysLeft: null, importMult, severe };
}

/**
 * Materials that really ran low. Each day the company restocks up to its
 * "keep materials for" target, so this only fires when restocking failed.
 */
export function lowSupply(c: Company): { good: GoodId; days: number; qty: number }[] {
  return supplyCover(c).filter((s) => s.days < 1 && s.days < c.automation.supplyDays * 0.5);
}

/** True when more than a sliver of yesterday's materials had to be imported. */
export function importedMuch(c: Company): boolean {
  const used = GOODS[c.good].inputs.reduce((s, i) => s + c.last.produced * i.qty, 0);
  return used > 0 && c.last.importedInputs > used * 0.05;
}

/** Days for the next upgrade to pay for itself from extra profit (Infinity if it never does). */
export function upgradePayback(w: WorldState, c: Company, price: number): number {
  const ue = unitEconomics(w, c.good, { level: c.level, salaryMult: c.salaryMult, morale: c.morale, inputs: c.inputs });
  const perUnit = price - (ue.materials + ue.labour + ue.other); // profit on each extra unit before overheads
  const demand = perDay(w, c, 'demand');
  const soldNow = Math.min(perDay(w, c, 'sold'), c.capacity);
  // A bigger plant also wins a bigger share of buyers (appeal grows with capacity^0.85).
  // Take 85% of that to stay on the safe side.
  const demandAfter = demand * Math.pow(LEVEL_CAP_MULT, 0.85) * 0.85;
  const extra = Math.max(0, Math.min(c.capacity * LEVEL_CAP_MULT, demandAfter) - soldNow);
  const extraFixed = (fixedAt(c.good, c.level + 1) - fixedAt(c.good, c.level)) * w.macro.priceLevel;
  const gain = (extra * perUnit - extraFixed) * 0.65; // after tax, marketing, R&D and a safety margin
  return gain > 0 ? nextUpgradeCost(c) / gain : Infinity;
}

/**
 * Rough daily profit change from moving the price to newMult. A cut wins buyers from rivals
 * (switching elasticity), up to the spare capacity; every unit already sold earns less.
 */
/** What the plant can really make today: a supply shock (drought, mine flood) cuts raw output. */
export function usableCap(w: WorldState, c: Company): number {
  return c.capacity * (GOODS[c.good].tier === 'raw' ? effectMult(w, 'goodSupply', c.good) : 1) * damageMult(w, c);
}

/** Units sold per day over the last week (smooths out daily noise, unlike the 30-day average it reacts to price changes) */
export function recentSold(w: WorldState, c: Company): number {
  const h = c.hist.slice(-7);
  const price = refPrice(w, c.good) * c.priceMult;
  if (h.length === 0 || price <= 0) return c.last.sold;
  return h.reduce((s, x) => s + x.revenue, 0) / h.length / price;
}

export function priceChangeGain(w: WorldState, c: Company, newMult: number): number {
  const def = GOODS[c.good];
  const ue = unitEconomics(w, c.good, { level: c.level, salaryMult: c.salaryMult, morale: c.morale, inputs: c.inputs });
  const market = refPrice(w, c.good);
  const sold = Math.min(recentSold(w, c), usableCap(w, c));
  const ratio = newMult / c.priceMult;
  const share = Math.min(0.9, c.last.marketShare);
  // Take half the textbook response: rivals react, and a cut also pulls the market price down
  let after = sold * (1 + (Math.pow(ratio, -def.switchElasticity) - 1) * (1 - share) * 0.5);
  after = Math.min(usableCap(w, c) * 0.97, Math.max(0, after));
  const unitVar = ue.materials + ue.other; // staff are paid either way
  // Count only clear wins: at least 1% of today's sales value
  return after * (market * newMult - unitVar) - sold * (market * c.priceMult - unitVar) - 0.01 * sold * market * c.priceMult;
}

export type CashRisk = { kind: 'negative' | 'burning' | 'nocredit'; need: number; days: number } | null;

/**
 * Is this company really in cash trouble? A profitable company with a thin balance is fine:
 * its sales pay its bills and the credit line covers dips. Only flag real danger.
 */
export function cashRisk(w: WorldState, c: Company): CashRisk {
  const costs = dailyCosts(c);
  const room = Math.max(0, creditLimit(c) - c.debt);
  const net = perDay(w, c, 'netIncome');
  const round = (x: number) => Math.max(1000, Math.ceil(x / 1000) * 1000);
  if (c.cash < 0) {
    return { kind: 'negative', need: round(-c.cash + costs * 7), days: Math.max(0, 45 - c.lowCashDays) };
  }
  // Losing money: how long until cash and credit run out?
  if (net < 0 && w.day - c.founded > 10) {
    const runway = (c.cash + room) / -net;
    if (runway < 45) return { kind: 'burning', need: round(-net * 30), days: runway };
  }
  // Credit used up and almost no cash: it cannot pay for its next materials
  if (room < costs * 2 && c.cash < costs * 3) {
    return { kind: 'nocredit', need: round(costs * 7 - c.cash), days: c.cash / costs };
  }
  return null;
}

export function adviseCompany(w: WorldState, c: Company): Advice[] {
  const out = adviseRaw(w, c);
  // Regulated prices can't go above the market price, so never suggest it
  if (!GOODS[c.good].reg) return out;
  return out.filter((a) => !(a.action?.type === 'command' && a.action.cmd.type === 'setPrice' && a.action.cmd.priceMult > maxPriceMult(c.good) + 1e-9));
}

function adviseRaw(w: WorldState, c: Company): Advice[] {
  const out: Advice[] = [];
  const def = GOODS[c.good];
  const add = (a: Omit<Advice, 'companyId'>) => out.push({ ...a, companyId: c.id });
  const open = { type: 'openCompany' as const, label: 'Open', companyId: c.id };

  if (c.strikeUntil > w.day) {
    const left = c.strikeUntil - w.day;
    const unhappy = c.morale < 0.55;
    add({
      id: `strike-${c.id}`, severity: 'urgent', title: `${c.name} is on strike`,
      body: `Production has stopped for ${left} more day${left === 1 ? '' : 's'}, then workers return by themselves.${unhappy ? ' Mood is low, so better pay now helps stop another strike.' : ''}`,
      action: unhappy
        ? { type: 'command', label: 'Raise pay 10%', cmd: { type: 'setSalary', companyId: c.id, salaryMult: c.salaryMult * 1.1 } }
        : open,
    });
  }

  // Cash: only real danger, never a profitable company with a thin balance
  const risk = cashRisk(w, c);
  if (risk) {
    const canFund = w.player.cash >= risk.need;
    const canBorrow = creditLimit(c) - c.debt >= risk.need;
    const body =
      risk.kind === 'negative'
        ? `It has no cash left. If it stays below zero for ${Math.round(risk.days)} more days it goes bankrupt.`
        : risk.kind === 'burning'
          ? `It loses about ${fmtMoney(-perDay(w, c, 'netIncome'))} a day. At this rate its cash and credit run out in ${Math.round(risk.days)} days.`
          : 'Its credit line is used up and it has almost no cash, so it may not be able to pay for its next materials.';
    add({
      id: `cash-${c.id}`, severity: risk.kind === 'negative' || risk.days < 10 ? 'urgent' : 'warn',
      title: risk.kind === 'burning' ? `${c.name} is burning cash` : `${c.name} is running out of cash`,
      body,
      action: canFund
        ? { type: 'command', label: `Move ${fmtMoney(risk.need)} in`, cmd: { type: 'transfer', companyId: c.id, amount: risk.need } }
        : risk.kind !== 'nocredit' && canBorrow
          ? { type: 'command', label: `Borrow ${fmtMoney(risk.need)}`, cmd: { type: 'borrow', companyId: c.id, amount: risk.need } }
          : open,
    });
  }

  // Inputs running low
  // It restocks every day up to its "keep materials for" target, so a small store room is
  // normal when that target is small. Only flag when restocking clearly failed.
  for (const s of lowSupply(c)) {
    {
      add({
        id: `supply-${c.id}-${s.good}`, severity: s.days < 0.3 ? 'urgent' : 'warn',
        title: `${c.name} is low on ${GOODS[s.good].name.toLowerCase()}`,
        body: `Only ${s.days.toFixed(1)} days left in the store room, so production may slow down. ${risk ? 'It could not pay for a full delivery.' : 'Open it to check its supply.'}`,
        action: open,
      });
      break;
    }
  }

  // Importing expensive inputs
  if (perDay(w, c, 'importedInputs') > 0 && def.inputs.length > 0) {
    const worst = def.inputs
      .map((i) => ({ good: i.good, share: importShare(w, i.good) }))
      .sort((a, b) => b.share - a.share)[0];
    const owns = w.companies.some((x) => x.isPlayer && !x.bankrupt && x.good === worst.good);
    if (worst.share >= 0.05 && !owns) {
      const fee = licenceFee(w, GOODS[worst.good].industry);
      add({
        id: `import-${c.id}`, severity: 'tip',
        title: `${GOODS[worst.good].name} is in short supply`,
        body: `${fmtPct(worst.share, 0)} of Astoria's ${GOODS[worst.good].name.toLowerCase()} is imported at a 30% premium, and ${c.name} pays it too. Owning a ${GOODS[worst.good].name.toLowerCase()} company would supply you at a discount${fee > 0 ? `, but it needs a ${INDUSTRIES[GOODS[worst.good].industry].name} licence (${fmtMoney(fee)}). Until then, a supply deal with a local producer (Supply & Deals) keeps the price down` : ''}.`,
        action: { type: 'openPlanner', label: `Make your own ${GOODS[worst.good].name.toLowerCase()}`, good: worst.good },
      });
    }
  }

  // Pricing problems
  const ue = unitEconomics(w, c.good, { level: c.level, util: 0.85, salaryMult: c.salaryMult, morale: c.morale, inputs: c.inputs });
  const market = refPrice(w, c.good);
  const price = market * c.priceMult;
  const settled = w.day - c.founded >= 7;
  const utilNow = perDay(w, c, 'sold') / Math.max(1, usableCap(w, c));
  // In a shortage a sold-out company can charge more: buyers have nowhere cheaper to go
  // until the price nears the import price.
  const short = settled ? shortageOutlook(w, c.good) : null;
  const soldOut = c.last.sold >= usableCap(w, c) * 0.95 && utilNow >= 0.93 && c.inventory < Math.max(1, c.last.sold);
  // Stay a little under the import price, and give each change a week to show its effect
  const ceiling = short ? Math.min(short.importMult - 0.05, 1.3) : 0;
  const priceWait = w.day - (c.priceSetDay ?? -99) >= 7;
  if (short?.severe && soldOut && priceWait && (short.daysLeft === null || short.daysLeft > 21) && c.priceMult * 1.05 <= ceiling + 0.01) {
    const how = short.daysLeft ? `for about ${short.daysLeft} more days` : 'until producers build more capacity';
    add({
      id: `raise-${c.id}`, severity: 'tip', title: `${c.name} could charge more`,
      body: `${GOODS[c.good].name} is in short supply (${short.cause.toLowerCase()}), likely ${how}, and you sell everything you make. Imports cost ${fmtPct(short.importMult - 1, 0)} above the market, so buyers will pay more. Raise in small steps and check you still sell out.`,
      action: { type: 'command', label: 'Raise price 5%', cmd: { type: 'setPrice', companyId: c.id, priceMult: c.priceMult * 1.05 } },
    });
  }
  const stepDown = c.priceMult < 1.12 ? 1 : c.priceMult * 0.92;
  // The other way: priced above the market with spare capacity (often once a shortage is over)
  const mh = w.goods[c.good].hist;
  const falling = mh.length > 20 && mh[mh.length - 1].price < mh[mh.length - 21].price * 0.97;
  const trimTo = c.priceMult < 1.07 ? 1 : c.priceMult * 0.95;
  if (settled && priceWait && !short && !soldOut && c.priceMult > 1.02 && !(c.priceMult > 1.08 && utilNow < 0.7) && recentSold(w, c) < usableCap(w, c) * 0.92 && priceChangeGain(w, c, trimTo) > 0) {
    add({
      id: `trim-${c.id}`, severity: 'tip', title: `${c.name} could win more sales with a lower price`,
      body: `You charge ${fmtPct(c.priceMult - 1, 0)} above the market but only sell ${fmtPct(recentSold(w, c) / Math.max(1, usableCap(w, c)), 0)} of what the plant can make.${falling ? ' Market prices are falling as supply catches up.' : ''} Lowering the price fills spare capacity.`,
      action: { type: 'command', label: trimTo === 1 ? 'Match the market' : 'Lower price 5%', cmd: { type: 'setPrice', companyId: c.id, priceMult: trimTo } },
    });
  }
  if (settled && priceWait && c.priceMult > 1.08 && utilNow < 0.7 && recentSold(w, c) < usableCap(w, c) * 0.7 && priceChangeGain(w, c, stepDown) > 0) {
    add({
      id: `overpriced-${c.id}`, severity: 'warn', title: `${c.name} is priced above the market`,
      body: `You charge ${fmtPrice(price)}, ${fmtPct(c.priceMult - 1, 0)} more than the market price of ${fmtPrice(market)}, so buyers go elsewhere. Step the price down and watch sales.`,
      action: { type: 'command', label: stepDown === 1 ? 'Match the market' : 'Lower price 8%', cmd: { type: 'setPrice', companyId: c.id, priceMult: stepDown } },
    });
  } else if (settled && c.priceMult < 1.15 && price < ue.total * 0.98 && c.sum30.netIncome < 0) {
    const pricey = def.inputs.length > 0 && ue.materials > ue.total * 0.45;
    add({
      id: `belowcost-${c.id}`, severity: 'warn', title: `${c.name} sells below cost`,
      body: `Even running near full speed, each one costs about ${fmtPrice(ue.total)} to make but sells for ${fmtPrice(price)}.${pricey ? ' Inputs are the biggest cost: a cheaper supplier would help most.' : ''}`,
      action: pricey
        ? { type: 'openPlanner', label: 'Find cheaper inputs', good: def.inputs.slice().sort((a, b) => b.qty * refPrice(w, b.good) - a.qty * refPrice(w, a.good))[0].good }
        : { type: 'command', label: 'Raise price 5%', cmd: { type: 'setPrice', companyId: c.id, priceMult: c.priceMult * 1.05 } },
    });
  }

  // Unsold stock piling up
  const dailyDemand = Math.max(1, perDay(w, c, 'demand'));
  if (settled && c.inventory > dailyDemand * 6 && c.inventory > c.capacity * 2 && price * 0.95 > ue.total * 0.9) {
    add({
      id: `stock-${c.id}`, severity: 'warn', title: `Unsold ${def.name.toLowerCase()} piling up`,
      body: `${c.name} has ${(c.inventory / dailyDemand).toFixed(0)} days of stock it cannot sell. A lower price wins customers from competitors.`,
      action: { type: 'command', label: 'Lower price 5%', cmd: { type: 'setPrice', companyId: c.id, priceMult: c.priceMult * 0.95 } },
    });
  }

  // Not enough staff
  // Use today's staff, not yesterday's report (a new company has no report yet)
  const want = Math.min(usableCap(w, c), Math.max(c.last.demand, dailyDemand));
  const laborCap = c.workers * productivity(c);
  const autoHires = c.automation.autoRecruit && !risk;
  if (!autoHires && laborCap < want * 0.85 && c.strikeUntil <= w.day) {
    const n = Math.ceil((want - laborCap) / productivity(c));
    add({
      id: `staff-${c.id}`, severity: 'warn', title: `${c.name} needs more workers`,
      body: `Staff can make ${Math.round(laborCap).toLocaleString()} a day but customers want ${Math.round(want).toLocaleString()}.${c.automation.autoRecruit ? ' Auto-hiring is paused while cash is short.' : ' Auto-hiring is off.'}`,
      action: { type: 'command', label: `Hire ${n}`, cmd: { type: 'hire', companyId: c.id, count: n } },
    });
  }

  // Mood
  if (c.morale < 0.55 && c.strikeUntil <= w.day) {
    add({
      id: `mood-${c.id}`, severity: c.morale < 0.4 ? 'urgent' : 'warn', title: `Workers at ${c.name} are unhappy`,
      body: `Mood is ${fmtPct(c.morale, 0)}. Below 45% people quit, and below 30% they may strike.`,
      action: { type: 'command', label: 'Raise pay 10%', cmd: { type: 'setSalary', companyId: c.id, salaryMult: c.salaryMult * 1.1 } },
    });
  }

  // Selling out: grow
  const util = perDay(w, c, 'sold') / Math.max(1, usableCap(w, c));
  // Too big for its market: paying high-level fixed costs for capacity nobody buys
  if (settled && c.level >= 8 && util < 0.5) {
    add({
      id: `idle-${c.id}`, severity: 'warn', title: `${c.name} is too big for its market`,
      body: `It sells only ${fmtPct(util, 0)} of what it can make, but pays level-${c.level} fixed costs (${fmtMoney(c.last.fixed)} a day). Closing one production line cuts fixed costs by about 31% and turns off auto-upgrade.`,
      action: { type: 'command', label: 'Close a production line', cmd: { type: 'downsize', companyId: c.id } },
    });
  }
  // Monopoly: close to or above the antitrust line
  if (c.last.marketShare > MONOPOLY_SHARE) {
    add({
      id: `mono-${c.id}`, severity: 'tip', title: `${c.name} has monopoly power`,
      body: `You sell ${fmtPct(c.last.marketShare, 0)} of all ${GOODS[c.good].name.toLowerCase()}. Buyers switch away half as fast now, so a higher price earns more per unit. Regulators may investigate (about ${fmtPct(probeChance(c), 0)} a month). Paying the fine is usually cheapest.`,
      action: c.priceMult < 1.3 ? { type: 'command', label: 'Raise price 5%', cmd: { type: 'setPrice', companyId: c.id, priceMult: c.priceMult * 1.05 } } : open,
    });
  } else if (c.last.marketShare > MONOPOLY_SHARE * 0.85) {
    add({
      id: `mono-${c.id}`, severity: 'tip', title: `${c.name} is close to a monopoly`,
      body: `You sell ${fmtPct(c.last.marketShare, 0)} of the market. Above ${fmtPct(MONOPOLY_SHARE, 0)} buyers stay more loyal, but regulators start to look at you.`,
    });
  }
  // Only grow when the bigger plant (x1.7 capacity) would still be well used, and it is not short of cash
  const growPayback = upgradePayback(w, c, price);
  // A demand boom from the news ends: don't build for demand that goes away
  const boom = activeEffect(w, 'goodDemand', c.good, 1);
  // (only when it ends before an upgrade would pay for itself)
  const lasting = boom ? perDay(w, c, 'demand') / (1 + boom.delta) > usableCap(w, c) * 1.2 || boom.untilDay - w.day > Math.min(growPayback, 365) : true;
  if (settled && !risk && util > 0.93 && perDay(w, c, 'demand') > usableCap(w, c) * 1.2 && boom && !lasting) {
    add({
      id: `grow-${c.id}`, severity: 'good', title: `${c.name} is selling out, for now`,
      body: `Demand is up about ${fmtPct(boom.delta, 0)} from a boom that should end in about ${boom.untilDay - w.day} days. Without it you would not sell out, so an upgrade may sit idle. Charge more while it lasts instead.`,
      action: c.priceMult < 1.2 ? { type: 'command', label: 'Raise price 5%', cmd: { type: 'setPrice', companyId: c.id, priceMult: c.priceMult * 1.05 } } : open,
    });
  } else if (settled && !risk && util > 0.93 && perDay(w, c, 'demand') > usableCap(w, c) * 1.2) {
    const cost = nextUpgradeCost(c);
    const afford = Math.max(0, c.cash - c.automation.minCash) + w.player.cash >= cost;
    // Only suggest the upgrade when the extra sales pay it back within a year
    const worthIt = growPayback < 365;
    // Upgrades cost 2.3x more each level but add only 1.7x capacity, so from level 3 a second
    // level-1 plant usually earns more per dollar.
    const plant = opportunities(w).find((o) => o.good === c.good);
    const second = plant && c.level >= 3 && plant.paybackDays < 365 && plant.paybackDays * 1.3 < growPayback ? plant : null;
    if (second) {
      add({
        id: `grow-${c.id}`, severity: 'good', title: `${c.name} is selling out`,
        body: `Customers want ${fmtPct(perDay(w, c, 'demand') / Math.max(1, perDay(w, c, 'sold')) - 1, 0)} more than you can make. At level ${c.level} an upgrade costs ${fmtMoney(cost)}${Number.isFinite(growPayback) ? ` and pays back in about ${Math.round(growPayback)} days` : ''}. A second ${GOODS[c.good].name.toLowerCase()} company costs ${fmtMoney(second.foundCost)} and pays back in about ${Math.round(second.paybackDays)} days.`,
        action: { type: 'openPlanner', label: 'Plan a second plant', good: c.good },
      });
    } else add({
      id: `grow-${c.id}`, severity: 'good', title: `${c.name} is selling out`,
      body: `Customers want ${fmtPct(perDay(w, c, 'demand') / Math.max(1, perDay(w, c, 'sold')) - 1, 0)} more than you can make.${
        !worthIt
          ? ' Margins are thin, so an upgrade would take too long to pay back. A higher price earns more from the same output.'
          : afford
            ? ` An upgrade costs ${fmtMoney(cost)} and pays back in about ${Math.round(growPayback)} days.`
            : ' Raise the price while you save for an upgrade.'
      }`,
      action: worthIt && afford
        ? { type: 'command', label: `Upgrade (${fmtMoney(cost)})`, cmd: { type: 'upgrade', companyId: c.id } }
        : c.priceMult < 1.15
          ? { type: 'command', label: 'Raise price 5%', cmd: { type: 'setPrice', companyId: c.id, priceMult: c.priceMult * 1.05 } }
          : open,
    });
  }

  adviseRunning(w, c, add);

  // Losing money with no specific cause found
  if (c.sum30.netIncome < 0 && out.length === 0 && w.day - c.founded > 20) {
    add({ id: `loss-${c.id}`, severity: 'warn', title: `${c.name} is losing money`, body: `It loses about ${fmtMoney(-perDay(w, c, 'netIncome'))} a day. Open it to see where the money goes.`, action: open });
  }

  // Deals ending soon
  for (const k of contractsOf(w, c)) {
    if (k.endDay - w.day <= 5) {
      add({ id: `deal-${k.id}`, severity: 'tip', title: `A ${GOODS[k.good].name.toLowerCase()} deal ends in ${k.endDay - w.day} days`, body: `${c.name} will go back to buying or selling on the open market.`, action: open });
    }
  }

  if (settled && !risk) {
    const deal = sellDealIdea(w, c);
    if (deal) add(deal);
    const lock = buyLockIdea(w, c);
    if (lock) add(lock);
  }
  return out;
}

/** Marketing a company of this kind needs to win and keep customers (consumer brands need far more than commodities) */
export function marketingGoal(g: GoodId): number {
  const t = GOODS[g].tier;
  return t === 'product' ? 0.05 : t === 'material' ? 0.03 : 0.02;
}

/** R&D share that, held for a year or so, brings quality up to `goal` */
export function rdFor(c: Company, goal: number): number {
  return clamp((goal - 0.8) / INDUSTRIES[c.industry].rdK, 0, 0.1);
}

/** Customers, quality, machines, staff and cash flow: running the business well. */
function adviseRunning(w: WorldState, c: Company, add: (a: Omit<Advice, 'companyId'>) => void): void {
  const def = GOODS[c.good];
  const product = def.tier === 'product';
  const weekly = (pct: number) => (Math.max(c.sum30.revenue, c.capacity * refPrice(w, c.good) * 30 * 0.5) / 30) * 7 * pct;
  const reach = reachOf(c);
  const spend = (m: number, r: number): Command => ({ type: 'setSpend', companyId: c.id, marketingPct: m, rdPct: r });

  // Winning customers: the single biggest lever for a new company
  const goalMkt = marketingGoal(c.good);
  if (reach < 0.85 && !def.reg && c.marketingPct < goalMkt - 0.004) {
    const now = daysToReach(w, c, 0.8);
    const then = daysToReach(w, c, 0.8, goalMkt);
    const weeks = (d: number) => (Number.isFinite(d) ? `about ${Math.max(1, Math.round(d / 7))} weeks` : 'never at this rate');
    add({
      id: `customers-${c.id}`, severity: 'tip', title: `Win customers faster for ${c.name}`,
      body: `${c.name} has ${Math.round(reach * 100)}% of the customers an established ${def.name.toLowerCase()} firm has, so most buyers still go to rivals. Raising marketing from ${fmtPct(c.marketingPct, 0)} to ${fmtPct(goalMkt, 0)} of sales (about ${fmtMoney(weekly(goalMkt) - weekly(c.marketingPct))} more a week) gets you to 80% in ${weeks(then)} instead of ${weeks(now)}.${product ? ' Shoppers follow brands, so it pays to spend.' : ' Factory buyers mostly compare price, so you do not need more than this.'}`,
      action: { type: 'command', label: `Marketing to ${fmtPct(goalMkt, 0)}`, cmd: spend(goalMkt, c.rdPct) },
    });
  }
  // Commodity buyers ignore ads: don't waste money
  if (!product && reach > 0.95 && c.marketingPct > goalMkt + 0.02 && c.sum30.revenue > 0) {
    add({
      id: `adwaste-${c.id}`, severity: 'tip', title: `${c.name} spends a lot on marketing`,
      body: `Factories buy ${def.name.toLowerCase()} mostly on price, and ${c.name} already has its customers. Cutting marketing from ${fmtPct(c.marketingPct, 0)} to ${fmtPct(goalMkt, 0)} saves about ${fmtMoney((weekly(c.marketingPct) - weekly(goalMkt)) * 4.3)} a month.`,
      action: { type: 'command', label: `Marketing to ${fmtPct(goalMkt, 0)}`, cmd: spend(goalMkt, c.rdPct) },
    });
  }
  // Quality against rivals
  const mq = marketQuality(w, c.good);
  const gap = c.quality / mq;
  if (w.day - c.founded > 14 && (product ? gap < 0.95 : gap < 0.88)) {
    const goalRd = rdFor(c, mq * 1.02);
    if (goalRd > c.rdPct + 0.004) {
      add({
        id: `quality-${c.id}`, severity: 'tip', title: `${c.name}'s quality trails its rivals`,
        body: `Customers rate ${c.name} at ${c.quality.toFixed(2)} against ${mq.toFixed(2)} for the market, so fewer of them stay and fewer new ones come. Raising R&D from ${fmtPct(c.rdPct, 0)} to ${fmtPct(goalRd, 0)} of sales (about ${fmtMoney((weekly(goalRd) - weekly(c.rdPct)) * 4.3)} more a month) closes most of the gap in about ${Math.round(400 / 30)} months.${product ? '' : ' For materials it matters less than price, so do this once you are profitable.'}`,
        action: { type: 'command', label: `R&D to ${fmtPct(goalRd, 0)}`, cmd: spend(c.marketingPct, goalRd) },
      });
    }
  }
  // Unhappy customers leave
  const sat = c.satisfaction ?? 0.75;
  if (sat < 0.55 && w.day - c.founded > 20) {
    const fill = fillRate(c);
    const why = fill < 0.9
      ? `you only filled ${fmtPct(fill, 0)} of their orders. Keep more stock (Automation: inventory days), hire, or expand`
      : c.priceMult > 1.08
        ? `your price is ${fmtPct(c.priceMult - 1, 0)} above the market. A smaller premium keeps them`
        : 'your quality is below the market. More R&D lifts it';
    add({ id: `unhappy-${c.id}`, severity: sat < 0.45 ? 'warn' : 'tip', title: `${c.name}'s customers are unhappy`, body: `Satisfaction is ${Math.round(sat * 100)}% and unhappy customers drift to rivals: ${why}.`, action: { type: 'openCompany', label: 'Open', companyId: c.id } });
  }
  // Machines
  const cond = c.condition ?? 1;
  const maint = c.maintenance ?? 'normal';
  if (cond < 0.75 && maint !== 'high') {
    const extra = maintCostPerDay(w, { ...c, maintenance: 'high' }) - maintCostPerDay(w, c);
    add({
      id: `machines-${c.id}`, severity: cond < 0.6 ? 'warn' : 'tip', title: `${c.name}'s machines are wearing out`,
      body: `Condition is ${Math.round(cond * 100)}%: workers make ${Math.round((1 - (0.85 + 0.15 * cond)) * 100)}% less and breakdowns are ${Math.round(4 * (1 - cond) * 100)}% more likely. High maintenance (about ${fmtMoney(extra)} more a day) brings them back over a few months.`,
      action: { type: 'command', label: 'High maintenance', cmd: { type: 'setMaintenance', companyId: c.id, level: 'high' } },
    });
  } else if (maint === 'high' && cond > 0.97) {
    add({ id: `machines-${c.id}`, severity: 'tip', title: `${c.name}'s machines are in top shape`, body: 'Normal maintenance keeps them there for less.', action: { type: 'command', label: 'Normal maintenance', cmd: { type: 'setMaintenance', companyId: c.id, level: 'normal' } } });
  }
  // Customers who pay late
  const owed = c.receivables ?? 0;
  if (owed > 0 && c.cash < owed * 0.25 && c.sum30.netIncome > 0) {
    add({
      id: `owed-${c.id}`, severity: 'tip', title: `Customers owe ${c.name} ${fmtMoney(owed)}`,
      body: `Business customers pay over about ${RECEIVABLE_DAYS} days, so profit arrives as cash later. With only ${fmtMoney(c.cash)} in the bank, one big bill means borrowing. Paying yourself smaller dividends for a while builds a buffer.`,
      action: c.automation.dividendPct > 25 ? { type: 'command', label: 'Dividends to 25%', cmd: { type: 'setAutomation', companyId: c.id, automation: { dividendPct: 25 } } } : { type: 'openCompany', label: 'Open', companyId: c.id },
    });
  }
  // Fading products
  const trend = w.goods[c.good]?.trend ?? 1;
  if (product && trend < 0.9) {
    add({ id: `fading-${c.id}`, severity: 'tip', title: `Demand for ${def.name.toLowerCase()} is fading`, body: `Households buy ${fmtPct(1 - trend, 0)} less ${def.name.toLowerCase()} than when the game began, and the trend is still down. Avoid big upgrades here; growing markets like AI, robots and online stores are better places for new money.`, action: { type: 'openPlanner', label: 'See growing markets' } });
  }
}

/** An event from the news that is still running, e.g. a demand boom (+1) or slump (-1) for a good. */
function activeEffect(w: WorldState, kind: 'goodDemand' | 'goodSupply', good: GoodId, sign: 1 | -1) {
  return w.effects.find((e) => e.kind === kind && e.target === good && Math.sign(e.delta) === sign && e.untilDay > w.day);
}

/**
 * Spare capacity, or a slump on the way: offer an AI buyer a supply deal. A deal is delivered
 * first, so with spare capacity it is extra volume at a fixed price.
 */
function sellDealIdea(w: WorldState, c: Company): Omit<Advice, 'companyId'> | null {
  if (w.day - c.founded < 14) return null;
  if (contractsOf(w, c).some((k) => k.sellerId === c.id)) return null;
  const def = GOODS[c.good];
  const sold = recentSold(w, c);
  const spare = usableCap(w, c) * 0.95 - sold;
  // A slump in this good, or in a product made from it, is coming through the news
  // Only count it when that product is a big part of what your good is used for
  const used = w.companies.reduce((s, x) => s + (x.bankrupt ? 0 : dailyNeed(x, c.good)), 0) + w.goods[c.good].finalDemand;
  const weight = (g: GoodId) => g === c.good ? 1 : w.companies.filter((x) => x.good === g && !x.bankrupt).reduce((s, x) => s + dailyNeed(x, c.good), 0) / Math.max(1, used);
  const slump = w.effects.find((e) => e.kind === 'goodDemand' && e.delta < 0 && e.untilDay - w.day >= 30 && e.target
    && (e.target === c.good || GOODS[e.target].inputs.some((i) => i.good === c.good)) && -e.delta * weight(e.target) >= 0.08);
  if (spare < usableCap(w, c) * 0.12 && !slump) return null;
  const ref = refPrice(w, c.good);
  const ue = unitEconomics(w, c.good, { level: c.level, salaryMult: c.salaryMult, morale: c.morale, inputs: c.inputs });
  const unitVar = ue.materials + ue.other;
  const buyers = dealPartners(w, c).buyers
    .filter((b) => (ownerRival(w, b)?.relation ?? 0) > -40)
    .map((b) => ({ b, need: dailyNeed(b, c.good) }))
    .filter((x) => x.need > 0)
    .sort((a, z) => z.need - a.need);
  const top = buyers[0];
  if (!top) return null;
  const qty = Math.round(Math.min(Math.max(spare, usableCap(w, c) * 0.15) * 0.8, top.need * 0.3));
  if (qty < Math.max(1, usableCap(w, c) * 0.05)) return null;
  const price = Math.min(ref * (slump ? 0.99 : 0.98), judgeOffer(w, c, top.b, 'sell', qty, ref).fair * 0.995);
  if (!judgeOffer(w, c, top.b, 'sell', qty, price).accept || price <= unitVar * 1.05) return null;
  // With spare capacity the deal is new volume; otherwise it only protects existing sales
  const extra = Math.min(qty, Math.max(0, spare));
  const gain = extra * (price - unitVar);
  const days = slump ? Math.min(120, Math.max(30, slump.untilDay - w.day)) : 60;
  const why = slump
    ? `Demand for ${GOODS[slump.target!].name.toLowerCase()} is expected to fall about ${fmtPct(-slump.delta, 0)} for ${slump.untilDay - w.day} days.`
    : `${c.name} only sells ${fmtPct(sold / Math.max(1, usableCap(w, c)), 0)} of what it can make.`;
  return {
    id: `selldeal-${c.id}`, severity: 'tip', title: slump ? `Lock in ${def.name.toLowerCase()} sales before demand drops` : `Sell more ${def.name.toLowerCase()} with a deal`,
    body: `${why} ${top.b.name} uses about ${Math.round(top.need).toLocaleString()} ${def.unit} a day. A ${days}-day deal for ${qty.toLocaleString()} a day at ${fmtPrice(price)} (${fmtPct(1 - price / ref, 0)} under market) is delivered first${gain > 0 ? `, adding about ${fmtMoney(gain)} profit a day` : '. It works like insurance: if demand holds up it costs you about 1% on those units'}.`,
    action: { type: 'command', label: 'Offer the deal', cmd: { type: 'offerContract', companyId: c.id, partnerId: top.b.id, side: 'sell', qtyPerDay: qty, price, days } },
  };
}

/**
 * The news says an input is about to get dearer (supply shock, oil cut, or a boom downstream):
 * lock today's price with a buy deal before the market price climbs.
 */
function buyLockIdea(w: WorldState, c: Company): Omit<Advice, 'companyId'> | null {
  for (const inp of GOODS[c.good].inputs) {
    const g = inp.good;
    if (w.companies.some((x) => x.isPlayer && !x.bankrupt && x.good === g)) continue; // your own supplier covers it
    if (contractsOf(w, c).some((k) => k.buyerId === c.id && k.good === g)) continue;
    const ev = activeEffect(w, 'goodSupply', g, -1)
      ?? (g === 'crude_oil' ? w.effects.find((e) => e.kind === 'oilSupply' && e.delta < 0 && e.untilDay > w.day) : undefined);
    if (!ev || ev.untilDay - w.day < 30) continue;
    const ref = refPrice(w, g);
    // Only while prices still have room to climb towards the import price
    if (ref > importPrice(w, g) * 0.92) continue;
    const need = dailyNeed(c, g);
    const sellers = dealPartners(w, c).sellers.find((s) => s.good === g)?.companies
      .filter((x) => (ownerRival(w, x)?.relation ?? 0) > -40)
      .sort((a, z) => z.capacity - a.capacity) ?? [];
    const partner = sellers[0];
    if (!partner || need <= 0) continue;
    const qty = Math.round(Math.min(need * 0.7, partner.capacity * 0.45));
    if (qty <= 0) continue;
    const price = judgeOffer(w, c, partner, 'buy', qty, ref * 2).fair * 1.005;
    if (!judgeOffer(w, c, partner, 'buy', qty, price).accept || price > ref * 1.06) continue;
    const days = Math.min(120, ev.untilDay - w.day);
    const name = GOODS[g].name.toLowerCase();
    return {
      id: `buylock-${c.id}-${g}`, severity: 'tip', title: `Lock in your ${name} price`,
      body: `${ev.kind === 'oilSupply' ? 'World oil supply is down' : `${GOODS[g].name} output was cut about ${fmtPct(-ev.delta, 0)}`} for about ${ev.untilDay - w.day} days, so prices should climb towards the import price (${fmtPct(importPrice(w, g) / ref - 1, 0)} higher). A ${days}-day deal with ${partner.name} for ${qty.toLocaleString()} ${GOODS[g].unit} a day fixes the price at ${fmtPrice(price)}.`,
      action: { type: 'command', label: 'Offer the deal', cmd: { type: 'offerContract', companyId: c.id, partnerId: partner.id, side: 'buy', qtyPerDay: qty, price, days } },
    };
  }
  return null;
}

/**
 * Inputs your companies buy a lot of from other people: owning that supplier gives them your
 * sister discount, a guaranteed customer for the new plant, and no import premium in a shortage.
 */
function ownSupplyIdea(w: WorldState, mine: Company[]): Advice | null {
  const ideas = GOOD_IDS.filter((g) => !mine.some((c) => c.good === g)).map((g) => {
    const users = mine.filter((c) => GOODS[c.good].inputs.some((i) => i.good === g));
    const need = users.reduce((s, c) => s + dailyNeed(c, g), 0);
    const ref = refPrice(w, g);
    const imp = importShare(w, g);
    return { g, users, need, spend: need * ref * (1 + imp * 0.3), saving: need * ref * 0.2 + need * imp * ref * 0.3, share: need / Math.max(1, GOODS[g].baseCapacity) };
  }).filter((x) => x.users.length > 0 && x.share >= 0.3).sort((a, z) => z.saving - a.saving);
  const top = ideas[0];
  if (!top) return null;
  const op = opportunities(w).find((o) => o.good === top.g);
  const fee = licenceFee(w, GOODS[top.g].industry) + permitFee(w, top.g);
  if (!op || op.margin <= 0 || w.player.cash < (startCost(top.g) + fee) * 0.5) return null;
  // A licence must be worth it: the yearly saving should cover plant + licence within two years
  if (fee > 0 && (startCost(top.g) + fee) / Math.max(1, top.saving) > 730) return null;
  const name = GOODS[top.g].name.toLowerCase();
  const who = top.users.map((c) => c.name).join(' and ');
  return {
    id: `ownsupply-${top.g}`, severity: 'tip', title: `Make your own ${name}`,
    body: `${who} buy${top.users.length === 1 ? 's' : ''} about ${Math.round(top.need).toLocaleString()} ${GOODS[top.g].unit} of ${name} a day (${fmtMoney(top.spend)}). Your own ${name} company would supply ${top.users.length === 1 ? 'it' : 'them'} first at your 20% sister discount (about ${fmtMoney(top.saving)} a day cheaper), with ${fmtPct(Math.min(1, top.share), 0)} of its output already sold. It costs ${fmtMoney(startCost(top.g))}${fee > 0 ? ` plus a ${INDUSTRIES[GOODS[top.g].industry].name} licence (${fmtMoney(fee)})` : ''}.`,
    action: { type: 'openPlanner', label: `Plan a ${name} company`, good: top.g },
  };
}

export function computeAdvice(w: WorldState): Advice[] {
  const out: Advice[] = [];
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);

  if (w.pending.length > 0) {
    out.push({ id: 'event', severity: 'urgent', title: w.pending[0].title, body: 'A decision is waiting for you.', action: { type: 'openEvent', label: 'Decide' } });
  }
  const ready = w.goals.find((g) => !g.claimed && g.progress >= g.target);
  if (ready) {
    out.push({ id: `goal-${ready.id}`, severity: 'good', title: `Goal complete: ${ready.label}`, body: `Claim ${fmtMoney(ready.rewardCash)} and ${ready.rewardXp} XP.`, action: { type: 'command', label: 'Claim', cmd: { type: 'claimGoal', goalId: ready.id } } });
  }
  if (mine.length === 0) {
    out.push({ id: 'first', severity: 'tip', title: 'Start your first company', body: 'Open the planner to see which products are in demand and what they cost to make.', action: { type: 'openPlanner', label: 'Open planner' } });
  }

  for (const c of mine) out.push(...adviseCompany(w, c));

  // Vertical integration: supply your own companies
  const own = ownSupplyIdea(w, mine);
  const plans = (x: Advice) => (x.action?.type === 'openPlanner' ? x.action.good : undefined);
  if (own && !out.some((a) => plans(a) === plans(own))) out.push(own);

  // Market opportunities: shortages with rising prices
  const hot = opportunities(w)
    .filter((o) => !o.tags.includes('yours') && o.margin > 0 && (o.tags.includes('shortage') || o.tags.includes('hot')) && w.player.cash >= o.foundCost + o.licence)
    .slice(0, 1);
  for (const o of hot) {
    const name = GOODS[o.good].name;
    out.push({
      id: `opp-${o.good}`, severity: 'tip',
      title: o.tags.includes('shortage') ? `Astoria is short of ${name.toLowerCase()}` : `${name} demand is rising`,
      body: `${o.reason} A new producer would earn about ${fmtPct(o.margin, 0)} on each sale.${o.licence > 0 ? ` You would need a ${INDUSTRIES[GOODS[o.good].industry].name} licence (${fmtMoney(o.licence)}).` : ''}`,
      action: { type: 'openPlanner', label: 'See the plan', good: o.good },
    });
  }

  // Idle personal cash
  const cheapest = Math.min(...GOOD_IDS.map((g) => startCost(g) + licenceFee(w, GOODS[g].industry)));
  const needsCash = mine.some((c) => cashRisk(w, c) != null);
  if (mine.length > 0 && !needsCash && w.player.cash > cheapest * 1.5 && w.day > 30) {
    out.push({ id: 'idle', severity: 'tip', title: `${fmtMoney(w.player.cash)} is sitting idle`, body: 'Start another company or buy shares so your money works for you.', action: { type: 'openPlanner', label: 'Find a business' } });
  }

  // The monthly inbox
  const cards = openCards(w);
  if (cards.length) {
    const soon = Math.min(...cards.map((x) => x.expires - w.day));
    out.push({
      id: 'inbox', severity: soon <= 2 ? 'warn' : 'tip', title: `${cards.length} decision${cards.length === 1 ? '' : 's'} in your inbox`,
      body: `${cards[0].title}.${soon <= 2 ? ` The oldest is decided for you in ${Math.max(0, soon)} day${soon === 1 ? '' : 's'}.` : ''}`,
      action: { type: 'openInbox', label: 'Open inbox' },
    });
  }
  const timedOut = inbox(w).filter((x) => x.answered?.by === 'timeout' && w.day - x.answered.day < 30).length;
  const unmanaged = mine.filter((c) => (c.manager ?? 'none') === 'none');
  if (timedOut >= 2 && unmanaged.length >= 2) {
    const c = unmanaged.sort((a, b) => b.sum30.revenue - a.sum30.revenue)[0];
    const cost = managerCostPerDay(w, { ...c, manager: 'basic' });
    out.push({
      id: 'manager', severity: 'tip', title: 'Decisions are timing out',
      body: `${timedOut} decisions ran out this month and took the default answer. A manager for ${c.name} (${MANAGERS.basic.label.toLowerCase()}, about ${fmtMoney(cost)} a day) answers its inbox for you with safe choices.`,
      action: { type: 'command', label: 'Hire a manager', cmd: { type: 'setManager', companyId: c.id, manager: 'basic' } },
    });
  }
  const cy = cycleOf(w);
  if (mine.length && cy.phase === 'warning') {
    out.push({ id: 'recession', severity: 'warn', title: 'A recession is coming', body: `Economists expect a downturn in about ${Math.max(1, Math.round((cy.until - w.day) / 7))} weeks. Shoppers will buy about 10% less (luxuries more, care and power less). Build cash, avoid new loans and hold off on big upgrades until it passes.` });
  } else if (mine.length && cy.phase === 'recession') {
    out.push({ id: 'recession', severity: 'tip', title: 'Riding out the recession', body: 'Keep your customers happy rather than chasing price: buyers you keep now are the first to come back. Firms with cash can pick up bargains at bankruptcy auctions.' });
  }

  // Rivals who refuse to deal with you
  for (const rv of w.rivals) {
    if (rv.relation <= -40) {
      out.push({ id: `hostile-${rv.id}`, severity: 'tip', title: `${rv.name} will not trade with you`, body: 'Their companies refuse deals. Give one of them a generous contract, or buy from someone else.' });
    }
  }

  out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return out;
}

/** Highest severity per company, for red dots on cards and the Business tab. */
export function attentionByCompany(advice: Advice[]): Record<string, Severity> {
  const m: Record<string, Severity> = {};
  for (const a of advice) {
    if (!a.companyId || a.severity === 'tip' || a.severity === 'good') continue;
    if (!m[a.companyId] || RANK[a.severity] < RANK[m[a.companyId]]) m[a.companyId] = a.severity;
  }
  return m;
}

export interface Opportunity {
  good: GoodId;
  price: number;
  priceChange: number; // vs base price level
  trend: number; // last ~30 days
  demand: number; // units/day (final + business)
  capacity: number; // domestic capacity units/day
  gap: number; // demand / capacity - 1
  producers: number;
  unitCost: number;
  margin: number;
  foundCost: number;
  paybackDays: number;
  tags: ('hot' | 'shortage' | 'crowded' | 'cheap' | 'yours' | 'locked')[];
  /** Licence fee you would pay first (0 if you hold the licence or it would be your first) */
  licence: number;
  reason: string;
}

/** Planner data for every good: is it worth entering, and why. */
export function opportunities(w: WorldState): Opportunity[] {
  return GOOD_IDS.map((g) => {
    const mk = w.goods[g];
    const sellers = w.companies.filter((c) => c.good === g && !c.bankrupt);
    const capacity = sellers.reduce((s, c) => s + c.capacity, 0);
    const demand = mk.finalDemand + w.companies.reduce((s, c) => {
      const i = GOODS[c.good].inputs.find((x) => x.good === g);
      return i && !c.bankrupt ? s + Math.max(c.last.produced, c.capacity * 0.25) * i.qty : s;
    }, 0);
    const price = refPrice(w, g);
    const priceChange = mk.idx - 1;
    const past = mk.hist.length > 15 ? mk.hist[mk.hist.length - 16].price : price;
    const trend = past > 0 ? price / past - 1 : 0;
    const ue = unitEconomics(w, g, { level: 1, util: 0.8 });
    const margin = ue.margin;
    const profitDay = (price - ue.total) * ue.capacity * 0.8 * 0.75; // after marketing/R&D/tax, roughly
    const paybackDays = profitDay > 0 ? startCost(g) / profitDay : Infinity;
    const gap = capacity > 0 ? demand / capacity - 1 : 1;
    const tags: Opportunity['tags'] = [];
    if (w.companies.some((c) => c.isPlayer && !c.bankrupt && c.good === g)) tags.push('yours');
    if (mk.imported > demand * 0.05 || gap > 0) tags.push('shortage');
    if (trend > 0.06 || w.effects.some((e) => e.kind === 'goodDemand' && e.target === g && e.delta > 0)) tags.push('hot');
    if (gap < -0.25 && sellers.length >= 2) tags.push('crowded');
    if (startCost(g) <= 250_000) tags.push('cheap');
    const licence = licenceFee(w, GOODS[g].industry);
    if (licence > 0) tags.push('locked');
    const reason = tags.includes('shortage')
      ? `Buyers want more than Astoria makes${mk.imported > 0 ? ', so they import at a premium' : ''}.`
      : tags.includes('hot')
        ? 'Demand is rising.'
        : tags.includes('crowded')
          ? 'There is a lot of spare capacity, so prices are under pressure.'
          : 'A steady market.';
    return { good: g, price, priceChange, trend, demand, capacity, gap, producers: sellers.length, unitCost: ue.total, margin, foundCost: foundPrice(w, g), licence, paybackDays, tags, reason };
  }).sort((a, b) => score(b) - score(a));
}

function score(o: Opportunity): number {
  return o.margin * 2 + Math.max(-0.3, Math.min(0.5, o.gap)) + o.trend * 2 + (o.tags.includes('hot') ? 0.2 : 0) - (o.tags.includes('crowded') ? 0.3 : 0);
}

/** Estimated value of all player companies (used by planner copy). */
export function playerCompanyValue(w: WorldState): number {
  return w.companies.filter((c) => c.isPlayer).reduce((s, c) => s + companyValue(c), 0);
}

/** Inputs for a good, with the cheapest source the player has: own sister company or the market. */
export function inputSources(w: WorldState, good: GoodId): { good: GoodId; qty: number; market: number; own?: { name: string; price: number } }[] {
  return GOODS[good].inputs.map((i) => {
    const market = refPrice(w, i.good);
    const sis = w.companies.find((c) => c.isPlayer && !c.bankrupt && c.good === i.good);
    return { good: i.good, qty: i.qty, market, own: sis ? { name: sis.name, price: market * sis.priceMult * (1 - sis.sisterDiscount) } : undefined };
  });
}

export interface LaunchPreview {
  price: number;
  unitCost: number;
  materials: number;
  labour: number;
  other: number;
  fixed: number;
  capacity: number;
  util: number;
  soldPerDay: number;
  profitDay: number;
  margin: number;
  paybackDays: number;
}

/**
 * Rough forecast for a new level-1 company at a chosen price (multiple of market price).
 * Cheaper than the market wins share faster; pricier sells less. Uses own suppliers when available.
 */
export function launchPreview(w: WorldState, good: GoodId, priceMult: number): LaunchPreview {
  const def = GOODS[good];
  const op = opportunities(w).find((o) => o.good === good)!;
  // Base fill for a newcomer at market price: full when the market is short, less when crowded.
  const base = Math.max(0.25, Math.min(1, 0.8 + op.gap * 1.2));
  const util = Math.max(0.05, Math.min(1, base * Math.pow(priceMult, -def.switchElasticity)));
  const ue = unitEconomics(w, good, { level: 1, util });
  const src = inputSources(w, good);
  const materials = src.reduce((s, i) => s + i.qty * Math.min(i.market, i.own?.price ?? Infinity), 0);
  const unitCost = ue.total - ue.materials + materials;
  const price = ue.price * priceMult;
  const soldPerDay = ue.capacity * util;
  const profitDay = (price - unitCost) * soldPerDay * 0.8; // after marketing, R&D and tax, roughly
  return {
    price, unitCost, materials, labour: ue.labour, other: ue.other, fixed: ue.fixed, capacity: ue.capacity, util, soldPerDay,
    profitDay, margin: price > 0 ? (price - unitCost) / price : 0, paybackDays: profitDay > 0 ? startCost(good) / profitDay : Infinity,
  };
}
