/**
 * Bankruptcy auctions. When a company fails, the government clears its debts and sells the plant
 * to the highest bidder over two weeks. Rivals bid what the company is worth to them: more when it
 * is in their industry, feeds or buys from companies they own, or pushes them toward the top of
 * the market. Nobody (you included) may buy past 40% of a market. A late bid extends the auction
 * by two days, so there is always time to answer.
 */
import { GOODS } from './data';
import { clamp, refPrice, workersNeeded } from './company';
import { isBank, writeOff } from './banks';
import { grantLicence, grantPermit } from './licences';
import { delist } from './ownership';
import { remember } from './contracts';
import { MONOPOLY_SHARE } from './strategy';
import { addNews, fmtMoney, fmtPct } from './news';
import { banner } from './rewards';
import { next } from './rng';
import type { Auction, Company, CommandResult, Rival, WorldState } from './types';

export const AUCTION_DAYS = 14;
/** The government's lowest price, as a share of the plant's book value. */
export const RESERVE_SHARE = 0.5;
/** Part of the winning bid that stays in the company as working cash. */
export const WORKING_SHARE = 0.2;
/** A bid in the last days pushes the close back this far. */
const SOFT_CLOSE = 2;
/** Rivals do not buy into a market where demand is below this share of supply. */
const GLUT = 0.82;
/** A rival never puts more than this share of its cash into one auction. */
const TYCOON_BUDGET = 0.25;
const INVESTOR_BUDGET = 0.12;

const ok = (message: string): CommandResult => ({ ok: true, message });
const fail = (message: string): CommandResult => ({ ok: false, message });

export const openAuctions = (w: WorldState): Auction[] => w.play.auctions.filter((a) => a.status === 'open');
export const auctionCompany = (w: WorldState, a: Auction): Company | undefined => w.companies.find((c) => c.id === a.companyId);

/** The smallest bid that beats the current one. */
export function minBid(a: Auction): number {
  if (a.bid <= 0) return a.reserve;
  return Math.ceil((a.bid + Math.max(10_000, a.bid * 0.05)) / 1000) * 1000;
}

/**
 * Regulators block a purchase that takes a buyer who already sells this product past 40% of the
 * market. A newcomer may buy any single company, however big.
 */
export function blockedByRegulator(w: WorldState, c: Company, ownerId: string): boolean {
  const already = w.companies.some((x) => !x.bankrupt && x.good === c.good && x.id !== c.id && x.ownerId === ownerId);
  return already && shareAfter(w, c, ownerId) > MONOPOLY_SHARE;
}

/** Share of a market the owner would hold after buying this company (by capacity). */
export function shareAfter(w: WorldState, c: Company, ownerId: string): number {
  let mine = c.capacity;
  let all = c.capacity;
  for (const x of w.companies) {
    if (x.bankrupt || x.good !== c.good || x.id === c.id) continue;
    all += x.capacity;
    if (x.ownerId === ownerId) mine += x.capacity;
  }
  return all > 0 ? mine / all : 1;
}

/** Months of losses after which an AI company in a crowded market gives up. */
export const EXIT_MONTHS = 3;
/** Anywhere, after this many months of losses in a row. */
export const GIVE_UP_MONTHS = 6;
/** A market is crowded when demand is below this share of supply. */
const CROWDED = 0.95;

/** The company goes bust: staff go, the bank writes off what it can, and the government auctions it. */
export function failCompany(w: WorldState, c: Company, why: string): void {
  c.bankrupt = true;
  c.workers = 0;
  writeOff(w, c);
  addNews(w, c.isPlayer ? 'player' : 'business', `${c.name} files for bankruptcy`, why, 'bad', [c.id]);
  if (c.ticker) {
    const s = w.stocks.find((x) => x.ticker === c.ticker);
    if (s) s.newsImpact -= 0.3;
  }
  startAuction(w, c);
}

/**
 * Monthly: AI companies that keep losing money in a crowded market close down (at most one a
 * month, never one of the last two producers of a good). This is how oversupply clears.
 */
export function monthlyExits(w: WorldState): void {
  let worst: Company | null = null;
  for (const c of w.companies) {
    if (c.isPlayer || c.bankrupt || isBank(c) || w.day - c.founded < 365) continue;
    c.lossMonths = c.sum30.netIncome < 0 ? (c.lossMonths ?? 0) + 1 : 0;
    const crowded = (w.goods[c.good]?.tightness ?? 1) < CROWDED;
    if (c.lossMonths < (crowded ? EXIT_MONTHS : GIVE_UP_MONTHS)) continue;
    if (w.companies.filter((x) => x.good === c.good && !x.bankrupt).length <= 2) continue;
    if (!worst || c.sum30.netIncome < worst.sum30.netIncome) worst = c;
  }
  if (worst) failCompany(w, worst, `${worst.name} lost money for ${worst.lossMonths} months in a row making ${GOODS[worst.good].name.toLowerCase()} and has given up.`);
}

/**
 * What the plant is worth to a buyer: its book value, but never more than about 0.6x a year of
 * sales at full output (big old plants carry book values no buyer would pay).
 */
export function plantValue(w: WorldState, c: Company): number {
  const yearSales = c.capacity * refPrice(w, c.good) * 365;
  return Math.max(10_000, Math.min(c.assets, yearSales * 0.6));
}

export function startAuction(w: WorldState, c: Company): void {
  if (isBank(c) || w.play.auctions.some((a) => a.companyId === c.id && a.status === 'open')) return;
  const reserve = Math.max(50_000, Math.round((plantValue(w, c) * RESERVE_SHARE) / 1000) * 1000);
  // The government takes over what is left of the debts
  w.macro.govDebt += Math.max(0, c.debt);
  c.debt = 0;
  const a: Auction = { id: `au${++w.seq}`, companyId: c.id, startDay: w.day, endDay: w.day + AUCTION_DAYS, reserve, bid: 0, bidderId: null, bids: [], status: 'open', prevOwner: c.ownerId };
  w.play.auctions.push(a);
  addNews(w, 'business', `Government auctions ${c.name}`,
    `The bankrupt ${GOODS[c.good].name.toLowerCase()} maker (level ${c.level}) goes to the highest bidder in ${AUCTION_DAYS} days. Debts are cleared; bids start at ${fmtMoney(reserve)}.`, 'neutral', [c.id]);
  banner(w, '🔨 Bankruptcy auction', `${c.name} is for sale from ${fmtMoney(reserve)}. See Strategy → Auctions.`, 0, 'gold');
}

/** What a rival thinks the company is worth to it, and the most it will pay (0 = not interested). */
export function rivalValuation(w: WorldState, r: Rival, c: Company): { value: number; max: number; why: string[] } {
  const why: string[] = [];
  if (blockedByRegulator(w, c, r.id)) return { value: 0, max: 0, why: ['would pass 40% of the market'] };
  const p = r.personality;
  let fit = 0;
  if (r.focus.includes(c.industry)) { fit += 0.3; why.push('its industry'); }
  const owned = w.companies.filter((x) => x.ownerId === r.id && !x.bankrupt);
  const def = GOODS[c.good];
  if (owned.some((x) => def.inputs.some((i) => i.good === x.good) || GOODS[x.good].inputs.some((i) => i.good === c.good))) {
    fit += 0.25; why.push('fits its supply chain');
  }
  const share = shareAfter(w, c, r.id);
  if (share > 0.15) { fit += 0.25 * p.ambition; why.push(`would own ${fmtPct(share, 0)} of the market`); }
  const m = w.goods[c.good];
  if (m && m.tightness > 1.05) { fit += 0.15; why.push('a short market'); }
  fit += (p.aggression - 0.5) * 0.2 + (p.risk - 0.5) * 0.1;
  if (fit < 0.1 && !r.tycoon) return { value: 0, max: 0, why: ['no reason to buy'] };
  // A crowded market is worth less: the plant would fight for customers
  const crowd = clamp(m?.tightness ?? 1, 0.6, 1.15);
  // A plant that already failed under a new owner is a money pit
  if (w.play.auctions.some((a) => a.companyId === c.id && a.status === 'sold' && w.day - a.endDay < 1095)) return { value: 0, max: 0, why: ['it failed again after its last sale'] };
  // Nobody buys more capacity into a glut: the plant is scrapped and the market recovers
  if (crowd < GLUT) return { value: 0, max: 0, why: ['the market already has too much supply'] };
  const value = plantValue(w, c) * 0.8 * (1 + fit) * crowd;
  const budget = r.cash * (r.tycoon ? TYCOON_BUDGET : INVESTOR_BUDGET);
  return { value, max: Math.max(0, Math.min(value, budget)), why };
}

function bidderName(w: WorldState, id: string | null): string {
  if (!id) return 'nobody';
  if (id === 'player') return 'you';
  return w.rivals.find((r) => r.id === id)?.name ?? 'a buyer';
}

function refundPlayer(w: WorldState, a: Auction): void {
  if (a.bidderId === 'player' && a.bid > 0) w.player.cash += a.bid;
}

function place(w: WorldState, a: Auction, bidderId: string, amount: number): void {
  refundPlayer(w, a);
  const wasPlayer = a.bidderId === 'player';
  a.bid = amount;
  a.bidderId = bidderId;
  a.bids.push({ day: w.day, bidderId, amount });
  if (a.bids.length > 40) a.bids.shift();
  if (a.endDay - w.day < SOFT_CLOSE) a.endDay = w.day + SOFT_CLOSE;
  if (wasPlayer && bidderId !== 'player') {
    const c = auctionCompany(w, a);
    addNews(w, 'player', `Outbid for ${c?.name ?? 'the company'}`, `${bidderName(w, bidderId)} bids ${fmtMoney(amount)}. Your money is back in your account.`, 'bad', c ? [c.id] : []);
  }
}

/** Why the player may not bid (null = may bid). */
export function playerBlock(w: WorldState, a: Auction): string | null {
  const c = auctionCompany(w, a);
  if (!c || a.status !== 'open') return 'This auction is closed';
  if (a.prevOwner === 'player') return 'You cannot buy back a company you took bankrupt';
  if (blockedByRegulator(w, c, 'player')) return 'Regulators would block it: with your other companies you would sell more than 40% of this market';
  return null;
}

export function bidAuction(w: WorldState, auctionId: string, amount: number): CommandResult {
  const a = w.play.auctions.find((x) => x.id === auctionId);
  if (!a) return fail('Unknown auction');
  const block = playerBlock(w, a);
  if (block) return fail(block);
  if (a.bidderId === 'player') return fail('You already have the top bid');
  const min = minBid(a);
  amount = Math.round(amount);
  if (!(amount >= min)) return fail(`The lowest bid is ${fmtMoney(min)}`);
  if (w.player.cash < amount) return fail(`You have ${fmtMoney(w.player.cash)}: the bid is held until the auction ends`);
  w.player.cash -= amount;
  place(w, a, 'player', amount);
  return ok(`You lead with ${fmtMoney(amount)}. The money is held until the auction ends (refunded if outbid).`);
}

/** Rivals raise when the company is worth more to them than the current bid. */
function rivalBids(w: WorldState, a: Auction, c: Company): void {
  const min = minBid(a);
  let best: { r: Rival; max: number } | null = null;
  for (const r of w.rivals) {
    if (r.id === a.bidderId || r.id === a.prevOwner) continue;
    const { max } = rivalValuation(w, r, c);
    if (max < min) continue;
    if (!best || max > best.max) best = { r, max };
  }
  if (!best) return;
  // Not every day: rivals wait and watch, the eager ones less
  if (next(w.rng) > 0.3 + best.r.personality.aggression * 0.4) return;
  // Jump part of the way to their limit, so bidding wars do not take forever
  const jump = min + (best.max - min) * (0.15 + next(w.rng) * 0.25);
  place(w, a, best.r.id, Math.min(best.max, Math.ceil(jump / 1000) * 1000));
}

function revive(w: WorldState, c: Company, ownerId: string, price: number): void {
  delist(w, c);
  const player = ownerId === 'player';
  c.bankrupt = false;
  c.lowCashDays = 0;
  c.debt = 0;
  c.cash = price * WORKING_SHARE;
  c.ownerId = ownerId;
  c.isPlayer = player;
  delete c.partners;
  delete c.damage;
  delete c.loanLog;
  delete c.bankId;
  c.strikeUntil = 0;
  c.priceMult = 1;
  c.morale = 0.6;
  c.workers = workersNeeded(c);
  c.inventory = 0;
  c.lossMonths = 0;
  c.founded = w.day; // a fresh start: new owners get a year before they would give up
  c.automation = player
    ? { inventoryDays: 0.5, autoRecruit: true, autoUpgrade: false, dividendPct: 50, minCash: 5_000, supplyDays: 4 }
    : { inventoryDays: 0.6, autoRecruit: true, autoUpgrade: false, dividendPct: 30, minCash: 0, supplyDays: 4 };
  if (player) { grantLicence(w, c.industry); grantPermit(w, c.good); c.insured = false; c.reserves = 1; }
  w.contracts = w.contracts.filter((k) => k.sellerId !== c.id && k.buyerId !== c.id);
}

function close(w: WorldState, a: Auction, c: Company): void {
  if (a.bid > 0 && a.bidderId) {
    const winner = a.bidderId;
    const rv = w.rivals.find((r) => r.id === winner);
    if (rv) rv.cash -= a.bid; // the player paid when bidding
    w.macro.govDebt = Math.max(0, w.macro.govDebt - a.bid * (1 - WORKING_SHARE));
    revive(w, c, winner, a.bid);
    a.status = 'sold';
    if (winner === 'player') {
      addNews(w, 'player', `You win the auction for ${c.name}`, `${fmtMoney(a.bid)}: ${fmtMoney(a.bid * WORKING_SHARE)} stays in the company as working cash. Its debts are gone and the staff are rehired.`, 'good', [c.id]);
      banner(w, '🔨 Auction won!', `${c.name} is yours for ${fmtMoney(a.bid)}.`, 0, 'good');
    } else {
      addNews(w, 'business', `${bidderName(w, winner)} buys ${c.name} at auction`, `The winning bid was ${fmtMoney(a.bid)} after ${a.bids.length} bids.`, 'neutral', [c.id]);
      if (rv && a.bids.some((b) => b.bidderId === 'player')) remember(rv, w, -3, `Beat you at the ${c.name} auction.`);
    }
    return;
  }
  if (!a.relisted) {
    a.relisted = true;
    a.reserve = Math.max(25_000, Math.round((a.reserve * 0.6) / 1000) * 1000);
    a.endDay = w.day + 10;
    addNews(w, 'business', `No buyers for ${c.name}`, `The government cuts the price to ${fmtMoney(a.reserve)} and tries again for 10 days.`, 'neutral', [c.id]);
    return;
  }
  a.status = 'scrapped';
  addNews(w, 'business', `${c.name} is scrapped`, 'Nobody wanted the plant, even at a discount. It is sold off for parts.', 'neutral', [c.id]);
}

export function dailyAuctions(w: WorldState): void {
  for (const a of w.play.auctions) {
    if (a.status !== 'open') continue;
    const c = auctionCompany(w, a);
    if (!c || !c.bankrupt) { refundPlayer(w, a); a.status = 'scrapped'; continue; }
    if (w.day < a.endDay) rivalBids(w, a, c);
    else close(w, a, c);
  }
  // Keep the list short
  if (w.play.auctions.length > 30) {
    const keep = w.play.auctions.filter((a) => a.status === 'open' || w.day - a.endDay < 120);
    w.play.auctions = keep.slice(-30);
  }
}
