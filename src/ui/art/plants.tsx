/**
 * One isometric production plant per good (3x3 tile footprint), so every business
 * looks like what it makes. They grow a little with company level.
 */
import type { ReactNode } from 'react';
import type { GoodId } from '../../engine/types';
import { Bank, CrossSign, Depot, Hospital, Mine, OilGas } from './buildings';
import { Box, Car, Cyl, Gable, OUTLINE, P, Person, Smoke, Tile, Tree, Windows, faceQuad, pts } from './iso';
import { Airport, BatteryPlant, BuildersYard, CementPlant, Fulfillment, Hangar, LaunchPad, RobotWorks, Smelter, Spa, Towers, WaterWorks } from './plants4';

const lvl = (level: number, min: number, max: number, per: number) => Math.min(max, min + Math.floor((level - 1) / per));

/** Row of sawtooth roofs on top of a hall. */
function Sawtooth({ x, y, z, w, d, n, c }: { x: number; y: number; z: number; w: number; d: number; n: number; c: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Gable key={i} x={x + (i * w) / n} y={y} z={z} w={w / n} d={d} h={0.32} c={c} axis="y" />
      ))}
    </>
  );
}

function Chimney({ x, y, h, c = '#8a8f9a', smoke = true, delay = 0 }: { x: number; y: number; h: number; c?: string; smoke?: boolean; delay?: number }) {
  return (
    <>
      <Cyl cx={x} cy={y} r={0.14} h={h} c={c} stripes="#e9eef7" />
      {smoke && <Smoke x={x} y={y} z={h + 0.1} delay={delay} />}
    </>
  );
}

function Pipe({ a, b, z, c = '#c9d3e2', wpx = 1.6 }: { a: [number, number]; b: [number, number]; z: number; c?: string; wpx?: number }) {
  const [x1, y1] = P(a[0], a[1], z);
  const [x2, y2] = P(b[0], b[1], z);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={wpx} strokeLinecap="round" />;
}

function Door({ x, y, w, d, u0, u1, h = 0.55, face = 'left' as 'left' | 'right' }: { x: number; y: number; w: number; d: number; u0: number; u1: number; h?: number; face?: 'left' | 'right' }) {
  return <polygon points={faceQuad(face, x, y, 0, w, d, u0, u1, 0, h)} fill="#2b2f38" stroke={OUTLINE} strokeWidth="0.5" />;
}

/* ------------------------------------------------------------------ resources */

function Farm({ level, crop }: { level: number; crop: 'grain' | 'cotton' }) {
  const silos = lvl(level, 1, 3, 3);
  const field = crop === 'grain' ? '#d9b84a' : '#5f8f3e';
  const rows: ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const y = 1.55 + i * 0.22;
    const [x1, y1] = P(0.15, y, 0.02);
    const [x2, y2] = P(1.85, y, 0.02);
    rows.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={crop === 'grain' ? '#f0d878' : '#f6f4ee'} strokeWidth={crop === 'grain' ? 1.6 : 2.2} strokeDasharray={crop === 'cotton' ? '1.5 2' : undefined} strokeLinecap="round" />);
  }
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#6f8f45" />
      <Tile x={0.1} y={1.45} w={1.85} d={1.45} fill={field} />
      {rows}
      {Array.from({ length: silos }, (_, i) => <Cyl key={i} cx={2.25} cy={0.45 + i * 0.62} r={0.26} h={1.25 + i * 0.1} c="#d9dee6" top="#aeb8c8" stripes="#b7c0ce" />)}
      <Box x={0.25} y={0.3} w={1.3} d={0.95} h={0.65} c="#b8323d" />
      <Gable x={0.25} y={0.3} z={0.65} w={1.3} d={0.95} h={0.4} c="#6b3a2c" axis="x" />
      <Door x={0.25} y={0.3} w={1.3} d={0.95} u0={0.45} u1={0.85} h={0.5} />
      {crop === 'cotton' && [0, 1, 2].map((i) => <Box key={i} x={2.1 + (i % 2) * 0.4} y={2.2 + Math.floor(i / 2) * 0.4} w={0.32} d={0.32} h={0.28} c="#f6f4ee" sw={0.4} />)}
      {crop === 'grain' && <Box x={2.1} y={2.2} w={0.7} d={0.45} h={0.3} c="#e3b04b" sw={0.4} />}
      <Car x={2.1} y={1.65} c="#3dbb6c" />
      <Person x={1.0} y={2.95} shirt="#e3b04b" hat="#f0c565" s={0.85} />
    </g>
  );
}

function SiliconWorks({ level }: { level: number }) {
  const furnaces = lvl(level, 1, 2, 4);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8d8a80" />
      <path d={`M${P(0.3, 2.4)[0] - 12} ${P(0.3, 2.4)[1]} Q${P(0.3, 2.4)[0]} ${P(0.3, 2.4)[1] - 18} ${P(0.3, 2.4)[0] + 12} ${P(0.3, 2.4)[1]} Z`} fill="#e8dcb8" stroke={OUTLINE} strokeWidth="0.5" />
      {Array.from({ length: furnaces }, (_, i) => <Chimney key={i} x={0.5 + i * 0.6} y={0.45} h={2.1} c="#6a6f7a" delay={i * 0.8} />)}
      <Box x={0.9} y={0.8} w={1.8} d={1.4} h={0.95} c="#7d8796" />
      <Windows face="left" x={0.9} y={0.8} w={1.8} d={1.4} h={0.95} rows={1} cols={4} color="#ffb766" dark="#3a2f2a" my={0.3} seed={4} />
      <Windows face="right" x={0.9} y={0.8} w={1.8} d={1.4} h={0.95} rows={1} cols={3} color="#ffb766" dark="#3a2f2a" my={0.3} seed={6} />
      <Box x={1.1} y={1.0} z={0.95} w={1.4} d={1.0} h={0.12} c="#9aa6b6" />
      {[0, 1].map((i) => <Box key={i} x={1.6 + i * 0.5} y={2.45} w={0.36} d={0.36} h={0.3} c="#b9d6ee" sw={0.4} />)}
      <Person x={1.2} y={2.85} shirt="#4a8fe0" hat="#e3b04b" s={0.85} />
    </g>
  );
}

/* ------------------------------------------------------------------ energy */

function PowerPlant({ level }: { level: number }) {
  const towers = lvl(level, 1, 2, 4);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7a8290" />
      {Array.from({ length: towers }, (_, i) => (
        <g key={i}>
          <Cyl cx={0.75 + i * 0.95} cy={0.75} r={0.55 - i * 0.08} h={1.55 - i * 0.2} c="#cfd5de" top="#8b93a3" />
          <Smoke x={0.75 + i * 0.95} y={0.75} z={1.7 - i * 0.2} delay={i} />
          <Smoke x={0.85 + i * 0.95} y={0.65} z={1.7 - i * 0.2} delay={i + 1.3} />
        </g>
      ))}
      <Box x={1.5} y={1.4} w={1.3} d={1.0} h={0.85} c="#4a6fa5" />
      <Windows face="left" x={1.5} y={1.4} w={1.3} d={1.0} h={0.85} rows={2} cols={4} color="#ffe08a" dark="#22385a" seed={7} />
      <Windows face="right" x={1.5} y={1.4} w={1.3} d={1.0} h={0.85} rows={2} cols={3} color="#e8c870" dark="#1d3150" seed={8} />
      {[0, 1, 2].map((i) => <Box key={i} x={0.3 + i * 0.4} y={2.2} w={0.28} d={0.28} h={0.35} c="#9aa6b6" sw={0.4} />)}
      <Pipe a={[0.44, 2.36]} b={[1.5, 2.0]} z={0.35} c="#e3b04b" wpx={1} />
      {/* pylon */}
      <g stroke="#c9d3e2" strokeWidth="0.9">
        <line x1={P(2.6, 2.7)[0]} y1={P(2.6, 2.7)[1]} x2={P(2.6, 2.7, 1.5)[0]} y2={P(2.6, 2.7, 1.5)[1]} />
        <line x1={P(2.45, 2.7, 1.3)[0]} y1={P(2.45, 2.7, 1.3)[1]} x2={P(2.75, 2.7, 1.3)[0]} y2={P(2.75, 2.7, 1.3)[1]} />
      </g>
    </g>
  );
}

function ChemPlant({ level, tank = '#e9eef7', hall = '#5c8a7a' }: { level: number; tank?: string; hall?: string }) {
  const tanks = lvl(level, 2, 4, 3);
  const spots: [number, number][] = [[0.55, 0.55], [1.25, 0.55], [0.55, 1.25], [1.25, 1.25]];
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#77736a" />
      <Cyl cx={2.2} cy={0.6} r={0.17} h={2.3} c="#8b93a3" stripes="#d0d6df" />
      <Cyl cx={2.6} cy={0.95} r={0.12} h={1.6} c="#8b93a3" stripes="#d0d6df" />
      {spots.slice(0, tanks).map(([x, y], i) => <Cyl key={i} cx={x} cy={y} r={0.3} h={0.75} c={tank} top="#f6f7fa" />)}
      <Pipe a={[0.55, 0.55]} b={[2.2, 0.6]} z={0.6} />
      <Pipe a={[1.25, 1.25]} b={[2.2, 0.6]} z={0.45} c="#e3b04b" />
      <Box x={1.2} y={1.75} w={1.55} d={1.0} h={0.7} c={hall} />
      <Windows face="left" x={1.2} y={1.75} w={1.55} d={1.0} h={0.7} rows={1} cols={4} color="#cfe6ff" seed={13} />
      <Door x={1.2} y={1.75} w={1.55} d={1.0} u0={1.15} u1={1.45} h={0.45} face="right" />
      <Cyl cx={0.45} cy={2.5} r={0.06} h={1.2} c="#7c8494" />
      <path d={`M${P(0.45, 2.5, 1.25)[0]} ${P(0.45, 2.5, 1.25)[1]} q-3 -5 0 -9 q3 4 0 9`} fill="#f0a33a" className="iso-flame" />
      {[0, 1].map((i) => <Box key={i} x={0.3 + i * 0.35} y={1.95} w={0.28} d={0.28} h={0.25} c="#4a8fe0" sw={0.4} />)}
    </g>
  );
}

/* ------------------------------------------------------------------ manufacturing */

function SteelMill({ level }: { level: number }) {
  const furnaces = lvl(level, 1, 2, 4);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#6b6560" />
      {Array.from({ length: furnaces }, (_, i) => (
        <g key={i}>
          <Cyl cx={0.6 + i * 0.75} cy={0.55} r={0.36} h={1.7} c="#5a4a44" stripes="#3a302c" />
          <Smoke x={0.6 + i * 0.75} y={0.55} z={1.8} delay={i * 0.9} />
        </g>
      ))}
      <Chimney x={2.6} y={0.4} h={2.4} c="#7a6a62" delay={0.4} />
      <Box x={0.3} y={1.15} w={2.4} d={1.4} h={1.0} c="#7a4a36" />
      <Windows face="left" x={0.3} y={1.15} w={2.4} d={1.4} h={1.0} rows={1} cols={6} color="#ff9a3c" dark="#3a2018" my={0.32} seed={3} litRatio={0.9} />
      <Windows face="right" x={0.3} y={1.15} w={2.4} d={1.4} h={1.0} rows={1} cols={3} color="#ff9a3c" dark="#3a2018" my={0.32} seed={5} litRatio={0.9} />
      <Sawtooth x={0.3} y={1.15} z={1.0} w={2.4} d={1.4} n={4} c="#8f8f98" />
      {[0, 1, 2].map((i) => <Cyl key={i} cx={0.6 + i * 0.5} cy={2.8} r={0.16} h={0.2} c="#b7c0ce" />)}
      <Person x={2.5} y={2.85} shirt="#f0a33a" hat="#e3b04b" s={0.85} />
    </g>
  );
}

function CarPlant({ level }: { level: number }) {
  const cars = lvl(level, 2, 4, 3);
  const colors = ['#d94f4f', '#4a8fe0', '#e9eef7', '#e3b04b'];
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7d7a73" />
      <Chimney x={0.35} y={0.3} h={1.6} smoke={level > 1} />
      <Box x={0.2} y={0.55} w={2.6} d={1.4} h={0.9} c="#c9c1b4" />
      <Windows face="left" x={0.2} y={0.55} w={2.6} d={1.4} h={0.9} rows={1} cols={6} color="#cfe6ff" dark="#3b4458" my={0.32} seed={21} />
      <Door x={0.2} y={0.55} w={2.6} d={1.4} u0={0.3} u1={1.0} h={0.75} face="right" />
      <Sawtooth x={0.2} y={0.55} z={0.9} w={2.6} d={1.4} n={5} c="#9aa6b6" />
      <Box x={2.55} y={0.6} z={1.22} w={0.2} d={1.3} h={0.28} c="#d8434e" sw={0.4} />
      <Tile x={0.2} y={2.1} w={2.6} d={0.8} fill="#4b5263" />
      {Array.from({ length: cars }, (_, i) => <Car key={i} x={0.3 + i * 0.62} y={2.25} c={colors[i % colors.length]} axis="y" />)}
    </g>
  );
}

function ApplianceWorks({ level }: { level: number }) {
  const stacks = lvl(level, 2, 4, 3);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#827d74" />
      <Box x={0.25} y={0.35} w={2.1} d={1.7} h={1.0} c="#5f87b0" />
      <Windows face="left" x={0.25} y={0.35} w={2.1} d={1.7} h={1.0} rows={2} cols={5} color="#e8f1fb" dark="#2b4562" seed={31} />
      <Windows face="right" x={0.25} y={0.35} w={2.1} d={1.7} h={1.0} rows={2} cols={4} color="#c9dcef" dark="#253c56" seed={32} />
      <Box x={0.25} y={0.35} z={1.0} w={2.1} d={1.7} h={0.1} c="#e9eef7" />
      <Box x={0.6} y={0.7} z={1.1} w={0.5} d={0.5} h={0.25} c="#9aa6b6" />
      <Box x={2.35} y={0.6} w={0.5} d={1.2} h={0.55} c="#c9c1b4" />
      <Door x={2.35} y={0.6} w={0.5} d={1.2} u0={0.3} u1={0.9} h={0.42} face="right" />
      {Array.from({ length: stacks }, (_, i) => (
        <g key={i}>
          <Box x={0.4 + i * 0.5} y={2.3} w={0.36} d={0.36} h={0.36} c="#f4f1ea" sw={0.4} />
          {i % 2 === 0 && <Box x={0.4 + i * 0.5} y={2.3} z={0.36} w={0.36} d={0.36} h={0.3} c="#e3d8c4" sw={0.4} />}
        </g>
      ))}
      <Person x={2.6} y={2.4} shirt="#4a8fe0" s={0.85} />
    </g>
  );
}

/* ------------------------------------------------------------------ tech */

function ChipFab({ level }: { level: number }) {
  const fans = lvl(level, 2, 4, 3);
  const [cx, cy] = P(1.5, 1.4, 0.82);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#a7b0bd" />
      <Box x={0.25} y={0.4} w={2.5} d={2.0} h={0.8} c="#e8edf3" />
      <Windows face="left" x={0.25} y={0.4} w={2.5} d={2.0} h={0.8} rows={1} cols={8} color="#5aa0d8" dark="#355a85" my={0.28} seed={41} litRatio={1} />
      <Windows face="right" x={0.25} y={0.4} w={2.5} d={2.0} h={0.8} rows={1} cols={6} color="#4a8fe0" dark="#2f5482" my={0.28} seed={42} litRatio={1} />
      {/* chip logo on the roof */}
      <polygon points={pts(P(1.15, 1.05, 0.81), P(1.85, 1.05, 0.81), P(1.85, 1.75, 0.81), P(1.15, 1.75, 0.81))} fill="#1d283d" stroke="#e3b04b" strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r="2.2" fill="#e3b04b" />
      {Array.from({ length: fans }, (_, i) => <Cyl key={i} cx={0.55 + i * 0.5} cy={2.05} z={0.8} r={0.13} h={0.14} c="#9aa6b6" />)}
      <Cyl cx={2.65} cy={2.65} r={0.18} h={0.7} c="#d9dee6" />
      <Cyl cx={2.25} cy={2.75} r={0.15} h={0.55} c="#d9dee6" />
      <Person x={0.8} y={2.8} shirt="#e9eef7" s={0.85} />
    </g>
  );
}

function PhoneFactory({ level }: { level: number }) {
  const floors = lvl(level, 3, 6, 2);
  const h = floors * 0.36;
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8995a8" />
      <Box x={0.35} y={0.35} w={1.8} d={1.6} h={h} c="#3a6fa8" />
      <Windows face="left" x={0.35} y={0.35} w={1.8} d={1.6} h={h} rows={floors} cols={5} color="#a9d6ff" dark="#22487e" seed={51} />
      <Windows face="right" x={0.35} y={0.35} w={1.8} d={1.6} h={h} rows={floors} cols={4} color="#7fb6ef" dark="#1b3a66" seed={52} />
      <Box x={0.6} y={0.6} z={h} w={0.6} d={0.5} h={0.2} c="#9aa6b6" />
      <Box x={2.15} y={0.6} w={0.65} d={1.3} h={0.6} c="#c9c1b4" />
      <Door x={2.15} y={0.6} w={0.65} d={1.3} u0={0.25} u1={1.0} h={0.45} face="right" />
      <Car x={2.2} y={2.2} c="#e9eef7" axis="y" />
      <Box x={0.5} y={2.3} w={0.3} d={0.3} h={0.25} c="#e3b04b" sw={0.4} />
      <Box x={0.9} y={2.35} w={0.3} d={0.3} h={0.25} c="#e3b04b" sw={0.4} />
      <Person x={1.5} y={2.75} shirt="#4a8fe0" s={0.85} />
    </g>
  );
}

function DataCenter({ level, glow = '#3dbb6c', tower = '#5aa0d8' }: { level: number; glow?: string; tower?: string }) {
  const halls = lvl(level, 1, 2, 4);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7f8898" />
      {Array.from({ length: halls }, (_, i) => (
        <g key={i}>
          <Box x={0.25 + i * 0.05} y={0.35 + i * 1.1} w={2.0} d={0.95} h={0.65} c="#2b3445" />
          <Windows face="left" x={0.25 + i * 0.05} y={0.35 + i * 1.1} w={2.0} d={0.95} h={0.65} rows={2} cols={8} color={glow} dark="#1a2130" seed={61 + i} litRatio={0.6} />
          {[0, 1, 2].map((j) => <Cyl key={j} cx={0.6 + j * 0.6} cy={0.8 + i * 1.1} z={0.65} r={0.15} h={0.1} c="#5a6577" />)}
        </g>
      ))}
      <Box x={2.3} y={0.4} w={0.55} d={0.9} h={1.0} c={tower} />
      <Windows face="left" x={2.3} y={0.4} w={0.55} d={0.9} h={1.0} rows={3} cols={1} color="#cfe6ff" seed={63} />
      <Windows face="right" x={2.3} y={0.4} w={0.55} d={0.9} h={1.0} rows={3} cols={2} color="#a8c9e8" seed={64} />
      <circle cx={P(2.57, 0.85, 1.15)[0]} cy={P(2.57, 0.85, 1.15)[1]} r="1.6" fill="#e2574c" className="iso-blink" />
      {halls === 1 && <Box x={0.5} y={1.9} w={0.9} d={0.6} h={0.35} c="#9aa6b6" />}
      <Person x={1.9} y={2.7} shirt="#9b7be0" s={0.85} />
    </g>
  );
}

/* ------------------------------------------------------------------ retail goods */

function FoodPlant({ level }: { level: number }) {
  const silos = lvl(level, 2, 4, 3);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8a8578" />
      {Array.from({ length: silos }, (_, i) => <Cyl key={i} cx={0.4 + i * 0.55} cy={0.4} r={0.24} h={1.5} c="#e9e4d6" top="#c9c1b4" stripes="#d8cfbd" />)}
      <Box x={0.3} y={0.85} w={2.3} d={1.35} h={0.75} c="#e7d3a8" />
      <Windows face="left" x={0.3} y={0.85} w={2.3} d={1.35} h={0.75} rows={1} cols={5} color="#cfe6ff" dark="#4a4030" my={0.25} seed={71} />
      <Box x={0.3} y={0.85} z={0.75} w={2.3} d={1.35} h={0.12} c="#3dbb6c" />
      <Door x={0.3} y={0.85} w={2.3} d={1.35} u0={0.2} u1={0.75} h={0.5} face="right" />
      <Door x={0.3} y={0.85} w={2.3} d={1.35} u0={0.85} u1={1.3} h={0.5} face="right" />
      {/* delivery truck */}
      <Box x={1.0} y={2.35} w={0.9} d={0.42} h={0.38} c="#f4f1ea" sw={0.4} />
      <Box x={1.9} y={2.37} w={0.3} d={0.38} h={0.28} c="#3dbb6c" sw={0.4} />
      <Person x={0.6} y={2.8} shirt="#d94f6a" s={0.85} />
    </g>
  );
}

function TextileMill({ level }: { level: number }) {
  const rolls = lvl(level, 3, 5, 2);
  const colors = ['#d94f6a', '#4a8fe0', '#e3b04b', '#3dbb6c', '#9b7be0'];
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#857a6c" />
      <Chimney x={0.35} y={0.35} h={2.0} c="#8a4a3a" />
      <Box x={0.3} y={0.7} w={2.4} d={1.5} h={0.85} c="#9c4a3a" />
      <Windows face="left" x={0.3} y={0.7} w={2.4} d={1.5} h={0.85} rows={1} cols={6} color="#f6d98a" dark="#4a2a1c" my={0.28} seed={81} />
      <Windows face="right" x={0.3} y={0.7} w={2.4} d={1.5} h={0.85} rows={1} cols={4} color="#f6d98a" dark="#4a2a1c" my={0.28} seed={82} />
      <Sawtooth x={0.3} y={0.7} z={0.85} w={2.4} d={1.5} n={4} c="#8f8f98" />
      {Array.from({ length: rolls }, (_, i) => <Cyl key={i} cx={0.45 + i * 0.45} cy={2.6} r={0.17} h={0.38} c={colors[i % colors.length]} />)}
      <Person x={2.6} y={2.5} shirt="#d94f6a" s={0.85} />
    </g>
  );
}

/* ------------------------------------------------------------------ newer industries */

function Sawmill({ level }: { level: number }) {
  const piles = lvl(level, 2, 4, 3);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#7a6a4f" />
      <Tree x={0.35} y={0.35} s={1.1} seed={3} />
      <Tree x={0.9} y={0.25} s={0.95} seed={5} />
      <Box x={1.2} y={0.4} w={1.55} d={1.2} h={0.7} c="#9c6b3f" />
      <Gable x={1.2} y={0.4} z={0.7} w={1.55} d={1.2} h={0.35} c="#6b4a2c" axis="x" />
      <Door x={1.2} y={0.4} w={1.55} d={1.2} u0={0.45} u1={1.05} h={0.5} />
      <Chimney x={2.5} y={0.6} h={1.4} smoke />
      {Array.from({ length: piles }, (_, i) => (
        <g key={i}>
          <Box x={0.3 + i * 0.6} y={2.0} w={0.48} d={0.75} h={0.18} c="#b07a48" sw={0.4} />
          <Box x={0.3 + i * 0.6} y={2.0} z={0.18} w={0.48} d={0.75} h={0.16} c="#c48a55" sw={0.4} />
        </g>
      ))}
      <Person x={2.6} y={2.5} shirt="#d94f4f" hat="#e3b04b" s={0.85} />
    </g>
  );
}

function GlassWorks({ level }: { level: number }) {
  const racks = lvl(level, 2, 4, 3);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#827d74" />
      <Box x={0.3} y={0.35} w={1.9} d={1.5} h={0.9} c="#6f7f95" />
      <Windows face="left" x={0.3} y={0.35} w={1.9} d={1.5} h={0.9} rows={1} cols={5} color="#ffb35a" dark="#4a2a1c" my={0.25} seed={71} litRatio={1} />
      <Windows face="right" x={0.3} y={0.35} w={1.9} d={1.5} h={0.9} rows={1} cols={4} color="#ff9a3a" dark="#4a2a1c" my={0.25} seed={72} litRatio={1} />
      <Sawtooth x={0.3} y={0.35} z={0.9} w={1.9} d={1.5} n={3} c="#9aa6b6" />
      <Chimney x={2.5} y={0.6} h={1.9} delay={0.6} />
      {Array.from({ length: racks }, (_, i) => (
        <g key={i}>
          <Box x={0.35 + i * 0.6} y={2.15} w={0.08} d={0.7} h={0.6} c="#bfe6f5" sw={0.3} />
          <Box x={0.47 + i * 0.6} y={2.15} w={0.08} d={0.7} h={0.6} c="#9fd0ff" sw={0.3} />
        </g>
      ))}
      <Person x={2.55} y={2.5} shirt="#4a8fe0" s={0.85} />
    </g>
  );
}

function FurnitureWorks({ level }: { level: number }) {
  const n = lvl(level, 2, 4, 3);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8a7f6e" />
      <Box x={0.3} y={0.3} w={2.2} d={1.5} h={0.85} c="#c9a27a" />
      <Windows face="left" x={0.3} y={0.3} w={2.2} d={1.5} h={0.85} rows={1} cols={5} color="#f6d98a" dark="#4a3420" my={0.25} seed={75} />
      <Sawtooth x={0.3} y={0.3} z={0.85} w={2.2} d={1.5} n={4} c="#7c5a3c" />
      <Door x={0.3} y={0.3} w={2.2} d={1.5} u0={0.3} u1={1.0} h={0.45} face="right" />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          {/* a little sofa: seat and back */}
          <Box x={0.35 + i * 0.6} y={2.2} w={0.45} d={0.35} h={0.14} c={['#d94f6a', '#4a8fe0', '#3dbb6c', '#e3b04b'][i]} sw={0.35} />
          <Box x={0.35 + i * 0.6} y={2.2} z={0.14} w={0.45} d={0.1} h={0.16} c={['#b03a52', '#3570b8', '#2e9656', '#c4952f'][i]} sw={0.35} />
        </g>
      ))}
      <Person x={2.65} y={2.45} shirt="#9b7be0" s={0.85} />
    </g>
  );
}

function LaptopPlant({ level }: { level: number }) {
  const floors = lvl(level, 2, 5, 2);
  const h = floors * 0.36;
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8995a8" />
      <Box x={0.3} y={0.35} w={2.1} d={1.5} h={h} c="#4b5d7a" />
      <Windows face="left" x={0.3} y={0.35} w={2.1} d={1.5} h={h} rows={floors} cols={6} color="#b8f0d2" dark="#22304a" seed={77} />
      <Windows face="right" x={0.3} y={0.35} w={2.1} d={1.5} h={h} rows={floors} cols={4} color="#93d8b4" dark="#1d293f" seed={78} />
      <Box x={0.3} y={0.35} z={h} w={2.1} d={1.5} h={0.08} c="#c9d3e2" />
      {/* rooftop laptop sign */}
      <Box x={0.9} y={0.9} z={h + 0.08} w={0.9} d={0.55} h={0.05} c="#c9d3e2" sw={0.4} />
      <polygon points={faceQuad('left', 0.9, 0.9, h + 0.08, 0.9, 0.05, 0.05, 0.85, 0.05, 0.5)} fill="#3dbb6c" stroke={OUTLINE} strokeWidth="0.4" />
      <Box x={2.4} y={0.6} w={0.45} d={1.1} h={0.5} c="#c9c1b4" />
      <Car x={2.15} y={2.2} c="#e9eef7" axis="y" />
      {[0, 1].map((i) => <Box key={i} x={0.5 + i * 0.4} y={2.3} w={0.3} d={0.3} h={0.25} c="#e3d8c4" sw={0.4} />)}
      <Person x={1.5} y={2.7} shirt="#3dbb6c" s={0.85} />
    </g>
  );
}

function PharmaLab({ level }: { level: number }) {
  const floors = lvl(level, 2, 4, 3);
  const h = floors * 0.38;
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#9aa3ad" />
      <Box x={0.3} y={0.3} w={1.8} d={1.6} h={h} c="#f2f5f8" />
      <Windows face="left" x={0.3} y={0.3} w={1.8} d={1.6} h={h} rows={floors} cols={5} color="#c4f0dc" dark="#3c5a6a" seed={81} />
      <Windows face="right" x={0.3} y={0.3} w={1.8} d={1.6} h={h} rows={floors} cols={4} color="#a7dcc6" dark="#36506d" seed={82} />
      <CrossSign x={0.3} y={0.3} w={1.8} d={1.6} u={1.45} v={h - 0.22} c="#2e9e6a" s={0.28} />
      <Cyl cx={2.45} cy={0.65} r={0.22} h={0.9} c="#c9d3e2" top="#e9eef7" />
      <Cyl cx={2.45} cy={1.25} r={0.22} h={0.7} c="#c9d3e2" top="#e9eef7" />
      <Pipe a={[2.1, 0.9]} b={[2.45, 0.65]} z={0.6} />
      {[0, 1, 2].map((i) => <Box key={i} x={0.45 + i * 0.4} y={2.3} w={0.3} d={0.3} h={0.22} c="#f4f1ea" sw={0.4} />)}
      <Person x={2.3} y={2.5} shirt="#e9eef7" s={0.85} />
    </g>
  );
}

function TelecomHub({ level }: { level: number }) {
  const mast = 2.2 + Math.min(1.2, level * 0.12);
  const dishes = lvl(level, 1, 3, 3);
  const [bx, by] = P(1.9, 1.0, 0);
  const [tx, ty] = P(1.9, 1.0, mast);
  return (
    <g>
      <Tile x={0} y={0} w={3} d={3} fill="#8995a8" />
      <Box x={0.3} y={1.5} w={1.4} d={1.2} h={0.75} c="#5f6f8a" />
      <Windows face="left" x={0.3} y={1.5} w={1.4} d={1.2} h={0.75} rows={2} cols={4} color="#a9d6ff" dark="#22304a" seed={85} />
      {/* lattice mast */}
      <path d={`M${bx - 5} ${by} L${tx} ${ty} L${bx + 5} ${by} M${bx - 3.3} ${by - (by - ty) / 3} L${bx + 3.3} ${by - (by - ty) / 3} M${bx - 1.7} ${by - (2 * (by - ty)) / 3} L${bx + 1.7} ${by - (2 * (by - ty)) / 3}`} stroke="#d0d6df" strokeWidth="1" fill="none" />
      {Array.from({ length: dishes }, (_, i) => {
        const [dx, dy] = P(1.9, 1.0, mast * (0.55 + i * 0.15));
        return <ellipse key={i} cx={dx + (i % 2 ? -3 : 3)} cy={dy} rx="2.4" ry="3.2" fill="#e9eef7" stroke={OUTLINE} strokeWidth="0.5" />;
      })}
      <circle cx={tx} cy={ty} r="1.6" fill="#e2574c" className="iso-blink" />
      <Box x={2.1} y={2.1} w={0.6} d={0.6} h={0.4} c="#c9c1b4" />
      <Person x={1.0} y={2.85} shirt="#4a8fe0" s={0.85} />
    </g>
  );
}

export function GoodBuilding({ good, level = 1 }: { good: GoodId; level?: number }) {
  switch (good) {
    case 'iron_ore': return <Mine level={level} />;
    case 'grain': return <Farm level={level} crop="grain" />;
    case 'cotton': return <Farm level={level} crop="cotton" />;
    case 'silicon': return <SiliconWorks level={level} />;
    case 'crude_oil': return <OilGas level={level} />;
    case 'electricity': return <PowerPlant level={level} />;
    case 'plastics': return <ChemPlant level={level} />;
    case 'steel': return <SteelMill level={level} />;
    case 'chips': return <ChipFab level={level} />;
    case 'cars': return <CarPlant level={level} />;
    case 'appliances': return <ApplianceWorks level={level} />;
    case 'phones': return <PhoneFactory level={level} />;
    case 'software': return <DataCenter level={level} />;
    case 'food': return <FoodPlant level={level} />;
    case 'clothing': return <TextileMill level={level} />;
    case 'banking': return <Bank level={level} />;
    case 'timber': return <Sawmill level={level} />;
    case 'chemicals': return <ChemPlant level={level} tank="#f0c75a" hall="#8a6a9a" />;
    case 'glass': return <GlassWorks level={level} />;
    case 'freight': return <Depot level={level} />;
    case 'furniture': return <FurnitureWorks level={level} />;
    case 'laptops': return <LaptopPlant level={level} />;
    case 'medicine': return <PharmaLab level={level} />;
    case 'telecom': return <TelecomHub level={level} />;
    case 'clinics': return <Hospital level={level} />;
    case 'copper': return <Mine level={level} ore="#c96a3c" ground="#8a6a50" silo="#d9a07a" />;
    case 'lithium': return <Mine level={level} ore="#e8eef5" ground="#c9c2b0" silo="#e9eef7" ponds="#6fd0c8" />;
    case 'bauxite': return <Mine level={level} ore="#b5523b" ground="#9a5a40" silo="#c98a6a" />;
    case 'rare_earths': return <Mine level={level} ore="#8e7cc3" ground="#6f6a72" silo="#b9b0d8" />;
    case 'limestone': return <Mine level={level} ore="#ddd6c6" ground="#a9a294" silo="#e9e4d8" />;
    case 'natural_gas': return <OilGas level={level} gas />;
    case 'aluminium': return <Smelter level={level} />;
    case 'batteries': return <BatteryPlant level={level} />;
    case 'cement': return <CementPlant level={level} />;
    case 'water': return <WaterWorks level={level} />;
    case 'construction': return <BuildersYard level={level} />;
    case 'real_estate': return <Towers level={level} />;
    case 'ecommerce': return <Fulfillment level={level} />;
    case 'gaming': return <DataCenter level={level} glow="#9b7be0" tower="#d0679a" />;
    case 'ai': return <DataCenter level={level} glow="#48c9b0" tower="#2b3445" />;
    case 'robots': return <RobotWorks level={level} />;
    case 'space': return <LaunchPad level={level} />;
    case 'defense': return <Hangar level={level} />;
    case 'airlines': return <Airport level={level} />;
    case 'hospitals': return <Hospital level={level + 6} />;
    case 'wellness': return <Spa level={level} />;
  }
}

/** Small framed picture of a good's plant (cards, lists). */
export function GoodThumb({ good, size = 56, level = 2 }: { good: GoodId; size?: number; level?: number }) {
  return (
    <svg width={size} height={size} viewBox="-56 -66 112 112" className="shrink-0 rounded-xl bg-[radial-gradient(circle_at_50%_70%,#24406a,#13223b)] border border-line" role="img" aria-label={good}>
      <ellipse cx="0" cy="24" rx="50" ry="22" fill="#3f7d4a" opacity="0.9" />
      <GoodBuilding good={good} level={level} />
    </svg>
  );
}
