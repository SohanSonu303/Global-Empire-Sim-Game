/**
 * Plants for the Phase 4 goods (3x3 tile footprint, like plants.tsx). Each grows a little with level.
 */
import type { ReactNode } from 'react';
import { Box, Car, Cyl, Gable, OUTLINE, P, Person, Smoke, Tile, Tree, Windows, faceQuad, pts, shade } from './iso';

const lvl = (level: number, min: number, max: number, per: number) => Math.min(max, min + Math.floor((level - 1) / per));

function Line({ a, b, c = '#c9d3e2', w = 1 }: { a: [number, number, number]; b: [number, number, number]; c?: string; w?: number }) {
  const [x1, y1] = P(...a);
  const [x2, y2] = P(...b);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={w} strokeLinecap="round" />;
}

/** Flat polygon at height z from grid points. */
function Flat({ p, z = 0, c, sw = 0.5 }: { p: [number, number][]; z?: number; c: string; sw?: number }) {
  return <polygon points={pts(...p.map(([x, y]) => P(x, y, z)))} fill={c} stroke={OUTLINE} strokeWidth={sw} strokeLinejoin="round" />;
}

/* ------------------------------------------------------------------ materials */

/** Aluminium smelter: long silver potline halls with fume stacks. */
export function Smelter({ level }: { level: number }) {
  const lines = lvl(level, 1, 2, 4);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7d7f86" />
      {Array.from({ length: lines }, (_, i) => (
        <g key={i}>
          <Box x={0.2} y={0.3 + i * 0.85} w={2.3} d={0.65} h={0.6} c="#c9d0da" />
          <Windows face="left" x={0.2} y={0.3 + i * 0.85} w={2.3} d={0.65} h={0.6} rows={1} cols={7} color="#ffb766" dark="#3a3440" my={0.2} seed={70 + i} litRatio={0.8} />
          <Box x={0.3} y={0.38 + i * 0.85} z={0.6} w={2.1} d={0.5} h={0.1} c="#9aa6b6" />
        </g>
      ))}
      <Cyl cx={2.65} cy={0.45} r={0.14} h={2.0} c="#9aa6b6" stripes="#e9eef7" />
      <Smoke x={2.65} y={0.45} z={2.1} />
      {/* ingots */}
      {[0, 1, 2].map((i) => <Box key={i} x={0.35 + i * 0.45} y={2.3} w={0.36} d={0.4} h={0.18 + (i % 2) * 0.08} c="#e6ebf2" sw={0.4} />)}
      <Person x={2.1} y={2.6} shirt="#f0a33a" hat="#e3b04b" s={0.85} />
    </g>
  );
}

/** Battery gigafactory: clean white hall, green cell racks, a lithium silo. */
export function BatteryPlant({ level }: { level: number }) {
  const racks = lvl(level, 2, 4, 3);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8c939e" />
      <Box x={0.2} y={0.25} w={2.0} d={1.5} h={0.9} c="#eef1f5" />
      <polygon points={faceQuad('left', 0.2, 0.25, 0, 2.0, 1.5, 0.15, 1.85, 0.55, 0.75)} fill="#3dbb6c" />
      <Windows face="right" x={0.2} y={0.25} w={2.0} d={1.5} h={0.9} rows={1} cols={3} color="#cfe6ff" seed={81} my={0.3} />
      <Box x={0.4} y={0.45} z={0.9} w={1.6} d={1.1} h={0.08} c="#c9d3e2" />
      {[0, 1, 2].map((i) => <Box key={i} x={0.55 + i * 0.5} y={0.7} z={0.98} w={0.35} d={0.6} h={0.05} c="#2b3445" sw={0.3} />)}
      <Cyl cx={2.6} cy={0.6} r={0.28} h={1.1} c="#e9eef7" />
      {Array.from({ length: racks }, (_, i) => (
        <g key={i}>
          <Box x={0.35 + i * 0.55} y={2.1} w={0.4} d={0.55} h={0.4} c="#5fd08a" sw={0.4} />
          <Box x={0.48 + i * 0.55} y={2.1} z={0.4} w={0.14} d={0.14} h={0.06} c="#2b3445" sw={0.3} />
        </g>
      ))}
      <Person x={2.5} y={2.6} shirt="#e9eef7" s={0.85} />
    </g>
  );
}

/** Cement works: preheater tower, sloping kiln, grey silos and a gravel heap. */
export function CementPlant({ level }: { level: number }) {
  const silos = lvl(level, 2, 4, 3);
  const [hx, hy] = P(2.4, 2.3, 0);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#a9a294" />
      <Box x={0.3} y={0.3} w={0.7} d={0.7} h={2.1} c="#b8b2a6" />
      <Windows face="left" x={0.3} y={0.3} w={0.7} d={0.7} h={2.1} rows={4} cols={1} color="#ffb766" dark="#4a4038" seed={91} />
      <Smoke x={0.65} y={0.65} z={2.2} />
      {/* kiln: a fat pipe sloping down from the tower */}
      <Line a={[1.0, 0.75, 1.0]} b={[2.4, 0.75, 0.35]} c="#7a6a62" w={7} />
      <Line a={[1.0, 0.75, 1.0]} b={[2.4, 0.75, 0.35]} c="#9a8a7a" w={4.5} />
      {[1.4, 1.95].map((x) => <Box key={x} x={x} y={0.65} w={0.15} d={0.2} h={0.6} c="#6a6f7a" sw={0.4} />)}
      {Array.from({ length: silos }, (_, i) => <Cyl key={i} cx={0.45 + i * 0.5} cy={1.75} r={0.22} h={1.2} c="#cfcac0" stripes="#b7b0a2" />)}
      <path d={`M${hx - 13} ${hy} Q${hx} ${hy - 18} ${hx + 13} ${hy} Z`} fill="#ddd6c6" stroke={OUTLINE} strokeWidth="0.5" />
      <Person x={1.3} y={2.7} shirt="#f0a33a" hat="#e3b04b" s={0.85} />
    </g>
  );
}

/** Water works: round settling pools, a pump house and a water tower. */
export function WaterWorks({ level }: { level: number }) {
  const pools = lvl(level, 2, 3, 4);
  const spots: [number, number][] = [[0.75, 0.75], [1.95, 0.75], [0.75, 1.95]];
  const tw = 1.4 + Math.min(0.6, level * 0.05);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7f8f78" />
      {spots.slice(0, pools).map(([x, y], i) => {
        const [cx, cy] = P(x, y, 0.12);
        return (
          <g key={i}>
            <Cyl cx={x} cy={y} r={0.5} h={0.12} c="#c9d3e2" top="#4fb3ff" />
            <ellipse cx={cx} cy={cy} rx={6} ry={3} fill="none" stroke="#bfe6ff" strokeWidth="0.8" className="iso-spin" style={{ transformOrigin: `${cx}px ${cy}px` }} />
          </g>
        );
      })}
      <Box x={1.7} y={1.7} w={0.8} d={0.6} h={0.5} c="#d8e2ee" />
      <Door x={1.7} y={1.7} w={0.8} d={0.6} u0={0.3} u1={0.5} />
      {/* water tower */}
      {[[2.45, 2.35], [2.85, 2.35], [2.85, 2.75], [2.45, 2.75]].map(([x, y], i) => <Line key={i} a={[x, y, 0]} b={[2.65, 2.55, tw]} c="#7c8494" w={1} />)}
      <Cyl cx={2.65} cy={2.55} z={tw} r={0.3} h={0.45} c="#4fb3ff" top="#9fd6ff" />
      <Person x={1.1} y={2.8} shirt="#4a8fe0" s={0.85} />
    </g>
  );
}

function Door({ x, y, w, d, u0, u1, h = 0.4 }: { x: number; y: number; w: number; d: number; u0: number; u1: number; h?: number }) {
  return <polygon points={faceQuad('left', x, y, 0, w, d, u0, u1, 0, h)} fill="#2b2f38" stroke={OUTLINE} strokeWidth="0.5" />;
}

/** Builders' yard: a half-built frame, a tower crane, a mixer truck and materials. */
export function BuildersYard({ level }: { level: number }) {
  const floors = lvl(level, 2, 4, 3);
  const fh = 0.42;
  const top = floors * fh;
  const cols: ReactNode[] = [];
  for (const [x, y] of [[0.4, 0.4], [1.5, 0.4], [1.5, 1.4], [0.4, 1.4]] as [number, number][]) cols.push(<Line key={`${x}${y}`} a={[x, y, 0]} b={[x, y, top]} c="#e3b04b" w={1.6} />);
  const slabs: ReactNode[] = [];
  for (let i = 1; i <= floors; i++) slabs.push(<Box key={i} x={0.4} y={0.4} z={i * fh - 0.05} w={1.1} d={1.0} h={0.05} c="#b8b2a6" sw={0.4} />);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#9c8b6e" />
      <Box x={0.4} y={0.4} w={1.1} d={1.0} h={fh} c="#cfc6b4" />
      {cols}
      {slabs}
      {/* tower crane */}
      <Line a={[2.3, 0.5, 0]} b={[2.3, 0.5, top + 1.2]} c="#e3b04b" w={2} />
      <Line a={[2.3, 0.5, top + 1.2]} b={[0.6, 0.5, top + 1.2]} c="#e3b04b" w={1.6} />
      <Line a={[2.3, 0.5, top + 1.2]} b={[2.9, 0.5, top + 1.2]} c="#e3b04b" w={1.6} />
      <Box x={2.75} y={0.4} z={top + 1.0} w={0.2} d={0.2} h={0.2} c="#6a6f7a" sw={0.4} />
      <Line a={[1.0, 0.5, top + 1.2]} b={[1.0, 0.5, top + 0.4]} c="#3a3f4a" w={0.6} />
      {/* mixer truck and materials */}
      <Box x={1.9} y={2.1} w={0.7} d={0.38} h={0.3} c="#e9eef7" sw={0.4} />
      <Cyl cx={2.05} cy={2.3} z={0.3} r={0.17} h={0.22} c="#f0a33a" />
      {[0, 1].map((i) => <Box key={i} x={0.3 + i * 0.5} y={2.25} w={0.4} d={0.4} h={0.2} c={i ? '#9aa6b6' : '#c9844a'} sw={0.4} />)}
      <Person x={1.4} y={2.6} shirt="#f0a33a" hat="#e3b04b" s={0.85} />
    </g>
  );
}

/* ------------------------------------------------------------------ products and services */

/** Real estate: apartment and office towers that rise with level. */
export function Towers({ level }: { level: number }) {
  const h1 = 1.4 + Math.min(2.2, level * 0.2);
  const h2 = h1 * 0.7;
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8f9a8a" />
      <Box x={0.3} y={0.3} w={1.1} d={1.1} h={h1} c="#5a7fa8" />
      <Windows face="left" x={0.3} y={0.3} w={1.1} d={1.1} h={h1} rows={Math.round(h1 / 0.3)} cols={3} color="#cfe6ff" dark="#22385a" seed={101} />
      <Windows face="right" x={0.3} y={0.3} w={1.1} d={1.1} h={h1} rows={Math.round(h1 / 0.3)} cols={3} color="#a8c9e8" dark="#1d3150" seed={102} />
      <Box x={0.5} y={0.5} z={h1} w={0.7} d={0.7} h={0.15} c="#9aa6b6" />
      <Box x={1.65} y={1.0} w={1.05} d={1.0} h={h2} c="#e3d3b8" />
      <Windows face="left" x={1.65} y={1.0} w={1.05} d={1.0} h={h2} rows={Math.round(h2 / 0.3)} cols={3} color="#ffe08a" dark="#4a3f30" seed={103} />
      <Windows face="right" x={1.65} y={1.0} w={1.05} d={1.0} h={h2} rows={Math.round(h2 / 0.3)} cols={3} color="#f0d070" dark="#3f352a" seed={104} />
      <Tree x={0.5} y={2.5} s={0.8} seed={3} />
      <Tree x={1.1} y={2.7} s={0.7} seed={5} />
      <Car x={2.0} y={2.5} c="#4a8fe0" />
      <Person x={1.5} y={2.5} shirt="#d0679a" s={0.85} />
    </g>
  );
}

/** Online store: a huge flat fulfilment centre, parcels and delivery vans. */
export function Fulfillment({ level }: { level: number }) {
  const vans = lvl(level, 1, 3, 3);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7d7a73" />
      <Box x={0.2} y={0.2} w={2.6} d={1.6} h={0.75} c="#dfe3ea" />
      <polygon points={faceQuad('left', 0.2, 0.2, 0, 2.6, 1.6, 0.1, 2.5, 0.5, 0.68)} fill="#f0a33a" />
      {[0, 1, 2, 3, 4].map((i) => <polygon key={i} points={faceQuad('left', 0.2, 0.2, 0, 2.6, 1.6, 0.2 + i * 0.48, 0.55 + i * 0.48, 0, 0.42)} fill="#4b5263" stroke={OUTLINE} strokeWidth="0.4" />)}
      <Box x={0.35} y={0.35} z={0.75} w={2.3} d={1.3} h={0.04} c="#b7c0ce" />
      {[0, 1, 2].map((i) => <Box key={i} x={0.6 + i * 0.7} y={0.6} z={0.79} w={0.4} d={0.8} h={0.03} c="#2b3445" sw={0.3} />)}
      {Array.from({ length: vans }, (_, i) => (
        <g key={i}>
          <Box x={0.35 + i * 0.75} y={2.15} w={0.35} d={0.6} h={0.36} c="#e9eef7" sw={0.4} />
          <polygon points={faceQuad('left', 0.35 + i * 0.75, 2.15, 0, 0.35, 0.6, 0.05, 0.3, 0.18, 0.26)} fill="#f0a33a" />
        </g>
      ))}
      {[0, 1, 2].map((i) => <Box key={i} x={2.45 + (i % 2) * 0.22} y={2.3 + Math.floor(i / 2) * 0.22} z={0} w={0.18} d={0.18} h={0.16} c="#c9944a" sw={0.3} />)}
      <Person x={2.3} y={2.85} shirt="#4a8fe0" s={0.85} />
    </g>
  );
}

/** Robot works: assembly hall with an orange robot arm out front. */
export function RobotWorks({ level }: { level: number }) {
  const arms = lvl(level, 1, 2, 4);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7f8898" />
      <Box x={0.25} y={0.3} w={2.5} d={1.3} h={0.85} c="#c9d0da" />
      <Windows face="left" x={0.25} y={0.3} w={2.5} d={1.3} h={0.85} rows={1} cols={6} color="#9fd0ff" dark="#2b3445" my={0.28} seed={111} />
      <Gable x={0.25} y={0.3} z={0.85} w={2.5} d={1.3} h={0.28} c="#8b93a3" axis="x" />
      {Array.from({ length: arms }, (_, i) => {
        const x = 0.8 + i * 1.2;
        return (
          <g key={i}>
            <Cyl cx={x} cy={2.2} r={0.22} h={0.2} c="#3a4254" />
            <Line a={[x, 2.2, 0.2]} b={[x + 0.15, 2.0, 0.95]} c="#f0a33a" w={4} />
            <Line a={[x + 0.15, 2.0, 0.95]} b={[x + 0.6, 2.15, 0.75]} c="#f0a33a" w={3.2} />
            <Line a={[x + 0.6, 2.15, 0.75]} b={[x + 0.65, 2.2, 0.5]} c="#3a4254" w={1.6} />
            <Box x={x + 0.45} y={2.35} w={0.4} d={0.3} h={0.2} c="#9aa6b6" sw={0.4} />
          </g>
        );
      })}
      <circle cx={P(2.75, 1.0, 1.0)[0]} cy={P(2.75, 1.0, 1.0)[1]} r="1.6" fill="#3dbb6c" className="iso-blink" />
      <Person x={2.6} y={2.8} shirt="#9b7be0" s={0.85} />
    </g>
  );
}

/** Space launch site: rocket on the pad, service tower and fuel tanks. */
export function LaunchPad({ level }: { level: number }) {
  const rh = 2.4 + Math.min(1.2, level * 0.1);
  const [nx, ny] = P(1.5, 1.5, rh);
  const rx = 0.2 * 14 * Math.SQRT2;
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8a8578" />
      <Box x={0.9} y={0.9} w={1.2} d={1.2} h={0.25} c="#9aa0aa" />
      {/* service tower */}
      <Box x={0.55} y={1.25} w={0.3} d={0.3} h={rh + 0.2} c="#d8434e" left="#c03a44" right="#9a2e36" sw={0.5} />
      {[0.5, 1.2, 1.9].map((z) => <Line key={z} a={[0.85, 1.4, z]} b={[1.3, 1.45, z]} c="#d8434e" w={1.4} />)}
      {/* rocket */}
      <Cyl cx={1.5} cy={1.5} z={0.25} r={0.2} h={rh - 0.25} c="#f2f4f8" stripes="#2b3445" />
      <path d={`M${nx - rx} ${ny} Q${nx - rx * 0.6} ${ny - 16} ${nx} ${ny - 22} Q${nx + rx * 0.6} ${ny - 16} ${nx + rx} ${ny} Z`} fill="#e9eef7" stroke={OUTLINE} strokeWidth="0.6" />
      {[[-1, 0], [1, 0]].map(([s], i) => {
        const [bx, by] = P(1.5, 1.5, 0.3);
        return <polygon key={i} points={`${bx + s * rx},${by - 16} ${bx + s * (rx + 6)},${by} ${bx + s * rx},${by - 2}`} fill="#d8434e" stroke={OUTLINE} strokeWidth="0.5" />;
      })}
      {/* fuel tanks */}
      {[0, 1].map((i) => <Cyl key={i} cx={2.45} cy={0.45 + i * 0.6} r={0.24} h={0.5} c="#e9eef7" top="#f6f7fa" />)}
      <Box x={0.25} y={2.35} w={0.8} d={0.5} h={0.4} c="#4a6fa5" />
      <Windows face="left" x={0.25} y={2.35} w={0.8} d={0.5} h={0.4} rows={1} cols={3} color="#cfe6ff" seed={121} />
      <Person x={2.4} y={2.6} shirt="#e9eef7" s={0.85} />
    </g>
  );
}

/** Defense works: camouflaged hangar, radar dish and an armoured vehicle. */
export function Hangar({ level }: { level: number }) {
  const halls = lvl(level, 1, 2, 4);
  const [dx, dy] = P(2.5, 0.5, 1.5);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#6f7a5e" />
      {Array.from({ length: halls }, (_, i) => (
        <g key={i}>
          <Box x={0.25 + i * 0.05} y={0.4 + i * 1.0} w={1.8} d={0.85} h={0.45} c="#5f6f4a" />
          <Gable x={0.25 + i * 0.05} y={0.4 + i * 1.0} z={0.45} w={1.8} d={0.85} h={0.35} c="#4f5d3e" axis="x" />
          <polygon points={faceQuad('left', 0.25 + i * 0.05, 0.4 + i * 1.0, 0, 1.8, 0.85, 0.5, 1.3, 0, 0.42)} fill="#2b2f38" stroke={OUTLINE} strokeWidth="0.4" />
        </g>
      ))}
      {/* radar */}
      <Line a={[2.5, 0.5, 0]} b={[2.5, 0.5, 1.4]} c="#9aa6b6" w={1.6} />
      <ellipse cx={dx} cy={dy} rx={9} ry={5} fill="#e9eef7" stroke={OUTLINE} strokeWidth="0.6" transform={`rotate(-25 ${dx} ${dy})`} />
      {/* armoured vehicle */}
      <Box x={1.9} y={2.2} w={0.75} d={0.45} h={0.25} c="#6b7a52" sw={0.5} />
      <Box x={2.05} y={2.3} z={0.25} w={0.4} d={0.28} h={0.15} c="#5f6f4a" sw={0.4} />
      <Line a={[2.25, 2.44, 0.33]} b={[2.25, 3.0, 0.36]} c="#3a4230" w={1.4} />
      <Person x={1.2} y={2.7} shirt="#5f6f4a" hat="#4f5d3e" s={0.85} />
    </g>
  );
}

/** Airline hub: terminal, control tower and a plane on the apron. */
export function Airport({ level }: { level: number }) {
  const planes = lvl(level, 1, 2, 4);
  const towerH = 1.5 + Math.min(0.6, level * 0.05);
  const plane = (ox: number, oy: number, c: string, k: number) => (
    <g key={k}>
      <Flat p={[[ox + 0.65, oy - 0.25], [ox + 1.0, oy - 0.25], [ox + 1.1, oy + 1.05], [ox + 0.75, oy + 1.05]]} z={0.22} c={shade(c, 1)} />
      <Box x={ox} y={oy + 0.28} z={0.1} w={1.6} d={0.26} h={0.22} c="#f2f4f8" sw={0.5} />
      <Flat p={[[ox + 1.6, oy + 0.28], [ox + 1.85, oy + 0.41], [ox + 1.6, oy + 0.54]]} z={0.21} c="#f2f4f8" />
      <Box x={ox} y={oy + 0.38} z={0.32} w={0.25} d={0.06} h={0.35} c={c} sw={0.4} />
      <polygon points={faceQuad('left', ox, oy + 0.28, 0.1, 1.6, 0.26, 0.2, 1.5, 0.12, 0.17)} fill={c} />
    </g>
  );
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#6b7280" />
      <Tile x={0.1} y={1.7} w={2.8} d={1.2} fill="#4b5263" />
      <Box x={0.2} y={0.25} w={2.0} d={0.9} h={0.55} c="#dfe5ec" />
      <polygon points={faceQuad('left', 0.2, 0.25, 0, 2.0, 0.9, 0.1, 1.9, 0.12, 0.45)} fill="#5aa0d8" stroke={OUTLINE} strokeWidth="0.4" />
      <Box x={0.3} y={0.35} z={0.55} w={1.8} d={0.7} h={0.06} c="#c9d3e2" />
      <Cyl cx={2.6} cy={0.6} r={0.14} h={towerH} c="#e9eef7" />
      <Cyl cx={2.6} cy={0.6} z={towerH} r={0.26} h={0.25} c="#2b3445" top="#5aa0d8" />
      {Array.from({ length: planes }, (_, i) => plane(0.35 + i * 0.6, 1.85 + i * 0.55, i ? '#d8434e' : '#4a8fe0', i))}
      <Person x={2.6} y={1.5} shirt="#f0a33a" hat="#e3b04b" s={0.8} />
    </g>
  );
}

/** Wellness: a low spa with a pool, loungers and palms. */
export function Spa({ level }: { level: number }) {
  const floors = lvl(level, 1, 3, 4);
  const h = 0.45 * floors;
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8fae86" />
      <Box x={0.3} y={0.3} w={1.8} d={1.0} h={h} c="#f2ece0" />
      <Windows face="left" x={0.3} y={0.3} w={1.8} d={1.0} h={h} rows={floors} cols={4} color="#ffe6b8" dark="#5a4a3a" seed={131} />
      <Box x={0.2} y={0.2} z={h} w={2.0} d={1.2} h={0.08} c="#c9a27a" />
      <Box x={0.6} y={1.7} w={1.6} d={0.9} h={0.08} c="#e9e4d8" />
      <Tile x={0.7} y={1.8} w={1.4} d={0.7} fill="#4fb3ff" stroke="#bfe6ff" />
      {[0, 1].map((i) => <Box key={i} x={2.35} y={1.8 + i * 0.4} w={0.45} d={0.18} h={0.08} c="#f6f7fa" sw={0.3} />)}
      <Tree x={2.6} y={0.6} s={0.85} seed={7} />
      <Tree x={0.35} y={2.7} s={0.75} seed={9} />
      <Person x={1.6} y={2.8} shirt="#e9eef7" s={0.85} />
      <Smoke x={2.0} y={0.5} z={h + 0.1} delay={1} />
    </g>
  );
}
