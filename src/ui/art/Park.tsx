/**
 * The player's industrial park: every company as its own plant, laid out from raw
 * materials (left) to finished goods (right), with conveyors where one of your
 * companies supplies another and truck roads from the open market for the rest.
 */
import type { ReactNode } from 'react';
import { GOODS, GOOD_IDS } from '../../engine/data';
import type { Company, GoodId } from '../../engine/types';
import { MapLabel } from './City';
import { Box, Car, OUTLINE, P, Person, Tile, Tree, Windows, hash01, pts } from './iso';
import { cx } from '../components/core';
import { GoodBuilding } from './plants';

const SPX = 5.2; // grid units between columns (flow direction)
const SPY = 4.8; // grid units between rows
const DEPOT_X = 0;

const DEPTH: Record<GoodId, number> = (() => {
  const d = {} as Record<GoodId, number>;
  for (const g of GOOD_IDS) d[g] = GOODS[g].inputs.length === 0 ? 0 : 1 + Math.max(...GOODS[g].inputs.map((i) => d[i.good]));
  return d;
})();

const FLOW_COLOR: Partial<Record<GoodId, string>> = {
  iron_ore: '#b0704a', grain: '#e3c25a', cotton: '#f4f1ea', silicon: '#b9d6ee', crude_oil: '#2b2e36', electricity: '#ffe08a',
  plastics: '#4a8fe0', steel: '#c9d3e2', chips: '#3dbb6c',
  timber: '#9c6b3f', chemicals: '#c58be0', glass: '#9fd0ff', freight: '#f0a33a', medicine: '#3dbb9c',
};

interface Plot { c: Company; x: number; y: number }
interface Link { pts: [number, number][]; good: GoodId; own: boolean; from: string; to: string; qty: number; kind: 'own' | 'market' | 'sale' }

/**
 * With focusId, the scene centres on one company: its own plant, the sister companies
 * that supply it or buy from it, the market depot for anything else it buys, and the
 * customers it sells to.
 */
export function IndustrialPark({ companies, flags, onOpen, focusId }: { companies: Company[]; flags: Record<string, string | undefined>; onOpen: (id: string) => void; focusId?: string }) {
  const live = companies.filter((c) => !c.bankrupt || c.id === focusId);
  if (live.length === 0) return null;
  const isFocus = (c: Company) => c.id === focusId;
  // In focus mode only the focused company's market purchases are drawn
  const marketBuyer = (c: Company) => !focusId || isFocus(c);

  // Columns by supply-chain depth, rows in each column
  const depths = [...new Set(live.map((c) => DEPTH[c.good]))].sort((a, b) => a - b);
  const needsMarket = live.some((c) => marketBuyer(c) && GOODS[c.good].inputs.some((i) => !live.some((s) => s.good === i.good)));
  const x0 = needsMarket ? 4 : 0;
  const plots: Plot[] = [];
  const byGood = new Map<GoodId, Plot>();
  depths.forEach((d, col) => {
    const inCol = live.filter((c) => DEPTH[c.good] === d).sort((a, b) => GOOD_IDS.indexOf(a.good) - GOOD_IDS.indexOf(b.good) || b.level - a.level);
    inCol.forEach((c, row) => {
      const p = { c, x: x0 + col * SPX, y: row * SPY };
      plots.push(p);
      if (!byGood.has(c.good)) byGood.set(c.good, p);
    });
  });
  const rows = Math.max(...plots.map((p) => p.y)) / SPY + 1;
  const depot = { x: DEPOT_X, y: ((rows - 1) * SPY) / 2 + 0.3 };

  // Links: own supplier → conveyor, otherwise market depot → truck road.
  // Runs stay in the gaps between columns; a link that skips a column goes round
  // by the service road behind the plots (conveyors) or in front of them (trucks).
  const lastRowY = Math.max(...plots.map((p) => p.y));
  let back = 0;
  let front = 0;
  const links: Link[] = [];
  for (const p of plots) {
    const ins = GOODS[p.c.good].inputs;
    ins.forEach((inp, lane) => {
      const yIn = p.y + 0.6 + (lane + 0.5) * (1.8 / ins.length);
      const gx = p.x - 0.7 - lane * 0.4;
      const s = byGood.get(inp.good);
      const qty = Math.max(0, p.c.last.produced * inp.qty);
      if (!s && !marketBuyer(p.c)) return;
      if (s) {
        const sy = s.y + 1.5;
        const adjacent = p.x - s.x <= SPX + 0.01;
        const pts: [number, number][] = adjacent
          ? [[s.x + 3, sy], [gx, sy], [gx, yIn], [p.x, yIn]]
          : (() => {
              const street = -0.9 - back++ * 0.4;
              const ex = s.x + 3.5 + lane * 0.3;
              return [[s.x + 3, sy], [ex, sy], [ex, street], [gx, street], [gx, yIn], [p.x, yIn]];
            })();
        links.push({ pts, good: inp.good, own: true, from: s.c.name, to: p.c.name, qty, kind: 'own' });
      } else {
        const dy = depot.y + 1;
        const first = p.x <= x0 + 0.01;
        const pts: [number, number][] = first
          ? [[depot.x + 2.6, dy], [gx, dy], [gx, yIn], [p.x, yIn]]
          : (() => {
              const street = lastRowY + 3.9 + front++ * 0.4;
              return [[depot.x + 2.6, dy], [x0 - 0.5, dy], [x0 - 0.5, street], [gx, street], [gx, yIn], [p.x, yIn]];
            })();
        links.push({ pts, good: inp.good, own: false, from: 'Open market', to: p.c.name, qty, kind: 'market' });
      }
    });
  }

  // Customers: where the focused company sells (shops, other businesses, deal partners)
  const focus = plots.find((p) => isFocus(p.c));
  let sink: { x: number; y: number } | null = null;
  if (focus) {
    const lastX = Math.max(...plots.map((p) => p.x));
    sink = { x: lastX + SPX - 0.4, y: focus.y + 0.3 };
    const sold = Math.max(0, focus.c.last.sold - focus.c.last.sisterSold);
    const rightOf = plots.some((p) => p.x > focus.x + 0.01);
    const pts: [number, number][] = !rightOf
      ? [[focus.x + 3, focus.y + 1.5], [sink.x, focus.y + 1.5]]
      : (() => {
          const street = lastRowY + 3.9 + front++ * 0.4;
          return [[focus.x + 1.5, focus.y + 3], [focus.x + 1.5, street], [sink.x + 1.2, street], [sink.x + 1.2, sink.y + 2.4]];
        })();
    links.push({ pts, good: focus.c.good, own: false, from: focus.c.name, to: GOODS[focus.c.good].tier === 'product' ? 'Customers' : 'Buyers', qty: sold, kind: 'sale' });
  }

  const maxX = Math.max(...plots.map((p) => p.x), sink ? sink.x : 0) + 3.3;
  const maxY = Math.max(...plots.map((p) => p.y + 3.3), needsMarket ? depot.y + 2.6 : 0, sink ? sink.y + 2.8 : 0, front ? lastRowY + 3.9 + front * 0.4 + 0.3 : 0);
  const minX = needsMarket ? -0.4 : -0.5;
  const minY = -0.5 - (back ? 0.6 + back * 0.4 : 0);
  const pad = 6;
  const left = P(minX, maxY)[0] - pad;
  const right = P(maxX, minY)[0] + pad;
  const top = Math.min(P(minX, minY)[1] - 18, needsMarket ? P(depot.x, depot.y, 1.6)[1] : Infinity, ...plots.map((p) => P(p.x + 1.5, p.y + 1.5, 2.9)[1] - 12)) - pad;
  const bottom = P(maxX, maxY)[1] + pad;

  const items: { depth: number; node: ReactNode }[] = [];
  // Trees along the edges of the park
  for (let i = 0; i < 18; i++) {
    const t = hash01(i, 3);
    const side = i % 4;
    const x = side === 0 ? minX + 0.25 : side === 1 ? maxX - 0.25 : minX + 0.3 + t * (maxX - minX - 0.6);
    const y = side === 2 ? minY + 0.25 : side === 3 ? maxY - 0.25 : minY + 0.3 + t * (maxY - minY - 0.6);
    const onPlot = plots.some((p) => x > p.x - 0.4 && x < p.x + 3.4 && y > p.y - 0.4 && y < p.y + 3.4) || (needsMarket && x < depot.x + 3 && y > depot.y - 0.4 && y < depot.y + 2.8);
    if (!onPlot) items.push({ depth: x + y, node: <Tree key={`t${i}`} x={x} y={y} seed={i * 7} s={0.8} /> });
  }
  for (const p of plots) {
    const open = () => onOpen(p.c.id);
    const [tx, ty] = P(p.x, p.y);
    items.push({
      depth: p.x + p.y + 3,
      node: (
        <g
          key={p.c.id}
          transform={`translate(${tx} ${ty})`}
          role="button"
          tabIndex={0}
          aria-label={`Open ${p.c.name}`}
          className="cursor-pointer iso-hit"
          onClick={open}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}
        >
          <polygon points={pts(P(0, 0), P(3, 0), P(3, 3), P(0, 3))} fill="transparent" />
          <GoodBuilding good={p.c.good} level={p.c.level} />
        </g>
      ),
    });
  }
  if (needsMarket) {
    const [tx, ty] = P(depot.x, depot.y);
    items.push({
      depth: depot.x + depot.y + 2.5,
      node: (
        <g key="depot" transform={`translate(${tx} ${ty})`}>
          <Tile x={0} y={0} w={2.6} d={2.4} fill="#6d6a62" />
          <Box x={0.2} y={0.2} w={1.8} d={1.3} h={0.75} c="#8b93a3" />
          <Windows face="left" x={0.2} y={0.2} w={1.8} d={1.3} h={0.75} rows={1} cols={3} color="#3a4254" dark="#3a4254" my={0.12} mx={0.2} seed={1} litRatio={1} />
          <Box x={0.2} y={0.2} z={0.75} w={1.8} d={1.3} h={0.08} c="#e3b04b" />
          <Car x={0.4} y={1.75} c="#e9eef7" />
          <Car x={1.4} y={1.85} c="#e3b04b" />
        </g>
      ),
    });
  }
  if (sink) {
    const [tx, ty] = P(sink.x, sink.y);
    items.push({
      depth: sink.x + sink.y + 2.5,
      node: (
        <g key="sink" transform={`translate(${tx} ${ty})`}>
          <Tile x={0} y={0} w={2.4} d={2.4} fill="#8a857a" />
          <Box x={0.15} y={0.2} w={0.95} d={0.9} h={0.7} c="#d94f6a" />
          <Windows face="left" x={0.15} y={0.2} w={0.95} d={0.9} h={0.7} rows={1} cols={2} color="#cfe6ff" seed={91} litRatio={1} />
          <Box x={1.3} y={0.2} w={0.95} d={0.9} h={0.95} c="#4a8fe0" />
          <Windows face="left" x={1.3} y={0.2} w={0.95} d={0.9} h={0.95} rows={2} cols={2} color="#cfe6ff" seed={92} />
          <Box x={0.25} y={1.35} w={0.8} d={0.8} h={0.55} c="#e3b04b" />
          <Windows face="left" x={0.25} y={1.35} w={0.8} d={0.8} h={0.55} rows={1} cols={2} color="#fff4cf" seed={93} litRatio={1} />
          <Person x={1.6} y={1.7} shirt="#3dbb6c" s={0.85} />
          <Person x={2.0} y={2.0} shirt="#9b7be0" s={0.85} />
        </g>
      ),
    });
  }
  items.sort((a, b) => a.depth - b.depth);

  const path = (l: Link) => {
    const z = l.own ? 0.28 : 0.02;
    return l.pts.map(([x, y]) => P(x, y, z)).map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ');
  };
  const flows = focusId ? links.filter((l) => l.kind !== 'own' || l.to === focus?.c.name || l.from === focus?.c.name) : links.filter((l) => l.own);
  const qtyText = (l: Link) => (l.qty > 0 ? ` · ${Math.round(l.qty).toLocaleString()} ${GOODS[l.good].unit}/day` : '');

  return (
    <>
    <svg viewBox={`${left} ${top} ${right - left} ${bottom - top}`} className="w-full block" role="group" aria-label="Your industrial park">
      <defs>
        <linearGradient id="park-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15304f" />
          <stop offset="1" stopColor="#1e4a3c" />
        </linearGradient>
      </defs>
      <rect x={left} y={top} width={right - left} height={bottom - top} fill="url(#park-sky)" />
      <polygon points={pts(P(minX, minY), P(maxX, minY), P(maxX, maxY), P(minX, maxY))} fill="#3f7d4a" stroke="#2f6a3c" strokeWidth="1" />
      {/* concrete pads under plots */}
      {plots.map((p) => (
        <polygon
          key={`pad${p.c.id}`}
          points={pts(P(p.x - 0.2, p.y - 0.2), P(p.x + 3.2, p.y - 0.2), P(p.x + 3.2, p.y + 3.2), P(p.x - 0.2, p.y + 3.2))}
          fill={isFocus(p.c) ? '#6b6550' : '#56604f'}
          opacity={isFocus(p.c) ? 0.9 : 0.6}
          stroke={isFocus(p.c) ? '#e3b04b' : 'none'}
          strokeWidth="1.4"
          strokeDasharray={isFocus(p.c) ? '4 3' : undefined}
        />
      ))}
      {/* market truck roads (under everything) */}
      {links.filter((l) => !l.own).map((l, i) => (
        <g key={`r${i}`}>
          <path d={path(l)} fill="none" stroke="#3a4254" strokeWidth="6" strokeLinejoin="round" />
          <path d={path(l)} fill="none" stroke={l.kind === 'sale' ? '#e3b04b' : '#e9eef7'} strokeWidth={l.kind === 'sale' ? 1.6 : 0.7} strokeDasharray="3 4" opacity={l.kind === 'sale' ? 0.95 : 0.6} className="park-road" />
        </g>
      ))}
      {/* own conveyors */}
      {links.filter((l) => l.own).map((l, i) => (
        <g key={`c${i}`}>
          <path d={path(l)} fill="none" stroke={OUTLINE} strokeWidth="6.5" strokeLinejoin="round" />
          <path d={path(l)} fill="none" stroke="#5a6070" strokeWidth="4.6" strokeLinejoin="round" />
          <path d={path(l)} fill="none" stroke={FLOW_COLOR[l.good] ?? '#e3b04b'} strokeWidth="3" strokeDasharray="2.5 5" strokeLinecap="round" className="park-flow" />
        </g>
      ))}
      {items.map((i) => i.node)}
      {/* labels */}
      {plots.map((p) => {
        const [lx, ly] = P(p.x + 1.5, p.y + 1.5, 2.9);
        const f = flags[p.c.id];
        return (
          <g key={`l${p.c.id}`}>
            <MapLabel x={lx} y={ly} text={p.c.name} badge={String(p.c.level)} active />
            {f && <circle cx={lx - Math.max(48, p.c.name.length * 5.8 + 16) / 2 + 2} cy={ly - 8} r="4" fill={f === 'urgent' ? '#e2574c' : '#f0a33a'} stroke="#0b1424" strokeWidth="1.2" />}
          </g>
        );
      })}
      {needsMarket && (() => {
        const [lx, ly] = P(depot.x + 1.6, depot.y + 2.2, 0);
        return <MapLabel x={lx} y={ly} text="Open market" />;
      })()}
      {sink && (() => {
        const [lx, ly] = P(sink.x + 1.2, sink.y + 1.2, 1.9);
        return <MapLabel x={lx} y={ly} text={GOODS[focus!.c.good].tier === 'product' ? 'Customers' : 'Buyers'} />;
      })()}
    </svg>
    {flows.length > 0 && (
      <ul className="px-3 pt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {flows.map((l, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className={cx('size-2.5 border border-line-strong', l.kind === 'own' ? 'rounded-full' : 'rounded-sm')} style={{ background: l.kind === 'market' ? '#8b93a3' : l.kind === 'sale' ? '#e3b04b' : FLOW_COLOR[l.good] ?? '#e3b04b' }} />
            <span><b className="text-text font-semibold">{GOODS[l.good].name}</b> {l.from} → {l.to}<span className="num">{qtyText(l)}</span></span>
          </li>
        ))}
      </ul>
    )}
    </>
  );
}
