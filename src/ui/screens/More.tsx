import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame, type Route } from '../../store/game';
import { GOODS, INDUSTRIES } from '../../engine/data';
import { companyValue } from '../../engine/company';
import { rivalWorth } from '../../engine/rewards';
import { netWorth } from '../../engine/progress';
import { portfolioValue } from '../../engine/market';
import { fmtMoney, fmtPct } from '../../engine/news';
import type { Personality, TraitId } from '../../engine/types';
import { SWAP_FEE, SWAP_LEVEL, TRAITS as CAREER_TRAITS, traitDef, traitsOf } from '../../engine/traits';
import { deleteSave, exportSave, importSave, listSaves, readSave, type SaveMeta } from '../../persistence/saves';
import { Portrait } from '../art/art';
import { Badge, Button, Card, Progress, Screen, SectionTitle, cx } from '../components/core';
import { LineChart, Num } from '../components/game';
import {
  IconBack, IconBank, IconChevron, IconInfo, IconLock, IconNews, IconPerson, IconSave, IconStats, IconTarget, IconTrophy,
} from '../components/Icons';
import { loadSettings, saveSettings } from '../../persistence/saves';
import { play } from '../sound';
import { appVersion, checkForUpdate } from '../../state/pwaUpdate';
import { ReportBody } from './Rewards';

export function MoreScreen() {
  const push = useGame((s) => s.push);
  const items: { r: Route | null; label: string; sub: string; icon: ReactNode }[] = [
    { r: { screen: 'guide' }, label: 'How to Play', sub: 'The goal, growing, stocks and beating rivals', icon: <IconInfo /> },
    { r: { screen: 'news' }, label: 'Newspaper', sub: 'Everything that happened in Astoria', icon: <IconNews /> },
    { r: { screen: 'rivals' }, label: 'People & Rivals', sub: 'Billionaires and their moves', icon: <IconPerson /> },
    { r: { screen: 'stats' }, label: 'Statistics', sub: 'GDP, inflation, rates, your net worth', icon: <IconStats /> },
    { r: { screen: 'government' }, label: 'Government', sub: 'Central bank now; politics in Phase 2', icon: <IconBank /> },
    { r: { screen: 'strategy' }, label: 'Deals & Strategies', sub: 'Contracts, auctions, tenders, warehouses, price wars, tips', icon: <IconTarget /> },
    { r: { screen: 'execs' }, label: 'Executives', sub: 'Hire a CFO, a head of sales and an operations chief', icon: <IconPerson /> },
    { r: { screen: 'budget' }, label: 'Budget & forecast', sub: 'Your next 12 months, what-ifs and your plan', icon: <IconStats /> },
    { r: { screen: 'reports' }, label: 'Monthly reports', sub: 'Your report cards and grades', icon: <IconStats /> },
    { r: { screen: 'achievements' }, label: 'Achievements', sub: 'Your milestones', icon: <IconTrophy /> },
    { r: { screen: 'saves' }, label: 'Saves', sub: 'Save, load, export and import', icon: <IconSave /> },
    { r: null, label: 'Banking · Research', sub: 'Phase 3', icon: <IconLock /> },
  ];
  return (
    <Screen>
      <h1 className="text-2xl font-bold pt-4 pb-3">More</h1>
      <Card>
        <div className="divide-y divide-line">
          {items.map((it) => (
            <button key={it.label} disabled={!it.r} onClick={() => it.r && push(it.r)} className="flex w-full items-center gap-3 px-3 min-h-[60px] text-left disabled:opacity-50">
              <span className="grid place-items-center size-10 rounded-lg bg-card-2 text-gold">{it.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{it.label}</span>
                <span className="block text-xs text-muted">{it.sub}</span>
              </span>
              <IconChevron size={18} className="text-dim" />
            </button>
          ))}
        </div>
      </Card>
      <TraitsCard />
      <SoundToggle />
      <TenderPauseToggle />
      <UpdateCheck />
    </Screen>
  );
}

function TraitsCard() {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const [from, setFrom] = useState<TraitId | null>(null);
  const mine = traitsOf(w);
  const canSwap = w.player.level >= SWAP_LEVEL && !w.player.traitSwapped;
  return (
    <Card className="mt-3 p-3">
      <SectionTitle>Your career traits</SectionTitle>
      {mine.length === 0 && <p className="text-sm text-muted">This game started before traits existed. New games let you pick two.</p>}
      <div className="space-y-2">
        {mine.map((id) => {
          const t = traitDef(id);
          return (
            <div key={id} className={cx('rounded-lg border p-2.5', from === id ? 'border-gold bg-gold/10' : 'border-line bg-card-2')}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{t.icon}</span>
                <div className="flex-1 min-w-0"><div className="font-bold">{t.name}</div><div className="text-xs text-muted">{t.perks[0]}</div></div>
                {canSwap && <Button size="sm" variant="dark" onClick={() => setFrom(from === id ? null : id)}>{from === id ? 'Cancel' : 'Swap'}</Button>}
              </div>
            </div>
          );
        })}
      </div>
      {from && (
        <div className="mt-2 space-y-1.5">
          <div className="text-xs text-muted">Swap {traitDef(from).name} for (one time, {fmtMoney(SWAP_FEE)}):</div>
          {CAREER_TRAITS.filter((t) => !mine.includes(t.id)).map((t) => (
            <button key={t.id} disabled={w.player.cash < SWAP_FEE} onClick={() => { void dispatch({ type: 'swapTrait', from, to: t.id }); setFrom(null); }}
              className="w-full text-left rounded-lg border border-line bg-card-2 hover:border-gold px-2.5 py-2 disabled:opacity-45">
              <span className="font-semibold">{t.icon} {t.name}</span> <span className="text-xs text-muted">· {t.short}</span>
            </button>
          ))}
        </div>
      )}
      {mine.length > 0 && !canSwap && (
        <p className="text-xs text-dim mt-2">{w.player.traitSwapped ? 'You already used your career change.' : `From level ${SWAP_LEVEL} you can swap one trait once, for ${fmtMoney(SWAP_FEE)}.`}</p>
      )}
      {w.player.startup && <p className="text-xs text-dim mt-2">Founder of {w.player.startup.name} ({w.player.startup.idea}), sold to {w.player.startup.investor} for {fmtMoney(w.player.startup.payout)}.</p>}
    </Card>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(() => loadSettings().sound !== false);
  return (
    <Card className="mt-3">
      <button
        className="flex w-full items-center gap-3 px-3 min-h-[60px] text-left"
        role="switch"
        aria-checked={on}
        onClick={() => {
          const v = !on;
          setOn(v);
          saveSettings({ ...loadSettings(), sound: v });
          if (v) play('coin');
        }}
      >
        <span className="grid place-items-center size-10 rounded-lg bg-card-2 text-xl">{on ? '🔊' : '🔇'}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold">Sound effects</span>
          <span className="block text-xs text-muted">Coins for big sales, fanfares for records and level-ups</span>
        </span>
        <span className={cx('w-11 h-6 rounded-full p-0.5 transition-colors', on ? 'bg-green' : 'bg-line-strong')}>
          <span className={cx('block size-5 rounded-full bg-white transition-transform', on && 'translate-x-5')} />
        </span>
      </button>
    </Card>
  );
}

export function ReportsScreen() {
  const reports = useGame((s) => s.world?.play.reports ?? []);
  const [open, setOpen] = useState<string | null>(reports.at(-1)?.id ?? null);
  return (
    <div>
      <SubHeader title="Monthly reports" sub="A report card every 30 game days" />
      <Screen>
        {reports.length === 0 && <Card className="mt-3 p-4 text-sm text-muted">Your first report card arrives on day 30 once you own a company.</Card>}
        <div className="space-y-2 mt-3">
          {[...reports].reverse().map((r) => (
            <Card key={r.id} className="p-3" onClick={() => setOpen(open === r.id ? null : r.id)}>
              {open === r.id ? <ReportBody r={r} /> : (
                <div className="flex items-center gap-3">
                  <span className="size-10 rounded-lg grid place-items-center font-black bg-card-2 border border-line">{r.grade}</span>
                  <div className="flex-1">
                    <div className="font-semibold">Month {r.month}</div>
                    <div className="text-xs text-muted">Profit {fmtMoney(r.profit)} · rank #{r.rank}</div>
                  </div>
                  <IconChevron size={18} className="text-dim" />
                </div>
              )}
            </Card>
          ))}
        </div>
      </Screen>
    </div>
  );
}

export function SubHeader({ title, sub }: { title: string; sub?: string }) {
  const back = useGame((s) => s.back);
  return (
    <div className="flex items-center gap-2 px-2 h-14 border-b border-line bg-surface">
      <button aria-label="Back" onClick={back} className="size-tap grid place-items-center text-muted hover:text-text"><IconBack /></button>
      <div className="min-w-0">
        <div className="font-bold text-lg truncate">{title}</div>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
    </div>
  );
}

export function RivalsScreen() {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const rivals = w.rivals
    .map((r) => ({ r, nw: rivalWorth(w, r) }))
    .sort((a, b) => b.nw - a.nw);
  const me = netWorth(w);
  return (
    <div>
      <SubHeader title="People & Rivals" sub="Astoria's richest" />
      <Screen>
        <div className="space-y-2 mt-3">
          {rivals.map(({ r, nw }, i) => (
            <Card key={r.id} className="p-3" onClick={() => push({ screen: 'rival', id: r.id })}>
              <div className="flex items-center gap-3">
                <span className="num w-5 text-center text-dim font-bold">{i + 1}</span>
                <Portrait rival={r} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold flex items-center gap-1.5">{r.name}{r.tycoon && <Badge tone="gold">Tycoon</Badge>}</div>
                  <div className="text-xs text-muted">{r.title}</div>
                </div>
                <div className="text-right">
                  <div className="num font-bold">{fmtMoney(nw)}</div>
                  <RelationBadge v={r.relation} />
                </div>
              </div>
            </Card>
          ))}
          <Card className="p-3 border-gold/50">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gold">You</span>
              <span className="num font-bold">{fmtMoney(me)}</span>
            </div>
          </Card>
        </div>
      </Screen>
    </div>
  );
}

function RelationBadge({ v }: { v: number }) {
  const label = v > 40 ? 'Ally' : v > 10 ? 'Friendly' : v > -10 ? 'Neutral' : v > -40 ? 'Competitor' : 'Hostile';
  return <Badge tone={v > 10 ? 'good' : v < -10 ? 'bad' : 'neutral'}>{label}</Badge>;
}

const TRAITS: [keyof Personality, string, string][] = [
  ['risk', 'Risk', 'bg-red'], ['aggression', 'Aggression', 'bg-red'], ['patience', 'Patience', 'bg-blue'], ['ambition', 'Ambition', 'bg-gold'], ['financial', 'Financial skill', 'bg-green'],
];

export function RivalScreen({ id }: { id: string }) {
  const w = useGame((s) => s.world)!;
  const r = w.rivals.find((x) => x.id === id);
  if (!r) return null;
  const owned = w.companies.filter((c) => c.ownerId === r.id && !c.bankrupt);
  const listed = owned.filter((c) => c.ticker);
  const privateCos = owned.filter((c) => !c.ticker);
  const push = useGame((s) => s.push);
  const stakes = w.companies.filter((c) => c.isPlayer && (c.partners ?? []).some((p) => p.ownerId === r.id));
  const holdings = Object.entries(r.holdings).sort((a, b) => b[1].shares - a[1].shares);
  const relPct = (r.relation + 100) / 200;
  return (
    <div>
      <SubHeader title={r.name} sub={r.title} />
      <Screen>
        <div className="flex items-center gap-4 pt-4">
          <Portrait rival={r} size={88} />
          <blockquote className="flex-1 rounded-lg bg-card border border-line p-3 text-sm italic">“{r.quote}”</blockquote>
        </div>
        <Card className="mt-4 p-3 space-y-2.5">
          {TRAITS.map(([k, label, color]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-28 text-sm text-muted">{label}</span>
              <div className="flex-1 h-2.5 rounded-full bg-bg border border-line overflow-hidden"><div className={cx('h-full', color)} style={{ width: `${r.personality[k] * 100}%` }} /></div>
              <span className="num w-10 text-right text-sm">{Math.round(r.personality[k] * 100)}%</span>
            </div>
          ))}
          <div className="text-sm text-muted pt-1">Weakness: <span className="text-text">{r.weakness}</span> · Focus: <span className="text-text">{r.focus.map((f) => INDUSTRIES[f].name).join(', ')}</span></div>
        </Card>
        <Card className="mt-3 p-3">
          <div className="text-sm font-bold">Relationship</div>
          <div className="relative mt-3 h-2.5 rounded-full bg-gradient-to-r from-red via-amber to-green">
            <span className="absolute -top-1.5 size-5 rotate-45 bg-gold border-2 border-bg" style={{ left: `calc(${relPct * 100}% - 10px)` }} />
          </div>
          <div className="flex justify-between text-xs text-muted mt-1.5"><span>Rival</span><span>Ally</span></div>
          <div className="mt-3 space-y-1">
            {r.memory.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-sm"><span className="text-muted">Day {m.day}: {m.text}</span><span className={m.delta >= 0 ? 'text-green' : 'text-red'}>{m.delta > 0 ? '+' : ''}{m.delta}</span></div>
            ))}
            {r.memory.length === 0 && <p className="text-sm text-dim">No history with you yet. They remember deals, rejections and competition.</p>}
          </div>
        </Card>
        <SectionTitle>Empire</SectionTitle>
        <Card className="p-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Cash</span><span className="num font-semibold">{fmtMoney(r.cash)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Portfolio</span><span className="num font-semibold">{fmtMoney(portfolioValue(w, r.holdings))}</span></div>
          <div className="flex justify-between"><span className="text-muted">Private companies</span><span className="num font-semibold">{fmtMoney(privateCos.reduce((s, c) => s + Math.max(0, companyValue(c)), 0))}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted shrink-0">Controls (listed)</span><span className="font-semibold text-right">{listed.map((c) => c.name).join(', ') || '—'}</span></div>
          {holdings.slice(0, 6).map(([t, h]) => {
            const s = w.stocks.find((x) => x.ticker === t)!;
            return <div key={t} className="flex justify-between"><span className="text-muted">{t}</span><span className="num">{fmtPct(h.shares / s.shares)} · {fmtMoney(h.shares * s.price)}</span></div>;
          })}
        </Card>
        {privateCos.length > 0 && (
          <>
            <SectionTitle>{r.tycoon ? 'Companies founded or bought' : 'Private companies'}</SectionTitle>
            <div className="space-y-2">
              {privateCos.map((c) => (
                <Card key={c.id} className="p-3 flex items-center gap-3" onClick={() => push({ screen: 'company', id: c.id })}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-muted">{GOODS[c.good].name} · level {c.level} · since day {c.founded}</div>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">{fmtMoney(companyValue(c))}</div>
                    <div className={cx('text-xs num', c.sum30.netIncome < 0 ? 'text-red' : 'text-green')}>{fmtMoney(c.sum30.netIncome)} / 30d</div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
        {stakes.length > 0 && (
          <Card className="mt-3 p-3 text-sm">
            <div className="font-bold">Partner in your companies</div>
            {stakes.map((c) => <div key={c.id} className="flex justify-between mt-1"><span className="text-muted">{c.name}</span><span className="num">{fmtPct((c.partners ?? []).find((p) => p.ownerId === r.id)!.pct, 0)}</span></div>)}
          </Card>
        )}
        <Card className="mt-3 p-3 text-sm">
          <div className="font-bold">How {r.name.split(' ')[0]} plays</div>
          <ul className="mt-1 space-y-1 text-muted list-disc pl-4">
            {r.tycoon && <li>Starts companies in short, growing markets in {r.focus.map((f) => INDUSTRIES[f].name.toLowerCase()).join(', ')}, or ones that feed what they already own.</li>}
            {r.tycoon && <li>May offer to buy a stake in your fast-growing private companies, above the fair price.</li>}
            <li>Bids at bankruptcy auctions when a company fits {r.tycoon ? 'their plans' : 'their industries'} ({r.personality.aggression > 0.7 ? 'bids hard' : r.personality.patience > 0.85 ? 'never overpays' : 'bids carefully'}).</li>
            <li>Trades shares on the exchange and may bid for your companies.</li>
          </ul>
        </Card>
      </Screen>
    </div>
  );
}

export function StatsScreen() {
  const w = useGame((s) => s.world)!;
  const m = w.macro;
  const h = m.hist;
  return (
    <div>
      <SubHeader title="Statistics" sub="Monthly macro data for Astoria" />
      <Screen>
        <StatChart title="GDP" value={<Num explain={m.gdpExplain}>{fmtMoney(m.gdp)}</Num>} data={h.map((x) => x.gdp)} tone="gold" />
        <StatChart title="Inflation" value={fmtPct(m.inflation)} data={h.map((x) => x.inflation)} />
        <StatChart title="Unemployment" value={fmtPct(m.unemployment)} data={h.map((x) => x.unemployment)} />
        <StatChart title="Policy rate" value={<Num explain={m.rateExplain}>{fmtPct(m.rate, 2)}</Num>} data={h.map((x) => x.rate)} tone="blue" />
        <StatChart title="Market index" value={w.marketIndex.toFixed(0)} data={w.marketIndexHist.map((x) => x.value)} />
        <StatChart title="Your net worth" value={fmtMoney(netWorth(w))} data={w.player.netWorthHist.map((x) => x.value)} tone="gold" />
      </Screen>
    </div>
  );
}

function StatChart({ title, value, data, tone = 'auto' }: { title: string; value: ReactNode; data: number[]; tone?: 'auto' | 'gold' | 'blue' }) {
  return (
    <Card className="mt-3 p-3">
      <div className="flex items-baseline justify-between mb-2"><span className="font-bold">{title}</span><span className="num font-bold">{value}</span></div>
      <LineChart data={data} height={90} tone={tone} />
    </Card>
  );
}

export function GovernmentScreen() {
  const m = useGame((s) => s.world!.macro);
  return (
    <div>
      <SubHeader title="Government" sub="Republic of Astoria" />
      <Screen>
        <Card className="mt-3 p-3">
          <div className="font-bold">Central Bank of Astoria</div>
          <p className="text-sm text-muted mt-1">Independent. Sets the policy rate monthly with a rule based on inflation and growth.</p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-muted text-sm">Policy rate</span>
            <Num explain={m.rateExplain} className="text-xl font-bold">{fmtPct(m.rate, 2)}</Num>
          </div>
          <div className="flex items-center justify-between mt-1"><span className="text-muted text-sm">Inflation target</span><span className="num font-semibold">{fmtPct(m.inflationTarget)}</span></div>
        </Card>
        <Card className="mt-3 p-3">
          <div className="font-bold">Public finances</div>
          <div className="space-y-1 mt-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Revenue (annual)</span><span className="num">{fmtMoney(m.govRevenue)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Spending (annual)</span><span className="num">{fmtMoney(m.govSpending)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Debt</span><span className="num">{fmtMoney(m.govDebt)} ({fmtPct(m.govDebt / m.gdp, 0)} of GDP)</span></div>
            <div className="flex justify-between"><span className="text-muted">Corporate tax</span><span className="num">{fmtPct(m.taxRate, 0)}</span></div>
          </div>
          <Progress className="mt-3" value={Math.min(1, m.govDebt / m.gdp / 1.5)} tone={m.govDebt / m.gdp > 0.9 ? 'red' : 'amber'} />
        </Card>
        <Card className="mt-3 p-3 opacity-70">
          <div className="flex items-center gap-2 font-bold"><IconLock size={16} /> Parliament, parties & elections</div>
          <p className="text-sm text-muted mt-1">Taxes, subsidies, regulation and three parties with elections arrive in Phase 2. Lobbying and running for office come in Phase 3.</p>
        </Card>
      </Screen>
    </div>
  );
}

export function AchievementsScreen() {
  const a = useGame((s) => s.world!.achievements);
  return (
    <div>
      <SubHeader title="Achievements" />
      <Screen>
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          {a.map((x) => (
            <Card key={x.id} className="p-3 text-center">
              <div className="mx-auto grid place-items-center size-14 rounded-full bg-gold text-gold-ink text-2xl border-4 border-gold-edge">★</div>
              <div className="font-bold mt-2">{x.title}</div>
              <div className="text-xs text-muted mt-0.5">{x.body}</div>
              <div className="text-xs text-dim mt-1">Day {x.day}</div>
            </Card>
          ))}
        </div>
        {a.length === 0 && <p className="text-sm text-muted mt-3">Found a company, make your first trade or reach $1M to earn your first seal.</p>}
      </Screen>
    </div>
  );
}

export function SavesScreen() {
  const { world, saveId, saveName, saveNow, loadWorld, notify } = useGame();
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => void listSaves().then(setSaves).catch(() => setSaves([]));
  useEffect(() => {
    refresh();
  }, []);
  return (
    <div>
      <SubHeader title="Saves" sub="Stored on this device (IndexedDB)" />
      <Screen>
        <Card className="mt-3 p-3">
          <div className="font-bold">{saveName}</div>
          <div className="text-xs text-muted">Day {world?.day} · autosaves every 30 days and when you leave</div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button onClick={() => saveNow().then(() => { notify('Saved'); refresh(); })}>Save now</Button>
            <Button variant="dark" onClick={() => world && exportSave(world, saveName)}>Export JSON</Button>
            <Button variant="dark" className="col-span-2" onClick={() => fileRef.current?.click()}>Import JSON save</Button>
          </div>
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
              setTimeout(() => void useGame.getState().saveNow().then(refresh), 200);
              notify(`Imported ${r.name}`);
            }}
          />
          <p className="text-xs text-dim mt-2">Browsers can clear site data and saves don't sync between devices. Export a JSON backup to keep your empire safe or continue elsewhere.</p>
        </Card>
        <SectionTitle>On this device</SectionTitle>
        <div className="space-y-2">
          {saves.map((s) => (
            <Card key={s.id} className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.name} {s.id === saveId && <Badge tone="gold">Current</Badge>}</div>
                  <div className="text-xs text-muted num">Day {s.day} · {fmtMoney(s.netWorth)} · {new Date(s.updatedAt).toLocaleString()}</div>
                </div>
                {s.id !== saveId && (
                  <>
                    <Button size="sm" variant="dark" onClick={async () => {
                      const r = await readSave(s.id);
                      if (r.ok) loadWorld(r.world, s.id, s.name); else notify(r.error, false);
                    }}>Load</Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${s.name}"?`)) void deleteSave(s.id).then(refresh); }}>Delete</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
        <SectionTitle>New game</SectionTitle>
        <Button variant="dark" block onClick={() => { if (confirm('Start a new game? Your current game stays in Saves.')) { useGame.getState().setSpeed(0); void saveNow(); useGame.setState({ world: null, saveId: null, stack: [] }); } }}>Back to title screen</Button>
      </Screen>
    </div>
  );
}

function UpdateCheck() {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <Card className="mt-3 p-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0">
          <span className="block font-semibold">Version</span>
          <span className="block text-xs text-muted">{appVersion}</span>
        </span>
        <Button
          variant="dark"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            const found = await checkForUpdate();
            setChecking(false);
            setNote(found ? 'A new version is here. It loads once the game is paused.' : "You're on the latest version.");
          }}
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
      </div>
      {note && <p className="text-xs text-dim mt-2">{note}</p>}
    </Card>
  );
}

function TenderPauseToggle() {
  const [on, setOn] = useState(() => loadSettings().pauseTenders !== false);
  return (
    <Card className="mt-3">
      <button
        className="flex w-full items-center gap-3 px-3 min-h-[60px] text-left"
        role="switch"
        aria-checked={on}
        onClick={() => { const v = !on; setOn(v); saveSettings({ ...loadSettings(), pauseTenders: v }); }}
      >
        <span className="grid place-items-center size-10 rounded-lg bg-card-2 text-xl">🏛️</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold">Pause for new tenders</span>
          <span className="block text-xs text-muted">Stops the clock when a tender opens for a product you make</span>
        </span>
        <span className={cx('w-11 h-6 rounded-full p-0.5 transition-colors', on ? 'bg-green' : 'bg-line-strong')}>
          <span className={cx('block size-5 rounded-full bg-white transition-transform', on && 'translate-x-5')} />
        </span>
      </button>
    </Card>
  );
}
