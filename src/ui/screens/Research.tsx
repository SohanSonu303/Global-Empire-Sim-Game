import { useState } from 'react';
import { useGame } from '../../store/game';
import { GOODS, INDUSTRIES } from '../../engine/data';
import { stars } from '../../engine/execs';
import { fmtMoney } from '../../engine/news';
import {
  LAB_SIGN_DAYS, RESEARCH, breakthroughChance, fairFee, gainText, labPoints, labWages, maxStaff, patentReach, patentValuePerUnit, patentsOf, projectNeed, researcherPower,
} from '../../engine/research';
import type { Company, Patent, ResearchKind } from '../../engine/types';
import { Badge, Button, Card, Progress, SectionTitle, Stars, cx } from '../components/core';

/** A company's lab: the team, the current project, and its patents. */
export function ResearchTab({ c }: { c: Company }) {
  const w = useGame((s) => s.world)!;
  const lab = c.lab;
  const fx = c.labFx;
  const pts = labPoints(w, c);
  const mine = patentsOf(w).filter((p) => p.holderId === c.id);
  const shared = patentsOf(w).filter((p) => p.isPlayer && p.holderId !== c.id && patentReach(p, c) > 0);
  const rivals = patentsOf(w).filter((p) => !p.isPlayer && p.good === c.good);
  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="text-xs font-bold uppercase tracking-wider text-gold">What R&D gives {c.name} now</div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
          <Fx label="Unit cost" v={fx ? `−${((1 - fx.cost) * 100).toFixed(1)}%` : '—'} />
          <Fx label="Quality" v={fx?.quality ? `+${fx.quality.toFixed(2)}` : '—'} />
          <Fx label="Price room" v={fx?.price ? `+${Math.round(fx.price * 100)}%` : '—'} />
        </div>
        <p className="text-[11px] text-dim mt-2">From milestones your lab reached, your patents, patents of your other companies, and licences. The R&D budget in Operations also adds research points.</p>
      </Card>

      <SectionTitle>Project</SectionTitle>
      {lab?.project ? <Running c={c} /> : <Choose c={c} />}

      <SectionTitle right={<span className="text-xs text-muted">{lab?.staff.length ?? 0} of {maxStaff(c)} · {pts.toFixed(1)} points a day</span>}>Team</SectionTitle>
      <Team c={c} />

      {(mine.length > 0 || shared.length > 0) && (
        <>
          <SectionTitle>Your patents</SectionTitle>
          {mine.map((p) => <MyPatent key={p.id} p={p} />)}
          {shared.map((p) => (
            <Card key={p.id} className="p-3 text-sm">
              <b>{p.name}</b> <span className="text-muted">from {w.companies.find((x) => x.id === p.holderId)?.name}</span>
              <div className="text-xs text-muted">{p.good === c.good ? 'Works here in full' : 'A related product: works here at half strength'} · ends day {p.expires}</div>
            </Card>
          ))}
        </>
      )}

      {rivals.length > 0 && (
        <>
          <SectionTitle>Rivals' patents</SectionTitle>
          {rivals.map((p) => <RivalPatent key={p.id} p={p} c={c} />)}
        </>
      )}
    </div>
  );
}

function Fx({ label, v }: { label: string; v: string }) {
  return <div><div className="text-xs text-muted">{label}</div><b className={cx('num', v !== '—' && 'text-green')}>{v}</b></div>;
}

function Choose({ c }: { c: Company }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const pts = labPoints(w, c);
  const staffed = (c.lab?.staff.length ?? 0) > 0;
  return (
    <div className="space-y-2">
      {!staffed && <p className="text-sm text-muted">Hire researchers below to start a project. People who know {INDUSTRIES[c.industry].name.toLowerCase()} work far faster.</p>}
      {(Object.keys(RESEARCH) as ResearchKind[]).map((k) => {
        const d = RESEARCH[k];
        const need = projectNeed(c, k);
        const days = pts > 0 ? Math.ceil(need / pts) : null;
        const got = c.lab?.gains[d.unit] ?? 0;
        const tries = c.lab?.tries[k] ?? 0;
        return (
          <Card key={k} className="p-3">
            <div className="flex items-center justify-between"><b>{d.icon} {d.title}</b>{days != null && <span className="text-xs text-muted">about {days} days</span>}</div>
            <p className="text-xs text-muted">{d.does}</p>
            <ul className="text-xs mt-1.5 space-y-0.5">
              <li>Each of 3 milestones: {gainText(d.unit, d.step * Math.max(0, 1 - got / d.cap))}{got >= d.cap * 0.9 && ' (little left to gain here)'}</li>
              <li>Breakthrough at the end ({Math.round(breakthroughChance(w, c, k) * 100)}% chance{tries ? `, better after ${tries} tr${tries > 1 ? 'ies' : 'y'}` : ''}): a 5-year patent, {gainText(d.unit, d.prize)}</li>
            </ul>
            <Button block size="sm" className="mt-2" disabled={!staffed} onClick={() => dispatch({ type: 'startProject', companyId: c.id, kind: k })}>Start</Button>
          </Card>
        );
      })}
    </div>
  );
}

function Running({ c }: { c: Company }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const pr = c.lab!.project!;
  const d = RESEARCH[pr.kind];
  const pts = labPoints(w, c);
  const nextAt = (pr.need * (pr.stage + 1)) / 3;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between"><b>{d.icon} {d.title}</b><span className="text-xs text-muted">milestone {pr.stage} of 3</span></div>
      <div className="relative mt-2">
        <Progress value={pr.points / pr.need} tone="gold" />
        {[1, 2].map((i) => <span key={i} className="absolute top-0 h-full w-0.5 bg-surface" style={{ left: `${(i * 100) / 3}%` }} />)}
      </div>
      <div className="text-xs text-muted mt-1.5">{Math.round(pr.points)} of {pr.need} points · next milestone in about {pts > 0 ? Math.ceil((nextAt - pr.points) / pts) : '∞'} days</div>
      <div className="text-xs mt-1">Breakthrough chance at the end: <b>{Math.round(breakthroughChance(w, c, pr.kind) * 100)}%</b>. Better researchers and a Head of R&D raise it.</div>
      {pr.scooped && <p className="text-xs text-amber mt-1">A rival patented this idea first: a breakthrough would now be worth half.</p>}
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => dispatch({ type: 'stopProject', companyId: c.id })}>Stop project</Button>
    </Card>
  );
}

function Team({ c }: { c: Company }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const staff = c.lab?.staff ?? [];
  const pool = [...(w.play.labPool?.list ?? [])].sort((a, b) => researcherPower(b, c) - researcherPower(a, c));
  const full = staff.length >= maxStaff(c);
  return (
    <div className="space-y-2">
      {staff.map((r) => (
        <Card key={r.id} className="p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0"><div className="font-semibold">{r.name}</div><div className="text-xs text-muted">{INDUSTRIES[r.field].name} · {researcherPower(r, c).toFixed(1)} points a day · {fmtMoney(r.salary)}/day</div></div>
            <Stars value={stars(r.skill)} />
          </div>
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => dispatch({ type: 'fireResearcher', companyId: c.id, id: r.id })}>Let go ({fmtMoney(r.salary * LAB_SIGN_DAYS)})</Button>
        </Card>
      ))}
      {staff.length > 0 && <p className="text-xs text-muted">Lab wages: {fmtMoney(labWages(c))} a day, paid as R&D.</p>}
      <div className="text-xs font-bold uppercase tracking-wider text-muted pt-1">Looking for work this month</div>
      {pool.length === 0 && <Card className="p-3 text-sm text-muted">Nobody right now. New people apply each month.</Card>}
      {pool.map((r) => {
        const fee = r.salary * LAB_SIGN_DAYS;
        const fit = r.field === c.industry;
        return (
          <Card key={r.id} className="p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{r.name} {fit && <Badge tone="good">Right field</Badge>}</div>
                <div className="text-xs text-muted">{INDUSTRIES[r.field].name} · {researcherPower(r, c).toFixed(1)} points a day here · {fmtMoney(r.salary)}/day · {fmtMoney(fee)} to sign</div>
              </div>
              <Stars value={stars(r.skill)} />
            </div>
            <Button size="sm" block className="mt-2" disabled={full || c.cash < fee} onClick={() => dispatch({ type: 'hireResearcher', id: r.id, companyId: c.id })}>{full ? 'Lab is full' : 'Hire'}</Button>
          </Card>
        );
      })}
    </div>
  );
}

function MyPatent({ p }: { p: Patent }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const takers = w.companies.filter((x) => !x.isPlayer && !x.bankrupt && x.good === p.good && !p.licences.some((l) => l.companyId === x.id));
  const [to, setTo] = useState(takers[0]?.id ?? '');
  const target = takers.find((x) => x.id === to);
  const value = target ? patentValuePerUnit(w, p, target) : 0;
  const [mult, setMult] = useState(50);
  const fee = value * mult / 100;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between"><b>{p.name}</b><Badge tone="gold">Patent</Badge></div>
      <div className="text-xs text-muted">{gainText(RESEARCH[p.kind].unit, p.effect)} · ends day {p.expires} · licence fees so far {fmtMoney(p.earned)}</div>
      {p.licences.map((l) => {
        const lc = w.companies.find((x) => x.id === l.companyId);
        return <div key={l.companyId} className="text-xs mt-1">📄 {lc?.name ?? 'Gone'} pays {fmtMoney(l.fee)} a unit (about {fmtMoney((lc?.last.sold ?? 0) * l.fee * 30)} a month)</div>;
      })}
      {takers.length > 0 && (
        <div className="mt-2 rounded-lg border border-line p-2">
          <div className="text-xs font-semibold">License it to a rival</div>
          <select className="mt-1 w-full rounded-md bg-card-2 border border-line px-2 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Rival company">
            {takers.map((x) => <option key={x.id} value={x.id}>{x.name} · sells {Math.round(x.last.sold).toLocaleString()} a day</option>)}
          </select>
          <div className="flex justify-between text-xs mt-2"><span className="text-muted">Fee per unit</span><b className="num">{fmtMoney(fee)}</b></div>
          <input type="range" min={20} max={120} step={5} value={mult} onChange={(e) => setMult(Number(e.target.value))} className="w-full accent-[var(--color-gold)]" aria-label="Licence fee" />
          <div className="text-[11px] text-dim">Worth about {fmtMoney(value)} a unit to them. They pay on every unit they sell until the patent ends, and they get your edge.</div>
          <Button size="sm" block className="mt-2" disabled={!target} onClick={() => dispatch({ type: 'offerLicence', patentId: p.id, companyId: to, fee })}>Offer at {fmtMoney(fee)}/unit (≈ {fmtMoney(fee * (target?.last.sold ?? 0) * 30)}/month)</Button>
        </div>
      )}
    </Card>
  );
}

function RivalPatent({ p, c }: { p: Patent; c: Company }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const holder = w.companies.find((x) => x.id === p.holderId);
  const has = p.licences.some((l) => l.companyId === c.id);
  const fee = fairFee(w, p, c);
  const value = patentValuePerUnit(w, p, c);
  const rival = w.rivals.find((r) => r.id === p.ownerId);
  const refuses = !!rival && rival.relation <= -20;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between"><b>{p.name}</b><span className="text-xs text-muted">{holder?.name}</span></div>
      <div className="text-xs text-muted">{gainText(RESEARCH[p.kind].unit, p.effect)} for {GOODS[p.good].name.toLowerCase()} · ends day {p.expires}</div>
      {has ? <p className="text-xs text-green mt-1">You license this.</p> : refuses ? <p className="text-xs text-red mt-1">{rival!.name} will not license to you.</p> : (
        <Button size="sm" block className="mt-2" variant={value > fee ? 'gold' : 'dark'} onClick={() => dispatch({ type: 'acceptLicence', patentId: p.id, companyId: c.id })}>
          License for {fmtMoney(fee)}/unit (worth {fmtMoney(value)})
        </Button>
      )}
    </Card>
  );
}
