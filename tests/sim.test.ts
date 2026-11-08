import { describe, expect, it } from 'vitest';
import { GOOD_IDS, applyCommand, cashRisk, computeAdvice, createWorld, dailyNeed, dealPartners, launchPreview, netWorth, refPrice, step } from '../src/engine';
import type { WorldState } from '../src/engine';
import { addMissingGoods } from '../src/engine/world';
import { repairMarket, sharesHeld } from '../src/engine/market';
import { GOODS, xpForLevel } from '../src/engine/data';
import { fmtCompact } from '../src/engine/news';
import { payBill } from '../src/engine/events';
import { grantLicence } from '../src/engine/licences';
import { recapitalize, damageMult, startCost, bankStats, bidQuote, companyValue, creditEvents, defaultRisk, loanBooks, loanRate, playerPct, saleOffers, stakeOffers } from '../src/engine';

function run(w: WorldState, days: number) {
  for (let i = 0; i < days; i++) step(w);
}

function finite(w: WorldState) {
  const bad: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(path);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(w, 'w');
  return bad;
}

describe('engine', () => {
  it('is deterministic for the same seed and commands', () => {
    const a = createWorld(42);
    const b = createWorld(42);
    applyCommand(a, { type: 'foundCompany', name: 'Acme', good: 'software' });
    applyCommand(b, { type: 'foundCompany', name: 'Acme', good: 'software' });
    run(a, 200);
    run(b, 200);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('different seeds diverge', () => {
    const a = createWorld(1);
    const b = createWorld(2);
    run(a, 60);
    run(b, 60);
    expect(a.stocks[0].price).not.toEqual(b.stocks[0].price);
  });

  for (const seed of [1, 7, 99, 2026]) {
    it(`economy stays within sane bounds over 10 years (seed ${seed})`, () => {
      const w = createWorld(seed);
      const g0 = w.macro.gdp;
      for (let y = 0; y < 10; y++) {
        run(w, 365);
        const m = w.macro;
        expect(m.inflation).toBeGreaterThan(-0.03);
        expect(m.inflation).toBeLessThan(0.15);
        expect(m.unemployment).toBeGreaterThan(0.015);
        expect(m.unemployment).toBeLessThan(0.16);
        expect(m.rate).toBeGreaterThanOrEqual(0.0025);
        expect(m.rate).toBeLessThanOrEqual(0.15);
      }
      const ratio = w.macro.gdp / g0;
      expect(ratio).toBeGreaterThan(0.9);
      expect(ratio).toBeLessThan(2.5);
      expect(finite(w)).toEqual([]);
      const alive = w.companies.filter((c) => !c.bankrupt).length;
      expect(alive).toBeGreaterThanOrEqual(12);
      for (const s of w.stocks) expect(s.price).toBeGreaterThan(0);
      expect(w.marketIndex).toBeGreaterThan(300);
      expect(w.marketIndex).toBeLessThan(6000);
    });
  }

  it('most new player companies make money at default settings', () => {
    let profitable = 0;
    for (const good of GOOD_IDS) {
      const w = createWorld(5);
      w.player.cash = Math.max(w.player.cash, startCost(good) + (GOODS[good].permit ?? 0)); // a bank needs $10M, mega businesses a permit
      const r = applyCommand(w, { type: 'foundCompany', name: 'Mine', good });
      expect(r.ok).toBe(true);
      run(w, 60);
      const c = w.companies.find((x) => x.isPlayer)!;
      expect(c.bankrupt).toBe(false);
      if (c.sum30.netIncome > 0) profitable++;
    }
    expect(profitable).toBeGreaterThanOrEqual(GOOD_IDS.length * 0.6);
  });

  it('own supplier sells to its sister company at a discount', () => {
    const w = createWorld(5);
    w.player.cash = 2_000_000;
    expect(applyCommand(w, { type: 'foundCompany', name: 'Ore Co', good: 'iron_ore' }).ok).toBe(true);
    expect(applyCommand(w, { type: 'foundCompany', name: 'Steel Co', good: 'steel' }).ok).toBe(false); // needs a manufacturing licence
    expect(applyCommand(w, { type: 'buyLicence', industry: 'manufacturing' }).ok).toBe(true);
    expect(applyCommand(w, { type: 'foundCompany', name: 'Steel Co', good: 'steel' }).ok).toBe(true);
    const ore = w.companies.find((c) => c.name === 'Ore Co')!;
    applyCommand(w, { type: 'setSisterDiscount', companyId: ore.id, discount: 0.3 });
    run(w, 20);
    expect(ore.sisterDiscount).toBeCloseTo(0.3);
    expect(ore.last.sisterSold).toBeGreaterThan(0);
    const steel = w.companies.find((c) => c.name === 'Steel Co')!;
    expect(steel.inputs.iron_ore!.cost).toBeLessThan(refPrice(w, 'iron_ore'));
  });

  it('AI partners accept fair deals and refuse greedy ones', () => {
    const w = createWorld(5);
    applyCommand(w, { type: 'foundCompany', name: 'Steel Co', good: 'steel' });
    run(w, 5);
    const me = w.companies.find((c) => c.isPlayer)!;
    const buyer = dealPartners(w, me).buyers[0];
    const qty = Math.max(1, Math.round(dailyNeed(buyer, 'steel') * 0.2));
    const ref = refPrice(w, 'steel');
    const greedy = applyCommand(w, { type: 'offerContract', companyId: me.id, partnerId: buyer.id, side: 'sell', qtyPerDay: qty, price: ref * 1.4, days: 30 });
    expect(greedy.ok).toBe(false);
    const fair = applyCommand(w, { type: 'offerContract', companyId: me.id, partnerId: buyer.id, side: 'sell', qtyPerDay: qty, price: ref * 0.9, days: 30 });
    expect(fair.ok).toBe(true);
    run(w, 10);
    expect(w.contracts[0].delivered).toBeGreaterThan(0);
  });

  it('the assistant gives advice with actions', () => {
    const w = createWorld(5);
    const first = computeAdvice(w);
    expect(first.some((a) => a.action?.type === 'openPlanner')).toBe(true);
    applyCommand(w, { type: 'foundCompany', name: 'Food Co', good: 'food' });
    // A just-founded company is fully staffed, so no "needs more workers" before day 1
    expect(computeAdvice(w).some((a) => a.id.startsWith('staff-'))).toBe(false);
    run(w, 30);
    for (const a of computeAdvice(w)) expect(a.title.length).toBeGreaterThan(0);
    const p = launchPreview(w, 'food', 1);
    expect(Number.isFinite(p.unitCost)).toBe(true);
    expect(p.soldPerDay).toBeGreaterThan(0);
  });

  it('the assistant does not cry wolf about healthy companies', () => {
    const noisy: string[] = [];
    for (const good of ['iron_ore', 'steel', 'food', 'software'] as const) {
      const w = createWorld(3);
      applyCommand(w, { type: 'foundCompany', name: 'Mine', good });
      const c = w.companies.find((x) => x.isPlayer)!;
      for (let d = 0; d < 120; d++) {
        step(w);
        w.pending = []; // ignore events (a rejected union claim can cause a real strike)
        if (c.sum30.netIncome <= 0 || c.cash < 0) continue;
        for (const a of computeAdvice(w)) {
          if ((a.severity === 'warn' || a.severity === 'urgent') && a.companyId === c.id) noisy.push(`${good} day ${d}: ${a.title}`);
        }
      }
    }
    expect(noisy).toEqual([]);
  });

  it('a profitable company with a thin balance is not "running out of cash"', () => {
    const w = createWorld(3);
    applyCommand(w, { type: 'foundCompany', name: 'Ore', good: 'iron_ore' });
    run(w, 60);
    const c = w.companies.find((x) => x.isPlayer)!;
    expect(c.sum30.netIncome).toBeGreaterThan(0);
    c.cash = 3_000; // dividends have drained it to the buffer
    expect(cashRisk(w, c)).toBeNull();
    expect(computeAdvice(w).some((a) => a.id === `cash-${c.id}`)).toBe(false);
  });

  it('the assistant still flags real cash trouble', () => {
    const w = createWorld(3);
    applyCommand(w, { type: 'foundCompany', name: 'Ore', good: 'iron_ore' });
    run(w, 30);
    const c = w.companies.find((x) => x.isPlayer)!;
    // Out of cash: bankruptcy countdown
    c.cash = -10_000;
    const neg = computeAdvice(w).find((a) => a.id === `cash-${c.id}`);
    expect(neg?.severity).toBe('urgent');
    // Losing money fast with little cash and no credit left
    c.cash = 20_000;
    c.debt = 1e9; // credit line used up
    c.sum30.netIncome = -30 * 5_000;
    expect(cashRisk(w, c)?.kind).toBe('burning');
  });

  it('old saves gain the new goods with producers', () => {
    const w = createWorld(6);
    run(w, 10);
    const NEW = ['timber', 'freight', 'medicine', 'clinics'] as const;
    for (const g of NEW) delete (w.goods as Partial<WorldState['goods']>)[g];
    w.companies = w.companies.filter((c) => !(NEW as readonly string[]).includes(c.good));
    addMissingGoods(w);
    for (const g of NEW) {
      expect(w.goods[g]).toBeDefined();
      expect(w.companies.some((c) => c.good === g && !c.isPlayer)).toBe(true);
    }
    run(w, 30);
    expect(finite(w)).toEqual([]);
  });

  it('the assistant suggests locking a price before a supply shock bites', () => {
    const w = createWorld(3);
    applyCommand(w, { type: 'foundCompany', name: 'Steel', good: 'steel' });
    run(w, 20);
    w.pending = [];
    w.effects.push({ id: 'x', kind: 'goodSupply', target: 'iron_ore', delta: -0.3, untilDay: w.day + 90 });
    const tip = computeAdvice(w).find((a) => a.id.startsWith('buylock-'));
    expect(tip?.action?.type).toBe('command');
    if (tip?.action?.type === 'command') expect(applyCommand(w, tip.action.cmd).ok).toBe(true);
  });

  it('price advice waits a week between changes', () => {
    const w = createWorld(3);
    applyCommand(w, { type: 'foundCompany', name: 'Ore', good: 'iron_ore' });
    run(w, 30);
    const c = w.companies.find((x) => x.isPlayer)!;
    applyCommand(w, { type: 'setPrice', companyId: c.id, priceMult: 1.5 });
    step(w);
    expect(computeAdvice(w).some((a) => /^(raise|trim|overpriced)-/.test(a.id))).toBe(false);
  });

  it('market orders respect liquidity limits', () => {
    const w = createWorld(3);
    w.player.cash = 1e12;
    const s = w.stocks[0];
    const huge = Math.floor(s.adv * 2);
    applyCommand(w, { type: 'placeOrder', ticker: s.ticker, side: 'buy', orderType: 'market', qty: huge });
    const held = w.player.holdings[s.ticker].shares;
    expect(held).toBeLessThan(huge);
    expect(held).toBeLessThanOrEqual(Math.floor(s.adv * 0.1) + 1);
    run(w, 30);
    expect(w.player.holdings[s.ticker].shares).toBeGreaterThan(held);
  });

  it('net worth reflects cash for a fresh game', () => {
    const w = createWorld(11);
    expect(netWorth(w)).toBeCloseTo(400_000);
  });

  it('selling a stake funds the company, splits dividends and keeps net worth', () => {
    const w = createWorld(3, 'established');
    run(w, 40);
    const c = w.companies.find((x) => x.id === 'p1')!;
    const nw = netWorth(w);
    const cash = c.cash;
    const offer = stakeOffers(w, c, 0.2).find((o) => o.buyerId === 'fund')!;
    expect(applyCommand(w, { type: 'sellStake', companyId: c.id, pct: 0.2, buyerId: 'fund' }).ok).toBe(true);
    expect(c.cash).toBeCloseTo(cash + offer.price);
    expect(playerPct(w, c)).toBeCloseTo(0.8);
    expect(netWorth(w)).toBeGreaterThan(nw * 0.97); // the fund buys at an 8% discount
    expect(applyCommand(w, { type: 'sellStake', companyId: c.id, pct: 0.4, buyerId: 'fund' }).ok).toBe(false); // over 49%
    expect(applyCommand(w, { type: 'transfer', companyId: c.id, amount: -1000 }).ok).toBe(false);
    // dividends: the player only gets 80%
    c.automation.dividendPct = 100;
    c.automation.minCash = 0;
    const before = w.player.cash;
    run(w, 1);
    if (c.last.netIncome > 0) expect(w.player.cash - before).toBeCloseTo(c.last.netIncome * 0.8, 0);
    expect(applyCommand(w, { type: 'buyBackStake', companyId: c.id, partnerId: 'fund' }).ok).toBe(true);
    expect(playerPct(w, c)).toBe(1);
  });

  it('a majority bid gives control of a listed company and selling returns it', () => {
    const w = createWorld(3);
    w.player.cash = 1e11;
    run(w, 10);
    const t = w.companies.find((x) => x.ticker && x.ownerId === 'public')!;
    expect(bidQuote(w, t, 0.1, 'majority').ok).toBe(false); // the public wants +25%
    expect(applyCommand(w, { type: 'bidCompany', companyId: t.id, premium: 0.3, mode: 'majority' }).ok).toBe(true);
    expect(t.isPlayer).toBe(true);
    expect(playerPct(w, t)).toBeGreaterThan(0.5);
    run(w, 5);
    expect(t.isPlayer).toBe(true);
    // a full buyout takes a company off the exchange without jolting the index
    const u = w.companies.find((x) => x.ticker && !x.isPlayer && x.id !== t.id)!;
    const n = w.stocks.length;
    const idx = w.marketIndex;
    expect(applyCommand(w, { type: 'bidCompany', companyId: u.id, premium: 0.6, mode: 'all' }).ok).toBe(true);
    expect(u.ticker).toBeNull();
    expect(w.stocks.length).toBe(n - 1);
    run(w, 1);
    expect(Math.abs(w.marketIndex / idx - 1)).toBeLessThan(0.1);
    const o = saleOffers(w, u).find((x) => x.ok)!;
    expect(applyCommand(w, { type: 'sellCompany', companyId: u.id, buyerId: o.buyerId }).ok).toBe(true);
    expect(u.isPlayer).toBe(false);
    expect(finite(w)).toEqual([]);
  });

  it('interest is paid to the lending bank, and your own bank lends to you cheaper', () => {
    const w = createWorld(5, 'established');
    w.player.cash = 9e6;
    run(w, 30);
    const books = loanBooks(w);
    const total = [...books.values()].reduce((s, x) => s + x, 0);
    expect(total).toBeGreaterThan(0);
    const banks = w.companies.filter((c) => c.good === 'banking');
    expect(banks.reduce((s, b) => s + b.last.interestIncome, 0)).toBeGreaterThan(0);
    const p1 = w.companies.find((x) => x.id === 'p1')!;
    p1.debt = 1e6;
    const before = loanRate(w, p1);
    expect(applyCommand(w, { type: 'foundCompany', name: 'House Bank', good: 'banking' }).ok).toBe(false); // banks need $10M
    grantLicence(w, 'finance');
    w.player.cash = 12e6;
    const nw = netWorth(w);
    expect(applyCommand(w, { type: 'foundCompany', name: 'House Bank', good: 'banking' }).ok).toBe(true);
    expect(w.player.cash).toBeCloseTo(2e6);
    const mine = w.companies.find((x) => x.name === 'House Bank')!;
    expect(mine.lockedCapital).toBeGreaterThan(9e6);
    expect(netWorth(w)).toBeGreaterThan(nw - 200_000); // the capital still counts as yours
    applyCommand(w, { type: 'transfer', companyId: mine.id, amount: -20e6 });
    expect(mine.cash).toBeGreaterThanOrEqual(mine.lockedCapital! - 1); // it cannot be withdrawn
    expect(applyCommand(w, { type: 'chooseBank', companyId: p1.id, bankId: mine.id }).ok).toBe(true);
    expect(loanRate(w, p1)).toBeLessThan(before);
    run(w, 10);
    expect(bankStats(w, mine).book).toBeCloseTo(p1.debt);
    expect(mine.last.interestIncome).toBeCloseTo(p1.last.interest);
    expect(companyValue(mine)).toBeGreaterThan(0);
  });

  it('banks provision for risky loans and take losses when borrowers fail', () => {
    const w = createWorld(6);
    run(w, 30);
    const b = w.companies.find((c) => c.good === 'banking')!;
    const borrower = w.companies.find((c) => !c.isPlayer && c.bankId === b.id && c.debt > 0)!;
    expect(b.loanReserve ?? 0).toBeGreaterThan(0);
    // make the borrower look distressed: risk, rates and provisions go up
    const safeRate = loanRate(w, borrower);
    borrower.lowCashDays = 40;
    expect(defaultRisk(borrower)).toBeGreaterThan(0.3);
    expect(loanRate(w, borrower)).toBeGreaterThan(safeRate + 0.1);
    const reserve = b.loanReserve ?? 0;
    w.macro.growth = -0.04; // recession: defaults far more likely
    const debt = borrower.debt;
    const cash = b.cash;
    for (let i = 0; i < 120 && borrower.debt === debt; i++) creditEvents(w);
    expect(borrower.debt).toBeLessThan(debt);
    expect((b.loanReserve ?? 0) + b.cash).toBeLessThan(reserve + cash);
    expect(finite(w)).toEqual([]);
  });

  it('accidents cut output until fixed, and the bill is paid from company cash then credit', () => {
    const w = createWorld(4, 'established');
    run(w, 25);
    const c = w.companies.find((x) => x.id === 'p1')!;
    // a fire: output limited, rebuilding restores it after 10 days
    c.damage = { mult: 0.5, untilDay: w.day + 120, cause: 'Fire damage' };
    w.pending.push({ id: 'evf', template: 'fire', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 7, title: 'Fire', body: '', amount: 50_000,
      choices: [{ id: 'rebuild', label: '', detail: '' }, { id: 'patch', label: '', detail: '' }, { id: 'wait', label: '', detail: '' }] });
    const cash = c.cash;
    expect(applyCommand(w, { type: 'resolveEvent', eventId: 'evf', choiceId: 'rebuild' }).ok).toBe(true);
    expect(c.cash).toBeCloseTo(cash - 50_000);
    run(w, 3);
    expect(damageMult(w, c)).toBe(0.5);
    expect(c.last.produced).toBeLessThanOrEqual(c.capacity * 0.5 + 1);
    run(w, 8);
    expect(damageMult(w, c)).toBe(1);
    // a bill bigger than company cash draws on the credit line and is logged
    c.cash = 1_000;
    expect(payBill(w, c, 40_000)).toBe(true);
    expect(c.loanLog?.[0].reason).toBe('repairs');
    expect(c.debt).toBeGreaterThan(0);
  });

  it('your companies repay automatic loans from spare cash', () => {
    const w = createWorld(4, 'established');
    run(w, 20);
    const c = w.companies.find((x) => x.id === 'p1')!;
    c.debt = 100_000;
    c.cash += 300_000;
    run(w, 1);
    expect(c.debt).toBe(0);
    c.automation.autoRepay = false;
    c.debt = 100_000;
    c.cash += 300_000;
    run(w, 1);
    expect(c.debt).toBe(100_000);
  });

  it('an AI bank that loses more than its cash raises new capital instead of collapsing', () => {
    // Seed 3 rolls an early oil shock that moves the whole market; this test is about the bank alone
    const w = createWorld(5);
    run(w, 30);
    const b = w.companies.find((c) => c.ticker === 'EYB')!;
    const s = w.stocks.find((x) => x.ticker === 'EYB')!;
    const shares = s.shares;
    const idx = w.marketIndex;
    b.cash = -500e6;
    recapitalize(w, b);
    expect(b.cash).toBeGreaterThan(0);
    expect(s.shares).toBeGreaterThan(shares);
    run(w, 60);
    expect(b.bankrupt).toBe(false);
    expect(Math.abs(w.marketIndex / idx - 1)).toBeLessThan(0.3);
  });

  it('the stock market stays within sane bounds over three years', () => {
    const w = createWorld(3);
    let lo = Infinity;
    for (let d = 0; d < 1080; d++) { step(w); w.pending = []; lo = Math.min(lo, w.marketIndex); }
    // This seed has an oil shock in the first months: rates hit 8% and the index falls ~45% before recovering
    expect(lo).toBeGreaterThan(500);
    expect(w.companies.filter((c) => c.good === 'banking' && c.bankrupt)).toEqual([]);
    const spend = w.companies.reduce((t, c) => t + c.marketingPct + c.rdPct, 0) / w.companies.length;
    expect(spend).toBeLessThan(0.11); // AI marketing + R&D settles near real-world levels
  });
});

describe('phase 1 fixes', () => {
  it('rivals can only buy shares that exist, and their cash stays sane over a long game', () => {
    const w = createWorld(3, 'established');
    run(w, 3000);
    for (const s of w.stocks) {
      expect(sharesHeld(w, s.ticker), s.ticker).toBeLessThanOrEqual(s.shares + 1);
      expect(s.adv).toBeLessThanOrEqual(s.shares * 0.01 + 1);
    }
    for (const r of w.rivals) expect(r.cash, r.id).toBeLessThan(50e9);
  }, 120000);

  it('repairs saves where rivals hold more shares than exist', () => {
    const w = createWorld(4, 'established');
    const s = w.stocks[0];
    w.rivals[0].holdings[s.ticker] = { shares: s.shares * 5, avgCost: 1 };
    w.rivals[1].cash = 1e18;
    s.adv = s.shares * 40;
    repairMarket(w);
    expect(sharesHeld(w, s.ticker)).toBeLessThanOrEqual(s.shares);
    expect(s.adv).toBeLessThanOrEqual(s.shares * 0.01);
    expect(w.rivals[1].cash).toBeLessThan(1e12);
  });

  it('levels take longer: level 10 needs about 36K XP', () => {
    expect(xpForLevel(9)).toBeGreaterThan(30_000);
    expect(xpForLevel(9)).toBeLessThan(45_000);
    for (let l = 1; l < 25; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });

  it('compact money always keeps its unit', () => {
    expect(fmtCompact(950)).toBe('$950');
    expect(fmtCompact(12_400)).toBe('$12.4K');
    expect(fmtCompact(14_520_000)).toBe('$14.5M');
    expect(fmtCompact(2_310_000_000)).toBe('$2.31B');
    expect(fmtCompact(999_999)).toBe('$1.00M');
    expect(fmtCompact(-3_200_000_000_000)).toBe('-$3.20T');
  });
});
