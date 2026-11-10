import { useState } from 'react';
import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { refPrice } from '../../engine/company';
import { MAX_DAYS, MIN_DAYS, dailyNeed } from '../../engine/contracts';
import { MAX_REQUESTS, REPLY_DAYS, requestGoods, requestsOf } from '../../engine/requests';
import { fmtMoney, fmtPct, fmtPrice } from '../../engine/news';
import type { GoodId, SupplyRequest, WorldState } from '../../engine/types';
import { Badge, Button, Card, Chips, SectionTitle, cx } from '../components/core';

/** Post your own buy or sell request, and see the offers companies send back. */
export function RequestsCard({ w }: { w: WorldState }) {
  const [open, setOpen] = useState(false);
  const list = requestsOf(w).filter((r) => r.status === 'open' || w.day - r.closes < 10).slice().reverse();
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  return (
    <>
      <SectionTitle>Your requests</SectionTitle>
      {!open && (
        <Button block variant="dark" disabled={!mine.length} onClick={() => setOpen(true)}>📣 Post a request</Button>
      )}
      {open && <RequestForm w={w} onDone={() => setOpen(false)} />}
      <div className="space-y-2 mt-2">{list.map((r) => <RequestRow key={r.id} w={w} r={r} />)}</div>
    </>
  );
}

function RequestForm({ w, onDone }: { w: WorldState; onDone: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const mine = w.companies.filter((c) => c.isPlayer && !c.bankrupt);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [coId, setCoId] = useState(mine[0]?.id ?? '');
  const c = mine.find((x) => x.id === coId) ?? mine[0];
  const goods = c ? requestGoods(c, side) : [];
  const [goodPick, setGood] = useState<GoodId | null>(null);
  const good = goodPick && goods.includes(goodPick) ? goodPick : goods[0];
  const ref = good ? refPrice(w, good) : 0;
  const base = !c || !good ? 0 : side === 'buy' ? Math.max(1, Math.round(dailyNeed(c, good))) : Math.max(1, Math.round(c.capacity * 0.25));
  const [qty, setQty] = useState<number | null>(null);
  const [days, setDays] = useState(60);
  const [mult, setMult] = useState(1);
  const q = qty ?? base;
  const price = ref * mult;
  const maxQty = Math.max(10, base * 3);
  if (!c || !good) return <Card className="p-3 text-sm text-muted">You need a company first.</Card>;
  const unit = GOODS[good].unit;
  return (
    <Card className="p-3">
      <div className="text-sm font-bold">New request</div>
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        {(['buy', 'sell'] as const).map((s) => (
          <button key={s} onClick={() => { setSide(s); setQty(null); setMult(1); }} aria-pressed={side === s}
            className={cx('rounded-lg border py-2 text-xs font-semibold', side === s ? 'border-gold bg-gold text-gold-ink' : 'border-line bg-card')}>
            {s === 'buy' ? '🛒 Buy materials' : '📦 Sell my output'}
          </button>
        ))}
      </div>
      {mine.length > 1 && <div className="mt-2"><Chips bleed={false} items={mine.map((m) => ({ id: m.id, label: m.name }))} value={c.id} onChange={(v) => { setCoId(v); setQty(null); setGood(null); }} /></div>}
      {side === 'buy' && goods.length === 0 && <p className="text-xs text-muted mt-2">{c.name} needs no materials.</p>}
      {goods.length > 1 && <div className="mt-2"><Chips bleed={false} items={goods.map((g) => ({ id: g, label: GOODS[g].name }))} value={good} onChange={(v) => { setGood(v); setQty(null); }} /></div>}
      {goods.length > 0 && (
        <>
          <Field label={`${side === 'buy' ? 'Buy' : 'Sell'} a day`} value={`${q.toLocaleString()} ${unit}`}>
            <input type="range" min={1} max={maxQty} step={Math.max(1, Math.round(maxQty / 100))} value={q} onChange={(e) => setQty(Number(e.target.value))} className="w-full accent-[var(--color-gold)]" aria-label="Quantity a day" />
          </Field>
          <Field label="For" value={`${days} days`}>
            <input type="range" min={MIN_DAYS} max={MAX_DAYS} step={1} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-[var(--color-gold)]" aria-label="Days" />
          </Field>
          <Field label={side === 'buy' ? 'Most you pay' : 'Least you take'} value={`${fmtPrice(price)} · ${mult >= 1 ? '+' : ''}${fmtPct(mult - 1, 0)} vs market`}>
            <input type="range" min={70} max={130} step={1} value={Math.round(mult * 100)} onChange={(e) => setMult(Number(e.target.value) / 100)} className="w-full accent-[var(--color-gold)]" aria-label="Price" />
          </Field>
          <p className="text-xs text-muted">In all: {(q * days).toLocaleString()} {unit}, about {fmtMoney(q * days * price)}. {side === 'buy' ? `${c.name} uses about ${Math.round(dailyNeed(c, good)).toLocaleString()} a day.` : `${c.name} makes up to ${Math.round(c.capacity).toLocaleString()} a day.`} Companies reply in about {REPLY_DAYS} days; at most {MAX_REQUESTS} requests open at once.</p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Button className="col-span-2" onClick={async () => { const r = await dispatch({ type: 'postRequest', side, companyId: c.id, good, qtyPerDay: q, days, price }); if (r.ok) onDone(); }}>Post request</Button>
            <Button variant="ghost" onClick={onDone}>Cancel</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Field({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between text-sm"><span className="text-muted">{label}</span><b className="num">{value}</b></div>
      {children}
    </div>
  );
}

function RequestRow({ w, r }: { w: WorldState; r: SupplyRequest }) {
  const dispatch = useGame((s) => s.dispatch);
  const co = w.companies.find((c) => c.id === r.companyId);
  const def = GOODS[r.good];
  const waiting = r.status === 'open' && !r.answered;
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{r.side === 'buy' ? 'Buying' : 'Selling'} {def.name.toLowerCase()} · {co?.name}</div>
          <div className="text-xs text-muted">{r.qtyPerDay.toLocaleString()} {def.unit} a day for {r.days} days · {r.side === 'buy' ? 'up to' : 'at least'} {fmtPrice(r.price)}{r.filled > 0 ? ` · ${r.filled.toLocaleString()} a day signed` : ''}</div>
        </div>
        <Badge tone={r.status === 'done' ? 'good' : r.status === 'closed' ? 'neutral' : waiting ? 'neutral' : 'gold'}>
          {r.status === 'done' ? 'Covered' : r.status === 'closed' ? 'Closed' : waiting ? `Replies day ${r.replyDay}` : `${r.replies.length} offers`}
        </Badge>
      </div>
      {r.status === 'open' && r.answered && r.replies.length === 0 && <p className="text-xs text-amber mt-2">No company took it at this price. Withdraw it and try a {r.side === 'buy' ? 'higher' : 'lower'} price.</p>}
      {r.status === 'open' && r.replies.length > 0 && (
        <div className="divide-y divide-line mt-2 rounded-lg border border-line">
          {r.replies.map((x) => (
            <div key={x.companyId} className="flex items-center gap-2 px-2.5 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{x.name}</div>
                <div className="text-xs text-muted">{x.qtyPerDay.toLocaleString()} a day at {fmtPrice(x.price)}{r.side === 'buy' ? ` · quality ${x.quality.toFixed(2)}` : ''}</div>
              </div>
              <Button size="sm" onClick={() => dispatch({ type: 'acceptReply', requestId: r.id, companyId: x.companyId })}>Sign</Button>
            </div>
          ))}
        </div>
      )}
      {r.status === 'open' && <button className="text-xs text-dim mt-2 min-h-8" onClick={() => dispatch({ type: 'cancelRequest', requestId: r.id })}>Withdraw</button>}
    </Card>
  );
}
