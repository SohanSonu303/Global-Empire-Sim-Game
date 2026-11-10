import { useMemo } from 'react';
import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { opportunities } from '../../engine/advisor';
import { OUTLOOK, sectorOutlook, stockChange } from '../../engine/press';
import { fmtMoney, fmtPct } from '../../engine/news';
import type { StockCall, WorldState } from '../../engine/types';
import { Card, SectionTitle, cx } from '../components/core';

const SANS = { fontFamily: 'var(--font-sans)' };
const UP = '#2f7d4a';
const DOWN = '#b8323d';

/** The newspaper's markets pages: the index, movers, the Tipster's calls, Industry Watch and where to found. */
export function MarketWatch({ w }: { w: WorldState }) {
  const push = useGame((s) => s.push);
  const data = useMemo(() => {
    const h = w.marketIndexHist;
    const week = h.length > 7 ? w.marketIndex / h[h.length - 8].value - 1 : 0;
    const live = w.stocks.filter((s) => !s.halted).map((s) => ({ s, ch: stockChange(s, 7), name: w.companies.find((c) => c.id === s.companyId)?.name ?? s.ticker }));
    live.sort((a, b) => b.ch - a.ch);
    const calls = [...(w.play.calls ?? [])].sort((a, b) => b.day - a.day);
    return {
      week,
      up: live.slice(0, 3),
      down: live.slice(-3).reverse(),
      open: calls.filter((k) => !k.broke),
      past: calls.filter((k) => k.broke).slice(0, 4),
      sectors: sectorOutlook(w),
      opps: opportunities(w).filter((o) => !o.tags.includes('yours') && o.margin > 0).slice(0, 3),
    };
  }, [w.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const sc = w.play.callScore;
  const mood = w.marketMood > 0.6 ? 'Bullish' : w.marketMood < 0.4 ? 'Bearish' : 'Calm';

  return (
    <section className="border-t-2 border-[var(--ink)] mt-3 pt-2">
      <h2 className="text-sm font-black uppercase tracking-wider">Market Watch</h2>
      <div className="grid grid-cols-3 gap-2 mt-2 text-center" style={SANS}>
        <Fact label="Exchange index" value={Math.round(w.marketIndex).toLocaleString()} />
        <Fact label="This week" value={`${data.week >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(data.week), 1)}`} color={data.week >= 0 ? UP : DOWN} />
        <Fact label="Investors" value={mood} color={mood === 'Bullish' ? UP : mood === 'Bearish' ? DOWN : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <Movers title="Up this week" list={data.up} onOpen={(t) => push({ screen: 'stock', ticker: t })} />
        <Movers title="Down this week" list={data.down} onOpen={(t) => push({ screen: 'stock', ticker: t })} />
      </div>

      <h3 className="text-[15px] font-black mt-4">The Tipster</h3>
      <p className="text-[12px] italic text-[var(--ink-2)] leading-snug">
        What our desk hears, and the numbers behind it. Tips are guesses: a story may come true or fall through.
        {sc && sc.total > 0 ? ` So far ${sc.right} of ${sc.total} calls were right (${fmtPct(sc.right / sc.total, 0)}).` : ' About half come true.'}
      </p>
      {data.open.length === 0 && <p className="text-[13px] mt-2 text-[var(--ink-2)]">No open tips this week. A new one comes most weeks.</p>}
      <div className="divide-y divide-[var(--paper-rule)]">
        {data.open.map((k) => <Call key={k.id} k={k} w={w} onOpen={() => push({ screen: 'stock', ticker: k.ticker })} />)}
      </div>
      {data.past.length > 0 && (
        <div className="mt-2 bg-[var(--paper-2)] border border-[var(--paper-rule)] p-2" style={SANS}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-2)]">Recent tips</div>
          {data.past.map((k) => <PastCall key={k.id} k={k} w={w} onOpen={() => push({ screen: 'stock', ticker: k.ticker })} />)}
        </div>
      )}

      <h3 className="text-[15px] font-black mt-4">Industry Watch</h3>
      <p className="text-[12px] italic text-[var(--ink-2)] leading-snug">
        Where each industry is heading, from demand, shortages, prices, margins, newcomers and wages. Growing industries
        lift profits, and over time share prices follow profits.
      </p>
      <div className="divide-y divide-[var(--paper-rule)] mt-1">
        {data.sectors.map((s) => {
          const o = OUTLOOK[s.outlook];
          const col = o.tone === 'good' ? UP : o.tone === 'bad' ? DOWN : 'var(--ink-2)';
          return (
            <button key={s.industry} onClick={() => push({ screen: 'planner', industry: s.industry })} className="w-full text-left py-2 min-h-tap flex gap-2 items-start">
              <span className="w-8 shrink-0 text-[13px] font-black text-center" style={{ color: col, ...SANS }}>{o.arrow}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold">{s.name}</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider shrink-0" style={{ color: col, ...SANS }}>{o.label}</span>
                </span>
                <span className="block text-[12px] leading-snug text-[var(--ink-2)]">{s.summary}</span>
                <span className="block text-[11px] mt-0.5 text-[var(--ink-2)]" style={SANS}>
                  Shares {s.stocks30 >= 0 ? '+' : ''}{fmtPct(s.stocks30, 1)} in 30 days{s.best ? ` · watch ${GOODS[s.best].name.toLowerCase()}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {data.opps.length > 0 && (
        <>
          <h3 className="text-[15px] font-black mt-4">Where to start a company</h3>
          <p className="text-[12px] italic text-[var(--ink-2)] leading-snug">Markets with room for a newcomer today, by expected margin and demand.</p>
          <div className="divide-y divide-[var(--paper-rule)] mt-1">
            {data.opps.map((o) => (
              <button key={o.good} onClick={() => push({ screen: 'planner', good: o.good })} className="w-full text-left py-2 min-h-tap">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold">{GOODS[o.good].name}</span>
                  <span className="text-[12px] font-bold" style={{ color: UP, ...SANS }}>~{fmtPct(o.margin, 0)} margin</span>
                </span>
                <span className="block text-[12px] leading-snug text-[var(--ink-2)]">
                  {o.reason} Costs about {fmtMoney(o.foundCost + o.licence)} to start{Number.isFinite(o.paybackDays) ? `, pays back in about ${Math.max(1, Math.round(o.paybackDays / 30))} months` : ''}.
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="text-[11px] italic text-[var(--ink-2)] mt-3 text-center">Not financial advice. Spread your money: no tip is a sure thing.</p>
    </section>
  );
}


function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-[var(--paper-rule)] bg-[var(--paper-2)] py-1.5 px-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2)]">{label}</div>
      <div className="text-[15px] font-bold num" style={{ color }}>{value}</div>
    </div>
  );
}

function Movers({ title, list, onOpen }: { title: string; list: { s: { ticker: string }; ch: number; name: string }[]; onOpen: (t: string) => void }) {
  return (
    <div style={SANS}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-2)]">{title}</div>
      {list.map(({ s, ch, name }) => (
        <button key={s.ticker} onClick={() => onOpen(s.ticker)} className="w-full flex justify-between items-baseline gap-1 py-1 min-h-9 text-left">
          <span className="text-[12px] truncate"><b>{s.ticker}</b> <span className="text-[var(--ink-2)]">{name}</span></span>
          <span className="text-[12px] font-bold num shrink-0" style={{ color: ch >= 0 ? UP : DOWN }}>{ch >= 0 ? '+' : ''}{fmtPct(ch, 1)}</span>
        </button>
      ))}
    </div>
  );
}

function Call({ k, w, onOpen }: { k: StockCall; w: WorldState; onOpen: () => void }) {
  const c = w.companies.find((x) => x.id === k.companyId);
  const s = w.stocks.find((x) => x.ticker === k.ticker);
  const since = s ? s.price / k.start - 1 : 0;
  const days = Math.max(0, k.due - w.day);
  const col = k.dir > 0 ? UP : DOWN;
  return (
    <button onClick={onOpen} className="w-full text-left py-2.5 flex gap-2.5">
      <span className="w-10 shrink-0 grid place-items-center rounded-[2px] text-white text-lg font-black self-start py-1" style={{ background: col }}>{k.dir > 0 ? '▲' : '▼'}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold leading-tight">{c?.name ?? k.ticker} ({k.ticker}) could {k.dir > 0 ? 'rise' : 'fall'}</span>
        <span className="block text-[12px] leading-snug mt-0.5">We hear of {k.story}.{k.reasons.length ? ` Also: ${k.reasons.slice(0, 2).join('; ')}.` : ''}</span>
        <span className="block text-[11px] mt-1 text-[var(--ink-2)]" style={SANS}>
          News expected in about {days} day{days === 1 ? '' : 's'} · {since >= 0 ? '+' : ''}{fmtPct(since, 1)} since the tip
        </span>
      </span>
    </button>
  );
}

function PastCall({ k, w, onOpen }: { k: StockCall; w: WorldState; onOpen: () => void }) {
  const s = w.stocks.find((x) => x.ticker === k.ticker);
  const now = k.end ?? s?.price ?? k.start;
  const ch = now / k.start - 1;
  const verdict = k.judged ? (k.hit ? '✓ Right' : '✗ Wrong') : k.truth ? 'Story true' : 'Fell through';
  const good = k.judged ? k.hit : k.truth;
  return (
    <button onClick={onOpen} className="w-full flex items-baseline justify-between gap-2 py-1 min-h-9 text-left">
      <span className="text-[12px] truncate">{k.dir > 0 ? '▲' : '▼'} <b>{k.ticker}</b> <span className="text-[var(--ink-2)]">{ch >= 0 ? '+' : ''}{fmtPct(ch, 1)}</span></span>
      <span className={cx('text-[11px] font-bold shrink-0')} style={{ color: good ? UP : DOWN }}>{verdict}</span>
    </button>
  );
}

/** Home: the paper's latest tip and the hottest industry, to draw you in */
export function PaperTeaser() {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const k = [...(w.play.calls ?? [])].filter((x) => !x.broke).sort((a, b) => b.day - a.day)[0];
  const top = useMemo(() => sectorOutlook(w)[0], [w.day]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!k && !top) return null;
  return (
    <button onClick={() => push({ screen: 'news' })} className="w-full text-left px-3 py-2.5 min-h-tap border-b border-line bg-gold/5">
      {k && (
        <span className="block text-sm">
          <span className={cx('font-bold', k.dir > 0 ? 'text-green' : 'text-red')}>{k.dir > 0 ? '▲' : '▼'} Tip:</span>{' '}
          <b>{k.ticker}</b> could {k.dir > 0 ? 'rise' : 'fall'} <span className="text-muted">(we hear of {k.story})</span>
        </span>
      )}
      {top && (
        <span className="block text-sm mt-0.5">
          <span className="font-bold text-gold">Industry Watch:</span> {top.name} {OUTLOOK[top.outlook].label.toLowerCase()}
          {top.reasons[0] ? <span className="text-muted">: {top.reasons[0]}</span> : null}
        </span>
      )}
      <span className="block text-xs text-gold mt-1">Market Watch in today's paper →</span>
    </button>
  );
}

/** Stock page: what the paper said about this company, and how its industry is doing */
export function TimesOnStock({ ticker }: { ticker: string }) {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const s = w.stocks.find((x) => x.ticker === ticker);
  const c = s ? w.companies.find((x) => x.id === s.companyId) : undefined;
  const sector = useMemo(() => (c ? sectorOutlook(w).find((x) => x.industry === c.industry) : undefined), [w.day, c?.industry]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = [...(w.play.calls ?? [])].filter((x) => x.ticker === ticker && (!x.judged || w.day - x.due < 30)).sort((a, b) => b.day - a.day)[0];
  if (!s || !c || (!k && !sector)) return null;
  const o = sector ? OUTLOOK[sector.outlook] : null;
  return (
    <>
      <SectionTitle>The Astoria Times says</SectionTitle>
      <Card className="p-3 text-sm space-y-2" onClick={() => push({ screen: 'news' })}>
        {k && (
          <div>
            <span className={cx('font-bold', k.dir > 0 ? 'text-green' : 'text-red')}>{k.dir > 0 ? '▲ Tipped to rise' : '▼ Tipped to fall'}</span>
            <span className="text-muted"> on day {k.day}: {k.story}.</span>
            <div className="text-xs text-muted mt-0.5">
              {!k.broke ? `News expected in about ${Math.max(0, k.due - w.day)} days. ` : k.truth ? 'The story came true. ' : 'The story fell through. '}
              {s.price / k.start - 1 >= 0 ? '+' : ''}{fmtPct(s.price / k.start - 1, 1)} since the tip. Tips are guesses: about half come true.
            </div>
          </div>
        )}
        {sector && o && (
          <div>
            <span className={cx('font-bold', o.tone === 'good' ? 'text-green' : o.tone === 'bad' ? 'text-red' : '')}>{o.arrow} {sector.name}: {o.label}</span>
            {sector.reasons.length > 0 && <span className="text-muted"> ({sector.reasons.slice(0, 2).join('; ')})</span>}
          </div>
        )}
        <div className="text-xs text-gold">Read Market Watch →</div>
      </Card>
    </>
  );
}
