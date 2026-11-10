import { describe, expect, it } from 'vitest';
import {
  TENDER_ADVANCE, applyCommand, appetite, createWorld, exportQuote, forecastCompany, foreignPrice, nation, recordBonus, refPrice, step,
  tenderMinPrice, tradeState, execSkill, candidates, monthlyTrade,
  PATENT_DAYS, RESEARCH, worldLink, worldIdx, marketEntry, labPool, labWages, licenceOffers, monthlyResearch, patentValuePerUnit, patentsOf, researcherPower,
} from '../src/engine';
import type { GoodId, Tender, WorldState } from '../src/engine/types';

function run(w: WorldState, days: number) {
  for (let i = 0; i < days; i++) { step(w); w.pending = []; }
}
const mine = (w: WorldState) => w.companies.find((c) => c.isPlayer && !c.bankrupt)!;

function tender(w: WorldState, price: number): Tender {
  const c = mine(w);
  const t: Tender = {
    id: 'tt', buyer: 'Test Office', good: c.good, qtyPerMonth: Math.round(c.capacity * 30 * 0.2), months: 8, closes: w.day + 14, ref: refPrice(w, c.good), status: 'open',
    bids: [{ companyId: 'nobody', name: 'Rival Co', price, quality: 1, capacity: c.capacity * 3 }],
  };
  w.play.tenders.push(t);
  return t;
}

describe('tender upgrades', () => {
  it('rejects bids that are too low, and pays an advance on a win', () => {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    const c = mine(w);
    const t = tender(w, refPrice(w, c.good) * 1.1);
    applyCommand(w, { type: 'tenderJoin', tenderId: 'tt', companyId: c.id });
    expect(applyCommand(w, { type: 'tenderBid', tenderId: 'tt', price: tenderMinPrice(t) * 0.95 }).ok).toBe(false);
    const cash = c.cash;
    applyCommand(w, { type: 'tenderBid', tenderId: 'tt', price: t.ref * 0.95 });
    expect(t.status).toBe('won');
    const job = w.play.jobs.find((j) => j.source === 'tender' && j.status === 'active')!;
    expect(c.cash - cash).toBeCloseTo(job.pay * TENDER_ADVANCE, 0);
  });

  it('a good record helps you win, a bad one hurts', () => {
    const w = createWorld(5, 'established');
    expect(recordBonus(w)).toBe(0);
    w.play.track = { done: 5, failed: 0 };
    expect(recordBonus(w)).toBeCloseTo(0.05);
    w.play.track = { done: 1, failed: 6 };
    expect(recordBonus(w)).toBe(-0.08);
  });
});

describe('contract requests', () => {
  it('companies reply to an offer to sell, and you can sign one', () => {
    const w = createWorld(5, 'established');
    const c = mine(w);
    const ref = refPrice(w, c.good);
    expect(applyCommand(w, { type: 'postRequest', side: 'sell', companyId: c.id, good: c.good, qtyPerDay: Math.max(1, Math.round(c.capacity * 0.2)), days: 60, price: ref * 0.85 }).ok).toBe(true);
    run(w, 3);
    const rq = w.play.requests!.find((r) => r.companyId === c.id)!;
    expect(rq.answered).toBe(true);
    if (rq.replies.length) {
      expect(applyCommand(w, { type: 'acceptReply', requestId: rq.id, companyId: rq.replies[0].companyId }).ok).toBe(true);
    }
  });
});

describe('budget and forecast', () => {
  it('a price rise loses buyers; saving a plan tracks real months', () => {
    const w = createWorld(5, 'established');
    run(w, 40);
    const c = mine(w);
    const now = forecastCompany(w, c);
    const dearer = forecastCompany(w, c, { price: 0.15 });
    expect(now.months).toHaveLength(12);
    expect(dearer.unitsAfter).toBeLessThan(now.unitsAfter + 1e-9);
    expect(applyCommand(w, { type: 'saveBudget' }).ok).toBe(true);
    run(w, 31);
    expect(w.play.budget!.actual.length).toBe(1);
  });
});

describe('executives', () => {
  it('hire a candidate, pay a salary, and the effect reaches your companies', () => {
    const w = createWorld(5, 'established');
    w.player.cash = 50_000_000;
    run(w, 1);
    const cand = candidates(w).find((x) => x.role === 'ops')!;
    expect(applyCommand(w, { type: 'hireExec', id: cand.id }).ok).toBe(true);
    expect(execSkill(w, 'ops')).toBeGreaterThan(0);
    const cash = w.player.cash;
    run(w, 1);
    expect(mine(w).execOps).toBeGreaterThan(0);
    expect(w.player.cash).toBeLessThan(cash);
    // only one per role
    const other = candidates(w).find((x) => x.role === 'ops');
    if (other) expect(applyCommand(w, { type: 'hireExec', id: other.id }).ok).toBe(false);
  });
});

describe('countries and trade', () => {
  function withStock(good: GoodId, qty: number) {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    w.player.cash = 50_000_000;
    expect(applyCommand(w, { type: 'buildWarehouse' }).ok).toBe(true);
    w.play.warehouses[0].level = 8;
    w.play.warehouses[0].stock[good] = { qty, cost: refPrice(w, good) * 0.8, since: w.day };
    run(w, 1);
    return w;
  }

  it('a country short of a good pays more for it than home', () => {
    const w = withStock('grain', 1000);
    expect(foreignPrice(w, 'nordland', 'grain')).toBeGreaterThan(refPrice(w, 'grain') * 1.1);
    expect(foreignPrice(w, 'nordland', 'crude_oil')).toBeLessThan(refPrice(w, 'crude_oil'));
  });

  it('ships goods out, sells on arrival, and builds goodwill', () => {
    const w = withStock('grain', 2000);
    const t = tradeState(w);
    const rel = t.rel['astoria|nordland'];
    const qty = Math.floor(w.play.warehouses[0].stock.grain!.qty * 1000) / 1000; // a little spoiled overnight
    const q = exportQuote(w, 'nordland', 'grain', qty);
    expect(q.net).toBeGreaterThan(0);
    expect(applyCommand(w, { type: 'exportGoods', to: 'nordland', good: 'grain', qty }).ok).toBe(true);
    expect(w.play.warehouses[0].stock.grain).toBeUndefined();
    expect(t.shipments).toHaveLength(1);
    const cash = w.player.cash;
    run(w, nation('nordland').shipDays);
    expect(t.shipments).toHaveLength(0);
    expect(w.player.cash).toBeGreaterThan(cash);
    expect(t.rel['astoria|nordland']).toBeGreaterThan(rel);
    // selling a lot fills their market: the price drops for a while
    expect(t.nations.nordland.glut.grain).toBeGreaterThan(0);
  });

  it('imports land in your warehouses; no trade with a country at war', () => {
    const w = withStock('grain', 10);
    const qty = Math.round(appetite('nordland', 'crude_oil') * 0.3);
    expect(applyCommand(w, { type: 'importGoods', from: 'nordland', good: 'crude_oil', qty }).ok).toBe(true);
    expect(applyCommand(w, { type: 'importGoods', from: 'nordland', good: 'phones', qty: 10 }).ok).toBe(false); // nothing spare
    run(w, nation('nordland').shipDays);
    expect(w.play.warehouses[0].stock.crude_oil?.qty).toBeCloseTo(qty, 0);
    const t = tradeState(w);
    t.wars.push('astoria|kestria');
    expect(applyCommand(w, { type: 'exportGoods', to: 'kestria', good: 'grain', qty: 5 }).ok).toBe(false);
  });

  it('the world moves: exchange rates change and barter offers appear', () => {
    const w = withStock('grain', 10);
    const t = tradeState(w);
    const fx = t.nations.meridian.fx;
    for (let i = 0; i < 6; i++) monthlyTrade(w);
    expect(t.nations.meridian.fx).not.toBe(fx);
    expect(t.offers.length).toBeGreaterThan(0);
    const o = t.offers[0];
    expect(o.giveQty * refPrice(w, o.give)).toBeGreaterThan(o.wantQty * refPrice(w, o.want)); // they add a sweetener
  });
});

describe('R&D labs and patents', () => {
  function lab() {
    const w = createWorld(5, 'established');
    const c = mine(w);
    c.cash = 50_000_000;
    run(w, 1);
    const pool = labPool(w).sort((a, b) => researcherPower(b, c) - researcherPower(a, c));
    expect(applyCommand(w, { type: 'startProject', companyId: c.id, kind: 'process' }).ok).toBe(false); // nobody to do it
    expect(applyCommand(w, { type: 'hireResearcher', id: pool[0].id, companyId: c.id }).ok).toBe(true);
    expect(applyCommand(w, { type: 'hireResearcher', id: pool[1].id, companyId: c.id }).ok).toBe(true);
    return { w, c };
  }

  it('milestones give sure gains that lower unit cost', () => {
    const { w, c } = lab();
    expect(applyCommand(w, { type: 'startProject', companyId: c.id, kind: 'process' }).ok).toBe(true);
    c.lab!.project!.points = c.lab!.project!.need / 3 + 0.01;
    run(w, 1);
    expect(c.lab!.project!.stage).toBe(1);
    expect(c.lab!.gains.cost).toBeCloseTo(RESEARCH.process.step, 5);
    expect(c.labFx!.cost).toBeLessThan(1);
    // lab wages show up as R&D
    expect(c.last.rd).toBeGreaterThanOrEqual(labWages(c));
  });

  it('a breakthrough patents the idea, helps sister companies, and can be licensed', () => {
    const { w, c } = lab();
    applyCommand(w, { type: 'startProject', companyId: c.id, kind: 'process' });
    // force the roll: try until a breakthrough (the chance grows with every miss)
    for (let i = 0; i < 60 && !patentsOf(w).some((p) => p.holderId === c.id); i++) {
      if (!c.lab!.project) applyCommand(w, { type: 'startProject', companyId: c.id, kind: 'process' });
      c.lab!.project!.points = c.lab!.project!.need;
      run(w, 1);
    }
    const pat = patentsOf(w).find((p) => p.holderId === c.id)!;
    expect(pat).toBeDefined();
    expect(pat.expires - pat.granted).toBe(PATENT_DAYS);
    expect(c.labFx!.cost).toBeLessThan(1 - RESEARCH.process.prize + 1e-9);
    // a rival making the same product can license it, and pays per unit sold
    const rival = w.companies.find((x) => !x.isPlayer && !x.bankrupt && x.good === c.good)!;
    w.rivals.forEach((r) => { r.relation = 20; });
    const value = patentValuePerUnit(w, pat, rival);
    expect(applyCommand(w, { type: 'offerLicence', patentId: pat.id, companyId: rival.id, fee: value * 1.2 }).message).toMatch(/counters/);
    expect(applyCommand(w, { type: 'offerLicence', patentId: pat.id, companyId: rival.id, fee: value * 0.5 }).ok).toBe(true);
    run(w, 2);
    expect(rival.labFx?.cost ?? 1).toBeLessThan(1);
    if (rival.last.sold > 0) expect(pat.earned).toBeGreaterThan(0);
  });

  it('rival breakthroughs can be licensed, and shrink your prize on the same idea', () => {
    const { w, c } = lab();
    applyCommand(w, { type: 'startProject', companyId: c.id, kind: 'quality' });
    const rival = w.companies.find((x) => !x.isPlayer && !x.bankrupt && x.good === c.good)!;
    rival.rdPct = 3; // make its lab hugely likely to hit
    for (let i = 0; i < 20 && !patentsOf(w).some((p) => p.holderId === rival.id && p.kind === 'quality'); i++) monthlyResearch(w);
    const pat = patentsOf(w).find((p) => p.holderId === rival.id && p.kind === 'quality');
    if (!pat) return;
    expect(c.lab!.project!.scooped).toBe(true);
    w.rivals.forEach((r) => { r.relation = 20; });
    expect(licenceOffers(w).some((o) => o.patent.id === pat.id && o.company.id === c.id)).toBe(true);
    expect(applyCommand(w, { type: 'acceptLicence', patentId: pat.id, companyId: c.id }).ok).toBe(true);
    run(w, 1);
    expect(c.labFx!.quality).toBeGreaterThan(0);
  });
});

describe('the world reaches home', () => {
  it('a war between oil exporters raises the world oil price at home, and wars cut export demand', () => {
    const w = createWorld(5, 'established');
    run(w, 1);
    const t = tradeState(w);
    worldLink(w, t);
    const before = worldIdx(w, 'crude_oil');
    const mood = t.exportMood!;
    // Nordland and Solvara both have oil to spare: at war, their buyers are cut off
    t.wars.push('nordland|solvara');
    worldLink(w, t);
    expect(worldIdx(w, 'crude_oil')).toBeGreaterThan(before);
    expect(t.exportMood!).toBeLessThan(mood);
  });

  it('fat, tight markets draw a newcomer', () => {
    const w = createWorld(5, 'established');
    run(w, 31);
    const g = 'phones';
    for (const c of w.companies.filter((x) => x.good === g)) { c.sum30.netIncome = c.sum30.revenue * 0.4; }
    w.goods[g].tightness = 1.05;
    const n = w.companies.filter((x) => x.good === g && !x.bankrupt).length;
    for (let i = 0; i < 10 && w.companies.filter((x) => x.good === g && !x.bankrupt).length === n; i++) marketEntry(w);
    expect(w.companies.filter((x) => x.good === g && !x.bankrupt).length).toBeGreaterThan(n);
  });
});
