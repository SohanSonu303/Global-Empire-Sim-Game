/** Isometric industry buildings on a 3x3 tile footprint. They grow with company level. */
import type { ReactNode } from 'react';
import type { IndustryId } from '../../engine/types';
import { Box, Cyl, Gable, OUTLINE, P, Person, Smoke, Tile, Windows, faceQuad, pts, shade } from './iso';

const lvl = (level: number, min: number, max: number, per: number) => Math.min(max, min + Math.floor((level - 1) / per));

export function TechTower({ level = 1 }: { level?: number }) {
  const floors = lvl(level, 5, 14, 1);
  const h = floors * 0.42;
  const sideFloors = Math.max(3, Math.floor(floors * 0.55));
  const sh = sideFloors * 0.42;
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8995a8" />
      <Box x={0.25} y={0.25} w={2.5} d={2.5} h={0.45} c="#a9b6c8" />
      <Windows face="left" x={0.25} y={0.25} w={2.5} d={2.5} h={0.45} rows={1} cols={6} color="#cfe6ff" seed={2} litRatio={1} />
      {/* main tower */}
      <Box x={0.45} y={0.45} z={0.45} w={1.45} d={1.45} h={h} c="#356cb8" />
      <Windows face="left" x={0.45} y={0.45} z={0.45} w={1.45} d={1.45} h={h} rows={floors} cols={5} color="#a9d6ff" dark="#22487e" seed={level} />
      <Windows face="right" x={0.45} y={0.45} z={0.45} w={1.45} d={1.45} h={h} rows={floors} cols={5} color="#7fb6ef" dark="#1b3a66" seed={level + 9} />
      <Box x={0.75} y={0.75} z={0.45 + h} w={0.8} d={0.8} h={0.3} c="#7c8ba3" />
      <line x1={P(1.15, 1.15, 0.75 + h)[0]} y1={P(1.15, 1.15, 0.75 + h)[1]} x2={P(1.15, 1.15, 1.6 + h)[0]} y2={P(1.15, 1.15, 1.6 + h)[1]} stroke="#c9d3e2" strokeWidth="1.2" />
      <circle cx={P(1.15, 1.15, 1.6 + h)[0]} cy={P(1.15, 1.15, 1.6 + h)[1]} r="1.6" fill="#e2574c" className="iso-blink" />
      {/* side tower */}
      <Box x={1.95} y={0.45} z={0.45} w={0.8} d={1.2} h={sh} c="#2f5fa3" />
      <Windows face="left" x={1.95} y={0.45} z={0.45} w={0.8} d={1.2} h={sh} rows={sideFloors} cols={3} color="#a9d6ff" dark="#1f4275" seed={level + 3} />
      <Windows face="right" x={1.95} y={0.45} z={0.45} w={0.8} d={1.2} h={sh} rows={sideFloors} cols={4} color="#7fb6ef" dark="#183660" seed={level + 4} />
      {/* entrance canopy */}
      <Box x={0.7} y={1.9} z={0.45} w={0.9} d={0.5} h={0.08} c="#e3b04b" />
    </g>
  );
}

export function Factory({ level = 1, smoke = true }: { level?: number; smoke?: boolean }) {
  const chimneys = lvl(level, 1, 3, 3);
  const tanks = lvl(level, 0, 2, 4);
  const ch = 2.0 + Math.min(1.5, level * 0.1);
  const out: ReactNode[] = [];
  for (let i = 0; i < chimneys; i++) {
    const cx = 0.55 + i * 0.55;
    out.push(<Cyl key={`c${i}`} cx={cx} cy={0.45} r={0.17} h={ch} c="#b44a3a" stripes="#e9eef7" />);
    if (smoke) out.push(<Smoke key={`s${i}`} x={cx} y={0.45} z={ch + 0.1} delay={i * 0.7} />);
  }
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7d7a73" />
      {out}
      {/* main hall with sawtooth roof */}
      <Box x={0.2} y={0.85} w={2.2} d={1.9} h={0.95} c="#b65a3c" />
      <Windows face="left" x={0.2} y={0.85} w={2.2} d={1.9} h={0.95} rows={1} cols={5} color="#f6d98a" dark="#4a2a1c" my={0.3} seed={5} />
      <polygon points={faceQuad('right', 0.2, 0.85, 0, 2.2, 1.9, 0.5, 1.3, 0, 0.62)} fill="#3a2a22" stroke={OUTLINE} strokeWidth="0.5" />
      {[0, 1, 2].map((i) => (
        <Gable key={i} x={0.2 + i * 0.733} y={0.85} z={0.95} w={0.733} d={1.9} h={0.35} c="#8f8f98" axis="y" />
      ))}
      {tanks > 0 && <Cyl cx={2.6} cy={0.7} r={0.24} h={0.7} c="#9aa6b6" />}
      {tanks > 1 && <Cyl cx={2.6} cy={1.25} r={0.2} h={0.55} c="#9aa6b6" />}
      {/* office annex */}
      <Box x={2.4} y={1.6} w={0.5} d={1.15} h={0.7} c="#c9c1b4" />
      <Windows face="left" x={2.4} y={1.6} w={0.5} d={1.15} h={0.7} rows={2} cols={1} color="#cfe6ff" seed={8} />
      <Person x={1.5} y={2.95} shirt="#e3b04b" hat="#f0c565" s={0.9} />
    </g>
  );
}

function Derrick({ x, y, h }: { x: number; y: number; h: number }) {
  const b = 0.38;
  const legs = [P(x - b, y - b), P(x + b, y - b), P(x + b, y + b), P(x - b, y + b)];
  const top = P(x, y, h);
  const lines: ReactNode[] = legs.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={top[0]} y2={top[1]} />);
  for (let k = 1; k < 5; k++) {
    const t = k / 5;
    const ring = legs.map((l) => [l[0] + (top[0] - l[0]) * t, l[1] + (top[1] - l[1]) * t] as [number, number]);
    lines.push(<polygon key={`r${k}`} points={pts(...ring)} fill="none" />);
    if (k < 4) {
      const n = legs.map((l) => [l[0] + (top[0] - l[0]) * (t + 0.2), l[1] + (top[1] - l[1]) * (t + 0.2)] as [number, number]);
      lines.push(<line key={`x${k}`} x1={ring[3][0]} y1={ring[3][1]} x2={n[2][0]} y2={n[2][1]} />);
      lines.push(<line key={`y${k}`} x1={ring[2][0]} y1={ring[2][1]} x2={n[1][0]} y2={n[1][1]} />);
    }
  }
  return (
    <g stroke="#2b2e36" strokeWidth="1.1" strokeLinecap="round">
      {lines}
      <rect x={top[0] - 2} y={top[1] - 3} width="4" height="3" fill="#e2574c" stroke="none" />
    </g>
  );
}

export function OilGas({ level = 1, gas }: { level?: number; gas?: boolean }) {
  const derricks = lvl(level, 1, 2, 4);
  const tanks = lvl(level, 1, 3, 3);
  const dh = 2.6 + Math.min(1.2, level * 0.08);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#6f6a5e" />
      <Box x={0.15} y={0.15} w={2.7} d={2.7} h={0.22} c="#c9a24a" />
      {/* stripes on deck edge */}
      {[0, 1, 2, 3, 4, 5].map((i) => <polygon key={i} points={faceQuad('left', 0.15, 0.15, 0, 2.7, 2.7, i * 0.45, i * 0.45 + 0.22, 0, 0.22)} fill="#2b2e36" />)}
      {!gas && <Derrick x={0.85} y={0.85} h={dh} />}
      {!gas && derricks > 1 && <Derrick x={2.05} y={0.75} h={dh * 0.85} />}
      {gas && Array.from({ length: derricks + 1 }, (_, i) => (
        <g key={i}>
          <Box x={0.45 + i * 0.7} y={0.5} z={0.22} w={0.3} d={0.3} h={0.35} c="#e3b04b" sw={0.4} />
          <Cyl cx={0.6 + i * 0.7} cy={0.65} z={0.57} r={0.06} h={0.3} c="#d8434e" sw={0.4} />
        </g>
      ))}
      {gas && <Cyl cx={2.35} cy={0.75} z={0.22} r={0.42} h={0.75} c="#7fb7e6" top="#a9d2f2" />}
      <Box x={0.45} y={1.5} z={0.22} w={0.8} d={0.6} h={0.45} c="#4c5566" />
      <Windows face="left" x={0.45} y={1.5} z={0.22} w={0.8} d={0.6} h={0.45} rows={1} cols={2} color="#f6d98a" seed={3} />
      {[...Array(tanks)].map((_, i) => (
        <Cyl key={i} cx={1.6 + (i % 2) * 0.75} cy={1.75 + Math.floor(i / 2) * 0.7} z={0.22} r={0.3} h={0.55} c={gas ? '#bcd9f0' : '#e9eef7'} top="#f6f7fa" />
      ))}
      <line x1={P(1.25, 1.8, 0.5)[0]} y1={P(1.25, 1.8, 0.5)[1]} x2={P(1.6, 1.8, 0.5)[0]} y2={P(1.6, 1.8, 0.5)[1]} stroke="#e3b04b" strokeWidth="1.5" />
      {/* flare stack */}
      <Cyl cx={2.6} cy={2.5} z={0.22} r={0.07} h={1.3} c="#7c8494" />
      <path d={`M${P(2.6, 2.5, 1.55)[0]} ${P(2.6, 2.5, 1.55)[1]} q-3 -5 0 -9 q3 4 0 9`} fill="#f0a33a" className="iso-flame" />
    </g>
  );
}

export function Bank({ level = 1 }: { level?: number }) {
  const h = 1.0 + Math.min(0.8, Math.floor(level / 4) * 0.25);
  const cols: ReactNode[] = [];
  for (let i = 0; i < 6; i++) cols.push(<Cyl key={`l${i}`} cx={0.62 + i * 0.36} cy={2.66} z={0.38} r={0.075} h={h} c="#eef1f6" sw={0.4} />);
  const rcols: ReactNode[] = [];
  for (let i = 0; i < 5; i++) rcols.push(<Cyl key={`r${i}`} cx={2.66} cy={0.62 + i * 0.4} z={0.38} r={0.075} h={h} c="#dfe4ec" sw={0.4} />);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#9aa3b3" />
      <Box x={0} y={0} w={3} d={3} h={0.18} c="#b8c1cf" />
      <Box x={0.2} y={0.2} z={0.18} w={2.6} d={2.6} h={0.2} c="#cdd4df" />
      <Box x={0.45} y={0.45} z={0.38} w={2.05} d={2.05} h={h} c="#d4dae4" />
      <polygon points={faceQuad('left', 0.45, 0.45, 0.38, 2.05, 2.05, 0.75, 1.3, 0, 0.7)} fill="#3a4a66" stroke={OUTLINE} strokeWidth="0.5" />
      {rcols}
      {cols}
      <Box x={0.35} y={0.35} z={0.38 + h} w={2.4} d={2.4} h={0.16} c="#c3cad6" />
      <Gable x={0.35} y={0.35} z={0.54 + h} w={2.4} d={2.4} h={0.55} c="#aeb8c8" axis="y" />
      {level >= 6 && <ellipse cx={P(1.55, 1.55, 1.25 + h)[0]} cy={P(1.55, 1.55, 1.25 + h)[1]} rx="7" ry="5" fill="#e3b04b" stroke={OUTLINE} strokeWidth="0.6" />}
      <circle cx={P(1.55, 2.75, 0.85 + h)[0]} cy={P(1.55, 2.75, 0.85 + h)[1]} r="3" fill="#e3b04b" stroke={OUTLINE} strokeWidth="0.5" />
    </g>
  );
}

export function Retail({ level = 1 }: { level?: number }) {
  const floors = lvl(level, 1, 3, 4);
  const fh = 0.85;
  const h = fh * floors;
  const stripes: ReactNode[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const u0 = 0.3 + (i * 2.4) / n;
    const u1 = 0.3 + ((i + 1) * 2.4) / n;
    const a = P(u0, 2.7, 0.78), b = P(u1, 2.7, 0.78), c = P(u1, 3.05, 0.55), d = P(u0, 3.05, 0.55);
    stripes.push(<polygon key={`l${i}`} points={pts(a, b, c, d)} fill={i % 2 ? '#f4f1ea' : '#d8434e'} stroke={OUTLINE} strokeWidth="0.4" />);
  }
  for (let i = 0; i < 7; i++) {
    const u0 = 0.3 + (i * 2.4) / 7;
    const u1 = 0.3 + ((i + 1) * 2.4) / 7;
    const a = P(2.7, u0, 0.78), b = P(2.7, u1, 0.78), c = P(3.05, u1, 0.55), d = P(3.05, u0, 0.55);
    stripes.push(<polygon key={`r${i}`} points={pts(a, b, c, d)} fill={i % 2 ? '#d9d5cc' : '#b8323d'} stroke={OUTLINE} strokeWidth="0.4" />);
  }
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#a39a8c" />
      <Box x={0.3} y={0.3} w={2.4} d={2.4} h={h} c="#ece4d4" />
      <polygon points={faceQuad('left', 0.3, 0.3, 0, 2.4, 2.4, 0.15, 1.0, 0.05, 0.62)} fill="#5aa0d8" stroke={OUTLINE} strokeWidth="0.5" />
      <polygon points={faceQuad('left', 0.3, 0.3, 0, 2.4, 2.4, 1.4, 2.25, 0.05, 0.62)} fill="#5aa0d8" stroke={OUTLINE} strokeWidth="0.5" />
      <polygon points={faceQuad('left', 0.3, 0.3, 0, 2.4, 2.4, 1.05, 1.35, 0, 0.6)} fill="#2a3a58" />
      <polygon points={faceQuad('right', 0.3, 0.3, 0, 2.4, 2.4, 0.2, 2.2, 0.05, 0.62)} fill="#4a86b8" stroke={OUTLINE} strokeWidth="0.5" />
      {floors > 1 && <Windows face="left" x={0.3} y={0.3} z={fh} w={2.4} d={2.4} h={h - fh} rows={floors - 1} cols={4} color="#cfe6ff" seed={11} />}
      {floors > 1 && <Windows face="right" x={0.3} y={0.3} z={fh} w={2.4} d={2.4} h={h - fh} rows={floors - 1} cols={4} color="#a8c9e8" seed={12} />}
      {stripes.slice(n)}
      {stripes.slice(0, n)}
      <Box x={0.2} y={0.2} z={h} w={2.6} d={2.6} h={0.12} c="#c9bfae" />
      <Box x={0.7} y={1.2} z={h + 0.12} w={1.4} d={0.15} h={0.45} c="#d8434e" />
      <Box x={1.7} y={0.5} z={h + 0.12} w={0.45} d={0.45} h={0.25} c="#9aa6b6" />
      <Person x={1.0} y={3.05} shirt="#4a8fe0" s={0.85} />
      <Person x={2.3} y={3.1} shirt="#3dbb6c" s={0.85} />
    </g>
  );
}

/** Mine & farm: headframe with winding wheel, ore heaps, conveyor and a silo. */
export function Mine({ level = 1, ore = '#7b4a32', ground = '#8a7350', silo = '#d8c38f', ponds }: { level?: number; ore?: string; ground?: string; silo?: string; ponds?: string }) {
  const heaps = lvl(level, 1, 3, 3);
  const silos = lvl(level, 1, 3, 4);
  const hh = 1.9 + Math.min(1, level * 0.08);
  const [wx, wy] = P(0.9, 0.9, hh + 0.25);
  const legs = [P(0.55, 0.55), P(1.25, 0.55), P(1.25, 1.25), P(0.55, 1.25)];
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill={ground} />
      {ponds && [0, 1].map((i) => <Tile key={i} x={1.75 + i * 0.6} y={0.2} w={0.5} d={1.1} fill={i ? shade(ponds, 0.85) : ponds} stroke="#f6f7fa" />)}
      {/* headframe */}
      <g stroke="#3a3f4a" strokeWidth="1.1">
        {legs.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={wx} y2={wy + 4} />)}
      </g>
      <Box x={0.6} y={0.6} w={0.6} d={0.6} h={0.5} c="#7a6a58" />
      <circle cx={wx} cy={wy} r="5" fill="none" stroke="#c9d3e2" strokeWidth="1.4" className="iso-spin" style={{ transformOrigin: `${wx}px ${wy}px` }} />
      <line x1={wx - 5} y1={wy} x2={wx + 5} y2={wy} stroke="#c9d3e2" strokeWidth="0.8" />
      {/* conveyor to heaps */}
      <polygon points={faceQuad('left', 1.2, 1.0, 0.3, 1.4, 0.25, 0, 1.4, 0.15, 0.22)} fill="#4a4f5a" />
      {Array.from({ length: heaps }, (_, i) => {
        const [hx, hy] = P(1.9 + (i % 2) * 0.55, 1.5 + i * 0.5, 0);
        const r = 9 - i;
        return <path key={i} d={`M${hx - r} ${hy} Q${hx} ${hy - r * 1.4} ${hx + r} ${hy} Z`} fill={shade(ore, 1 - i * 0.08)} stroke={OUTLINE} strokeWidth="0.5" />;
      })}
      {Array.from({ length: silos }, (_, i) => <Cyl key={i} cx={0.45 + i * 0.5} cy={2.4} r={0.2} h={0.9 + i * 0.1} c={silo} stripes={shade(silo, 0.78)} />)}
      <Person x={1.6} y={2.7} shirt="#f0a33a" hat="#e3b04b" s={0.9} />
    </g>
  );
}

/** A cross sign on the front (left) face of a box. */
export function CrossSign({ x, y, z = 0, w, d, u, v, s = 0.32, c = '#d8434e' }: { x: number; y: number; z?: number; w: number; d: number; u: number; v: number; s?: number; c?: string }) {
  const t = s / 3;
  return (
    <g>
      <polygon points={faceQuad('left', x, y, z, w, d, u - s / 2 - 0.04, u + s / 2 + 0.04, v - s / 2 - 0.04, v + s / 2 + 0.04)} fill="#f6f7fa" stroke={OUTLINE} strokeWidth="0.4" />
      <polygon points={faceQuad('left', x, y, z, w, d, u - t / 2, u + t / 2, v - s / 2, v + s / 2)} fill={c} />
      <polygon points={faceQuad('left', x, y, z, w, d, u - s / 2, u + s / 2, v - t / 2, v + t / 2)} fill={c} />
    </g>
  );
}

/** Hospital: white blocks, red cross, ambulance bay. */
export function Hospital({ level = 1 }: { level?: number }) {
  const floors = lvl(level, 2, 5, 3);
  const h = floors * 0.4;
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#9aa3ad" />
      <Box x={0.3} y={0.3} w={1.7} d={1.8} h={h} c="#eef1f5" />
      <Windows face="left" x={0.3} y={0.3} w={1.7} d={1.8} h={h} rows={floors} cols={4} color="#bfe0ff" dark="#3c5a7a" seed={61} />
      <Windows face="right" x={0.3} y={0.3} w={1.7} d={1.8} h={h} rows={floors} cols={4} color="#a9cbe8" dark="#36506d" seed={62} />
      <Box x={0.3} y={0.3} z={h} w={1.7} d={1.8} h={0.08} c="#c9d3e2" />
      <Box x={0.8} y={0.8} z={h + 0.08} w={0.7} d={0.7} h={0.04} c="#3a4254" />
      <Box x={2.0} y={0.6} w={0.75} d={1.3} h={0.6} c="#dfe5ec" />
      <polygon points={faceQuad('right', 2.0, 0.6, 0, 0.75, 1.3, 0.3, 1.0, 0, 0.42)} fill="#3a4254" />
      <CrossSign x={0.3} y={0.3} w={1.7} d={1.8} u={0.85} v={h - 0.25} />
      <Box x={2.15} y={2.15} w={0.38} d={0.7} h={0.3} c="#f6f7fa" sw={0.4} />
      <Box x={2.15} y={2.15} z={0.3} w={0.38} d={0.12} h={0.05} c="#d8434e" sw={0.3} />
      <Person x={1.0} y={2.5} shirt="#3dbb6c" s={0.85} />
      <Person x={1.4} y={2.65} shirt="#e9eef7" s={0.85} />
    </g>
  );
}

/** Logistics depot: long warehouse with loading docks and trucks. */
export function Depot({ level = 1 }: { level?: number }) {
  const trucks = lvl(level, 1, 3, 3);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#77736a" />
      <Box x={0.25} y={0.3} w={2.5} d={1.4} h={0.85} c="#c98a3c" />
      <Gable x={0.25} y={0.3} z={0.85} w={2.5} d={1.4} h={0.25} c="#8b93a3" axis="x" />
      {[0, 1, 2, 3].map((i) => <polygon key={i} points={faceQuad('left', 0.25, 0.3, 0, 2.5, 1.4, 0.2 + i * 0.58, 0.62 + i * 0.58, 0, 0.55)} fill={i % 2 ? '#5b544a' : '#e9eef7'} stroke={OUTLINE} strokeWidth="0.4" />)}
      {Array.from({ length: trucks }, (_, i) => (
        <g key={i}>
          <Box x={0.35 + i * 0.85} y={1.95} w={0.42} d={0.75} h={0.42} c={['#e9eef7', '#e3b04b', '#4a8fe0'][i]} sw={0.4} />
          <Box x={0.37 + i * 0.85} y={2.7} w={0.38} d={0.25} h={0.3} c="#3a4254" sw={0.4} />
        </g>
      ))}
      <Person x={2.6} y={2.4} shirt="#f0a33a" hat="#e3b04b" s={0.85} />
    </g>
  );
}

export function IndustryBuilding({ industry, level = 1 }: { industry: IndustryId; level?: number }) {
  switch (industry) {
    case 'tech': return <TechTower level={level} />;
    case 'manufacturing': return <Factory level={level} />;
    case 'energy': return <OilGas level={level} />;
    case 'finance': return <Bank level={level} />;
    case 'retail': return <Retail level={level} />;
    case 'resources': return <Mine level={level} />;
    case 'health': return <Hospital level={level} />;
    case 'services': return <Depot level={level} />;
  }
}

/** Ghost plot for an industry the player hasn't entered yet. */
export function EmptyPlot() {
  const [sx, sy] = P(1.5, 1.5, 0);
  return (
    <g>
      <Tile x={0.1} y={0.1} w={2.8} d={2.8} fill="#6b5a3f" stroke="#e3b04b" />
      <polygon points={pts(P(0.4, 0.4), P(2.6, 0.4), P(2.6, 2.6), P(0.4, 2.6))} fill="none" stroke="#e3b04b" strokeWidth="0.8" strokeDasharray="3 3" />
      {[0.5, 1.4, 2.3].map((x, i) => <Box key={i} x={x} y={2.55} w={0.22} d={0.22} h={0.22} c="#f0a33a" sw={0.4} />)}
      <line x1={sx} y1={sy} x2={sx} y2={sy - 18} stroke="#5b3b23" strokeWidth="1.5" />
      <rect x={sx - 10} y={sy - 28} width="20" height="12" rx="1.5" fill="#f4f1ea" stroke={OUTLINE} strokeWidth="0.6" />
      <text x={sx} y={sy - 19.5} textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#b8323d">SALE</text>
      <circle cx={P(2.4, 1.0)[0]} cy={P(2.4, 1.0)[1]} r="2.5" fill={shade('#6b5a3f', 1.3)} />
    </g>
  );
}
