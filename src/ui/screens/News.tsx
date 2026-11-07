import { useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import type { NewsCategory, NewsItem, WorldState } from '../../engine/types';
import { buildArticle, dateline, SECTION, storyScore, type ArtSpec } from '../article';
import { Box, P, Tile, Windows, pts } from '../art/iso';
import { GoodBuilding } from '../art/plants';
import { IconBack } from '../components/Icons';
import { cx } from '../components/core';

type Filter = 'all' | NewsCategory;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Front page' }, { id: 'player', label: 'You' }, { id: 'business', label: 'Business' }, { id: 'market', label: 'Markets' },
  { id: 'economy', label: 'Economy' }, { id: 'commodities', label: 'Commodities' }, { id: 'technology', label: 'Tech' },
];

const SERIF = { fontFamily: "Georgia, 'Times New Roman', 'Noto Serif', serif" };

/* ------------------------------------------------------------------ front page */

export function NewsScreen() {
  const w = useGame((s) => s.world)!;
  const back = useGame((s) => s.back);
  const push = useGame((s) => s.push);
  const [f, setF] = useState<Filter>('all');
  const open = (n: NewsItem) => push({ screen: 'article', id: n.id });

  const { top, pair, others, archive } = useMemo(() => {
    const list = w.news.filter((n) => f === 'all' || n.category === f);
    const recent = list.slice(0, 30).sort((a, b) => storyScore(w, b) - storyScore(w, a));
    const top = recent[0];
    const rest = recent.slice(1);
    // Two feature stories, preferring sections other than the top story's
    const pair: NewsItem[] = [];
    for (const n of rest) if (pair.length < 2 && n.category !== top?.category && !pair.some((p) => p.category === n.category)) pair.push(n);
    for (const n of rest) if (pair.length < 2 && !pair.includes(n)) pair.push(n);
    const others = rest.filter((n) => !pair.includes(n)).slice(0, 5);
    const used = new Set([top, ...pair, ...others].filter(Boolean).map((n) => n!.id));
    return { top, pair, others, archive: list.filter((n) => !used.has(n.id)) };
  }, [w.news, w.day, f]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center gap-2 px-2 h-14 border-b border-line bg-surface">
        <button aria-label="Back" onClick={back} className="size-tap grid place-items-center text-muted hover:text-text"><IconBack /></button>
        <div className="font-bold text-lg flex-1">Newspaper</div>
      </div>
      <div className="px-2 py-3">
        <article className="paper rounded-md shadow-[0_6px_24px_rgba(0,0,0,0.45)] px-3 pt-3 pb-4" style={SERIF}>
          <Masthead w={w} />
          <nav className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 py-2 border-b border-[var(--paper-rule)]" aria-label="Sections">
            {FILTERS.map((x) => (
              <button
                key={x.id}
                onClick={() => setF(x.id)}
                className={cx('shrink-0 px-2.5 min-h-9 text-xs font-bold uppercase tracking-wider rounded-sm border', f === x.id ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]' : 'border-[var(--paper-rule)] text-[var(--ink-2)]')}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {x.label}
              </button>
            ))}
          </nav>
          {!top && <p className="py-8 text-center text-[var(--ink-2)]">No stories in this section yet.</p>}
          {top && <TopStory n={top} w={w} onOpen={() => open(top)} />}
          {pair.length > 0 && (
            <div className="grid grid-cols-2 border-t-2 border-[var(--ink)] mt-3">
              {pair.map((n, i) => <Feature key={n.id} n={n} w={w} onOpen={() => open(n)} first={i === 0} />)}
            </div>
          )}
          {others.length > 0 && (
            <section className="border-t-2 border-[var(--ink)] mt-3 pt-2">
              <h2 className="text-sm font-black uppercase tracking-wider">Other headlines</h2>
              <div className="divide-y divide-[var(--paper-rule)]">
                {others.map((n) => <Brief key={n.id} n={n} w={w} onOpen={() => open(n)} />)}
              </div>
            </section>
          )}
          {archive.length > 0 && (
            <section className="border-t-2 border-[var(--ink)] mt-3 pt-2">
              <h2 className="text-sm font-black uppercase tracking-wider">Earlier editions</h2>
              <ul className="mt-1">
                {archive.slice(0, 40).map((n) => (
                  <li key={n.id}>
                    <button onClick={() => open(n)} className="w-full text-left py-2 min-h-tap border-b border-[var(--paper-rule)] flex gap-2 items-baseline">
                      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0 w-16" style={{ color: SECTION[n.category].color, fontFamily: 'var(--font-sans)' }}>{SECTION[n.category].label}</span>
                      <span className="text-sm leading-snug flex-1">{n.headline}</span>
                      <span className="text-[10px] text-[var(--ink-2)] shrink-0" style={{ fontFamily: 'var(--font-sans)' }}>D{n.day}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <footer className="mt-4 pt-2 border-t border-[var(--ink)] text-center text-xs italic text-[var(--ink-2)]">
            Stronger companies · A richer Astoria
          </footer>
        </article>
      </div>
    </div>
  );
}

function weather(w: WorldState): { icon: string; label: string } {
  const m = w.macro;
  if (m.growth < 0) return { icon: '⛈', label: 'Stormy' };
  if (m.inflation > 0.045) return { icon: '🌡', label: 'Overheating' };
  if (m.growth > 0.025 && m.confidence > 0.55) return { icon: '☀', label: 'Sunny' };
  return { icon: '⛅', label: 'Cloudy' };
}

function Masthead({ w }: { w: WorldState }) {
  const wx = weather(w);
  return (
    <header>
      <div className="flex items-end justify-between gap-2 text-[10px] leading-tight text-[var(--ink-2)]">
        <span className="italic w-20">All the news that matters</span>
        <span className="text-right w-20">
          <span className="text-base not-italic" aria-hidden>{wx.icon}</span> {wx.label}
          <span className="block">Economy {(w.macro.growth * 100).toFixed(1)}%</span>
        </span>
      </div>
      <h1 className="text-center font-black leading-none tracking-tight text-[34px] mt-1" style={{ fontFamily: "'Old English Text MT', 'UnifrakturMaguntia', Georgia, serif" }}>
        The Astoria Times
      </h1>
      <div className="mt-2 border-y-2 border-[var(--ink)] py-1 flex justify-between text-[11px]" style={{ borderStyle: 'double', borderTopWidth: 3, borderBottomWidth: 3 }}>
        <span>Vol. {Math.floor(w.day / 360) + 1} · No. {w.day}</span>
        <span className="font-bold">{dateline(w.day)}</span>
        <span>$1.00</span>
      </div>
    </header>
  );
}

function Label({ text, color }: { text: string; color: string }) {
  return (
    <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white rounded-[2px]" style={{ background: color, fontFamily: 'var(--font-sans)' }}>
      {text}
    </span>
  );
}

function ReadMore({ color, onClick, small }: { color: string; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cx('inline-flex items-center gap-1 text-white font-semibold rounded-[2px] min-h-9', small ? 'px-2 text-xs' : 'px-3 text-sm')}
      style={{ background: color }}
    >
      Read more <span aria-hidden>→</span>
    </button>
  );
}

function TopStory({ n, w, onOpen }: { n: NewsItem; w: WorldState; onOpen: () => void }) {
  const a = useMemo(() => buildArticle(w, n), [n.id, w.day]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="pt-3 cursor-pointer" onClick={onOpen}>
      <Label text="Top story" color="#b8323d" />
      <h2 className="text-[26px] leading-[1.05] font-black mt-1.5">{n.headline}</h2>
      <p className="italic text-[15px] leading-snug mt-1.5 text-[var(--ink-2)]">{a.deck}</p>
      <div className="mt-2 border border-[var(--paper-rule)]"><NewsArt art={a.art} tone={n.tone} /></div>
      <p className="text-[13px] leading-relaxed mt-2 line-clamp-4">{a.paragraphs.slice(0, 2).join(' ')}</p>
      <div className="mt-2"><ReadMore color="#2d5b8c" onClick={onOpen} /></div>
    </section>
  );
}

function Feature({ n, w, onOpen, first }: { n: NewsItem; w: WorldState; onOpen: () => void; first: boolean }) {
  const a = useMemo(() => buildArticle(w, n), [n.id, w.day]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={cx('pt-2 flex flex-col cursor-pointer', first ? 'pr-2 border-r border-[var(--paper-rule)]' : 'pl-2')} onClick={onOpen}>
      <div><Label text={a.kicker} color={a.color} /></div>
      <h3 className="text-[16px] leading-tight font-black mt-1">{n.headline}</h3>
      <p className="italic text-[12px] leading-snug mt-1 text-[var(--ink-2)]">{a.deck}</p>
      <div className="mt-1.5 border border-[var(--paper-rule)]"><NewsArt art={a.art} tone={n.tone} compact /></div>
      <p className="text-[12px] leading-snug mt-1.5 line-clamp-4 flex-1">{n.body}</p>
      <div className="mt-2"><ReadMore color={a.color} onClick={onOpen} small /></div>
    </section>
  );
}

function Brief({ n, w, onOpen }: { n: NewsItem; w: WorldState; onOpen: () => void }) {
  const a = useMemo(() => buildArticle(w, n), [n.id, w.day]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button onClick={onOpen} className="w-full text-left flex gap-2.5 py-2.5">
      <span className="w-[92px] shrink-0 border border-[var(--paper-rule)] self-start"><NewsArt art={a.art} tone={n.tone} compact /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: a.color, fontFamily: 'var(--font-sans)' }}>{a.kicker} · {dateline(n.day)}</span>
        <span className="block text-[15px] leading-tight font-bold mt-0.5">{n.headline}</span>
        <span className="block text-[12px] leading-snug mt-0.5 text-[var(--ink-2)] line-clamp-2">{n.body}</span>
        <span className="block text-right text-[12px] font-semibold mt-0.5" style={{ color: a.color }}>Read more →</span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ article */

export function ArticleScreen({ id }: { id: string }) {
  const w = useGame((s) => s.world)!;
  const back = useGame((s) => s.back);
  const push = useGame((s) => s.push);
  const n = w.news.find((x) => x.id === id);
  const a = useMemo(() => (n ? buildArticle(w, n) : null), [id, w.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = n ? w.news.filter((x) => x.id !== id && x.category === n.category).slice(0, 3) : [];

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center gap-2 px-2 h-14 border-b border-line bg-surface">
        <button aria-label="Back" onClick={back} className="size-tap grid place-items-center text-muted hover:text-text"><IconBack /></button>
        <div className="font-bold text-lg flex-1">The Astoria Times</div>
      </div>
      <div className="px-2 py-3">
        <article className="paper rounded-md shadow-[0_6px_24px_rgba(0,0,0,0.45)] px-4 pt-4 pb-5" style={SERIF}>
          {!n || !a ? (
            <p className="py-8 text-center">This story is no longer in the archive.</p>
          ) : (
            <>
              <Label text={a.kicker} color={a.color} />
              <h1 className="text-[28px] leading-[1.05] font-black mt-2">{a.headline}</h1>
              <p className="italic text-[16px] leading-snug mt-2 text-[var(--ink-2)]">{a.deck}</p>
              <p className="text-[11px] mt-2 pb-2 border-b border-[var(--paper-rule)] text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>{a.byline}</p>
              <figure className="mt-3 border border-[var(--paper-rule)]">
                <NewsArt art={a.art} tone={n.tone} />
              </figure>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
                {a.paragraphs.map((p, i) => (
                  <p key={i} className={i === 0 && /^[A-Za-z]/.test(p) ? 'first-letter:float-left first-letter:text-[44px] first-letter:leading-[0.85] first-letter:font-black first-letter:mr-1.5 first-letter:mt-1' : undefined}>
                    {p.startsWith('What it means for you:') ? <><b>What it means for you:</b>{p.slice('What it means for you:'.length)}</> : p}
                  </p>
                ))}
              </div>
              <blockquote className="my-4 border-y-2 border-[var(--ink)] py-3 text-center">
                <p className="text-[18px] italic leading-snug">“{a.quote.text}”</p>
                <footer className="text-[11px] mt-1.5 text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>— {a.quote.who}</footer>
              </blockquote>
              {a.facts.length > 0 && (
                <aside className="bg-[var(--paper-2)] border border-[var(--paper-rule)] p-3" style={{ fontFamily: 'var(--font-sans)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-2)]">By the numbers</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-1.5">
                    {a.facts.map((f) => (
                      <div key={f.label}>
                        <div className="text-[11px] text-[var(--ink-2)]">{f.label}</div>
                        <div className="text-[15px] font-bold num">{f.value}</div>
                      </div>
                    ))}
                  </div>
                </aside>
              )}
              {a.links.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3" style={{ fontFamily: 'var(--font-sans)' }}>
                  {a.links.map((l) => (
                    <button key={l.label} onClick={() => push(l.route)} className="px-3 min-h-tap rounded-[2px] text-sm font-semibold text-white" style={{ background: a.color }}>
                      {l.label} →
                    </button>
                  ))}
                </div>
              )}
              {more.length > 0 && (
                <section className="mt-5 border-t-2 border-[var(--ink)] pt-2">
                  <h2 className="text-sm font-black uppercase tracking-wider">More in {a.kicker}</h2>
                  {more.map((x) => (
                    <button key={x.id} onClick={() => push({ screen: 'article', id: x.id })} className="w-full text-left py-2 min-h-tap border-b border-[var(--paper-rule)]">
                      <span className="block text-[15px] font-bold leading-tight">{x.headline}</span>
                      <span className="block text-[11px] text-[var(--ink-2)] mt-0.5" style={{ fontFamily: 'var(--font-sans)' }}>{dateline(x.day)}</span>
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
        </article>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ illustrations */

export function NewsArt({ art, tone, compact }: { art: ArtSpec; tone: NewsItem['tone']; compact?: boolean }) {
  const stormy = tone === 'bad';
  const sky = stormy ? ['#5d6b80', '#9aa6b6'] : tone === 'good' ? ['#4f9ad8', '#bfe0f5'] : ['#79a8d0', '#d5e6f0'];
  const id = `sky-${art.kind}-${tone}`;
  let scene: ReactNode;
  switch (art.kind) {
    case 'plant':
      scene = (
        <g transform="translate(0 -6) scale(1.25)">
          <ellipse cx="0" cy="22" rx="62" ry="24" fill="#5f9a54" />
          <GoodBuilding good={art.good} level={art.level} />
        </g>
      );
      break;
    case 'tech':
      scene = (
        <g transform="translate(0 -6) scale(1.25)">
          <ellipse cx="0" cy="22" rx="62" ry="24" fill="#5f9a54" />
          <GoodBuilding good="chips" level={4} />
        </g>
      );
      break;
    case 'market':
      scene = <MarketBoard up={art.up} />;
      break;
    case 'player':
      scene = <Skyline up gold />;
      break;
    case 'economy':
      scene = <Skyline up={art.up} />;
      break;
  }
  return (
    <svg viewBox="-90 -64 180 112" className="w-full block" role="img" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect x="-90" y="-64" width="180" height="112" fill={`url(#${id})`} />
      {stormy ? (
        <g fill="#4a5466" opacity="0.9">
          <ellipse cx="-50" cy="-46" rx="22" ry="8" />
          <ellipse cx="-34" cy="-50" rx="16" ry="9" />
          <ellipse cx="44" cy="-44" rx="24" ry="8" />
          {!compact && <path d="M-40 -38 l-5 9 h5 l-4 9" stroke="#f6d98a" strokeWidth="1.4" fill="none" />}
        </g>
      ) : (
        <g>
          <circle cx="62" cy="-44" r="9" fill="#f6d98a" />
          <ellipse cx="-48" cy="-44" rx="16" ry="5" fill="#fff" opacity="0.8" />
          <ellipse cx="-36" cy="-47" rx="10" ry="5" fill="#fff" opacity="0.8" />
        </g>
      )}
      {scene}
    </svg>
  );
}

function Skyline({ up, gold }: { up: boolean; gold?: boolean }) {
  const towers: [number, number, number, string][] = [
    [-3.2, 0.2, 2.6, '#5d7fa8'], [-1.6, -0.8, 3.6, '#4a6fa5'], [0.2, -1.6, 4.6, '#3a5f95'], [1.2, 0.4, 2.4, '#6c8fb8'], [-0.6, 1.4, 1.8, '#8aa2c0'], [2.4, -0.6, 3.2, '#5578a8'],
  ];
  const sorted = [...towers].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  return (
    <g transform="translate(0 10) scale(0.78)">
      <polygon points={pts(P(-4, -2.5), P(4, -2.5), P(4, 3), P(-4, 3))} fill="#5f9a54" />
      <Tile x={-4} y={2.2} w={8} d={0.8} fill="#3a4254" />
      {sorted.map(([x, y, h, c], i) => (
        <g key={i}>
          <Box x={x} y={y} w={1.1} d={1.1} h={h} c={gold && i === sorted.length - 2 ? '#c9a24a' : c} />
          <Windows face="left" x={x} y={y} w={1.1} d={1.1} h={h} rows={Math.round(h * 2)} cols={3} color="#f6e7a8" dark="#2b3f60" seed={i + 3} />
          <Windows face="right" x={x} y={y} w={1.1} d={1.1} h={h} rows={Math.round(h * 2)} cols={3} color="#d9c98a" dark="#22344f" seed={i + 9} />
        </g>
      ))}
      <path d={up ? 'M-70 30 L-40 14 L-20 20 L10 -4 L30 2 L58 -22' : 'M-70 -22 L-40 -6 L-20 -12 L10 10 L30 4 L58 26'} stroke={up ? '#2f9d55' : '#c8433a'} strokeWidth="3.2" fill="none" strokeLinejoin="round" opacity="0.9" />
      <path d={up ? 'M52 -24 L60 -23 L57 -15' : 'M52 28 L60 27 L57 19'} stroke={up ? '#2f9d55' : '#c8433a'} strokeWidth="3.2" fill="none" />
    </g>
  );
}

function MarketBoard({ up }: { up: boolean }) {
  const bars = [10, 16, 12, 20, 18, 26, 22, 30];
  const vals = up ? bars : [...bars].reverse();
  const col = up ? '#2f9d55' : '#c8433a';
  return (
    <g>
      <rect x="-70" y="-38" width="140" height="80" rx="3" fill="#13223b" stroke="#2a2622" strokeWidth="1.5" />
      <text x="-62" y="-26" fontSize="8" fontWeight="800" fill="#e3b04b" fontFamily="var(--font-sans)">ASTORIA EXCHANGE</text>
      {vals.map((v, i) => <rect key={i} x={-60 + i * 15} y={32 - v * 1.6} width="9" height={v * 1.6} fill={col} opacity="0.75" />)}
      <polyline points={vals.map((v, i) => `${-55.5 + i * 15},${28 - v * 1.6}`).join(' ')} fill="none" stroke="#f6f4ee" strokeWidth="1.8" />
      <text x="62" y="-24" textAnchor="end" fontSize="14" fontWeight="900" fill={col} fontFamily="var(--font-sans)">{up ? '▲' : '▼'}</text>
    </g>
  );
}
