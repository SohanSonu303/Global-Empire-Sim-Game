import { describe, expect, it } from 'vitest';
import { applyCommand, createWorld, step } from '../src/engine';
import type { Company, WorldState } from '../src/engine';
import { COVER, DISASTERS, isInsured, premiumPerDay, strike } from '../src/engine/disasters';
import { AUCTION_DAYS, blockedByRegulator, failCompany, minBid, playerBlock } from '../src/engine/auctions';
import { DEPLETION_DAYS, exploreCost, extractionMult, reserveCapMult, reservesOf } from '../src/engine/resources';
import { MAX_FOUNDED, foundedBy, resolveTycoonEvent, stakeTarget, tycoonFound, tycoons } from '../src/engine/tycoons';
import { LICENCE_FEE, RIVALS, startCost } from '../src/engine/data';
import { outsidePct } from '../src/engine/ownership';
import { parseWorld } from '../src/persistence/schema';

function run(w: WorldState, days: number) {
  for (let i = 0; i < days; i++) { step(w); w.pending = []; }
}

function found(w: WorldState, good: Company['good'], name = 'Mine'): Company {
  w.player.cash = Math.max(w.player.cash, 10_000_000);
  const r = applyCommand(w, { type: 'foundCompany', name, good });
  expect(r.ok, r.message).toBe(true);
  return w.companies.find((c) => c.name === name)!;
}

describe('natural disasters and insurance', () => {
  it('hit most companies in the industries they touch, cut output and send a bill', () => {
    const w = createWorld(5);
    run(w, 90);
    const quake = DISASTERS.find((d) => d.kind === 'earthquake')!;
    const before = w.companies.filter((c) => !c.bankrupt).length;
    strike(w, 'earthquake');
    const rec = w.play.disasters[w.play.disasters.length - 1];
    expect(rec.kind).toBe('earthquake');
    expect(rec.hit).toBeGreaterThan(before * quake.hit * 0.4);
    const damaged = w.companies.filter((c) => c.damage && c.damage.untilDay > w.day && c.damage.cause.includes('Earthquake'));
    // a company that already had worse damage keeps that (and its cause)
    expect(damaged.length).toBeLessThanOrEqual(rec.hit);
    expect(damaged.length).toBeGreaterThanOrEqual(rec.hit - 2);
    for (const c of damaged) expect(c.damage!.mult).toBeLessThanOrEqual(0.6);
  });

  it('insurance costs a yearly premium and pays 80% of the repairs', () => {
    const a = createWorld(8);
    const b = createWorld(8);
    const ca = found(a, 'food');
    const cb = found(b, 'food');
    applyCommand(b, { type: 'setInsurance', companyId: cb.id, on: true });
    expect(isInsured(ca)).toBe(false);
    expect(isInsured(cb)).toBe(true);
    expect(premiumPerDay(cb) * 365).toBeCloseTo(cb.assets * 0.012, 0);
    // Force both to be hit by the same flood
    for (const w of [a, b]) {
      w.rng = { ...a.rng };
      const c = w.companies.find((x) => x.isPlayer)!;
      c.cash = 1_000_000;
    }
    a.companies.find((c) => c.isPlayer)!.good = 'food';
    const flood = DISASTERS.find((d) => d.kind === 'flood')!;
    const hitBefore = flood.hit;
    flood.hit = 1;
    try {
      strike(a, 'flood');
      strike(b, 'flood');
    } finally { flood.hit = hitBefore; }
    const ra = a.play.disasters.at(-1)!;
    const rb = b.play.disasters.at(-1)!;
    expect(ra.yours).toEqual([ca.id]);
    expect(rb.yours).toEqual([cb.id]);
    expect(ra.covered).toBe(0);
    expect(rb.cost).toBeCloseTo((rb.cost + rb.covered) * (1 - COVER), 0);
    expect(rb.covered).toBeGreaterThan(0);
  });

  it('are rare: about one every two to three years', () => {
    // Two 10-year runs: one world can be unlucky, but together they should see a few
    let total = 0;
    for (const seed of [13, 14]) {
      const w = createWorld(seed, 'established');
      run(w, 3600);
      const n = w.play.disasters.length;
      total += n;
      expect(n).toBeLessThanOrEqual(10);
      for (let i = 1; i < n; i++) expect(w.play.disasters[i].day - w.play.disasters[i - 1].day).toBeGreaterThanOrEqual(180);
    }
    expect(total).toBeGreaterThanOrEqual(2);
  }, 240000);
});

describe('bankruptcy auctions', () => {
  it('a failed company is auctioned, rivals bid, and the winner gets it debt-free', () => {
    const w = createWorld(9);
    run(w, 60);
    const c = w.companies.find((x) => x.ownerId === 'public' && x.good === 'cotton') ?? w.companies.find((x) => x.good === 'cotton')!;
    failCompany(w, c, 'test');
    const a = w.play.auctions.at(-1)!;
    expect(a.companyId).toBe(c.id);
    expect(c.bankrupt).toBe(true);
    expect(c.debt).toBe(0);
    expect(a.reserve).toBeGreaterThan(0);
    for (let i = 0; i < AUCTION_DAYS + 20 && a.status === 'open'; i++) run(w, 1);
    expect(a.status).not.toBe('open');
    if (a.status === 'sold') {
      expect(c.bankrupt).toBe(false);
      expect(c.ownerId).toBe(a.bidderId);
      expect(c.ticker).toBeNull();
      expect(a.bid).toBeGreaterThanOrEqual(a.reserve);
    }
  });

  it('you can bid: the money is held, and winning gives you the company debt-free', () => {
    const w = createWorld(10);
    run(w, 60);
    for (const r of w.rivals) r.cash = 0; // no rival can bid
    const c = w.companies.find((x) => x.good === 'furniture')!;
    failCompany(w, c, 'test');
    const a = w.play.auctions.at(-1)!;
    w.player.cash = a.reserve * 3;
    const cash = w.player.cash;
    expect(applyCommand(w, { type: 'bidAuction', auctionId: a.id, amount: a.reserve - 1000 }).ok).toBe(false);
    expect(applyCommand(w, { type: 'bidAuction', auctionId: a.id, amount: a.reserve }).ok).toBe(true);
    expect(w.player.cash).toBe(cash - a.reserve);
    expect(minBid(a)).toBeGreaterThan(a.reserve);
    expect(applyCommand(w, { type: 'bidAuction', auctionId: a.id, amount: a.reserve * 2 }).ok).toBe(false); // already leading
    for (let i = 0; i < AUCTION_DAYS + 5 && a.status === 'open'; i++) run(w, 1);
    expect(a.status).toBe('sold');
    expect(a.bidderId).toBe('player');
    expect(c.isPlayer).toBe(true);
    expect(c.ownerId).toBe('player');
    expect(c.bankrupt).toBe(false);
    expect(c.debt).toBe(0);
    expect(c.workers).toBeGreaterThan(0);
    expect(w.player.licences).toContain(c.industry);
  });

  it('a rival bid refunds your held money', () => {
    const w = createWorld(10);
    run(w, 60);
    const c = w.companies.find((x) => x.good === 'furniture')!;
    failCompany(w, c, 'test');
    const a = w.play.auctions.at(-1)!;
    w.player.cash = a.reserve * 2;
    applyCommand(w, { type: 'bidAuction', auctionId: a.id, amount: a.reserve });
    const held = w.player.cash;
    // Give every rival plenty of money and a reason to want it
    for (const r of w.rivals) { r.cash = 1e11; r.focus = [...r.focus, c.industry]; }
    for (let i = 0; i < AUCTION_DAYS && a.bidderId === 'player'; i++) run(w, 1);
    expect(a.bidderId).not.toBe('player');
    expect(w.player.cash).toBeGreaterThanOrEqual(held + a.bids.find((b) => b.bidderId === 'player')!.amount); // refunded (plus any other income)
  });

  it('regulators stop a buyer who already sells the product from passing 40%', () => {
    const w = createWorld(11);
    run(w, 30);
    const c = w.companies.find((x) => x.good === 'steel')!;
    const other = w.companies.find((x) => x.good === 'steel' && x.id !== c.id)!;
    expect(blockedByRegulator(w, c, 'nobody')).toBe(false); // a newcomer may buy any one company
    const owner = other.ownerId;
    other.ownerId = 'player';
    expect(blockedByRegulator(w, c, 'player')).toBe(true);
    other.ownerId = owner;
    failCompany(w, c, 'test');
    const a = w.play.auctions.at(-1)!;
    expect(playerBlock(w, a)).toBeNull();
  });

  it('auctions happen during a long game', () => {
    const w = createWorld(21);
    run(w, 3000);
    expect(w.play.auctions.length).toBeGreaterThan(0);
  }, 120000);
});

describe('raw materials cost more to run', () => {
  it('licences and plants cost more, and reserves run down', () => {
    expect(LICENCE_FEE.resources).toBe(2_000_000);
    expect(LICENCE_FEE.energy).toBe(1_500_000);
    // the plant itself is cheap, but the licence makes getting into mining dearer than into steel
    expect(startCost('iron_ore') + LICENCE_FEE.resources).toBeGreaterThan(startCost('steel') + LICENCE_FEE.manufacturing);
    const w = createWorld(12);
    const c = found(w, 'grain');
    expect(reservesOf(c)).toBe(1);
    run(w, 200);
    const r = reservesOf(c);
    expect(r).toBeLessThan(1);
    expect(r).toBeGreaterThan(1 - 200 / DEPLETION_DAYS - 0.01);
  });

  it('thin reserves raise costs and cut output; exploring restores them', () => {
    const w = createWorld(12);
    const c = found(w, 'iron_ore');
    c.reserves = 0.1;
    expect(extractionMult(c)).toBeCloseTo(1.8);
    expect(reserveCapMult(c)).toBeCloseTo(0.4);
    const cost = exploreCost(c);
    c.cash = cost - 1;
    expect(applyCommand(w, { type: 'explore', companyId: c.id }).ok).toBe(false);
    c.cash = cost + 10;
    expect(applyCommand(w, { type: 'explore', companyId: c.id }).ok).toBe(true);
    expect(reservesOf(c)).toBe(1);
    expect(extractionMult(c)).toBe(1);
    expect(reserveCapMult(c)).toBe(1);
  });

  it('auto-explore tops up low reserves', () => {
    const w = createWorld(12);
    const c = found(w, 'cotton');
    c.reserves = 0.2;
    c.cash = 5_000_000;
    run(w, 1);
    expect(reservesOf(c)).toBeGreaterThan(0.9);
  });

  it('AI raw producers are not affected (the economy stays calibrated)', () => {
    const w = createWorld(12);
    const ai = w.companies.find((c) => !c.isPlayer && c.good === 'iron_ore')!;
    run(w, 100);
    expect(ai.reserves).toBeUndefined();
    expect(extractionMult(ai)).toBe(1);
  });
});

describe('tycoons', () => {
  it('eight tycoons with parody names join the five rivals', () => {
    const w = createWorld(1);
    expect(w.rivals).toHaveLength(13);
    const t = tycoons(w);
    expect(t.map((r) => r.name)).toEqual(['Moln Eusk', 'Mas Saltman', 'Gill Bates', 'Hukesh Mambani', 'Jeff Bozes', 'Zark Muckerberg', 'Hensen Juang', 'Barren Wuffett']);
    for (const r of t) expect(r.focus.length).toBeGreaterThanOrEqual(1);
    // Some own listed companies from the start
    expect(w.companies.some((c) => c.ownerId === 'eusk')).toBe(true);
  });

  it('found companies in short markets, within limits, and run them', () => {
    const w = createWorld(3);
    run(w, 60);
    const r = tycoons(w)[0];
    const cash = r.cash;
    const c = tycoonFound(w, r, 'software');
    expect(c).not.toBeNull();
    expect(c!.ownerId).toBe(r.id);
    expect(c!.ticker).toBeNull();
    expect(r.cash).toBeLessThan(cash);
    expect(w.companies).toContain(c);
    run(w, 60);
    expect(c!.bankrupt).toBe(false);
    expect(c!.sum30.sold).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) tycoonFound(w, r, (['phones', 'laptops', 'telecom', 'chips', 'cars', 'appliances'] as const)[i % 6]);
    expect(foundedBy(w, r).length).toBeLessThanOrEqual(MAX_FOUNDED);
  });

  it('start companies on their own over a few years', () => {
    const w = createWorld(11);
    run(w, 1500);
    expect(w.companies.filter((c) => c.id.startsWith('t')).length).toBeGreaterThan(0);
  }, 120000);

  it('offer to buy a stake in a fast-growing company, and the deal respects the 49% limit', () => {
    const w = createWorld(4);
    const c = found(w, 'software', 'Fastco');
    run(w, 120);
    // Make it look like a fast grower
    c.hist = c.hist.map((h, i) => ({ ...h, revenue: 1000 + i * 200 }));
    c.sum30.netIncome = Math.max(10_000, c.sum30.netIncome);
    c.cash += 500_000;
    const r = w.rivals.find((x) => x.id === 'saltman')!;
    const t = stakeTarget(w, r);
    expect(t?.c.id).toBe(c.id);
    const ev = { id: 'x', template: 'tycoonStake', day: w.day, title: '', body: '', companyId: c.id, rivalId: r.id, choices: [], expiresDay: w.day + 5, amount: t!.price, pct: t!.pct };
    const cash = c.cash;
    const res = resolveTycoonEvent(w, ev, c, 'accept');
    expect(res.ok).toBe(true);
    expect(c.cash).toBeCloseTo(cash + t!.price);
    expect(outsidePct(c)).toBeCloseTo(t!.pct);
    // A second offer that would pass 49% is refused
    const big = { ...ev, pct: 0.45 };
    resolveTycoonEvent(w, big, c, 'accept');
    expect(outsidePct(c)).toBeLessThanOrEqual(0.49 + 1e-9);
  });

  it('old saves get the tycoons and the new fields', () => {
    const w = createWorld(2);
    const old = JSON.parse(JSON.stringify(w));
    old.rivals = old.rivals.slice(0, 5);
    delete old.play.auctions;
    delete old.play.disasters;
    const res = parseWorld(old);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.world.rivals).toHaveLength(RIVALS.length);
    expect(res.world.play.auctions).toEqual([]);
    expect(res.world.play.disasters).toEqual([]);
    run(res.world, 40);
  });
});
