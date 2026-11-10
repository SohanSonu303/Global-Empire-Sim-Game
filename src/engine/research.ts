/**
 * Research labs and patents.
 *  - Each of your companies can hire researchers. Their skill and how well their field fits the
 *    company decide how fast a project moves; the R&D budget adds a little more.
 *  - A project has three milestones. Each one gives a small, sure gain. At the last one there is a
 *    rare chance of a breakthrough: a patent with a big effect that lasts five years.
 *  - Patents also help your other companies (fully for the same product, half for related ones),
 *    and can be licensed to rivals for a fee on every unit they sell. Rivals research too.
 */
import { GOODS, INDUSTRIES, INDUSTRY_IDS } from './data';
import { clamp, refPrice } from './company';
import { execSkill } from './execs';
import { addNews, fmtMoney } from './news';
import { banner } from './rewards';
import { chance, createRng, next, pick, range, type RngState } from './rng';
import type { CommandResult, Company, IndustryId, Lab, LabFx, Patent, Project, ResearchKind, Researcher, WorldState } from './types';

export const RESEARCH: Record<ResearchKind, { icon: string; title: string; does: string; need: number; step: number; cap: number; prize: number; unit: 'cost' | 'quality' | 'price' }> = {
  process: { icon: '⚙️', title: 'Cheaper production', does: 'Find ways to make each unit for less.', need: 600, step: 0.015, cap: 0.12, prize: 0.18, unit: 'cost' },
  quality: { icon: '💎', title: 'Better quality', does: 'Make the product better, so more buyers pick it and stay.', need: 480, step: 0.03, cap: 0.25, prize: 0.15, unit: 'quality' },
  premium: { icon: '✨', title: 'Premium version', does: 'A finer version that customers accept at a higher price.', need: 750, step: 0.02, cap: 0.1, prize: 0.12, unit: 'price' },
};

/** Days a patent lasts */
export const PATENT_DAYS = 1800;
export const LAB_SIGN_DAYS = 20;
/** Most researchers in one lab */
export function maxStaff(c: Company): number {
  return Math.min(10, 3 + c.level);
}

const FIRST = ['Ada', 'Kofi', 'Mei', 'Arjun', 'Elsa', 'Diego', 'Yara', 'Bram', 'Noor', 'Ines', 'Theo', 'Sana', 'Luca', 'Rhea', 'Omar', 'Vera'];
const LAST = ['Okafor', 'Lindgren', 'Takeda', 'Rao', 'Duval', 'Mbeki', 'Halloran', 'Petrov', 'Amari', 'Solberg', 'Iqbal', 'Ferro', 'Kaur', 'Wexler', 'Nakai', 'Rossi'];

/** Research has its own random stream, so labs never shift the rest of the world */
function rrng(w: WorldState): RngState {
  return (w.play.labRng ??= createRng((w.seed ^ 0x51ab3c) >>> 0));
}

// ---------- people ----------

/** How much a researcher adds a day: skill counts twice over, and the right field counts a lot */
export function researcherPower(r: Researcher, c: Company): number {
  return r.skill * r.skill * (r.field === c.industry ? 1.3 : 0.7);
}

function makeResearcher(w: WorldState, field: IndustryId): Researcher {
  const r = rrng(w);
  const skill = Math.round(clamp(range(r, 0.5, 1.3) + (next(r) < 0.12 ? 0.25 : 0), 0.5, 1.5) * 100) / 100;
  const salary = Math.round(200 * skill * skill * w.macro.priceLevel * (field === 'tech' || field === 'health' ? 1.3 : 1) / 10) * 10;
  return { id: `rs${++w.seq}`, name: `${pick(r, FIRST)} ${pick(r, LAST)}`, skill, field, salary, hired: 0 };
}

/** This month's people looking for lab jobs, mostly in the industries you are in */
export function labPool(w: WorldState): Researcher[] {
  const p = w.play;
  if (!p.labPool || w.day - p.labPool.day >= 30) {
    const mine = [...new Set(w.companies.filter((c) => c.isPlayer && !c.bankrupt).map((c) => c.industry))];
    const list: Researcher[] = [];
    for (let i = 0; i < 8; i++) list.push(makeResearcher(w, mine.length && next(rrng(w)) < 0.65 ? pick(rrng(w), mine) : pick(rrng(w), INDUSTRY_IDS)));
    p.labPool = { day: w.day, list };
  }
  return p.labPool.list;
}

function labOf(c: Company): Lab {
  return (c.lab ??= { staff: [], gains: { cost: 0, quality: 0, price: 0 }, tries: {} });
}

/** Daily wages of a lab (paid as part of R&D) */
export function labWages(c: Company): number {
  return c.lab ? c.lab.staff.reduce((s, r) => s + r.salary, 0) : 0;
}

/** Research points a lab makes in a day */
export function labPoints(w: WorldState, c: Company): number {
  const staff = c.lab?.staff ?? [];
  const people = staff.reduce((s, r) => s + researcherPower(r, c), 0);
  const budget = (c.last.revenue * c.rdPct) / (800 * w.macro.priceLevel);
  return (people + Math.min(budget, people + 1)) * (1 + 0.25 * Math.min(1.4, execSkill(w, 'rd')));
}

/** Points a project needs: bigger plants need more work */
export function projectNeed(c: Company, kind: ResearchKind): number {
  return Math.round(RESEARCH[kind].need * (1 + 0.15 * (c.level - 1)));
}

/** The chance the last milestone brings a breakthrough */
export function breakthroughChance(w: WorldState, c: Company, kind: ResearchKind): number {
  const staff = c.lab?.staff ?? [];
  if (!staff.length) return 0.02;
  const best = Math.max(...staff.map((r) => r.skill));
  const fit = staff.filter((r) => r.field === c.industry).length / staff.length;
  const tries = c.lab?.tries[kind] ?? 0;
  return clamp(0.07 + 0.08 * (best - 0.7) + 0.03 * fit + 0.04 * Math.min(1.4, execSkill(w, 'rd')) + 0.03 * tries, 0.03, 0.35);
}

function mineCo(w: WorldState, id: string): Company | undefined {
  return w.companies.find((x) => x.id === id && x.isPlayer && !x.bankrupt);
}

export function hireResearcher(w: WorldState, id: string, companyId: string): CommandResult {
  const c = mineCo(w, companyId);
  if (!c) return { ok: false, message: 'Company not found' };
  const r = labPool(w).find((x) => x.id === id);
  if (!r) return { ok: false, message: 'They took another job' };
  const lab = labOf(c);
  if (lab.staff.length >= maxStaff(c)) return { ok: false, message: `The lab has room for ${maxStaff(c)} researchers. Upgrade the plant for more.` };
  const fee = r.salary * LAB_SIGN_DAYS;
  if (c.cash < fee) return { ok: false, message: `${c.name} needs ${fmtMoney(fee)} to sign them` };
  c.cash -= fee;
  lab.staff.push({ ...r, hired: w.day });
  w.play.labPool!.list = w.play.labPool!.list.filter((x) => x !== r);
  return { ok: true, message: `${r.name} joins the ${c.name} lab` };
}

export function fireResearcher(w: WorldState, companyId: string, id: string): CommandResult {
  const c = mineCo(w, companyId);
  const r = c?.lab?.staff.find((x) => x.id === id);
  if (!c || !r) return { ok: false, message: 'Not found' };
  c.cash -= r.salary * LAB_SIGN_DAYS;
  c.lab!.staff = c.lab!.staff.filter((x) => x !== r);
  return { ok: true, message: `${r.name} leaves with ${fmtMoney(r.salary * LAB_SIGN_DAYS)} severance` };
}

export function startProject(w: WorldState, companyId: string, kind: ResearchKind): CommandResult {
  const c = mineCo(w, companyId);
  if (!c) return { ok: false, message: 'Company not found' };
  if (!RESEARCH[kind]) return { ok: false, message: 'Unknown project' };
  const lab = labOf(c);
  if (lab.project) return { ok: false, message: 'Finish or stop the current project first' };
  if (!lab.staff.length) return { ok: false, message: 'Hire at least one researcher first' };
  lab.project = { kind, started: w.day, points: 0, need: projectNeed(c, kind), stage: 0 };
  return { ok: true, message: `${RESEARCH[kind].title}: project started` };
}

export function stopProject(w: WorldState, companyId: string): CommandResult {
  const c = mineCo(w, companyId);
  if (!c?.lab?.project) return { ok: false, message: 'No project running' };
  delete c.lab.project;
  return { ok: true, message: 'Project stopped. Milestones already reached keep their gains.' };
}

// ---------- patents and their effects ----------

export function patentsOf(w: WorldState): Patent[] {
  return (w.play.patents ??= []);
}

function patentName(kind: ResearchKind, good: Company['good']): string {
  const g = GOODS[good].name;
  return kind === 'process' ? `Lean ${g} process` : kind === 'quality' ? `${g} quality formula` : `Premium ${g} design`;
}

function grant(w: WorldState, holder: Company, kind: ResearchKind, effect: number): Patent {
  const p: Patent = {
    id: `pt${++w.seq}`, holderId: holder.id, ownerId: holder.ownerId, isPlayer: holder.isPlayer, good: holder.good, kind, effect,
    name: patentName(kind, holder.good), granted: w.day, expires: w.day + PATENT_DAYS, licences: [], earned: 0,
  };
  patentsOf(w).push(p);
  return p;
}

/** Companies in the same group: all yours, or all of one rival */
function sameGroup(a: Company, holderOwner: string, holderPlayer: boolean): boolean {
  return holderPlayer ? a.isPlayer : a.ownerId === holderOwner && holderOwner !== 'public' && !a.isPlayer;
}

/** How much a patent helps a company: 1 = full, 0.5 = related product, 0 = not at all */
export function patentReach(p: Patent, c: Company): number {
  if (c.bankrupt) return 0;
  const licensed = p.licences.some((l) => l.companyId === c.id);
  if (c.id === p.holderId || licensed) return c.good === p.good ? 1 : 0;
  if (!sameGroup(c, p.ownerId, p.isPlayer)) return 0;
  if (c.good === p.good) return 1;
  if (p.kind !== 'process') return 0;
  const related = GOODS[c.good].industry === GOODS[p.good].industry || GOODS[c.good].inputs.some((i) => i.good === p.good) || GOODS[p.good].inputs.some((i) => i.good === c.good);
  return related ? 0.5 : 0;
}

export function computeFx(w: WorldState, c: Company): LabFx {
  const g = c.lab?.gains ?? { cost: 0, quality: 0, price: 0 };
  let cost = g.cost, quality = g.quality, price = g.price;
  for (const p of patentsOf(w)) {
    const k = patentReach(p, c);
    if (!k) continue;
    if (p.kind === 'process') cost += p.effect * k;
    else if (p.kind === 'quality') quality += p.effect * k;
    else price += p.effect * k;
  }
  return { cost: 1 - Math.min(0.35, cost), quality: Math.min(0.4, quality), price: Math.min(0.25, price) };
}

/** What a patent is worth to a company, per unit sold */
export function patentValuePerUnit(w: WorldState, p: Patent, c: Company): number {
  const ref = refPrice(w, c.good);
  if (p.kind === 'process') return p.effect * Math.max(c.last.unitMaterialCost || c.invCost || ref * 0.6, ref * 0.3);
  if (p.kind === 'quality') return p.effect * 0.4 * ref;
  return p.effect * 0.5 * ref;
}

/** The fee a rival would accept for a licence of yours, or asks for one of theirs */
export function fairFee(w: WorldState, p: Patent, c: Company): number {
  return patentValuePerUnit(w, p, c) * 0.5;
}

// ---------- licensing ----------

export function offerLicence(w: WorldState, patentId: string, companyId: string, fee: number): CommandResult {
  const p = patentsOf(w).find((x) => x.id === patentId);
  const c = w.companies.find((x) => x.id === companyId && !x.bankrupt);
  if (!p || !p.isPlayer) return { ok: false, message: 'That is not your patent' };
  if (!c || c.isPlayer || c.good !== p.good) return { ok: false, message: 'Pick a rival that makes the same product' };
  if (p.licences.some((l) => l.companyId === c.id)) return { ok: false, message: `${c.name} already has a licence` };
  const talks = (w.play.licenceTalks ??= {});
  const k = `${p.id}|${c.id}`;
  if ((talks[k] ?? -1) > w.day) return { ok: false, message: `${c.name} said no. Try again on day ${talks[k]}.` };
  const rival = w.rivals.find((r) => r.id === c.ownerId);
  if (rival && rival.relation <= -30) { talks[k] = w.day + 30; return { ok: false, message: `${rival.name} will not do business with you` }; }
  const value = patentValuePerUnit(w, p, c);
  if (fee <= value * 0.55 + 1e-9) {
    p.licences.push({ companyId: c.id, fee, since: w.day });
    if (rival) rival.relation = clamp(rival.relation + 5, -100, 100);
    return { ok: true, message: `${c.name} licenses your ${p.name} for ${fmtMoney(fee)} a unit` };
  }
  if (fee <= value * 1.3) return { ok: false, message: `${c.name} counters: ${fmtMoney(value * 0.5)} a unit` };
  talks[k] = w.day + 30;
  return { ok: false, message: `${c.name} says it is not worth that to them (about ${fmtMoney(value)} a unit at most). Try again in a month.` };
}

/** Take a licence on a rival's patent at the fee they ask */
export function acceptLicence(w: WorldState, patentId: string, companyId: string): CommandResult {
  const p = patentsOf(w).find((x) => x.id === patentId);
  const c = mineCo(w, companyId);
  if (!p || p.isPlayer || !c || c.good !== p.good) return { ok: false, message: 'That licence is not available' };
  if (p.licences.some((l) => l.companyId === c.id)) return { ok: false, message: 'You already have it' };
  const rival = w.rivals.find((r) => r.id === p.ownerId);
  if (rival && rival.relation <= -20) return { ok: false, message: `${rival.name} will not license to you` };
  const fee = fairFee(w, p, c);
  p.licences.push({ companyId: c.id, fee, since: w.day });
  return { ok: true, message: `${c.name} now uses the ${p.name} for ${fmtMoney(fee)} a unit` };
}

/** Rival patents your companies could license today */
export function licenceOffers(w: WorldState): { patent: Patent; company: Company; fee: number; value: number }[] {
  const out: { patent: Patent; company: Company; fee: number; value: number }[] = [];
  for (const p of patentsOf(w)) {
    if (p.isPlayer) continue;
    const rival = w.rivals.find((r) => r.id === p.ownerId);
    if (rival && rival.relation <= -20) continue;
    for (const c of w.companies) {
      if (!c.isPlayer || c.bankrupt || c.good !== p.good || p.licences.some((l) => l.companyId === c.id)) continue;
      out.push({ patent: p, company: c, fee: fairFee(w, p, c), value: patentValuePerUnit(w, p, c) });
    }
  }
  return out;
}

// ---------- the daily and monthly work ----------

function milestone(w: WorldState, c: Company, pr: Project): void {
  const def = RESEARCH[pr.kind];
  const lab = c.lab!;
  const cur = lab.gains[def.unit];
  // Each milestone is a sure but shrinking gain
  lab.gains[def.unit] = cur + def.step * Math.max(0, 1 - cur / def.cap);
  pr.stage += 1;
  if (pr.stage < 3) {
    banner(w, `${c.name}: R&D milestone ${pr.stage} of 3`, `${def.title} is on track. ${gainText(def.unit, def.step)} from now on.`, 40, 'good');
    return;
  }
  // The last milestone: a rare breakthrough
  const p = breakthroughChance(w, c, pr.kind);
  if (chance(rrng(w), p)) {
    const effect = def.prize * (pr.scooped ? 0.5 : 1);
    const pat = grant(w, c, pr.kind, effect);
    lab.tries[pr.kind] = 0;
    banner(w, `Breakthrough at ${c.name}!`, `The ${pat.name} is patented for 5 years: ${gainText(def.unit, effect)}. Your other companies making ${GOODS[c.good].name.toLowerCase()} get it too, and rivals may pay to license it.`, 400, 'gold');
    addNews(w, 'technology', `${c.name} patents a breakthrough`, `The ${pat.name} gives it an edge for years.`, 'good', [c.id]);
  } else {
    lab.tries[pr.kind] = (lab.tries[pr.kind] ?? 0) + 1;
    banner(w, `${c.name}: project finished`, `No breakthrough this time (it was a ${Math.round(p * 100)}% chance), but the milestones' gains stay. Trying again on the same idea makes a breakthrough more likely.`, 60, 'gold');
  }
  delete lab.project;
}

export function gainText(unit: 'cost' | 'quality' | 'price', v: number): string {
  return unit === 'cost' ? `${(v * 100).toFixed(1)}% cheaper to make` : unit === 'quality' ? `+${v.toFixed(2)} quality` : `customers accept a ${(v * 100).toFixed(0)}% higher price`;
}

/** Daily: labs make progress, licence fees are paid, and each company's R&D effects are set */
export function dailyResearch(w: WorldState): void {
  if (w.companies.some((c) => c.isPlayer && !c.bankrupt)) labPool(w);
  for (const c of w.companies) {
    const pr = c.lab?.project;
    if (!pr || c.bankrupt) continue;
    pr.points += labPoints(w, c);
    while (pr.stage < 3 && pr.points >= pr.need * (pr.stage + 1) / 3) {
      milestone(w, c, pr);
      if (!c.lab?.project) break;
    }
  }
  const pats = patentsOf(w);
  for (const p of pats) {
    const holder = w.companies.find((x) => x.id === p.holderId);
    for (const l of p.licences) {
      const lc = w.companies.find((x) => x.id === l.companyId);
      if (!lc || lc.bankrupt || !holder) continue;
      const pay = lc.last.sold * l.fee;
      lc.cash -= pay;
      holder.cash += pay;
      p.earned += pay;
    }
    if (p.isPlayer && p.expires - w.day === 60) banner(w, `Patent ends in 60 days`, `The ${p.name} runs out soon. Start a new project to stay ahead.`, 0, 'bad');
  }
  if (pats.some((p) => p.expires <= w.day)) {
    for (const p of pats.filter((x) => x.expires <= w.day && x.isPlayer)) addNews(w, 'technology', `Your ${p.name} patent ends`, 'Rivals are free to copy it now.', 'neutral');
    w.play.patents = pats.filter((p) => p.expires > w.day);
  }
  const any = patentsOf(w).length > 0;
  for (const c of w.companies) {
    if (!any && !c.lab) { if (c.labFx) delete c.labFx; continue; }
    const fx = computeFx(w, c);
    if (fx.cost < 1 || fx.quality > 0 || fx.price > 0) c.labFx = fx;
    else delete c.labFx;
  }
}

/** Monthly: rivals' labs sometimes get a breakthrough too, and may beat you to it */
export function monthlyResearch(w: WorldState): void {
  for (const c of w.companies) {
    if (c.isPlayer || c.bankrupt || c.rdPct <= 0) continue;
    const p = 0.003 * (c.rdPct / 0.03) * (c.industry === 'tech' || c.industry === 'health' ? 1.5 : 1);
    if (!chance(rrng(w), p)) continue;
    const kind = pick(rrng(w), ['process', 'quality', 'premium'] as ResearchKind[]);
    if (patentsOf(w).some((x) => x.holderId === c.id && x.kind === kind)) continue;
    const pat = grant(w, c, kind, RESEARCH[kind].prize * 0.8);
    addNews(w, 'technology', `${c.name} patents a breakthrough`, `Its ${pat.name} should give it an edge in ${GOODS[c.good].name.toLowerCase()}.`, 'neutral', [c.id]);
    // Your lab working on the same idea loses half its prize
    for (const m of w.companies) {
      const pr = m.lab?.project;
      if (m.isPlayer && m.good === c.good && pr?.kind === kind && !pr.scooped) {
        pr.scooped = true;
        banner(w, `${c.name} got there first`, `It patented a ${RESEARCH[kind].title.toLowerCase()} idea before ${m.name}. Your project still helps, but a breakthrough would now be worth half as much. You could license theirs instead.`, 0, 'bad');
      }
    }
  }
}

export function industryName(i: IndustryId): string {
  return INDUSTRIES[i].name;
}
