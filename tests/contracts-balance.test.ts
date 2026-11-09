import { describe, expect, it } from 'vitest';
import { JOB_CAP_SHARE, MAX_JOBS, applyCommand, createWorld, maxJobs, refPrice, step } from '../src/engine';
import type { Job, WorldState } from '../src/engine/types';

const mine = (w: WorldState) => w.companies.find((c) => c.isPlayer && !c.bankrupt)!;

function offer(w: WorldState, id: string, perDay: number): Job {
  const c = mine(w);
  const j: Job = {
    id, source: 'gov', buyerName: 'Test Office', good: c.good, qty: Math.round(perDay * 30), delivered: 0, pay: perDay * 30 * refPrice(w, c.good),
    bonus: 0, penalty: 0, days: 30, deadline: 0, startDay: 0, status: 'offer', offerUntil: w.day + 5,
  };
  w.play.jobs.push(j);
  return j;
}

describe('contracts balance', () => {
  it('offers pay close to the market price, not far above it', () => {
    const w = createWorld(7, 'established');
    w.player.level = 5;
    const seen: number[] = [];
    for (let d = 0; d < 400 && seen.length < 40; d++) {
      step(w);
      w.pending = [];
      for (const j of w.play.jobs) {
        if (j.status !== 'offer' || j.source === 'tender' || seen.length >= 40 || (j as Job & { seen?: 1 }).seen) continue;
        (j as Job & { seen?: 1 }).seen = 1;
        seen.push((j.pay + j.bonus) / j.qty / refPrice(w, j.good));
      }
    }
    expect(seen.length).toBeGreaterThan(20);
    const avg = seen.reduce((s, x) => s + x, 0) / seen.length;
    expect(avg).toBeLessThan(1.12);
    expect(Math.max(...seen)).toBeLessThan(1.18);
  }, 60000);

  it('bigger plants run more contracts, but contracts never book all the output', () => {
    const w = createWorld(5, 'established');
    w.player.level = 5;
    const c = mine(w);
    c.level = 1;
    expect(maxJobs(c)).toBe(2);
    c.level = 5;
    expect(maxJobs(c)).toBe(4);
    c.level = 20;
    expect(maxJobs(c)).toBe(MAX_JOBS);
    c.level = 5;
    const small = c.capacity * 0.12;
    for (let i = 0; i < 4; i++) expect(applyCommand(w, { type: 'acceptJob', jobId: offer(w, `a${i}`, small).id, companyId: c.id }).ok).toBe(true);
    const r = applyCommand(w, { type: 'acceptJob', jobId: offer(w, 'a5', small).id, companyId: c.id });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/4 contracts/);

    const w2 = createWorld(5, 'established');
    w2.player.level = 5;
    const c2 = mine(w2);
    c2.level = 9;
    expect(applyCommand(w2, { type: 'acceptJob', jobId: offer(w2, 'b1', c2.capacity * 0.5).id, companyId: c2.id }).ok).toBe(true);
    const r2 = applyCommand(w2, { type: 'acceptJob', jobId: offer(w2, 'b2', c2.capacity * (JOB_CAP_SHARE - 0.4)).id, companyId: c2.id });
    expect(r2.ok).toBe(false);
    expect(r2.message).toMatch(/at most 70%/);
  });
});
