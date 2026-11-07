import { useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { refPrice, supplyCover } from '../../engine/company';
import { MAX_DAYS, MIN_DAYS, contractsOf, dailyNeed, dealPartners, judgeOffer, ownerRival } from '../../engine/contracts';
import { fmtMoney, fmtPct, fmtPrice } from '../../engine/news';
import type { Company, GoodId, WorldState } from '../../engine/types';
import { Badge, BottomSheet, Button, Card, Chips, cx } from '../components/core';

/** Materials, own-company pricing and supply deals for one company. */
export function SupplyTab({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const push = useGame((s) => s.push);
  const [deal, setDeal] = useState(false);
  const def = GOODS[c.good];
  const mine = c.isPlayer && !c.bankrupt;
  const cover = supplyCover(c);
  const sisters = w.companies.filter((x) => x.isPlayer && !x.bankrupt && x.id !== c.id && GOODS[x.good].inputs.some((i) => i.good === c.good));
  const deals = contractsOf(w, c);

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="text-sm font-bold">Materials</div>
        {def.inputs.length === 0 && <p className="text-sm text-muted mt-1">{def.name} needs no materials: it is mined or grown. Your costs are staff and running costs.</p>}
        <div className="divide-y divide-line">
          {def.inputs.map((i) => {
            const st = c.inputs[i.good];
            const cv = cover.find((x) => x.good === i.good);
            const market = refPrice(w, i.good);
            const own = w.companies.find((x) => x.isPlayer && !x.bankrupt && x.good === i.good);
            const days = cv?.days ?? 0;
            return (
              <div key={i.good} className="py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{GOODS[i.good].name} <span className="text-xs text-dim font-normal">{+i.qty.toFixed(2)} {GOODS[i.good].unit} per unit</span></span>
                  <span className={cx('num text-xs font-bold', days < Math.min(1, c.automation.supplyDays * 0.5) ? 'text-red' : days < c.automation.supplyDays * 0.6 ? 'text-amber' : 'text-green')}>{days.toFixed(1)} days left</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted mt-1">
                  <span className="num">{Math.round(st?.qty ?? 0).toLocaleString()} in store · paid {fmtPrice(st?.cost ?? market)}</span>
                  <span className="num">market {fmtPrice(market)}</span>
                </div>
                <div className="text-xs mt-1">
                  {own ? (
                    <span className="text-green">Bought first from your {own.name} at {fmtPct(own.sisterDiscount, 0)} off.</span>
                  ) : (
                    <span className="text-dim">
                      Bought on the open market.{' '}
                      {mine && <button className="text-gold font-semibold" onClick={() => push({ screen: 'planner', good: i.good })}>Make your own?</button>}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {mine && def.inputs.length > 0 && (
          <DaysSlider value={c.automation.supplyDays} onCommit={(v) => dispatch({ type: 'setAutomation', companyId: c.id, automation: { supplyDays: v } })} />
        )}
      </Card>

      {mine && sisters.length > 0 && (
        <Card className="p-3">
          <div className="text-sm font-bold">Selling to your own companies</div>
          <p className="text-xs text-muted mt-1">
            {sisters.map((x) => x.name).join(', ')} buy{sisters.length === 1 ? 's' : ''} {def.name.toLowerCase()} from {c.name} before anyone else. A discount makes their products cheaper to make; {c.name} earns less per sale.
          </p>
          <PctSlider label="Discount for your companies" value={c.sisterDiscount} max={0.5} onCommit={(v) => dispatch({ type: 'setSisterDiscount', companyId: c.id, discount: v })} />
          <div className="text-xs text-dim">Sister price now {fmtPrice(refPrice(w, c.good) * c.priceMult * (1 - c.sisterDiscount))} vs market {fmtPrice(refPrice(w, c.good))}.</div>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">Supply deals</div>
          {mine && <Button size="sm" onClick={() => setDeal(true)}>New deal</Button>}
        </div>
        <p className="text-xs text-muted mt-1">A deal fixes a price and amount for a period. Give a rival's company a good price and that rival warms to you; break a deal and they remember.</p>
        <div className="divide-y divide-line mt-1">
          {deals.length === 0 && <p className="py-2 text-sm text-dim">No deals yet.</p>}
          {deals.map((k) => {
            const selling = k.sellerId === c.id;
            const other = w.companies.find((x) => x.id === (selling ? k.buyerId : k.sellerId));
            const market = refPrice(w, k.good);
            const vs = k.price / market - 1;
            return (
              <div key={k.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold truncate">{selling ? 'Selling to' : 'Buying from'} {other?.name ?? 'unknown'}</span>
                  <Badge tone={selling ? 'gold' : 'neutral'}>{GOODS[k.good].name}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted mt-1">
                  <span className="num">{Math.round(k.qtyPerDay).toLocaleString()} {GOODS[k.good].unit}/day at {fmtPrice(k.price)} <span className={(selling ? vs >= 0 : vs <= 0) ? 'text-green' : 'text-red'}>({vs >= 0 ? '+' : ''}{fmtPct(vs, 0)} vs market)</span></span>
                  <span className="num shrink-0">{Math.max(0, k.endDay - w.day)}d left</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className={k.shortfall > 0 ? 'text-amber' : 'text-dim'}>Delivered {Math.round(k.delivered).toLocaleString()}{k.shortfall > 0 ? ` · short ${Math.round(k.shortfall).toLocaleString()}` : ''}</span>
                  {mine && <button className="text-red font-semibold min-h-8" onClick={() => dispatch({ type: 'cancelContract', contractId: k.id })}>Cancel</button>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      {deal && <DealSheet c={c} w={w} onClose={() => setDeal(false)} />}
    </div>
  );
}

function DaysSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState<number | null>(null);
  const shown = v ?? value;
  return (
    <div className="pt-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Keep materials for</span>
        <span className="num font-semibold">{shown} days</span>
      </div>
      <input type="range" min={1} max={20} step={1} value={shown} onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v != null && (onCommit(v), setV(null))} onKeyUp={() => v != null && (onCommit(v), setV(null))}
        className="w-full h-tap accent-[var(--color-gold)]" aria-label="Days of materials to keep" />
      <p className="text-xs text-dim">More stock protects you from shortages and price spikes, but ties up cash.</p>
    </div>
  );
}

function PctSlider({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState<number | null>(null);
  const shown = v ?? value;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="num font-semibold">{Math.round(shown * 100)}%</span>
      </div>
      <input type="range" min={0} max={max} step={0.01} value={shown} onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v != null && (onCommit(v), setV(null))} onKeyUp={() => v != null && (onCommit(v), setV(null))}
        className="w-full h-tap accent-[var(--color-gold)]" aria-label={label} />
    </div>
  );
}

type Side = 'sell' | 'buy';

function DealSheet({ c, w, onClose }: { c: Company; w: WorldState; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const partners = useMemo(() => dealPartners(w, c), [w, c]);
  const canSell = partners.buyers.length > 0;
  const sellerGoods = partners.sellers.filter((s) => s.companies.length > 0);
  const [side, setSide] = useState<Side>(canSell ? 'sell' : 'buy');
  const [buyGood, setBuyGood] = useState<GoodId | undefined>(sellerGoods[0]?.good);
  const list = side === 'sell' ? partners.buyers : (sellerGoods.find((s) => s.good === buyGood)?.companies ?? []);
  const [pid, setPid] = useState<string | undefined>(list[0]?.id);
  const partner = list.find((x) => x.id === pid) ?? list[0];
  const good = side === 'sell' ? c.good : (buyGood ?? c.good);
  const market = refPrice(w, good);
  // Never more than this plant can make (selling) or use (buying), nor more than the partner can handle.
  const maxQty = Math.max(1, Math.round(side === 'sell'
    ? Math.min(dailyNeed(partner ?? c, good) * 1.2, c.capacity)
    : Math.min(Math.max(dailyNeed(c, good), 1) * 1.5, (partner?.capacity ?? 0) * 0.5)));
  const suggestQty = Math.max(1, Math.round(maxQty * 0.5));
  const [qty, setQty] = useState<number | null>(null);
  const [pm, setPm] = useState(side === 'sell' ? 0.97 : 1.03);
  const [days, setDays] = useState(60);
  const q = Math.min(qty ?? suggestQty, maxQty);
  const price = market * pm;
  const verdict = partner ? judgeOffer(w, c, partner, side, q, price) : null;
  const rv = partner ? ownerRival(w, partner) : undefined;
  const generosity = side === 'sell' ? 1 - pm : pm - 1;
  const value = q * price * days;

  const pick = (s: Side) => { setSide(s); setPid(undefined); setQty(null); setPm(s === 'sell' ? 0.97 : 1.03); };
  const submit = async () => {
    if (!partner) return;
    const r = await dispatch({ type: 'offerContract', companyId: c.id, partnerId: partner.id, side, qtyPerDay: q, price, days });
    if (r.ok) onClose();
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Offer a supply deal"
      footer={<Button block size="lg" disabled={!partner} onClick={submit}>Send offer · {fmtMoney(value)} total</Button>}
    >
      <Chips<Side>
        bleed={false}
        value={side}
        onChange={pick}
        items={[
          { id: 'sell', label: `Sell my ${GOODS[c.good].name.toLowerCase()}`, disabled: !canSell },
          { id: 'buy', label: 'Buy materials', disabled: sellerGoods.length === 0 },
        ]}
      />
      {side === 'buy' && sellerGoods.length > 1 && (
        <div className="mt-2">
          <Chips<GoodId> bleed={false} value={buyGood ?? sellerGoods[0].good} onChange={(g) => { setBuyGood(g); setPid(undefined); setQty(null); }} items={sellerGoods.map((s) => ({ id: s.good, label: GOODS[s.good].name }))} />
        </div>
      )}
      {list.length === 0 && <p className="text-sm text-muted mt-3">No computer companies to deal with for this.</p>}

      <Field label="Partner">
        <div className="space-y-1.5">
          {list.map((x) => {
            const o = ownerRival(w, x);
            return (
              <button key={x.id} onClick={() => { setPid(x.id); setQty(null); }}
                className={cx('w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm', partner?.id === x.id ? 'border-gold bg-gold/10' : 'border-line bg-card')}>
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{x.name}</span>
                  <span className="block text-xs text-dim">{GOODS[x.good].name} · {o ? `${o.name}` : 'Independent'}</span>
                </span>
                {o && <span className={cx('num text-xs font-bold shrink-0', o.relation >= 20 ? 'text-green' : o.relation <= -20 ? 'text-red' : 'text-muted')}>{o.relation > 0 ? '+' : ''}{Math.round(o.relation)} rel</span>}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={`Amount per day (${GOODS[good].unit})`} right={<span className="num">{q.toLocaleString()} <span className="text-dim font-normal">of max {maxQty.toLocaleString()}</span></span>}>
        <input type="range" min={1} max={maxQty} step={Math.max(1, Math.round(maxQty / 100))} value={Math.min(q, maxQty)} onChange={(e) => setQty(Number(e.target.value))} className="w-full h-tap accent-[var(--color-gold)]" aria-label="Amount per day" />
      </Field>
      <Field label="Price" right={<span className="num">{fmtPrice(price)} · {Math.round(pm * 100)}% of market</span>}>
        <input type="range" min={0.7} max={1.3} step={0.01} value={pm} onChange={(e) => setPm(Number(e.target.value))} className="w-full h-tap accent-[var(--color-gold)]" aria-label="Deal price" />
      </Field>
      <Field label="Length" right={<span className="num">{days} days</span>}>
        <input type="range" min={MIN_DAYS} max={MAX_DAYS} step={1} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full h-tap accent-[var(--color-gold)]" aria-label="Deal length" />
      </Field>

      {verdict && (
        <div className={cx('mt-3 rounded-lg border px-3 py-2 text-sm', verdict.accept ? 'border-green/50 bg-green-dim text-green' : 'border-red/50 bg-red-dim text-red')}>
          {verdict.accept ? 'They will likely accept.' : verdict.reason}
        </div>
      )}
      {rv && (
        <p className="text-xs text-dim mt-2">
          {generosity > 0.02
            ? `A generous deal: ${rv.name} will like you more (+${Math.min(15, Math.round(generosity * 60))} relation).`
            : generosity < -0.02 ? `A tough deal for them: ${rv.name} will not be pleased.` : `A fair deal: ${rv.name}'s opinion barely changes.`}
        </p>
      )}
    </BottomSheet>
  );
}

function Field({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-semibold">{right}</span>
      </div>
      {children}
    </div>
  );
}
