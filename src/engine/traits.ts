/**
 * Career traits. The player picks two when a game starts. Each trait pays on a different kind of
 * income, so no two traits can pay on the same money (one bonus per payment).
 */
import { GOODS, requiredCapital, startCost } from './data';
import { addNews, fmtMoney } from './news';
import type { Company, CommandResult, TraitId, WorldState } from './types';

export const MAX_TRAITS = 2;
export const SWAP_LEVEL = 10;
export const SWAP_FEE = 1_000_000;

export const TRAIT_RATES = {
  finance: 0.05,
  stockGain: 0.07,
  stockCover: 0.05,
  stockHoldDays: 7,
  rawProfit: 0.08,
  rawDiscount: 0.05,
  dealJobs: 0.05,
  dealSale: 0.1,
  dealHoldDays: 30,
  dealDividends: 0.1,
  opsBuild: 0.1,
  opsProd: 0.05,
};

export interface TraitDef {
  id: TraitId;
  icon: string;
  name: string;
  short: string;
  perks: string[];
  best: string;
}

const R = TRAIT_RATES;
const pc = (x: number) => `${Math.round(x * 100)}%`;

export const TRAITS: TraitDef[] = [
  {
    id: 'finance', icon: '💼', name: 'Finance', short: 'More profit from factories, shops and services',
    perks: [`+${pc(R.finance)} of each month's profit from companies that do not make raw materials`, 'Only profit from goods and services sold counts (not shares or deals)'],
    best: 'Factories, retail, tech and services',
  },
  {
    id: 'stocks', icon: '📈', name: 'Stock market', short: 'Bigger trading wins, softer trading losses',
    perks: [`+${pc(R.stockGain)} on your net share-trading gains each month`, `${pc(R.stockCover)} of a month's net trading loss paid back`, `Only shares held ${R.stockHoldDays}+ days count. Dividends do not.`],
    best: 'Trading on the stock market',
  },
  {
    id: 'raw', icon: '⛏️', name: 'Raw materials', short: 'Mines, farms and oil earn more and buy cheaper',
    perks: [`+${pc(R.rawProfit)} of the profit raw-material companies make selling to companies you do not own`, `Your companies buy raw materials ${pc(R.rawDiscount)} cheaper from outside sellers and imports`],
    best: 'Mining, farming and oil',
  },
  {
    id: 'deals', icon: '🤝', name: 'Deal-making', short: 'Contracts, company sales and dividends pay more',
    perks: [`+${pc(R.dealJobs)} on finished contracts and tenders`, `+${pc(R.dealSale)} of the gain when you sell a company held ${R.dealHoldDays}+ days`, `+${pc(R.dealDividends)} on dividends from shares and stakes in other companies`],
    best: 'Contracts, tenders and buying and selling companies',
  },
  {
    id: 'ops', icon: '🏭', name: 'Operations expert', short: 'Cheaper growth and more output per worker',
    perks: [`Upgrades and new companies cost ${pc(R.opsBuild)} less`, `Workers make ${pc(R.opsProd)} more`],
    best: 'Growing fast in any industry',
  },
];

export const traitDef = (id: TraitId) => TRAITS.find((t) => t.id === id)!;

export function traitsOf(w: WorldState): TraitId[] {
  return w.player.traits ?? [];
}

export function hasTrait(w: WorldState, id: TraitId): boolean {
  return traitsOf(w).includes(id);
}

/** Price multiplier for upgrades and new companies. */
export function buildMult(w: WorldState): number {
  return hasTrait(w, 'ops') ? 1 - R.opsBuild : 1;
}

/** What founding a company costs you (bank capital is never discounted). */
export function foundPrice(w: WorldState, good: Company['good']): number {
  const cap = requiredCapital(good);
  return Math.round(cap + (startCost(good) - cap) * buildMult(w));
}

/** Mark player companies with the operations perk (read by productivity and upgrade costs). */
export function syncTraitPerks(w: WorldState): void {
  const ops = hasTrait(w, 'ops');
  for (const c of w.companies) {
    if (c.isPlayer && ops) c.ops = true;
    else if (c.ops) delete c.ops;
  }
}

function ownShare(c: Company): number {
  return Math.max(0, 1 - (c.partners ?? []).reduce((s, p) => s + p.pct, 0));
}

function acc(w: WorldState) {
  return (w.play.traitAcc ??= { stockGain: 0, dividends: 0, dealGain: 0, jobBonus: 0, rawSaved: 0, opsSaved: 0 });
}

export function noteStockSale(w: WorldState, gain: number, heldDays: number): void {
  if (hasTrait(w, 'stocks') && heldDays >= R.stockHoldDays) acc(w).stockGain += gain;
}

export function noteDividend(w: WorldState, amount: number): void {
  if (hasTrait(w, 'deals') && amount > 0) acc(w).dividends += amount;
}

export function noteCompanySale(w: WorldState, c: Company, mine: number, basis: number): void {
  if (!hasTrait(w, 'deals') || w.day - c.founded < R.dealHoldDays) return;
  acc(w).dealGain += Math.max(0, mine - basis);
}

/** Contract and tender bonus, paid into the company when the job is done. Returns the bonus. */
export function jobBonus(w: WorldState, pay: number): number {
  if (!hasTrait(w, 'deals') || pay <= 0) return 0;
  const b = pay * R.dealJobs;
  acc(w).jobBonus += b;
  return b;
}

export function noteRawSaved(w: WorldState, saved: number): void {
  if (saved > 0) acc(w).rawSaved += saved;
}

export function noteOpsSaved(w: WorldState, saved: number): void {
  if (saved > 0 && hasTrait(w, 'ops')) acc(w).opsSaved += saved;
}

/** Monthly trait payouts. Returns the lines for the monthly report. */
export function monthlyTraits(w: WorldState): { label: string; amount: number }[] {
  const lines: { label: string; amount: number }[] = [];
  if (!traitsOf(w).length) return lines;
  const a = acc(w);
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  const pay = (label: string, amount: number) => {
    if (Math.abs(amount) < 1) return;
    w.player.cash += amount;
    lines.push({ label, amount });
  };
  if (hasTrait(w, 'finance')) {
    const base = mine.filter((c) => GOODS[c.good].tier !== 'raw').reduce((s, c) => s + Math.max(0, c.sum30.netIncome) * ownShare(c), 0);
    pay('💼 Finance: 5% of profit', base * R.finance);
  }
  if (hasTrait(w, 'raw')) {
    const base = mine.filter((c) => GOODS[c.good].tier === 'raw').reduce((s, c) => {
      const outside = c.sum30.sold > 0 ? Math.max(0, 1 - c.sum30.sisterSold / c.sum30.sold) : 0;
      return s + Math.max(0, c.sum30.netIncome) * outside * ownShare(c);
    }, 0);
    pay('⛏️ Raw materials: 8% of outside sales profit', base * R.rawProfit);
    if (a.rawSaved > 1) lines.push({ label: '⛏️ Saved on raw-material buying', amount: a.rawSaved });
  }
  if (hasTrait(w, 'stocks')) {
    if (a.stockGain > 0) pay('📈 Stock market: 7% of trading gains', a.stockGain * R.stockGain);
    else if (a.stockGain < 0) pay('📈 Stock market: 5% of trading loss back', -a.stockGain * R.stockCover);
  }
  if (hasTrait(w, 'deals')) {
    pay('🤝 Deal-making: 10% of company sale gains', a.dealGain * R.dealSale);
    pay('🤝 Deal-making: 10% of dividends', a.dividends * R.dealDividends);
    if (a.jobBonus > 1) lines.push({ label: '🤝 Deal-making: contract bonuses', amount: a.jobBonus });
  }
  if (hasTrait(w, 'ops') && a.opsSaved > 1) lines.push({ label: '🏭 Operations: saved on building', amount: a.opsSaved });
  w.play.traitAcc = { stockGain: 0, dividends: 0, dealGain: 0, jobBonus: 0, rawSaved: 0, opsSaved: 0 };
  return lines;
}

export function setTraits(w: WorldState, ids: TraitId[]): void {
  const valid = [...new Set(ids)].filter((id) => TRAITS.some((t) => t.id === id)).slice(0, MAX_TRAITS);
  w.player.traits = valid;
  syncTraitPerks(w);
}

/** Career change: once, from level 10, for a fee. */
export function swapTrait(w: WorldState, from: TraitId, to: TraitId): CommandResult {
  const t = traitsOf(w);
  if (w.player.level < SWAP_LEVEL) return { ok: false, message: `Career change unlocks at level ${SWAP_LEVEL}` };
  if (w.player.traitSwapped) return { ok: false, message: 'You already changed career once' };
  if (!t.includes(from) || t.includes(to) || !TRAITS.some((x) => x.id === to)) return { ok: false, message: 'Pick one trait you have and one you do not' };
  if (w.player.cash < SWAP_FEE) return { ok: false, message: `A career change costs ${fmtMoney(SWAP_FEE)}` };
  w.player.cash -= SWAP_FEE;
  w.player.traits = t.map((x) => (x === from ? to : x));
  w.player.traitSwapped = true;
  syncTraitPerks(w);
  addNews(w, 'player', `You move into ${traitDef(to).name.toLowerCase()}`, `You swap ${traitDef(from).name} for ${traitDef(to).name}.`, 'neutral');
  return { ok: true, message: `Now: ${w.player.traits.map((x) => traitDef(x).name).join(' + ')}` };
}
