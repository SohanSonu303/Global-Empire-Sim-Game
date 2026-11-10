/**
 * Requests you post yourself: "I want to buy 500 t of limestone a day for 90 days at up to
 * $X", or "I have 800 t of steel a day to sell at $Y". Companies that make (or use) the
 * product reply with offers after a couple of days; accept one or several and each becomes
 * a normal supply deal.
 */
import { GOODS } from './data';
import { refPrice } from './company';
import { MAX_DAYS, MIN_DAYS, dailyNeed, dealPartners, judgeOffer, offerContract, ownerRival } from './contracts';
import { fmtPrice } from './news';
import { clamp } from './company';
import { next } from './rng';
import { banner } from './rewards';
import type { CommandResult, Company, GoodId, RequestReply, SupplyRequest, WorldState } from './types';

/** Requests open at once */
export const MAX_REQUESTS = 3;
/** Days before replies come in, and before the request closes */
export const REPLY_DAYS = 2;
export const REQUEST_DAYS = 9;

const ok = (message: string): CommandResult => ({ ok: true, message });
const fail = (message: string): CommandResult => ({ ok: false, message });

export function requestsOf(w: WorldState): SupplyRequest[] {
  return w.play.requests ?? [];
}

/** The products a company could ask for: its inputs to buy, its own product to sell */
export function requestGoods(c: Company, side: 'buy' | 'sell'): GoodId[] {
  return side === 'sell' ? [c.good] : GOODS[c.good].inputs.map((i) => i.good);
}

export function postRequest(w: WorldState, r: { side: 'buy' | 'sell'; companyId: string; good: GoodId; qtyPerDay: number; days: number; price: number }): CommandResult {
  const c = w.companies.find((x) => x.id === r.companyId && x.isPlayer && !x.bankrupt);
  if (!c) return fail('Company not found');
  if (!requestGoods(c, r.side).includes(r.good)) return fail(r.side === 'buy' ? `${c.name} does not use ${GOODS[r.good].name.toLowerCase()}` : `${c.name} does not make that`);
  if (r.qtyPerDay <= 0 || r.price <= 0) return fail('Enter a quantity and a price');
  const list = (w.play.requests ??= []);
  if (list.filter((x) => x.status === 'open').length >= MAX_REQUESTS) return fail(`You can have ${MAX_REQUESTS} requests open at once`);
  list.push({
    id: `rq${++w.seq}`, side: r.side, companyId: c.id, good: r.good, qtyPerDay: Math.round(r.qtyPerDay), days: Math.round(clamp(r.days, MIN_DAYS, MAX_DAYS)),
    price: r.price, posted: w.day, replyDay: w.day + REPLY_DAYS, closes: w.day + REQUEST_DAYS, replies: [], filled: 0, status: 'open',
  });
  return ok(`Request posted. Replies arrive in about ${REPLY_DAYS} days.`);
}

/** Companies that answer a request, with the terms they would sign */
function collectReplies(w: WorldState, rq: SupplyRequest, c: Company): RequestReply[] {
  const { buyers, sellers } = dealPartners(w, c);
  const pool = rq.side === 'buy' ? sellers.find((s) => s.good === rq.good)?.companies ?? [] : buyers;
  const out: RequestReply[] = [];
  for (const p of pool) {
    const cap = rq.side === 'buy' ? p.capacity * 0.5 : dailyNeed(p, rq.good) * 1.2;
    const qty = Math.floor(Math.min(rq.qtyPerDay, cap));
    if (qty < Math.max(1, rq.qtyPerDay * 0.15)) continue;
    // What they would accept, then a small margin for themselves
    const v = judgeOffer(w, c, p, rq.side, qty, rq.side === 'buy' ? Number.MAX_VALUE : 0);
    if (ownerRival(w, p) && ownerRival(w, p)!.relation <= -40) continue;
    const price = rq.side === 'buy' ? v.fair * (1 + next(w.rng) * 0.03) : v.fair * (1 - next(w.rng) * 0.03);
    if (rq.side === 'buy' ? price > rq.price : price < rq.price) continue;
    // A buyer pays your asking price; a seller asks its own (never more than your maximum)
    out.push({ companyId: p.id, name: p.name, price: rq.side === 'buy' ? price : rq.price, qtyPerDay: qty, quality: p.quality });
  }
  out.sort((a, b) => (rq.side === 'buy' ? a.price - b.price : b.price - a.price));
  return out.slice(0, 5);
}

/** Daily: replies arrive, old requests close */
export function dailyRequests(w: WorldState): void {
  const list = w.play.requests;
  if (!list?.length) return;
  for (const rq of list) {
    if (rq.status !== 'open') continue;
    const c = w.companies.find((x) => x.id === rq.companyId && !x.bankrupt);
    if (!c || w.day > rq.closes) { rq.status = 'closed'; continue; }
    if (!rq.answered && w.day >= rq.replyDay) {
      rq.answered = true;
      rq.replies = collectReplies(w, rq, c);
      const name = GOODS[rq.good].name.toLowerCase();
      banner(w, rq.replies.length ? 'Replies to your request' : 'No takers', rq.replies.length
        ? `${rq.replies.length} compan${rq.replies.length === 1 ? 'y' : 'ies'} answered your ${name} ${rq.side === 'buy' ? 'request' : 'offer'}${rq.side === 'buy' ? `, best ${fmtPrice(rq.replies[0].price)}` : ''}.`
        : `Nobody would ${rq.side === 'buy' ? 'sell' : 'buy'} ${name} at ${fmtPrice(rq.price)}. Try a ${rq.side === 'buy' ? 'higher' : 'lower'} price (market ${fmtPrice(refPrice(w, rq.good))}).`, 0, rq.replies.length ? 'good' : 'bad');
    }
  }
  w.play.requests = list.filter((x) => x.status === 'open' || w.day - x.closes < 20).slice(-12);
}

/** Sign the deal a company offered */
export function acceptReply(w: WorldState, requestId: string, companyId: string): CommandResult {
  const rq = requestsOf(w).find((x) => x.id === requestId && x.status === 'open');
  if (!rq) return fail('That request has closed');
  const reply = rq.replies.find((x) => x.companyId === companyId);
  const c = w.companies.find((x) => x.id === rq.companyId && x.isPlayer && !x.bankrupt);
  const p = w.companies.find((x) => x.id === companyId && !x.bankrupt);
  if (!reply || !c || !p) return fail('That offer is gone');
  const qty = Math.min(reply.qtyPerDay, Math.max(0, rq.qtyPerDay - rq.filled));
  if (qty <= 0) return fail('Your request is already covered');
  const r = offerContract(w, c, p, rq.side, qty, reply.price, rq.days);
  if (!r.ok) return r;
  rq.filled += qty;
  rq.replies = rq.replies.filter((x) => x !== reply);
  if (rq.filled >= rq.qtyPerDay - 1e-6) rq.status = 'done';
  return ok(`Deal signed with ${p.name}: ${qty.toLocaleString()} ${GOODS[rq.good].unit} a day at ${fmtPrice(reply.price)} for ${rq.days} days`);
}

export function cancelRequest(w: WorldState, requestId: string): CommandResult {
  const rq = requestsOf(w).find((x) => x.id === requestId && x.status === 'open');
  if (!rq) return fail('That request has closed');
  rq.status = 'closed';
  return ok('Request withdrawn');
}
