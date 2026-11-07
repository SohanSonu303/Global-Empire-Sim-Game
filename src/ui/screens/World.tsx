import { useState } from 'react';
import { useGame } from '../../store/game';
import { COUNTRIES } from '../../engine/data';
import { fmtMoney, fmtPct } from '../../engine/news';
import { WorldMap } from '../art/art';
import { Badge, Button, Card, Chips, Progress, Screen } from '../components/core';
import { Num } from '../components/game';
import { IconLock } from '../components/Icons';

export function WorldScreen() {
  const w = useGame((s) => s.world)!;
  const setTab = useGame((s) => s.setTab);
  const push = useGame((s) => s.push);
  const [sel, setSel] = useState('astoria');
  const [layer, setLayer] = useState<'economy' | 'resources' | 'trade' | 'diplomacy'>('economy');
  const country = COUNTRIES.find((c) => c.id === sel)!;
  const m = w.macro;
  const econScore = Math.max(0, Math.min(1, 0.5 + m.growth * 6 - Math.max(0, m.inflation - 0.02) * 4 - (m.unemployment - 0.05) * 4));
  const stability = Math.max(0, Math.min(1, m.confidence * 0.8 + 0.2));
  return (
    <div>
      <div className="px-gutter pt-3">
        <Chips
          value={layer}
          onChange={setLayer}
          items={[
            { id: 'economy', label: 'Economy' },
            { id: 'resources', label: 'Resources' },
            { id: 'trade', label: 'Trade · P2', disabled: true },
            { id: 'diplomacy', label: 'Diplomacy · P3', disabled: true },
          ]}
        />
      </div>
      <div className="mt-2 border-y border-line">
        <WorldMap selected={sel} onSelect={setSel} />
      </div>
      <Screen>
        <Card className="mt-3 p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="font-bold text-lg">{country.name}</div>
              <div className="text-sm text-muted">{country.identity} · {country.advantage}</div>
            </div>
            {!country.unlocked && <Badge tone="neutral"><IconLock size={12} /> Phase 2</Badge>}
            {country.unlocked && <Badge tone="gold">Home</Badge>}
          </div>
          {country.unlocked ? (
            layer === 'economy' ? (
              <>
                <Bar label="Economy" v={econScore} tone="green" />
                <Bar label="Stability" v={stability} tone="gold" />
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Stat label="GDP (annual)" value={<Num explain={m.gdpExplain}>{fmtMoney(m.gdp)}</Num>} />
                  <Stat label="Real growth" value={fmtPct(m.growth)} tone={m.growth >= 0 ? 'good' : 'bad'} />
                  <Stat label="Inflation" value={fmtPct(m.inflation)} tone={m.inflation > 0.04 ? 'bad' : undefined} />
                  <Stat label="Unemployment" value={fmtPct(m.unemployment)} tone={m.unemployment > 0.07 ? 'bad' : undefined} />
                  <Stat label="Central bank rate" value={<Num explain={m.rateExplain}>{fmtPct(m.rate, 2)}</Num>} />
                  <Stat label="Consumer confidence" value={`${Math.round(m.confidence * 100)}`} />
                  <Stat label="Gov. debt / GDP" value={fmtPct(m.govDebt / m.gdp, 0)} />
                  <Stat label="Corporate tax" value={fmtPct(m.taxRate, 0)} />
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Stat label="Oil price index" value={m.oilPrice.toFixed(2)} tone={m.oilPrice > 1.2 ? 'bad' : undefined} />
                <Stat label="Oil supply" value={fmtPct(m.oilSupply, 0)} tone={m.oilSupply < 0.95 ? 'bad' : undefined} />
                <Stat label="Price level" value={m.priceLevel.toFixed(3)} />
                <Stat label="Real consumption" value={m.realConsumption.toFixed(3)} />
              </div>
            )
          ) : (
            <p className="text-sm text-muted mt-3">Foreign markets, trade and currencies open in Phase 2. For now your empire grows inside Astoria.</p>
          )}
          {country.unlocked && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="dark" onClick={() => push({ screen: 'stats' })}>Statistics</Button>
              <Button onClick={() => setTab('business')}>Found business</Button>
            </div>
          )}
        </Card>
      </Screen>
    </div>
  );
}

function Bar({ label, v, tone }: { label: string; v: number; tone: 'green' | 'gold' | 'red' }) {
  return (
    <div className="flex items-center gap-3 mt-3">
      <span className="w-20 text-sm text-muted">{label}</span>
      <Progress value={v} tone={tone} />
      <span className="num w-10 text-right text-sm font-semibold">{Math.round(v * 100)}%</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={'num font-bold ' + (tone === 'good' ? 'text-green' : tone === 'bad' ? 'text-red' : '')}>{value}</div>
    </div>
  );
}
