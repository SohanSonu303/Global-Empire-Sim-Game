import { describe, expect, it } from 'vitest';
import { applyCommand, createWorld, fixedAt, nextUpgradeCost, productivity, runAutomation, step } from '../src/engine';
import { resolveEvent } from '../src/engine/events';
import { antitrustFine } from '../src/engine/strategy';
import { monthlyTraits, noteStockSale, setTraits } from '../src/engine/traits';
import {
  DEADLINE_WEEK, GOAL_VALUE, IDEA_IDS, INVEST_AMOUNT, PAYOUT, PITCHES, PITCH_FINANCE, answerEvent, avg, capacityOf, econOf, hire, launch, newStartup, payout,
  pitchQuestions, pitchResult, playWeek, ruleCheck, runway, seeReview, setMarketing, setPrice, setRd, setSide, starterOffers, value,
  type IdeaId, type PitchQuestion, type Startup,
} from '../src/engine/startup';
import type { WorldState } from '../src/engine/types';

const mine = (w: WorldState) => w.companies.find((c) => c.isPlayer && !c.bankrupt)!;
const run = (w: WorldState, n: number) => { for (let i = 0; i < n; i++) step(w); };

describe('monopoly fixes', () => {
  it('fines are based on profit and selling part of the plant cuts fixed costs too', () => {
    const w = createWorld(3, 'established');
    w.player.level = 10;
    run(w, 40);
    const c = mine(w);
    c.sum30.netIncome = 1_000_000;
    c.sum30.revenue = 20_000_000;
    expect(antitrustFine(c)).toBeCloseTo(12e6 * 0.2); // 20% of a year's profit, not 5% of revenue (12M)
    c.sum30.netIncome = 100_000;
    expect(antitrustFine(c)).toBeLessThanOrEqual(1.2e6 * 0.5); // never more than half the profit
    w.pending.push({ id: 'ea', template: 'antitrust', day: w.day, companyId: c.id, rivalId: null, expiresDay: w.day + 5, title: 't', body: 'b', choices: [{ id: 'split', label: '', detail: '' }, { id: 'fine', label: '', detail: '' }], amount: 1000 });
    expect(resolveEvent(w, 'ea', 'split').ok).toBe(true);
    expect(c.fixedScale).toBeCloseTo(0.75);
    step(w);
    expect(c.last.fixed).toBeCloseTo(fixedAt(c.good, c.level) * w.macro.priceLevel * 0.75, 0);
  });

  it('closing a production line lowers level and fixed costs; auto-upgrade stops at a monopoly', () => {
    const w = createWorld(3, 'established');
    const c = mine(w);
    const cap = c.capacity;
    const lvl = c.level;
    expect(applyCommand(w, { type: 'downsize', companyId: c.id }).ok).toBe(true);
    expect(c.level).toBe(lvl - 1);
    expect(c.capacity).toBeLessThan(cap);
    expect(c.automation.autoUpgrade).toBe(false);

    c.automation.autoUpgrade = true;
    c.cash = 1e9;
    c.last.marketShare = 0.55;
    c.last.sold = c.capacity;
    c.last.demand = c.capacity * 2;
    const before = c.level;
    runAutomation(w, c);
    expect(c.level).toBe(before); // 55% share: no upgrade
    c.last.marketShare = 0.1;
    runAutomation(w, c);
    expect(c.level).toBe(before + 1); // normal share: upgrades as before
  });
});

describe('traits', () => {
  it('operations makes upgrades cheaper and workers faster', () => {
    const w = createWorld(4, 'established');
    const c = mine(w);
    const cost = nextUpgradeCost(c);
    const prod = productivity(c);
    setTraits(w, ['ops', 'finance']);
    expect(nextUpgradeCost(c)).toBeCloseTo(cost * 0.9);
    expect(productivity(c)).toBeCloseTo(prod * 1.05);
  });

  it('finance pays 5% of profit from non-raw companies on the monthly report', () => {
    const w = createWorld(4, 'established', { traits: ['finance', 'stocks'] });
    expect(w.player.traits).toEqual(['finance', 'stocks']);
    run(w, 30);
    const r = w.play.reports.at(-1)!;
    const c = mine(w);
    if (c.sum30.netIncome > 0) expect(r.traits?.some((t) => t.label.includes('Finance'))).toBe(true);
  });

  it('stock trait counts only shares held long enough, and covers part of losses', () => {
    const w = createWorld(4, 'established', { traits: ['stocks', 'deals'] });
    noteStockSale(w, 10_000, 3); // too short: ignored
    noteStockSale(w, 20_000, 10);
    const cash = w.player.cash;
    const lines = monthlyTraits(w);
    expect(w.player.cash - cash).toBeCloseTo(20_000 * 0.07);
    expect(lines).toHaveLength(1);
    noteStockSale(w, -50_000, 30);
    const c2 = w.player.cash;
    monthlyTraits(w);
    expect(w.player.cash - c2).toBeCloseTo(50_000 * 0.05);
  });

  it('only two traits, swap once from level 10 for a fee', () => {
    const w = createWorld(4, 'established', { traits: ['finance', 'raw', 'ops'] });
    expect(w.player.traits).toEqual(['finance', 'raw']);
    expect(applyCommand(w, { type: 'swapTrait', from: 'finance', to: 'ops' }).ok).toBe(false);
    w.player.level = 10;
    w.player.cash = 5e6;
    expect(applyCommand(w, { type: 'swapTrait', from: 'finance', to: 'ops' }).ok).toBe(true);
    expect(w.player.traits).toEqual(['ops', 'raw']);
    expect(w.player.cash).toBe(4e6);
    expect(applyCommand(w, { type: 'swapTrait', from: 'raw', to: 'deals' }).ok).toBe(false);
  });
});

/** A sensible founder: price for capacity, market while it pays, hire when the work is there. */
function sensible(s: Startup) {
  const e = econOf(s); const L = s.last;
  if (!s.launched && s.progress >= 100) launch(s);
  if (s.launched && L) {
    if (e.model === 'subs') {
      if (s.customers > capacityOf(s) * 0.98) setPrice(s, s.price * 1.03);
      if (s.price < e.ref) setPrice(s, e.ref);
      if (L.profit > 0 || runway(s) > 10) setMarketing(s, Math.min(0.25 * avg(s, 'revenue') + 800, s.marketing * 1.2 + 200));
      else setMarketing(s, s.marketing * 0.85);
      if (s.customers > capacityOf(s) * 0.85 && runway(s) > 8) hire(s);
      setRd(s, 800);
    } else {
      if (L.demand > L.capacity * 1.15) setPrice(s, s.price * 1.04);
      if (L.demand < L.capacity && (L.profit > 0 || runway(s) > 12)) setMarketing(s, Math.min(0.15 * avg(s, 'revenue') + 600, s.marketing * 1.25 + 200));
      else if (L.profit < 0) setMarketing(s, s.marketing * 0.85);
      if (L.demand > capacityOf(s) * 1.1 && runway(s) > 8) hire(s);
      setRd(s, 300);
    }
  } else if (!s.launched) {
    if (runway(s) > 14 && s.team < 3) hire(s);
    setMarketing(s, s.progress > 50 ? 1200 : 200);
    setRd(s, runway(s) > 10 ? 1500 : 300);
  }
  setSide(s, runway(s) < (s.investor === 'north' ? 10 : 6));
}

function run64(idea: IdeaId, seed: number, bot: (s: Startup) => void, kind?: 'design' | 'editing' | 'saas' | 'writing') {
  const inv = idea === 'freelance' ? 'harbor' : idea === 'chips' || idea === 'energy' ? 'north' : 'quinn';
  const s = newStartup(seed, idea, 'Test', inv, kind);
  for (let i = 0; i < 200 && s.stage === 'run'; i++) {
    seeReview(s);
    if (s.event) { answerEvent(s, s.event.id === 'rescue' ? 'accept' : s.event.choices[0].id); continue; }
    bot(s); playWeek(s);
  }
  return s;
}

const rightAnswers = (qs: PitchQuestion[]) => qs.map((q) => q.options.findIndex((o) => o.ok));

describe('startup mini-game', () => {
  it('the pitch is strict: 5 finance and technical questions, all must be right, only the right investor listens', () => {
    for (const q of [...PITCH_FINANCE, ...IDEA_IDS.flatMap((i) => PITCHES[i])]) {
      expect(q.options.filter((o) => o.ok).length, q.q).toBe(1);
      expect(q.options.length, q.q).toBe(4);
      expect(new Set(q.options.map((o) => o.text)).size, q.q).toBe(4);
    }
    for (const idea of IDEA_IDS) expect(PITCHES[idea].length).toBeGreaterThanOrEqual(8);
    const qs = pitchQuestions('ai', 1);
    expect(qs).toHaveLength(5);
    expect(qs.filter((q) => PITCH_FINANCE.includes(q))).toHaveLength(2);
    expect(qs.filter((q) => PITCHES.ai.includes(q))).toHaveLength(3);
    expect(pitchQuestions('ai', 1)).toEqual(qs); // same attempt, same questions
    const retry = pitchQuestions('ai', 1, 1);
    expect(retry.filter((q) => qs.includes(q))).toHaveLength(0); // a retry gets all-new questions
    for (const idea of IDEA_IDS) for (let seed = 1; seed < 40; seed++) {
      const a = pitchQuestions(idea, seed, 0);
      const b = pitchQuestions(idea, seed, 1);
      expect(new Set(a).size).toBe(5);
      expect(b.filter((q) => a.includes(q)), `${idea} ${seed}`).toHaveLength(0);
    }
    const ok = rightAnswers(qs);
    expect(pitchResult('ai', 'quinn', qs, ok)).toMatchObject({ pass: true, amount: INVEST_AMOUNT.ai });
    const oneWrong = [...ok]; oneWrong[3] = (ok[3] + 1) % 4;
    const r = pitchResult('ai', 'quinn', qs, oneWrong);
    expect(r.pass).toBe(false);
    expect(r.amount).toBe(0);
    expect(r.misses).toHaveLength(1);
    expect(pitchResult('ai', 'harbor', qs, ok)).toMatchObject({ pass: false, offTopic: true });
    const fq = pitchQuestions('freelance', 9);
    expect(pitchResult('freelance', 'harbor', fq, rightAnswers(fq)).pass).toBe(true);
  });

  it('a founder who never touches the levers does not reach the goal', () => {
    for (const idea of IDEA_IDS) {
      const s = run64(idea, 5, () => {}, 'design');
      expect(s.stage, idea).toBe('lost');
    }
  });

  it('a sensible plan reaches the goal, but not quickly', () => {
    for (const [idea, kind] of [['chips'], ['freelance', 'writing'], ['freelance', 'saas']] as const) {
      let wins = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const s = run64(idea, seed, sensible, kind);
        if (s.stage === 'won') {
          wins += 1;
          expect(value(s)).toBeGreaterThanOrEqual(GOAL_VALUE);
          expect(s.week, idea).toBeGreaterThan(20);
          expect(s.week).toBeLessThanOrEqual(DEADLINE_WEEK);
          expect(payout(s)).toBe(s.rescued ? 300_000 : PAYOUT);
        }
      }
      expect(wins, `${idea}/${kind ?? ''}`).toBeGreaterThanOrEqual(7);
    }
  });

  it('reviews cost trust when the investor rule is broken, and zero trust gets you fired', () => {
    const s = newStartup(3, 'freelance', 'Test', 'harbor', 'design');
    setMarketing(s, 10_000); // far more than the business earns
    for (let i = 0; i < 12; i++) { hire(s); playWeek(s); seeReview(s); if (s.event) answerEvent(s, s.event.choices[0].id); }
    expect(ruleCheck(s).ok).toBe(false);
    const misses = s.reviews.filter((r) => !r.ruleOk || !r.valueOk);
    expect(misses.length).toBeGreaterThan(0);
    expect(s.reviews.at(-1)!.trust).toBeLessThan(s.reviews.at(-2)!.trust);
    for (let i = 0; i < 80 && s.stage === 'run'; i++) { playWeek(s); seeReview(s); if (s.event) answerEvent(s, s.event.id === 'rescue' ? 'accept' : s.event.choices[0].id); }
    expect(s.stage).toBe('lost');
  });

  it('one great week does not make the company valuable: value uses the last 12 weeks', () => {
    const s = newStartup(9, 'freelance', 'Test', 'harbor', 'writing');
    playWeek(s);
    const before = value(s);
    s.hist[s.hist.length - 1].profit += 12_000;
    s.hist[s.hist.length - 1].revenue += 12_000;
    expect(value(s) - before).toBeLessThan(12_000 * 52 * 4 / 10);
  });

  it('the payout buys a starter company in the main game', () => {
    const offer = starterOffers(7).find((o) => o.good === 'grain')!;
    const w = createWorld(7, 'young', {
      traits: ['raw', 'finance'],
      starter: { good: offer.good, name: offer.name, price: offer.price },
      startup: { idea: 'Gaming studio', name: 'Pixel', investor: 'Mara Quinn', payout: 400_000, valuation: 3e9 },
    });
    const c = mine(w);
    expect(c.good).toBe('grain');
    expect(c.name).toBe(offer.name);
    expect(w.player.cash).toBe(400_000 - offer.price);
    expect(w.player.licences).toContain('resources');
    expect(w.player.startup?.name).toBe('Pixel');
    run(w, 60);
    expect(c.bankrupt).toBe(false);
  });
});
