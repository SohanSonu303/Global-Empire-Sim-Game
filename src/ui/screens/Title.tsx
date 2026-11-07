import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/game';
import type { ScenarioId } from '../../engine/types';
import { importSave, listSaves, readSave, type SaveMeta } from '../../persistence/saves';
import { fmtMoney } from '../../engine/news';
import { CityScene } from '../art/art';
import { Button, Card, cx } from '../components/core';

const SCENARIOS: { id: ScenarioId; title: string; sub: string }[] = [
  { id: 'young', title: 'Young Entrepreneur', sub: '$400,000 cash, no business. Build from nothing.' },
  { id: 'established', title: 'Established Businessman', sub: '$10 million and a level 4 manufacturing company.' },
];

export function TitleScreen() {
  const newGame = useGame((s) => s.newGame);
  const loadWorld = useGame((s) => s.loadWorld);
  const notify = useGame((s) => s.notify);
  const [scenario, setScenario] = useState<ScenarioId>('young');
  const [name, setName] = useState('My Empire');
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    listSaves().then(setSaves).catch(() => setSaves([]));
  }, []);

  return (
    <div className="min-h-full flex flex-col">
      <div className="relative">
        <CityScene companies={[]} onOpen={() => {}} onEmpty={() => {}} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg" />
        <div className="absolute inset-x-0 bottom-2 text-center">
          <h1 className="text-3xl font-black tracking-wide text-gold drop-shadow">GLOBAL EMPIRE</h1>
          <p className="text-sm text-muted">Business · Finance · Power</p>
        </div>
      </div>
      <div className="px-gutter pb-8 flex-1">
        <div className="text-sm font-bold uppercase tracking-wider text-muted mt-4 mb-2">New game</div>
        <div className="space-y-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setScenario(s.id)}
              className={cx('w-full text-left rounded-card border p-3', scenario === s.id ? 'border-gold bg-gold/10' : 'border-line bg-card')}
            >
              <div className="font-bold">{s.title}</div>
              <div className="text-sm text-muted">{s.sub}</div>
            </button>
          ))}
        </div>
        <label htmlFor="save-name" className="block text-sm text-muted mt-4 mb-1">Empire name</label>
        <input
          id="save-name"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          className="w-full min-h-tap rounded-lg bg-bg border border-line-strong px-3 text-base outline-none focus:border-gold"
        />
        <Button block size="lg" className="mt-4" onClick={() => newGame(scenario, name.trim() || 'My Empire')}>Start in Astoria</Button>

        {saves.length > 0 && (
          <>
            <div className="text-sm font-bold uppercase tracking-wider text-muted mt-6 mb-2">Continue</div>
            <div className="space-y-2">
              {saves.slice(0, 4).map((s) => (
                <Card key={s.id} className="p-3" onClick={async () => {
                  const r = await readSave(s.id);
                  if (r.ok) loadWorld(r.world, s.id, s.name); else notify(r.error, false);
                }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted num">Day {s.day} · {new Date(s.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <div className="num font-bold text-gold">{fmtMoney(s.netWorth)}</div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
        <Button variant="ghost" block className="mt-4" onClick={() => fileRef.current?.click()}>Import save file</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const r = await importSave(f);
            if (!r.ok) return notify(r.error, false);
            loadWorld(r.world, `save-${Date.now().toString(36)}`, r.name);
            setTimeout(() => void useGame.getState().saveNow(), 200);
          }}
        />
        <p className="text-xs text-dim mt-6 text-center">Runs entirely in your browser. Saves stay on this device.</p>
      </div>
    </div>
  );
}
