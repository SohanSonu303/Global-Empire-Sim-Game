import { useEffect, useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import { companyValue } from '../../engine/company';
import { bankOffers, bankStats, creditCycle, defaultRisk, isBank, lenderOf, loanBooks, loanRate, MAX_RATE_MULT, MIN_RATE_MULT, riskPremium, sameOwner } from '../../engine/banks';
import {
  MAX_OUTSIDE, bidQuote, buyBackPrice, buyStakeTerms, holdersOf, outsidePct, partnersOf, playerPct, saleOffers, stakeOffers,
} from '../../engine/ownership';
import { fmtMoney, fmtPct } from '../../engine/news';
import type { Company, WorldState } from '../../engine/types';
import { Badge, Button, Card, Chips, Progress, cx } from '../components/core';
import { Row, Slider } from './Company';

/** Ownership, partner stakes, takeovers, selling, and banking for one company. */
export function OwnersTab({ c, w }: { c: Company; w: WorldState }) {
  const mine = c.isPlayer;
  return (
    <div className="space-y-3">
      <OwnershipCard c={c} w={w} />
      {mine && !c.ticker && !c.bankrupt && <RaiseCard c={c} w={w} />}
      {!mine && !c.ticker && !c.bankrupt && <BuyStakeCard c={c} w={w} />}
      {!mine && !c.bankrupt && <TakeoverCard c={c} w={w} />}
      {mine && !c.ticker && !c.bankrupt && <SellCard c={c} w={w} />}
      {isBank(c) ? <BankCard c={c} w={w} /> : !c.bankrupt && <LenderCard c={c} w={w} />}
    </div>
  );
}

function Title({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 mb-1"><div className="text-sm font-bold">{children}</div>{right}</div>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted mt-1">{children}</p>;
}

/** A button that asks for a second tap before doing something big. */
function Confirm({ label, confirm, onConfirm, disabled, size = 'sm' }: { label: ReactNode; confirm: ReactNode; onConfirm: () => void; disabled?: boolean; size?: 'sm' | 'md' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button size={size} variant={armed ? 'danger' : 'gold'} disabled={disabled} className="whitespace-nowrap"
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirm : label}
    </Button>
  );
}

function OwnershipCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const mine = playerPct(w, c);
  const others = holdersOf(w, c).filter((h) => h.pct > 0.0005);
  const partners = partnersOf(c);
  return (
    <Card className="p-3">
      <Title right={c.ticker ? <Badge>Listed · {c.ticker}</Badge> : <Badge>Private</Badge>}>Who owns {c.name}</Title>
      <div className="divide-y divide-line">
        {(mine > 0 || c.isPlayer) && <Owner name="You" pct={mine} tone="gold" note={c.isPlayer ? 'You run it' : undefined} />}
        {others.map((h) => {
          const p = partners.find((x) => x.ownerId === h.id);
          return (
            <Owner key={h.id} name={h.name} pct={h.pct} note={!c.ticker && !p && !c.isPlayer ? 'Runs it' : p ? `Paid ${fmtMoney(p.paid)}` : undefined}
              action={c.isPlayer && p && !c.bankrupt ? (
                <Confirm label={`Buy back ${fmtMoney(buyBackPrice(c, p))}`} confirm="Tap to confirm" disabled={w.player.cash < buyBackPrice(c, p)}
                  onConfirm={() => dispatch({ type: 'buyBackStake', companyId: c.id, partnerId: p.ownerId })} />
              ) : undefined} />
          );
        })}
      </div>
      <Note>
        {c.ticker
          ? 'Whoever owns more than half the shares runs the company. Dividends are shared per share.'
          : partners.length
            ? 'Dividends are split by ownership, so partners get their share of what the company pays out. Buying a partner back costs their share of today\'s value plus 10%.'
            : c.isPlayer ? 'You own all of it. Sell a stake below to raise money without borrowing.' : 'A private company. Buy a stake, or bid for the whole thing.'}
      </Note>
    </Card>
  );
}

function Owner({ name, pct, note, tone = 'blue', action }: { name: string; pct: number; note?: string; tone?: 'gold' | 'blue'; action?: ReactNode }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold truncate">{name}{note && <span className="text-xs text-muted font-normal"> · {note}</span>}</span>
        <span className="flex items-center gap-2 shrink-0"><span className="num font-bold">{fmtPct(pct, pct < 0.1 ? 1 : 0)}</span>{action}</span>
      </div>
      <Progress className="mt-1" value={pct} tone={tone} height={6} />
    </div>
  );
}

const STAKES = [0.1, 0.2, 0.3, 0.49];

function RaiseCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const room = MAX_OUTSIDE - outsidePct(c);
  const choices = STAKES.map((p) => Math.min(p, Math.round(room * 100) / 100)).filter((p, i, a) => p >= 0.01 && a.indexOf(p) === i);
  const [pct, setPct] = useState(choices[Math.min(1, choices.length - 1)] ?? 0.1);
  const p = choices.includes(pct) ? pct : choices[0];
  if (!choices.length) {
    return <Card className="p-3"><Title>Raise money</Title><Note>Partners already own {fmtPct(outsidePct(c), 0)}, the most allowed so you keep control.</Note></Card>;
  }
  const offers = stakeOffers(w, c, p).slice(0, 4);
  return (
    <Card className="p-3">
      <Title>Raise money: sell a stake</Title>
      <Note>Investors put cash into {c.name} for part of it. Priced fairly, your share keeps its value and the company gets money to grow, with no interest to pay. In return they get their part of every dividend.</Note>
      <div className="mt-2">
        <Chips<string> bleed={false} value={String(p)} onChange={(v) => setPct(Number(v))} items={choices.map((x) => ({ id: String(x), label: fmtPct(x, 0) }))} />
      </div>
      <div className="divide-y divide-line mt-1">
        {offers.map((o) => (
          <div key={o.buyerId} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-semibold truncate">{o.name}</div>
              <div className={cx('text-xs', o.ok ? 'text-muted' : 'text-red')}>{o.why}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="num font-bold">{fmtMoney(o.price)}</span>
              <Confirm label="Accept" confirm="Confirm" disabled={!o.ok} onConfirm={() => dispatch({ type: 'sellStake', companyId: c.id, pct: p, buyerId: o.buyerId })} />
            </div>
          </div>
        ))}
      </div>
      <Note>Value today {fmtMoney(companyValue(c))}. You keep at least {fmtPct(1 - MAX_OUTSIDE, 0)} and stay in charge.</Note>
    </Card>
  );
}

function SellCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const [open, setOpen] = useState(false);
  const share = playerPct(w, c);
  if (!open) {
    return (
      <Card className="p-3 flex items-center justify-between gap-2">
        <div className="text-sm"><div className="font-bold">Sell the company</div><div className="text-xs text-muted">See what rivals would pay for all of it</div></div>
        <Button size="sm" variant="dark" onClick={() => setOpen(true)}>Get offers</Button>
      </Card>
    );
  }
  const offers = saleOffers(w, c).slice(0, 4);
  return (
    <Card className="p-3">
      <Title right={<button className="text-xs text-muted" onClick={() => setOpen(false)}>Hide</button>}>Offers for 100% of {c.name}</Title>
      <div className="divide-y divide-line">
        {offers.map((o) => (
          <div key={o.buyerId} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-semibold truncate">{o.name}</div>
              <div className={cx('text-xs', o.ok ? 'text-muted' : 'text-red')}>{o.why}{share < 0.999 && o.ok ? ` · you get ${fmtMoney(o.price * share)}` : ''}</div>
            </div>
            <Confirm label={`Sell ${fmtMoney(o.price)}`} confirm="Confirm sale" disabled={!o.ok} onConfirm={() => dispatch({ type: 'sellCompany', companyId: c.id, buyerId: o.buyerId })} />
          </div>
        ))}
      </div>
      <Note>Estimated value {fmtMoney(companyValue(c))}. Selling hands over the plant, staff, cash and debt.{share < 0.999 ? ' Partners are paid their share of the price.' : ''}</Note>
    </Card>
  );
}

const PREMIUMS = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5];

function TakeoverCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const [mode, setMode] = useState<'majority' | 'all'>('majority');
  const [prem, setPrem] = useState(0.25);
  const m = c.ticker ? mode : 'all';
  const q = bidQuote(w, c, prem, m);
  // Lowest premium the owners would accept (ignoring your cash)
  let lowest: number | null = null;
  for (let p = 0; p <= 0.6 + 1e-9; p += 0.01) {
    const t = bidQuote(w, c, p, m);
    if (t.ok || t.why.startsWith('Needs')) { lowest = p; break; }
  }
  return (
    <Card className="p-3">
      <Title>Take over {c.name}</Title>
      <Note>
        {c.ticker
          ? 'Offer to buy shares above the market price. If owners of more than half the shares accept, you take control. "Majority" buys just over half and the company stays listed; "All" buys every share and takes it off the exchange.'
          : 'Offer the owners a price above the company\'s estimated value.'}
      </Note>
      {c.ticker && (
        <div className="mt-2">
          <Chips<'majority' | 'all'> bleed={false} value={mode} onChange={setMode} items={[{ id: 'majority', label: 'Majority (51%)' }, { id: 'all', label: 'All shares' }]} />
        </div>
      )}
      <div className="mt-1">
        <Chips<string> bleed={false} value={String(prem)} onChange={(v) => setPrem(Number(v))} items={PREMIUMS.map((x) => ({ id: String(x), label: `+${Math.round(x * 100)}%` }))} />
      </div>
      <div className="divide-y divide-line mt-1">
        {q.holders.filter((h) => h.pct > 0.0005).map((h) => (
          <div key={h.id} className="flex items-center justify-between py-1.5 text-sm">
            <span className="truncate">{h.name} <span className="text-xs text-muted">{fmtPct(h.pct, 0)}</span></span>
            <span className={cx('text-xs font-semibold', h.accepts ? 'text-green' : 'text-red')}>
              {h.accepts ? 'Would sell' : Number.isFinite(h.minPremium) ? `Wants +${Math.round(h.minPremium * 100)}%` : 'Refuses you'}
            </span>
          </div>
        ))}
      </div>
      <div className="divide-y divide-line">
        <Row label={c.ticker ? 'Price per share' : 'Price for 100%'} value={fmtMoney(q.unitPrice)} />
        <Row label="Total cost (personal cash)" value={fmtMoney(q.cost)} tone={w.player.cash < q.cost ? 'bad' : undefined} />
        <Row label="You would own" value={fmtPct(q.after, 0)} />
      </div>
      <p className={cx('text-xs mt-1', q.ok ? 'text-green' : 'text-amber')}>{q.why}{!q.ok && lowest != null ? `. Owners accept from +${Math.round(lowest * 100)}%.` : ''}</p>
      <div className="mt-2">
        <Confirm size="md" label={`Bid ${fmtMoney(q.cost)}`} confirm="Tap again to buy" disabled={!q.ok}
          onConfirm={() => dispatch({ type: 'bidCompany', companyId: c.id, premium: prem, mode: m })} />
      </div>
      <Note>The premium is the price of control: you pay more than the shares are worth today, so your net worth dips at first. It pays off if you run the company better or it supplies your others.</Note>
    </Card>
  );
}

function BuyStakeCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const have = playerPct(w, c);
  const room = MAX_OUTSIDE - outsidePct(c) - have;
  const choices = [0.05, 0.1, 0.2, 0.3].map((p) => Math.min(p, Math.round(room * 100) / 100)).filter((p, i, a) => p >= 0.01 && a.indexOf(p) === i);
  const [pct, setPct] = useState(0.1);
  if (!choices.length) return null;
  const p = choices.includes(pct) ? pct : choices[0];
  const t = buyStakeTerms(w, c, p);
  return (
    <Card className="p-3">
      <Title>Buy a stake</Title>
      <Note>Put money into {c.name} for part of it. You get that share of its quarterly dividends (30% of profit) and of its value.</Note>
      <div className="mt-2"><Chips<string> bleed={false} value={String(p)} onChange={(v) => setPct(Number(v))} items={choices.map((x) => ({ id: String(x), label: fmtPct(x, 0) }))} /></div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className={cx('text-xs', t.ok ? 'text-muted' : 'text-red')}>{t.ok ? `Value today ${fmtMoney(companyValue(c))}` : t.why}</span>
        <Confirm label={`Buy for ${fmtMoney(t.price)}`} confirm="Confirm" disabled={!t.ok} onConfirm={() => dispatch({ type: 'buyStake', companyId: c.id, pct: p })} />
      </div>
    </Card>
  );
}

function LenderCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const books = loanBooks(w);
  const bank = lenderOf(w, c);
  const rate = loanRate(w, c, books);
  const offers = bankOffers(w, c, books);
  const ownBank = offers.find((o) => o.bank.isPlayer);
  return (
    <Card className="p-3">
      <Title right={<span className="num text-sm font-bold">{fmtPct(rate, 2)}/yr</span>}>Bank: {bank?.name ?? 'Central bank window'}</Title>
      <div className="divide-y divide-line">
        <Row label="Debt" value={fmtMoney(c.debt)} tone={c.debt > 0 ? 'bad' : undefined} />
        <Row label="Interest a year at this size" value={fmtMoney(c.debt * rate)} />
        {riskPremium(c) > 0.0005 && <Row label="Extra for risk (losses, low cash)" value={`+${fmtPct(riskPremium(c), 2)}`} tone="bad" />}
      </div>
      {c.isPlayer && (
        <>
          <div className="text-xs font-bold uppercase tracking-wider text-gold mt-2">Banks that would lend</div>
          <div className="divide-y divide-line">
            {offers.slice(0, 5).map((o) => (
              <div key={o.bank.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="truncate">{o.bank.name}{o.bank.isPlayer && <span className="text-xs text-gold"> · yours</span>}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="num font-semibold">{fmtPct(o.rate, 2)}</span>
                  {o.bank.id === bank?.id
                    ? <Badge tone="good">Current</Badge>
                    : <Button size="sm" variant="dark" disabled={!o.ok} onClick={() => dispatch({ type: 'chooseBank', companyId: c.id, bankId: o.bank.id })}>{o.ok ? 'Switch' : 'Refuses'}</Button>}
                </span>
              </div>
            ))}
          </div>
          <Note>
            Rate = central bank rate {fmtPct(w.macro.rate, 2)} + a margin that grows with your debt. Banks with room to lend charge less.
            {ownBank ? ' Your own bank gives your companies its discount, and the interest stays in your group.' : ' Owning a bank gives your companies cheaper loans, and their interest becomes its income.'}
          </Note>
        </>
      )}
    </Card>
  );
}

function BankCard({ c, w }: { c: Company; w: WorldState }) {
  const dispatch = useGame((s) => s.dispatch);
  const books = loanBooks(w);
  const st = bankStats(w, c, books);
  const mineElsewhere = w.companies.filter((x) => x.isPlayer && !x.bankrupt && !isBank(x) && x.bankId !== c.id);
  const withLoans = st.borrowers.filter((b) => b.debt > 0);
  const top = [...withLoans].sort((a, b) => b.debt - a.debt).slice(0, 6);
  return (
    <Card className="p-3">
      <Title>Lending</Title>
      <div className="divide-y divide-line">
        <Row label="Loans out" value={fmtMoney(st.book)} />
        <Row label="Customers (with loans)" value={`${st.borrowers.length} (${withLoans.length})`} />
        <Row label="Interest earned (30d)" value={fmtMoney(c.sum30.interestIncome ?? 0)} tone="good" />
        <Row label="Deposit funding cost (30d)" value={`-${fmtMoney(c.sum30.fundingCost ?? 0)}`} />
        <Row label="Provisions for bad loans (30d)" value={`-${fmtMoney(c.sum30.loanLosses ?? 0)}`} />
        <Row label="Bad-loan reserve" value={fmtMoney(st.reserve)} />
        <Row label="Expected losses a year" value={fmtMoney(st.lossYear)} tone={st.lossYear > 0 ? 'bad' : undefined} />
        <Row label="Net interest a year" value={fmtMoney(st.netYear)} tone={st.netYear >= 0 ? 'good' : 'bad'} />
      </div>
      <div className="flex items-center justify-between text-sm mt-2">
        <span className="text-muted">Lending room used</span>
        <span className="num font-bold">{fmtPct(st.used, 0)} of {fmtMoney(st.cap)}</span>
      </div>
      <Progress className="mt-1" value={Math.min(1, st.used)} tone={st.used > 1 ? 'red' : st.used > 0.8 ? 'amber' : 'blue'} />
      <Note>
        A bank can lend about 6x its capital. The fuller its book, the more it charges, and past 100% rates climb steeply. Deposits cost {fmtPct(0.7, 0)} of the central bank rate.
        Lending is risky: each day the bank sets money aside for loans it expects to go bad. Borrowers in trouble sometimes restructure and repay only part of their loan, and a bankrupt borrower repays just 40%.
        {creditCycle(w) > 1.2 ? ` The economy is weak, so defaults are ${creditCycle(w).toFixed(1)}x more likely than usual.` : ''}
      </Note>
      {top.length > 0 && (
        <>
          <div className="text-xs font-bold uppercase tracking-wider text-gold mt-2">Biggest borrowers</div>
          <div className="divide-y divide-line">
            {top.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="truncate">{b.name}{sameOwner(c, b) && <span className="text-xs text-gold"> · sister</span>}</span>
                <span className="num">{fmtMoney(b.debt)} <span className={cx('text-xs', defaultRisk(b) > 0.1 ? 'text-red' : 'text-muted')}>at {fmtPct(loanRate(w, b, books), 2)}{defaultRisk(b) > 0.1 ? ' · risky' : ''}</span></span>
              </div>
            ))}
          </div>
        </>
      )}
      {c.isPlayer && !c.bankrupt && (
        <div className="mt-2 border-t border-line pt-1">
          <Slider label="Loan margin (100% = usual)" value={Math.round((c.loanRateMult ?? 1) * 100)} min={MIN_RATE_MULT * 100} max={MAX_RATE_MULT * 100} step={5} suffix="%"
            onCommit={(v) => dispatch({ type: 'setLoanRate', companyId: c.id, mult: v / 100 })} />
          <Note>Lower margins win borrowers from other banks each month but earn less on each loan.</Note>
          <Slider label="Discount on the margin for your companies" value={Math.round(c.sisterDiscount * 100)} min={0} max={50} step={5} suffix="%"
            onCommit={(v) => dispatch({ type: 'setSisterDiscount', companyId: c.id, discount: v / 100 })} />
          {mineElsewhere.length > 0 && (
            <Button block size="sm" variant="dark" className="mt-2"
              onClick={() => mineElsewhere.forEach((x) => dispatch({ type: 'chooseBank', companyId: x.id, bankId: c.id }))}>
              Move my other {mineElsewhere.length} compan{mineElsewhere.length > 1 ? 'ies' : 'y'} to {c.name}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
