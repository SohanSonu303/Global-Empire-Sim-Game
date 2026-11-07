/**
 * Seeded PRNG (mulberry32). State is a single uint32 stored on the world,
 * so saving/loading the world fully restores the random stream.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 || 0x9e3779b9 };
}

/** Uniform float in [0, 1). Mutates state. */
export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(r: RngState, min: number, max: number): number {
  return min + (max - min) * next(r);
}

export function int(r: RngState, min: number, maxInclusive: number): number {
  return Math.floor(range(r, min, maxInclusive + 1));
}

/** Approximately standard normal (Box–Muller). */
export function normal(r: RngState): number {
  const u = Math.max(next(r), 1e-12);
  const v = next(r);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function chance(r: RngState, p: number): boolean {
  return next(r) < p;
}

export function pick<T>(r: RngState, arr: readonly T[]): T {
  return arr[Math.floor(next(r) * arr.length)];
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
