import { describe, expect, it } from 'vitest';
import {
  BUILD_COST_MULT, GOODS, MAINT, NEW_REACH, adviseCompany, applyCommand, companyValue, createWorld, cycleOf, daysToReach, inbox, monthlyCycle,
  openCards, reachOf, rivalStrike, monthlyInbox, startCost, step,
} from '../src/engine';
import type { Company, WorldState } from '../src/engine';

function run(w: WorldState, days: number, each?: () => void) {
  for (let i = 0; i < days; i++) { step(w); w.pending = []; each?.(); }
}
function found(w: WorldState, good: Company['good'], name = 'Mine'): Company {
  w.player.cash = Math.max(w.player.cash, startCost(good) * 2);
  if (w.player.licences?.length) applyCommand(w, { type: 'buyLicence', industry: GOODS[good].industry });
  const r = applyCommand(w, { type: 'foundCompany', name, good });
  expect(r.ok, r.message).toBe(true);
  return w.companies.find((c) => c.name === name)!;
}

describe('winning customers', () => {
  it('a new company starts with few customers and wins them over months; marketing speeds it up', () => {
    const w = createWorld(4);
    const c = found(w, 'clothing');
    expect(reachOf(c)).toBeCloseTo(NEW_REACH);
    const slow = daysToReach(w, c, 0.8);
    const fast = daysToReach(w, c, 0.8, 0.06);
    expect(fast).toBeLessThan(slow * 0.75);
    run(w, 150);
    expect(reachOf(c)).toBeGreaterThan(0.6);
  }, 60000);

  it('plants cost more to build, but a hands-off company pays for itself within about two years', () => {
    expect(BUILD_COST_MULT).toBeGreaterThan(1.4);
    const w = createWorld(21, 'established');
    const c = found(w, 'food');
    const cost = startCost('food');
    let net = 0;
    let payback = -1;
    run(w, 730, () => { net += c.last.netIncome; if (payback < 0 && net >= cost) payback = w.day; });
    expect(payback).toBeGreaterThan(150); // not a few weeks any more
    expect(payback).toBeLessThan(730);
  }, 120000);
});

describe('the monthly inbox and managers', () => {
  it('brings decisions every month, and unanswered ones take the default', () => {
    const w = createWorld(4);
    found(w, 'clothing');
    run(w, 30);
    expect(inbox(w).length).toBeGreaterThan(0);
    run(w, 30);
    expect(inbox(w).some((x) => x.answered?.by === 'timeout')).toBe(true);
  }, 60000);

  it('a top manager answers at once with the best choice; a manager picks the safe one', () => {
    const w = createWorld(5);
    const a = found(w, 'clothing', 'Alpha');
    applyCommand(w, { type: 'setManager', companyId: a.id, manager: 'pro' });
    run(w, 60);
    const mine = inbox(w).filter((x) => x.companyId === a.id && x.answered);
    expect(mine.length).toBeGreaterThan(0);
    for (const x of mine) if (x.answered!.by === 'manager') expect(x.answered!.choiceId).toBe(x.best);
    expect(a.sum30.fixed).toBeGreaterThan(0);
    applyCommand(w, { type: 'setManager', companyId: a.id, manager: 'basic' });
    run(w, 60);
    for (const x of inbox(w).filter((y) => y.companyId === a.id && y.answered?.by === 'manager' && y.answered.day > w.day - 50)) {
      expect([x.safe, x.best]).toContain(x.answered!.choiceId);
    }
  }, 60000);

  it('does not repeat the same decision every week', () => {
    const w = createWorld(6);
    found(w, 'food');
    run(w, 14);
    for (let i = 0; i < 4; i++) { w.day += 30; monthlyInbox(w); }
    const kinds = inbox(w).map((x) => x.kind).filter((k) => k !== 'rivalHello');
    const raises = kinds.filter((k) => k === 'raise').length;
    expect(raises).toBeLessThanOrEqual(1);
  });

  it('answering a card applies its effect', () => {
    const w = createWorld(7);
    const c = found(w, 'clothing');
    run(w, 35);
    const card = openCards(w)[0];
    expect(card).toBeDefined();
    const r = applyCommand(w, { type: 'answerInbox', cardId: card.id, choiceId: card.choices[0].id });
    expect(r.ok).toBe(true);
    expect(card.answered?.by).toBe('you');
    expect(applyCommand(w, { type: 'answerInbox', cardId: card.id, choiceId: card.choices[0].id }).ok).toBe(false);
    expect(c.bankrupt).toBe(false);
  }, 60000);
});

describe('rivals', () => {
  it('the biggest rival in the market gets in touch the day you open', () => {
    const w = createWorld(3);
    found(w, 'steel');
    const hello = inbox(w).find((x) => x.kind === 'rivalHello');
    expect(hello).toBeDefined();
    expect(w.rivals.some((r) => r.id === hello!.rivalId)).toBe(true);
  });

  it('a price cut lands in your inbox, and matching it lowers your price for six weeks', () => {
    const w = createWorld(3);
    const c = found(w, 'steel');
    run(w, 10);
    const x = w.companies.find((y) => y.good === 'steel' && !y.isPlayer && w.rivals.some((r) => r.id === y.ownerId))!;
    const rv = w.rivals.find((r) => r.id === x.ownerId)!;
    const card = rivalStrike(w, rv, x, c, 'rivalPriceCut');
    expect((x.boosts ?? []).some((b) => b.kind === 'price' && b.mult < 1)).toBe(true);
    const before = c.priceMult;
    expect(applyCommand(w, { type: 'answerInbox', cardId: card.id, choiceId: 'match' }).ok).toBe(true);
    expect((c.boosts ?? []).some((b) => b.kind === 'price' && b.mult < 1)).toBe(true);
    expect(c.priceMult).toBe(before); // the list price stays; the cut is temporary
  }, 60000);
});

describe('machines, staff and cash flow', () => {
  it('low maintenance wears machines down; high maintenance brings them back', () => {
    const w = createWorld(8);
    const c = found(w, 'clothing');
    applyCommand(w, { type: 'setMaintenance', companyId: c.id, level: 'low' });
    run(w, 120, () => { c.last.produced = c.capacity; });
    const worn = c.condition!;
    expect(worn).toBeLessThan(0.9);
    applyCommand(w, { type: 'setMaintenance', companyId: c.id, level: 'high' });
    run(w, 60);
    expect(c.condition!).toBeGreaterThan(worn);
    expect(MAINT.high.cost).toBeGreaterThan(MAINT.normal.cost);
  }, 60000);

  it('business customers pay late, and what they owe still counts toward the company value', () => {
    const w = createWorld(9);
    const c = found(w, 'steel');
    run(w, 60);
    expect(c.receivables ?? 0).toBeGreaterThan(0);
    const v = companyValue(c);
    const owed = c.receivables!;
    c.receivables = 0;
    expect(companyValue(c)).toBeCloseTo(Math.max(0, v - owed), -2);
  }, 60000);
});

describe('booms and recessions', () => {
  it('warns before a recession, then cuts demand, then recovers', () => {
    const w = createWorld(10);
    const cy = cycleOf(w);
    cy.nextDown = w.day;
    monthlyCycle(w);
    expect(cy.phase).toBe('warning');
    w.day = cy.until;
    monthlyCycle(w);
    expect(cy.phase).toBe('recession');
    expect(w.effects.some((e) => e.kind === 'goodDemand' && e.target === 'cars' && e.delta < 0)).toBe(true);
    w.day = cy.until;
    monthlyCycle(w);
    expect(cy.phase).toBe('recovery');
  });

  it('AI keeps growing while older products fade', () => {
    const w = createWorld(10);
    for (let m = 0; m < 24; m++) { w.day += 30; monthlyCycle(w); }
    expect(w.goods.ai.trend!).toBeGreaterThan(1.05);
    expect(w.goods.laptops.trend!).toBeLessThan(1);
  });
});

describe('the assistant helps you run it', () => {
  it('tells a new company how much marketing wins customers, with a one-tap fix', () => {
    const w = createWorld(4);
    const c = found(w, 'clothing');
    run(w, 5);
    const tip = adviseCompany(w, c).find((a) => a.id === `customers-${c.id}`);
    expect(tip).toBeDefined();
    expect(tip!.body).toMatch(/weeks/);
    expect(tip!.action?.type).toBe('command');
    if (tip!.action?.type === 'command') expect(applyCommand(w, tip!.action.cmd).ok).toBe(true);
    expect(c.marketingPct).toBeCloseTo(0.05);
  }, 60000);
});
