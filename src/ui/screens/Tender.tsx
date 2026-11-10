import { useEffect, useState } from 'react';
import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { fmtMoney, fmtPct, fmtPrice } from '../../engine/news';
import { JOB_CAP_SHARE, TENDER_ADVANCE, bookedPerDay, jobRoom, recordBonus, tenderLeader, tenderMinPrice, tenderPerDay, tenderScore, tenderUnitCost, trackRecord } from '../../engine/strategy';
import type { Company, Tender } from '../../engine/types';
import { Badge, Button, Card, Chips, Screen, SectionTitle, cx } from '../components/core';
import { SubHeader } from './More';
import { Row } from './Company';

/** The price that would just beat the leader for this company */
function beatPrice(t: Tender, c: Company, leaderScore: number, by: number, bonus: number): number {
  const cap = Math.max(1, c.capacity * JOB_CAP_SHARE);
  const strain = Math.max(0, tenderPerDay(t) / cap - 1);
  return Math.max(tenderMinPrice(t), (leaderScore - by + bonus + 0.25 * (c.quality - 1) - 0.6 * strain) * t.ref);
}

/** The bidding war for one tender. The game stays paused while you are here. */
export function TenderRoom({ id }: { id: string }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const speed = useGame((s) => s.speed);
  const t = w.play.tenders.find((x) => x.id === id);
  const makers = w.companies.filter((c) => c.isPlayer && !c.bankrupt && t && c.good === t.good);
  const [coId, setCoId] = useState<string | null>(t?.room?.companyId ?? makers.find((c) => !jobRoom(w, c, t ? tenderPerDay(t) : 0))?.id ?? makers[0]?.id ?? null);
  const c = makers.find((x) => x.id === (t?.room?.companyId ?? coId)) ?? null;
  const best = t ? tenderLeader(t) : null;
  const bonus = recordBonus(w);
  const track = trackRecord(w);
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => { if (speed !== 0 && t?.status === 'open' && t.room) useGame.getState().setSpeed(0); }, [speed, t?.status, t?.room]);

  if (!t) {
    return (
      <div>
        <SubHeader title="Tender" />
        <Screen><Card className="mt-3 p-4 text-sm text-muted">This tender has closed.</Card></Screen>
      </div>
    );
  }
  const def = GOODS[t.good];
  const total = t.qtyPerMonth * t.months;
  const left = Math.max(0, t.closes - w.day);
  const unitCost = c ? tenderUnitCost(w, c) : 0;
  const suggested = best && c && !best.player ? beatPrice(t, c, best.score, 0.01, bonus) : t.ref * 0.97;
  const p = price ?? suggested;
  const margin = p - unitCost;
  const perDay = tenderPerDay(t);
  const share = c ? (bookedPerDay(w, c.id) + perDay) / c.capacity : 0;
  const block = c && !t.room ? jobRoom(w, c, perDay) : null;
  const myScore = c ? tenderScore(t, p, c.quality, c.capacity) - bonus : 9;
  const tooLow = p < tenderMinPrice(t) - 1e-9;
  const beats = !tooLow && (!best || best.player || myScore < best.score - 1e-9);
  const done = t.status !== 'open';
  const bid = async () => { const r = await dispatch({ type: 'tenderBid', tenderId: t.id, price: p }); if (r.ok) setPrice(null); };

  return (
    <div>
      <SubHeader title="Tender room" sub={`${t.buyer} · ${def.name}`} />
      <Screen>
        <Card className="mt-3 p-3">
          <div className="font-bold">{t.buyer} wants {def.name.toLowerCase()}</div>
          <div className="text-sm text-muted">{t.qtyPerMonth.toLocaleString()} {def.unit} a month for {t.months} months · {total.toLocaleString()} {def.unit} in all</div>
          <div className="text-xs text-dim mt-1">Market price {fmtPrice(t.ref)} · worth about {fmtMoney(total * t.ref)} · {done ? 'closed' : `closes in ${left} day${left === 1 ? '' : 's'}`}</div>
          <p className="text-xs text-muted mt-2">Lowest price wins, but the buyer also weighs quality (each 0.1 is worth 2.5% of price), your delivery record, and whether the company can deliver this much every day. Bids under {fmtPrice(tenderMinPrice(t))} are rejected as too cheap to be real. The winner gets {fmtPct(TENDER_ADVANCE, 0)} up front; deliveries are checked every month.</p>
        </Card>

        {done && (
          <Card className={cx('mt-3 p-4 text-center', t.status === 'won' ? 'border-green/60' : 'border-line')}>
            <div className="text-3xl">{t.status === 'won' ? '🏆' : '📁'}</div>
            <div className="font-bold mt-1">{t.status === 'won' ? 'You won the tender!' : `${t.winner ?? 'Nobody'} won`}</div>
            {t.winPrice != null && <div className="text-sm text-muted">{fmtPrice(t.winPrice)} per {def.unit} · {fmtMoney(t.winPrice * total)} over {t.months} months</div>}
          </Card>
        )}

        {!done && makers.length === 0 && <Card className="mt-3 p-3 text-sm text-amber">You need a company that makes {def.name.toLowerCase()} to bid.</Card>}

        {!done && makers.length > 1 && !t.room && (
          <div className="mt-3"><Chips items={makers.map((m) => ({ id: m.id, label: m.name }))} value={coId ?? ''} onChange={(v) => setCoId(v)} /></div>
        )}

        {!done && c && (
          <>
            <SectionTitle>Bidders</SectionTitle>
            <Card>
              <div className="divide-y divide-line">
                {t.bids.map((b) => {
                  const leading = best && !best.player && best.companyId === b.companyId;
                  const can = (b.capacity ?? Infinity) * JOB_CAP_SHARE >= perDay;
                  return (
                    <div key={b.companyId} className={cx('flex items-center gap-2 px-3 py-2.5', b.out && 'opacity-45')}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{b.name}</div>
                        <div className="text-xs text-muted">Quality {b.quality.toFixed(2)} · {can ? 'can deliver' : 'too small to deliver it all'}</div>
                      </div>
                      <div className="text-right">
                        <div className="num text-sm font-bold">{b.out ? 'Out' : t.room ? fmtPrice(b.price) : 'Sealed'}</div>
                        {!b.out && t.room && <div className="num text-[11px] text-dim">{fmtMoney(b.price * total)} total</div>}
                      </div>
                      {leading && t.room && <Badge tone="warn">Leading</Badge>}
                    </div>
                  );
                })}
                {t.mine && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-gold/10">
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{c.name} (you)</div><div className="text-xs text-muted">Quality {c.quality.toFixed(2)}</div></div>
                    <div className="text-right"><div className="num text-sm font-bold">{fmtPrice(t.mine.price)}</div><div className="num text-[11px] text-dim">{fmtMoney(t.mine.price * total)} total</div></div>
                    {best?.player && <Badge tone="good">Leading</Badge>}
                  </div>
                )}
              </div>
            </Card>

            <SectionTitle>Your bid</SectionTitle>
            <Card className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Price per {def.unit}</span>
                <span className="num text-lg font-bold">{fmtPrice(p)} <span className="text-xs text-dim font-normal">{fmtPct(p / t.ref - 1, 0)} vs market</span></span>
              </div>
              <input type="range" min={40} max={150} step={0.5} value={Math.round((p / t.ref) * 200) / 2} aria-label="Bid price"
                className="w-full accent-[var(--color-gold)] mt-1" onChange={(e) => setPrice((Number(e.target.value) / 100) * t.ref)} />
              {best && !best.player && t.room && (
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[0.005, 0.01, 0.03].map((by) => (
                    <Button key={by} size="sm" variant="dark" onClick={() => setPrice(beatPrice(t, c, best.score, by, bonus))}>Beat by {by * 100}%</Button>
                  ))}
                </div>
              )}
              <div className="divide-y divide-line mt-2">
                <Row label={`Your cost per ${def.unit}`} value={fmtPrice(unitCost)} />
                <Row label={`Profit per ${def.unit}`} value={fmtPrice(margin)} tone={margin > 0 ? 'good' : 'bad'} />
                <Row label="Units" value={`${t.qtyPerMonth.toLocaleString()} a month × ${t.months} months = ${total.toLocaleString()}`} />
                <Row label="Revenue" value={`${fmtMoney(p * total)} (${fmtMoney(p * t.qtyPerMonth)} a month)`} />
                <Row label="Profit" value={`${fmtMoney(margin * total)} (${fmtMoney(margin * t.qtyPerMonth)} a month)`} tone={margin > 0 ? 'good' : 'bad'} />
                <Row label="Paid up front if you win" value={`${fmtMoney(p * total * TENDER_ADVANCE)} (${fmtPct(TENDER_ADVANCE, 0)})`} tone="good" />
                <Row label={`${c.name}'s output booked`} value={fmtPct(share, 0)} tone={share > JOB_CAP_SHARE ? 'bad' : undefined} />
                <Row label="Your delivery record" value={`${track.done} delivered · ${track.failed} missed · ${bonus >= 0 ? 'worth' : 'costs'} ${fmtPct(Math.abs(bonus), 0)} of price`} tone={bonus > 0 ? 'good' : bonus < 0 ? 'bad' : undefined} />
              </div>
              {tooLow && <p className="text-xs text-red mt-1">⚠️ {t.buyer} rejects bids below {fmtPrice(tenderMinPrice(t))}: they don't believe anyone can deliver that cheaply.</p>}
              {margin <= 0 && <p className="text-xs text-red mt-1">⚠️ Below your cost: every unit you deliver loses money.</p>}
              <p className="text-[11px] text-dim mt-1">Cost covers materials, staff and running costs; the plant's overheads are paid anyway. A missed month costs 10% of the missing units' value.</p>
              {block && <p className="text-xs text-amber mt-2">{block}</p>}
              {!t.room ? (
                <Button block className="mt-3" disabled={!!block} onClick={() => dispatch({ type: 'tenderJoin', tenderId: t.id, companyId: c.id })}>Start bidding</Button>
              ) : (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <Button className="col-span-2" disabled={!beats || !!best?.player} onClick={bid}>{best?.player ? 'You are leading' : beats ? `Bid ${fmtPrice(p)}` : 'Bid lower to lead'}</Button>
                  <Button variant="ghost" onClick={() => dispatch({ type: 'tenderPass', tenderId: t.id })}>{best?.player ? 'Close & win' : 'Drop out'}</Button>
                </div>
              )}
            </Card>

            {t.room && (
              <>
                <SectionTitle>How it went</SectionTitle>
                <Card className="p-3 space-y-1">
                  {[...t.room.log].reverse().map((l, i) => <p key={i} className={cx('text-xs', i === 0 ? 'text-text' : 'text-muted')}>{l}</p>)}
                </Card>
              </>
            )}
          </>
        )}
      </Screen>
    </div>
  );
}
