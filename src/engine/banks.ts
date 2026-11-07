/**
 * Business banks. Every non-bank company borrows from one of the banking companies, and the
 * interest it pays becomes that bank's income. Banks fund their loans with deposits that cost
 * 70% of the policy rate, so they earn the loan margin plus a slice of the rate. A bank's owner
 * can give their other companies a discount on the margin, and a player bank sets its own price.
 */
import { clamp, loanSpread } from './company';
import { chance, range } from './rng';
import { addNews, fmtMoney, fmtPct } from './news';
import type { Company, WorldState } from './types';

/** Deposits that fund loans cost this share of the policy rate. */
export const FUNDING_SHARE = 0.7;
/** Share of a bankrupt borrower's debt the bank loses. */
export const WRITE_OFF = 0.6;
/** Smallest loan margin multiplier a bank may set, and the largest. */
export const MIN_RATE_MULT = 0.5;
export const MAX_RATE_MULT = 1.6;

export const isBank = (c: Company): boolean => c.good === 'banking';

export function bankList(w: WorldState): Company[] {
  return w.companies.filter((c) => isBank(c) && !c.bankrupt);
}

/** Same owner, so the bank's sister discount applies (the public is not one owner). */
export function sameOwner(a: Company, b: Company): boolean {
  if (a.isPlayer || b.isPlayer) return a.isPlayer && b.isPlayer;
  return a.ownerId === b.ownerId && a.ownerId !== 'public';
}

/** Total loans each bank has out, by bank id. */
export function loanBooks(w: WorldState): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of w.companies) {
    if (c.bankrupt || !c.bankId || c.debt <= 0) continue;
    m.set(c.bankId, (m.get(c.bankId) ?? 0) + c.debt);
  }
  return m;
}

/** How much a bank can lend before it has to charge more: about 6x its own capital. */
export function lendingCapacity(bank: Company): number {
  return Math.max(2_000_000, (Math.max(0, bank.cash - bank.debt) + bank.assets) * 6);
}

/**
 * The fuller a bank's loan book, the more it charges: 0.85x the normal margin when empty,
 * 1.15x at capacity, and steeply more past it. This spreads borrowers across banks.
 */
export function loadMult(book: number, cap: number): number {
  const used = book / Math.max(1, cap);
  return 0.85 + 0.3 * Math.min(used, 1) + Math.max(0, used - 1) * 2;
}

/** Multiplier this bank applies to the borrower's normal loan margin. */
export function marginMult(bank: Company, c: Company, book: number): number {
  const sister = sameOwner(bank, c) ? 1 - clamp(bank.sisterDiscount, 0, 0.5) : 1;
  return clamp(bank.loanRateMult ?? 1, MIN_RATE_MULT, MAX_RATE_MULT) * loadMult(book, lendingCapacity(bank)) * sister;
}

/** Yearly interest rate a borrower would pay at this bank (moving there adds its loan to the book). */
export function quoteRate(w: WorldState, c: Company, bank: Company, books: Map<string, number> = loanBooks(w)): number {
  const book = (books.get(bank.id) ?? 0) + (c.bankId === bank.id ? 0 : Math.max(0, c.debt));
  return w.macro.rate + loanSpread(c) * marginMult(bank, c, book) + riskPremium(c);
}

/** Banks charge shaky borrowers for the extra losses they expect (healthy ones pay nothing extra). */
export function riskPremium(c: Company): number {
  return Math.max(0, defaultRisk(c) - 0.02) * WRITE_OFF;
}

export function lenderOf(w: WorldState, c: Company): Company | undefined {
  if (!c.bankId) return undefined;
  const b = w.companies.find((x) => x.id === c.bankId);
  return b && !b.bankrupt ? b : undefined;
}

/** Yearly rate a company pays today. Banks themselves borrow from the central bank. */
export function loanRate(w: WorldState, c: Company, books?: Map<string, number>): number {
  const b = lenderOf(w, c);
  return b ? quoteRate(w, c, b, books) : w.macro.rate + loanSpread(c);
}

/** Hostile owners keep their money away from each other. */
export function willLend(w: WorldState, bank: Company, c: Company): boolean {
  if (bank.id === c.id || isBank(c)) return false;
  if (bank.isPlayer && !c.isPlayer) {
    const rv = w.rivals.find((r) => r.id === c.ownerId);
    return !rv || rv.relation >= -30;
  }
  if (!bank.isPlayer && c.isPlayer) {
    const rv = w.rivals.find((r) => r.id === bank.ownerId);
    return !rv || rv.relation >= -60;
  }
  return true;
}

export function bankOffers(w: WorldState, c: Company, books: Map<string, number> = loanBooks(w)): { bank: Company; rate: number; ok: boolean }[] {
  return bankList(w)
    .filter((b) => b.id !== c.id)
    .map((b) => ({ bank: b, rate: quoteRate(w, c, b, books), ok: willLend(w, b, c) }))
    .sort((a, b) => a.rate - b.rate);
}

export function bestBank(w: WorldState, c: Company, books?: Map<string, number>): Company | undefined {
  return bankOffers(w, c, books).find((o) => o.ok)?.bank;
}

/** Give every borrower a lender (new companies, old saves, or after a bank fails). */
export function ensureBanks(w: WorldState): void {
  let books: Map<string, number> | undefined;
  for (const c of w.companies) {
    if (c.bankrupt || isBank(c)) continue;
    const cur = lenderOf(w, c);
    if (cur && willLend(w, cur, c)) continue;
    books ??= loanBooks(w);
    const b = bestBank(w, c, books);
    if (b) {
      if (c.bankId) books.set(c.bankId, (books.get(c.bankId) ?? 0) - c.debt);
      c.bankId = b.id;
      books.set(b.id, (books.get(b.id) ?? 0) + c.debt);
    } else c.bankId = undefined;
  }
}

/** Monthly: AI borrowers move to a clearly cheaper bank. Your own companies stay where you put them. */
export function rebalanceLoans(w: WorldState): void {
  const books = loanBooks(w);
  const won = new Map<string, string[]>();
  for (const c of w.companies) {
    if (c.isPlayer || c.bankrupt || isBank(c) || c.debt <= 0) continue;
    const cur = lenderOf(w, c);
    const best = bestBank(w, c, books);
    if (!best || best.id === cur?.id) continue;
    const now = cur ? quoteRate(w, c, cur, books) : Infinity;
    if (quoteRate(w, c, best, books) < now - 0.004) {
      if (cur) books.set(cur.id, (books.get(cur.id) ?? 0) - c.debt);
      books.set(best.id, (books.get(best.id) ?? 0) + c.debt);
      c.bankId = best.id;
      if (best.isPlayer) won.set(best.id, [...(won.get(best.id) ?? []), c.name]);
    }
  }
  for (const [id, names] of won) {
    const b = w.companies.find((x) => x.id === id)!;
    addNews(w, 'player', `${names.length === 1 ? names[0] : `${names.length} companies`} move their loans to ${b.name}`,
      `${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and others' : ''} found ${b.name} the cheapest lender.`, 'good', [b.id]);
  }
}

/**
 * Yearly chance a borrower fails, from its health: heavy debt, losses and running out of
 * cash all raise it. A healthy borrower is about 1%, one about to go under is up to 60%.
 */
export function defaultRisk(c: Company): number {
  const annualRev = Math.max(1, c.sum30.revenue * 12.17);
  const lev = clamp(c.debt / annualRev, 0, 2);
  const losing = c.sum30.netIncome < 0 ? clamp(-c.sum30.netIncome / Math.max(1, c.sum30.revenue), 0, 1) : 0;
  const stress = clamp(c.lowCashDays / 45, 0, 1);
  return clamp(0.008 + 0.04 * lev + 0.3 * losing + 0.45 * stress, 0.008, 0.6);
}

/** Losses a bank expects on a loan over the next year. */
export function expectedLoss(c: Company): number {
  return Math.max(0, c.debt) * defaultRisk(c) * WRITE_OFF;
}

/** Banks build their bad-loan reserve toward a year of expected losses, a twentieth of the gap a day. */
export const RESERVE_SPEED = 0.05;

/** When a borrower goes bankrupt its bank loses most of the loan, first from its reserve. */
export function writeOff(w: WorldState, c: Company): void {
  const b = lenderOf(w, c);
  if (!b || c.debt <= 0) return;
  const loss = c.debt * WRITE_OFF;
  const fromReserve = Math.min(loss, b.loanReserve ?? 0);
  b.loanReserve = (b.loanReserve ?? 0) - fromReserve;
  b.cash -= loss - fromReserve;
  c.debt -= loss;
  addNews(w, b.isPlayer ? 'player' : 'business', `${b.name} writes off ${fmtMoney(loss)} of loans`,
    `${c.name} went bankrupt owing ${fmtMoney(c.debt + loss)}. The bank expects to recover only ${fmtPct(1 - WRITE_OFF, 0)}.`, 'bad', [b.id, c.id]);
  recapitalize(w, b);
}

/** Downturns make borrowers fail more often: up to 4x in a deep recession with high unemployment. */
export function creditCycle(w: WorldState): number {
  const m = w.macro;
  return clamp(1 + Math.max(0, -m.growth) * 25 + Math.max(0, m.unemployment - m.naturalUnemployment) * 12, 1, 4);
}

/**
 * Monthly credit events: a struggling AI borrower may restructure, and its bank writes off part of
 * the loan (the company carries on with less debt). Your own companies can still go fully bankrupt.
 */
export function creditEvents(w: WorldState): void {
  const cycle = creditCycle(w);
  for (const c of w.companies) {
    if (c.isPlayer || c.bankrupt || isBank(c) || c.debt <= 0) continue;
    const b = lenderOf(w, c);
    if (!b || !chance(w.rng, (defaultRisk(c) * cycle) / 12)) continue;
    // Healthy companies that stumble renegotiate a small cut; ones in real trouble repay much less
    const distressed = defaultRisk(c) > 0.05;
    const loss = c.debt * (distressed ? range(w.rng, 0.25, 0.6) : range(w.rng, 0.05, 0.15));
    const fromReserve = Math.min(loss, b.loanReserve ?? 0);
    b.loanReserve = (b.loanReserve ?? 0) - fromReserve;
    b.cash -= loss - fromReserve;
    c.debt -= loss;
    const s = c.ticker ? w.stocks.find((x) => x.ticker === c.ticker) : undefined;
    if (s) s.newsImpact -= 0.06;
    addNews(w, b.isPlayer ? 'player' : 'business', `${c.name} restructures its debt: ${b.name} loses ${fmtMoney(loss)}`,
      `${c.name} could not keep up with its loans${cycle > 1.5 ? ' as the economy slowed' : ''}. ${b.name} covered ${fmtMoney(fromReserve)} from its bad-loan reserve${loss > fromReserve ? ` and ${fmtMoney(loss - fromReserve)} from its cash` : ''}.`,
      'bad', [b.id, c.id]);
    recapitalize(w, b);
  }
}

/**
 * An AI bank whose losses ate its cash raises new capital from its shareholders: new shares sold at a
 * discount (the share price falls), or its owner puts money in. Your own bank gets no rescue:
 * put money in yourself (Financials → Invest) or it may go bankrupt.
 */
export function recapitalize(w: WorldState, b: Company): void {
  if (b.isPlayer || b.bankrupt || b.cash >= 0) return;
  const need = -b.cash + Math.max(b.automation.minCash, (b.sum30.opex + b.sum30.cogs) / 30 * 30);
  const s = b.ticker ? w.stocks.find((x) => x.ticker === b.ticker) : undefined;
  if (s) {
    const capBefore = w.stocks.reduce((t, x) => t + x.price * x.shares, 0);
    const px = s.price * 0.8;
    const added = need / px;
    s.price = (s.price * s.shares + need) / (s.shares + added);
    s.shares += added;
    s.newsImpact -= 0.04;
    const capAfter = w.stocks.reduce((t, x) => t + x.price * x.shares, 0);
    if (w.indexBase && capBefore > 0) w.indexBase *= capAfter / capBefore; // new shares don't move the index
  } else {
    const rv = w.rivals.find((r) => r.id === b.ownerId);
    if (rv) rv.cash -= need;
  }
  b.cash += need;
  addNews(w, 'business', `${b.name} raises ${fmtMoney(need)} after loan losses`,
    s ? `The bank sold new shares at a discount to rebuild its capital. Existing shareholders own a smaller slice.` : `Its owner put in fresh money to keep it lending.`, 'bad', [b.id]);
}

/** What a bank's lending looks like today. */
export function bankStats(w: WorldState, bank: Company, books: Map<string, number> = loanBooks(w)) {
  const borrowers = w.companies.filter((c) => !c.bankrupt && c.bankId === bank.id);
  const book = books.get(bank.id) ?? 0;
  const cap = lendingCapacity(bank);
  const income = borrowers.reduce((s, c) => s + c.debt * quoteRate(w, c, bank, books), 0); // per year
  const funding = book * w.macro.rate * FUNDING_SHARE;
  const lossYear = borrowers.reduce((s, c) => s + expectedLoss(c), 0);
  return { borrowers, book, cap, used: book / cap, incomeYear: income, fundingYear: funding, lossYear, reserve: bank.loanReserve ?? 0, netYear: income - funding - lossYear };
}
