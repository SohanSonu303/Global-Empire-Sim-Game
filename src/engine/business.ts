/**
 * Running a business day to day: winning and keeping customers, machines that wear out,
 * staff who learn on the job (and leave when unhappy), and the managers you can hire.
 */
import { GOODS, GOOD_IDS } from './data';
import { MAINT, NEW_HIRE_SKILL, WEAR_PER_DAY, boostMult, clamp, reachOf } from './company';
import { campaignMult } from './strategy';
import { execSkill } from './execs';
import type { Company, GoodId, WorldState } from './types';

/** Satisfaction a company settles at: orders filled, quality and price against the market */
export function satisfactionTarget(c: Company, avgQuality: number): number {
  return clamp(0.3 + 0.45 * fillRate(c) + 0.35 * clamp(c.quality / Math.max(0.1, avgQuality) - 1, -0.25, 0.25) - 0.8 * (c.priceMult * boostMult(c, 'price') - 1), 0.05, 1);
}

/** Share of its own customers' orders a company filled. A plant selling all it can make isn't letting anyone down. */
export function fillRate(c: Company): number {
  const owed = Math.min(c.last.demand, c.capacity);
  return owed > 0 ? Math.min(1, c.last.sold / owed) : 1;
}

/** Customers a company can hold on to, given satisfaction and marketing */
export function reachTarget(c: Company): number {
  return clamp(0.25 + 0.9 * (c.satisfaction ?? 0.75) + 2.5 * c.marketingPct, 0.1, 1.3);
}

/** Share of the gap to the target closed each day while winning customers */
export function reachSpeed(w: WorldState, c: Company): number {
  const sales = c.isPlayer ? 1 + 0.25 * Math.min(1.4, execSkill(w, 'sales')) : 1; // a head of sales wins customers faster
  return (0.006 + 0.12 * c.marketingPct + (campaignMult(w, c) > 1 ? 0.006 : 0)) * TIER_SPEED[GOODS[c.good].tier] * sales;
}

/** Factories buying raw materials switch supplier on price faster than shoppers switch brands */
const TIER_SPEED = { raw: 1.7, material: 1.35, product: 1 } as const;

/** Days until a company reaches `goal` customers at today's marketing (Infinity if it never will). */
export function daysToReach(w: WorldState, c: Company, goal: number, marketingPct = c.marketingPct): number {
  const r = reachOf(c);
  if (r >= goal) return 0;
  const test = { ...c, marketingPct };
  const target = reachTarget(test);
  if (target <= goal) return Infinity;
  const k = reachSpeed(w, test);
  return Math.ceil(Math.log((target - goal) / (target - r)) / Math.log(1 - k));
}

/** Average quality of a market's sellers, weighted by capacity */
export function marketQuality(w: WorldState, g: GoodId): number {
  let q = 0;
  let cap = 0;
  for (const c of w.companies) {
    if (c.good !== g || c.bankrupt) continue;
    q += c.quality * c.capacity;
    cap += c.capacity;
  }
  return cap > 0 ? q / cap : 1;
}

/** Daily: boosts expire, customers come and go, machines wear, staff learn and leave. */
export function dailyBusiness(w: WorldState): void {
  const avgQ = new Map<GoodId, number>();
  for (const g of GOOD_IDS) avgQ.set(g, marketQuality(w, g));
  for (const c of w.companies) {
    if (c.bankrupt) continue;
    if (c.boosts) {
      c.boosts = c.boosts.filter((b) => b.until > w.day);
      if (!c.boosts.length) delete c.boosts;
    }
    // Customers: tracked for your companies and for any newcomer still winning buyers
    if (c.isPlayer || c.reach !== undefined) {
      const sat = c.satisfaction ?? 0.75;
      c.satisfaction = sat + (satisfactionTarget(c, avgQ.get(c.good) ?? 1) - sat) * 0.05;
      const r = reachOf(c);
      const target = reachTarget(c);
      c.reach = r + (target - r) * (target > r ? reachSpeed(w, c) : 0.006);
      // A rival's newcomer that has won its market is just another established firm
      if (!c.isPlayer && c.reach > 0.97) delete c.reach;
    }
    if (!c.isPlayer) continue;
    // Machines wear with use; maintenance restores them
    const use = clamp(c.last.produced / Math.max(1, c.capacity), 0, 1.2);
    const cond = c.condition ?? 1;
    const careful = 1 - 0.3 * Math.min(1.4, c.execOps ?? 0); // an operations chief cuts wear
    c.condition = clamp(cond - WEAR_PER_DAY * use * careful + MAINT[c.maintenance ?? 'normal'].fix, 0, 1);
    // New hires learn on the job; unhappy staff leave (and the replacements start green)
    const skill = c.skill ?? 1;
    if (skill < 1) c.skill = skill + (1 - skill) * 0.02;
    const quit = 0.0003 + Math.max(0, 0.6 - c.morale) * 0.008;
    c.workers = Math.max(0, c.workers * (1 - quit));
  }
}

/** New hires start slower than trained workers and dilute the team's experience. */
export function hireStaff(c: Company, hires: number): void {
  if (hires <= 0) return;
  if (c.isPlayer) c.skill = ((c.skill ?? 1) * c.workers + NEW_HIRE_SKILL * hires) / Math.max(1, c.workers + hires);
  c.workers += hires;
}

/** How many customers a company has, in words */
export function reachLabel(c: Company): string {
  const r = reachOf(c);
  return r < 0.35 ? 'Few customers yet' : r < 0.7 ? 'Growing' : r < 0.95 ? 'Well known' : 'Established';
}

