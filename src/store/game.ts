import { create } from 'zustand';
import type { Command, CommandResult, Explanation, GoodId, IndustryId, ScenarioId, WorldState } from '../engine/types';
import type { FromWorker, Speed, ToWorker } from '../worker/protocol';
import type { GameSetup } from '../engine/startup';
import { listSaves, loadSettings, readSave, saveSettings, writeSave } from '../persistence/saves';

export type Tab = 'home' | 'business' | 'markets' | 'world' | 'more';
export type Route =
  | { screen: 'company'; id: string }
  | { screen: 'stock'; ticker: string }
  | { screen: 'rival'; id: string }
  | { screen: 'news' }
  | { screen: 'rivals' }
  | { screen: 'stats' }
  | { screen: 'saves' }
  | { screen: 'achievements' }
  | { screen: 'government' }
  | { screen: 'guide'; section?: GuideSection }
  | { screen: 'planner'; good?: GoodId; industry?: IndustryId }
  | { screen: 'chain'; good?: GoodId }
  | { screen: 'article'; id: string }
  | { screen: 'strategy'; tab?: StrategyTab }
  | { screen: 'reports' }
  | { screen: 'inbox' };

export type StrategyTab = 'contracts' | 'auctions' | 'tenders' | 'warehouses' | 'wars' | 'tips';

export type GuideSection = 'about' | 'play' | 'grow' | 'business' | 'markets' | 'deals' | 'strategies' | 'rivals';

interface GameStore {
  world: WorldState | null;
  speed: Speed;
  saveId: string | null;
  saveName: string;
  tab: Tab;
  stack: Route[];
  explain: Explanation | null;
  toast: { text: string; ok: boolean; at: number } | null;
  booting: boolean;
  eventOpen: boolean;

  boot: () => Promise<void>;
  newGame: (scenario: ScenarioId, name: string, setup?: GameSetup) => void;
  loadWorld: (world: WorldState, saveId: string, name: string) => void;
  setSpeed: (s: Speed) => void;
  dispatch: (cmd: Command) => Promise<CommandResult>;
  saveNow: () => Promise<void>;
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  back: () => void;
  showExplain: (e: Explanation | null) => void;
  notify: (text: string, ok?: boolean) => void;
}

/** Today's date on this device, YYYY-MM-DD. */
function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<number, (r: CommandResult) => void>();
let lastAutosaveDay = 0;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    if (m.type === 'state') {
      useGame.setState({ world: m.world });
      const { saveId } = useGame.getState();
      if (saveId && loadSettings().autosave && m.world.day - lastAutosaveDay >= 30) {
        lastAutosaveDay = m.world.day;
        void useGame.getState().saveNow();
      }
    } else if (m.type === 'result') {
      pending.get(m.id)?.(m.result);
      pending.delete(m.id);
    } else if (m.type === 'error') {
      useGame.getState().notify(`Simulation error: ${m.message}`, false);
      useGame.setState({ speed: 0 });
    }
  };
  return worker;
}

const send = (m: ToWorker) => getWorker().postMessage(m);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Debounced save after player decisions, so a reload never loses them. */
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void useGame.getState().saveNow(), 1200);
}

export const useGame = create<GameStore>((set, get) => ({
  world: null,
  speed: 0,
  saveId: null,
  saveName: '',
  tab: 'home',
  stack: [],
  explain: null,
  toast: null,
  booting: true,
  eventOpen: false,

  boot: async () => {
    const s = loadSettings();
    if (s.lastSaveId) {
      try {
        const res = await readSave(s.lastSaveId);
        if (res.ok) {
          const meta = (await listSaves()).find((x) => x.id === s.lastSaveId);
          get().loadWorld(res.world, s.lastSaveId, meta?.name ?? 'My Empire');
        } else {
          get().notify(res.error, false);
        }
      } catch {
        /* IndexedDB unavailable: fall through to title screen */
      }
    }
    set({ booting: false });
  },

  newGame: (scenario, name, setup) => {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const id = `save-${Date.now().toString(36)}`;
    lastAutosaveDay = 0;
    set({ saveId: id, saveName: name || 'My Empire', tab: 'home', stack: [], speed: 0 });
    saveSettings({ ...loadSettings(), lastSaveId: id });
    send({ type: 'new', seed, scenario, setup });
    send({ type: 'speed', speed: 0 });
    void get().dispatch({ type: 'checkIn', date: localDate() });
    // First save happens on the first state message via autosave threshold; save explicitly too
    setTimeout(() => void get().saveNow(), 300);
  },

  loadWorld: (world, saveId, name) => {
    lastAutosaveDay = world.day;
    set({ world, saveId, saveName: name, tab: 'home', stack: [], speed: 0 });
    saveSettings({ ...loadSettings(), lastSaveId: saveId });
    send({ type: 'load', world });
    send({ type: 'speed', speed: 0 });
    // Opening a save on a new real day counts toward the daily streak
    void get().dispatch({ type: 'checkIn', date: localDate() });
  },

  setSpeed: (speed) => {
    set({ speed });
    send({ type: 'speed', speed });
    // Pausing is a natural checkpoint: save once the last snapshot has arrived.
    if (speed === 0) scheduleSave();
  },

  dispatch: (cmd) =>
    new Promise((resolve) => {
      const id = ++reqId;
      pending.set(id, (r) => {
        if (r.message) get().notify(r.message, r.ok);
        if (r.ok) scheduleSave();
        resolve(r);
      });
      send({ type: 'command', id, cmd });
    }),

  saveNow: async () => {
    const { world, saveId, saveName } = get();
    if (!world || !saveId) return;
    try {
      await writeSave(saveId, saveName, world);
    } catch {
      get().notify('Could not save (storage unavailable)', false);
    }
  },

  setTab: (tab) => set({ tab, stack: [] }),
  push: (r) => set((s) => ({ stack: [...s.stack, r] })),
  back: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  showExplain: (explain) => set({ explain }),
  notify: (text, ok = true) => set({ toast: { text, ok, at: Date.now() } }),
}));

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void useGame.getState().saveNow();
  });
  window.addEventListener('pagehide', () => void useGame.getState().saveNow());
}
