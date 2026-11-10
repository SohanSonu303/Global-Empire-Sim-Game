import { useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { canUpgrade, nextUpgradeCost } from '../../engine/company';
import { forecastAll, forecastCompany, type WhatIf } from '../../engine/budget';
import { fmtMoney, fmtPct } from '../../engine/news';
import { Button, Card, Chips, Screen, SectionTitle, cx } from '../components/core';
import { LineChart } from '../components/game';
import { SubHeader } from './More';

const money = (v: number) => <span className={cx('num font-semibold', v < 0 && 'text-red')}>{fmtMoney(v)}</span>;

/** A 12-month plan, "what if" levers, and how you are doing against your saved plan. */
export function BudgetScreen() {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  const [coId, setCoId] = useState(mine[0]?.id ?? '');
  const c = mine.find((x) => x.id === coId) ?? mine[0];
  const [wi, setWi] = useState<WhatIf>({});
  const all = useMemo(() => forecastAll(w), [w]);
  const now = useMemo(() => (c ? forecastCompany(w, c) : null), [w, c]);
  const changed = useMemo(() => (c ? forecastCompany(w, c, wi) : null), [w, c, wi]);
  const b = w.play.budget;
  const set = (k: keyof WhatIf, v: number | boolean | undefined) => setWi({ ...wi, [k]: v });
  const mktNow = c ? c.marketingPct : 0;

  return (
    <div>
      <SubHeader title="Budget & forecast" sub="The next 12 months, if things go on as now" />
      <Screen>
        {!mine.length && <Card className="mt-3 p-4 text-sm text-muted">Found a company to see its forecast.</Card>}
        {mine.length > 0 && (
          <>
            <Card className="mt-3 p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-gold">All your companies</div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div><div className="text-xs text-muted">Revenue</div>{money(all.revenue)}</div>
                <div><div className="text-xs text-muted">Profit</div>{money(all.profit)}</div>
                <div><div className="text-xs text-muted">Cash in 12 mo.</div>{money(all.endCash)}</div>
              </div>
              <div className="text-xs text-muted mt-3">Company cash, month by month</div>
              <LineChart data={all.months.map((m) => m.cash)} height={110} tone="gold" />
              <p className="text-[11px] text-dim mt-1">From the last 30 days of sales and costs, growing with the economy, after tax and dividends. Booms, recessions and rivals will move it.</p>
            </Card>

            <SectionTitle>What if…</SectionTitle>
            {mine.length > 1 && <Chips items={mine.map((m) => ({ id: m.id, label: m.name }))} value={c.id} onChange={(v) => { setCoId(v); setWi({}); }} />}
            <Card className="mt-2 p-3">
              <Lever label="Price" value={fmtPct(wi.price ?? 0, 0)} min={-20} max={20} v={(wi.price ?? 0) * 100} on={(x) => set('price', x / 100)} />
              <Lever label="Wages" value={fmtPct(wi.wages ?? 0, 0)} min={-10} max={30} v={(wi.wages ?? 0) * 100} on={(x) => set('wages', x / 100)} />
              <Lever label="Marketing (of revenue)" value={fmtPct(wi.marketing ?? mktNow, 0)} min={0} max={15} v={(wi.marketing ?? mktNow) * 100} on={(x) => set('marketing', x / 100)} />
              {canUpgrade(c) && (
                <label className="flex items-center justify-between gap-2 py-2 text-sm cursor-pointer">
                  <span>Upgrade the plant now <span className="text-xs text-muted">· {fmtMoney(nextUpgradeCost(c))}, +70% capacity</span></span>
                  <input type="checkbox" className="size-5 accent-[var(--color-gold)]" checked={!!wi.upgrade} onChange={(e) => set('upgrade', e.target.checked)} />
                </label>
              )}
              {now && changed && (
                <div className="mt-2 rounded-lg border border-line overflow-hidden text-sm">
                  <div className="grid grid-cols-3 bg-card-2 px-2.5 py-1.5 text-xs text-muted"><span /><span>As now</span><span>With changes</span></div>
                  <Cmp label="Sold a month" a={Math.round(now.unitsNow).toLocaleString()} b={Math.round(changed.unitsAfter).toLocaleString()} />
                  <Cmp label="Profit, 12 mo." a={money(now.profit)} b={money(changed.profit)} />
                  <Cmp label="Cash in 12 mo." a={money(now.endCash)} b={money(changed.endCash)} />
                </div>
              )}
              {now && changed && changed.upfront > 0 && (
                <p className="text-xs text-muted mt-2">
                  {changed.profit > now.profit ? `The upgrade adds about ${fmtMoney((changed.profit - now.profit) / 12)} profit a month, so it pays back in about ${Math.max(1, Math.round(changed.upfront / Math.max(1, (changed.profit - now.profit) / 12)))} months.` : 'At today\'s demand the upgrade would not pay for itself within a year.'}
                </p>
              )}
              {now && changed && (
                <div className="mt-3">
                  <div className="text-xs text-muted">Month by month (with changes)</div>
                  <div className="grid grid-cols-4 text-[11px] text-dim mt-1 px-1"><span>Mo.</span><span>Revenue</span><span>Profit</span><span>Cash</span></div>
                  {changed.months.map((m) => (
                    <div key={m.month} className="grid grid-cols-4 text-xs px-1 py-0.5 border-t border-line">
                      <span className="text-muted">{m.month}</span><span className="num">{fmtMoney(m.revenue)}</span>{money(m.profit)}{money(m.cash)}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-dim mt-2">A higher price loses buyers (about 1.8% of sales for each 1%), a lower one wins them up to what the plant can make. These are estimates: nothing changes until you set it on the company page.</p>
            </Card>

            <SectionTitle>Your plan</SectionTitle>
            <Card className="p-3">
              {!b ? (
                <>
                  <p className="text-sm text-muted">Save today's forecast as your profit target. At the end of each month you see what you really made against it.</p>
                  <Button block className="mt-2" onClick={() => dispatch({ type: 'saveBudget' })}>Save as my plan</Button>
                </>
              ) : (
                <>
                  <div className="text-xs text-muted">Plan made on day {b.start}. Month {Math.min(12, b.actual.length + 1)} of 12.</div>
                  <div className="space-y-1.5 mt-2">
                    {b.plan.map((p, i) => {
                      const a = b.actual[i];
                      const done = a != null;
                      const pct = done && p !== 0 ? a / p : 0;
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-8 text-muted">Mo {i + 1}</span>
                          <span className="flex-1 num">Plan {fmtMoney(p)}</span>
                          <span className={cx('num font-semibold w-28 text-right', !done ? 'text-dim' : a >= p ? 'text-green' : 'text-amber')}>
                            {done ? `${fmtMoney(a)} ${p > 0 ? `(${Math.round(pct * 100)}%)` : ''}` : i === b.actual.length ? `${fmtMoney(b.acc)} so far` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <Button variant="dark" onClick={() => dispatch({ type: 'saveBudget' })}>New plan</Button>
                    <Button variant="ghost" onClick={() => dispatch({ type: 'clearBudget' })}>Clear</Button>
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </Screen>
    </div>
  );
}

function Lever({ label, value, min, max, v, on }: { label: string; value: string; min: number; max: number; v: number; on: (x: number) => void }) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-sm"><span className="text-muted">{label}</span><b className="num">{value}</b></div>
      <input type="range" min={min} max={max} step={1} value={Math.round(v)} onChange={(e) => on(Number(e.target.value))} className="w-full accent-[var(--color-gold)]" aria-label={label} />
    </div>
  );
}

function Cmp({ label, a, b }: { label: string; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 px-2.5 py-1.5 border-t border-line text-xs"><span className="text-muted">{label}</span><span>{a}</span><span>{b}</span></div>
  );
}
