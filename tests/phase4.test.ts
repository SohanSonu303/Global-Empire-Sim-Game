import { describe, expect, it } from 'vitest';
import { AI_COMPANIES, GOODS, GOOD_IDS, REG_PRICE_CAP, adviseCompany, applyCommand, createWorld, foundingPartners, hasPermit, maxPriceMult, outsidePct, permitFee, sellPrice, refPrice, startCost, step, tycoonFound } from '../src/engine';
import type { GoodId, WorldState } from '../src/engine';
import { addMissingGoods, chainDemand } from '../src/engine/world';

function run(w: WorldState, days: number) {
  for (let i = 0; i < days; i++) { step(w); w.pending = []; }
}

const NEW: GoodId[] = ['copper', 'lithium', 'bauxite', 'rare_earths', 'limestone', 'natural_gas', 'aluminium', 'batteries', 'cement', 'water', 'construction',
  'real_estate', 'ecommerce', 'gaming', 'ai', 'robots', 'space', 'defense', 'airlines', 'hospitals', 'wellness'];

/** A world with every licence, plenty of cash and the industries a test needs. */
function rich(seed = 4, cash = 3_000_000_000): WorldState {
  const w = createWorld(seed, 'established');
  w.player.cash = cash;
  for (const ind of ['health', 'tech', 'manufacturing', 'services', 'energy', 'resources', 'retail', 'finance'] as const) applyCommand(w, { type: 'buyLicence', industry: ind });
  return w;
}

describe('phase 4 goods and supply chains', () => {
  it('adds 21 goods listed in supply-chain order, without moving the old prices', () => {
    expect(GOOD_IDS).toHaveLength(46);
    for (const g of NEW) expect(GOODS[g]).toBeDefined();
    GOOD_IDS.forEach((g, i) => {
      for (const inp of GOODS[g].inputs) expect(GOOD_IDS.indexOf(inp.good), `${inp.good} before ${g}`).toBeLessThan(i);
    });
    // Prices of the old goods stay within 1% of what the economy was calibrated on
    const old: [GoodId, number][] = [['electricity', 41.22], ['plastics', 91.29], ['steel', 149.87], ['chips', 152.2], ['cars', 1425.99], ['phones', 403.97], ['laptops', 1062.23], ['food', 74.95], ['banking', 62.54]];
    for (const [g, p0] of old) expect(Math.abs(GOODS[g].p0 / p0 - 1), g).toBeLessThan(0.01);
  });

  it('links the new materials into old products', () => {
    const uses = (g: GoodId, inp: GoodId) => GOODS[g].inputs.some((i) => i.good === inp);
    expect(uses('electricity', 'natural_gas')).toBe(true);
    expect(uses('chips', 'rare_earths')).toBe(true);
    expect(uses('cars', 'batteries')).toBe(true);
    expect(uses('cars', 'robots')).toBe(true);
    expect(uses('phones', 'batteries')).toBe(true);
    expect(uses('banking', 'ai')).toBe(true);
    expect(uses('hospitals', 'medicine')).toBe(true);
    // every new good is either sold to households or used by another business
    const d = chainDemand();
    for (const g of NEW) expect(d[g]).toBeGreaterThan(0);
  });

  it('opens every new market with AI producers', () => {
    const w = createWorld(6);
    for (const g of NEW) {
      expect(AI_COMPANIES.some((a) => a[2] === g), g).toBe(true);
      expect(w.companies.some((c) => c.good === g && !c.bankrupt), g).toBe(true);
    }
    // some are owned by tycoons and rivals from the start
    expect(w.companies.find((c) => c.ticker === 'ORB')?.ownerId).toBe('eusk');
    expect(w.companies.find((c) => c.ticker === 'SYN')?.ownerId).toBe('saltman');
  });

  it('keeps the new markets supplied and solvent for a year', () => {
    const w = createWorld(12);
    run(w, 365);
    for (const g of NEW) {
      const m = w.goods[g];
      expect(m.imported / Math.max(1, m.sold + m.imported), g).toBeLessThan(0.25);
      expect(m.idx, g).toBeGreaterThan(0.7);
      expect(m.idx, g).toBeLessThan(1.6);
    }
  }, 120000);
});

describe('mega businesses and permits', () => {
  it('charges the permit once, on top of the plant', () => {
    const w = rich();
    expect(permitFee(w, 'hospitals')).toBe(1_000_000_000);
    expect(permitFee(w, 'software')).toBe(0);
    const cash = w.player.cash;
    expect(applyCommand(w, { type: 'foundCompany', name: 'Mercy', good: 'hospitals' }).ok).toBe(true);
    expect(cash - w.player.cash).toBeGreaterThanOrEqual(1_000_000_000 + startCost('hospitals') * 0.7);
    expect(hasPermit(w, 'hospitals')).toBe(true);
    const before = w.player.cash;
    expect(applyCommand(w, { type: 'foundCompany', name: 'Mercy Two', good: 'hospitals' }).ok).toBe(true);
    expect(before - w.player.cash).toBeLessThan(startCost('hospitals') * 1.01); // no second permit
  });

  it('refuses when you cannot pay plant and permit', () => {
    const w = rich(4, 500_000_000);
    const r = applyCommand(w, { type: 'foundCompany', name: 'Rocket', good: 'space' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/permit/);
  });

  it('lets a partner pay their share of the bill for the same share of the company', () => {
    const w = rich(4, 600_000_000);
    const total = startCost('space') + permitFee(w, 'space');
    expect(applyCommand(w, { type: 'foundCompany', name: 'Too Much', good: 'space', partnerId: 'fund', partnerPct: 0.45 }).ok).toBe(false); // the fund takes at most 30%
    const eusk = w.rivals.find((r) => r.id === 'eusk')!;
    const rCash = eusk.cash;
    const pCash = w.player.cash;
    const r = applyCommand(w, { type: 'foundCompany', name: 'Skyward', good: 'space', partnerId: 'eusk', partnerPct: 0.4 });
    expect(r.ok, r.message).toBe(true);
    const c = w.companies.find((x) => x.name === 'Skyward')!;
    expect(outsidePct(c)).toBeCloseTo(0.4);
    expect(rCash - eusk.cash).toBeCloseTo(total * 0.4, -4);
    expect(pCash - w.player.cash).toBeLessThan(total * 0.61);
    // small projects can't take partners
    expect(foundingPartners(w, 'software', startCost('software')).every((p) => !p.ok)).toBe(true);
  });

  it('makes tycoons pay the permit when they enter a mega business', () => {
    const w = createWorld(3);
    run(w, 30);
    const r = w.rivals.find((x) => x.id === 'saltman')!;
    const cash = r.cash;
    const c = tycoonFound(w, r, 'robots');
    expect(c).not.toBeNull();
    expect(cash - r.cash).toBeGreaterThan(GOODS.robots.permit!);
  });
});

describe('regulated healthcare', () => {
  it('caps the price at the market price', () => {
    const w = rich();
    applyCommand(w, { type: 'foundCompany', name: 'Calm', good: 'wellness' });
    const c = w.companies.find((x) => x.name === 'Calm')!;
    expect(GOODS.wellness.reg).toBe(true);
    expect(maxPriceMult('wellness')).toBe(REG_PRICE_CAP);
    const r = applyCommand(w, { type: 'setPrice', companyId: c.id, priceMult: 1.4 });
    expect(r.message).toMatch(/Regulated/);
    expect(c.priceMult).toBeLessThanOrEqual(REG_PRICE_CAP);
    c.priceMult = 1.5; // even if it got there somehow, buyers pay at most the market price
    expect(sellPrice(w, c)).toBeCloseTo(refPrice(w, 'wellness'));
  });

  it('does not let a shortage push regulated prices up', () => {
    const w = createWorld(9);
    for (const c of w.companies) if (c.good === 'hospitals') c.capacity *= 0.4;
    run(w, 90);
    const costOnly = w.goods.medicine.idx; // the biggest input
    expect(w.goods.hospitals.tightness).toBeGreaterThan(1);
    expect(w.goods.hospitals.idx).toBeLessThan(Math.max(1.1, costOnly));
  }, 60000);

  it('earns thin but positive margins and never gets price-rise advice', () => {
    const w = rich(14);
    applyCommand(w, { type: 'foundCompany', name: 'Greenvale', good: 'hospitals' });
    run(w, 240);
    const c = w.companies.find((x) => x.name === 'Greenvale')!;
    expect(c.bankrupt).toBe(false);
    const margin = c.sum30.netIncome / c.sum30.revenue;
    expect(margin).toBeGreaterThan(0);
    expect(margin).toBeLessThan(0.15);
    for (const a of adviseCompany(w, c)) {
      if (a.action?.type === 'command' && a.action.cmd.type === 'setPrice') expect(a.action.cmd.priceMult).toBeLessThanOrEqual(1);
    }
  }, 60000);
});

describe('old saves', () => {
  it('get the new markets, and old producers grow to feed them', () => {
    const w = createWorld(11);
    const full = chainDemand();
    const old = chainDemand(NEW);
    w.companies = w.companies.filter((c) => !NEW.includes(c.good));
    for (const c of w.companies) c.capacity *= old[c.good] / full[c.good];
    for (const g of NEW) delete (w.goods as Partial<Record<GoodId, unknown>>)[g];
    const steelBefore = w.companies.filter((c) => c.good === 'steel').reduce((s, c) => s + c.capacity, 0);
    addMissingGoods(w);
    for (const g of NEW) {
      expect(w.goods[g]).toBeDefined();
      expect(w.companies.some((c) => c.good === g), g).toBe(true);
    }
    const steelAfter = w.companies.filter((c) => c.good === 'steel').reduce((s, c) => s + c.capacity, 0);
    expect(steelAfter / steelBefore).toBeCloseTo(full.steel / old.steel, 1);
    run(w, 120);
    expect(w.companies.filter((c) => c.bankrupt).length).toBeLessThanOrEqual(2);
  }, 60000);
});
