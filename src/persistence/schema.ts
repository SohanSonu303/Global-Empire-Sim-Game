import { z } from 'zod';
import { SAVE_VERSION } from '../engine/data';
import type { WorldState } from '../engine/types';
import { addMissingGoods } from '../engine/world';
import { ensureBanks } from '../engine/banks';
import { ensureLicences } from '../engine/licences';
import { ensurePlay } from '../engine/rewards';
import { emptyDay } from '../engine/company';

const num = z.number().finite();
const industry = z.enum(['resources', 'energy', 'manufacturing', 'tech', 'retail', 'finance', 'health', 'services']);
const good = z.string();
const holding = z.object({ shares: num, avgCost: num });

const company = z
  .object({
    id: z.string(), name: z.string(), industry, good, ownerId: z.string(), isPlayer: z.boolean(), ticker: z.string().nullable(),
    level: num, capacity: num, workers: num, cash: num, debt: num, priceMult: num, morale: num,
    automation: z.object({ inventoryDays: num, autoRecruit: z.boolean(), autoUpgrade: z.boolean(), dividendPct: num, minCash: num, supplyDays: num }).passthrough(),
    inputs: z.record(z.string(), z.object({ qty: num, cost: num })), sisterDiscount: num, invCost: num,
  })
  .passthrough();

const stock = z.object({ ticker: z.string(), companyId: z.string(), shares: num, price: num, adv: num }).passthrough();

/**
 * Validates the parts of a save the game relies on. Nested history arrays pass through
 * unchecked to keep validation fast; bump SAVE_VERSION and add a migration when the shape changes.
 */
export const worldSchema = z
  .object({
    version: z.literal(SAVE_VERSION),
    seed: num,
    rng: z.object({ s: num }),
    day: num,
    scenario: z.enum(['young', 'established']),
    player: z.object({ cash: num, xp: num, level: num, holdings: z.record(z.string(), holding) }).passthrough(),
    companies: z.array(company),
    stocks: z.array(stock),
    macro: z.object({ gdp: num, inflation: num, unemployment: num, rate: num, priceLevel: num }).passthrough(),
    rivals: z.array(z.object({ id: z.string(), cash: num, holdings: z.record(z.string(), holding) }).passthrough()),
    goods: z.record(z.string(), z.object({ idx: num, tightness: num }).passthrough()),
    contracts: z.array(z.object({ id: z.string(), good: z.string(), sellerId: z.string(), buyerId: z.string(), qtyPerDay: num, price: num, endDay: num }).passthrough()),
    news: z.array(z.any()),
    goals: z.array(z.any()),
  })
  .passthrough();

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
/** version -> function upgrading a save from that version to version+1 */
const MIGRATIONS: Record<number, Migration> = {
  // v3 added new goods; their markets and producers are filled in by addMissingGoods after loading
  2: (d) => d,
};

export function parseWorld(raw: unknown): { ok: true; world: WorldState } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a save file' };
  let data = raw as Record<string, unknown>;
  let v = typeof data.version === 'number' ? data.version : 0;
  if (v < 2) return { ok: false, error: 'This save is from before supply chains were added. Please start a new game.' };
  while (v < SAVE_VERSION && MIGRATIONS[v]) {
    data = MIGRATIONS[v](data);
    v += 1;
    data.version = v;
  }
  const res = worldSchema.safeParse(data);
  if (!res.success) {
    const issue = res.error.issues[0];
    return { ok: false, error: `Save is incompatible (${issue.path.join('.') || 'root'}: ${issue.message})` };
  }
  const world = res.data as unknown as WorldState;
  // Fields added to the daily P&L since the save was made start at zero
  for (const c of world.companies) {
    c.last = { ...emptyDay(), ...c.last };
    c.sum30 = { ...emptyDay(), ...c.sum30 };
  }
  addMissingGoods(world);
  ensureBanks(world);
  ensureLicences(world);
  ensurePlay(world);
  return { ok: true, world };
}
