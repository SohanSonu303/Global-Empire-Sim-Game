/**
 * Isometric SVG toolkit (2:1 projection). Grid units: x runs down-right, y runs down-left,
 * z is height. Faces facing +x (right) and +y (left) are the visible sides.
 */
import type { ReactNode } from 'react';

export const K = 14; // half tile width in px
export const OUTLINE = '#0c1525';

export function P(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * K, ((x + y) * K) / 2 - z * K];
}
export function pts(...p: [number, number][]): string {
  return p.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' ');
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Deterministic pseudo-random in [0,1) from integers. */
export function hash01(a: number, b = 0, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface BoxProps {
  x: number; y: number; z?: number; w: number; d: number; h: number;
  c: string; top?: string; left?: string; right?: string; sw?: number; stroke?: string;
}
export function Box({ x, y, z = 0, w, d, h, c, top, left, right, sw = 0.6, stroke = OUTLINE }: BoxProps) {
  const t = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)] as [number, number][];
  const r = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)] as [number, number][];
  const l = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)] as [number, number][];
  return (
    <g stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
      <polygon points={pts(...l)} fill={left ?? shade(c, 0.86)} />
      <polygon points={pts(...r)} fill={right ?? shade(c, 0.66)} />
      <polygon points={pts(...t)} fill={top ?? shade(c, 1.12)} />
    </g>
  );
}

/** A quad lying on a box face. u runs along the face, v up. */
export function faceQuad(face: 'left' | 'right', x: number, y: number, z: number, w: number, d: number, u0: number, u1: number, v0: number, v1: number) {
  const f = face === 'left' ? (u: number, v: number) => P(x + u, y + d, z + v) : (u: number, v: number) => P(x + w, y + u, z + v);
  return pts(f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1));
}

/** Grid of windows on a box face. */
export function Windows({
  face, x, y, z = 0, w, d, h, rows, cols, color = '#9fd0ff', dark = '#1d3556', mx = 0.12, my = 0.12, seed = 1, litRatio = 0.7,
}: {
  face: 'left' | 'right'; x: number; y: number; z?: number; w: number; d: number; h: number; rows: number; cols: number;
  color?: string; dark?: string; mx?: number; my?: number; seed?: number; litRatio?: number;
}) {
  const span = face === 'left' ? w : d;
  const cw = (span - mx * 2) / cols;
  const rh = (h - my * 2) / rows;
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = mx + c * cw + cw * 0.16;
      const u1 = mx + (c + 1) * cw - cw * 0.16;
      const v0 = my + r * rh + rh * 0.18;
      const v1 = my + (r + 1) * rh - rh * 0.18;
      const lit = hash01(seed, r, c) < litRatio;
      out.push(<polygon key={`${r}-${c}`} points={faceQuad(face, x, y, z, w, d, u0, u1, v0, v1)} fill={lit ? (face === 'left' ? color : shade(color, 0.8)) : dark} />);
    }
  }
  return <g>{out}</g>;
}

/** Vertical cylinder centred at (cx, cy). */
export function Cyl({ cx, cy, z = 0, r, h, c, top, stripes, sw = 0.6 }: { cx: number; cy: number; z?: number; r: number; h: number; c: string; top?: string; stripes?: string; sw?: number }) {
  const [bx, by] = P(cx, cy, z);
  const [, ty] = P(cx, cy, z + h);
  const rx = r * K * Math.SQRT2;
  const ry = rx / 2;
  const id = `cyl${Math.round(hash01(Math.round(cx * 100), Math.round(cy * 100), Math.round(h * 100)) * 1e9)}`;
  const body = `M${bx - rx},${ty} L${bx - rx},${by} A${rx},${ry} 0 0 0 ${bx + rx},${by} L${bx + rx},${ty} Z`;
  const bands: ReactNode[] = [];
  if (stripes) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const y0 = ty + ((by - ty) * (i * 2 + 0.5)) / (n * 2);
      const y1 = y0 + (by - ty) / (n * 2);
      bands.push(<path key={i} d={`M${bx - rx},${y0} A${rx},${ry} 0 0 0 ${bx + rx},${y0} L${bx + rx},${y1} A${rx},${ry} 0 0 1 ${bx - rx},${y1} Z`} fill={stripes} />);
    }
  }
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path d={body} fill={c} stroke={OUTLINE} strokeWidth={sw} />
      {bands}
      <path d={body} fill={`url(#${id})`} />
      <ellipse cx={bx} cy={ty} rx={rx} ry={ry} fill={top ?? shade(c, 1.15)} stroke={OUTLINE} strokeWidth={sw} />
    </g>
  );
}

/** Gable roof along the x axis (ridge parallel to x) or y axis. */
export function Gable({ x, y, z, w, d, h, c, axis = 'y' }: { x: number; y: number; z: number; w: number; d: number; h: number; c: string; axis?: 'x' | 'y' }) {
  if (axis === 'y') {
    // ridge runs along y at x + w/2; triangle visible on the left (y = y + d) face
    const a = P(x, y, z), b = P(x + w, y, z), cc = P(x + w, y + d, z), dd = P(x, y + d, z);
    const r0 = P(x + w / 2, y, z + h), r1 = P(x + w / 2, y + d, z + h);
    return (
      <g stroke={OUTLINE} strokeWidth={0.6} strokeLinejoin="round">
        <polygon points={pts(a, r0, r1, dd)} fill={shade(c, 1.05)} />
        <polygon points={pts(b, cc, r1, r0)} fill={shade(c, 0.7)} />
        <polygon points={pts(dd, cc, r1)} fill={shade(c, 0.9)} />
      </g>
    );
  }
  const a = P(x, y, z), b = P(x + w, y, z), cc = P(x + w, y + d, z), dd = P(x, y + d, z);
  const r0 = P(x, y + d / 2, z + h), r1 = P(x + w, y + d / 2, z + h);
  return (
    <g stroke={OUTLINE} strokeWidth={0.6} strokeLinejoin="round">
      <polygon points={pts(a, b, r1, r0)} fill={shade(c, 1.1)} />
      <polygon points={pts(dd, cc, r1, r0)} fill={shade(c, 0.88)} />
      <polygon points={pts(b, cc, r1)} fill={shade(c, 0.68)} />
    </g>
  );
}

export function Tree({ x, y, z = 0, s = 1, seed = 0 }: { x: number; y: number; z?: number; s?: number; seed?: number }) {
  const [px, py] = P(x, y, z);
  const greens = ['#2f7d4a', '#3a8f55', '#2a6e42', '#46a05e'];
  const g = greens[Math.floor(hash01(seed, 7) * greens.length)];
  const tall = hash01(seed, 3) > 0.6;
  return (
    <g transform={`translate(${px} ${py}) scale(${s})`}>
      <ellipse cx="1" cy="0.5" rx="6" ry="2.6" fill="#000" opacity="0.22" />
      <rect x="-1" y="-7" width="2" height="7" fill="#5b3b23" />
      {tall ? (
        <>
          <path d="M0 -24 L7 -6 H-7 Z" fill={shade(g, 0.85)} stroke={OUTLINE} strokeWidth="0.5" />
          <path d="M0 -24 L7 -6 H0 Z" fill={shade(g, 0.65)} />
        </>
      ) : (
        <>
          <circle cx="0" cy="-12" r="7" fill={g} stroke={OUTLINE} strokeWidth="0.5" />
          <circle cx="-2.5" cy="-14" r="3.4" fill={shade(g, 1.25)} />
          <path d="M0 -19 A7 7 0 0 1 0 -5 A6 7 0 0 0 0 -19" fill={shade(g, 0.7)} />
        </>
      )}
    </g>
  );
}

export function Person({ x, y, z = 0, shirt = '#2f5fa0', hat, s = 1 }: { x: number; y: number; z?: number; shirt?: string; hat?: string; s?: number }) {
  const [px, py] = P(x, y, z);
  return (
    <g transform={`translate(${px} ${py}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="3" ry="1.3" fill="#000" opacity="0.25" />
      <rect x="-1.8" y="-4" width="1.5" height="4" fill="#26324a" />
      <rect x="0.3" y="-4" width="1.5" height="4" fill="#1d283d" />
      <rect x="-2.6" y="-9.5" width="5.2" height="6" rx="1.6" fill={shirt} stroke={OUTLINE} strokeWidth="0.4" />
      <circle cx="0" cy="-11.6" r="2.3" fill="#d9a27a" stroke={OUTLINE} strokeWidth="0.4" />
      {hat && <path d="M-2.6 -12.3 A2.6 2.4 0 0 1 2.6 -12.3 Z" fill={hat} stroke={OUTLINE} strokeWidth="0.4" />}
    </g>
  );
}

export function Smoke({ x, y, z, delay = 0 }: { x: number; y: number; z: number; delay?: number }) {
  const [px, py] = P(x, y, z);
  return (
    <g transform={`translate(${px} ${py})`} className="iso-smoke" style={{ animationDelay: `${delay}s` }}>
      <circle cx="0" cy="-3" r="3.2" fill="#c9d1dd" opacity="0.75" />
      <circle cx="3" cy="-8" r="4" fill="#b7c0ce" opacity="0.6" />
      <circle cx="7" cy="-14" r="5" fill="#a7b1c1" opacity="0.4" />
    </g>
  );
}

export function Car({ x, y, c = '#d94f4f', axis = 'x' }: { x: number; y: number; c?: string; axis?: 'x' | 'y' }) {
  return axis === 'x' ? (
    <g>
      <Box x={x} y={y} w={0.7} d={0.38} h={0.18} c={c} sw={0.4} />
      <Box x={x + 0.15} y={y + 0.04} z={0.18} w={0.38} d={0.3} h={0.14} c="#cfe6ff" sw={0.4} />
    </g>
  ) : (
    <g>
      <Box x={x} y={y} w={0.38} d={0.7} h={0.18} c={c} sw={0.4} />
      <Box x={x + 0.04} y={y + 0.15} z={0.18} w={0.3} d={0.38} h={0.14} c="#cfe6ff" sw={0.4} />
    </g>
  );
}

/** Flat diamond tile on the ground. */
export function Tile({ x, y, w = 1, d = 1, fill, stroke }: { x: number; y: number; w?: number; d?: number; fill: string; stroke?: string }) {
  return <polygon points={pts(P(x, y), P(x + w, y), P(x + w, y + d), P(x, y + d))} fill={fill} stroke={stroke} strokeWidth={stroke ? 0.4 : 0} />;
}
