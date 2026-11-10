import { describe, expect, it } from 'vitest';
import {
  CLEAR_DAYS, GOODS, applyCommand, computeAdvice, createWorld, foundTotal, judgePitch, partnerInterest, refPrice, step, tenderLeader,
} from '../src/engine';
import { weeklyManagers } from '../src/engine/manager';
import type { Tender, WorldState } from '../src/engine/types';

function run(w: WorldState, days: number) {
  for (let i = 0; i < days; i++) { step(w); w.pending = []; }
}
const mine = (w: WorldState) => w.companies.find((c) => c.isPlayer && !c.bankrupt)!;

describe('clearing assistant tips', () => {
  it('hides a tip for two weeks, then brings it back if it still applies', () => {
    const w = createWorld(5, 'established');
    run(w, 3);
    const tip = computeAdvice(w).find((a) => a.id !== 'event');
    expect(tip).toBeDefined();
    expect(applyCommand(w, { type: 'clearTips', ids: [tip!.id] }).ok).toBe(true);
    expect(computeAdvice(w).some((a) => a.id === tip!.id)).toBe(false);
    w.day += CLEAR_DAYS;
    // still hidden on the last day, back the day after if the problem is still there
    expect(w.play.cleared![tip!.id]).toBe(w.day);
    expect(computeAdvice(w).some((a) => a.id === tip!.id)).toBe(computeAdvice({ ...w, play: { ...w.play, cleared: {} } }).some((a) => a.id === tip!.id));
  });
});

describe('the top manager', () => {
  it('runs the company each week and reports to the assistant', () => {
    const w = createWorld(5, 'established');
    const c = mine(w);
    c.manager = 'pro';
    c.marketingPct = 0;
    c.reach = 0.4;
    c.condition = 0.7;
    weeklyManagers(w);
    expect(c.marketingPct).toBeGreaterThan(0.04);
    expect(c.maintenance).toBe('high');
    expect(c.mgrLog?.did.length).toBeGreaterThanOrEqual(2);
    const report = computeAdvice(w).find((a) => a.id === `mgr-${c.id}`);
    expect(report).toBeDefined();
    expect(report!.body).toMatch(/This week: .*marketing/);
    expect(report!.body).toMatch(/Plant \d+% used/);
    // tips the manager handles no longer show on their own
    expect(computeAdvice(w).some((a) => a.id === `customers-${c.id}` || a.id === `machines-${c.id}`)).toBe(false);
  });
});

describe('tenders', () => {
  function tender(w: WorldState, price: number): Tender {
    const c = mine(w);
    const t: Tender = {
      id: 'tt', buyer: 'Test Office', good: c.good, qtyPerMonth: Math.round(c.capacity * 30 * 0.2), months: 8, closes: w.day + 14, ref: refPrice(w, c.good), status: 'open',
      bids: [{ companyId: 'nobody', name: 'Rival Co', price, quality: 1, capacity: c.capacity * 3 }],
    };
    w.play.tenders.push(t);
    return t;
  }

  it('opens 6-12 month tenders and tells you about them', () => {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    let t: Tender | undefined;
    for (let d = 0; d < 200 && !t; d++) { run(w, 1); t = w.play.tenders.find((x) => x.status === 'open' && w.companies.some((c) => c.isPlayer && c.good === x.good)); }
    expect(t).toBeDefined();
    expect(t!.months).toBeGreaterThanOrEqual(6);
    expect(t!.months).toBeLessThanOrEqual(12);
    expect(computeAdvice(w).some((a) => a.id === `tender-${t!.id}` && a.action?.type === 'openTender')).toBe(true);
  });

  it('is a bidding war: a rival answers, and dropping out hands them the win', () => {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    const c = mine(w);
    // A rival with a real plant answers with a lower price
    const rival = w.companies.find((x) => !x.isPlayer && x.good === c.good && w.rivals.some((r) => r.id === x.ownerId))!;
    const t = tender(w, refPrice(w, c.good) * 1.05);
    t.bids = [{ companyId: rival.id, name: rival.name, price: refPrice(w, c.good) * 1.05, quality: rival.quality, capacity: rival.capacity * 3 }];
    expect(applyCommand(w, { type: 'tenderBid', tenderId: 'tt', price: t.ref }).ok).toBe(false); // must join first
    expect(applyCommand(w, { type: 'tenderJoin', tenderId: 'tt', companyId: c.id }).ok).toBe(true);
    expect(applyCommand(w, { type: 'tenderBid', tenderId: 'tt', price: t.ref * 1.2 }).ok).toBe(false); // does not beat the leader
    applyCommand(w, { type: 'tenderBid', tenderId: 'tt', price: t.ref * 1.0 });
    expect(t.status).toBe('open');
    expect(tenderLeader(t)!.player).toBe(false); // the rival answered
    expect(t.bids[0].price).toBeLessThan(t.ref * 1.05); // it went lower than its opening bid
    expect(applyCommand(w, { type: 'tenderPass', tenderId: 'tt' }).ok).toBe(true);
    expect(t.status).toBe('lost');
    expect(t.winner).toBe(rival.name);
  });

  it('a won tender becomes a long contract checked every month', () => {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    const c = mine(w);
    const t = tender(w, refPrice(w, c.good) * 1.1);
    applyCommand(w, { type: 'tenderJoin', tenderId: 'tt', companyId: c.id });
    applyCommand(w, { type: 'tenderBid', tenderId: 'tt', price: t.ref * 0.95 });
    expect(t.status).toBe('won'); // that rival has no plant, so it cannot answer
    const job = w.play.jobs.find((j) => j.source === 'tender' && j.status === 'active')!;
    expect(job.days).toBe(8 * 30);
    // nothing delivered for a month: a fine for the short month
    c.split = { deals: 0, contracts: 0, warehouse: 0 };
    const cash = c.cash;
    job.startDay -= 31; job.checked = w.day - 31; job.delivered = 0;
    run(w, 1);
    expect(w.play.banners.some((b) => b.title === 'Tender delivery short')).toBe(true);
    expect(Number.isFinite(c.cash) && c.cash !== cash).toBe(true);
  });
});

describe('founding partners negotiate', () => {
  it('keen partners ask for more, unsure ones put in less, cold ones say no', () => {
    const w = createWorld(5, 'established');
    const good = 'steel' as const;
    const total = foundTotal(w, good);
    const offers = w.rivals.map((r) => ({ r, i: partnerInterest(w, good, total, r.id).interest })).sort((a, b) => b.i - a.i);
    const top = offers[0];
    const a = judgePitch(w, good, total, top.r.id, 0.05);
    if (top.i >= 0.36) expect(a.verdict).toBe('counter'); // wants a bigger share than 5%
    if (a.verdict === 'counter') {
      expect(a.pct).toBeGreaterThan(0.05);
      expect(judgePitch(w, good, total, top.r.id, a.pct).verdict).toBe('accept');
    }
    // never more than 49%
    for (const o of offers) expect(judgePitch(w, good, total, o.r.id, 0.49).pct).toBeLessThanOrEqual(0.49);
    // someone who dislikes you says no
    const foe = w.rivals[w.rivals.length - 1];
    foe.relation = -50;
    expect(judgePitch(w, good, total, foe.id, 0.2).verdict).toBe('reject');
  });

  it('three pitches, then they want a break', () => {
    const w = createWorld(5, 'established');
    const good = 'steel' as const;
    const total = foundTotal(w, good);
    const r = w.rivals.find((x) => partnerInterest(w, good, total, x.id).interest >= 0.36 && x.relation >= -10 && x.cash > total);
    if (!r) return;
    for (const pct of [0.05, 0.06, 0.07]) applyCommand(w, { type: 'pitchPartner', good, partnerId: r.id, pct });
    expect(judgePitch(w, good, total, r.id, 0.4).text).toMatch(/talked enough/);
    expect(GOODS[good]).toBeDefined();
  });
});

describe('warehouse sell tip', () => {
  it('suggests selling stored goods when the price is well above what you paid', () => {
    const w = createWorld(9, 'established');
    w.player.level = 12;
    w.player.cash = 5e6;
    expect(applyCommand(w, { type: 'buildWarehouse' }).ok).toBe(true);
    const g = mine(w).good;
    w.play.warehouses[0].stock[g] = { qty: 2000, cost: refPrice(w, g) * 0.6, since: w.day };
    const tip = computeAdvice(w).find((a) => a.id === `sell-${g}`);
    expect(tip).toBeDefined();
    expect(tip!.action?.type).toBe('openWarehouses');
  });
});
