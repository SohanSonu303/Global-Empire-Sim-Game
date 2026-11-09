import { describe, expect, it } from 'vitest';
import { GOODS, applyCommand, buildCost, createWorld, netWorth, refPrice, spoilMonth, spoilRate, step, storedQty } from '../src/engine';
import { checkIn, streakReward, unlocked } from '../src/engine/rewards';
import { addXp } from '../src/engine/progress';
import { resolveEvent } from '../src/engine/events';
import type { WorldState } from '../src/engine/types';

function run(w: WorldState, days: number) {
  for (let i = 0; i < days; i++) step(w);
}
const mine = (w: WorldState) => w.companies.find((c) => c.isPlayer && !c.bankrupt)!;

describe('rewards', () => {
  it('records, monthly reports and level unlocks', () => {
    const w = createWorld(5, 'established');
    run(31);
    function run(n: number) { for (let i = 0; i < n; i++) step(w); }
    expect(Object.keys(w.play.records).length).toBeGreaterThan(0);
    const r = w.play.reports.at(-1)!;
    expect(r).toBeTruthy();
    expect(['A+', 'A', 'B', 'C', 'D', 'F']).toContain(r.grade);
    expect(r.parts.reduce((s, p) => s + p.points, 0)).toBe(r.score);
    expect(unlocked(w, 'tips')).toBe(false);
    w.player.level = 8;
    expect(unlocked(w, 'tips')).toBe(true);
  });

  it('the daily streak counts real days, pays more each day and can be frozen', () => {
    const w = createWorld(2);
    const xp = (n: number) => addXp(w, n);
    checkIn(w, '2026-11-01', 1e6, xp);
    checkIn(w, '2026-11-02', 1e6, xp);
    expect(w.play.streak.count).toBe(2);
    checkIn(w, '2026-11-02', 1e6, xp); // same day: nothing
    expect(w.play.streak.count).toBe(2);
    checkIn(w, '2026-11-04', 1e6, xp); // missed a day, no freeze yet
    expect(w.play.streak.count).toBe(1);
    w.player.level = 5;
    checkIn(w, '2026-11-05', 1e6, xp);
    checkIn(w, '2026-11-07', 1e6, xp); // missed one day: freeze
    expect(w.play.streak.count).toBe(3);
    expect(w.play.streak.reward?.froze).toBe(true);
    expect(streakReward(7, 1e6).cash).toBeGreaterThan(streakReward(6, 1e6).cash);
  });
});

describe('strategies', () => {
  it('contracts are delivered from stock and paid', () => {
    const w = createWorld(5, 'established');
    w.player.level = 5;
    const c = mine(w);
    w.play.jobs.push({
      id: 'jt', source: 'gov', buyerName: 'Test Office', good: c.good, qty: Math.round(c.capacity * 5), delivered: 0, pay: c.capacity * 5 * refPrice(w, c.good) * 1.2,
      bonus: 1000, penalty: 5000, days: 30, deadline: 0, startDay: 0, status: 'offer', offerUntil: w.day + 5,
    });
    expect(applyCommand(w, { type: 'acceptJob', jobId: 'jt', companyId: c.id }).ok).toBe(true);
    run(w, 25);
    const j = w.play.jobs.find((x) => x.id === 'jt')!;
    expect(j.status).toBe('done');
    expect(j.delivered).toBeCloseTo(j.qty, 0);
  });

  it('warehouses store overflow, buy from the market and sell later', () => {
    const w = createWorld(5, 'established');
    w.player.level = 6;
    const c = mine(w);
    expect(applyCommand(w, { type: 'buildWarehouse' }).ok).toBe(true);
    const wh = w.play.warehouses[0];
    applyCommand(w, { type: 'setAutomation', companyId: c.id, automation: { toWarehouse: true } });
    c.priceMult = 1.4; // weak demand: the plant makes more than it sells
    expect(applyCommand(w, { type: 'setBuyOrder', warehouseId: wh.id, good: 'grain', perDay: 300, maxPrice: 1e9 }).ok).toBe(true);
    run(w, 15);
    expect(storedQty(w, c.good)).toBeGreaterThan(0);
    expect(storedQty(w, 'grain')).toBeGreaterThan(1000);
    const nw = netWorth(w);
    expect(nw).toBeGreaterThan(0);
    const cash = w.player.cash;
    expect(applyCommand(w, { type: 'releaseStock', id: wh.id, good: 'grain', qty: 1e9 }).ok).toBe(true);
    expect(w.player.cash).toBeGreaterThan(cash); // sold to traders: we do not make grain
    expect(storedQty(w, 'grain')).toBe(0);
    expect(applyCommand(w, { type: 'setBuyOrder', warehouseId: wh.id, good: 'electricity', perDay: 10, maxPrice: 1e9 }).ok).toBe(false);
  });

  it('campaigns lift appeal, tenders pick the best bid and price wars get an answer', () => {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    const c = mine(w);
    expect(applyCommand(w, { type: 'startCampaign', companyId: c.id, size: 'l', weeks: 2 }).ok).toBe(true);
    run(w, 3);
    expect(applyCommand(w, { type: 'startCampaign', companyId: c.id, size: 's', weeks: 2 }).ok).toBe(false); // one at a time
    w.play.tenders.push({ id: 'tt', buyer: 'Test', good: c.good, qtyPerMonth: 100, months: 3, closes: w.day + 1, ref: refPrice(w, c.good), status: 'open',
      bids: [{ companyId: 'x', name: 'Rival', price: refPrice(w, c.good) * 0.95, quality: 1 }] });
    applyCommand(w, { type: 'bidTender', tenderId: 'tt', companyId: c.id, price: refPrice(w, c.good) * 0.7 });
    run(w, 2);
    expect(w.play.tenders.find((t) => t.id === 'tt')!.status).toBe('won');
    expect(w.play.jobs.some((j) => j.source === 'tender' && j.status === 'active')).toBe(true);
    applyCommand(w, { type: 'setPrice', companyId: c.id, priceMult: 0.8 });
    run(w, 2);
    const war = w.play.wars.find((x) => x.playerCoId === c.id);
    if (war) {
      expect(['match', 'undercut', 'backoff']).toContain(war.mode);
      expect(applyCommand(w, { type: 'endWar', warId: war.id }).ok).toBe(true);
      expect(war.status).not.toBe('active');
    }
  });

  it('antitrust and joint-venture events resolve', () => {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    const c = mine(w);
    w.pending.push({ id: 'ea', template: 'antitrust', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 5, title: 't', body: 'b', choices: [{ id: 'split', label: '', detail: '' }, { id: 'fine', label: '', detail: '' }], amount: 1000 });
    const cap = c.capacity;
    expect(resolveEvent(w, 'ea', 'split').ok).toBe(true);
    expect(c.capacity).toBeCloseTo(cap * 0.75);
    const rv = w.rivals[0];
    rv.cash = 1e9;
    w.player.cash = 1e8;
    w.pending.push({ id: 'ev', template: 'venture', day: w.day, companyId: c.id, rivalId: rv.id, expiresDay: w.day + 5, title: 't', body: 'b', good: 'chips', amount: 2e6, choices: [{ id: 'accept', label: '', detail: '' }, { id: 'decline', label: '', detail: '' }] });
    const n = w.companies.length;
    expect(resolveEvent(w, 'ev', 'accept').ok).toBe(true);
    expect(w.companies.length).toBe(n + 1);
    const jv = w.companies.at(-1)!;
    expect(jv.isPlayer).toBe(true);
    expect(jv.level).toBe(3);
    expect(jv.partners?.[0].ownerId).toBe(rv.id);
    run(w, 10);
    expect(jv.bankrupt).toBe(false);
  });

  it('a long game with every feature stays stable', () => {
    const w = createWorld(9, 'established');
    w.player.level = 12;
    applyCommand(w, { type: 'buildWarehouse' });
    for (let d = 0; d < 400; d++) {
      step(w);
      const offer = w.play.jobs.find((j) => j.status === 'offer' && w.companies.some((c) => c.isPlayer && c.good === j.good));
      const co = offer && w.companies.find((c) => c.isPlayer && c.good === offer.good)!;
      if (offer && co) applyCommand(w, { type: 'acceptJob', jobId: offer.id, companyId: co.id });
      for (const t of w.play.tenders) {
        const tc = w.companies.find((c) => c.isPlayer && c.good === t.good);
        if (t.status === 'open' && !t.mine && tc) applyCommand(w, { type: 'bidTender', tenderId: t.id, companyId: tc.id, price: t.ref * 0.9 });
      }
      for (const e of [...w.pending]) resolveEvent(w, e.id, e.choices.at(-1)!.id);
    }
    expect(Number.isFinite(netWorth(w))).toBe(true);
    expect(w.marketIndex).toBeGreaterThan(400);
    expect(w.play.reports.length).toBeGreaterThan(10);
    expect(w.companies.every((c) => Number.isFinite(c.cash) && Number.isFinite(c.priceMult))).toBe(true);
  });
});

describe('output split and storage ageing', () => {
  it('a split sends a share of output to the warehouse and caps deals and contracts', () => {
    const w = createWorld(21, 'established');
    w.player.level = 12; w.player.cash = 5e7;
    const c = mine(w);
    expect(applyCommand(w, { type: 'setSplit', companyId: c.id, split: { deals: 0, contracts: 0.1, warehouse: 0.2 } }).ok).toBe(false); // no warehouse yet
    expect(applyCommand(w, { type: 'buildWarehouse' }).ok).toBe(true);
    expect(applyCommand(w, { type: 'setSplit', companyId: c.id, split: { deals: 0.6, contracts: 0.6, warehouse: 0.2 } }).ok).toBe(true);
    expect(c.split!.deals + c.split!.contracts + c.split!.warehouse).toBeLessThanOrEqual(1 + 1e-9); // scaled down to 100%
    applyCommand(w, { type: 'setSplit', companyId: c.id, split: { deals: 0, contracts: 0.1, warehouse: 0.2 } });
    for (let i = 0; i < 20; i++) { step(w); w.pending = []; }
    const stored = w.play.warehouses[0].stock[c.good]?.qty ?? 0;
    expect(stored).toBeGreaterThan(c.capacity * 0.2 * 10);
    // a deal bigger than the deals share is refused
    const buyer = w.companies.find((x) => !x.isPlayer && !x.bankrupt && GOODS[x.good].inputs.some((i) => i.good === c.good))!;
    const r = applyCommand(w, { type: 'offerContract', companyId: c.id, partnerId: buyer.id, side: 'sell', qtyPerDay: c.capacity * 0.1, price: refPrice(w, c.good) * 1.1, days: 30 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/output split/);
  }, 60000);

  it('durable goods lose 0.25% a month, perishables more, and old stock spoils faster', () => {
    expect(spoilMonth('steel')).toBeCloseTo(0.0025);
    expect(spoilMonth('food')).toBeGreaterThan(spoilMonth('grain'));
    expect(spoilRate('steel', 1)).toBeCloseTo(0.0025 / 30);
    expect(spoilRate('steel', 6)).toBeGreaterThan(spoilRate('steel', 1) * 2);
    expect(spoilRate('steel', 100)).toBeCloseTo((0.0025 * 3) / 30); // capped at 3x
    const w = createWorld(3, 'established');
    w.player.level = 12; w.player.cash = 5e7;
    applyCommand(w, { type: 'buildWarehouse' });
    expect(buildCost(w)).toBeGreaterThan(700_000); // the second one costs far more
  });

  it('stored stock can be sent to contracts, deals or the market', () => {
    const w = createWorld(21, 'established');
    w.player.level = 12; w.player.cash = 5e7;
    const c = mine(w);
    applyCommand(w, { type: 'buildWarehouse' });
    const wh = w.play.warehouses[0];
    wh.stock[c.good] = { qty: 3000, cost: refPrice(w, c.good) * 0.7, since: w.day };
    // nothing to send to yet
    expect(applyCommand(w, { type: 'sendStock', id: wh.id, good: c.good, qty: 100, to: 'contracts' }).ok).toBe(false);
    expect(applyCommand(w, { type: 'sendStock', id: wh.id, good: c.good, qty: 100, to: 'deals' }).ok).toBe(false);
    // a contract: stock is delivered and paid at once
    w.play.jobs.push({ id: 'jt', source: 'gov', buyerName: 'Gov', good: c.good, qty: 500, delivered: 0, pay: 500 * refPrice(w, c.good), bonus: 0, penalty: 0,
      days: 60, deadline: w.day + 60, startDay: w.day, status: 'active', offerUntil: w.day, companyId: c.id } as any);
    const cash = c.cash;
    expect(applyCommand(w, { type: 'sendStock', id: wh.id, good: c.good, qty: 800, to: 'contracts' }).ok).toBe(true);
    expect(w.play.jobs.find((j) => j.id === 'jt')!.delivered).toBeCloseTo(500); // only what the contract needs
    expect(c.cash).toBeGreaterThan(cash);
    expect(wh.stock[c.good]!.qty).toBeCloseTo(2500);
    // a deal: stock is set aside and delivered first each day
    const buyer = w.companies.find((x) => !x.isPlayer && !x.bankrupt && GOODS[x.good].inputs.some((i) => i.good === c.good))!;
    w.contracts.push({ id: 'kt', good: c.good, sellerId: c.id, buyerId: buyer.id, qtyPerDay: 20, price: refPrice(w, c.good), startDay: w.day, endDay: w.day + 10, shortfall: 0, delivered: 0 });
    expect(applyCommand(w, { type: 'sendStock', id: wh.id, good: c.good, qty: 1000, to: 'deals' }).ok).toBe(true);
    const k = w.contracts.find((x) => x.id === 'kt')!;
    expect(k.banked).toBeLessThanOrEqual(11 * 20 + 1e-6); // no more than the deal still needs
    const before = k.banked!;
    step(w); w.pending = [];
    expect(k.banked!).toBeCloseTo(before - 20);
    // the market: sent to your own company to sell
    const inv = c.inventory;
    expect(applyCommand(w, { type: 'sendStock', id: wh.id, good: c.good, qty: 100, to: 'market' }).ok).toBe(true);
    expect(c.inventory).toBeGreaterThan(inv);
  }, 60000);
});
