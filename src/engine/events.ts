import { chance, int, next, pick, range } from './rng';
import { GOODS } from './data';
import { clamp, companyValue, drawCredit, refPrice } from './company';
import { dailyNeed, remember as rememberRival } from './contracts';
import { stockByTicker } from './market';
import { outsidePct, transferCompany } from './ownership';
import { addNews, fmtMoney, fmtPct } from './news';
import { resolveStrategyEvent } from './strategy';
import type { CommandResult, Company, PendingEvent, WorldState } from './types';

/**
 * Event engine. Events only change underlying variables (oil supply, confidence,
 * demand, a company's quality/morale) and let the simulation compute consequences.
 */
export function dailyEvents(w: WorldState): void {
  w.effects = w.effects.filter((e) => e.untilDay > w.day);
  const r = w.rng;

  const oilActive = w.effects.some((e) => e.kind === 'oilSupply');
  if (!oilActive && chance(r, 1 / 420)) {
    const delta = -range(r, 0.15, 0.3);
    const dur = int(r, 60, 140);
    w.effects.push({ id: `e${++w.seq}`, kind: 'oilSupply', delta, untilDay: w.day + dur });
    addNews(w, 'commodities', 'Oil supply disrupted as key pipeline shuts',
      `Supply falls by roughly ${fmtPct(-delta, 0)}. Traders expect higher fuel costs for manufacturers and a windfall for energy producers.`, 'bad');
  } else if (!oilActive && chance(r, 1 / 600)) {
    const delta = range(r, 0.12, 0.25);
    w.effects.push({ id: `e${++w.seq}`, kind: 'oilSupply', delta, untilDay: w.day + int(r, 60, 120) });
    addNews(w, 'commodities', 'Oil glut as new fields come online',
      `Supply rises by about ${fmtPct(delta, 0)}. Cheaper energy should ease costs across industry.`, 'good');
  }

  if (chance(r, 1 / 500)) {
    const delta = -range(r, 0.08, 0.18);
    w.effects.push({ id: `e${++w.seq}`, kind: 'confidence', delta, untilDay: w.day + int(r, 45, 100) });
    addNews(w, 'economy', 'Household confidence slips on job fears',
      'Surveys show families delaying big purchases. Retailers brace for softer demand.', 'bad');
  }

  // Hype and slumps for consumer products ripple down the supply chain
  if (chance(r, 1 / 160)) {
    const h = pick(r, HYPE);
    const up = next(r) < 0.65;
    const delta = range(r, 0.12, 0.3) * (up ? 1 : -1);
    w.effects.push({ id: `e${++w.seq}`, kind: 'goodDemand', target: h.good, delta, untilDay: w.day + int(r, 60, 150) });
    const inputs = GOODS[h.good].inputs.map((i) => GOODS[i.good].name.toLowerCase());
    addNews(w, 'business', up ? h.up : h.down,
      up
        ? `Demand for ${GOODS[h.good].name.toLowerCase()} could rise about ${fmtPct(delta, 0)}.${inputs.length ? ` Suppliers of ${inputs.join(' and ')} should see more orders too.` : ''}`
        : `Demand for ${GOODS[h.good].name.toLowerCase()} could fall about ${fmtPct(-delta, 0)}. Producers with high fixed costs are most exposed.`,
      up ? 'good' : 'bad');
  }

  // Supply shocks for raw materials
  if (chance(r, 1 / 380)) {
    const s = pick(r, SHOCKS);
    if (!w.effects.some((e) => e.kind === 'goodSupply' && e.target === s.good)) {
      const delta = -range(r, 0.15, 0.35);
      w.effects.push({ id: `e${++w.seq}`, kind: 'goodSupply', target: s.good, delta, untilDay: w.day + int(r, 40, 110) });
      addNews(w, 'commodities', s.headline,
        `Output of ${GOODS[s.good].name.toLowerCase()} falls by about ${fmtPct(-delta, 0)}. Buyers face higher prices and imports.`, 'bad');
    }
  }

  if (chance(r, 1 / 250)) {
    const techs = w.companies.filter((c) => c.industry === 'tech' && !c.bankrupt);
    if (techs.length) {
      const c = pick(r, techs);
      c.quality = clamp(c.quality + 0.12, 0.6, 1.7);
      addNews(w, 'technology', `${c.name} unveils breakthrough product`,
        `Analysts say the launch raises ${c.name}'s product quality well above rivals.`, 'good', [c.id]);
      const s = c.ticker ? stockByTicker(w, c.ticker) : undefined;
      if (s) { s.newsImpact += 0.03; s.sentiment = clamp(s.sentiment + 0.4, -1, 1); }
    }
  }

  // Systemic: strikes at companies with very low morale
  for (const c of w.companies) {
    if (!c.bankrupt && c.morale < 0.3 && c.strikeUntil <= w.day && chance(r, 0.02)) {
      c.strikeUntil = w.day + int(r, 3, 7);
      addNews(w, 'business', `Workers strike at ${c.name}`, `Staff walked out over pay. Production has stopped until a deal is reached.`, 'bad', [c.id]);
    }
  }

  accidents(w);
  maybePlayerDilemma(w);
}

// ---------- unforeseen costs: fires, breakdowns, new rules ----------

/** Daily chance per company. Worn (patched) machines break down three times as often. */
const FIRE_CHANCE = 1 / 1500;
const BREAKDOWN_CHANCE = 1 / 450;
const INSPECTION_CHANCE = 1 / 900;

/** What a repair or upgrade costs: a share of the plant's book value. */
function billFor(c: Company, lo: number, hi: number, min: number, rng: WorldState['rng']): number {
  return Math.max(min, c.assets * range(rng, lo, hi));
}

/** Pay a bill from company cash, then its credit line, then your personal cash. */
export function payBill(w: WorldState, c: Company, cost: number): boolean {
  if (c.cash < cost) drawCredit(w, c, cost - Math.max(0, c.cash), 'repairs');
  if (c.cash < cost && c.isPlayer) {
    const fromYou = Math.min(w.player.cash, cost - Math.max(0, c.cash));
    w.player.cash -= fromYou;
    c.cash += fromYou;
  }
  if (c.cash < cost) return false;
  c.cash -= cost;
  return true;
}

function accidents(w: WorldState): void {
  const r = w.rng;
  for (const c of w.companies) {
    if (c.bankrupt || w.day - c.founded < 20 || (c.damage && c.damage.untilDay > w.day)) continue;
    const busy = c.isPlayer && w.pending.some((e) => e.companyId === c.id);
    if (busy) continue;
    const kind = chance(r, FIRE_CHANCE) ? 'fire' : chance(r, BREAKDOWN_CHANCE * (c.worn ? 3 : 1)) ? 'breakdown' : chance(r, INSPECTION_CHANCE) ? 'inspection' : null;
    if (!kind) continue;
    if (!c.isPlayer) { aiAccident(w, c, kind); continue; }
    const id = `ev${++w.seq}`;
    let ev: PendingEvent;
    if (kind === 'fire') {
      const cost = billFor(c, 0.1, 0.18, 15_000, r);
      c.damage = { mult: 0.5, untilDay: w.day + 120, cause: 'Fire damage' };
      c.inventory *= 0.5;
      c.morale = clamp(c.morale - 0.05, 0, 1);
      ev = {
        id, template: 'fire', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 7,
        title: `Fire at ${c.name}!`,
        body: `A fire tore through part of the plant. Nobody was hurt, but half the stock is gone and output is down to 50% until it is rebuilt.`,
        choices: [
          { id: 'rebuild', label: `Rebuild properly (${fmtMoney(cost)})`, detail: 'Back to full output in 10 days' },
          { id: 'patch', label: `Quick patch (${fmtMoney(cost * 0.4)})`, detail: '80% output for 60 days' },
          { id: 'wait', label: 'Do nothing for now', detail: '50% output for 120 days' },
        ],
      };
      ev.amount = cost;
      addNews(w, 'player', `Fire at ${c.name}`, 'Part of the plant burned down. Output is cut while it is repaired.', 'bad', [c.id]);
    } else if (kind === 'breakdown') {
      const cost = billFor(c, 0.05, 0.09, 8_000, r);
      c.damage = { mult: 0.7, untilDay: w.day + 60, cause: 'Broken equipment' };
      ev = {
        id, template: 'breakdown', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 7,
        title: `Machinery breaks down at ${c.name}`,
        body: `A key production line has failed${c.worn ? ' again: the patched machine gave out' : ''}. Output is down to 70% until it is fixed.`,
        choices: [
          { id: 'replace', label: `Buy new equipment (${fmtMoney(cost)})`, detail: 'Full output now · +Quality' },
          { id: 'repair', label: `Repair it (${fmtMoney(cost * 0.35)})`, detail: 'Full output · may break again' },
          { id: 'run', label: 'Keep running as is', detail: '70% output for 60 days' },
        ],
      };
      ev.amount = cost;
    } else {
      const cost = billFor(c, 0.04, 0.08, 10_000, r);
      ev = {
        id, template: 'inspection', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 10,
        title: `New safety rules for ${c.name}`,
        body: `The government requires new safety equipment in ${GOODS[c.good].name.toLowerCase()} plants. Inspectors will check soon.`,
        choices: [
          { id: 'install', label: `Install it (${fmtMoney(cost)})`, detail: 'Stay compliant' },
          { id: 'ignore', label: 'Ignore the rules', detail: `Fine ${fmtMoney(cost * 0.5)} · Plant shut 7 days · -Brand` },
        ],
      };
      ev.amount = cost;
    }
    w.pending.push(ev);
  }
}

/** AI companies just pay to fix things; a short dip in output. */
function aiAccident(w: WorldState, c: Company, kind: 'fire' | 'breakdown' | 'inspection'): void {
  const r = w.rng;
  if (kind === 'fire') {
    payBill(w, c, billFor(c, 0.1, 0.18, 15_000, r));
    c.damage = { mult: 0.5, untilDay: w.day + 10, cause: 'Fire damage' };
    c.inventory *= 0.5;
    addNews(w, 'business', `Fire at ${c.name}`, `Output of ${GOODS[c.good].name.toLowerCase()} is cut while the plant is rebuilt.`, 'bad', [c.id]);
    const s = c.ticker ? stockByTicker(w, c.ticker) : undefined;
    if (s) s.newsImpact -= 0.03;
  } else if (kind === 'breakdown') {
    payBill(w, c, billFor(c, 0.05, 0.09, 8_000, r));
    c.damage = { mult: 0.8, untilDay: w.day + 3, cause: 'Broken equipment' };
  } else {
    payBill(w, c, billFor(c, 0.04, 0.08, 10_000, r));
  }
}

const DILEMMA_GAP = 40;

function maybePlayerDilemma(w: WorldState): void {
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  if (mine.length === 0 || w.pending.length > 0) return;
  if (w.day - w.lastDilemmaDay < DILEMMA_GAP || !chance(w.rng, 1 / 15)) return;
  const c = pick(w.rng, mine);
  const roll = next(w.rng);
  let ev: PendingEvent | null = null;
  const id = `ev${++w.seq}`;
  if (roll < 0.35) {
    ev = {
      id, template: 'union', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 10,
      title: 'Union demands a raise',
      body: `Workers at ${c.name} want a 10% pay rise. Morale is ${Math.round(c.morale * 100)}%.`,
      choices: [
        { id: 'accept', label: 'Accept 10% raise', detail: '+Morale · Higher wages' },
        { id: 'counter', label: 'Counter with 4%', detail: 'Small morale boost' },
        { id: 'reject', label: 'Reject', detail: '-Morale · Strike risk' },
      ],
    };
  } else if (roll < 0.65 && contractBuyer(w, c)) {
    const buyer = contractBuyer(w, c)!;
    const rv = w.rivals.find((x) => x.id === buyer.ownerId);
    const qty = Math.max(1, Math.round(Math.min(dailyNeed(buyer, c.good) * 0.6, c.capacity * 0.5)));
    const price = refPrice(w, c.good) * 0.9;
    ev = {
      id, template: 'contract', day: w.day, companyId: c.id, rivalId: rv?.id ?? null, expiresDay: w.day + 10,
      title: `${buyer.name} wants a supply deal`,
      body: `${buyer.name}${rv ? ` (owned by ${rv.name})` : ''} will buy ${qty.toLocaleString()} ${GOODS[c.good].unit} of ${GOODS[c.good].name.toLowerCase()} a day from ${c.name} for 60 days at ${fmtMoney(price)} each, 10% under market. Steady sales, thinner margin.`,
      choices: [
        { id: 'accept', label: 'Sign the deal', detail: '+Steady sales · +Relationship' },
        { id: 'decline', label: 'Decline', detail: '-Relationship' },
      ],
    };
    ev.amount = qty;
  } else if (roll < 0.85 && !c.ticker && companyValue(c) > 200_000 && w.rivals.some((x) => x.relation < 30)) {
    const rv = w.rivals.find((x) => x.focus.includes(c.industry) && x.relation < 30) ?? pick(w.rng, w.rivals.filter((x) => x.relation < 30));
    const offer = companyValue(c) * range(w.rng, 1.15, 1.45);
    ev = {
      id, template: 'takeover', day: w.day, companyId: c.id, rivalId: rv.id, expiresDay: w.day + 7,
      title: 'Takeover bid!',
      body: `${rv.name} offers ${fmtMoney(offer)} for 100% of ${c.name} (estimated value ${fmtMoney(companyValue(c))}).${outsidePct(c) > 0 ? ` Your partners get their ${fmtPct(outsidePct(c), 0)} of the price.` : ''} "${rv.quote}"`,
      choices: [
        { id: 'sell', label: `Sell for ${fmtMoney(offer)}`, detail: '+Cash · Lose the company' },
        { id: 'negotiate', label: 'Negotiate for 15% more', detail: 'May walk away · -Relationship if so' },
        { id: 'reject', label: 'Reject the bid', detail: '-Relationship' },
      ],
    };
    ev.amount = offer;
  } else {
    const cost = Math.max(15_000, c.sum30.revenue * 0.08);
    ev = {
      id, template: 'campaign', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 10,
      title: 'Ad agency pitches a campaign',
      body: `A national campaign for ${c.name} costs ${fmtMoney(cost)} from company cash and would lift brand strength.`,
      choices: [
        { id: 'buy', label: `Run it (${fmtMoney(cost)})`, detail: '+Brand · -Cash' },
        { id: 'pass', label: 'Pass', detail: 'No change' },
      ],
    };
    ev.amount = cost;
  }
  if (ev) {
    w.pending.push(ev);
    w.lastDilemmaDay = w.day;
  }
}

export function expireEvents(w: WorldState): void {
  const expired = w.pending.filter((e) => e.expiresDay <= w.day);
  for (const e of expired) resolveEvent(w, e.id, e.choices[e.choices.length - 1].id);
}

export function resolveEvent(w: WorldState, eventId: string, choiceId: string): CommandResult {
  const ev = w.pending.find((e) => e.id === eventId);
  if (!ev) return { ok: false, message: 'Event not found' };
  w.pending = w.pending.filter((e) => e.id !== eventId);
  const c = w.companies.find((x) => x.id === ev.companyId) as Company | undefined;
  const rv = w.rivals.find((x) => x.id === ev.rivalId);
  if (!c || c.bankrupt || !c.isPlayer) return { ok: true, message: 'The situation resolved itself.' };
  if (ev.template === 'antitrust' || ev.template === 'venture') return resolveStrategyEvent(w, ev, c, choiceId);
  const remember = (delta: number, text: string) => {
    if (!rv) return;
    rv.relation = clamp(rv.relation + delta, -100, 100);
    rv.memory.unshift({ day: w.day, text, delta });
    rv.memory.length = Math.min(rv.memory.length, 20);
  };

  switch (ev.template) {
    case 'union':
      if (choiceId === 'accept') { c.salaryMult *= 1.1; c.morale = clamp(c.morale + 0.2, 0, 1); }
      else if (choiceId === 'counter') { c.salaryMult *= 1.04; c.morale = clamp(c.morale + 0.06, 0, 1); }
      else {
        c.morale = clamp(c.morale - 0.2, 0, 1);
        if (chance(w.rng, 0.5)) {
          c.strikeUntil = w.day + 5;
          addNews(w, 'player', `Strike hits ${c.name}`, 'Workers walked out after management rejected their pay claim.', 'bad', [c.id]);
        }
      }
      return { ok: true, message: 'Decision made.' };
    case 'contract': {
      const buyer = contractBuyer(w, c);
      if (choiceId === 'accept' && buyer) {
        w.seq += 1;
        w.contracts.push({
          id: `k${w.seq}`, good: c.good, sellerId: c.id, buyerId: buyer.id, qtyPerDay: ev.amount ?? 1, price: refPrice(w, c.good) * 0.9,
          startDay: w.day + 1, endDay: w.day + 60, shortfall: 0, delivered: 0,
        });
        rememberRival(rv, w, 6, `${c.name} signed a supply deal with ${buyer.name}.`);
        return { ok: true, message: `Deal signed with ${buyer.name}` };
      }
      rememberRival(rv, w, -3, `${c.name} turned down a supply deal.`);
      return { ok: true, message: 'Deal declined.' };
    }
    case 'takeover': {
      const offer = ev.amount ?? companyValue(c);
      const sell = (price: number) => {
        if (!rv) return;
        transferCompany(w, c, rv.id, price); // partners get their share of the price
      };
      if (choiceId === 'sell') { sell(offer); return { ok: true, message: `Sold for ${fmtMoney(offer)}` }; }
      if (choiceId === 'negotiate') {
        const p = rv ? 0.35 + rv.personality.negotiation * -0.2 + rv.personality.ambition * 0.4 : 0.4;
        if (chance(w.rng, p)) { sell(offer * 1.15); return { ok: true, message: `They agreed: sold for ${fmtMoney(offer * 1.15)}` }; }
        remember(-8, `Tried to squeeze me on ${c.name}.`);
        return { ok: true, message: `${rv?.name ?? 'The bidder'} walked away.` };
      }
      remember(-10, `Rejected my bid for ${c.name}.`);
      return { ok: true, message: 'Bid rejected.' };
    }
    case 'fire': {
      const cost = ev.amount ?? 0;
      if (choiceId === 'rebuild') {
        if (!payBill(w, c, cost)) return { ok: true, message: 'Not enough money to rebuild: output stays at 50%.' };
        c.damage = { mult: 0.5, untilDay: w.day + 10, cause: 'Rebuilding after the fire' };
        return { ok: true, message: `Rebuilding: full output in 10 days (${fmtMoney(cost)})` };
      }
      if (choiceId === 'patch') {
        if (!payBill(w, c, cost * 0.4)) return { ok: true, message: 'Not enough money for repairs: output stays at 50%.' };
        c.damage = { mult: 0.8, untilDay: w.day + 60, cause: 'Patched-up fire damage' };
        return { ok: true, message: `Patched up: 80% output for 60 days (${fmtMoney(cost * 0.4)})` };
      }
      return { ok: true, message: 'Output stays at 50% for 120 days.' };
    }
    case 'breakdown': {
      const cost = ev.amount ?? 0;
      if (choiceId === 'replace') {
        if (!payBill(w, c, cost)) return { ok: true, message: 'Not enough money: output stays at 70%.' };
        delete c.damage;
        c.worn = false;
        c.quality = clamp(c.quality + 0.02, 0.6, 1.7);
        return { ok: true, message: `New equipment installed (${fmtMoney(cost)})` };
      }
      if (choiceId === 'repair') {
        if (!payBill(w, c, cost * 0.35)) return { ok: true, message: 'Not enough money: output stays at 70%.' };
        delete c.damage;
        c.worn = true;
        return { ok: true, message: `Repaired (${fmtMoney(cost * 0.35)}). It may break down again.` };
      }
      return { ok: true, message: 'Running at 70% for 60 days.' };
    }
    case 'inspection': {
      const cost = ev.amount ?? 0;
      if (choiceId === 'install') {
        if (payBill(w, c, cost)) return { ok: true, message: `Safety equipment installed (${fmtMoney(cost)})` };
      }
      payBill(w, c, cost * 0.5);
      c.damage = { mult: 0, untilDay: w.day + 7, cause: 'Closed by inspectors' };
      c.brand = clamp(c.brand - 0.04, 0.5, 1.7);
      addNews(w, 'player', `Inspectors shut ${c.name}`, 'The plant broke new safety rules. It is fined and closed for a week.', 'bad', [c.id]);
      return { ok: true, message: 'Fined and closed for 7 days.' };
    }
    case 'campaign': {
      const cost = ev.amount ?? 0;
      if (choiceId === 'buy') {
        if (c.cash < cost) return { ok: true, message: 'Not enough company cash; the agency moved on.' };
        c.cash -= cost;
        c.brand = clamp(c.brand + 0.12, 0.5, 1.7);
        return { ok: true, message: 'Campaign launched.' };
      }
      return { ok: true, message: 'Passed.' };
    }
  }
  return { ok: true, message: 'Done.' };
}

const HYPE: { good: import('./types').GoodId; up: string; down: string }[] = [
  { good: 'cars', up: 'Electric car craze sweeps Astoria', down: 'Car sales stall as buyers wait for cheaper models' },
  { good: 'phones', up: 'New phone launch sparks buying frenzy', down: 'Phone upgrades slow as buyers keep old handsets' },
  { good: 'appliances', up: 'Housing boom lifts appliance orders', down: 'Appliance demand slips as home sales cool' },
  { good: 'software', up: 'Businesses rush to buy new software', down: 'Software budgets frozen across Astoria' },
  { good: 'clothing', up: 'Fashion week sets off a shopping spree', down: 'Shoppers skip the new season' },
  { good: 'food', up: 'Families stock up on groceries', down: 'Grocery spending tightens' },
  { good: 'electricity', up: 'Heatwave sends power use soaring', down: 'Mild weather cuts power demand' },
  { good: 'banking', up: 'Savers flock to new accounts', down: 'Customers pull back from banks' },
  { good: 'furniture', up: 'New homes spark a furniture rush', down: 'Furniture sales sag as moves slow' },
  { good: 'laptops', up: 'Schools and offices order laptops in bulk', down: 'Laptop sales cool after a big upgrade year' },
  { good: 'medicine', up: 'Flu season empties pharmacy shelves', down: 'A mild winter cuts medicine sales' },
  { good: 'telecom', up: 'Streaming boom drives demand for data plans', down: 'Families trim phone plans' },
  { good: 'clinics', up: 'Clinics packed as a virus spreads', down: 'Fewer patient visits this season' },
];

const SHOCKS: { good: import('./types').GoodId; headline: string }[] = [
  { good: 'grain', headline: 'Drought scorches grain harvest' },
  { good: 'cotton', headline: 'Pests ruin part of the cotton crop' },
  { good: 'iron_ore', headline: 'Mine flooding halts iron ore output' },
  { good: 'silicon', headline: 'Silicon refinery fire cuts supply' },
  { good: 'timber', headline: 'Forest fires halt logging' },
];

/** An AI company that uses this player company's good (rival-owned first). */
function contractBuyer(w: WorldState, c: Company): Company | undefined {
  const users = w.companies.filter((x) => !x.isPlayer && !x.bankrupt && dailyNeed(x, c.good) > 0);
  users.sort((a, b) => (a.ownerId === 'public' ? 1 : 0) - (b.ownerId === 'public' ? 1 : 0) || b.capacity - a.capacity);
  return users[0];
}
