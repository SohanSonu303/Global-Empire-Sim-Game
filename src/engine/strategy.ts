/**
 * Business strategies: the contracts board, government tenders, brand campaigns, price wars,
 * the monopoly bonus (and antitrust probes), insider tips and joint ventures.
 */
import { GOODS, GOOD_IDS, fixedAt, startCost } from './data';
import { clamp, companyValue, refPrice, unitEconomics } from './company';
import { remember } from './contracts';
import { stockByTicker } from './market';
import { addNews, fmtMoney, fmtPct, fmtPrice } from './news';
import { chance, int, next, pick, range } from './rng';
import { banner, unlocked } from './rewards';
import { jobBonus } from './traits';
import { execSkill } from './execs';
import { newCompany, seedInputs } from './world';
import type { CampaignSize, CommandResult, Company, GoodId, Job, PendingEvent, PriceWar, Rival, Tender, WorldState } from './types';

const ok = (message: string): CommandResult => ({ ok: true, message });
const fail = (message: string): CommandResult => ({ ok: false, message });

const mine = (w: WorldState) => w.companies.filter((c) => c.isPlayer && !c.bankrupt);
const rivalOf = (w: WorldState, c: Company): Rival | undefined => w.rivals.find((r) => r.id === c.ownerId);
const unitName = (g: GoodId) => `${GOODS[g].unit} of ${GOODS[g].name.toLowerCase()}`;

// ======================= contracts board =======================

export const BOARD_SIZE = 4;
/** Most contracts (incl. won tenders) any company may run at once */
export const MAX_JOBS = 6;
/** Share of a plant's daily output that contracts may book; the rest stays for the open market */
export const JOB_CAP_SHARE = 0.7;

/** Contracts one company may run at once: 2 at first, more as the plant grows (level 3: 3, level 5: 4 ... up to 6) */
export function maxJobs(c: Company): number {
  return clamp(1 + Math.ceil(c.level / 2), 2, MAX_JOBS);
}

export function activeJobs(w: WorldState, companyId: string): number {
  return w.play.jobs.filter((j) => j.status === 'active' && j.companyId === companyId).length;
}

/** Units per day a company has promised to contracts and tenders */
export function bookedPerDay(w: WorldState, companyId: string): number {
  return w.play.jobs.filter((j) => j.status === 'active' && j.companyId === companyId).reduce((s, j) => s + j.qty / Math.max(1, j.days), 0);
}

/** Why a company can't take on another contract needing `perDay` units a day, or null if it can */
export function jobRoom(w: WorldState, c: Company, perDay: number): string | null {
  const max = maxJobs(c);
  if (activeJobs(w, c.id) >= max) return `${c.name} already has ${max} contracts running${max < MAX_JOBS ? ' (upgrade the plant for more)' : ''}`;
  const booked = bookedPerDay(w, c.id);
  const share = c.split ? Math.min(JOB_CAP_SHARE, c.split.contracts) : JOB_CAP_SHARE;
  if (booked + perDay > c.capacity * share + 1e-6) {
    return c.split && c.split.contracts < JOB_CAP_SHARE
      ? `That would book ${fmtPct((booked + perDay) / c.capacity, 0)} of ${c.name}'s output, but your output split gives contracts ${fmtPct(c.split.contracts, 0)}. Raise it on the company's Overview.`
      : `That would book ${fmtPct((booked + perDay) / c.capacity, 0)} of ${c.name}'s output; contracts can take at most ${fmtPct(JOB_CAP_SHARE, 0)}`;
  }
  return null;
}

function playerCap(w: WorldState, g: GoodId): number {
  return mine(w).filter((c) => c.good === g).reduce((s, c) => s + c.capacity, 0);
}

function makeJob(w: WorldState): Job | null {
  const r = w.rng;
  const made = [...new Set(mine(w).map((c) => c.good))];
  const pool = made.length && next(r) < 0.7 ? made : GOOD_IDS.filter((g) => g !== 'banking');
  const g = pick(r, pool);
  if (w.play.jobs.some((j) => j.good === g && j.status === 'offer')) return null;
  const users = w.companies.filter((c) => !c.isPlayer && !c.bankrupt && GOODS[c.good].inputs.some((i) => i.good === g) && rivalOf(w, c));
  const gov = GOODS[g].tier === 'product' || !users.length || next(r) < 0.3;
  const buyer = gov ? null : pick(r, users);
  const days = pick(r, [30, 45, 60, 90]);
  const cap = playerCap(w, g) || GOODS[g].baseCapacity;
  const qty = Math.max(10, Math.round((cap * days * range(r, 0.12, 0.35)) / 10) * 10);
  // A guaranteed buyer is the main draw: most pay about the market price, rush jobs a little more
  const rush = days === 30 ? 0.06 : days === 45 ? 0.03 : 0;
  const pay = qty * refPrice(w, g) * (range(r, 0.97, 1.05) + rush) * (1 + 0.04 * Math.min(1.4, execSkill(w, 'sales'))); // a head of sales negotiates
  return {
    id: `j${++w.seq}`, source: gov ? 'gov' : 'rival', buyerName: buyer ? buyer.name : pick(r, GOV_BUYERS[g] ?? ['Government of Astoria']),
    buyerId: buyer?.id, rivalId: buyer?.ownerId, good: g, qty, delivered: 0, pay, bonus: pay * 0.05, penalty: pay * 0.25,
    days, deadline: 0, startDay: 0, status: 'offer', offerUntil: w.day + 8,
  };
}

export function acceptJob(w: WorldState, jobId: string, companyId: string): CommandResult {
  if (!unlocked(w, 'contracts')) return fail('The contracts board unlocks at level 2');
  const j = w.play.jobs.find((x) => x.id === jobId && x.status === 'offer');
  const c = mine(w).find((x) => x.id === companyId);
  if (!j) return fail('That offer is gone');
  if (!c || c.good !== j.good) return fail(`You need a company that makes ${GOODS[j.good].name.toLowerCase()}`);
  const full = jobRoom(w, c, j.qty / j.days);
  if (full) return fail(full);
  j.status = 'active';
  j.companyId = c.id;
  j.startDay = w.day;
  j.deadline = w.day + j.days;
  addNews(w, 'player', `${c.name} signs a contract with ${j.buyerName}`, `${j.qty.toLocaleString()} ${unitName(j.good)} within ${j.days} days for ${fmtMoney(j.pay)}.`, 'good', [c.id]);
  return ok(`Contract signed: deliver ${j.qty.toLocaleString()} ${GOODS[j.good].unit} by day ${j.deadline}`);
}

/** How much a job wants delivered today: enough to finish a little early. */
export function jobPace(w: WorldState, j: Job): number {
  const left = j.qty - j.delivered;
  return Math.max(0, Math.min(left, Math.max((j.qty / j.days) * 1.2, (left / Math.max(1, j.deadline - w.day + 1)) * 1.5)));
}

/** Book a delivery: the company is paid per unit; a rival buyer pays for and receives the goods. */
export function bookDelivery(w: WorldState, j: Job, qty: number): number {
  if (qty <= 0) return 0;
  const unit = j.pay / j.qty;
  const due = unit * (1 - (j.advance ?? 0)); // the advance already paid part of each unit
  j.delivered += qty;
  const buyer = j.buyerId ? w.companies.find((c) => c.id === j.buyerId && !c.bankrupt) : undefined;
  if (buyer) {
    buyer.cash -= qty * due;
    const cur = buyer.inputs[j.good] ?? { qty: 0, cost: unit };
    buyer.inputs[j.good] = { qty: cur.qty + qty, cost: (cur.qty * cur.cost + qty * unit) / (cur.qty + qty) };
  }
  return qty * due;
}

function dailyJobs(w: WorldState): void {
  const p = w.play;
  for (const j of p.jobs) {
    if (j.status !== 'active') continue;
    const c = w.companies.find((x) => x.id === j.companyId);
    if (j.delivered >= j.qty - 1e-6) {
      j.status = 'done';
      const tr = (w.play.track ??= { done: 0, failed: 0 });
      tr.done += 1;
      j.early = w.day <= j.startDay + j.days * 0.75;
      const extra = (j.early ? j.bonus : 0) + jobBonus(w, j.pay);
      if (c) c.cash += extra;
      const rv = w.rivals.find((r) => r.id === j.rivalId);
      remember(rv, w, 6, `${c?.name ?? 'You'} delivered a contract on time.`);
      const xp = 60 + Math.round(Math.min(200, j.pay / 25_000));
      addXpLater(w, xp);
      banner(w, j.early ? 'Contract done early!' : 'Contract done!', `${j.buyerName}: ${fmtMoney(j.pay + extra)}${j.early ? ` incl. ${fmtMoney(extra)} bonus` : ''}`, xp, 'good');
    } else if (w.day > j.deadline || !c || c.bankrupt) {
      j.status = 'failed';
      const tr = (w.play.track ??= { done: 0, failed: 0 });
      tr.failed += 1;
      const share = 1 - j.delivered / j.qty;
      // a tender's advance on undelivered units goes back to the buyer
      const fine = (j.source === 'tender' ? j.pay * 0.25 * share : j.penalty * Math.max(0.25, share)) + j.pay * (j.advance ?? 0) * share;
      if (c) c.cash -= fine;
      remember(w.rivals.find((r) => r.id === j.rivalId), w, -8, `${c?.name ?? 'You'} missed a delivery deadline.`);
      banner(w, 'Contract missed', `${j.buyerName}: penalty ${fmtMoney(fine)}`, 0, 'bad');
    }
  }
  // Offers expire; keep the board topped up
  p.jobs = p.jobs.filter((j) => !(j.status === 'offer' && j.offerUntil < w.day));
  p.jobs = p.jobs.filter((j) => j.status === 'offer' || j.status === 'active' || w.day - j.deadline < 60);
  if (p.jobs.length > 30) p.jobs = p.jobs.slice(-30);
  if (unlocked(w, 'contracts') && w.day % 3 === 0 && p.jobs.filter((j) => j.status === 'offer').length < BOARD_SIZE) {
    const j = makeJob(w);
    if (j) p.jobs.push(j);
  }
}

// XP for things that finish inside a tick: collected here and paid by progress.ts
function addXpLater(w: WorldState, xp: number): void {
  w.play.xpOwed = (w.play.xpOwed ?? 0) + xp;
}

// ======================= government tenders =======================

const GOV_BUYERS: Partial<Record<GoodId, string[]>> = {
  medicine: ['City Hospital', 'National Health Service'],
  electricity: ['Astoria Metro', 'Street Lighting Board'],
  food: ['School Meals Program', 'Army Supply Office'],
  steel: ['National Rail', 'Bridge Authority'],
  cars: ['Police Fleet', 'Postal Service'],
  laptops: ['Ministry of Education'],
  phones: ['Emergency Services'],
  chips: ['Defence Research Agency'],
  telecom: ['Public Wi-Fi Program'],
  freight: ['Postal Service'],
  furniture: ['Government Offices'],
  clothing: ['Army Uniform Office'],
  glass: ['Housing Program'],
  timber: ['Housing Program'],
  software: ['Tax Office'],
  clinics: ['Public Health Scheme'],
  appliances: ['Public Housing Agency'],
  plastics: ['Water Board'],
  chemicals: ['Water Board'],
  crude_oil: ['Strategic Reserve'],
  defense: ['Ministry of Defence', 'Army Procurement Office', 'Navy Command'],
  space: ['National Space Agency', 'Weather Satellite Office'],
  construction: ['Roads Agency', 'Public Housing Agency', 'Schools Building Fund'],
  cement: ['Roads Agency', 'Dam Authority'],
  aluminium: ['National Rail'],
  water: ['City Parks Department'],
  natural_gas: ['Strategic Reserve'],
  ai: ['Tax Office', 'Ministry of Health'],
  robots: ['Postal Service'],
  batteries: ['Grid Storage Program'],
  copper: ['Grid Upgrade Program'],
  airlines: ['Diplomatic Travel Office'],
  hospitals: ['National Health Service'],
  wellness: ['Veterans Care Service'],
  real_estate: ['Government Offices'],
};

/** Tenders run this long and stay open this many days */
export const TENDER_MONTHS: [number, number] = [6, 12];
export const TENDER_OPEN_DAYS = 14;
/** Rounds before the buyer closes the bidding */
export const TENDER_ROUNDS = 10;
/** Each 0.1 of quality is worth 2.5% of the price */
const QUALITY_WEIGHT = 0.25;
/** Share of a won tender the buyer pays up front */
export const TENDER_ADVANCE = 0.15;
/** Bids below this share of the market price look too cheap to deliver: the buyer rejects them */
export const TENDER_MIN = 0.8;

/** Your delivery record on contracts and tenders */
export function trackRecord(w: WorldState): { done: number; failed: number } {
  return w.play.track ?? { done: 0, failed: 0 };
}

/**
 * What your record is worth to a buyer, as a share of price: each contract delivered in full
 * counts 1%, each missed one costs 2%, between -8% and +8%.
 */
export function recordBonus(w: WorldState): number {
  const r = trackRecord(w);
  return clamp(0.01 * r.done - 0.02 * r.failed, -0.08, 0.08);
}

/** The lowest price the buyer accepts */
export function tenderMinPrice(t: Tender): number {
  return t.ref * TENDER_MIN;
}

/** Units a day a tender asks for */
export function tenderPerDay(t: Tender): number {
  return t.qtyPerMonth / 30;
}

/**
 * How the buyer ranks a bid (lower is better): the price against the market, better quality,
 * and whether the company can really deliver that much every day.
 */
export function tenderScore(t: Tender, price: number, quality: number, capacity = Infinity): number {
  const strain = Math.max(0, tenderPerDay(t) / Math.max(1, capacity * JOB_CAP_SHARE) - 1);
  return price / t.ref - QUALITY_WEIGHT * (quality - 1) + 0.6 * strain;
}

/** The price that gives this score for a bidder */
function priceForScore(t: Tender, score: number, quality: number, capacity: number): number {
  const strain = Math.max(0, tenderPerDay(t) / Math.max(1, capacity * JOB_CAP_SHARE) - 1);
  return (score + QUALITY_WEIGHT * (quality - 1) - 0.6 * strain) * t.ref;
}

/** A plant's cost per extra unit (materials, staff, running costs: the plant's overheads are paid anyway) */
export function tenderUnitCost(w: WorldState, c: Company): number {
  const ue = unitEconomics(w, c.good, { level: c.level, salaryMult: c.salaryMult, morale: c.morale, inputs: c.inputs, player: c.isPlayer, maintenance: c.maintenance });
  return ue.materials + ue.other + ue.labour;
}

/** The lowest a rival will go: its full cost plus a margin that shrinks with how aggressive its owner is */
function rivalFloor(w: WorldState, c: Company): number {
  const aggr = rivalOf(w, c)?.personality.aggression ?? 0.5;
  const ue = unitEconomics(w, c.good, { level: c.level, salaryMult: c.salaryMult, morale: c.morale, inputs: c.inputs, player: c.isPlayer, maintenance: c.maintenance });
  return Math.max(ue.total * (1.1 - 0.08 * aggr), refPrice(w, c.good) * 0.55);
}

const BIG_BUYERS: Partial<Record<GoodId, string[]>> = {};

function makeTender(w: WorldState): Tender | null {
  const r = w.rng;
  const open = (g: GoodId) => !w.play.tenders.some((t) => t.good === g && t.status === 'open');
  // Governments, and big companies that use the product
  const users = (g: GoodId) => w.companies.filter((c) => !c.isPlayer && !c.bankrupt && c.capacity > GOODS[c.good].baseCapacity && GOODS[c.good].inputs.some((i) => i.good === g));
  const goods = GOOD_IDS.filter((g) => open(g) && g !== 'banking' && (GOV_BUYERS[g] || users(g).length));
  const made = goods.filter((g) => mine(w).some((c) => c.good === g));
  const g = made.length && next(r) < 0.65 ? pick(r, made) : goods.length ? pick(r, goods) : null;
  if (!g) return null;
  const sellers = w.companies.filter((c) => c.good === g && !c.bankrupt);
  const yours = mine(w).filter((c) => c.good === g);
  const base = yours.length ? Math.max(...yours.map((c) => c.capacity)) : sellers.length ? sellers.reduce((s, c) => s + c.capacity, 0) / sellers.length : GOODS[g].baseCapacity;
  const ref = refPrice(w, g);
  const ai = sellers.filter((c) => !c.isPlayer && rivalOf(w, c)).sort(() => next(r) - 0.5).slice(0, int(r, 2, 4));
  const bids = ai.map((c) => {
    const aggr = rivalOf(w, c)?.personality.aggression ?? 0.5;
    const floor = rivalFloor(w, c);
    return { companyId: c.id, name: c.name, price: Math.max(floor * 1.04, ref * TENDER_MIN * 1.02, ref * (1.03 - 0.1 * aggr - next(r) * 0.06)), quality: c.quality, capacity: c.capacity };
  });
  const big = users(g);
  const company = (!GOV_BUYERS[g] || next(r) < 0.35) && big.length ? pick(r, big) : null;
  return {
    id: `t${++w.seq}`, buyer: company ? company.name : pick(r, GOV_BUYERS[g] ?? BIG_BUYERS[g] ?? ['Government of Astoria']), buyerId: company?.id,
    good: g, qtyPerMonth: Math.max(30, Math.round(base * 30 * range(r, 0.25, 0.45) / 10) * 10),
    months: int(r, TENDER_MONTHS[0], TENDER_MONTHS[1]), closes: w.day + TENDER_OPEN_DAYS, ref, bids, status: 'open', opened: w.day,
  };
}

function lead(t: Tender): { companyId: string; name: string; price: number; score: number; player: boolean } | null {
  const field = t.bids.filter((b) => !b.out).map((b) => ({ companyId: b.companyId, name: b.name, price: b.price, score: tenderScore(t, b.price, b.quality, b.capacity ?? Infinity), player: false }));
  if (t.mine) field.push({ companyId: t.mine.companyId, name: t.mine.name, price: t.mine.price, score: t.mine.score, player: true });
  field.sort((a, b) => a.score - b.score);
  return field[0] ?? null;
}

/** The leading bid right now (the one that would win if bidding closed) */
export function tenderLeader(t: Tender) {
  return lead(t);
}

/** Step into the tender room: rivals show their opening prices. */
export function joinTender(w: WorldState, tenderId: string, companyId: string): CommandResult {
  if (!unlocked(w, 'tenders')) return fail('Tenders unlock at level 4');
  const t = w.play.tenders.find((x) => x.id === tenderId && x.status === 'open');
  const c = mine(w).find((x) => x.id === companyId);
  if (!t) return fail('That tender has closed');
  if (!c || c.good !== t.good) return fail(`You need a company that makes ${GOODS[t.good].name.toLowerCase()}`);
  if (t.room && t.room.companyId === c.id) return ok('Back in the tender room');
  const full = jobRoom(w, c, tenderPerDay(t));
  if (full) return fail(full);
  t.room = { companyId: c.id, round: 0, log: [`${t.bids.filter((b) => !b.out).length} rivals are bidding. Beat the best offer to lead.`] };
  t.mine = undefined;
  return ok('Bidding has started');
}

/** Your bid: it must beat the leader. Then the rivals answer, and some drop out. */
export function bidInTender(w: WorldState, tenderId: string, price: number): CommandResult {
  const t = w.play.tenders.find((x) => x.id === tenderId && x.status === 'open');
  if (!t || !t.room) return fail('Start bidding first');
  const c = mine(w).find((x) => x.id === t.room!.companyId);
  if (!c) return fail('Company not found');
  const p = clamp(price, t.ref * 0.5, t.ref * 1.5);
  if (p < tenderMinPrice(t) - 1e-9) return fail(`${t.buyer} rejects bids below ${fmtPrice(tenderMinPrice(t))}: nobody can deliver that cheaply without cutting corners`);
  const score = tenderScore(t, p, c.quality, c.capacity) - recordBonus(w);
  const best = lead(t);
  if (best && !best.player && score >= best.score - 1e-9) return fail(`Bid lower than ${fmtPrice(priceForScore(t, best.score, c.quality, c.capacity))} to lead`);
  if (best?.player) return fail('You are already leading');
  const room = t.room;
  room.round += 1;
  t.mine = { companyId: c.id, name: c.name, price: p, score };
  room.log.push(`Round ${room.round}: you bid ${fmtPrice(p)}.`);
  // Rivals answer: the one with the most room under its floor beats you by a little, the rest drop out once they can't
  const r = w.rng;
  const tired = room.round >= TENDER_ROUNDS;
  const able: { b: Tender['bids'][number]; need: number; spare: number }[] = [];
  for (const b of t.bids) {
    if (b.out) continue;
    const co = w.companies.find((x) => x.id === b.companyId && !x.bankrupt);
    const floor = co ? rivalFloor(w, co) : b.price;
    const need = priceForScore(t, score - (0.008 + next(r) * 0.012), b.quality, b.capacity ?? Infinity);
    if (need < Math.max(floor, tenderMinPrice(t)) || tired || (room.round > 5 && chance(r, 0.25))) { b.out = true; room.log.push(`${b.name} drops out.`); continue; }
    able.push({ b, need, spare: need - floor });
  }
  able.sort((a, z) => z.spare - a.spare);
  const top = able[0];
  if (!top) {
    room.log.push('Nobody can beat you.');
    finishTender(w, t);
    return ok('You won the tender!');
  }
  top.b.price = top.need;
  room.log.push(`${top.b.name} answers with ${fmtPrice(top.need)}.`);
  return ok(`${top.b.name} bid lower: ${fmtPrice(top.need)}`);
}

/** Stop bidding: the best offer now wins. */
export function passTender(w: WorldState, tenderId: string): CommandResult {
  const t = w.play.tenders.find((x) => x.id === tenderId && x.status === 'open');
  if (!t || !t.room) return fail('Start bidding first');
  t.room.log.push('You stop bidding.');
  finishTender(w, t);
  return t.status === 'won' ? ok('You won the tender!') : ok(`${t.winner} wins the tender`);
}

/** Award the tender to the best bid. */
function finishTender(w: WorldState, t: Tender): void {
  const p = w.play;
  const me = t.mine && mine(w).find((c) => c.id === t.mine!.companyId);
  if (t.mine && me) t.mine.score = tenderScore(t, t.mine.price, me.quality, me.capacity) - recordBonus(w);
  if (t.mine && (!me || jobRoom(w, me, tenderPerDay(t)))) t.mine = undefined; // can no longer take it on
  const win = lead(t);
  if (!win) { t.status = 'closed'; return; }
  t.winner = win.name;
  t.winPrice = win.price;
  const qty = t.qtyPerMonth * t.months;
  if (win.player && me) {
    t.status = 'won';
    p.jobs.push({
      id: `j${++w.seq}`, source: 'tender', buyerName: t.buyer, buyerId: t.buyerId, good: t.good, qty, delivered: 0, pay: qty * win.price, bonus: 0, penalty: 0,
      days: t.months * 30, startDay: w.day, deadline: w.day + t.months * 30, companyId: me.id, status: 'active', offerUntil: w.day, checked: w.day, advance: TENDER_ADVANCE,
    });
    const upfront = qty * win.price * TENDER_ADVANCE;
    me.cash += upfront;
    const payer = t.buyerId ? w.companies.find((x) => x.id === t.buyerId && !x.bankrupt) : undefined;
    if (payer) payer.cash -= upfront;
    addXpLater(w, 150 + 15 * t.months);
    banner(w, 'Tender won!', `${t.buyer} picked ${me.name}: ${qty.toLocaleString()} ${GOODS[t.good].unit} over ${t.months} months at ${fmtPrice(win.price)}. ${fmtMoney(upfront)} paid up front.`, 150 + 15 * t.months, 'good');
    addNews(w, 'player', `${me.name} wins the ${t.buyer} tender`, `Worth ${fmtMoney(qty * win.price)} over ${t.months} months.`, 'good', [me.id]);
  } else {
    t.status = t.room ? 'lost' : 'closed';
    if (t.room) banner(w, 'Tender lost', `${win.name} won ${t.buyer} at ${fmtPrice(win.price)} per ${GOODS[t.good].unit}`, 0, 'bad');
    addNews(w, 'business', `${win.name} wins the ${t.buyer} tender`, `${qty.toLocaleString()} ${GOODS[t.good].unit} of ${GOODS[t.good].name.toLowerCase()} over ${t.months} months at ${fmtPrice(win.price)}.`, 'neutral');
    const co = w.companies.find((c) => c.id === win.companyId);
    if (co) co.brand = clamp(co.brand + 0.02, 0.5, 1.7);
  }
}

/** Long tenders are checked every month: a short month costs a fine on what is missing. */
function monthlyTenderCheck(w: WorldState): void {
  for (const j of w.play.jobs) {
    if (j.source !== 'tender' || j.status !== 'active' || j.checked == null || w.day - j.checked < 30) continue;
    j.checked = w.day;
    const due = (j.qty * Math.min(j.days, w.day - j.startDay)) / j.days;
    const short = due * 0.9 - j.delivered;
    if (short <= 0) continue;
    const fine = (short * j.pay / j.qty) * 0.1;
    const c = w.companies.find((x) => x.id === j.companyId);
    if (c) c.cash -= fine;
    banner(w, 'Tender delivery short', `${j.buyerName} is ${Math.round(short).toLocaleString()} ${GOODS[j.good].unit} behind: fined ${fmtMoney(fine)}`, 0, 'bad');
  }
}

function dailyTenders(w: WorldState): void {
  const p = w.play;
  monthlyTenderCheck(w);
  for (const t of p.tenders) if (t.status === 'open' && w.day >= t.closes) finishTender(w, t);
  p.tenders = p.tenders.filter((t) => t.status === 'open' || w.day - t.closes < 30);
  if (!unlocked(w, 'tenders')) return;
  const gap = w.macro.growth < 0.01 ? 10 : 18; // governments spend more in a slowdown
  if (w.day % gap === 0 && p.tenders.filter((t) => t.status === 'open').length < 3) {
    const t = makeTender(w);
    if (t) {
      p.tenders.push(t);
      addNews(w, 'politics', `${t.buyer} opens a tender for ${GOODS[t.good].name.toLowerCase()}`,
        `${t.qtyPerMonth.toLocaleString()} ${GOODS[t.good].unit} a month for ${t.months} months. Bids close on day ${t.closes}.`, 'neutral');
    }
  }
}

// ======================= brand campaigns =======================

export const CAMPAIGN: Record<CampaignSize, { label: string; rate: number; lift: number; brand: number }> = {
  s: { label: 'Small', rate: 0.04, lift: 0.15, brand: 0.01 },
  m: { label: 'Medium', rate: 0.08, lift: 0.3, brand: 0.02 },
  l: { label: 'Big', rate: 0.15, lift: 0.5, brand: 0.04 },
};
export const CAMPAIGN_FADE = 21;

export function campaignCost(c: Company, size: CampaignSize, weeks: number): number {
  const daily = Math.max(c.sum30.revenue / 30, c.capacity * refPriceSafe(c) * 0.3);
  return Math.round(Math.max(5_000, daily * 7 * CAMPAIGN[size].rate) * weeks / 100) * 100;
}
function refPriceSafe(c: Company): number { return c.last.price || GOODS[c.good].p0; }

/** Campaigns get weaker if you run them back to back. */
export function campaignFatigue(w: WorldState, c: Company): number {
  const recent = w.play.campaigns.filter((x) => x.companyId === c.id && w.day - x.end < 60).length;
  return Math.pow(0.7, recent);
}

export function startCampaign(w: WorldState, companyId: string, size: CampaignSize, weeks: number): CommandResult {
  if (!unlocked(w, 'campaigns')) return fail('Brand campaigns unlock at level 3');
  const c = mine(w).find((x) => x.id === companyId);
  if (!c) return fail('Company not found');
  if (w.play.campaigns.some((x) => x.companyId === c.id && x.end >= w.day)) return fail('A campaign is already running');
  const wk = [2, 4, 8].includes(weeks) ? weeks : 4;
  const cost = campaignCost(c, size, wk);
  if (c.cash < cost) return fail(`The campaign costs ${fmtMoney(cost)} of company cash`);
  c.cash -= cost;
  const lift = CAMPAIGN[size].lift * campaignFatigue(w, c);
  w.play.campaigns.push({ id: `cp${++w.seq}`, companyId: c.id, size, start: w.day + 1, end: w.day + wk * 7, cost, lift, baseRev: c.sum30.revenue / 30, rev: 0, done: false });
  if (w.play.campaigns.length > 30) w.play.campaigns.shift();
  return ok(`Campaign launched for ${c.name}`);
}

/** How much more appealing a company is today because of a campaign (1 = none). */
export function campaignMult(w: WorldState, c: Company): number {
  let m = 1;
  for (const x of w.play.campaigns) {
    if (x.companyId !== c.id || w.day < x.start) continue;
    if (w.day <= x.end) m += x.lift;
    else if (w.day <= x.end + CAMPAIGN_FADE) m += x.lift * (1 - (w.day - x.end) / CAMPAIGN_FADE);
  }
  return m;
}

export function campaignResult(c: Company | undefined, x: { cost: number; baseRev: number; rev: number; start: number; end: number }) {
  const days = x.end + CAMPAIGN_FADE - x.start + 1;
  const extra = Math.max(0, x.rev - x.baseRev * days);
  const margin = c && c.sum30.revenue > 0 ? clamp(c.sum30.grossProfit / c.sum30.revenue, 0.05, 0.8) : 0.25;
  const profit = extra * margin;
  return { extra, profit, great: profit > x.cost, days };
}

function dailyCampaigns(w: WorldState): void {
  for (const x of w.play.campaigns) {
    if (x.done || w.day < x.start) continue;
    const c = w.companies.find((y) => y.id === x.companyId);
    if (c) x.rev += c.last.revenue;
    if (w.day === x.end && c) c.brand = clamp(c.brand + CAMPAIGN[x.size].brand, 0.5, 1.7);
    if (w.day >= x.end + CAMPAIGN_FADE) {
      x.done = true;
      const r = campaignResult(c, x);
      banner(w, r.great ? 'Great value campaign!' : 'Campaign finished', `${c?.name ?? 'Company'}: ${fmtMoney(r.extra)} extra sales for ${fmtMoney(x.cost)}`, r.great ? 60 : 20, r.great ? 'good' : 'gold');
      addXpLater(w, r.great ? 60 : 20);
    }
  }
}

// ======================= price wars =======================

export const WAR_PRICE = 0.85;
export const WAR_END_PRICE = 0.9;

/** The rival company a deep price cut would provoke, if any. */
export function warTarget(w: WorldState, c: Company): Company | undefined {
  return w.companies
    .filter((x) => x.good === c.good && !x.isPlayer && !x.bankrupt && rivalOf(w, x) && x.last.marketShare >= 0.1)
    .sort((a, b) => b.last.marketShare - a.last.marketShare)[0];
}

export function activeWar(w: WorldState, c: Company): PriceWar | undefined {
  return w.play.wars.find((x) => x.status === 'active' && (x.playerCoId === c.id || x.rivalCoId === c.id));
}

function dailyWars(w: WorldState): void {
  const p = w.play;
  if (unlocked(w, 'wars')) {
    for (const c of mine(w)) {
      if (c.priceMult > WAR_PRICE || activeWar(w, c) || c.last.marketShare < 0.005) continue;
      if (p.wars.some((x) => x.good === c.good && x.end && w.day - x.end < 60)) continue;
      const t = warTarget(w, c);
      const rv = t && rivalOf(w, t);
      if (!t || !rv) continue;
      const strong = t.cash > fixedAt(t.good, t.level) * w.macro.priceLevel * 60;
      const mode: PriceWar['mode'] = rv.personality.aggression > 0.6 && strong ? 'undercut' : rv.personality.aggression > 0.35 || strong ? 'match' : 'backoff';
      p.wars.push({ id: `pw${++w.seq}`, good: c.good, playerCoId: c.id, rivalCoId: t.id, rivalId: rv.id, start: w.day, mode, startShare: c.last.marketShare, rivalStartShare: t.last.marketShare, status: 'active', cost: 0 });
      remember(rv, w, -10, `${c.name} started a price war against ${t.name}.`);
      const how = mode === 'undercut' ? 'is cutting even deeper' : mode === 'match' ? 'is matching your price' : 'is not fighting back';
      banner(w, '⚔️ Price war!', `${rv.name}'s ${t.name} ${how}.`, 0, 'bad');
      addNews(w, 'business', `Price war in ${GOODS[c.good].name.toLowerCase()}`, `${c.name} slashed prices; ${t.name} ${how}.`, 'neutral', [c.id, t.id]);
    }
  }
  for (const war of p.wars) {
    if (war.status !== 'active') continue;
    const me = w.companies.find((x) => x.id === war.playerCoId);
    const them = w.companies.find((x) => x.id === war.rivalCoId);
    const rv = w.rivals.find((r) => r.id === war.rivalId);
    const finish = (status: PriceWar['status'], text: string) => {
      war.status = status;
      war.end = w.day;
      if (them && !them.bankrupt) them.priceMult = 1;
      if (status === 'won') { remember(rv, w, -5, 'Lost a price war to you.'); addXpLater(w, 300); }
      if (status === 'lost' && them) them.brand = clamp(them.brand + 0.05, 0.5, 1.7);
      banner(w, status === 'won' ? 'Price war won!' : status === 'lost' ? 'Price war lost' : 'Price war over', text, status === 'won' ? 300 : 0, status === 'won' ? 'good' : status === 'lost' ? 'bad' : 'gold');
    };
    if (!me || me.bankrupt || me.lowCashDays > 5) { finish('lost', `${them?.name ?? 'The rival'} outlasted you.`); continue; }
    war.cost += Math.max(0, -me.last.netIncome);
    if (!them || them.bankrupt) { finish('won', `${them?.name ?? 'The rival'} is out of the market.`); continue; }
    if (me.priceMult > WAR_END_PRICE) {
      const gained = me.last.marketShare > war.startShare * 1.3 || them.last.marketShare < war.rivalStartShare * 0.7;
      finish(gained ? 'won' : 'truce', gained ? `You took market share from ${them.name}.` : `Prices are back to normal with ${them.name}.`);
      continue;
    }
    if (war.mode !== 'backoff' && (them.cash < 0 || them.lowCashDays > 0)) {
      war.mode = 'backoff';
      addNews(w, 'business', `${them.name} backs off in the price war`, `Short of cash, ${them.name} gives up the fight with ${me.name}.`, 'good', [them.id, me.id]);
    }
    if (w.day - war.start > 150) { finish('truce', 'Both sides agreed to stop.'); continue; }
    if (war.mode === 'match') them.priceMult = me.priceMult;
    else if (war.mode === 'undercut') them.priceMult = Math.max(0.5, me.priceMult * 0.97);
    else if (them.priceMult < 1) them.priceMult = 1;
  }
  if (p.wars.length > 20) p.wars = p.wars.slice(-20);
}

export function endWar(w: WorldState, warId: string): CommandResult {
  const war = w.play.wars.find((x) => x.id === warId && x.status === 'active');
  if (!war) return fail('No active war');
  const me = w.companies.find((x) => x.id === war.playerCoId);
  if (me) me.priceMult = 1;
  dailyWars(w);
  return ok('You raised prices back to normal');
}

// ======================= monopoly =======================

export const MONOPOLY_SHARE = 0.4;

/** Big sellers keep more customers when they raise prices. */
export function switchMult(c: Company): number {
  return c.isPlayer && c.last.marketShare > MONOPOLY_SHARE ? 0.5 : 1;
}

/** Antitrust fine: 20% of a year's profit (at least 0.5% of a year's revenue), never more than half the profit. */
export function antitrustFine(c: Company): number {
  const yearProfit = c.sum30.netIncome * 12;
  const yearRev = c.sum30.revenue * 12;
  const f = Math.max(yearProfit * 0.2, yearRev * 0.005);
  return yearProfit > 0 ? Math.min(f, yearProfit * 0.5) : f;
}

/** Chance to win in court: 45% at a normal brand, up to 70% with a strong one. */
export function courtOdds(c: Company): number {
  return clamp(0.45 + 0.4 * (c.brand - 1), 0.3, 0.7);
}

/** Monthly chance of an antitrust investigation. */
export function probeChance(c: Company): number {
  return c.last.marketShare > MONOPOLY_SHARE ? Math.min(0.5, (c.last.marketShare - MONOPOLY_SHARE) * 1.5) : 0;
}

function monthlyMonopoly(w: WorldState): void {
  for (const c of mine(w)) {
    const pr = probeChance(c);
    if (pr <= 0 || w.day - (w.play.probes[c.id] ?? -999) < 120 || w.pending.some((e) => e.template === 'antitrust')) continue;
    if (!chance(w.rng, pr)) continue;
    w.play.probes[c.id] = w.day;
    const fine = Math.round(antitrustFine(c));
    const win = courtOdds(c);
    const ev: PendingEvent = {
      id: `ev${++w.seq}`, template: 'antitrust', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 10,
      title: 'Antitrust investigation',
      body: `Regulators say ${c.name} controls ${fmtPct(c.last.marketShare, 0)} of ${GOODS[c.good].name.toLowerCase()} and is hurting competition.`,
      choices: [
        { id: 'fight', label: `Fight it in court (${fmtMoney(fine * 0.25)})`, detail: `${fmtPct(win, 0)} chance to win (better with a strong brand) · lose = 1.5x fine` },
        { id: 'split', label: 'Sell 25% of the plant', detail: 'Capacity and fixed costs drop 25% · cash back' },
        { id: 'fine', label: `Pay the fine (${fmtMoney(fine)})`, detail: 'Keep everything' },
      ],
      amount: fine,
    };
    w.pending.push(ev);
  }
}

// ======================= insider tips =======================

const TIP_UP = ['{co} is about to announce a big expansion.', '{co} just landed a huge order.', '{co} will beat its earnings forecast.'];
const TIP_DOWN = ['{co} is about to report weak sales.', '{co} is having trouble with its banks.', '{co} is losing a big customer.'];

function weeklyTips(w: WorldState): void {
  const p = w.play;
  for (const t of p.tips) {
    if (t.done || w.day < t.dueDay) continue;
    t.done = true;
    const s = stockByTicker(w, t.ticker);
    if (!s) continue;
    const co = w.companies.find((c) => c.id === s.companyId);
    if (t.truth) {
      s.newsImpact += t.dir * 0.07;
      s.sentiment = clamp(s.sentiment + t.dir * 0.5, -1, 1);
      addNews(w, 'market', t.dir > 0 ? `${co?.name ?? t.ticker} surprises the market` : `Bad news at ${co?.name ?? t.ticker}`,
        t.dir > 0 ? 'Shares jump on the announcement.' : 'Shares slide as investors react.', t.dir > 0 ? 'good' : 'bad', co ? [co.id] : []);
      const now = w.player.holdings[t.ticker]?.shares ?? 0;
      const traded = Math.abs(now - t.sharesAtTip) * s.price;
      if (traded > 100_000 && chance(w.rng, 0.3)) {
        const fine = traded * 0.15;
        w.player.cash -= fine;
        w.player.reputation = clamp(w.player.reputation - 5, 0, 100);
        banner(w, 'Insider trading warning', `Regulators fined you ${fmtMoney(fine)} for trading ${t.ticker} before the news.`, 0, 'bad');
      }
    } else {
      s.newsImpact -= t.dir * 0.02;
    }
  }
  p.tips = p.tips.filter((t) => !t.done || w.day - t.dueDay < 30);
  if (!unlocked(w, 'tips')) return;
  for (const rv of w.rivals) {
    if (rv.relation < 40 || p.tips.some((t) => t.rivalId === rv.id && !t.done) || !chance(w.rng, 0.15)) continue;
    const listed = w.companies.filter((c) => c.ticker && !c.bankrupt && (c.ownerId === rv.id || rv.holdings[c.ticker]));
    if (!listed.length) continue;
    const co = pick(w.rng, listed);
    const dir: 1 | -1 = next(w.rng) < 0.65 ? 1 : -1;
    const text = pick(w.rng, dir > 0 ? TIP_UP : TIP_DOWN).replace('{co}', co.name);
    p.tips.push({ id: `tp${++w.seq}`, rivalId: rv.id, day: w.day, dueDay: w.day + int(w.rng, 3, 6), text, ticker: co.ticker!, dir, truth: next(w.rng) < 0.8, sharesAtTip: w.player.holdings[co.ticker!]?.shares ?? 0, done: false });
    banner(w, `🤫 Tip from ${rv.name}`, `"Between us: ${text}"`, 0, 'gold');
  }
}

// ======================= joint ventures =======================

export const VENTURE_LEVEL = 3;
export const VENTURE_MINE = 0.51;

export function ventureCost(g: GoodId): number {
  return Math.round(startCost(g) * 3 / 10_000) * 10_000;
}

function monthlyVentures(w: WorldState): void {
  // Friendship grows while a venture makes money
  for (const c of mine(w)) {
    const rvPartner = c.partners?.find((pt) => w.rivals.some((r) => r.id === pt.ownerId));
    if (rvPartner && c.sum30.netIncome > 0) remember(w.rivals.find((r) => r.id === rvPartner.ownerId), w, 2, `Your joint venture ${c.name} is making money.`);
  }
  if (!unlocked(w, 'ventures') || w.pending.some((e) => e.template === 'venture') || !chance(w.rng, 0.3)) return;
  const friends = w.rivals.filter((r) => r.relation >= 40);
  const first = mine(w)[0];
  if (!friends.length || !first) return;
  const rv = pick(w.rng, friends);
  const goods = GOOD_IDS.filter((g) => g !== 'banking' && rv.focus.includes(GOODS[g].industry));
  if (!goods.length) return;
  const g = pick(w.rng, goods);
  const total = ventureCost(g);
  if (rv.cash < total) return;
  w.pending.push({
    id: `ev${++w.seq}`, template: 'venture', day: w.day, companyId: first.id, rivalId: rv.id, expiresDay: w.day + 12, good: g, amount: total,
    title: `${rv.name} proposes a joint venture`,
    body: `Build a ${fmtMoney(total)} ${GOODS[g].name.toLowerCase()} plant together (level ${VENTURE_LEVEL}). You put in 51% (${fmtMoney(total * VENTURE_MINE)}) and run it; ${rv.name} puts in 49% and shares the profit. No licence needed.`,
    choices: [
      { id: 'accept', label: `Build it (${fmtMoney(total * VENTURE_MINE)})`, detail: '+Big plant · +Relationship' },
      { id: 'decline', label: 'Decline', detail: '-Relationship' },
    ],
  });
}

// ======================= events =======================

export function resolveStrategyEvent(w: WorldState, ev: PendingEvent, c: Company, choiceId: string): CommandResult {
  const rv = w.rivals.find((r) => r.id === ev.rivalId);
  if (ev.template === 'antitrust') {
    const fine = ev.amount ?? antitrustFine(c);
    if (choiceId === 'fight') {
      const fee = fine * 0.25;
      c.cash -= fee;
      if (chance(w.rng, courtOdds(c))) {
        addNews(w, 'politics', `${c.name} wins its antitrust case`, 'The court found no abuse of market power.', 'good', [c.id]);
        return ok('You won the case!');
      }
      c.cash -= fine * 1.5;
      addNews(w, 'politics', `${c.name} loses its antitrust case`, `The company must pay ${fmtMoney(fine * 1.5)}.`, 'bad', [c.id]);
      return ok(`You lost the case: fine ${fmtMoney(fine * 1.5)}`);
    }
    if (choiceId === 'split') {
      const cash = companyValue(c) * 0.25 * 0.8;
      c.capacity *= 0.75;
      c.fixedScale = (c.fixedScale ?? 1) * 0.75; // less plant, less rent and overhead
      c.assets *= 0.75;
      c.workers = Math.round(c.workers * 0.75);
      w.player.cash += cash;
      addNews(w, 'politics', `${c.name} sells part of its plant`, 'Regulators accepted the sale to settle the case.', 'neutral', [c.id]);
      return ok(`Sold 25% of the plant for ${fmtMoney(cash)}`);
    }
    c.cash -= fine;
    return ok(`Fine paid: ${fmtMoney(fine)}`);
  }
  if (ev.template === 'venture') {
    const g = ev.good;
    const total = ev.amount ?? 0;
    if (choiceId !== 'accept' || !g || !rv) { remember(rv, w, -3, 'You turned down a joint venture.'); return ok('Declined.'); }
    const myPart = total * VENTURE_MINE;
    if (w.player.cash < myPart) return ok(`You need ${fmtMoney(myPart)} of personal cash; ${rv.name} moved on.`);
    w.player.cash -= myPart;
    rv.cash -= total - myPart;
    const name = uniqueName(w, `${rv.name.split(' ').at(-1)} & You ${GOODS[g].name}`);
    const co = newCompany(w, { id: `p${++w.seq}`, name, good: g, ownerId: 'player', isPlayer: true, ticker: null, level: VENTURE_LEVEL });
    co.cash = total * 0.35;
    co.assets = total * 0.65;
    co.partners = [{ ownerId: rv.id, name: rv.name, pct: 1 - VENTURE_MINE, paid: total - myPart, day: w.day }];
    seedInputs(w, co, 3);
    co.reach = 0.45; // your partner brings some of its customers
    w.companies.push(co);
    remember(rv, w, 8, `You built ${name} together.`);
    addNews(w, 'player', `${name} is born`, `A joint venture of you and ${rv.name}: a level ${VENTURE_LEVEL} ${GOODS[g].name.toLowerCase()} plant.`, 'good', [co.id]);
    return ok(`${name} founded`);
  }
  return ok('Done.');
}

function uniqueName(w: WorldState, base: string): string {
  let name = base.slice(0, 28);
  let n = 2;
  while (w.companies.some((c) => c.name.toLowerCase() === name.toLowerCase())) name = `${base.slice(0, 25)} ${n++}`;
  return name;
}

// ======================= daily entry point =======================

export function dailyStrategies(w: WorldState): void {
  dailyJobs(w);
  dailyTenders(w);
  dailyCampaigns(w);
  dailyWars(w);
  if (w.day % 7 === 0) weeklyTips(w);
  if (w.day % 30 === 15) { monthlyMonopoly(w); monthlyVentures(w); }
}
