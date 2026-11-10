import { useGame } from '../../store/game';
import { EXEC_ROLES, EXEC_TRAITS, SIGN_DAYS, stars } from '../../engine/execs';
import { fmtMoney } from '../../engine/news';
import type { ExecRole, Executive } from '../../engine/types';
import { Badge, Button, Card, Screen, SectionTitle, Stars } from '../components/core';
import { SubHeader } from './More';

/** Hire, pay and keep the people who run your empire. */
export function ExecsScreen() {
  const w = useGame((s) => s.world)!;
  const execs = w.play.execs ?? [];
  const pool = w.play.candidates?.list ?? [];
  const hasCo = w.companies.some((c) => c.isPlayer && !c.bankrupt);
  return (
    <div>
      <SubHeader title="Executives" sub="The people who run your empire with you" />
      <Screen>
        <p className="text-sm text-muted mt-3">Executives work across all your companies. Better ones cost more and do more. Keep them happy: underpaid or bored executives work less and may quit. Hiring costs {SIGN_DAYS} days of salary up front; letting someone go costs the same.</p>
        {!hasCo && <Card className="mt-3 p-4 text-sm text-muted">Found a company first: candidates arrive once you have one.</Card>}
        {(Object.keys(EXEC_ROLES) as ExecRole[]).map((role) => {
          const e = execs.find((x) => x.role === role);
          const cands = pool.filter((x) => x.role === role);
          return (
            <div key={role}>
              <SectionTitle>{EXEC_ROLES[role].icon} {EXEC_ROLES[role].title}</SectionTitle>
              <p className="text-xs text-muted -mt-1 mb-2">{EXEC_ROLES[role].does}</p>
              {e ? <Hired e={e} /> : (
                <div className="space-y-2">
                  {cands.length === 0 && hasCo && <Card className="p-3 text-sm text-muted">No candidates right now. New ones apply each month.</Card>}
                  {cands.map((c) => <Candidate key={c.id} c={c} />)}
                </div>
              )}
            </div>
          );
        })}
      </Screen>
    </div>
  );
}

function Hired({ e }: { e: Executive }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const mood = e.morale >= 0.65 ? { t: 'Happy', tone: 'good' as const } : e.morale >= 0.4 ? { t: 'Content', tone: 'neutral' as const } : { t: 'Unhappy', tone: 'bad' as const };
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold">{e.name}</div>
          <div className="text-xs text-muted">{EXEC_TRAITS[e.trait].label} · {EXEC_TRAITS[e.trait].blurb} · since day {e.hired}</div>
        </div>
        <Badge tone={mood.tone}>{mood.t}</Badge>
      </div>
      <div className="flex items-center justify-between mt-2 text-sm">
        <Stars value={stars(e.skill)} />
        <span className="num font-semibold">{fmtMoney(e.salary)}/day</span>
      </div>
      {e.morale < 0.35 && <p className="text-xs text-amber mt-1">Unhappy executives coast: their effect is cut by 40% until they feel better.</p>}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button size="sm" variant="dark" onClick={() => dispatch({ type: 'raiseExec', id: e.id })}>Raise 10% ({fmtMoney(e.salary * 0.1)}/day)</Button>
        <Button size="sm" variant="ghost" disabled={w.player.cash < e.salary * SIGN_DAYS} onClick={() => dispatch({ type: 'fireExec', id: e.id })}>Let go ({fmtMoney(e.salary * SIGN_DAYS)})</Button>
      </div>
    </Card>
  );
}

function Candidate({ c }: { c: Executive }) {
  const w = useGame((s) => s.world)!;
  const dispatch = useGame((s) => s.dispatch);
  const fee = c.salary * SIGN_DAYS;
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{c.name}</div>
          <div className="text-xs text-muted">{EXEC_TRAITS[c.trait].label}: {EXEC_TRAITS[c.trait].blurb}</div>
        </div>
        <Stars value={stars(c.skill)} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted">{fmtMoney(c.salary)}/day · {fmtMoney(fee)} to sign</span>
        <Button size="sm" disabled={w.player.cash < fee} onClick={() => dispatch({ type: 'hireExec', id: c.id })}>Hire</Button>
      </div>
    </Card>
  );
}
