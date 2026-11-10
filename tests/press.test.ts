import { describe, expect, it } from 'vitest';
import { JUDGE_DAYS, createWorld, sectorOutlook, step, weeklyPress } from '../src/engine';
import type { WorldState } from '../src/engine/types';

function run(w: WorldState, days: number) {
  for (let i = 0; i < days; i++) { step(w); w.pending = []; }
}

describe('the Tipster', () => {
  it('prints a tip, the story breaks, and the call is judged on the share price', () => {
    const w = createWorld(5, 'established');
    run(w, 40);
    const rng = JSON.stringify(w.rng);
    const old = new Set((w.play.calls ?? []).map((x) => x.id));
    const fresh = () => (w.play.calls ?? []).find((x) => !old.has(x.id));
    for (let i = 0; i < 20 && !fresh(); i++) { w.day += 7; weeklyPress(w); }
    expect(JSON.stringify(w.rng)).toBe(rng); // its own dice: the rest of the world is unchanged
    const k = fresh()!;
    expect(w.news.some((n) => n.headline.startsWith(`Tipster:`) && n.headline.includes(k.ticker))).toBe(true);
    const s = w.stocks.find((x) => x.ticker === k.ticker)!;
    s.halted = false; // a halted stock gets no news push
    const impact = s.newsImpact;
    w.day = k.due;
    weeklyPress(w);
    expect(k.broke).toBe(true);
    // A true story pushes the price the way of the tip; a false one the other way
    expect(Math.sign(s.newsImpact - impact)).toBe(k.truth ? k.dir : -k.dir);
    const before = w.play.callScore!.total;
    w.day = k.due + JUDGE_DAYS;
    weeklyPress(w);
    expect(k.judged).toBe(true);
    expect(k.hit).toBe((k.end! / k.start - 1) * k.dir > 0);
    expect(w.play.callScore!.total).toBe(before + 1);
  });

  it('is right only about half the time', () => {
    let right = 0;
    let total = 0;
    for (const seed of [3, 9]) {
      const w = createWorld(seed, 'established');
      run(w, 1100);
      right += w.play.callScore!.right;
      total += w.play.callScore!.total;
    }
    expect(total).toBeGreaterThan(60);
    expect(right / total).toBeGreaterThan(0.4);
    expect(right / total).toBeLessThan(0.68);
  }, 120000);
});

describe('Industry Watch', () => {
  it('ranks an industry with shortages and rising prices above one with a glut', () => {
    const w = createWorld(5, 'established');
    run(w, 40);
    const goodsOf = (ind: string) => (Object.keys(w.goods) as (keyof typeof w.goods)[]).filter((g) => w.companies.some((c) => c.good === g && c.industry === ind));
    for (const g of goodsOf('energy')) {
      w.goods[g].tightness = 1.2;
      const h = w.goods[g].hist;
      h.push({ day: w.day + 1, price: h[h.length - 1].price * 1.25 });
    }
    for (const g of goodsOf('resources')) w.goods[g].tightness = 0.6;
    const s = sectorOutlook(w);
    const energy = s.find((x) => x.industry === 'energy')!;
    const resources = s.find((x) => x.industry === 'resources')!;
    expect(energy.score).toBeGreaterThan(resources.score);
    expect(['hot', 'warm']).toContain(energy.outlook);
    expect(energy.reasons.join(' ')).toMatch(/supply is short|prices are up/);
    expect(resources.reasons.join(' ')).toMatch(/more capacity than buyers need/);
  });
});
