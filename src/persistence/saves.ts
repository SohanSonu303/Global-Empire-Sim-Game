import { openDB, type IDBPDatabase } from 'idb';
import type { WorldState } from '../engine/types';
import { netWorth } from '../engine/progress';
import { parseWorld } from './schema';

export interface SaveMeta {
  id: string;
  name: string;
  day: number;
  netWorth: number;
  updatedAt: number;
  version: number;
}
interface SaveRecord extends SaveMeta {
  world: WorldState;
}

const DB_NAME = 'global-empire';
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  dbp ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves', { keyPath: 'id' });
    },
  });
  return dbp;
}

/** Downsample before saving: old daily history is already trimmed by the engine; keep saves lean. */
export async function writeSave(id: string, name: string, world: WorldState): Promise<SaveMeta> {
  const rec: SaveRecord = { id, name, day: world.day, netWorth: netWorth(world), updatedAt: Date.now(), version: world.version, world };
  await (await db()).put('saves', rec);
  const { world: _w, ...meta } = rec;
  void _w;
  return meta;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = (await (await db()).getAll('saves')) as SaveRecord[];
  return all
    .map(({ world: _w, ...meta }) => (void _w, meta))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readSave(id: string): Promise<{ ok: true; world: WorldState } | { ok: false; error: string }> {
  const rec = (await (await db()).get('saves', id)) as SaveRecord | undefined;
  if (!rec) return { ok: false, error: 'Save not found' };
  return parseWorld(rec.world);
}

export async function deleteSave(id: string): Promise<void> {
  await (await db()).delete('saves', id);
}

export function exportSave(world: WorldState, name: string): void {
  const blob = new Blob([JSON.stringify({ app: 'global-empire', name, world })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_]+/gi, '_')}-day${world.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importSave(file: File): Promise<{ ok: true; world: WorldState; name: string } | { ok: false; error: string }> {
  try {
    const raw = JSON.parse(await file.text());
    const res = parseWorld(raw?.world ?? raw);
    if (!res.ok) return res;
    return { ok: true, world: res.world, name: typeof raw?.name === 'string' ? raw.name : file.name.replace(/\.json$/, '') };
  } catch {
    return { ok: false, error: 'Could not read that file' };
  }
}

// ---- localStorage: small settings only ----
export interface Settings {
  lastSaveId: string | null;
  autosave: boolean;
  /** Sound effects for sales, records and level-ups */
  sound?: boolean;
  /** Pause the game when a tender opens for a product you make */
  pauseTenders?: boolean;
}
const SETTINGS_KEY = 'ge.settings';

export function loadSettings(): Settings {
  try {
    return { lastSaveId: null, autosave: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { lastSaveId: null, autosave: true };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
