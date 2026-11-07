import type { ReactNode } from 'react';
import type { Company, IndustryId, Pop } from '../../engine/types';
import { EmptyPlot, IndustryBuilding } from './buildings';
import { Box, Car, Gable, K, P, Tree, hash01, pts, shade } from './iso';

const G = 21; // grid size
const O = 4; // play area offset
const ROADS = [O + 4, O + 9];
const isRoad = (x: number, y: number) => ROADS.includes(x) || ROADS.includes(y);
const isWater = (x: number, y: number) => x >= O + 10 && y >= O + 5;

export const PLOTS: { ind: IndustryId; x: number; y: number; label: string }[] = [
  { ind: 'manufacturing', x: O + 0.5, y: O + 0.5, label: 'Factory' },
  { ind: 'tech', x: O + 0.5, y: O + 5.5, label: 'Tech Corp' },
  { ind: 'energy', x: O + 5.5, y: O + 0.5, label: 'Oil & Gas' },
  { ind: 'retail', x: O + 5.5, y: O + 5.5, label: 'Retail' },
  { ind: 'finance', x: O + 0.5, y: O + 10, label: 'Bank' },
  { ind: 'resources', x: O + 5.5, y: O + 10, label: 'Mine & Farm' },
  { ind: 'services', x: O - 2.6, y: O - 2.6, label: 'Logistics' },
  { ind: 'health', x: O + 5.5, y: O + 14, label: 'Hospital' },
];
const inPlot = (x: number, y: number) => PLOTS.some((p) => x >= p.x - 0.5 && x < p.x + 3.5 && y >= p.y - 0.5 && y < p.y + 3.5);

export function topZ(ind: IndustryId, level: number): number {
  switch (ind) {
    case 'tech': return 0.45 + Math.min(14, 4 + level) * 0.42 + 1.3;
    case 'manufacturing': return 2.3 + Math.min(1.5, level * 0.1) + 0.6;
    case 'energy': return 2.9 + Math.min(1.2, level * 0.08);
    case 'finance': return 2.3 + Math.min(0.8, Math.floor(level / 4) * 0.25);
    case 'retail': return 0.85 * Math.min(3, 1 + Math.floor((level - 1) / 4)) + 0.9;
    case 'resources': return 2.4 + Math.min(1, level * 0.08);
    case 'health': return Math.min(5, 2 + Math.floor((level - 1) / 3)) * 0.4 + 0.5;
    case 'services': return 1.4;
  }
}

function House({ x, y, seed }: { x: number; y: number; seed: number }) {
  const colors = ['#c9c1b4', '#b7c3d1', '#d8c7a6', '#a9b8a0', '#c7a9a0'];
  const roofs = ['#8a3f35', '#4a5a78', '#6b5a48', '#3f5a4a'];
  const c = colors[Math.floor(hash01(seed, 1) * colors.length)];
  const r = roofs[Math.floor(hash01(seed, 2) * roofs.length)];
  const tall = hash01(seed, 4) > 0.75;
  const h = tall ? 1.1 : 0.5;
  return (
    <g>
      <Box x={x + 0.15} y={y + 0.15} w={0.7} d={0.7} h={h} c={c} sw={0.45} />
      {tall ? (
        <Box x={x + 0.25} y={y + 0.25} z={h} w={0.3} d={0.3} h={0.12} c="#8a95a8" sw={0.4} />
      ) : (
        <Gable x={x + 0.1} y={y + 0.1} z={h} w={0.8} d={0.8} h={0.35} c={r} axis={hash01(seed, 5) > 0.5 ? 'x' : 'y'} />
      )}
    </g>
  );
}

function Boat({ x, y, c = '#e9eef7' }: { x: number; y: number; c?: string }) {
  const [px, py] = P(x, y);
  return (
    <g transform={`translate(${px} ${py})`}>
      <path d="M-9 0 L9 -4 L7 2 L-7 5 Z" fill="#7a2f2f" stroke="#0c1525" strokeWidth="0.5" />
      <path d="M-4 -1 L4 -3 L4 -7 L-4 -5 Z" fill={c} stroke="#0c1525" strokeWidth="0.5" />
      <path d="M-14 5 Q-6 8 4 5" stroke="#cfe6ff" strokeWidth="0.8" fill="none" opacity="0.6" />
    </g>
  );
}

/** Pill label with an optional gold coin badge. */
export function MapLabel({ x, y, text, badge, active }: { x: number; y: number; text: string; badge?: string; active?: boolean }) {
  const w = Math.max(48, text.length * 5.8 + 16);
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <rect x={-w / 2} y="-9" width={w} height="17" rx="5" fill={active ? '#0b1424' : '#0b1424cc'} stroke={active ? '#e3b04b' : '#3a5079'} strokeWidth="1" />
      <text textAnchor="middle" y="3.5" fontSize="9.5" fontWeight="700" fill={active ? '#e9eef7' : '#b7c3d6'}>{text}</text>
      {badge && (
        <g transform={`translate(${w / 2 - 1} -9)`}>
          <circle r="7" fill="#e3b04b" stroke="#9c7320" strokeWidth="1.2" />
          <circle r="4.8" fill="none" stroke="#9c7320" strokeWidth="0.6" />
          <text y="3" textAnchor="middle" fontSize="8" fontWeight="900" fill="#241803">{badge}</text>
        </g>
      )}
    </g>
  );
}

/** City-as-dashboard: an isometric diorama with tappable company buildings. */
export interface CityFx { pops: Pop[]; upgraded: Record<string, number>; day: number; level: number }

const short = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);

/** A tower crane that swings for a few days after an upgrade. */
function Crane({ x, y }: { x: number; y: number }) {
  const [bx, by] = P(x, y, 0);
  const [tx, ty] = P(x, y, 5.2);
  return (
    <g pointerEvents="none">
      <line x1={bx} y1={by} x2={tx} y2={ty} stroke="#e3b04b" strokeWidth="1.6" />
      <line x1={bx - 1.5} y1={by} x2={tx - 1.5} y2={ty} stroke="#e3b04b" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
      <g className="anim-crane" style={{ transformOrigin: `${tx}px ${ty}px` }}>
        <line x1={tx - 8} y1={ty} x2={tx + 22} y2={ty - 3} stroke="#e3b04b" strokeWidth="1.4" />
        <line x1={tx + 16} y1={ty - 2.4} x2={tx + 16} y2={ty + 9} stroke="#cfd6e2" strokeWidth="0.5" />
        <rect x={tx + 14} y={ty + 9} width="4" height="3" fill="#8b93a3" />
        <rect x={tx - 9} y={ty - 1} width="4" height="4" fill="#5b6475" />
      </g>
    </g>
  );
}

/** Flags on landmark buildings: one per 5 company levels; gold from level 10. */
function Landmark({ x, y, level, heli, neon }: { x: number; y: number; level: number; heli: boolean; neon: boolean }) {
  const flags = Math.min(5, Math.floor(level / 5));
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {heli && (
        <g>
          <ellipse cx="0" cy="2" rx="9" ry="4.5" fill="#2a3242" stroke="#e9eef7" strokeWidth="0.7" />
          <text x="0" y="4" textAnchor="middle" fontSize="5.5" fontWeight="900" fill="#e9eef7">H</text>
        </g>
      )}
      {[...Array(flags)].map((_, i) => (
        <g key={i} transform={`translate(${(i - (flags - 1) / 2) * 5} 0)`}>
          <line x1="0" y1="0" x2="0" y2="-10" stroke="#cfd6e2" strokeWidth="0.7" />
          <path d="M0 -10 L5 -8.3 L0 -6.6 Z" fill={level >= 10 ? '#e3b04b' : '#d94f4f'} />
        </g>
      ))}
      {neon && <ellipse cx="0" cy="2" rx="14" ry="6" fill="none" stroke="#ff4fd8" strokeWidth="1" opacity="0.85" style={{ filter: 'drop-shadow(0 0 2px #ff4fd8)' }} />}
    </g>
  );
}

export function CityScene({ companies, onOpen, onEmpty, fx }: { companies: Company[]; onOpen: (id: string) => void; onEmpty: (ind: IndustryId) => void; fx?: CityFx }) {
  const items: { depth: number; node: ReactNode }[] = [];
  // Filler: trees and houses outside plots
  for (let x = 0; x < G; x++) {
    for (let y = 0; y < G; y++) {
      if (isRoad(x, y) || isWater(x, y) || inPlot(x, y)) continue;
      const r = hash01(x, y, 17);
      const inner = x >= O && y >= O && x < O + 13 && y < O + 13;
      if (r < (inner ? 0.16 : 0.1)) items.push({ depth: x + y + 1, node: <House key={`h${x}-${y}`} x={x} y={y} seed={x * 31 + y} /> });
      else if (r < 0.75) {
        items.push({ depth: x + y + 0.3, node: <Tree key={`t${x}-${y}`} x={x + 0.3 + hash01(x, y, 3) * 0.4} y={y + 0.3 + hash01(x, y, 4) * 0.4} seed={x * 7 + y} s={0.85 + hash01(x, y) * 0.35} /> });
        if (hash01(x, y, 9) > 0.6) items.push({ depth: x + y + 0.8, node: <Tree key={`u${x}-${y}`} x={x + 0.75} y={y + 0.7} seed={x * 13 + y} s={0.75} /> });
      }
    }
  }
  // Trees ringing each plot
  for (const p of PLOTS) {
    for (const [dx, dy] of [[-0.25, -0.25], [3.2, -0.25], [-0.25, 3.2], [3.25, 3.25], [1.5, -0.3], [-0.3, 1.5]]) {
      items.push({ depth: p.x + dx + p.y + dy, node: <Tree key={`pt${p.ind}${dx}${dy}`} x={p.x + dx} y={p.y + dy} seed={Math.round((p.x + dx) * 10 + dy)} s={0.9} /> });
    }
  }
  // Cars
  const cars: [number, number, string, 'x' | 'y'][] = [[O + 2, O + 4.1, '#d94f4f', 'x'], [O + 9.5, O + 1, '#e3b04b', 'y'], [O + 6, O + 9.55, '#4a8fe0', 'x'], [O + 4.55, O + 7, '#e9eef7', 'y'], [O + 1, O + 9.1, '#3dbb6c', 'x']];
  cars.forEach(([x, y, c, a], i) => items.push({ depth: x + y + 0.5, node: <Car key={`car${i}`} x={x} y={y} c={c} axis={a} /> }));

  // Player buildings
  const labels: ReactNode[] = [];
  for (const plot of PLOTS) {
    const mine = companies.filter((c) => c.industry === plot.ind && !c.bankrupt).sort((a, b) => b.level - a.level);
    const top = mine[0];
    const [tx, ty] = P(plot.x, plot.y);
    const open = () => (top ? onOpen(top.id) : onEmpty(plot.ind));
    items.push({
      depth: plot.x + plot.y + 3,
      node: (
        <g
          key={plot.ind}
          transform={`translate(${tx} ${ty})`}
          role="button"
          tabIndex={0}
          aria-label={top ? `Open ${top.name}` : `Found a ${plot.label} company`}
          className="cursor-pointer iso-hit"
          onClick={open}
          onKeyDown={(e) => e.key === 'Enter' && open()}
        >
          <polygon points={pts(P(0, 0, 0), P(3, 0, 0), P(3, 3, 0), P(0, 3, 0))} fill="transparent" />
          {top && fx && fx.level >= 12 && <polygon points={pts(P(-0.1, -0.1, 0), P(3.1, -0.1, 0), P(3.1, 3.1, 0), P(-0.1, 3.1, 0))} fill="none" stroke="#e3b04b" strokeWidth="1.2" />}
          {top ? <IndustryBuilding industry={plot.ind} level={top.level} /> : <EmptyPlot />}
        </g>
      ),
    });
    if (fx && mine.some((c) => fx.day - (fx.upgraded[c.id] ?? -99) <= 3)) {
      items.push({ depth: plot.x + plot.y + 3.2, node: <Crane key={`cr${plot.ind}`} x={plot.x + 2.7} y={plot.y + 0.3} /> });
    }
    const z = top ? topZ(plot.ind, top.level) : 1.5;
    const [lx, ly] = P(plot.x + 1.5, plot.y + 1.5, z);
    const heli = !!fx && fx.level >= 15 && !!top && top.level >= 8;
    if (top && (top.level >= 5 || heli)) {
      items.push({ depth: plot.x + plot.y + 3.1, node: <Landmark key={`lm${plot.ind}`} x={lx} y={ly + 4} level={top.level} heli={heli} neon={!!fx && fx.level >= 20} /> });
    }
    labels.push(<MapLabel key={`l${plot.ind}`} x={lx} y={ly - 8} text={top ? `${mine.length > 1 ? '★ ' : ''}${top.name}` : plot.label} badge={top ? String(top.level) : '+'} active={!!top} />);
    const pops = fx ? fx.pops.filter((x) => mine.some((c) => c.id === x.companyId)) : [];
    const pop = pops.find((x) => x.kind === 'record') ?? pops[0];
    if (pop && fx) {
      labels.push(
        <g key={`pop${plot.ind}${fx.day}`} transform={`translate(${lx} ${ly - 22})`} pointerEvents="none">
          <g className="anim-float">
            <text textAnchor="middle" fontSize={pop.kind === 'record' ? 11 : 9.5} fontWeight="900" fill={pop.kind === 'record' ? '#f0c565' : '#5fe08f'} stroke="#0b1424" strokeWidth="2.4" paintOrder="stroke">
              {pop.kind === 'record' ? '★ ' : '+'}{short(pop.amount)}
            </text>
          </g>
        </g>,
      );
    }
  }
  items.sort((a, b) => a.depth - b.depth);

  const waves: ReactNode[] = [];
  for (let i = 0; i < 26; i++) {
    const x = O + 10 + hash01(i, 1) * 10;
    const y = O + 5 + hash01(i, 2) * 12;
    const [wx, wy] = P(x, y);
    waves.push(<path key={i} d={`M${wx - 5} ${wy} q2.5 -2 5 0 t5 0`} stroke="#8cc4ef" strokeWidth="0.8" fill="none" opacity="0.5" />);
  }
  const grassPatches: ReactNode[] = [];
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash01(i, 5) * G);
    const y = Math.floor(hash01(i, 6) * G);
    if (isRoad(x, y) || isWater(x, y)) continue;
    grassPatches.push(<polygon key={i} points={pts(P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1))} fill="#4c8f55" opacity="0.5" />);
  }

  return (
    <svg viewBox="-190 -6 318 230" className="w-full block" role="group" aria-label="Your city">
      <defs>
        <linearGradient id="city-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15304f" />
          <stop offset="1" stopColor="#1e4a3c" />
        </linearGradient>
      </defs>
      <rect x="-190" y="-6" width="318" height="230" fill="url(#city-sky)" />
      {/* ground */}
      <polygon points={pts(P(0, 0), P(G, 0), P(G, G), P(0, G))} fill="#3f7d4a" />
      {grassPatches}
      {/* roads */}
      {ROADS.map((c) => (
        <g key={`rx${c}`}>
          <polygon points={pts(P(c, 0), P(c + 1, 0), P(c + 1, G), P(c, G))} fill="#3a4254" stroke="#8b93a3" strokeWidth="0.6" />
          <polygon points={pts(P(0, c), P(G, c), P(G, c + 1), P(0, c + 1))} fill="#3a4254" stroke="#8b93a3" strokeWidth="0.6" />
        </g>
      ))}
      {ROADS.map((c) => (
        <g key={`rl${c}`} stroke="#e9eef7" strokeWidth="0.7" strokeDasharray="4 5" opacity="0.6">
          <line x1={P(c + 0.5, 0)[0]} y1={P(c + 0.5, 0)[1]} x2={P(c + 0.5, G)[0]} y2={P(c + 0.5, G)[1]} />
          <line x1={P(0, c + 0.5)[0]} y1={P(0, c + 0.5)[1]} x2={P(G, c + 0.5)[0]} y2={P(G, c + 0.5)[1]} />
        </g>
      ))}
      {/* sea and harbour */}
      <polygon points={pts(P(O + 10, O + 5), P(G, O + 5), P(G, G), P(O + 10, G))} fill="#22618f" />
      <polygon points={pts(P(O + 10, O + 5), P(G, O + 5), P(G, O + 5.25), P(O + 10.25, O + 5.25), P(O + 10.25, G), P(O + 10, G))} fill="#d8c38f" />
      {waves}
      <Box x={O + 10.3} y={O + 7} w={2.2} d={0.4} h={0.12} c="#8a6a4a" sw={0.4} />
      <Box x={O + 10.3} y={O + 11} w={1.6} d={0.4} h={0.12} c="#8a6a4a" sw={0.4} />
      <Boat x={O + 12.5} y={O + 8.2} />
      <Boat x={O + 11.6} y={O + 12.3} c="#e3b04b" />
      <Boat x={O + 15} y={O + 10} c="#9fd0ff" />
      {items.map((i) => i.node)}
      {labels}
      {/* soft vignette */}
      <rect x="-190" y="-6" width="318" height="230" fill="url(#city-vig)" pointerEvents="none" />
      <defs>
        <radialGradient id="city-vig" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export { K, shade };
