import type { Command, CommandResult, ScenarioId, WorldState } from '../engine/types';

export type Speed = 0 | 1 | 2 | 5;

/** Milliseconds per in-game day at each speed. */
export const SPEED_MS: Record<Exclude<Speed, 0>, number> = { 1: 1500, 2: 750, 5: 300 };

export type ToWorker =
  | { type: 'new'; seed: number; scenario: ScenarioId }
  | { type: 'load'; world: WorldState }
  | { type: 'speed'; speed: Speed }
  | { type: 'command'; id: number; cmd: Command }
  | { type: 'snapshot'; id: number };

export type FromWorker =
  | { type: 'state'; world: WorldState }
  | { type: 'result'; id: number; result: CommandResult }
  | { type: 'snapshot'; id: number; world: WorldState }
  | { type: 'error'; message: string };
