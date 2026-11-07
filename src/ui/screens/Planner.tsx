import { useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import { GOODS, INDUSTRIES, INDUSTRY_IDS, requiredCapital, startCost, usedBy } from '../../engine/data';
import { inputSources, launchPreview, opportunities, type Opportunity } from '../../engine/advisor';
import { hasLicence, licenceFee, licences } from '../../engine/licences';
import { fmtMoney, fmtPct, fmtPrice } from '../../engine/news';
import type { GoodId, IndustryId, WorldState } from '../../engine/types';
import { GoodThumb } from '../art/plants';
import { Badge, BottomSheet, Button, Card, Chips, Progress, Screen, cx } from '../components/core';
import { IconBack } from '../components/Icons';

type Filter = 'all' | IndustryId;

const TIER: Record<string, string> = { raw: 'Raw material', material: 'Material', product: 'Consumer product' };
const TAG: Record<Opportunity['tags'][number], { label: string; tone: 'good' | 'bad' | 'warn' | 'neutral' | 'gold' }> = {
  hot: { label: 'Hot', tone: 'warn' },
  shortage: { label: 'Shortage', tone: 'good' },
  crowded: { label: 'Crowded', tone: 'bad' },
  cheap: { label: 'Cheap to start', tone: 'neutral' },
  yours: { label: 'You make this', tone: 'gold' },
  locked: { label: 'Licence needed', tone: 'warn' },
};

export function PlannerScreen({ good, industry }: { good?: GoodId; industry?: IndustryId }) {
  const w = useGame((s) => s.world)!;
  const back = useGame((s) => s.back);
  const push = useGame((s) => s.push);
  const [filter, setFilter] = useState<Filter>(industry ?? (good ? GOODS[good].industry : 'all'));
  const [sel, setSel] = useState<GoodId | null>(good ?? null);
  // Recompute at most once per game day
  const opps = useMemo(() => opportunities(w), [w.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = opps.filter((o) => filter === 'all' || GOODS[o.good].industry === filter);

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center gap-2 px-2 h-14 border-b border-line bg-surface">
        <button aria-label="Back" onClick={back} className="size-tap grid place-items-center text-muted hover:text-text"><IconBack /></button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg truncate">Business Planner</div>
          <div className="text-xs text-muted">What Astoria needs, and what it costs to make</div>
        </div>
        <span className="num text-sm font-semibold text-gold">{fmtMoney(w.player.cash)}</span>
        <button onClick={() => push({ screen: 'chain' })} className="min-h-tap px-2 text-sm font-semibold text-gold border-l border-line ml-1">Map</button>
      </div>
      <Screen className="flex-1">
        <div className="pt-3">
          <Chips<Filter>
            value={filter}
            onChange={setFilter}
            items={[{ id: 'all', label: 'Best first' }, ...INDUSTRY_IDS.map((i) => ({ id: i, label: `${licenceFee(w, i) > 0 ? '🔒 ' : ''}${INDUSTRIES[i].name}` }))]}
          />
        </div>
        <LicenceCard w={w} filter={filter} />
        <p className="text-xs text-dim mt-2">Sorted by how promising a new company would be today. Tap one to see its costs and try a price.</p>
        <div className="mt-2 space-y-2 pb-4">
          {list.map((o) => <OppRow key={o.good} o={o} w={w} onOpen={() => setSel(o.good)} />)}
        </div>
      </Screen>
      {sel && <PlanSheet key={sel} good={sel} w={w} onClose={() => setSel(null)} />}
    </div>
  );
}

/** Which industries you may open companies in, and what the next licence costs. */
function LicenceCard({ w, filter }: { w: WorldState; filter: Filter }) {
  const dispatch = useGame((s) => s.dispatch);
  const held = licences(w);
  if (held.length === 0) {
    return (
      <Card className="p-3 mt-2 text-sm">
        <div className="font-bold">Pick your first industry carefully</div>
        <p className="text-xs text-muted mt-1">Your first company comes with a free licence for its industry. Opening companies in other industries later needs a government licence, which gets dearer with each one, so most empires start by mastering one industry and buying the rest from other companies.</p>
      </Card>
    );
  }
  const ind = filter !== 'all' && !hasLicence(w, filter) ? filter : null;
  const fee = ind ? licenceFee(w, ind) : 0;
  return (
    <Card className="p-3 mt-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold">Your licences</div>
          <div className="text-xs text-muted">{held.map((i) => INDUSTRIES[i].name).join(' · ')}</div>
        </div>
        {ind && (
          <Button size="sm" disabled={w.player.cash < fee} onClick={() => dispatch({ type: 'buyLicence', industry: ind })} className="whitespace-nowrap">
            Buy {INDUSTRIES[ind].name} · {fmtMoney(fee)}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted mt-1">
        {ind
          ? `To open ${INDUSTRIES[ind].name.toLowerCase()} companies you need this licence from the government. Until then, buy what you need from other companies with supply deals.`
          : 'Each new licence costs more than the last. Buying a company also brings its licence.'}
      </p>
    </Card>
  );
}

function OppRow({ o, w, onOpen }: { o: Opportunity; w: WorldState; onOpen: () => void }) {
  const def = GOODS[o.good];
  const afford = w.player.cash >= o.foundCost + o.licence;
  const cover = o.capacity > 0 ? Math.min(1.5, o.demand / o.capacity) : 1.5;
  return (
    <Card onClick={onOpen} className="p-2.5">
      <div className="flex items-start gap-3">
        <GoodThumb good={o.good} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">{def.name}</span>
            <span className="text-xs text-dim">{TIER[def.tier]}</span>
          </div>
          <div className="flex gap-1 flex-wrap mt-1">
            {o.tags.map((t) => <Badge key={t} tone={TAG[t].tone}>{TAG[t].label}</Badge>)}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
            <Stat label="Price" value={<>{fmtPrice(o.price)} <Trend v={o.trend} /></>} />
            <Stat label="Margin" value={<span className={o.margin > 0.1 ? 'text-green' : o.margin > 0 ? 'text-amber' : 'text-red'}>{fmtPct(o.margin, 0)}</span>} />
            <Stat label={o.licence > 0 ? 'Start + licence' : 'Start cost'} value={<span className={afford ? '' : 'text-red'}>{fmtMoney(o.foundCost)}{o.licence > 0 && <span className="text-amber"> +{fmtMoney(o.licence)}</span>}</span>} />
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-muted"><span>Demand vs supply</span><span className="num">{Math.round(cover * 100)}%</span></div>
            <Progress value={cover / 1.5} tone={cover > 1 ? 'green' : cover > 0.8 ? 'gold' : 'red'} height={6} className="mt-1" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-dim">{label}</div>
      <div className="num font-semibold truncate">{value}</div>
    </div>
  );
}

function Trend({ v }: { v: number }) {
  if (Math.abs(v) < 0.01) return <span className="text-dim">→</span>;
  return <span className={v > 0 ? 'text-green' : 'text-red'}>{v > 0 ? '▲' : '▼'}{Math.round(Math.abs(v) * 100)}%</span>;
}

function PlanSheet({ good, w, onClose }: { good: GoodId; w: WorldState; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const push = useGame((s) => s.push);
  const def = GOODS[good];
  const [pm, setPm] = useState(1);
  const [name, setName] = useState('');
  const p = useMemo(() => launchPreview(w, good, pm), [w.day, good, pm]); // eslint-disable-line react-hooks/exhaustive-deps
  const src = inputSources(w, good);
  const buyers = usedBy(good);
  const producers = w.companies.filter((c) => c.good === good && !c.bankrupt);
  const cost = startCost(good);
  const capital = requiredCapital(good);
  const fee = licenceFee(w, def.industry);
  const afford = w.player.cash >= cost;
  const suggested = suggestName(good, w);
  const submit = async () => {
    const r = await dispatch({ type: 'foundCompany', name: name.trim() || suggested, good, priceMult: pm });
    if (r.ok) onClose();
  };
  const bar = (v: number) => `${Math.max(2, (v / Math.max(p.price, p.unitCost)) * 100)}%`;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={def.name}
      footer={
        fee > 0 ? (
          <Button block size="lg" disabled={w.player.cash < fee} onClick={() => dispatch({ type: 'buyLicence', industry: def.industry })}>
            {w.player.cash >= fee ? `Buy ${INDUSTRIES[def.industry].name} licence · ${fmtMoney(fee)}` : `Licence needs ${fmtMoney(fee)} (you have ${fmtMoney(w.player.cash)})`}
          </Button>
        ) : (
          <Button block size="lg" disabled={!afford} onClick={submit}>
            {afford ? `Found for ${fmtMoney(cost)}` : `Need ${fmtMoney(cost)} (you have ${fmtMoney(w.player.cash)})`}
          </Button>
        )
      }
    >
      <p className="text-sm text-muted">{def.blurb}</p>
      {fee > 0 && (
        <p className="text-sm text-amber mt-2">
          You don't hold a {INDUSTRIES[def.industry].name} licence. It costs {fmtMoney(fee)} from the government, then the company costs {fmtMoney(cost)} to found.
          Or buy {def.name.toLowerCase()} from other companies with a supply deal instead.
        </p>
      )}
      {licences(w).length === 0 && (
        <p className="text-sm text-gold mt-2">This will be your first company, so its {INDUSTRIES[def.industry].name} licence is free. Other industries will need a paid licence.</p>
      )}
      {capital > 0 && (
        <p className="text-sm text-amber mt-2">
          A bank needs {fmtMoney(cost)} to open: {fmtMoney(def.foundCost)} builds the branch and {fmtMoney(capital)} is its required capital.
          The capital stays in the bank (it counts in your net worth but can't be withdrawn or paid out) and lets it lend about 6x as much to companies.
        </p>
      )}

      <Section title="What you need to make one">
        {src.length === 0 && <p className="text-sm text-muted">Nothing: it comes straight from the ground or field. Only staff and running costs.</p>}
        {src.map((i) => (
          <div key={i.good} className="flex items-center justify-between py-1.5 text-sm">
            <span>{+i.qty.toFixed(2)} {GOODS[i.good].unit} {GOODS[i.good].name}</span>
            <span className="text-right">
              <span className={cx('num', i.own && 'line-through text-dim')}>{fmtPrice(i.market * i.qty)}</span>
              {i.own && <span className="block text-xs text-green">From your {i.own.name}: {fmtPrice(i.own.price * i.qty)}</span>}
              {!i.own && <button className="block text-xs text-gold font-semibold ml-auto" onClick={() => push({ screen: 'planner', good: i.good })}>Make it yourself?</button>}
            </span>
          </div>
        ))}
        {buyers.length > 0 && <p className="text-xs text-dim mt-1">Sold to makers of {buyers.map((b) => GOODS[b].name.toLowerCase()).join(', ')}.</p>}
        {buyers.length === 0 && <p className="text-xs text-dim mt-1">Sold to households and shops.</p>}
      </Section>

      <Section title="Cost of each unit vs price">
        {([['Materials', p.materials, '#c96a3c'], ['Staff', p.labour, '#4a8fe0'], ['Energy & running', p.other, '#e3b04b'], ['Plant & overheads', p.fixed, '#9aa9c4']] as const).map(([l, v, c]) => (
          <div key={l} className="flex items-center gap-2 py-1 text-xs">
            <span className="w-28 shrink-0 text-muted">{l}</span>
            <span className="flex-1 h-2 rounded-full bg-bg overflow-hidden"><span className="block h-full rounded-full" style={{ width: bar(v), background: c }} /></span>
            <span className="num w-16 text-right">{fmtPrice(v)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between text-sm pt-2 border-t border-line mt-1">
          <span className="font-semibold">Total cost / your price</span>
          <span className="num font-bold">{fmtPrice(p.unitCost)} / <span className={p.price > p.unitCost ? 'text-green' : 'text-red'}>{fmtPrice(p.price)}</span></span>
        </div>
      </Section>

      <Section title="Try a launch price">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{pm < 0.99 ? 'Cheaper than the market' : pm > 1.01 ? 'Above the market' : 'Market price'}</span>
          <span className="num font-bold">{Math.round(pm * 100)}%</span>
        </div>
        <input type="range" min={0.8} max={1.3} step={0.01} value={pm} onChange={(e) => setPm(Number(e.target.value))} className="w-full h-tap accent-[var(--color-gold)]" aria-label="Launch price" />
        <div className="grid grid-cols-2 gap-2">
          <Forecast label="Sales / day" value={`${Math.round(p.soldPerDay).toLocaleString()} of ${Math.round(p.capacity).toLocaleString()}`} />
          <Forecast label="Profit / day" value={fmtMoney(p.profitDay)} tone={p.profitDay > 0 ? 'good' : 'bad'} />
          <Forecast label="Margin" value={fmtPct(p.margin, 0)} tone={p.margin > 0 ? 'good' : 'bad'} />
          <Forecast label="Pays back in" value={Number.isFinite(p.paybackDays) ? `${Math.round(p.paybackDays)} days` : 'Never'} tone={p.paybackDays < 360 ? 'good' : 'bad'} />
        </div>
        <p className="text-xs text-dim mt-2">A forecast at today's prices. Cheaper wins buyers faster but earns less on each sale.</p>
      </Section>

      <Section title={`Who makes it now (${producers.length})`}>
        {producers.map((c) => {
          const owner = c.isPlayer ? 'You' : (w.rivals.find((r) => r.id === c.ownerId)?.name ?? 'Independent');
          return (
            <div key={c.id} className="flex items-center justify-between py-1 text-sm">
              <span className="truncate">{c.name} <span className="text-xs text-dim">· {owner}</span></span>
              <span className="num text-xs text-muted shrink-0">{fmtPct(c.last.marketShare, 0)} share</span>
            </div>
          );
        })}
      </Section>

      <label className="block text-sm text-muted mt-4 mb-1" htmlFor="co-name">Company name</label>
      <input
        id="co-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={suggested}
        maxLength={28}
        className="w-full min-h-tap rounded-lg bg-bg border border-line-strong px-3 text-base outline-none focus:border-gold"
      />
      <p className="text-xs text-dim mt-2">35% of the cost becomes company cash, 65% is the plant. A starter delivery of materials is included.</p>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-bold uppercase tracking-wider text-gold mb-1">{title}</div>
      {children}
    </div>
  );
}

function Forecast({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-line bg-bg px-2.5 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('num font-bold', tone === 'good' && 'text-green', tone === 'bad' && 'text-red')}>{value}</div>
    </div>
  );
}

const NAMES: Partial<Record<GoodId, string[]>> = {
  iron_ore: ['Bluestone Mining', 'Deepcut Ore'], grain: ['Golden Acre Farms', 'Prairie Grain'], cotton: ['Whitefield Cotton', 'Soft Bloom Farms'],
  silicon: ['Clearwater Silica', 'Quartz Ridge'], crude_oil: ['Blackwell Oil', 'Deep Basin Petroleum'], electricity: ['Sunrise Power', 'Helio Grid'],
  plastics: ['Polyform', 'Moldline Plastics'], steel: ['Anvil Steel', 'Keystone Mills'], chips: ['Nanocore', 'Siliconix'],
  cars: ['Roadstar Motors', 'Apex Auto'], appliances: ['Homewise', 'Kitchen Crest'], phones: ['Pocketline', 'Brightbyte Mobile'],
  software: ['Nimbus Labs', 'Pixelforge'], food: ['Daily Basket', 'Harvest Table'], clothing: ['Thread & Co', 'Market Lane Apparel'], banking: ['Harbor Savings', 'Oakline Credit'],
  timber: ['Greenbough Timber', 'Pinecrest Logging'], chemicals: ['Catalyst Chemicals', 'Bluebeaker Chem'], glass: ['Crystalline Glass', 'Brightpane'],
  freight: ['Roadrunner Freight', 'Harborline Logistics'], furniture: ['Oak & Ember', 'Homestead Furnishings'], laptops: ['Foldtop', 'Keystroke Computers'],
  medicine: ['Willow Pharma', 'Clearleaf Labs'], telecom: ['Signalwave', 'Brightlink Mobile'], clinics: ['Riverside Clinics', 'Kindred Care'],
};
function suggestName(good: GoodId, w: WorldState): string {
  const taken = new Set(w.companies.map((c) => c.name.toLowerCase()));
  const opts = NAMES[good] ?? [`${GOODS[good].name} Co`];
  return opts.find((n) => !taken.has(n.toLowerCase())) ?? `${opts[0]} ${w.companies.length}`;
}
