/**
 * The monthly inbox: every month your teams bring you a few decisions with real trade-offs.
 * Answer them yourself, let a hired manager answer, or let them run out (the fallback is
 * usually "do nothing", which has its own cost).
 */
import { GOODS } from './data';
import { addBoost, clamp, reachOf, salaryOf, wageIndex } from './company';
import { payBill } from './events';
import { addNews, fmtMoney, fmtPct } from './news';
import { chance, next, pick } from './rng';
import { resolveRivalCard } from './rivalry';
import type { Company, CommandResult, InboxCard, WorldState } from './types';

/** Days a card stays open before the fallback is taken */
export const CARD_DAYS = 14;
/** A careful manager waits this long before answering */
const BASIC_WAIT = 2;

const mine = (w: WorldState) => w.companies.filter((c) => c.isPlayer && !c.bankrupt);
const pl = (w: WorldState) => w.macro.priceLevel;
/** A month of revenue, with a floor: the scale for what decisions cost */
export const size = (w: WorldState, c: Company) => Math.max(5_000 * pl(w), c.sum30.revenue);
const round = (v: number) => (v > 100_000 ? Math.round(v / 1000) * 1000 : Math.round(v / 100) * 100);
const util = (c: Company) => c.sum30.sold / Math.max(1, c.sum30.capacity * 30);
const margin = (c: Company) => (c.sum30.revenue > 0 ? c.sum30.netIncome / c.sum30.revenue : 0);
const staffCost = (w: WorldState, c: Company, days: number) => round(c.workers * salaryOf(c) * c.salaryMult * wageIndex(w) * days);

export function inbox(w: WorldState): InboxCard[] {
  return (w.play.inbox ??= []);
}

export function openCards(w: WorldState): InboxCard[] {
  return inbox(w).filter((x) => !x.answered);
}

export function pushCard(w: WorldState, card: Omit<InboxCard, 'id' | 'day' | 'expires'> & { expires?: number }): InboxCard {
  const full: InboxCard = { ...card, id: `in${++w.seq}`, day: w.day, expires: card.expires ?? w.day + CARD_DAYS };
  inbox(w).push(full);
  return full;
}

/** Days before the same kind of decision comes up again for a company */
const COOLDOWN: Record<string, number> = {
  raise: 150, bulkDeal: 60, cheapSupplier: 150, poach: 150, defect: 120, overhaul: 40, training: 120, ads: 35, latePayer: 60, morale: 45, interview: 150,
};

const hasBoost = (c: Company, why: string) => (c.boosts ?? []).some((b) => b.why === why);

interface Template {
  kind: string;
  /** How likely this card is for this company this month (0 = not now) */
  weight: (w: WorldState, c: Company) => number;
  make: (w: WorldState, c: Company) => Omit<InboxCard, 'id' | 'day' | 'expires'>;
  resolve: (w: WorldState, card: InboxCard, c: Company, choice: string) => string;
}

const TEMPLATES: Template[] = [
  {
    kind: 'raise',
    weight: (w, c) => (c.workers < 5 || (c.morale > 0.72 && w.macro.inflation < 0.04) ? 0 : 0.6 + (c.morale < 0.6 ? 1.5 : 0)),
    make: (w, c) => {
      const pct = clamp(Math.round(2 + Math.max(0, w.macro.inflation - 0.02) * 100 + (0.7 - c.morale) * 10), 2, 8);
      return {
        kind: 'raise', from: 'Union rep', companyId: c.id, amount: pct,
        title: `Staff at ${c.name} want a ${pct}% raise`,
        body: `Pay already rises with prices, but staff want more: morale is ${Math.round(c.morale * 100)}% and prices are up ${fmtPct(w.macro.inflation, 1)} this year. A raise costs about ${fmtMoney(staffCost(w, c, 30) * pct / 100)} more a month in wages. Happy staff work faster and stay; unhappy ones leave, and new hires take weeks to learn.`,
        choices: [
          { id: 'accept', label: `Give ${pct}%`, detail: '+Morale · higher wages' },
          { id: 'counter', label: `Offer ${Math.ceil(pct / 2)}%`, detail: 'A small morale boost' },
          { id: 'refuse', label: 'Say no', detail: `-Morale · ${Math.round(clamp(0.75 - c.morale, 0.05, 0.5) * 100)}% strike risk` },
        ],
        fallback: 'refuse', safe: 'counter', best: c.morale < 0.55 ? 'accept' : c.morale < 0.68 ? 'counter' : 'refuse',
      };
    },
    resolve: (w, card, c, choice) => {
      const pct = card.amount ?? 5;
      if (choice === 'accept') { c.salaryMult *= 1 + pct / 100; c.morale = clamp(c.morale + 0.15, 0, 1); return `Raise agreed: wages +${pct}%, morale up.`; }
      if (choice === 'counter') { c.salaryMult *= 1 + Math.ceil(pct / 2) / 100; c.morale = clamp(c.morale + 0.05, 0, 1); return `They took ${Math.ceil(pct / 2)}%, grudgingly.`; }
      // Happy staff grumble; unhappy ones walk out
      const strikeRisk = clamp(0.75 - c.morale, 0.05, 0.5);
      c.morale = clamp(c.morale - 0.1, 0, 1);
      if (chance(w.rng, strikeRisk)) {
        c.strikeUntil = w.day + 4;
        addNews(w, 'player', `Strike at ${c.name}`, 'Staff walked out for four days after their pay claim was turned down.', 'bad', [c.id]);
        return 'Refused. Staff are on strike for 4 days.';
      }
      return 'Refused. Morale dropped.';
    },
  },
  {
    kind: 'bulkDeal',
    weight: (_w, c) => (util(c) < 0.85 && c.sum30.revenue > 0 && !hasBoost(c, 'Volume deal') ? 1 + (reachOf(c) < 0.7 ? 1 : 0) : 0),
    make: (w, c) => {
      const product = GOODS[c.good].tier === 'product';
      const who = product ? pick(w.rng, ['Big Basket Stores', 'Metro Mart', 'ValueWay', 'Corner Chain', 'Prime Outlets']) : pick(w.rng, ['a factory group', 'a large processor', 'a trading house']);
      return {
        kind: 'bulkDeal', from: 'Sales team', companyId: c.id,
        title: `${product ? who : 'A big buyer'} wants a volume deal`,
        body: `${product ? who : `Buyers from ${who}`} will push ${c.name} to their customers for 60 days if you cut your price 6% for them. ${c.name} is using ${fmtPct(util(c), 0)} of its plant, so the extra orders would fill spare capacity. Some buyers stay on after the deal ends.`,
        choices: [
          { id: 'accept', label: 'Take the deal', detail: '-6% price · +35% orders for 60 days · +customers' },
          { id: 'decline', label: 'Decline', detail: 'Keep your price' },
        ],
        fallback: 'decline', safe: util(c) < 0.75 ? 'accept' : 'decline', best: util(c) < 0.85 && margin(c) > 0.04 ? 'accept' : 'decline',
      };
    },
    resolve: (w, _card, c, choice) => {
      if (choice !== 'accept') return 'Declined.';
      addBoost(w, c, 'price', 0.94, 60, 'Volume deal discount');
      addBoost(w, c, 'attract', 1.35, 60, 'Volume deal');
      c.reach = Math.min(1.3, reachOf(c) + 0.05);
      return 'Deal signed: 6% off, more orders for 60 days.';
    },
  },
  {
    kind: 'cheapSupplier',
    weight: (_w, c) => (GOODS[c.good].vc > 1 && !hasBoost(c, 'Cheaper supplier') ? 0.7 : 0),
    make: (_w, c) => {
      const product = GOODS[c.good].tier === 'product';
      return {
        kind: 'cheapSupplier', from: 'Purchasing', companyId: c.id,
        title: 'A cheaper parts supplier',
        body: `A new supplier offers ${c.name}'s parts, packaging and consumables 15% cheaper for four months. Reviews say their quality is patchy: expect a small drop in quality${product ? ', which shoppers notice' : ''}.`,
        choices: [
          { id: 'accept', label: 'Switch supplier', detail: '-15% other costs for 120 days · -Quality' },
          { id: 'decline', label: 'Stay with the old one', detail: 'No change' },
        ],
        fallback: 'decline', safe: 'decline', best: product ? 'decline' : 'accept',
      };
    },
    resolve: (w, _card, c, choice) => {
      if (choice !== 'accept') return 'You kept your old supplier.';
      addBoost(w, c, 'cost', 0.85, 120, 'Cheaper supplier');
      c.quality = clamp(c.quality - 0.03, 0.6, 1.7);
      return 'Switched: other costs down 15% for 120 days, quality slipped.';
    },
  },
  {
    kind: 'poach',
    weight: (_w, c) => (c.workers > 20 ? 0.6 : 0),
    make: (w, c) => {
      const cost = round(Math.max(3_000 * pl(w), size(w, c) * 0.04));
      return {
        kind: 'poach', from: 'HR', companyId: c.id, amount: cost,
        title: `A rival wants ${c.name}'s plant manager`,
        body: `Your plant manager has a better offer elsewhere. A retention bonus of ${fmtMoney(cost)} keeps them. Without them, output per worker drops about 5% for ten weeks while someone new learns the plant.`,
        choices: [
          { id: 'match', label: `Pay ${fmtMoney(cost)} to keep them`, detail: 'No disruption' },
          { id: 'let', label: 'Let them go', detail: '-5% output per worker for 75 days' },
        ],
        fallback: 'let', safe: 'match', best: 'match',
      };
    },
    resolve: (w, card, c, choice) => {
      if (choice === 'match' && payBill(w, c, card.amount ?? 0)) return 'They stayed.';
      addBoost(w, c, 'productivity', 0.95, 75, 'New plant manager learning');
      return choice === 'match' ? 'Not enough cash: they left.' : 'They left. A new manager is learning the ropes.';
    },
  },
  {
    kind: 'defect',
    weight: (_w, c) => (GOODS[c.good].tier === 'raw' ? 0 : 0.4 + (c.quality < 0.95 ? 0.6 : 0) + ((c.condition ?? 1) < 0.75 ? 0.8 : 0)),
    make: (w, c) => {
      const cost = round(Math.max(4_000 * pl(w), size(w, c) * 0.06));
      return {
        kind: 'defect', from: 'Quality team', companyId: c.id, amount: cost,
        title: `A faulty batch at ${c.name}`,
        body: `Some recent ${GOODS[c.good].name.toLowerCase()} left the plant with a defect. A full recall costs ${fmtMoney(cost)} but shows customers you care. A quiet fix is cheaper, but if the story leaks the damage is worse.`,
        choices: [
          { id: 'recall', label: `Recall (${fmtMoney(cost)})`, detail: '+Trust · costs cash' },
          { id: 'quiet', label: `Quiet fix (${fmtMoney(cost * 0.3)})`, detail: '35% chance it leaks' },
          { id: 'ignore', label: 'Ignore it', detail: '60% chance of a scandal' },
        ],
        fallback: 'quiet', safe: 'recall', best: 'recall',
      };
    },
    resolve: (w, card, c, choice) => {
      const cost = card.amount ?? 0;
      const scandal = () => {
        c.brand = clamp(c.brand - 0.08, 0.5, 1.7);
        c.satisfaction = clamp((c.satisfaction ?? 0.75) - 0.15, 0, 1);
        c.reach = reachOf(c) * 0.9;
        addNews(w, 'player', `${c.name} hid a faulty batch`, 'Customers are angry after the defect came to light.', 'bad', [c.id]);
        return 'The story leaked: brand and customers hit.';
      };
      if (choice === 'recall') {
        if (!payBill(w, c, cost)) return scandal();
        c.satisfaction = clamp((c.satisfaction ?? 0.75) + 0.05, 0, 1);
        return 'Recalled. Customers noticed you did the right thing.';
      }
      if (choice === 'quiet') {
        payBill(w, c, cost * 0.3);
        return chance(w.rng, 0.35) ? scandal() : 'Fixed quietly. Nobody noticed.';
      }
      c.quality = clamp(c.quality - 0.02, 0.6, 1.7);
      return chance(w.rng, 0.6) ? scandal() : 'You got away with it this time.';
    },
  },
  {
    kind: 'overhaul',
    weight: (_w, c) => ((c.condition ?? 1) < 0.82 ? 2 + (0.82 - (c.condition ?? 1)) * 10 : 0),
    make: (w, c) => {
      const cost = round(Math.max(5_000 * pl(w), c.assets * 0.05));
      return {
        kind: 'overhaul', from: 'Plant engineer', companyId: c.id, amount: cost,
        title: `${c.name}'s machines need an overhaul`,
        body: `The machines are at ${Math.round((c.condition ?? 1) * 100)}% condition: workers make less and breakdowns get likelier. A full overhaul costs ${fmtMoney(cost)} and slows the plant for 4 days. A patch job is cheaper but only buys time.`,
        choices: [
          { id: 'overhaul', label: `Overhaul (${fmtMoney(cost)})`, detail: 'Condition back to 100%' },
          { id: 'patch', label: `Patch (${fmtMoney(cost * 0.3)})`, detail: '+12% condition' },
          { id: 'skip', label: 'Not now', detail: 'Keep wearing down' },
        ],
        fallback: 'skip', safe: c.cash > cost * 2 ? 'overhaul' : 'patch', best: 'overhaul',
      };
    },
    resolve: (w, card, c, choice) => {
      const cost = card.amount ?? 0;
      if (choice === 'overhaul' && payBill(w, c, cost)) {
        c.condition = 1;
        c.worn = false;
        addBoost(w, c, 'productivity', 0.6, 4, 'Overhaul under way');
        return 'Overhaul booked: as good as new in 4 days.';
      }
      if (choice === 'patch' && payBill(w, c, cost * 0.3)) { c.condition = Math.min(1, (c.condition ?? 1) + 0.12); return 'Patched up.'; }
      return choice === 'skip' ? 'Postponed.' : 'Not enough cash for the work.';
    },
  },
  {
    kind: 'training',
    weight: (_w, c) => (c.workers > 10 && (c.skill ?? 1) < 1.12 ? 0.6 + ((c.skill ?? 1) < 0.92 ? 1 : 0) : 0),
    make: (w, c) => {
      const cost = staffCost(w, c, 10);
      return {
        kind: 'training', from: 'HR', companyId: c.id, amount: cost,
        title: 'A training course for your staff',
        body: `A two-week course for ${c.name}'s ${Math.round(c.workers)} staff costs ${fmtMoney(cost)}. Trained workers make about 5% more, for good (until they leave). Team experience is ${Math.round((c.skill ?? 1) * 100)}%.`,
        choices: [
          { id: 'train', label: `Train them (${fmtMoney(cost)})`, detail: '+5% output per worker · +Morale' },
          { id: 'skip', label: 'Skip', detail: 'No change' },
        ],
        fallback: 'skip', safe: 'skip', best: margin(c) > 0 ? 'train' : 'skip',
      };
    },
    resolve: (w, card, c, choice) => {
      if (choice !== 'train') return 'Skipped.';
      if (!payBill(w, c, card.amount ?? 0)) return 'Not enough cash for the course.';
      c.skill = Math.min(1.15, (c.skill ?? 1) + 0.05);
      c.morale = clamp(c.morale + 0.03, 0, 1);
      return 'Staff trained: +5% output per worker.';
    },
  },
  {
    kind: 'ads',
    weight: (_w, c) => (reachOf(c) < 0.95 ? 1.2 + (reachOf(c) < 0.5 ? 1.5 : 0) : 0.2),
    make: (w, c) => {
      const cost = round(Math.max(6_000 * pl(w), size(w, c) * 0.1));
      return {
        kind: 'ads', from: 'Marketing team', companyId: c.id, amount: cost,
        title: `Win new customers for ${c.name}`,
        body: `${c.name} reaches ${Math.round(reachOf(c) * 100)}% of the customers an established firm has. A big push (${fmtMoney(cost)}) wins about 8 points of customers now; a targeted one costs ${fmtMoney(cost * 0.4)} for about 3. Customers you win stay if they're happy.`,
        choices: [
          { id: 'big', label: `Big push (${fmtMoney(cost)})`, detail: '+8 pts customers · +Brand' },
          { id: 'small', label: `Targeted (${fmtMoney(cost * 0.4)})`, detail: '+3 pts customers' },
          { id: 'pass', label: 'Pass', detail: 'No change' },
        ],
        fallback: 'pass', safe: 'small', best: reachOf(c) < 0.7 ? 'big' : 'small',
      };
    },
    resolve: (w, card, c, choice) => {
      const cost = card.amount ?? 0;
      if (choice === 'big' && payBill(w, c, cost)) { c.reach = Math.min(1.3, reachOf(c) + 0.08); c.brand = clamp(c.brand + 0.03, 0.5, 1.7); return 'Campaign launched: +8 pts customers.'; }
      if (choice === 'small' && payBill(w, c, cost * 0.4)) { c.reach = Math.min(1.3, reachOf(c) + 0.03); return 'Targeted ads running: +3 pts customers.'; }
      return choice === 'pass' ? 'Passed.' : 'Not enough cash.';
    },
  },
  {
    kind: 'latePayer',
    weight: (w, c) => ((c.receivables ?? 0) > size(w, c) * 0.4 ? 1.2 : 0),
    make: (w, c) => {
      const owed = round((c.receivables ?? 0) * 0.25);
      return {
        kind: 'latePayer', from: 'Accounts', companyId: c.id, amount: owed,
        title: 'A customer is paying late',
        body: `A business customer owes ${c.name} ${fmtMoney(owed)} and is weeks behind. A collection agency pays you 85% now. Waiting usually gets you the full amount, but some late payers never pay.`,
        choices: [
          { id: 'chase', label: `Sell the debt (${fmtMoney(owed * 0.85)} now)`, detail: 'Cash today · lose 15%' },
          { id: 'wait', label: 'Wait for them', detail: '30% chance you lose 40% of it' },
        ],
        fallback: 'wait', safe: 'chase', best: c.cash < size(w, c) * 0.3 ? 'chase' : 'wait',
      };
    },
    resolve: (w, card, c, choice) => {
      const owed = Math.min(card.amount ?? 0, c.receivables ?? 0);
      if (choice === 'chase') { c.receivables = (c.receivables ?? 0) - owed; c.cash += owed * 0.85; return `Collected ${fmtMoney(owed * 0.85)}.`; }
      if (chance(w.rng, 0.3)) { c.receivables = (c.receivables ?? 0) - owed * 0.4; return `They went under: ${fmtMoney(owed * 0.4)} written off.`; }
      return 'They paid in the end.';
    },
  },
  {
    kind: 'morale',
    weight: (_w, c) => (c.morale < 0.58 && c.workers > 5 ? 2 : 0),
    make: (w, c) => {
      const cost = staffCost(w, c, 5);
      return {
        kind: 'morale', from: 'HR', companyId: c.id, amount: cost,
        title: `${c.name}'s staff are unhappy`,
        body: `Morale is ${Math.round(c.morale * 100)}%. Unhappy staff work slower and quit, and every new hire starts slower. A ${fmtMoney(cost)} bonus would lift spirits; a pay rise (Company > People) fixes it for good.`,
        choices: [
          { id: 'bonus', label: `Pay a bonus (${fmtMoney(cost)})`, detail: '+12 morale' },
          { id: 'ignore', label: 'Ignore it', detail: '-Morale' },
        ],
        fallback: 'ignore', safe: 'bonus', best: 'bonus',
      };
    },
    resolve: (w, card, c, choice) => {
      if (choice === 'bonus' && payBill(w, c, card.amount ?? 0)) { c.morale = clamp(c.morale + 0.12, 0, 1); return 'Bonus paid: morale up.'; }
      c.morale = clamp(c.morale - 0.04, 0, 1);
      return 'Ignored: morale slipped further.';
    },
  },
  {
    kind: 'interview',
    weight: (_w, c) => (GOODS[c.good].tier === 'product' ? 0.3 : 0.1),
    make: (w, c) => ({
      kind: 'interview', from: 'Press office', companyId: c.id,
      title: `${pick(w.rng, ['Astoria Business Daily', 'The Morning Ledger', 'Market Talk TV'])} wants an interview`,
      body: `A reporter wants to profile ${c.name}. Good press lifts your brand; there's a small chance an awkward answer goes viral.`,
      choices: [
        { id: 'yes', label: 'Do the interview', detail: '+Brand · small risk' },
        { id: 'no', label: 'Decline', detail: 'No change' },
      ],
      fallback: 'no', safe: 'no', best: 'yes',
    }),
    resolve: (w, _card, c, choice) => {
      if (choice !== 'yes') return 'Declined.';
      if (chance(w.rng, 0.15)) { c.brand = clamp(c.brand - 0.02, 0.5, 1.7); return 'An awkward answer went viral. Slight brand damage.'; }
      c.brand = clamp(c.brand + 0.03, 0.5, 1.7);
      c.reach = Math.min(1.3, reachOf(c) + 0.02);
      return 'Great coverage: brand up, a few new customers.';
    },
  },
];

/** Monthly: your teams bring a few new decisions. */
export function monthlyInbox(w: WorldState): void {
  const cos = mine(w).filter((c) => w.day - c.founded >= 10);
  if (!cos.length) return;
  const want = Math.min(5, 2 + Math.floor(cos.length / 3));
  const open = openCards(w);
  const last = (w.play.cardLast ??= {});
  for (let n = 0; n < want; n++) {
    const opts: { t: Template; c: Company; wt: number }[] = [];
    for (const c of cos) {
      for (const t of TEMPLATES) {
        if (open.some((x) => x.companyId === c.id && x.kind === t.kind)) continue;
        if (w.day - (last[`${c.id}:${t.kind}`] ?? -999) < (COOLDOWN[t.kind] ?? 60)) continue;
        const wt = t.weight(w, c);
        if (wt > 0) opts.push({ t, c, wt });
      }
    }
    const total = opts.reduce((s, o) => s + o.wt, 0);
    if (total <= 0) return;
    let roll = next(w.rng) * total;
    const o = opts.find((x) => (roll -= x.wt) <= 0) ?? opts[opts.length - 1];
    last[`${o.c.id}:${o.t.kind}`] = w.day;
    open.push(pushCard(w, o.t.make(w, o.c)));
  }
}

/** Daily: managers answer cards for their companies; unanswered cards run out. */
export function dailyInbox(w: WorldState): void {
  const list = inbox(w);
  for (const card of list) {
    if (card.answered) continue;
    const c = card.companyId ? w.companies.find((x) => x.id === card.companyId) : undefined;
    const mgr = c?.isPlayer ? c.manager ?? 'none' : 'none';
    if (mgr === 'pro' && w.day > card.day) answer(w, card, card.best, 'manager');
    else if (mgr === 'basic' && w.day >= card.day + BASIC_WAIT) answer(w, card, card.safe, 'manager');
    else if (w.day >= card.expires) answer(w, card, card.fallback, 'timeout');
  }
  // keep answered cards for a month
  w.play.inbox = list.filter((x) => !x.answered || w.day - x.answered.day < 30).slice(-40);
}

function answer(w: WorldState, card: InboxCard, choiceId: string, by: 'you' | 'manager' | 'timeout'): string {
  const c = card.companyId ? w.companies.find((x) => x.id === card.companyId && !x.bankrupt) : undefined;
  let msg = 'The moment passed.';
  if (c) {
    if (card.kind.startsWith('rival')) msg = resolveRivalCard(w, card, c, choiceId);
    else {
      const t = TEMPLATES.find((x) => x.kind === card.kind);
      if (t) msg = t.resolve(w, card, c, choiceId);
    }
  }
  card.answered = { choiceId, message: msg, day: w.day, by };
  return msg;
}

export function answerInbox(w: WorldState, cardId: string, choiceId: string): CommandResult {
  const card = inbox(w).find((x) => x.id === cardId && !x.answered);
  if (!card) return { ok: false, message: 'That decision is already made' };
  if (!card.choices.some((x) => x.id === choiceId)) return { ok: false, message: 'Unknown choice' };
  return { ok: true, message: answer(w, card, choiceId, 'you') };
}
