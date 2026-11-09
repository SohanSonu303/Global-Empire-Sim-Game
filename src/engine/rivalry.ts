/**
 * Rivals fight back. From the day you enter their market they notice you, and when your companies
 * take their customers they strike back in their own style: price cuts, ad blitzes, poaching
 * your staff, or (the ruthless ones) a smear campaign. Each move lands in your inbox with ways to respond.
 */
import { GOODS } from './data';
import { addBoost, clamp, salaryOf, wageIndex } from './company';
import { remember } from './contracts';
import { payBill } from './events';
import { pushCard, size } from './inbox';
import { addNews, fmtMoney } from './news';
import { chance, next } from './rng';
import type { Company, GoodId, InboxCard, Rival, WorldState } from './types';

/** A rival company waits this long between strikes */
export const REACT_GAP = 70;
/** Days a price cut or ad blitz lasts */
export const MOVE_DAYS = 42;

const rivalOf = (w: WorldState, c: Company): Rival | undefined => w.rivals.find((r) => r.id === c.ownerId);
const round = (v: number) => (v > 100_000 ? Math.round(v / 1000) * 1000 : Math.round(v / 100) * 100);

/** The biggest rival-owned competitor in a market */
function topRivalCo(w: WorldState, g: GoodId): Company | undefined {
  return w.companies
    .filter((x) => x.good === g && !x.isPlayer && !x.bankrupt && rivalOf(w, x))
    .sort((a, b) => b.capacity - a.capacity)[0];
}

/** When you open a company, the biggest rival in that market gets in touch. */
export function rivalNotices(w: WorldState, c: Company): void {
  const x = topRivalCo(w, c.good);
  const rv = x && rivalOf(w, x);
  if (!x || !rv) return;
  const tough = rv.personality.aggression > 0.6;
  const friendly = rv.relation > 30;
  const line = friendly
    ? `"Good to see you in ${GOODS[c.good].name.toLowerCase()}. There's room for both of us, as long as you play fair."`
    : tough
      ? `"So you think you can sell ${GOODS[c.good].name.toLowerCase()}? ${x.name} has been doing it for years. Don't expect it to be easy."`
      : `"Welcome to the market. ${x.name} will be watching how you price."`;
  pushCard(w, {
    kind: 'rivalHello', from: rv.name, companyId: c.id, rivalId: rv.id,
    title: `${rv.name} has noticed ${c.name}`,
    body: `${line} ${rv.name} owns ${x.name}, the biggest ${GOODS[c.good].name.toLowerCase()} rival. Take their customers and they will strike back, ${tough ? 'probably with price cuts' : rv.personality.ethics < 0.4 ? 'and not always cleanly' : 'probably with advertising'}.`,
    choices: [
      { id: 'friendly', label: 'Reply politely', detail: '+Relationship · they react a little slower' },
      { id: 'bold', label: '"I\'m here to win"', detail: '-Relationship · they watch you closely' },
      { id: 'ignore', label: 'Ignore them', detail: 'No change' },
    ],
    fallback: 'ignore', safe: 'friendly', best: 'friendly',
  });
}

/** Weekly: rival companies that are losing share to you decide whether to strike back. */
export function weeklyRivalry(w: WorldState): void {
  for (const c of w.companies) {
    if (c.bankrupt) continue;
    c.shareRef = c.shareRef === undefined ? c.last.marketShare : c.shareRef * 0.92 + c.last.marketShare * 0.08;
  }
  const goods = [...new Set(w.companies.filter((c) => c.isPlayer && !c.bankrupt).map((c) => c.good))];
  for (const g of goods) {
    const players = w.companies.filter((c) => c.isPlayer && !c.bankrupt && c.good === g);
    const myShare = players.reduce((s, c) => s + c.last.marketShare, 0);
    const myGain = players.reduce((s, c) => s + c.last.marketShare - (c.shareRef ?? 0), 0);
    // Rivals notice a newcomer once it holds about 2% of the market, or is gaining fast
    if (myShare < 0.02 && myGain < 0.006) continue;
    const target = players.sort((a, b) => b.last.marketShare - a.last.marketShare)[0];
    const hurt = w.companies
      .filter((x) => x.good === g && !x.isPlayer && !x.bankrupt && rivalOf(w, x) && w.day - (x.lastReactDay ?? -999) > REACT_GAP && (x.shareRef ?? 0) > 0.01)
      .map((x) => ({ x, loss: 1 - x.last.marketShare / Math.max(1e-6, x.shareRef ?? 0) }))
      .filter((o) => o.loss > 0.04)
      .sort((a, b) => b.loss - a.loss)[0];
    if (!hurt) continue;
    const rv = rivalOf(w, hurt.x)!;
    const p = 0.25 + 0.5 * rv.personality.aggression - (rv.relation > 40 ? 0.3 : 0) + (rv.relation < -30 ? 0.2 : 0);
    if (!chance(w.rng, clamp(p, 0.05, 0.9))) continue;
    rivalStrike(w, rv, hurt.x, target);
  }
}

type Move = 'rivalPriceCut' | 'rivalAds' | 'rivalPoach' | 'rivalSmear';

function chooseMove(w: WorldState, rv: Rival): Move {
  const p = rv.personality;
  const opts: [Move, number][] = [
    ['rivalPriceCut', 0.4 + p.aggression],
    ['rivalAds', 0.4 + p.ambition],
    ['rivalPoach', 0.2 + p.negotiation * 0.6],
    ['rivalSmear', p.ethics < 0.45 ? 0.5 + (0.45 - p.ethics) * 2 : 0],
  ];
  const total = opts.reduce((s, o) => s + o[1], 0);
  let roll = next(w.rng) * total;
  return (opts.find((o) => (roll -= o[1]) <= 0) ?? opts[0])[0];
}

export function rivalStrike(w: WorldState, rv: Rival, x: Company, target: Company, move: Move = chooseMove(w, rv)): InboxCard {
  x.lastReactDay = w.day;
  const name = GOODS[x.good].name.toLowerCase();
  const scale = size(w, target);
  const base = { from: rv.name, companyId: target.id, rivalId: rv.id };
  remember(rv, w, -3, `${target.name} took customers from ${x.name}.`);
  if (move === 'rivalPriceCut') {
    addBoost(w, x, 'price', 0.92, MOVE_DAYS, `Fighting ${target.name}`);
    addNews(w, 'business', `${x.name} cuts ${name} prices 8%`, `${rv.name} is fighting to win back customers lost to ${target.name}.`, 'neutral', [x.id, target.id]);
    const ads = round(scale * 0.08);
    return pushCard(w, {
      ...base, kind: 'rivalPriceCut', amount: ads,
      title: `${x.name} cuts prices 8% to win back customers`,
      body: `"${rv.quote}" ${rv.name} has cut ${x.name}'s ${name} prices by 8% for six weeks, aimed at your customers. Match the cut and keep buyers at a thinner margin, outspend them on ads (${fmtMoney(ads)}), or hold your price and accept losing some sales for a while.`,
      choices: [
        { id: 'match', label: 'Match the cut', detail: '-7% price for 6 weeks · keep customers' },
        { id: 'ads', label: `Counter with ads (${fmtMoney(ads)})`, detail: '+20% orders for 6 weeks' },
        { id: 'hold', label: 'Hold your price', detail: 'Lose some sales for a while' },
      ],
      fallback: 'hold', safe: 'hold', best: (target.sum30.netIncome / Math.max(1, target.sum30.revenue)) > 0.12 ? 'match' : 'ads',
    });
  }
  if (move === 'rivalAds') {
    addBoost(w, x, 'attract', 1.25, MOVE_DAYS, `Ad blitz against ${target.name}`);
    addNews(w, 'business', `${x.name} launches a big ad campaign`, `${rv.name} wants its ${name} customers back.`, 'neutral', [x.id]);
    const ads = round(scale * 0.08);
    return pushCard(w, {
      ...base, kind: 'rivalAds', amount: ads,
      title: `${x.name} floods the market with ads`,
      body: `${rv.name} is spending big on advertising for ${x.name} for six weeks to pull buyers away from ${target.name}. A counter-campaign (${fmtMoney(ads)}) keeps your customers; doing nothing costs you some orders until it fades.`,
      choices: [
        { id: 'ads', label: `Counter-campaign (${fmtMoney(ads)})`, detail: '+20% orders for 6 weeks' },
        { id: 'hold', label: 'Ride it out', detail: 'Lose some orders for a while' },
      ],
      fallback: 'hold', safe: 'hold', best: 'ads',
    });
  }
  if (move === 'rivalPoach') {
    const lost = Math.round(target.workers * 0.06);
    target.workers = Math.max(0, target.workers - lost);
    target.skill = clamp((target.skill ?? 1) - 0.03, 0.6, 1.2);
    const bonus = round(target.workers * salaryOf(target) * target.salaryMult * wageIndex(w) * 4);
    addNews(w, 'business', `${x.name} poaches staff from ${target.name}`, `${lost} experienced workers were lured away with higher pay.`, 'bad', [target.id]);
    return pushCard(w, {
      ...base, kind: 'rivalPoach', amount: bonus,
      title: `${x.name} is poaching your staff`,
      body: `${rv.name}'s ${x.name} lured ${lost} of ${target.name}'s best workers with better pay. Retention bonuses (${fmtMoney(bonus)}) win half of them back and stop more leaving. Otherwise you'll hire replacements, who start slower.`,
      choices: [
        { id: 'retain', label: `Retention bonuses (${fmtMoney(bonus)})`, detail: 'Half come back · +Morale' },
        { id: 'let', label: 'Let them go', detail: 'Hire new staff · -Morale' },
      ],
      fallback: 'let', safe: 'retain', best: 'retain',
    });
  }
  // Smear
  target.brand = clamp(target.brand - 0.04, 0.5, 1.7);
  target.satisfaction = clamp((target.satisfaction ?? 0.75) - 0.05, 0, 1);
  addNews(w, 'business', `Rumours spread about ${target.name}`, `Stories questioning ${target.name}'s ${name} are doing the rounds. Insiders point at ${rv.name}.`, 'bad', [target.id]);
  const pr = round(scale * 0.05);
  return pushCard(w, {
    ...base, kind: 'rivalSmear', amount: pr,
    title: `${rv.name} is spreading rumours about ${target.name}`,
    body: `Stories questioning ${target.name}'s products are everywhere, and they trace back to ${rv.name}. A PR response (${fmtMoney(pr)}) repairs the damage. Suing costs ${fmtMoney(pr * 2)} and wins about half the time, with damages paid to you.`,
    choices: [
      { id: 'pr', label: `PR response (${fmtMoney(pr)})`, detail: 'Brand back' },
      { id: 'sue', label: `Sue (${fmtMoney(pr * 2)})`, detail: '50%: brand back + damages' },
      { id: 'ignore', label: 'Ignore it', detail: 'The damage stays' },
    ],
    fallback: 'ignore', safe: 'pr', best: 'pr',
  });
}

export function resolveRivalCard(w: WorldState, card: InboxCard, c: Company, choice: string): string {
  const rv = w.rivals.find((r) => r.id === card.rivalId);
  const cost = card.amount ?? 0;
  switch (card.kind) {
    case 'rivalHello':
      if (choice === 'friendly') { remember(rv, w, 6, `${c.name} answered politely.`); return 'You traded pleasantries.'; }
      if (choice === 'bold') {
        remember(rv, w, -8, `${c.name} said it is here to win.`);
        for (const x of w.companies) if (x.good === c.good && x.ownerId === rv?.id) x.lastReactDay = -999;
        return `${rv?.name ?? 'They'} won't forget that.`;
      }
      return 'No reply sent.';
    case 'rivalPriceCut':
      if (choice === 'match') { addBoost(w, c, 'price', 0.93, MOVE_DAYS, 'Matching a rival price cut'); return 'Price matched for six weeks.'; }
      if (choice === 'ads') {
        if (!payBill(w, c, cost)) return 'Not enough cash for the campaign.';
        addBoost(w, c, 'attract', 1.2, MOVE_DAYS, 'Counter-campaign');
        return 'Counter-campaign running.';
      }
      return 'You held your price.';
    case 'rivalAds':
      if (choice === 'ads') {
        if (!payBill(w, c, cost)) return 'Not enough cash for the campaign.';
        addBoost(w, c, 'attract', 1.2, MOVE_DAYS, 'Counter-campaign');
        return 'Counter-campaign running.';
      }
      return 'You rode it out.';
    case 'rivalPoach':
      if (choice === 'retain' && payBill(w, c, cost)) {
        c.workers += Math.round(c.workers * 0.03);
        c.morale = clamp(c.morale + 0.06, 0, 1);
        return 'Half of them came back, and the rest are staying.';
      }
      c.morale = clamp(c.morale - 0.04, 0, 1);
      return choice === 'retain' ? 'Not enough cash: they stayed gone.' : 'They are gone. Recruiting replacements.';
    case 'rivalSmear':
      if (choice === 'pr' && payBill(w, c, cost)) { c.brand = clamp(c.brand + 0.04, 0.5, 1.7); return 'PR campaign repaired your reputation.'; }
      if (choice === 'sue' && payBill(w, c, cost * 2)) {
        remember(rv, w, -10, `${c.name} took me to court.`);
        if (chance(w.rng, 0.5)) {
          c.brand = clamp(c.brand + 0.05, 0.5, 1.7);
          const damages = cost * 3;
          if (rv) rv.cash -= damages;
          c.cash += damages;
          addNews(w, 'player', `${c.name} wins its case against ${rv?.name ?? 'a rival'}`, `The court ordered ${fmtMoney(damages)} in damages for the smear campaign.`, 'good', [c.id]);
          return `You won: ${fmtMoney(damages)} in damages.`;
        }
        return 'You lost the case.';
      }
      return choice === 'ignore' ? 'You let it blow over.' : 'Not enough cash.';
  }
  return 'Done.';
}

/** Customers a company would keep with a matching price cut, for the advisor */
export function rivalMoves(w: WorldState, c: Company): { name: string; why: string; until: number }[] {
  return w.companies
    .filter((x) => x.good === c.good && !x.isPlayer && (x.boosts ?? []).some((b) => b.why.includes(c.name)))
    .map((x) => {
      const b = x.boosts!.find((y) => y.why.includes(c.name))!;
      return { name: x.name, why: b.why, until: b.until };
    });
}

