import { describe, expect, it } from 'vitest';
import {
  GOODS, HOME, OFFICE_COST, applyCommand, boom, createWorld, exportQuote, foreignPrice, importQuote, marketEntry, mergerTarget, monthlyMergers,
  monthlyTrade, nation, phaseOf, shipDaysOf, step, tariffOf, tradeState, tycoonFound, wageIndex, weeklyShocks,
} from '../src/engine';
import { computeAdvice } from '../src/engine/advisor';
import { updateLabour } from '../src/engine/macro';
import type { GoodId, WorldState } from '../src/engine/types';

function run(w: WorldState, days: number) {
  for (let i = 0; i < days; i++) { step(w); w.pending = []; }
}
const mine = (w: WorldState) => w.companies.find((c) => c.isPlayer && !c.bankrupt)!;
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

describe('supply chain shocks', () => {
  it('a jump in a material makes news and warns the companies that use it', () => {
    const w = createWorld(5, 'established');
    const c = mine(w);
    const g = GOODS[c.good].inputs[0].good;
    w.goods[g].hist = Array.from({ length: 20 }, (_, i) => ({ day: i * 2, price: i < 5 ? 100 : 125 }));
    weeklyShocks(w);
    expect(w.news.some((n) => n.headline.startsWith(`${GOODS[g].name} up`))).toBe(true);
    expect(computeAdvice(w).some((a) => a.id === `shock-${g}-${c.id}`)).toBe(true);
    // Once is enough: no repeat while it is fresh
    const n = w.news.length;
    weeklyShocks(w);
    expect(w.news.length).toBe(n);
  });
});

describe('labour market', () => {
  it('an industry short of workers pays more than one with plenty', () => {
    const w = createWorld(5, 'established');
    updateLabour(w);
    w.macro.labour!.tech!.base *= 0.8; // fewer skilled people than tech firms employ
    w.macro.labour!.retail!.base *= 1.2;
    for (let i = 0; i < 24; i++) updateLabour(w);
    expect(w.macro.labour!.tech!.mult).toBeGreaterThan(1.05);
    expect(wageIndex(w, 'tech')).toBeGreaterThan(wageIndex(w, 'retail'));
  });
});

describe('foreign economies', () => {
  it('a boom raises what a country pays and its interest rate; higher rates lift its currency', () => {
    const w = createWorld(5, 'established');
    const t = tradeState(w);
    const id = 'bharatara';
    const s = t.nations[id];
    const need = nation(id).needs[0];
    const calm = foreignPrice(w, id, need);
    s.growth = nation(id).trend + 0.04;
    expect(phaseOf(t, id)).toBe('boom');
    expect(boom(t, id)).toBeGreaterThan(1);
    expect(foreignPrice(w, id, need)).toBeGreaterThan(calm);
    for (let i = 0; i < 12; i++) {
      t.wars = [];
      s.growth = nation(id).trend + 0.04;
      monthlyTrade(w);
    }
    expect(s.rate!).toBeGreaterThan(nation(id).rate0 + 0.02);
    expect(s.fx / nation(id).fx0).toBeGreaterThan(1.05);
  });

  it('a trade office halves the tariff and speeds up ships', () => {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    w.player.cash = 1e8;
    const t = tradeState(w);
    const id = 'kestria';
    const tariff = tariffOf(t, id);
    const days = shipDaysOf(t, id);
    const ship = exportQuote(w, id, 'cars', 1000).shipping;
    expect(applyCommand(w, { type: 'openOffice', nation: id }).ok).toBe(true);
    expect(w.player.cash).toBe(1e8 - OFFICE_COST);
    expect(tariffOf(t, id)).toBeCloseTo(tariff / 2, 6);
    expect(shipDaysOf(t, id)).toBeLessThan(days);
    expect(exportQuote(w, id, 'cars', 1000).shipping).toBeLessThan(ship);
  });

  it('free-trade deals drop tariffs; sanctions stop trade; both make news', () => {
    const w = createWorld(5, 'established');
    w.player.level = 10;
    const t = tradeState(w);
    const id = 'kestria';
    const g = nation(id).spare[0];
    for (let i = 0; i < 300 && !t.nations[id].deal; i++) {
      t.rel[key(HOME, id)] = 0.9;
      t.wars = [];
      monthlyTrade(w);
    }
    expect(t.nations[id].deal?.kind).toBe('fta');
    expect(tariffOf(t, id)).toBe(0);
    expect(importQuote(w, id, g, 100).tariff).toBe(0);
    expect(w.news.some((n) => n.headline.includes('free-trade'))).toBe(true);

    // It attacks an ally of Astoria: sanctions
    delete t.nations[id].deal;
    const ally = 'nordland';
    for (let i = 0; i < 80 && (t.nations[id].deal as { kind: string } | undefined)?.kind !== 'sanction'; i++) {
      delete t.nations[id].deal;
      t.rel[key(HOME, id)] = 0;
      t.rel[key(HOME, ally)] = 0.8;
      t.wars = [key(id, ally)];
      monthlyTrade(w);
    }
    expect((t.nations[id].deal as { kind: string } | undefined)?.kind).toBe('sanction');
    expect(w.news.some((n) => n.headline.includes('sanctions on'))).toBe(true);
    const res = applyCommand(w, { type: 'exportGoods', to: id, good: 'cars' as GoodId, qty: 1 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/sanctions/);
  });
});

describe('rivals: mergers, cash and newcomers', () => {
  function setup() {
    const w = createWorld(5, 'established');
    run(w, 31);
    // a market with a few makers, so two small ones together stay under 40%
    const g = (Object.keys(w.goods) as GoodId[]).find((x) => !GOODS[x].reg && !GOODS[x].permit && x !== 'banking' && w.companies.filter((c) => c.good === x && !c.bankrupt).length >= 2 && w.companies.some((c) => c.good === x && w.rivals.some((r) => r.id === c.ownerId)))!;
    let target = null as ReturnType<typeof tycoonFound>;
    let founder = w.rivals[0];
    for (const r of w.rivals.filter((x) => x.tycoon && !w.companies.some((c) => c.good === g && c.ownerId === x.id))) {
      r.cash = 1e11;
      target = tycoonFound(w, r, g);
      if (target) { founder = r; break; }
    }
    if (!target) throw new Error(`no tycoon could found a company in ${g}`);
    target.founded = w.day - 400;
    target.sum30.revenue = 1e6;
    target.sum30.netIncome = -1e5;
    const buyerCo = w.companies.find((c) => c.good === g && !c.bankrupt && c.ownerId !== founder.id && w.rivals.some((r) => r.id === c.ownerId))!;
    buyerCo.sum30.revenue = 1e6;
    buyerCo.sum30.netIncome = 2e5;
    const buyer = w.rivals.find((r) => r.id === buyerCo.ownerId)!;
    buyer.cash = 1e12;
    buyer.personality.ambition = 1;
    for (const r of w.rivals) if (r !== buyer) r.lastMergerDay = w.day; // only the buyer acts
    return { w, g, founder, target, buyer, buyerCo };
  }
  const tries = (w: WorldState, buyer: { lastMergerDay?: number }, done: () => boolean) => {
    for (let i = 0; i < 60 && !done(); i++) { buyer.lastMergerDay = undefined; monthlyMergers(w); }
  };

  it('a rich rival buys a weak company in its market, and the seller is paid', () => {
    const { w, founder, target, buyer, buyerCo } = setup();
    buyerCo.capacity = target.capacity; // together still well under 40% of the market
    const m = mergerTarget(w, buyer)!;
    expect(m.target.id).toBe(target.id);
    expect(m.blocked).toBe(false);
    founder.cash = 1e9; // under the fortune rivals start spending from, so only the sale moves it
    const before = founder.cash;
    tries(w, buyer, () => target.ownerId === buyer.id);
    expect(target.ownerId).toBe(buyer.id);
    expect(founder.cash).toBeGreaterThan(before);
    expect(w.news.some((n) => n.headline === `${buyer.name} buys ${target.name}`)).toBe(true);
  });

  it('the regulator blocks a merger that would pass 40% of the market', () => {
    const { w, g, founder, target, buyer, buyerCo } = setup();
    buyerCo.capacity = w.companies.filter((c) => c.good === g && !c.bankrupt).reduce((s, c) => s + c.capacity, 0);
    expect(mergerTarget(w, buyer)!.blocked).toBe(true);
    tries(w, buyer, () => w.news.some((n) => n.headline.startsWith('Regulator blocks')));
    expect(w.news.some((n) => n.headline.startsWith('Regulator blocks'))).toBe(true);
    expect(target.ownerId).toBe(founder.id);
  });

  it('a market with a single maker draws a challenger on a modest margin', () => {
    const w = createWorld(5, 'established');
    run(w, 31);
    const g: GoodId = 'laptops';
    const cs = w.companies.filter((c) => c.good === g && !c.bankrupt);
    for (const c of cs) { c.ownerId = cs[0].ownerId; c.sum30.revenue = 1e6; c.sum30.netIncome = 1e5; } // one group, 10% margin
    w.goods[g].tightness = 0.85;
    for (const r of w.rivals) r.cash = Math.max(r.cash, 2e10);
    const n = cs.length;
    for (let i = 0; i < 200 && w.companies.filter((x) => x.good === g && !x.bankrupt).length === n; i++) marketEntry(w);
    expect(w.companies.filter((x) => x.good === g && !x.bankrupt).length).toBeGreaterThan(n);
  });
});
