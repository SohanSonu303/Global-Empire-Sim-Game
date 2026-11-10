/**
 * Executives: people you hire to run parts of your whole empire.
 *  - CFO: customers pay faster, smarter tax planning, and warnings before cash runs short.
 *  - Sales head: customers come faster, and contracts pay better.
 *  - Operations chief: machines wear more slowly and every worker makes more.
 * Each has a skill, a personality and a salary. Underpaid or bored executives get unhappy
 * and may quit; a raise keeps them.
 */
import { clamp } from './company';
import { next, pick, range } from './rng';
import { banner } from './rewards';
import { fmtMoney } from './news';
import type { CommandResult, ExecRole, ExecTrait, Executive, WorldState } from './types';

export const EXEC_ROLES: Record<ExecRole, { title: string; icon: string; does: string }> = {
  cfo: { title: 'Chief Financial Officer', icon: '💼', does: 'Customers pay faster, less tax through smart planning, and early warnings when cash runs short.' },
  sales: { title: 'Head of Sales', icon: '🤝', does: 'Wins customers faster, and contracts from the board pay more.' },
  ops: { title: 'Operations Chief', icon: '🏭', does: 'Machines wear more slowly and every worker makes more.' },
  rd: { title: 'Head of R&D', icon: '🔬', does: 'Every lab makes up to 35% more progress, and breakthroughs come more often.' },
};

export const EXEC_TRAITS: Record<ExecTrait, { label: string; blurb: string }> = {
  steady: { label: 'Steady', blurb: 'Rarely gets unhappy.' },
  ambitious: { label: 'Ambitious', blurb: 'Works harder (+15% effect) but wants a raise every year.' },
  frugal: { label: 'Frugal', blurb: 'Takes a smaller salary, but a little less effect.' },
  star: { label: 'Star', blurb: 'Big effect and a big salary. Other firms try to poach them.' },
};

const FIRST = ['Ava', 'Ravi', 'Lena', 'Tomas', 'Priya', 'Owen', 'Mara', 'Kenji', 'Sofia', 'Idris', 'Nora', 'Felix', 'Aisha', 'Hugo', 'Leila', 'Mateo'];
const LAST = ['Marlow', 'Okonta', 'Vasquez', 'Lindqvist', 'Hartley', 'Desai', 'Brennan', 'Moreau', 'Achebe', 'Kowal', 'Sato', 'Ferreira', 'Quinlan', 'Abara', 'Novak', 'Castell'];

/** Signing fee and severance: this many days of salary */
export const SIGN_DAYS = 30;

function effectMult(e: Executive): number {
  const t = e.trait === 'ambitious' ? 1.15 : e.trait === 'star' ? 1.2 : e.trait === 'frugal' ? 0.9 : 1;
  const mood = e.morale < 0.35 ? 0.6 : 1; // an unhappy executive coasts
  return e.skill * t * mood;
}

/** How strong your executive in a role is (0 = nobody, about 1 = a good one) */
export function execSkill(w: WorldState, role: ExecRole): number {
  const e = w.play.execs?.find((x) => x.role === role);
  return e ? effectMult(e) : 0;
}

/** What an executive asks per day: more skill costs more, and big empires pay more */
function askSalary(w: WorldState, skill: number, trait: ExecTrait): number {
  const rev = w.companies.filter((c) => c.isPlayer && !c.bankrupt).reduce((s, c) => s + c.sum30.revenue / 30, 0);
  const base = Math.max(400, rev * 0.004) * Math.pow(skill, 1.6) * w.macro.priceLevel;
  return Math.round(base * (trait === 'star' ? 1.6 : trait === 'frugal' ? 0.75 : 1) / 10) * 10;
}

function makeCandidate(w: WorldState, role: ExecRole): Executive {
  const r = w.rng;
  const trait = pick(r, ['steady', 'steady', 'ambitious', 'frugal', 'star'] as ExecTrait[]);
  const skill = Math.round(clamp(range(r, 0.55, 1.3) + (trait === 'star' ? 0.2 : 0), 0.5, 1.5) * 100) / 100;
  return {
    id: `x${++w.seq}`, role, name: `${pick(r, FIRST)} ${pick(r, LAST)}`, skill, trait,
    salary: askSalary(w, skill, trait), hired: 0, morale: 0.8, lastRaise: 0,
  };
}

/** Candidates for every role, refreshed each month */
export function candidates(w: WorldState): Executive[] {
  const p = w.play;
  if (!p.candidates || w.day - p.candidates.day >= 30) {
    const list: Executive[] = [];
    for (const role of Object.keys(EXEC_ROLES) as ExecRole[]) for (let i = 0; i < 3; i++) list.push(makeCandidate(w, role));
    p.candidates = { day: w.day, list };
  }
  return p.candidates.list;
}

/** Stars out of 5 for a skill */
export function stars(skill: number): number {
  return clamp(Math.round((skill - 0.4) * 5), 1, 5);
}

export function hireExec(w: WorldState, id: string): CommandResult {
  const cand = candidates(w).find((x) => x.id === id);
  if (!cand) return { ok: false, message: 'That candidate has taken another job' };
  const execs = (w.play.execs ??= []);
  if (execs.some((x) => x.role === cand.role)) return { ok: false, message: `You already have a ${EXEC_ROLES[cand.role].title}. Let them go first.` };
  const fee = cand.salary * SIGN_DAYS;
  if (w.player.cash < fee) return { ok: false, message: `Signing fee is ${fmtMoney(fee)} of personal cash` };
  w.player.cash -= fee;
  execs.push({ ...cand, hired: w.day, lastRaise: w.day });
  w.play.candidates!.list = w.play.candidates!.list.filter((x) => x.id !== id);
  return { ok: true, message: `${cand.name} joins as ${EXEC_ROLES[cand.role].title}` };
}

export function fireExec(w: WorldState, id: string): CommandResult {
  const e = w.play.execs?.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Not found' };
  w.player.cash -= e.salary * SIGN_DAYS;
  w.play.execs = w.play.execs!.filter((x) => x !== e);
  return { ok: true, message: `${e.name} leaves with ${fmtMoney(e.salary * SIGN_DAYS)} severance` };
}

/** A 10% raise lifts morale */
export function raiseExec(w: WorldState, id: string): CommandResult {
  const e = w.play.execs?.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Not found' };
  e.salary = Math.round(e.salary * 1.1 / 10) * 10;
  e.morale = clamp(e.morale + 0.3, 0, 1);
  e.lastRaise = w.day;
  return { ok: true, message: `${e.name} is happy with the raise` };
}

/** Daily: pay salaries; executives' effects reach each company */
export function dailyExecs(w: WorldState): void {
  if (w.companies.some((c) => c.isPlayer && !c.bankrupt)) candidates(w); // keep this month's pool ready for the screen
  const execs = w.play.execs;
  const ops = execSkill(w, 'ops');
  for (const c of w.companies) {
    if (c.isPlayer && ops > 0) c.execOps = ops;
    else if (c.execOps) delete c.execOps;
  }
  if (!execs?.length) return;
  const pay = execs.reduce((s, e) => s + e.salary, 0);
  if (w.player.cash >= pay) w.player.cash -= pay;
  else {
    // Out of personal cash: the biggest company pays
    const big = w.companies.filter((c) => c.isPlayer && !c.bankrupt).sort((a, b) => b.cash - a.cash)[0];
    if (big) big.cash -= pay;
    else w.player.cash -= pay;
  }
}

/** Monthly: morale moves with pay and personality; unhappy executives may quit */
export function monthlyExecs(w: WorldState): void {
  const execs = w.play.execs;
  if (!execs?.length) return;
  for (const e of [...execs]) {
    const fair = askSalary(w, e.skill, e.trait);
    const paid = e.salary / Math.max(1, fair);
    let d = (paid - 1) * 0.3 + (e.trait === 'steady' ? 0.04 : 0);
    if (e.trait === 'ambitious' && w.day - e.lastRaise > 360) d -= 0.12;
    if (e.trait === 'star' && next(w.rng) < 0.15) d -= 0.15; // rivals call
    e.morale = clamp(e.morale + d, 0, 1);
    if (e.morale < 0.25 && next(w.rng) < 0.5) {
      w.play.execs = w.play.execs!.filter((x) => x !== e);
      banner(w, `${e.name} has quit`, `Your ${EXEC_ROLES[e.role].title.toLowerCase()} left for a better offer. Hire someone new under More › Executives.`, 0, 'bad');
    } else if (e.morale < 0.4) {
      banner(w, `${e.name} is unhappy`, `Your ${EXEC_ROLES[e.role].title.toLowerCase()} feels underpaid. A raise (More › Executives) keeps them.`, 0, 'bad');
    }
  }
}
