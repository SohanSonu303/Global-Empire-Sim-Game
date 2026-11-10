import type { ReactNode } from 'react';
import type { Company, IndustryId, Rival } from '../../engine/types';
import { Bank, Factory, IndustryBuilding, OilGas, TechTower } from './buildings';
import { MapLabel } from './City';
import { Box, Cyl, Gable, OUTLINE, P, Person, Smoke, Tree, Windows, faceQuad, hash01, pts, shade } from './iso';

export const IND_COLOR: Record<IndustryId, string> = {
  tech: '#4a8fe0',
  manufacturing: '#c96a3c',
  retail: '#d94f6a',
  energy: '#e3b04b',
  finance: '#9aa9c4',
  resources: '#a8784a',
  health: '#3dbb9c',
  services: '#c98a3c',
};

/* ------------------------------------------------------------------ thumbnails */

export function IndustryThumb({ industry, size = 56, level = 3 }: { industry: IndustryId; size?: number; level?: number }) {
  const lv = industry === 'tech' ? Math.min(level, 2) : level;
  return (
    <svg width={size} height={size} viewBox="-56 -66 112 112" className="shrink-0 rounded-xl bg-[radial-gradient(circle_at_50%_70%,#24406a,#13223b)] border border-line" role="img" aria-label={industry}>
      <ellipse cx="0" cy="24" rx="50" ry="22" fill="#3f7d4a" opacity="0.9" />
      <IndustryBuilding industry={industry} level={lv} />
    </svg>
  );
}

/* ------------------------------------------------------------------ cutaway */

const CW = 8; // width along x
const CD = 2.0; // room depth along y
const FH = 2.9; // floor height

function Room({ z, wall, floor, label, children }: { z: number; wall: string; floor: string; label: string; children: ReactNode }) {
  const [lx, ly] = P(0.35, 0, z + FH - 0.35);
  return (
    <g>
      {/* back wall and end wall (interior faces) */}
      <Box x={0} y={-0.25} z={z} w={CW} d={0.25} h={FH} c={wall} left={wall} top={shade(wall, 1.3)} />
      <Box x={-0.25} y={-0.25} z={z} w={0.25} d={CD + 0.25} h={FH} c={wall} right={shade(wall, 0.8)} top={shade(wall, 1.3)} />
      <Box x={0} y={0} z={z} w={CW} d={CD} h={0.18} c={floor} top={floor} />
      {/* skirting line */}
      <polygon points={faceQuad('left', 0, -0.25, z + 0.18, CW, 0.25, 0, CW, 0, 0.12)} fill={shade(wall, 0.7)} />
      <text x={lx} y={ly} fontSize="7" fontWeight="800" fill="#e9eef7" opacity="0.75" transform={`skewY(26.57) translate(0 ${-lx * 0.5})`} letterSpacing="0.8">
        {label}
      </text>
      {children}
    </g>
  );
}

function Desk({ x, z, occupied, seed }: { x: number; z: number; occupied: boolean; seed: number }) {
  const shirts = ['#2f5fa0', '#3a8f55', '#8a4fa0', '#c96a3c', '#e9eef7'];
  return (
    <g>
      <Box x={x} y={0.35} z={z} w={0.85} d={0.55} h={0.42} c="#8a6a4a" sw={0.4} />
      <Box x={x + 0.22} y={0.42} z={z + 0.42} w={0.42} d={0.08} h={0.32} c="#1b2335" left="#9fd0ff" sw={0.4} />
      {occupied && <Person x={x + 0.45} y={1.35} z={z} shirt={shirts[seed % shirts.length]} s={0.95} />}
    </g>
  );
}

function Machine({ x, z, color, util, seed }: { x: number; z: number; color: string; util: number; seed: number }) {
  const [lx, ly] = P(x + 0.45, 0.95, z + 0.82);
  return (
    <g>
      <Box x={x} y={0.15} z={z} w={0.95} d={0.8} h={1.05} c={color} sw={0.5} />
      <polygon points={faceQuad('left', x, 0.15, z, 0.95, 0.8, 0.12, 0.6, 0.4, 0.85)} fill="#0f1b30" opacity="0.7" />
      <polygon points={faceQuad('left', x, 0.15, z, 0.95, 0.8, 0.18, 0.54, 0.48, 0.62)} fill={util > 0.5 ? '#7fe0a0' : '#f0c565'} opacity="0.8" />
      <Box x={x + 0.2} y={0.3} z={z + 1.05} w={0.5} d={0.4} h={0.25} c={shade(color, 0.8)} sw={0.4} />
      <circle cx={lx + 4} cy={ly} r="1.4" fill={util > 0.5 ? '#3dbb6c' : util > 0.05 ? '#f0a33a' : '#e2574c'} className={util > 0.05 ? 'iso-blink' : undefined} style={{ animationDelay: `${seed * 0.3}s` }} />
    </g>
  );
}

function Crate({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g>
      <Box x={x} y={y} z={z} w={0.55} d={0.55} h={0.5} c="#c89a5a" sw={0.4} />
      <polygon points={faceQuad('left', x, y, z, 0.55, 0.55, 0.05, 0.5, 0.22, 0.28)} fill="#8a6234" />
      <polygon points={faceQuad('right', x, y, z, 0.55, 0.55, 0.05, 0.5, 0.22, 0.28)} fill="#6e4d28" />
    </g>
  );
}

function Forklift({ x, z }: { x: number; z: number }) {
  const [a0, a1] = [P(x + 0.95, 1.3, z), P(x + 0.95, 1.3, z + 1.3)];
  return (
    <g>
      <Box x={x} y={1.15} z={z} w={0.8} d={0.55} h={0.35} c="#e3b04b" sw={0.4} />
      <Box x={x + 0.1} y={1.2} z={z + 0.35} w={0.4} d={0.45} h={0.35} c="#1b2335" top="#e3b04b" sw={0.4} />
      <line x1={a0[0]} y1={a0[1]} x2={a1[0]} y2={a1[1]} stroke="#5d6a80" strokeWidth="1.4" />
      <Box x={x + 0.8} y={1.15} z={z + 0.05} w={0.55} d={0.55} h={0.06} c="#7a8597" sw={0.3} />
      <Crate x={x + 0.8} y={1.15} z={z + 0.11} />
    </g>
  );
}

function Roof({ ind, z, level }: { ind: IndustryId; z: number; level: number }) {
  const base = <Box x={-0.25} y={-0.25} z={z} w={CW + 0.5} d={CD + 0.5} h={0.3} c="#6b7a94" />;
  switch (ind) {
    case 'manufacturing':
      return (
        <g>
          {base}
          {[0, 1, 2, 3].map((i) => <Gable key={i} x={0.3 + i * 1.6} y={0} z={z + 0.3} w={1.5} d={CD} h={0.9} c="#8a95a8" axis="y" />)}
          <Cyl cx={CW - 0.8} cy={0.4} z={z + 0.3} r={0.32} h={2.4} c="#b5523a" stripes="#e9eef7" />
          <Smoke x={CW - 0.8} y={0.4} z={z + 2.8} />
          <Smoke x={CW - 0.8} y={0.4} z={z + 2.8} delay={1.4} />
        </g>
      );
    case 'tech':
      return (
        <g>
          {base}
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Box x={0.4 + i * 1.4} y={0.3} z={z + 0.3} w={1.1} d={1.5} h={0.12} c="#1f3f70" top="#2f5fa3" sw={0.4} />
            </g>
          ))}
          <Box x={5.2} y={0.4} z={z + 0.3} w={1.2} d={1.2} h={0.8} c="#7c8ba3" />
          <line x1={P(5.8, 1, z + 1.1)[0]} y1={P(5.8, 1, z + 1.1)[1]} x2={P(5.8, 1, z + 3)[0]} y2={P(5.8, 1, z + 3)[1]} stroke="#c9d3e2" strokeWidth="1.2" />
          <circle cx={P(5.8, 1, z + 3)[0]} cy={P(5.8, 1, z + 3)[1]} r="1.8" fill="#e2574c" className="iso-blink" />
        </g>
      );
    case 'energy':
      return (
        <g>
          {base}
          <Cyl cx={1.4} cy={1.1} z={z + 0.3} r={0.75} h={1.2} c="#e9eef7" stripes="#e3b04b" />
          <Cyl cx={3.4} cy={1.1} z={z + 0.3} r={0.75} h={1.2} c="#e9eef7" stripes="#e3b04b" />
          <Box x={5} y={0.5} z={z + 0.3} w={0.2} d={0.2} h={2} c="#7a8597" />
          <g className="iso-flame" style={{ transformOrigin: `${P(5.1, 0.6, z + 2.3)[0]}px ${P(5.1, 0.6, z + 2.3)[1]}px` }}>
            <path d={`M${P(5.1, 0.6, z + 2.3)[0]} ${P(5.1, 0.6, z + 2.3)[1]} q-4 -6 0 -12 q4 6 0 12`} fill="#f0a33a" />
          </g>
        </g>
      );
    case 'finance':
      return (
        <g>
          {base}
          <Gable x={-0.1} y={-0.1} z={z + 0.3} w={CW + 0.2} d={CD + 0.2} h={1.1} c="#d8d0bd" axis="x" />
          {level >= 6 && <Cyl cx={CW / 2} cy={CD / 2} z={z + 1.1} r={0.6} h={0.4} c="#e3b04b" />}
        </g>
      );
    case 'resources':
      return (
        <g>
          {base}
          <Cyl cx={1.2} cy={1.1} z={z + 0.3} r={0.6} h={1.4} c="#d8c38f" stripes="#a8925f" />
          <Cyl cx={2.6} cy={1.1} z={z + 0.3} r={0.6} h={1.1} c="#d8c38f" stripes="#a8925f" />
          <Box x={5} y={0.6} z={z + 0.3} w={1.6} d={0.8} h={0.5} c="#7b4a32" />
        </g>
      );
    case 'retail':
      return (
        <g>
          {base}
          <Box x={1.5} y={0.2} z={z + 0.3} w={4.5} d={0.15} h={1.1} c="#d94f6a" left="#d94f6a" />
          <polygon points={faceQuad('left', 1.5, 0.2, z + 0.3, 4.5, 0.15, 0.25, 4.25, 0.25, 0.85)} fill="#0b1424" />
          <Box x={6.6} y={0.6} z={z + 0.3} w={0.8} d={0.8} h={0.5} c="#9aa9c4" />
        </g>
      );
  }
}

/** Cutaway building: floors show office, production and storage state. */
export function Cutaway({ c }: { c: Company }) {
  const util = c.last.produced / Math.max(1, c.capacity);
  const color = IND_COLOR[c.industry];
  const striking = c.strikeUntil > 0 && c.last.laborCap === 0;
  const desks = Math.min(7, 2 + Math.floor(c.level / 2));
  const staffed = Math.max(striking ? 0 : 1, Math.round(desks * Math.min(1, c.morale + 0.2)));
  const machines = Math.min(6, 1 + Math.floor(c.level / 2));
  const crates = Math.min(24, Math.round((c.inventory / Math.max(1, c.capacity)) * 6));
  const z0 = 0.4; // foundation
  const zS = z0, zP = z0 + FH, zO = z0 + FH * 2, zR = z0 + FH * 3;

  const cratePos: { k: number; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < crates; i++) {
    const layer = Math.floor(i / 8);
    const k = i % 8;
    cratePos.push({ k: i, x: 0.3 + (k % 4) * 0.62, y: 0.15 + Math.floor(k / 4) * 0.62, z: zS + 0.18 + layer * 0.5 });
  }
  const sortedCrates = cratePos
    .sort((a, b) => a.z - b.z || a.x + a.y - (b.x + b.y))
    .map((p) => <Crate key={p.k} x={p.x} y={p.y} z={p.z} />);

  const workers = striking ? 0 : Math.min(machines, Math.max(1, Math.round(machines * Math.min(1, c.workers / Math.max(1, c.capacity / 8)))));

  return (
    <svg viewBox="-52 -178 190 262" className="w-full block rounded-xl" role="img" aria-label={`${c.name} cutaway`}>
      <defs>
        <linearGradient id="cut-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a3558" />
          <stop offset="1" stopColor="#0f1d33" />
        </linearGradient>
      </defs>
      <rect x="-52" y="-178" width="190" height="262" fill="url(#cut-bg)" />
      {/* ground */}
      <polygon points={pts(P(-2, -2), P(CW + 2, -2), P(CW + 2, CD + 3), P(-2, CD + 3))} fill="#3f7d4a" />
      <polygon points={pts(P(-0.6, CD + 0.4), P(CW + 0.6, CD + 0.4), P(CW + 0.6, CD + 1.4), P(-0.6, CD + 1.4))} fill="#8995a8" />
      <Tree x={-1.2} y={1} seed={3} />
      <Tree x={CW + 1.3} y={-0.8} seed={8} />
      <Box x={-0.35} y={-0.35} w={CW + 0.7} d={CD + 0.7} h={z0} c="#7c8597" />

      <Room z={zS} wall="#5a4a3a" floor="#8a7458" label="STORAGE">
        {sortedCrates}
        <Box x={5.3} y={0.1} z={zS + 0.18} w={2.3} d={0.4} h={1.6} c="#5d6a80" sw={0.4} />
        {[0.55, 1.1].map((h) => <Box key={h} x={5.3} y={0.1} z={zS + 0.18 + h} w={2.3} d={0.5} h={0.05} c="#8995a8" sw={0.3} />)}
        <Forklift x={3.2} z={zS + 0.18} />
      </Room>

      <Room z={zP} wall="#3a4c6e" floor="#6b7890" label="PRODUCTION">
        {[...Array(machines)].map((_, i) => (
          <Machine key={i} x={0.25 + i * 1.28} z={zP + 0.18} color={color} util={util} seed={i} />
        ))}
        <Box x={0.1} y={1.3} z={zP + 0.18} w={CW - 0.2} d={0.45} h={0.3} c="#2a3346" top="#3a4458" sw={0.4} />
        {[...Array(Math.min(8, Math.ceil(util * 8)))].map((_, i) => (
          <Box key={i} x={0.4 + i * 0.95} y={1.38} z={zP + 0.48} w={0.32} d={0.3} h={0.22} c={shade(color, 1.1)} sw={0.3} />
        ))}
        {[...Array(workers)].map((_, i) => (
          <Person key={i} x={0.75 + i * 1.28} y={1.9} z={zP + 0.18} shirt="#2a5d9a" hat="#f0c565" s={0.95} />
        ))}
        {striking && (
          <g>
            {[1.4, 3.4, 5.4].map((x, i) => (
              <g key={x}>
                <Person x={x} y={1.9} z={zP + 0.18} shirt="#6a3030" s={0.95} />
                <rect x={P(x, 1.9, zP + 1.35)[0] - 6} y={P(x, 1.9, zP + 1.35)[1] - 5} width="12" height="7" fill="#e9eef7" stroke="#e2574c" strokeWidth="0.8" transform={`rotate(${i % 2 ? 6 : -6} ${P(x, 1.9, zP + 1.35)[0]} ${P(x, 1.9, zP + 1.35)[1]})`} />
              </g>
            ))}
            <g transform={`translate(${P(CW / 2, CD / 2, zP + 1.2)[0]} ${P(CW / 2, CD / 2, zP + 1.2)[1]})`}>
              <rect x="-38" y="-10" width="76" height="17" rx="4" fill="#0b1424" stroke="#e2574c" strokeWidth="1.2" />
              <text textAnchor="middle" y="3.5" fontSize="10" fontWeight="900" fill="#e2574c" letterSpacing="1">ON STRIKE</text>
            </g>
          </g>
        )}
      </Room>

      <Room z={zO} wall="#33507e" floor="#8496b4" label="OFFICE">
        <polygon points={faceQuad('left', 4.9, -0.25, zO, 2.4, 0.25, 0.1, 2.3, 0.9, 2.0)} fill="#0b1424" stroke="#3a5079" strokeWidth="0.5" />
        <polyline
          points={[0, 1, 2, 3, 4, 5].map((i) => {
            const v = 1.1 + (hash01(c.level, i) * 0.4 + i * 0.1) * Math.min(1.2, 0.4 + util);
            const [px, py] = P(5.1 + i * 0.38, 0, zO + v);
            return `${px},${py}`;
          }).join(' ')}
          fill="none"
          stroke="#3dbb6c"
          strokeWidth="1.1"
        />
        <Cyl cx={0.35} cy={0.4} z={zO + 0.18} r={0.18} h={0.3} c="#8a5a3a" />
        <Tree x={0.35} y={0.4} z={zO + 0.48} s={0.45} seed={2} />
        {[...Array(desks)].map((_, i) => (
          <Desk key={i} x={0.75 + i * 1.03} z={zO + 0.18} occupied={i < staffed} seed={i + c.level} />
        ))}
      </Room>

      {/* exterior side wall with windows (right face) */}
      {[zS, zP, zO].map((z, i) => (
        <g key={z}>
          <Box x={CW} y={-0.25} z={z} w={0.25} d={CD + 0.25} h={FH} c={i === 0 ? '#a7a091' : '#b9b3a6'} />
          <Windows face="right" x={CW} y={-0.25} z={z} w={0.25} d={CD + 0.25} h={FH} rows={2} cols={2} color="#9fd0ff" seed={z * 3} litRatio={0.8} />
          {/* cut edge of the front of each slab */}
          <polygon points={faceQuad('left', -0.25, 0, z, CW + 0.5, CD, 0, CW + 0.5, -0.02, 0.18)} fill="#1d2a40" />
        </g>
      ))}
      <Roof ind={c.industry} z={zR} level={c.level} />
    </svg>
  );
}

/* ------------------------------------------------------------------ trading floor */

export function TradingFloor({ tickers }: { tickers: { t: string; up: boolean; px: string }[] }) {
  const items = tickers.slice(0, 14);
  const step = 84;
  const W = Math.max(1, items.length) * step;
  const band = (off: number) =>
    items.map((t, i) => (
      <g key={`${off}-${t.t}`} transform={`translate(${off + i * step} 0)`}>
        <text x="0" y="12" fontSize="9.5" fontWeight="800" fill="#f0c565" fontFamily="ui-monospace, monospace">{t.t}</text>
        <text x="27" y="12" fontSize="9.5" fill="#e9eef7" fontFamily="ui-monospace, monospace">{t.px}</text>
        <path d={t.up ? 'M64 11 l3.5 -6 l3.5 6 z' : 'M64 5 l3.5 6 l3.5 -6 z'} fill={t.up ? '#3dbb6c' : '#e2574c'} />
      </g>
    ));
  const chart = (seed: number, up: boolean) =>
    [...Array(12)].map((_, i) => `${i * 6},${22 - (up ? i * 1.2 : -i * 0.6) - hash01(seed, i) * 8}`).join(' ');
  const desks: ReactNode[] = [];
  for (let row = 0; row < 2; row++) {
    const y = 108 + row * 24;
    const n = row === 0 ? 7 : 6;
    const span = row === 0 ? 300 : 340;
    for (let i = 0; i < n; i++) {
      const x = 180 - span / 2 + (span / n) * (i + 0.5);
      const s = row === 0 ? 0.85 : 1;
      const seed = row * 10 + i;
      const glow = hash01(seed, 4) > 0.5 ? '#3dbb6c' : '#4a8fe0';
      desks.push(
        <g key={`${row}-${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-10" y="-14" width="9" height="7" rx="1" fill="#0b1424" stroke="#3a5079" strokeWidth="0.6" />
          <rect x="1" y="-14" width="9" height="7" rx="1" fill="#0b1424" stroke="#3a5079" strokeWidth="0.6" />
          <rect x="-9" y="-13" width="7" height="5" fill={glow} opacity="0.55" />
          <rect x="2" y="-13" width="7" height="5" fill={hash01(seed, 6) > 0.5 ? '#e2574c' : '#3dbb6c'} opacity="0.5" />
          <path d="M-18 -6 H18 L21 0 H-21 Z" fill="#5a4636" stroke={OUTLINE} strokeWidth="0.5" />
          <rect x="-21" y="0" width="42" height="5" fill="#3d2f24" />
          {/* traders, seen from behind */}
          {[-9, 9].map((dx, k) => {
            const sh = ['#26344f', '#e9eef7', '#2f5fa0', '#3a3f4a'][Math.floor(hash01(seed, k) * 4)];
            const hair = ['#2a1d14', '#5a3a22', '#c9a35a', '#1b1b1b'][Math.floor(hash01(seed, k + 7) * 4)];
            return (
              <g key={k} transform={`translate(${dx} 8)`}>
                <path d="M-7 8 Q-7 -1 0 -1 Q7 -1 7 8 Z" fill={sh} stroke={OUTLINE} strokeWidth="0.5" />
                <circle cy="-4.5" r="3.8" fill={hair} stroke={OUTLINE} strokeWidth="0.5" />
              </g>
            );
          })}
        </g>,
      );
    }
  }
  return (
    <svg viewBox="0 0 360 150" className="w-full block" role="img" aria-label="Trading floor">
      <defs>
        <linearGradient id="tf-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1a2f" />
          <stop offset="1" stopColor="#16294a" />
        </linearGradient>
        <linearGradient id="tf-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24324c" />
          <stop offset="1" stopColor="#141f33" />
        </linearGradient>
        <clipPath id="tf-band"><rect x="0" y="40" width="360" height="17" /></clipPath>
      </defs>
      <rect width="360" height="150" fill="url(#tf-wall)" />
      {/* columns */}
      {[18, 342].map((x) => <rect key={x} x={x - 10} y="0" width="20" height="96" fill="#1b2c49" stroke="#273a5a" />)}
      {/* exchange sign */}
      <rect x="92" y="6" width="176" height="22" rx="4" fill="#0b1424" stroke="#e3b04b" strokeWidth="1.2" />
      <path d="M100 22 l5 -9 l5 5 l5 -8" stroke="#e3b04b" strokeWidth="1.6" fill="none" />
      <text x="192" y="21" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#f0c565" letterSpacing="1.5">ASTORIA EXCHANGE</text>
      {/* LED ticker */}
      <rect x="0" y="39" width="360" height="19" fill="#05090f" stroke="#273a5a" />
      <g clipPath="url(#tf-band)">
        <g transform="translate(0 41)">
          <g className="iso-ticker" style={{ ['--tick' as string]: `-${W}px`, animationDuration: `${Math.max(12, items.length * 2.2)}s` }}>
            {band(6)}
            {band(6 + W)}
          </g>
        </g>
      </g>
      {/* big screens */}
      {[40, 135, 230].map((x, i) => {
        const up = items[i]?.up ?? i !== 1;
        return (
          <g key={x} transform={`translate(${x} 63)`}>
            <rect width="90" height="34" rx="2" fill="#0b1424" stroke="#3a5079" />
            <text x="5" y="9" fontSize="6.5" fontWeight="700" fill="#9aa9c4">{items[i]?.t ?? 'INDEX'}</text>
            <polyline transform="translate(14 4)" points={chart(i + 3, up)} fill="none" stroke={up ? '#3dbb6c' : '#e2574c'} strokeWidth="1.4" />
            {[...Array(6)].map((_, k) => (
              <rect key={k} x={6 + k * 13} y={30 - hash01(i, k) * 6} width="5" height={hash01(i, k) * 6 + 1} fill="#4a8fe0" opacity="0.6" />
            ))}
          </g>
        );
      })}
      {/* floor */}
      <path d="M0 96 H360 V150 H0 Z" fill="url(#tf-floor)" />
      <path d="M0 96 H360" stroke="#3a5079" />
      {desks}
    </svg>
  );
}

/* ------------------------------------------------------------------ portraits */

interface Look {
  skin: string; hair: string; hairStyle: 'slick' | 'bob' | 'short' | 'bun' | 'side' | 'bald';
  suit: string; tie?: string; blouse?: string; beard?: boolean; glasses?: boolean; grey?: boolean;
}
const LOOKS: Record<string, Look> = {
  kane: { skin: '#e0b08c', hair: '#2b2220', hairStyle: 'slick', suit: '#1f2633', tie: '#c0392b', grey: true },
  roth: { skin: '#f0c9a8', hair: '#d9b15c', hairStyle: 'bob', suit: '#2b3d5c', blouse: '#e9eef7' },
  vale: { skin: '#c99a76', hair: '#151515', hairStyle: 'short', suit: '#262a36', tie: '#8e44ad', beard: true, glasses: true },
  okafor: { skin: '#7a4a2e', hair: '#141010', hairStyle: 'bun', suit: '#c8651e', blouse: '#f3e6cf' },
  park: { skin: '#e8c19a', hair: '#1c1a1a', hairStyle: 'side', suit: '#2a3340', tie: '#27ae60' },
  // Tycoons (keys are fragments of their parody names)
  eusk: { skin: '#eac0a0', hair: '#3a2c22', hairStyle: 'short', suit: '#1b1e24', blouse: '#2b2f38' },
  saltman: { skin: '#f0cdb0', hair: '#6b4a32', hairStyle: 'short', suit: '#5f6b78', blouse: '#e8ebef' },
  bates: { skin: '#f2cfb3', hair: '#8a7356', hairStyle: 'side', suit: '#34495e', tie: '#5d8aa8', glasses: true },
  mambani: { skin: '#b07d58', hair: '#121212', hairStyle: 'slick', suit: '#f1ece2', tie: '#b9770e', grey: true },
  bozes: { skin: '#e4b896', hair: '#e4b896', hairStyle: 'bald', suit: '#22303f', blouse: '#9fb6cd' },
  muckerberg: { skin: '#f3d2b6', hair: '#5a3b26', hairStyle: 'short', suit: '#55606b', blouse: '#6c7a89' },
  juang: { skin: '#e6c09a', hair: '#1a1a1a', hairStyle: 'slick', suit: '#0f0f10', blouse: '#1e1e20', grey: true },
  wuffett: { skin: '#f0c7aa', hair: '#e8e8e8', hairStyle: 'side', suit: '#3a3f47', tie: '#7f1d1d', glasses: true },
};
function lookFor(name: string, color: string): Look {
  const key = Object.keys(LOOKS).find((k) => name.toLowerCase().includes(k));
  if (key) return LOOKS[key];
  const h = hash01(name.length, name.charCodeAt(0));
  return { skin: h > 0.5 ? '#d9a27a' : '#a8714e', hair: '#2a1d14', hairStyle: 'short', suit: '#26344f', tie: color };
}

export function Portrait({ rival, size = 64 }: { rival: Pick<Rival, 'name' | 'avatarColor'>; size?: number }) {
  const L = lookFor(rival.name, rival.avatarColor);
  const id = `pt-${rival.name.replace(/\W/g, '')}`;
  const skinD = shade(L.skin, 0.82);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0 rounded-full border-2 border-gold/80 shadow-card" role="img" aria-label={rival.name}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor={shade(rival.avatarColor, 0.75)} />
          <stop offset="1" stopColor="#0f1b30" />
        </radialGradient>
        <clipPath id={`${id}-c`}><circle cx="32" cy="32" r="32" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-c)`}>
        <rect width="64" height="64" fill={`url(#${id}-bg)`} />
        {/* skyline silhouette */}
        <path d="M0 44 V34 h6 v-8 h5 v12 h4 v-16 h6 v14 h22 v-10 h6 v-6 h5 v18 h10 V44 Z" fill="#000" opacity="0.18" />
        {/* hair behind head */}
        {L.hairStyle === 'bob' && <path d="M17 30 C15 14 49 14 47 30 L48 42 C44 44 20 44 16 42 Z" fill={L.hair} />}
        {L.hairStyle === 'bun' && <circle cx="32" cy="10.5" r="6" fill={L.hair} />}
        {/* body */}
        <path d="M4 64 C6 50 17 45 32 45 C47 45 58 50 60 64 Z" fill={L.suit} />
        <path d="M4 64 C6 50 17 45 32 45 L32 64 Z" fill="#fff" opacity="0.06" />
        {L.tie ? (
          <>
            <path d="M25 45 L32 56 L39 45 Z" fill="#e9eef7" />
            <path d="M30.3 47 L32 49 L33.7 47 L34.5 60 L32 63 L29.5 60 Z" fill={L.tie} />
          </>
        ) : (
          <path d="M25 45 Q32 54 39 45 Z" fill={L.blouse ?? '#e9eef7'} />
        )}
        <path d="M24 45 L30 58 L26 64 L19 50 Z M40 45 L34 58 L38 64 L45 50 Z" fill={shade(L.suit, 0.75)} />
        {/* neck and head */}
        <rect x="27.5" y="37" width="9" height="9" fill={skinD} />
        <ellipse cx="32" cy="28" rx="10.5" ry="12.5" fill={L.skin} />
        <ellipse cx="21.6" cy="29" rx="1.8" ry="2.8" fill={skinD} />
        <ellipse cx="42.4" cy="29" rx="1.8" ry="2.8" fill={skinD} />
        <path d="M32 40.5 C27 40.5 23 36 22 31 C24 37 28 39 32 39 C36 39 40 37 42 31 C41 36 37 40.5 32 40.5 Z" fill={skinD} opacity="0.6" />
        {/* face */}
        <path d="M25.5 25.2 q2.5 -1.6 5 0 M33.5 25.2 q2.5 -1.6 5 0" stroke={shade(L.hair, 0.9)} strokeWidth="1.1" fill="none" strokeLinecap="round" />
        <circle cx="28" cy="28.2" r="1.15" fill="#1b1b1b" />
        <circle cx="36" cy="28.2" r="1.15" fill="#1b1b1b" />
        <path d="M32 29 L30.8 33 L32.6 33.4" stroke={skinD} strokeWidth="0.9" fill="none" strokeLinecap="round" />
        <path d="M28.8 36 Q32 37.6 35.2 36" stroke="#8a4a3a" strokeWidth="1" fill="none" strokeLinecap="round" />
        {L.glasses && (
          <g stroke="#0b1424" strokeWidth="0.9" fill="#9fd0ff" fillOpacity="0.18">
            <rect x="24.3" y="25.8" width="7" height="5" rx="1.5" />
            <rect x="32.7" y="25.8" width="7" height="5" rx="1.5" />
            <path d="M31.3 27.6 h1.4" />
          </g>
        )}
        {L.beard && <path d="M22.5 31 C23 38 27 41 32 41 C37 41 41 38 41.5 31 C40 35 37 35.5 35 35 Q32 34 29 35 C27 35.5 24 35 22.5 31 Z" fill={L.hair} />}
        {/* hair on top */}
        {L.hairStyle === 'slick' && (
          <>
            <path d="M21.2 26 C20 13 44 11 42.8 26 C41 19 36 17.5 31 18 C26 18.5 23 21 21.2 26 Z" fill={L.hair} />
            {L.grey && <path d="M21.3 25 C21 22 22 20 23.5 19 L23 25 Z M42.7 25 C43 22 42 20 40.5 19 L41 25 Z" fill="#b8bcc4" />}
          </>
        )}
        {L.hairStyle === 'bob' && <path d="M20.5 27 C20 14 44 14 43.5 27 C41 20 34 19 30 20.5 C26 21.5 22.5 23 20.5 27 Z" fill={shade(L.hair, 1.1)} />}
        {L.hairStyle === 'short' && <path d="M21.5 24 C21 13 43 13 42.5 24 C40 19.5 24 19.5 21.5 24 Z" fill={L.hair} />}
        {L.hairStyle === 'bun' && <path d="M21.5 26 C20 14 44 14 42.5 26 C40 19 24 19 21.5 26 Z" fill={L.hair} />}
        {L.hairStyle === 'side' && <path d="M21.3 25.5 C20 12 45 12 42.8 25 C41 20 37 18.5 34 18.5 L29 22.5 C26 21 23 22 21.3 25.5 Z" fill={L.hair} />}
        {/* rim light */}
        <circle cx="32" cy="32" r="31" fill="none" stroke="#e3b04b" strokeOpacity="0.35" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ world map */

const ISLANDS = [
  { id: 'astoria', name: 'Astoria', d: 'M34 62 Q52 28 104 34 Q148 40 150 78 Q150 118 108 128 Q62 134 40 110 Q24 90 34 62 Z', lx: 92, ly: 84, land: '#3f8a52', flag: ['#2e5fa3', '#e9eef7'] },
  { id: 'nordland', name: 'Nordland', d: 'M196 34 Q226 10 284 20 Q326 30 320 62 Q314 92 270 96 Q222 98 204 76 Q188 56 196 34 Z', lx: 258, ly: 58, land: '#6f8a5a', flag: ['#c0392b', '#e9eef7'] },
  { id: 'bharatara', name: 'Bharatara', d: 'M26 172 Q48 146 100 150 Q140 156 142 190 Q140 228 98 236 Q54 240 34 216 Q18 196 26 172 Z', lx: 82, ly: 196, land: '#a3864a', flag: ['#f0a33a', '#3dbb6c'] },
  { id: 'meridian', name: 'East Meridian', d: 'M206 164 Q234 140 290 150 Q330 160 326 196 Q322 230 276 236 Q230 240 212 214 Q196 190 206 164 Z', lx: 266, ly: 196, land: '#4f8a7a', flag: ['#4a8fe0', '#e3b04b'] },
  { id: 'zanbel', name: 'Zanbel', d: 'M160 130 Q162 113 184 114 Q200 116 199 126 Q197 143 178 142 Q159 140 160 130 Z', lx: 180, ly: 120, land: '#5aa06a', flag: ['#2bb3a3', '#f0c565'] },
  { id: 'kestria', name: 'Kestria', d: 'M10 292 Q12 264 52 265 Q86 267 85 288 Q83 316 46 315 Q9 313 10 292 Z', lx: 48, ly: 282, land: '#8fa24a', flag: ['#3dbb6c', '#f3e6cf'] },
  { id: 'solvara', name: 'Solvara', d: 'M94 292 Q96 264 134 265 Q166 267 165 288 Q163 316 128 315 Q93 313 94 292 Z', lx: 130, ly: 282, land: '#c9a45a', flag: ['#1f7a4a', '#e9eef7'] },
  { id: 'varnholm', name: 'Varnholm', d: 'M176 292 Q178 264 216 265 Q248 267 247 288 Q245 316 210 315 Q175 313 176 292 Z', lx: 212, ly: 282, land: '#7a7f74', flag: ['#4a4f5a', '#e2574c'] },
  { id: 'tavora', name: 'Tavora', d: 'M258 292 Q260 264 298 265 Q330 267 329 288 Q327 316 292 315 Q257 313 258 292 Z', lx: 294, ly: 282, land: '#4f7a8a', flag: ['#7a4ae0', '#e9eef7'] },
];

function Crane({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke="#0c1525" strokeWidth="0.5">
      <rect x="-1.5" y="-26" width="3" height="26" fill="#e3b04b" />
      <rect x="-14" y="-28" width="26" height="3" fill="#e3b04b" />
      <path d="M8 -25 V-14" stroke="#c9d3e2" strokeWidth="0.7" />
      <rect x="5.5" y="-14" width="5" height="3" fill="#c0392b" />
    </g>
  );
}

function Ship({ x, y, flip }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M-14 8 Q0 11 14 8" stroke="#cfe6ff" strokeWidth="0.8" fill="none" opacity="0.5" />
      <path d="M-12 0 H12 L9 6 H-9 Z" fill="#7a2f2f" stroke="#0c1525" strokeWidth="0.5" />
      {[-8, -3, 2].map((cx, i) => <rect key={cx} x={cx} y="-4" width="4.5" height="4" fill={['#4a8fe0', '#e3b04b', '#3dbb6c'][i]} stroke="#0c1525" strokeWidth="0.4" />)}
      <rect x="7" y="-7" width="4" height="7" fill="#e9eef7" stroke="#0c1525" strokeWidth="0.4" />
    </g>
  );
}

function Landmarks({ id }: { id: string }) {
  switch (id) {
    case 'astoria':
      return (
        <g>
          <g transform="translate(78 54) scale(0.42)"><TechTower level={9} /></g>
          <g transform="translate(108 58) scale(0.36)"><Bank level={7} /></g>
          <g transform="translate(58 66) scale(0.32)"><TechTower level={4} /></g>
        </g>
      );
    case 'nordland':
      return (
        <g>
          <g transform="translate(250 34) scale(0.4)"><OilGas level={6} /></g>
          {[[214, 54], [222, 66], [292, 46], [300, 58], [284, 76]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(0.6)`}><Tree x={0} y={0} seed={4} /></g>
          ))}
        </g>
      );
    case 'bharatara':
      return (
        <g>
          <g transform="translate(76 168) scale(0.4)"><Factory level={8} /></g>
          <g transform="translate(108 176) scale(0.32)"><Factory level={2} /></g>
        </g>
      );
    case 'meridian':
      return (
        <g>
          <Crane x={300} y={196} />
          <Crane x={310} y={212} />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${238 + i * 9} ${180 - i * 4}) scale(0.5)`}>
              <Box x={0} y={0} w={1.6} d={0.7} h={0.6} c={['#c0392b', '#2e86c1', '#e3b04b'][i]} />
              <Box x={0} y={0} z={0.6} w={1.6} d={0.7} h={0.6} c={['#27ae60', '#c96a3c', '#4a8fe0'][i]} />
            </g>
          ))}
          <g transform="translate(270 168) scale(0.32)"><TechTower level={5} /></g>
        </g>
      );
    case 'kestria':
      return <g>{[[30, 284], [42, 296], [56, 282], [64, 298]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y}) scale(0.5)`}><Tree x={0} y={0} seed={i + 2} /></g>)}</g>;
    case 'solvara':
      return <g><g transform="translate(124 278) scale(0.34)"><OilGas level={5} /></g></g>;
    case 'varnholm':
      return <g><g transform="translate(204 278) scale(0.34)"><Factory level={6} /></g></g>;
    case 'tavora':
      return <g><g transform="translate(290 274) scale(0.3)"><TechTower level={6} /></g></g>;
    case 'zanbel':
      return <g><g transform="translate(176 126) scale(0.45)"><Tree x={0} y={0} seed={7} /></g></g>;
    default:
      return null;
  }
}

export function WorldMap({ selected, onSelect, marks }: { selected: string; onSelect: (id: string) => void; marks?: Record<string, string> }) {
  return (
    <svg viewBox="0 0 340 330" className="w-full block" role="group" aria-label="World map">
      <defs>
        <radialGradient id="wm-sea" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#2a6fa3" />
          <stop offset="1" stopColor="#123a5e" />
        </radialGradient>
        {ISLANDS.map((is) => (
          <linearGradient key={is.id} id={`wm-${is.id}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor={shade(is.land, 1.25)} />
            <stop offset="1" stopColor={shade(is.land, 0.85)} />
          </linearGradient>
        ))}
      </defs>
      <rect width="340" height="330" fill="url(#wm-sea)" />
      {[...Array(34)].map((_, i) => {
        const x = hash01(i, 11) * 330, y = hash01(i, 12) * 320;
        return <path key={i} d={`M${x} ${y} q3 -2.4 6 0 t6 0`} stroke="#9fd0ff" strokeWidth="0.8" fill="none" opacity="0.35" />;
      })}
      {/* trade routes */}
      <g stroke="#f0c565" strokeWidth="1.2" strokeDasharray="3 4" fill="none" opacity="0.6">
        <path d="M150 74 Q178 58 198 60" />
        <path d="M100 130 L92 150" />
        <path d="M148 104 Q182 150 210 176" />
        <path d="M262 98 L268 150" />
        <path d="M140 196 Q172 210 206 200" />
        <path d="M70 130 Q40 220 48 262" />
        <path d="M120 128 Q140 220 130 262" />
        <path d="M150 110 Q166 118 160 124" />
        <path d="M146 112 Q200 230 212 262" />
        <path d="M150 100 Q300 200 294 262" />
      </g>
      {ISLANDS.map((is) => {
        const active = selected === is.id;
        return (
          <g key={is.id} role="button" tabIndex={0} className="cursor-pointer" onClick={() => onSelect(is.id)} onKeyDown={(e) => e.key === 'Enter' && onSelect(is.id)} aria-label={is.name}>
            <path d={is.d} fill="#0b2a44" opacity="0.5" transform="translate(4 8)" />
            <path d={is.d} fill="#6d5236" transform="translate(0 5)" stroke="#0c1525" strokeWidth="0.8" />
            <path d={is.d} fill="#e6d29a" stroke="#cfe6ff" strokeOpacity="0.5" strokeWidth="3" />
            <path d={is.d} fill={`url(#wm-${is.id})`} transform={`translate(${is.lx * 0.08} ${is.ly * 0.08}) scale(0.92)`} />
            {active && <path d={is.d} fill="none" stroke="#e3b04b" strokeWidth="2.5" />}
            <Landmarks id={is.id} />
            <g transform={`translate(${is.lx - 34} ${is.ly + 14})`}>
              <line x1="0" y1="0" x2="0" y2="-14" stroke="#e9eef7" strokeWidth="0.8" />
              <rect x="0" y="-14" width="9" height="3" fill={is.flag[0]} />
              <rect x="0" y="-11" width="9" height="3" fill={is.flag[1]} />
            </g>
            <MapLabel x={is.lx} y={is.ly + 22} text={is.name} active={active} />
            {marks?.[is.id] && <circle cx={is.lx + is.name.length * 2.6 + 6} cy={is.ly + 19} r="3.6" fill={marks[is.id]} stroke="#0c1525" strokeWidth="0.8" />}
          </g>
        );
      })}
      <Ship x={160} y={150} />
      <Ship x={176} y={232} flip />
      <Ship x={20} y={140} flip />
      {/* compass */}
      <g transform="translate(316 128)">
        <circle r="13" fill="#0b1424" fillOpacity="0.6" stroke="#e3b04b" strokeOpacity="0.7" />
        <path d="M0 -11 L3 0 L0 11 L-3 0 Z" fill="#e9eef7" />
        <path d="M0 -11 L3 0 L-3 0 Z" fill="#e2574c" />
        <path d="M-11 0 L0 -2.5 L11 0 L0 2.5 Z" fill="#9aa9c4" />
        <text y="-15" textAnchor="middle" fontSize="6" fontWeight="800" fill="#f0c565">N</text>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ market mood mascots */

export function BullBadge({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <circle cx="20" cy="20" r="19" fill="#12301f" stroke="#3dbb6c" strokeWidth="1.5" />
      <path d="M8 12 Q6 6 11 5 Q10 9 14 12 Z M32 12 Q34 6 29 5 Q30 9 26 12 Z" fill="#f3e6cf" stroke="#0c1525" strokeWidth="0.7" />
      <path d="M12 12 Q20 8 28 12 Q31 20 26 27 Q20 33 14 27 Q9 20 12 12 Z" fill="#8a4a2a" stroke="#0c1525" strokeWidth="0.8" />
      <path d="M9 14 L13 15 L12 18 Z M31 14 L27 15 L28 18 Z" fill="#6e3a20" stroke="#0c1525" strokeWidth="0.6" />
      <ellipse cx="20" cy="27" rx="6" ry="4.2" fill="#d99a7a" stroke="#0c1525" strokeWidth="0.7" />
      <circle cx="17.8" cy="27.4" r="1" fill="#0c1525" />
      <circle cx="22.2" cy="27.4" r="1" fill="#0c1525" />
      <circle cx="16" cy="18" r="1.3" fill="#0c1525" />
      <circle cx="24" cy="18" r="1.3" fill="#0c1525" />
      <path d="M20 31 v3" stroke="#e3b04b" strokeWidth="1.2" />
      <circle cx="20" cy="34.5" r="1.6" fill="none" stroke="#e3b04b" strokeWidth="1" />
    </svg>
  );
}

export function BearBadge({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <circle cx="20" cy="20" r="19" fill="#361818" stroke="#e2574c" strokeWidth="1.5" />
      <circle cx="11" cy="11" r="4.5" fill="#5a3a26" stroke="#0c1525" strokeWidth="0.8" />
      <circle cx="29" cy="11" r="4.5" fill="#5a3a26" stroke="#0c1525" strokeWidth="0.8" />
      <circle cx="11" cy="11" r="2" fill="#a8714e" />
      <circle cx="29" cy="11" r="2" fill="#a8714e" />
      <ellipse cx="20" cy="21" rx="11" ry="10.5" fill="#6e4a30" stroke="#0c1525" strokeWidth="0.8" />
      <ellipse cx="20" cy="25.5" rx="5.5" ry="4.2" fill="#c99a76" stroke="#0c1525" strokeWidth="0.6" />
      <ellipse cx="20" cy="23.6" rx="2" ry="1.4" fill="#0c1525" />
      <path d="M18 27.5 Q20 26.5 22 27.5" stroke="#0c1525" strokeWidth="0.8" fill="none" />
      <circle cx="15.5" cy="18.5" r="1.3" fill="#0c1525" />
      <circle cx="24.5" cy="18.5" r="1.3" fill="#0c1525" />
    </svg>
  );
}
