import { useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import { GOODS, GOOD_IDS, INDUSTRIES, usedBy } from '../../engine/data';
import { refPrice } from '../../engine/company';
import { fmtMoney, fmtPct, fmtPrice } from '../../engine/news';
import type { Company, GoodId, WorldState } from '../../engine/types';
import { shortageOutlook } from '../../engine/advisor';
import { Badge, BottomSheet, Button, Card, Screen, cx } from '../components/core';
import { LineChart } from '../components/game';
import { IconBack } from '../components/Icons';

// ---------- Market view (derived from yesterday's numbers) ----------

export type MarketStatus = 'shortage' | 'strong' | 'balanced' | 'low';

const STATUS: Record<MarketStatus, { label: string; color: string; tone: 'good' | 'bad' | 'warn' | 'neutral'; hint: string }> = {
  shortage: { label: 'Shortage', color: 'var(--color-red)', tone: 'bad', hint: 'Buyers want more than Astoria makes. Prices rise and the gap is imported at a premium.' },
  strong: { label: 'High demand', color: 'var(--color-amber)', tone: 'warn', hint: 'Producers are almost sold out. Prices are firm.' },
  balanced: { label: 'Balanced', color: 'var(--color-green)', tone: 'good', hint: 'Supply roughly matches demand.' },
  low: { label: 'Low demand', color: 'var(--color-blue)', tone: 'neutral', hint: 'There is more capacity than buyers. Prices are under pressure.' },
};

interface Seller { id: string; name: string; owner: string; ownerId: string; isPlayer: boolean; sold: number; capacity: number; share: number }
interface Buyer { label: string; good?: GoodId; qty: number; share: number }

export interface MarketView {
  good: GoodId;
  status: MarketStatus;
  price: number;
  trend: number;
  demand: number;
  made: number;
  imported: number;
  importShare: number;
  capacity: number;
  sellers: Seller[];
  buyers: Buyer[];
  yours: boolean;
}

export function marketView(w: WorldState, g: GoodId): MarketView {
  const mk = w.goods[g];
  const producers = w.companies.filter((c) => c.good === g && !c.bankrupt);
  const made = producers.reduce((s, c) => s + c.last.sold, 0);
  const served = made + mk.imported;
  const capacity = producers.reduce((s, c) => s + c.capacity, 0);
  const sellers: Seller[] = producers
    .map((c) => ({
      id: c.id, name: c.name, ownerId: c.ownerId, isPlayer: c.isPlayer,
      owner: c.isPlayer ? 'You' : (w.rivals.find((r) => r.id === c.ownerId)?.name ?? 'Independent'),
      sold: c.last.sold, capacity: c.capacity, share: served > 0 ? c.last.sold / served : 0,
    }))
    .sort((a, b) => b.sold - a.sold);

  // Who uses it: households plus each industry that has it in its recipe
  const byGood = new Map<GoodId, number>();
  for (const c of w.companies) {
    if (c.bankrupt) continue;
    const i = GOODS[c.good].inputs.find((x) => x.good === g);
    if (i) byGood.set(c.good, (byGood.get(c.good) ?? 0) + c.last.produced * i.qty);
  }
  const used = [...byGood.values()].reduce((s, v) => s + v, 0);
  const demand = mk.finalDemand + used;
  const buyers: Buyer[] = [
    ...(mk.finalDemand > 0 ? [{ label: 'Households & shops', qty: mk.finalDemand, share: 0 }] : []),
    ...[...byGood.entries()].map(([bg, qty]) => ({ label: `${GOODS[bg].name} makers`, good: bg, qty, share: 0 })),
  ]
    .map((b) => ({ ...b, share: demand > 0 ? b.qty / demand : 0 }))
    .sort((a, b) => b.qty - a.qty);

  const importShare = served > 0 ? Math.max(0, mk.imported) / served : 0;
  const t = mk.tightness;
  // A healthy market runs at ~0.87 (producers keep ~15% spare capacity)
  const status: MarketStatus = importShare > 0.05 || t > 1.04 ? 'shortage' : t > 0.93 ? 'strong' : t >= 0.82 ? 'balanced' : 'low';
  const price = refPrice(w, g);
  const past = mk.hist.length > 15 ? mk.hist[mk.hist.length - 16].price : price;
  return {
    good: g, status, price, trend: past > 0 ? price / past - 1 : 0, demand, made, imported: Math.max(0, mk.imported), importShare, capacity,
    sellers, buyers, yours: producers.some((c) => c.isPlayer),
  };
}

// ---------- Layout of the flow diagram ----------

const ROWS: { title: string; goods: GoodId[] }[] = [
  { title: 'Raw: energy & metals', goods: ['crude_oil', 'natural_gas', 'silicon', 'copper', 'lithium', 'rare_earths', 'bauxite'] },
  { title: 'Raw: land & farms', goods: ['iron_ore', 'limestone', 'timber', 'grain', 'cotton'] },
  { title: 'Processed', goods: ['electricity', 'chemicals', 'plastics', 'water', 'glass', 'cement', 'aluminium'] },
  { title: 'Materials & services', goods: ['steel', 'chips', 'batteries', 'freight', 'construction', 'software', 'clothing'] },
  { title: 'Finished goods', goods: ['robots', 'cars', 'appliances', 'phones', 'laptops', 'furniture', 'food'] },
  { title: 'Services', goods: ['ai', 'gaming', 'telecom', 'ecommerce', 'medicine', 'banking', 'real_estate'] },
  { title: 'Health & mega businesses', goods: ['clinics', 'hospitals', 'wellness', 'airlines', 'space', 'defense'] },
];
const VW = 440;
const BW = 56;
const BH = 54;
const ROW_H = 118;
const TOP = 22;

const POS: Record<GoodId, { x: number; y: number }> = (() => {
  const out = {} as Record<GoodId, { x: number; y: number }>;
  ROWS.forEach((row, r) => {
    const n = row.goods.length;
    const gap = (VW - n * BW) / (n + 1);
    row.goods.forEach((g, i) => {
      out[g] = { x: gap + i * (BW + gap), y: TOP + r * ROW_H };
    });
  });
  return out;
})();
const VH = TOP + (ROWS.length - 1) * ROW_H + BH + 8;

const EDGES: { from: GoodId; to: GoodId }[] = GOOD_IDS.flatMap((to) => GOODS[to].inputs.map((i) => ({ from: i.good, to })));

/** Status words short enough for the small boxes */
const BOX_LABEL: Record<MarketStatus, string> = { shortage: 'Shortage', strong: 'Busy', balanced: 'Balanced', low: 'Quiet' };

const SHORT: Partial<Record<GoodId, string>> = { electricity: 'Power', crude_oil: 'Oil', natural_gas: 'Gas', rare_earths: 'Rare Earth', appliances: 'Appliance', telecom: 'Mobile', construction: 'Builders', ecommerce: 'Online', real_estate: 'Property', ai: 'AI', space: 'Space' };

// ---------- Screen ----------

export function ChainScreen({ good }: { good?: GoodId }) {
  const w = useGame((s) => s.world)!;
  const back = useGame((s) => s.back);
  const [sel, setSel] = useState<GoodId | null>(good ?? null);
  const [open, setOpen] = useState<GoodId | null>(good ?? null);
  const views = useMemo(() => Object.fromEntries(GOOD_IDS.map((g) => [g, marketView(w, g)])) as Record<GoodId, MarketView>, [w.day]); // eslint-disable-line react-hooks/exhaustive-deps

  const related = useMemo(() => {
    if (!sel) return null;
    const s = new Set<GoodId>([sel]);
    for (const i of GOODS[sel].inputs) s.add(i.good);
    for (const b of usedBy(sel)) s.add(b);
    return s;
  }, [sel]);

  const tap = (g: GoodId) => {
    setSel(g);
    setOpen(g);
  };
  const counts = GOOD_IDS.reduce((m, g) => ({ ...m, [views[g].status]: (m[views[g].status] ?? 0) + 1 }), {} as Partial<Record<MarketStatus, number>>);

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center gap-2 px-2 h-14 border-b border-line bg-surface">
        <button aria-label="Back" onClick={back} className="size-tap grid place-items-center text-muted hover:text-text"><IconBack /></button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg truncate">Supply chain</div>
          <div className="text-xs text-muted">How goods flow through Astoria · day {w.day}</div>
        </div>
      </div>
      <Screen className="flex-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs">
          {(Object.keys(STATUS) as MarketStatus[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-muted">
              <span className="size-2.5 rounded-sm" style={{ background: STATUS[k].color }} />
              {BOX_LABEL[k] === STATUS[k].label ? STATUS[k].label : `${BOX_LABEL[k]} (${STATUS[k].label.toLowerCase()})`} <span className="num text-dim">{counts[k] ?? 0}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-muted"><span className="text-text text-sm leading-none">★</span>You make it</span>
        </div>

        <Card className="mt-2 p-1.5">
          <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-auto select-none" role="group" aria-label="Supply chain diagram">
            <defs>
              <marker id="chain-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--color-line-strong)" />
              </marker>
              <marker id="chain-arrow-hot" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--color-gold)" />
              </marker>
            </defs>
            {EDGES.map((e) => {
              const a = POS[e.from];
              const b = POS[e.to];
              const hot = sel != null && (e.from === sel || e.to === sel);
              const faded = sel != null && !hot;
              const x1 = a.x + BW / 2;
              const y1 = a.y + BH;
              const x2 = b.x + BW / 2;
              const y2 = b.y - 2;
              const my = (y1 + y2) / 2;
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`}
                  fill="none"
                  stroke={hot ? 'var(--color-gold)' : 'var(--color-line-strong)'}
                  strokeWidth={hot ? 2 : 1.2}
                  opacity={faded ? 0.15 : hot ? 1 : 0.7}
                  markerEnd={`url(#${hot ? 'chain-arrow-hot' : 'chain-arrow'})`}
                  className={hot ? 'chain-flow' : undefined}
                />
              );
            })}
            {ROWS.map((row, r) => (
              <text key={row.title} x={6} y={TOP + r * ROW_H - 8} fontSize="9" fill="var(--color-dim)" fontWeight="700" letterSpacing="0.08em" stroke="var(--color-card)" strokeWidth="3" paintOrder="stroke">
                {row.title.toUpperCase()}
              </text>
            ))}
            {GOOD_IDS.map((g) => (
              <Node key={g} g={g} v={views[g]} selected={sel === g} faded={related != null && !related.has(g)} onTap={() => tap(g)} />
            ))}
          </svg>
        </Card>
        <p className="text-xs text-dim mt-2">Arrows show what each business buys. Tap a box to see who sells it, who buys it, and how much comes from abroad.</p>

        <div className="mt-4 text-xs font-bold uppercase tracking-wider text-gold">All markets</div>
        <div className="mt-1 space-y-1.5 pb-4">
          {GOOD_IDS.map((g) => views[g]).sort((a, b) => order(a) - order(b)).map((v) => (
            <Card key={v.good} className="px-3 py-2" onClick={() => tap(v.good)}>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm shrink-0" style={{ background: STATUS[v.status].color }} />
                <span className="font-semibold text-sm flex-1 truncate">{GOODS[v.good].name}{v.yours && <span className="text-text"> ★</span>}</span>
                <span className="text-xs text-muted">{STATUS[v.status].label}</span>
                <span className="num text-sm text-right whitespace-nowrap">{fmtPrice(v.price)} <Trend v={v.trend} /></span>
              </div>
            </Card>
          ))}
        </div>
      </Screen>
      {open && <MarketSheet key={open} v={views[open]} w={w} onClose={() => setOpen(null)} onJump={tap} />}
    </div>
  );
}

const order = (v: MarketView) => ({ shortage: 0, strong: 1, balanced: 2, low: 3 })[v.status] - Math.min(0.9, v.importShare);

function Node({ g, v, selected, faded, onTap }: { g: GoodId; v: MarketView; selected: boolean; faded: boolean; onTap: () => void }) {
  const { x, y } = POS[g];
  const st = STATUS[v.status];
  const name = SHORT[g] ?? GOODS[g].name;
  const pct = Math.round(v.trend * 100);
  return (
    <g
      transform={`translate(${x} ${y})`}
      opacity={faded ? 0.3 : 1}
      onClick={onTap}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onTap()}
      role="button"
      tabIndex={0}
      aria-label={`${GOODS[g].name}: ${st.label}${v.yours ? ', you make it' : ''}`}
      className="iso-hit cursor-pointer"
    >
      <rect width={BW} height={BH} rx={8} fill="var(--color-card-2)" stroke={selected ? 'var(--color-text)' : st.color} strokeWidth={selected ? 2.5 : 1.5} />
      <rect width={BW} height={5} rx={2} fill={st.color} />
      <text x={BW / 2} y={20} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--color-text)">{name}</text>
      <text x={BW / 2} y={33} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={st.color}>{BOX_LABEL[v.status]}</text>
      <text x={BW / 2} y={46} textAnchor="middle" fontSize="8.5" fill={pct > 0 ? 'var(--color-green)' : pct < 0 ? 'var(--color-red)' : 'var(--color-dim)'}>
        {pct > 0 ? `▲${pct}%` : pct < 0 ? `▼${-pct}%` : '→ 0%'}
      </text>
      {v.yours && (
        <g transform={`translate(${BW - 2} 2)`} aria-hidden>
          <circle r={7.5} fill="var(--color-text)" stroke="var(--color-card)" strokeWidth={1.5} />
          <text y={3.6} textAnchor="middle" fontSize="10" fill="var(--color-bg)">★</text>
        </g>
      )}
      {v.importShare >= 0.01 && (
        <g transform={`translate(${BW - 34} ${BH - 7})`}>
          <rect width={38} height={13} rx={6.5} fill="var(--color-red)" />
          <text x={19} y={9.5} textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">{Math.round(v.importShare * 100)}% imp</text>
        </g>
      )}
    </g>
  );
}

function Trend({ v }: { v: number }) {
  if (Math.abs(v) < 0.01) return <span className="text-dim text-xs">→</span>;
  return <span className={cx('text-xs', v > 0 ? 'text-green' : 'text-red')}>{v > 0 ? '▲' : '▼'}{Math.round(Math.abs(v) * 100)}%</span>;
}

// ---------- Detail sheet ----------

const SELLER_COLORS = ['#e3b04b', '#4a8fe0', '#3dbb6c', '#c96a3c', '#9b7be0', '#46b3b3', '#d0679a'];

/** Why a market is short, how long it should last and how much more buyers will pay */
export function ShortageNote({ w, good, mine }: { w: WorldState; good: GoodId; mine?: Company }) {
  const o = shortageOutlook(w, good);
  if (!o) return null;
  const when = o.daysLeft ? `Should ease in about ${o.daysLeft} days, when the event ends.` : 'Lasts until producers expand. Rivals review their plants every week, and you can upgrade too.';
  const room = o.importMult - 1;
  const at = mine ? mine.priceMult - 1 : null;
  return (
    <div className="mt-3 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm">
      <div className="font-semibold">Shortage outlook</div>
      <p className="mt-1 text-muted">{o.cause}. {when}</p>
      <p className="mt-1 text-muted">
        {room > 0.03 ? (
          <>Imports cost <b className="text-text num">{fmtPct(room, 0)}</b> more than the market price, so sellers can charge up to about that much more while they sell out.</>
        ) : (
          <>The market price has already reached the import price, so there is little room to charge more. Imports still never undercut local sellers: importers charge at least what buyers pay here.</>
        )}
        {at !== null && ` You charge ${at === 0 ? 'the market price' : `${fmtPct(Math.abs(at), 0)} ${at > 0 ? 'above' : 'below'} the market`}.`}
        {at !== null && at > 0 && ' Keep an eye on "Plant used": if it falls below about 95%, lower your price.'}
      </p>
    </div>
  );
}

function MarketSheet({ v, w, onClose, onJump }: { v: MarketView; w: WorldState; onClose: () => void; onJump: (g: GoodId) => void }) {
  const push = useGame((s) => s.push);
  const def = GOODS[v.good];
  const st = STATUS[v.status];
  const unit = def.unit;
  const qty = (n: number) => `${Math.round(n).toLocaleString()} ${unit}`;
  const spare = Math.max(0, v.capacity - v.made);
  const mine = w.companies.find((c) => c.isPlayer && !c.bankrupt && c.good === v.good);
  // Stacked share bar: sellers, then imports
  const segs = [
    ...v.sellers.filter((s) => s.share > 0.005).map((s, i) => ({ key: s.id, share: s.share, color: s.isPlayer ? 'var(--color-gold)' : SELLER_COLORS[(i + 1) % SELLER_COLORS.length] })),
    ...(v.importShare > 0.005 ? [{ key: 'imp', share: v.importShare, color: 'var(--color-red)' }] : []),
  ];
  const colorOf = (id: string) => segs.find((s) => s.key === id)?.color ?? 'var(--color-line-strong)';
  const hist = w.goods[v.good].hist.map((h) => h.price);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2">{def.name} <Badge tone={st.tone}>{st.label}</Badge></span>}
      footer={
        mine ? (
          <Button block size="lg" onClick={() => push({ screen: 'company', id: mine.id })}>Open {mine.name}</Button>
        ) : (
          <Button block size="lg" onClick={() => push({ screen: 'planner', good: v.good })}>Start making {def.name.toLowerCase()}</Button>
        )
      }
    >
      <p className="text-sm text-muted">{st.hint}</p>
      <ShortageNote w={w} good={v.good} mine={mine} />
      <div className="flex items-baseline justify-between mt-3">
        <span className="text-xs text-muted">{INDUSTRIES[def.industry].name} · price per {unit}</span>
        <span className="num font-bold text-lg">{fmtPrice(v.price)} <Trend v={v.trend} /></span>
      </div>
      <div className="mt-1"><LineChart data={hist} height={80} /></div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <Stat label="Demand / day" value={qty(v.demand)} />
        <Stat label="Made in Astoria" value={qty(v.made)} />
        <Stat label="Imported" value={qty(v.imported)} tone={v.imported > 0 ? 'bad' : undefined} />
        <Stat label="Spare capacity" value={qty(spare)} tone={spare > v.demand * 0.3 ? 'warn' : undefined} />
      </div>

      <Section title={`Who sells it (${v.sellers.length})`}>
        {segs.length > 0 && (
          <div className="flex h-3 rounded-full overflow-hidden border border-line mb-2" aria-hidden>
            {segs.map((s) => <span key={s.key} style={{ width: `${s.share * 100}%`, background: s.color }} />)}
          </div>
        )}
        {v.sellers.length === 0 && <p className="text-sm text-muted">Nobody in Astoria makes this. Everything is imported.</p>}
        {v.sellers.map((s) => (
          <Row
            key={s.id}
            dot={colorOf(s.id)}
            label={<>{s.name} <span className={cx('text-xs', s.isPlayer ? 'text-gold font-semibold' : 'text-dim')}>· {s.owner}</span></>}
            sub={`${qty(s.sold)} sold · ${s.capacity > 0 ? Math.round((s.sold / s.capacity) * 100) : 0}% of plant used`}
            value={fmtPct(s.share, 0)}
            onClick={s.isPlayer ? () => push({ screen: 'company', id: s.id }) : w.rivals.some((r) => r.id === s.ownerId) ? () => push({ screen: 'rival', id: s.ownerId }) : undefined}
          />
        ))}
        {v.importShare >= 0.001 && (
          <Row
            dot="var(--color-red)"
            label={<>Foreign exporters <span className="text-xs text-dim">· abroad</span></>}
            sub={`${qty(v.imported)} shipped in at about 30% above local prices`}
            value={fmtPct(v.importShare, 0)}
          />
        )}
      </Section>

      <Section title="Who buys it">
        {v.buyers.length === 0 && <p className="text-sm text-muted">No buyers yesterday.</p>}
        {v.buyers.map((b) => (
          <Row
            key={b.label}
            dot="var(--color-blue)"
            label={b.label}
            sub={qty(b.qty)}
            value={fmtPct(b.share, 0)}
            onClick={b.good ? () => onJump(b.good!) : undefined}
          />
        ))}
      </Section>

      {def.inputs.length > 0 && (
        <Section title="Made from">
          <div className="flex flex-wrap gap-1.5">
            {def.inputs.map((i) => (
              <button key={i.good} onClick={() => onJump(i.good)} className="rounded-full border border-line-strong bg-bg px-3 min-h-9 text-sm">
                {+i.qty.toFixed(2)} {GOODS[i.good].unit} {GOODS[i.good].name} <span className="text-dim">›</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      <p className="text-xs text-dim mt-3">Figures are from yesterday. Market value of yesterday's sales: {fmtMoney((v.made + v.imported) * v.price)}.</p>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="rounded-lg border border-line bg-bg px-2.5 py-2 min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('num font-bold text-sm truncate', tone === 'bad' && 'text-red', tone === 'warn' && 'text-amber')}>{value}</div>
    </div>
  );
}

function Row({ dot, label, sub, value, onClick }: { dot: string; label: ReactNode; sub: string; value: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="size-2.5 rounded-sm shrink-0 mt-1.5" style={{ background: dot }} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm truncate">{label}</span>
        <span className="block text-xs text-dim num">{sub}</span>
      </span>
      <span className="num font-bold text-sm shrink-0">{value}</span>
      {onClick && <span className="text-dim shrink-0" aria-hidden>›</span>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="w-full flex items-start gap-2 py-1.5 text-left min-h-tap">{body}</button>
  ) : (
    <div className="flex items-start gap-2 py-1.5">{body}</div>
  );
}

/** Entry card for the map (Business tab). */
export function ChainMapCard() {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const short = useMemo(() => GOOD_IDS.filter((g) => marketView(w, g).status === 'shortage').map((g) => GOODS[g].name), [w.day]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="p-3" onClick={() => push({ screen: 'chain' })}>
      <div className="flex items-center gap-3">
        <ChainGlyph />
        <div className="flex-1 min-w-0">
          <div className="font-bold">Supply chain map</div>
          <div className="text-xs text-muted truncate">
            {short.length ? <><span className="text-red font-semibold">Shortage:</span> {short.join(', ')}</> : 'Who makes what, shortages, imports and market shares'}
          </div>
        </div>
        <span className="text-gold text-lg" aria-hidden>›</span>
      </div>
    </Card>
  );
}

function ChainGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
      <rect x="2" y="4" width="12" height="9" rx="2" fill="var(--color-card-2)" stroke="var(--color-amber)" />
      <rect x="26" y="4" width="12" height="9" rx="2" fill="var(--color-card-2)" stroke="var(--color-blue)" />
      <rect x="14" y="27" width="12" height="9" rx="2" fill="var(--color-card-2)" stroke="var(--color-gold)" />
      <path d="M8 13 C8 22 20 18 20 27 M32 13 C32 22 20 18 20 27" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" />
    </svg>
  );
}

