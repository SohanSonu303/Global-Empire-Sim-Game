import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import { GOODS } from '../../engine/data';
import { fmtMoney } from '../../engine/news';
import { MAX_TRAITS, TRAITS, traitDef } from '../../engine/traits';
import {
  DEADLINE_WEEK, FREELANCE, GOAL_VALUE, IDEAS, IDEA_IDS, INVESTORS, INVEST_AMOUNT, PAYOUT, PITCH_FINANCE_ASKED, PITCH_IDEA_ASKED, REVIEW_EVERY, START_TRUST, VALUE_WEEKS, WEEKLY_RATE,
  answerEvent, bigValuation, pitchQuestions, borrow, capacityOf, bankLimit, econOf, fire, hire, hireCost, launch, lesson, newStartup, nextReviewWeek, payout, pitchResult,
  playWeek, repay, ruleCheck, runway, seeReview, setMarketing, setPrice, setRd, setSide, starterOffers, targetFor, unitMargin, value, valueParts,
  LEVELS, SALES_CUT, SALES_REACH, SALES_FROM, TECH_FROM, TECH_QUALITY, TECH_ROYALTY, levelOf, marketingBudgetFor, peopleFrom, qualityFrom, rdBudgetFor, setSalesPartner, setTechPartner, techFee,
  type FreelanceKind, type Level, type IdeaId, type InvestorId, type Review, type Startup,
} from '../../engine/startup';
import type { TraitId } from '../../engine/types';
import { Badge, Button, Card, Progress, cx } from '../components/core';
import { GoodThumb } from '../art/plants';
import { play } from '../sound';

export type FlowStep = 'traits' | 'path' | 'idea' | 'investor' | 'pitch' | 'run' | 'exit' | 'starter';

export interface Flow {
  v: 2;
  mode: 'story' | 'established';
  step: FlowStep;
  name: string;
  traits: TraitId[];
  seed: number;
  idea?: IdeaId;
  kind?: FreelanceKind;
  startupName?: string;
  investor?: InvestorId;
  startup?: Startup;
}

const KEY = 'ge.newgame.v2';

/** Round amounts like $500K without decimals. */
const short = (n: number) => (n >= 1e6 ? fmtMoney(n) : `$${Math.round(n / 1000)}K`);
const fmtNum = (n: number) => Math.round(n).toLocaleString();

export function loadFlow(): Flow | null {
  try {
    const raw = localStorage.getItem(KEY);
    const f = raw ? (JSON.parse(raw) as Flow) : null;
    if (f?.startup && f.startup.v !== 2) return null; // saved by the old mini-game
    return f && f.v === 2 ? f : null;
  } catch {
    return null;
  }
}

function saveFlow(f: Flow | null) {
  try {
    if (f) localStorage.setItem(KEY, JSON.stringify(f));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the flow still works for this session */
  }
}

export function startFlow(mode: Flow['mode'], name: string): Flow {
  try { localStorage.removeItem('ge.newgame.v1'); } catch { /* ignore */ }
  return { v: 2, mode, step: 'traits', name, traits: [], seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 };
}

/** The whole new-game flow: traits, then (story mode) the startup mini-game and the first company. */
export function NewGameFlow({ flow: initial, onExit }: { flow: Flow; onExit: () => void }) {
  const [flow, setFlowState] = useState<Flow>(initial);
  const newGame = useGame((s) => s.newGame);
  const setFlow = (f: Flow) => { setFlowState(f); saveFlow(f); };
  useEffect(() => { window.scrollTo(0, 0); }, [flow.step]);

  const finishEstablished = (traits: TraitId[]) => {
    saveFlow(null);
    newGame('established', flow.name, { traits });
  };

  const back = (step: FlowStep | null) => (step ? setFlow({ ...flow, step }) : (saveFlow(null), onExit()));

  return (
    <div className="min-h-full px-gutter pb-10 pt-4 max-w-xl mx-auto">
      {flow.mode === 'story' && <StoryProgress step={flow.step} />}
      {flow.step === 'traits' && (
        <TraitPicker value={flow.traits} onBack={() => back(null)}
          onDone={(traits) => (flow.mode === 'established' ? finishEstablished(traits) : setFlow({ ...flow, traits, step: 'path' }))} />
      )}
      {flow.step === 'path' && (
        <PathPick onBack={() => back('traits')} onPlay={() => setFlow({ ...flow, step: 'idea' })}
          onSkip={() => { saveFlow(null); newGame('young', flow.name, { traits: flow.traits }); }} />
      )}
      {flow.step === 'idea' && (
        <IdeaPicker flow={flow} onBack={() => back('path')} onDone={(idea, kind, startupName) => setFlow({ ...flow, idea, kind, startupName, step: 'investor' })} />
      )}
      {flow.step === 'investor' && flow.idea && (
        <InvestorPicker idea={flow.idea} onBack={() => back('idea')} onDone={(investor) => setFlow({ ...flow, investor, step: 'pitch' })} />
      )}
      {flow.step === 'pitch' && flow.idea && flow.investor && (
        <Pitch flow={flow} onBack={() => back('investor')} onDone={() => {
          const s = newStartup(flow.seed, flow.idea!, flow.startupName ?? 'My Startup', flow.investor!, flow.kind);
          play('coin');
          setFlow({ ...flow, startup: s, step: 'run' });
        }} />
      )}
      {flow.step === 'run' && flow.startup && (
        <StartupRun s={flow.startup} onChange={(s) => setFlow({ ...flow, startup: s, step: s.stage === 'won' ? 'exit' : 'run' })}
          onRestart={() => setFlow({ ...flow, startup: undefined, seed: flow.seed + 1, step: 'idea' })} />
      )}
      {flow.step === 'exit' && flow.startup && <ExitStory s={flow.startup} onDone={() => setFlow({ ...flow, step: 'starter' })} />}
      {flow.step === 'starter' && flow.startup && (
        <StarterPick flow={flow} onDone={(o) => {
          const s = flow.startup!;
          saveFlow(null);
          newGame('young', flow.name, {
            traits: flow.traits,
            starter: { good: o.good, name: o.name, price: o.price },
            startup: { idea: IDEAS[s.idea].name, name: s.name, investor: INVESTORS[s.investor].name, payout: payout(s), valuation: bigValuation(s) },
          });
        }} />
      )}
    </div>
  );
}

const STORY_STEPS: { id: FlowStep[]; label: string }[] = [
  { id: ['traits', 'path'], label: 'Traits' },
  { id: ['idea', 'investor', 'pitch'], label: 'Pitch' },
  { id: ['run'], label: 'Startup' },
  { id: ['exit', 'starter'], label: 'Empire' },
];

function StoryProgress({ step }: { step: FlowStep }) {
  const at = STORY_STEPS.findIndex((s) => s.id.includes(step));
  return (
    <div className="flex items-center gap-1.5 mb-4" aria-label="Progress">
      {STORY_STEPS.map((s, i) => (
        <div key={s.label} className="flex-1">
          <div className={cx('h-1.5 rounded-full', i <= at ? 'bg-gold' : 'bg-line')} />
          <div className={cx('text-[11px] mt-1 text-center', i === at ? 'text-gold font-semibold' : 'text-dim')}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Header({ kicker, title, sub, onBack }: { kicker: string; title: string; sub?: ReactNode; onBack?: () => void }) {
  return (
    <div className="mb-4">
      {onBack && <button onClick={onBack} className="text-sm text-muted mb-2 min-h-tap -ml-1 px-1">← Back</button>}
      <div className="text-xs font-bold uppercase tracking-wider text-gold">{kicker}</div>
      <h1 className="text-2xl font-black leading-tight mt-0.5">{title}</h1>
      {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- play the startup or skip it

/** Cash you start the main game with when you skip the startup */
const SKIP_CASH = 600_000;

function PathPick({ onPlay, onSkip, onBack }: { onPlay: () => void; onSkip: () => void; onBack: () => void }) {
  return (
    <div className="anim-fade">
      <Header kicker="Chapter 1 · The startup" title="How do you want to start?" onBack={onBack}
        sub="Your traits are set. Play a short startup game first, or skip straight to the main game." />
      <div className="space-y-2.5">
        <button onClick={onPlay} className="w-full text-left rounded-card border border-gold bg-gold/10 p-3 flex gap-3 items-center">
          <span className="grid place-items-center size-12 shrink-0 rounded-xl text-2xl bg-gold/20 border border-gold/50" aria-hidden>🚀</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="font-bold">Play the startup</span><Badge tone="gold">Recommended</Badge></div>
            <div className="text-xs text-muted mt-0.5">Pitch an investor, grow a small startup and sell it for {short(PAYOUT)}. Then buy your first company with what you earned. Teaches price, marketing, R&D and cash.</div>
          </div>
        </button>
        <button onClick={onSkip} className="w-full text-left rounded-card border border-line bg-card hover:border-line-strong p-3 flex gap-3 items-center">
          <span className="grid place-items-center size-12 shrink-0 rounded-xl text-2xl bg-card-2 border border-line" aria-hidden>⏩</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold">Skip to the main game</div>
            <div className="text-xs text-muted mt-0.5">Start now with {short(SKIP_CASH)} and your traits. You found your own first company; your assistant shows you how.</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- traits

function TraitPicker({ value, onDone, onBack }: { value: TraitId[]; onDone: (t: TraitId[]) => void; onBack: () => void }) {
  const [sel, setSel] = useState<TraitId[]>(value);
  const toggle = (id: TraitId) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_TRAITS ? [s[1], id] : [...s, id]));
  return (
    <div className="anim-fade">
      <Header kicker="Your career" title="Pick two traits" onBack={onBack}
        sub="Traits help you for the whole game. Each one pays on a different kind of income, so pick the two that fit how you want to play." />
      <div className="space-y-2.5">
        {TRAITS.map((t) => {
          const on = sel.includes(t.id);
          return (
            <button key={t.id} onClick={() => toggle(t.id)} aria-pressed={on}
              className={cx('w-full text-left rounded-card border p-3 transition-colors', on ? 'border-gold bg-gold/10' : 'border-line bg-card hover:border-line-strong')}>
              <div className="flex items-start gap-3">
                <span className={cx('grid place-items-center size-12 shrink-0 rounded-xl text-2xl border', on ? 'bg-gold/20 border-gold/50' : 'bg-card-2 border-line')}>{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-base">{t.name}</div>
                    <span className={cx('size-6 rounded-full border-2 grid place-items-center text-xs font-black', on ? 'bg-gold border-gold text-gold-ink' : 'border-line-strong')}>{on ? '✓' : ''}</span>
                  </div>
                  <div className="text-sm text-muted">{t.short}</div>
                  <ul className="mt-1.5 space-y-0.5">
                    {t.perks.map((p) => <li key={p} className="text-xs text-text/90 flex gap-1.5"><span className="text-green">+</span>{p}</li>)}
                  </ul>
                  <div className="text-[11px] text-dim mt-1">Best for: {t.best}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="sticky bottom-0 pt-3 pb-2 bg-gradient-to-t from-bg via-bg to-transparent">
        <Button block size="lg" disabled={sel.length !== MAX_TRAITS} onClick={() => onDone(sel)}>
          {sel.length === MAX_TRAITS ? `Continue with ${sel.map((x) => traitDef(x).name).join(' + ')}` : `Pick ${MAX_TRAITS - sel.length} more`}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- idea

function IdeaPicker({ flow, onDone, onBack }: { flow: Flow; onDone: (idea: IdeaId, kind: FreelanceKind | undefined, name: string) => void; onBack: () => void }) {
  const [idea, setIdea] = useState<IdeaId | undefined>(flow.idea);
  const [kind, setKind] = useState<FreelanceKind>(flow.kind ?? 'design');
  const [name, setName] = useState(flow.startupName ?? '');
  const riskTone = (r: string) => (r === 'High' ? 'bad' : r === 'Low' ? 'good' : 'warn');
  return (
    <div className="anim-fade">
      <Header kicker="Chapter 1 · The startup" title="What will you build?" onBack={onBack}
        sub={<>Every empire starts small. Build a startup worth <b className="text-gold">{short(GOAL_VALUE)}</b>, sell it, and use the money to buy your first real company.</>} />
      <div className="space-y-2.5">
        {IDEA_IDS.map((id) => {
          const d = IDEAS[id];
          const on = idea === id;
          return (
            <div key={id} className={cx('rounded-card border transition-colors', on ? 'border-gold bg-gold/10' : 'border-line bg-card')}>
              <button onClick={() => setIdea(id)} aria-pressed={on} className="w-full text-left p-3 flex gap-3 items-start">
                <span className="grid place-items-center size-12 shrink-0 rounded-xl bg-card-2 border border-line text-2xl">{d.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold">{d.name}</div>
                    <span className="shrink-0 whitespace-nowrap"><Badge tone={riskTone(d.risk)}>{d.risk === 'Low to medium' ? 'Low-med' : d.risk} risk</Badge></span>
                  </div>
                  <div className="text-sm text-muted">{d.blurb}</div>
                  {on && <div className="text-xs text-text/90 mt-1">{d.style}</div>}
                </div>
              </button>
              {on && id === 'freelance' && (
                <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                  {(Object.keys(FREELANCE) as FreelanceKind[]).map((k) => (
                    <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                      className={cx('rounded-lg border p-2 text-left', kind === k ? 'border-gold bg-gold text-gold-ink' : 'border-line bg-card-2')}>
                      <div className="text-sm font-bold">{FREELANCE[k].icon} {FREELANCE[k].name}</div>
                      <div className={cx('text-[11px] leading-tight mt-0.5', kind === k ? 'text-gold-ink/80' : 'text-muted')}>{FREELANCE[k].blurb}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <label htmlFor="startup-name" className="block text-sm text-muted mt-4 mb-1">Startup name</label>
      <input id="startup-name" value={name} maxLength={28} placeholder={idea ? defaultName(idea, kind) : 'Pick an idea first'} onChange={(e) => setName(e.target.value)}
        className="w-full min-h-tap rounded-lg bg-bg border border-line-strong px-3 text-base outline-none focus:border-gold" />
      <Button block size="lg" className="mt-4" disabled={!idea} onClick={() => idea && onDone(idea, idea === 'freelance' ? kind : undefined, name.trim() || defaultName(idea, kind))}>
        Find an investor
      </Button>
    </div>
  );
}

function defaultName(idea: IdeaId, kind: FreelanceKind): string {
  return { chips: 'Siliconeer Labs', gaming: 'Pixel Harbor Games', energy: 'Brightgrid Research', ai: 'Cortex AI', freelance: `${FREELANCE[kind].name.split(' ')[0]} Studio` }[idea];
}

// ---------------------------------------------------------------- investor + pitch

function Avatar({ id, size = 48 }: { id: InvestorId; size?: number }) {
  const inv = INVESTORS[id];
  const initials = inv.name.split(' ').map((x) => x[0]).join('');
  return <span className="grid place-items-center rounded-full font-black text-white shrink-0" style={{ width: size, height: size, background: inv.avatar, fontSize: size * 0.36 }}>{initials}</span>;
}

function InvestorPicker({ idea, onDone, onBack }: { idea: IdeaId; onDone: (id: InvestorId) => void; onBack: () => void }) {
  return (
    <div className="anim-fade">
      <Header kicker="Chapter 1 · The pitch" title="Who will you pitch?" onBack={onBack}
        sub="Each investor backs only some kinds of business. They buy 51% of yours and check you every month against their own rule." />
      <div className="space-y-2.5">
        {(Object.keys(INVESTORS) as InvestorId[]).map((id) => {
          const inv = INVESTORS[id];
          const fit = inv.likes.includes(idea);
          return (
            <Card key={id} className={cx('p-3', !fit && 'opacity-55')} onClick={fit ? () => onDone(id) : undefined}>
              <div className="flex gap-3 items-start">
                <Avatar id={id} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold">{inv.name}</div>
                    <span className="shrink-0 whitespace-nowrap">{fit ? <Badge tone="good">Backs your idea</Badge> : <Badge>Not interested</Badge>}</span>
                  </div>
                  <div className="text-xs text-muted">{inv.firm} · only backs {inv.likes.map((l) => IDEAS[l].name).join(' and ')}</div>
                  <div className="text-sm italic text-text/90 mt-1">"{inv.quote}"</div>
                  <div className="text-xs mt-2 rounded-md bg-card-2 border border-line px-2 py-1.5"><b className="text-gold">Their rule:</b> {inv.rule}</div>
                  {fit && <div className="text-xs text-muted mt-1.5">Invests <b className="text-text">{short(INVEST_AMOUNT[idea])}</b> only if you answer all {PITCH_FINANCE_ASKED + PITCH_IDEA_ASKED} finance and technical questions right.</div>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** A repeatable shuffle, so answer positions change on every attempt. */
function order(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let x = (seed >>> 0) || 1;
  for (let i = n - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function Pitch({ flow, onDone, onBack }: { flow: Flow; onDone: () => void; onBack: () => void }) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [attempt, setAttempt] = useState(0);
  const idea = flow.idea!;
  const invId = flow.investor!;
  const inv = INVESTORS[invId];
  const first = inv.name.split(' ')[0];
  const qs = useMemo(() => pitchQuestions(idea, flow.seed, attempt), [idea, flow.seed, attempt]);
  const result = answers.length === qs.length ? pitchResult(idea, invId, qs, answers) : null;
  const q = result ? null : qs[answers.length];
  const ord = q ? order(q.options.length, flow.seed + attempt * 977 + answers.length * 131 + 7) : [];
  useEffect(() => { if (result) play(result.pass ? 'coin' : 'bad'); }, [result?.pass, answers.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = () => { setAnswers([]); setAttempt(attempt + 1); };
  return (
    <div className="anim-fade">
      <Header kicker={`Pitching ${inv.firm}`} title={result ? (result.pass ? 'Deal!' : 'No deal') : `Question ${answers.length + 1} of ${qs.length}`}
        sub={!result ? <>Simple money questions and a few about your business. <b className="text-text">You can get one wrong.</b></> : undefined}
        onBack={answers.length && !result ? () => setAnswers(answers.slice(0, -1)) : onBack} />
      {!result && (
        <div className="flex gap-1.5 mb-3" aria-hidden>
          {qs.map((_, i) => <div key={i} className={cx('h-1.5 flex-1 rounded-full', i < answers.length ? 'bg-gold' : i === answers.length ? 'bg-gold/40' : 'bg-line')} />)}
        </div>
      )}
      <Card className="p-4">
        <div className="flex gap-3 items-start">
          <Avatar id={invId} size={44} />
          <div className="flex-1">
            <div className="text-xs text-muted">{inv.name}</div>
            <div className="rounded-xl rounded-tl-sm bg-card-2 border border-line px-3 py-2 mt-1 font-semibold">{result ? result.verdict : q!.q}</div>
          </div>
        </div>
        {q && (
          <div className="space-y-2 mt-4" key={`${attempt}-${answers.length}`}>
            {ord.map((i, n) => (
              <button key={q.options[i].text} onClick={() => { play('tap'); setAnswers([...answers, i]); }}
                className="w-full text-left rounded-lg border border-line bg-card-2 hover:border-gold px-3 py-3 text-sm anim-fade flex gap-2.5">
                <span className="font-black text-gold">{'ABCD'[n]}</span><span>{q.options[i].text}</span>
              </button>
            ))}
          </div>
        )}
        {result?.pass && (
          <div className="mt-4 anim-pop">
            <div className="text-center">
              <div className="text-sm text-muted">{inv.name} invests</div>
              <div className="text-4xl font-black text-gold num">{short(result.amount)}</div>
              <div className="text-sm text-muted">for 51% of {flow.startupName}</div>
            </div>
            <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm space-y-1.5">
              <div>🎯 <b>Goal:</b> make {flow.startupName} worth <b>{short(GOAL_VALUE)}</b> by week <b>{DEADLINE_WEEK}</b>. Then {first} buys it and pays you <b>{short(PAYOUT)}</b>.</div>
              <div>📅 <b>Every {REVIEW_EVERY} weeks</b> {first} checks two things: the value against a rising target, and the rule below.</div>
              <div>📜 <b>{first}'s rule:</b> {inv.rule}</div>
              <div>⚖️ Pass both: trust +10. Each miss: trust −15. You start at {START_TRUST}. <b>At 0 you are fired.</b></div>
            </div>
            <Button block size="lg" className="mt-4" onClick={onDone}>🤝 Shake hands</Button>
          </div>
        )}
        {result && !result.pass && (
          <div className="mt-4 anim-fade">
            {!result.offTopic && <div className="text-sm text-muted mb-2">You got <b className="text-text">{result.correct} of {result.total}</b> right. Here is what you missed:</div>}
            <div className="space-y-2">
              {result.misses.map((m) => (
                <div key={m.q} className="rounded-lg border border-red/40 bg-red-dim/40 p-2.5 text-sm">
                  <div className="font-semibold">{m.q}</div>
                  <div className="text-xs text-text/90 mt-1"><span className="text-green font-bold">Answer: </span>{m.why}</div>
                </div>
              ))}
            </div>
            <Button block size="lg" className="mt-4" onClick={retry}>Study and pitch again</Button>
            <div className="text-[11px] text-dim text-center mt-1.5">You will get a new set of questions.</div>
            <button className="w-full text-xs text-muted mt-2 min-h-tap" onClick={onBack}>Pick another investor</button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- the startup itself

function Spark({ values }: { values: number[] }) {
  const vs = values.slice(-40);
  if (vs.length < 2) return null;
  const max = Math.max(GOAL_VALUE, ...vs);
  const w = 300, h = 56;
  const pts = vs.map((v, i) => `${(i / (vs.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  const goalY = h - (GOAL_VALUE / max) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 mt-2" preserveAspectRatio="none" aria-hidden>
      <line x1="0" x2={w} y1={goalY} y2={goalY} stroke="var(--color-gold)" strokeDasharray="4 4" strokeWidth="1" opacity="0.6" />
      <polyline points={pts} fill="none" stroke="var(--color-green)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-card-2 border border-line p-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cx('num text-lg font-bold leading-tight', tone === 'good' && 'text-green', tone === 'bad' && 'text-red')}>{value}</div>
      {sub && <div className="text-[11px] text-dim leading-snug">{sub}</div>}
    </div>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const LEVEL_LABEL: Record<Level, string> = { off: 'Off', low: 'Low', normal: 'Normal', high: 'High' };

/** Four simple budget levels instead of fiddly +/- steps */
function LevelPick({ label, value, at, effect, sub, onPick }: { label: string; value: number; at: (l: Level) => number; effect: (amount: number) => string; sub: ReactNode; onPick: (amount: number) => void }) {
  const cur = levelOf(value, at);
  return (
    <div className="py-2.5 border-b border-line">
      <div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="num text-gold">{fmtMoney(value)}/wk</span></div>
      <div className="text-[11px] text-muted leading-snug">{sub}</div>
      <div className="grid grid-cols-4 gap-1.5 mt-1.5">
        {LEVELS.map((l) => (
          <button key={l} onClick={() => onPick(at(l))} aria-pressed={cur === l}
            className={cx('rounded-lg border px-1 py-1.5 text-center', cur === l ? 'border-gold bg-gold text-gold-ink' : 'border-line bg-card-2')}>
            <div className="text-xs font-bold">{LEVEL_LABEL[l]}{l === 'normal' && cur !== l ? ' ★' : ''}</div>
            <div className={cx('text-[10px] num', cur === l ? 'opacity-80' : 'text-dim')}>{at(l) ? fmtMoney(at(l)) : '$0'}</div>
          </button>
        ))}
      </div>
      <div className="text-[11px] text-dim mt-1">{effect(value)}</div>
    </div>
  );
}

function Toggle({ on, title, sub, onClick }: { on: boolean; title: string; sub: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className="w-full flex items-center gap-2 py-2.5 text-left border-b border-line last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-muted leading-snug">{sub}</div>
      </div>
      <span className={cx('w-11 h-6 rounded-full border relative shrink-0 transition-colors', on ? 'bg-gold border-gold-edge' : 'bg-card-2 border-line-strong')}>
        <span className={cx('absolute top-0.5 size-[18px] rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

function Lever({ label, value, sub, minus, plus }: {
  label: string; value: ReactNode; sub?: ReactNode;
  minus: { label: string; onClick: () => void; disabled?: boolean };
  plus: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-line last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{label} <span className="num text-gold">{value}</span></div>
        {sub && <div className="text-[11px] text-muted leading-snug">{sub}</div>}
      </div>
      <Button size="sm" variant="dark" className="shrink-0 !px-2.5" disabled={minus.disabled} onClick={minus.onClick}>{minus.label}</Button>
      <Button size="sm" variant="dark" className="shrink-0 !px-2.5" disabled={plus.disabled} onClick={plus.onClick}>{plus.label}</Button>
    </div>
  );
}

const MODEL_HELP: Record<'hours' | 'subs' | 'copies', string[]> = {
  hours: [
    'You sell hours. Sales = the smaller of what clients want (demand) and what your team can do (capacity).',
    'Demand grows with marketing and happy clients. A higher price lowers demand but earns more per hour.',
    'Fully booked? Raise the price or hire. Team idle? Market more, cut the price or let someone go.',
  ],
  subs: [
    'Customers pay every week until they leave. New sign-ups come from marketing; some leave every week (churn).',
    'Better quality (R&D) brings more sign-ups and fewer leavers. A high price means fewer sign-ups and more leavers.',
    'Each person supports a limited number of customers. Customers you cannot support get angry and leave.',
  ],
  copies: [
    'You sell copies. Before launch, marketing builds hype: the people who will buy in the first weeks.',
    'After launch sales fade as buyers run out and the game gets old. R&D ships updates that bring players back.',
    'The store keeps a share of every sale. Launch with big hype and keep updating.',
  ],
};

function ReviewModal({ s, r, onOk }: { s: Startup; r: Review; onOk: () => void }) {
  const inv = INVESTORS[s.investor];
  const i = s.reviews.indexOf(r);
  const before = i > 0 ? s.reviews[i - 1].trust : START_TRUST;
  const delta = r.trust - before;
  const pass = r.valueOk && r.ruleOk;
  useEffect(() => { play(pass ? 'coin' : 'bad'); }, [pass]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/60 anim-fade" role="dialog" aria-modal="true" aria-label={`Month ${r.month} review`}>
      <div className="w-full max-w-md bg-card border border-line-strong rounded-t-2xl sm:rounded-2xl p-4 anim-sheet">
        <div className="text-xs font-bold uppercase tracking-wider text-gold">Month {r.month} review · week {r.month * REVIEW_EVERY}</div>
        <div className="font-black text-xl mt-0.5">{pass ? 'Review passed' : 'Review missed'}</div>
        <div className="space-y-1.5 mt-3">
          <div className={cx('flex justify-between gap-2 rounded-lg border p-2.5 text-sm', r.valueOk ? 'border-green/40 bg-green-dim/40' : 'border-red/40 bg-red-dim/40')}>
            <span>{r.valueOk ? '✓' : '✗'} Value <b className="num">{short(r.value)}</b></span><span className="text-muted">target {short(r.target)}</span>
          </div>
          <div className={cx('rounded-lg border p-2.5 text-sm', r.ruleOk ? 'border-green/40 bg-green-dim/40' : 'border-red/40 bg-red-dim/40')}>
            {r.ruleOk ? '✓' : '✗'} {inv.ruleShort}: <span className="text-muted">{r.ruleText}</span>
          </div>
        </div>
        <div className="flex gap-3 items-start mt-3">
          <Avatar id={s.investor} size={36} />
          <div className="rounded-xl rounded-tl-sm bg-card-2 border border-line px-3 py-2 text-sm flex-1">{r.message}</div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted"><span>Trust</span><span className={cx('num font-bold', delta >= 0 ? 'text-green' : 'text-red')}>{r.trust} ({delta >= 0 ? '+' : ''}{delta})</span></div>
          <Progress value={r.trust / 100} tone={r.trust >= 50 ? 'green' : r.trust >= 25 ? 'amber' : 'red'} height={8} />
        </div>
        <Button block size="lg" className="mt-4" onClick={onOk}>{s.stage === 'lost' ? 'See what happened' : 'Back to work'}</Button>
      </div>
    </div>
  );
}

const LOST: Record<NonNullable<Startup['lostReason']>, { icon: string; title: (s: Startup) => string; text: (s: Startup) => string }> = {
  fired: { icon: '🚪', title: (s) => `${INVESTORS[s.investor].name.split(' ')[0]} fired you`,
    text: (s) => `Trust reached 0 after missed reviews. Every month the value must beat the target and you must keep the rule: ${INVESTORS[s.investor].rule.toLowerCase()}` },
  bust: { icon: '💸', title: () => 'Out of cash', text: () => 'The money ran out twice. Watch your runway (cash ÷ weekly loss) and cut costs before it reaches zero.' },
  deadline: { icon: '⏰', title: () => 'Out of time', text: (s) => `Week ${DEADLINE_WEEK} came and ${s.name} was worth ${short(value(s))}, not ${short(GOAL_VALUE)}. Value comes from profit and sales over the last ${VALUE_WEEKS} weeks: grow them earlier.` },
  quit: { icon: '🏳️', title: (s) => `${s.name} shut down`, text: () => 'You closed the company when the cash ran out.' },
};

function StartupRun({ s, onChange, onRestart }: { s: Startup; onChange: (s: Startup) => void; onRestart: () => void }) {
  const e = econOf(s);
  const spec = IDEAS[s.idea];
  const inv = INVESTORS[s.investor];
  const v = value(s);
  const L = s.last;
  const reviewWk = nextReviewWeek(s);
  const target = targetFor(reviewWk / REVIEW_EVERY);
  const rule = ruleCheck(s);
  const unseen = s.reviews.find((r) => !r.seen);
  const tip = lesson(s);
  const rw = runway(s);
  const limit = bankLimit(s);
  const perWeek = e.model === 'subs' ? '/week' : '';
  const running = s.stage === 'run';

  const mut = (fn: (n: Startup) => void) => {
    const n = structuredClone(s);
    fn(n);
    play('tap');
    onChange(n);
  };
  const advance = (toReview: boolean) => {
    const n = structuredClone(s);
    const before = n.cash;
    for (let i = 0; i < REVIEW_EVERY; i++) {
      playWeek(n);
      if (!toReview || n.stage !== 'run' || n.event || n.reviews.some((r) => !r.seen)) break;
    }
    play(n.stage === 'won' ? 'level' : n.stage === 'lost' ? 'bad' : n.cash > before ? 'coin' : 'tap');
    onChange(n);
  };
  const answer = (id: string) => mut((n) => answerEvent(n, id));

  const pl: [string, number][] = L ? [
    [`Sales (${fmtNum(L.sold)} ${L.sold === 1 ? e.unit : e.units})`, L.revenue],
    ['Wages', -L.wages],
    ['Rent', -L.rent],
    [e.varShare ? 'Store cut' : `Cost per ${e.unit}`, -L.variable],
    ['Marketing', -L.marketing],
    ['R&D', -L.rd],
    ...((L.partners ?? 0) > 0 ? [['Partners (fees and cuts)', -(L.partners ?? 0)] as [string, number]] : []),
    ...(L.interest > 0 ? [['Loan interest', -L.interest] as [string, number]] : []),
  ] : [];

  return (
    <div className="anim-fade pb-24">
      <div className="flex items-center gap-3 mb-3">
        <span className="grid place-items-center size-12 rounded-xl bg-card-2 border border-line text-2xl">{spec.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-black text-xl leading-tight truncate">{s.name}</div>
          <div className="text-xs text-muted">{s.idea === 'freelance' ? FREELANCE[s.kind ?? 'design'].name : spec.name} · Week {s.week} of {DEADLINE_WEEK}</div>
        </div>
      </div>

      {/* investor */}
      <Card className="p-3">
        <div className="flex gap-3 items-center">
          <Avatar id={s.investor} size={40} />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-sm"><b>{inv.name}</b><span className="text-xs text-muted">owns {Math.round(s.investorPct * 100)}%</span></div>
            <div className="flex justify-between text-[11px] text-muted mt-0.5"><span>Trust</span><span className="num">{s.trust}/100</span></div>
            <Progress value={s.trust / 100} tone={s.trust >= 50 ? 'green' : s.trust >= 25 ? 'amber' : 'red'} height={7} />
          </div>
        </div>
        {running && (
          <div className="mt-2.5 rounded-lg bg-card-2 border border-line p-2.5 text-xs space-y-1">
            <div className="font-bold text-text">Next review: end of week {reviewWk}{reviewWk === s.week ? ' (this week)' : ` (in ${reviewWk - s.week + 1} weeks)`}</div>
            <div className={cx(v >= target ? 'text-green' : 'text-red')}>{v >= target ? '✓' : '✗'} Value {short(v)} — needs {short(target)}</div>
            <div className={cx(rule.ok ? 'text-green' : 'text-red')}>{rule.ok ? '✓' : '✗'} {inv.ruleShort}: <span className="text-muted">{rule.text}</span></div>
          </div>
        )}
      </Card>

      {/* value */}
      <Card className="p-3 mt-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Company value</span>
          <span className="num"><b className="text-xl text-gold">{fmtMoney(v)}</b><span className="text-muted text-sm"> / {short(GOAL_VALUE)}</span></span>
        </div>
        <Progress className="mt-1.5" value={v / GOAL_VALUE} tone="gold" height={12} />
        <div className="mt-2 space-y-1">
          {valueParts(s).map((p) => (
            <div key={p.label} className="flex justify-between gap-2 text-xs">
              <span className="text-muted">{p.label} <span className="text-dim">· {p.hint}</span></span>
              <b className="num shrink-0">{fmtMoney(p.amount)}</b>
            </div>
          ))}
        </div>
        <Spark values={s.values} />
      </Card>

      {tip && running && (
        <div className={cx('mt-2 rounded-lg border p-2.5 text-sm', tip.tone === 'good' ? 'border-green/40 bg-green-dim/40' : tip.tone === 'warn' ? 'border-amber/40 bg-amber/10' : 'border-red/50 bg-red-dim/50')}>
          💡 {tip.text}
        </div>
      )}

      {/* last week */}
      <Card className="p-3 mt-2">
        <div className="text-xs font-bold uppercase tracking-wider text-muted mb-1.5">{L ? `Week ${L.week} results` : 'No results yet'}</div>
        {!L && <div className="text-sm text-muted">Set your price and spending, then play the first week.</div>}
        {L && (
          <>
            <div className="text-xs text-muted mb-2">
              {!s.launched ? `Building the product: ${Math.round(s.progress)}% done. No sales until launch.`
                : e.model === 'hours' ? `Clients wanted ${fmtNum(L.demand)} hours · your team can do ${fmtNum(L.capacity)} · sold ${fmtNum(L.sold)}`
                : e.model === 'subs' ? `${fmtNum(s.customers)} ${e.units} (+${fmtNum(L.newCustomers)} new, −${fmtNum(L.lost)} left) · team supports ${fmtNum(capacityOf(s))}`
                : `${fmtNum(L.sold)} copies sold · freshness ${Math.round(s.novelty * 100)}%`}
            </div>
            <div className="space-y-0.5 text-sm">
              {pl.filter(([, n]) => Math.abs(n) >= 1).map(([k, n]) => (
                <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className={cx('num', n >= 0 ? 'text-green' : 'text-text')}>{n >= 0 ? '+' : '−'}{fmtMoney(Math.abs(n))}</span></div>
              ))}
              <div className="flex justify-between border-t border-line pt-1 mt-1 font-bold"><span>Profit</span><span className={cx('num', L.profit >= 0 ? 'text-green' : 'text-red')}>{L.profit >= 0 ? '+' : '−'}{fmtMoney(Math.abs(L.profit))}</span></div>
              {L.side > 0 && <div className="flex justify-between text-xs"><span className="text-muted">Side work (cash only, not in value)</span><span className="num text-green">+{fmtMoney(L.side)}</span></div>}
            </div>
          </>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <Stat label="Cash" value={fmtMoney(s.cash)} tone={rw < 6 ? 'bad' : undefined} sub={rw === Infinity ? 'making money' : `runway ${Math.floor(rw)} weeks`} />
        <Stat label="Loans" value={fmtMoney(s.debt)} sub={`limit ${short(limit)} · ${(WEEKLY_RATE * 100).toFixed(1)}%/week`} />
        <Stat label={s.launched ? 'Quality' : 'Product'} value={s.launched ? `${Math.round(s.quality * 100)}%` : `${Math.round(s.progress)}%`} sub={s.launched ? 'raised by R&D' : `quality ${Math.round(s.quality * 100)}%`} />
        <Stat label={e.model === 'copies' && !s.launched ? 'Hype' : 'People reached'} value={fmtNum(s.reach)} sub="grows with marketing, fades without" />
      </div>
      {!s.launched && <Progress className="mt-2" value={s.progress / 100} tone="blue" height={8} />}

      {running ? (
        <Card className="p-3 mt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">Your decisions</div>
          <Lever label={`Price per ${e.unit}${perWeek}`} value={fmtMoney(s.price)}
            sub={<>Rivals charge {fmtMoney(e.ref)}. You keep <b className={unitMargin(s) > 0 ? 'text-green' : 'text-red'}>{fmtMoney(unitMargin(s))}</b> per {e.unit}.</>}
            minus={{ label: '−5%', onClick: () => mut((n) => setPrice(n, n.price * 0.95)), disabled: s.price <= e.ref * 0.41 }}
            plus={{ label: '+5%', onClick: () => mut((n) => setPrice(n, n.price * 1.05)), disabled: s.price >= e.ref * 2.49 }} />
          <LevelPick label="Marketing" value={s.marketing} at={(l) => marketingBudgetFor(s, l)}
            sub={e.model === 'copies' && !s.launched ? 'Builds hype for launch day. ★ Normal suits most weeks.' : 'Reaches new people. They forget you if you stop. ★ Normal suits most weeks.'}
            effect={(a) => `About ${fmtNum(peopleFrom(s, a))} new people a week${s.salesPartner && s.launched ? ', plus your sales partner' : ''}.`}
            onPick={(a) => mut((n) => setMarketing(n, a))} />
          <LevelPick label="R&D" value={s.rd} at={(l) => rdBudgetFor(s, l)}
            sub={!s.launched ? 'Builds the product faster and raises quality.' : e.model === 'copies' ? 'Ships updates that bring players back.' : 'Raises quality: more buyers, fewer leave.'}
            effect={(a) => `Quality heads to ${Math.round(qualityFrom(s, a) * 100)}%${s.techPartner ? ' (with licensed tech)' : ''}.`}
            onPick={(a) => mut((n) => setRd(n, a))} />
          <div className="text-xs font-bold uppercase tracking-wider text-muted mt-3">Partners</div>
          <div className="text-[11px] text-muted leading-snug">Like buying supplies in the main game: use what bigger companies already have instead of building it all yourself.</div>
          <Toggle on={!!s.techPartner} title="🔧 Licence their tech"
            sub={<>{cap(TECH_FROM[s.idea])}. {!s.launched ? <>Builds your product faster and adds {Math.round(TECH_QUALITY * 100)} points of quality. {fmtMoney(techFee(s))} a week until launch, then {Math.round(TECH_ROYALTY * 100)}% of sales.</> : <>Adds {Math.round(TECH_QUALITY * 100)} points of quality for {Math.round(TECH_ROYALTY * 100)}% of sales.</>}</>}
            onClick={() => mut((n) => setTechPartner(n, !n.techPartner))} />
          <Toggle on={!!s.salesPartner} title="🤝 Sales partner"
            sub={<>{cap(SALES_FROM[s.idea])}. From launch, reaches about {fmtNum(peopleFrom(s, marketingBudgetFor(s, 'normal') * SALES_REACH))} new people a week for you. They keep {Math.round(SALES_CUT * 100)}% of your sales. Free until you sell.</>}
            onClick={() => mut((n) => setSalesPartner(n, !n.salesPartner))} />
          <Lever label="Team" value={`${s.team} ${s.team === 1 ? 'person' : 'people'}`}
            sub={<>Each hire costs {fmtMoney(e.salary)}/week{e.perPerson !== Infinity ? ` and handles ${fmtNum(e.perPerson)} ${e.units}` : ''}{!s.launched ? ' and builds the product' : ''}. Hiring costs a week of pay.</>}
            minus={{ label: 'Let go', onClick: () => mut((n) => { fire(n); }), disabled: s.team <= 1 }}
            plus={{ label: 'Hire', onClick: () => mut((n) => { hire(n); }), disabled: s.team >= 12 || s.cash < hireCost(s) }} />
          <Lever label="Bank loan" value={fmtMoney(s.debt)}
            sub={`You can borrow up to ${short(limit)}. Loans cost ${(WEEKLY_RATE * 100).toFixed(1)}% a week and count against your value.`}
            minus={{ label: 'Repay 5K', onClick: () => mut((n) => { repay(n, 5000); }), disabled: s.debt < 1 || s.cash < 1 }}
            plus={{ label: 'Borrow 5K', onClick: () => mut((n) => { borrow(n, 5000); }), disabled: limit - s.debt < 1000 }} />
          <button onClick={() => mut((n) => setSide(n, !n.side))} aria-pressed={s.side}
            className="w-full flex items-center gap-2 py-2.5 text-left">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{spec.side[0]}</div>
              <div className="text-[11px] text-muted leading-snug">{spec.side[1]}</div>
            </div>
            <span className={cx('w-11 h-6 rounded-full border relative shrink-0 transition-colors', s.side ? 'bg-gold border-gold-edge' : 'bg-card-2 border-line-strong')}>
              <span className={cx('absolute top-0.5 size-[18px] rounded-full bg-white transition-all', s.side ? 'left-[22px]' : 'left-0.5')} />
            </span>
          </button>
          {!s.launched && s.progress >= 100 && (
            <Button block size="lg" className="mt-1" onClick={() => { mut((n) => { launch(n); }); play('level'); }}>
              🚀 Launch now ({fmtNum(s.reach)} people know you)
            </Button>
          )}
        </Card>
      ) : s.stage === 'lost' && s.lostReason && !unseen && (
        <Card className="p-4 mt-3 text-center border-red/60">
          <div className="text-3xl">{LOST[s.lostReason].icon}</div>
          <div className="font-bold text-lg mt-1">{LOST[s.lostReason].title(s)}</div>
          <p className="text-sm text-muted mt-1">{LOST[s.lostReason].text(s)}</p>
          {s.reviews.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1 mt-2">
              {s.reviews.map((r) => <span key={r.month} className={cx('text-[11px] rounded px-1.5 py-0.5 border', r.valueOk && r.ruleOk ? 'border-green/40 text-green' : 'border-red/40 text-red')}>M{r.month} {r.valueOk && r.ruleOk ? '✓' : '✗'}</span>)}
            </div>
          )}
          <p className="text-xs text-dim mt-2">Your traits stay. Try again with a better plan.</p>
          <Button block size="lg" className="mt-3" onClick={onRestart}>Start a new startup</Button>
        </Card>
      )}

      <details className="mt-2 rounded-card border border-line bg-card p-3 text-sm">
        <summary className="font-bold cursor-pointer">How this business works</summary>
        <ul className="mt-2 space-y-1.5 text-muted text-[13px]">
          {MODEL_HELP[e.model].map((t) => <li key={t}>• {t}</li>)}
          <li>• Value = cash − loans + a year of profit × {e.profitMult} + a year of sales × {e.revMult}{e.proto ? ' + the product' : ''}. Profit and sales use the average of the last {VALUE_WEEKS} weeks.</li>
          <li>• {spec.teaches}</li>
        </ul>
      </details>

      <div className="text-xs font-bold uppercase tracking-wider text-muted mt-4 mb-1.5">What happened</div>
      <div className="space-y-1">
        {s.log.slice(0, 6).map((l, i) => (
          <div key={`${l.week}-${i}`} className={cx('flex justify-between gap-2 text-sm rounded-md px-2 py-1.5', i === 0 && 'bg-card-2 anim-fade')}>
            <span className={cx(l.tone === 'good' && 'text-text', l.tone === 'bad' && 'text-red', l.tone === 'neutral' && 'text-muted')}><span className="text-dim text-xs mr-1.5">W{l.week}</span>{l.text}</span>
            {l.cash != null && <span className={cx('num text-xs font-semibold shrink-0', l.cash >= 0 ? 'text-green' : 'text-red')}>{l.cash >= 0 ? '+' : ''}{fmtMoney(l.cash)}</span>}
          </div>
        ))}
      </div>

      {running && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-gradient-to-t from-bg via-bg to-transparent pt-4 pb-3 px-gutter">
          <div className="max-w-xl mx-auto flex gap-2">
            <Button size="lg" className="flex-1" disabled={!!s.event || !!unseen} onClick={() => advance(false)}>Next week ▶</Button>
            <Button size="lg" variant="dark" className="flex-1" disabled={!!s.event || !!unseen} onClick={() => advance(true)}>To review ⏩</Button>
          </div>
        </div>
      )}

      {unseen && <ReviewModal s={s} r={unseen} onOk={() => mut(seeReview)} />}

      {!unseen && s.event && (
        <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/60 anim-fade" role="dialog" aria-modal="true" aria-label={s.event.title}>
          <div className="w-full max-w-md bg-card border border-line-strong rounded-t-2xl sm:rounded-2xl p-4 anim-sheet">
            <div className="text-xs font-bold uppercase tracking-wider text-gold">Week {s.week}</div>
            <div className="font-black text-xl mt-0.5">{s.event.title}</div>
            <p className="text-sm text-muted mt-1">{s.event.body}</p>
            <div className="space-y-2 mt-3">
              {s.event.choices.map((c, i) => (
                <Button key={c.id} block variant={i === 0 ? 'gold' : 'dark'} className="flex-col !items-start py-2 text-left" onClick={() => answer(c.id)}>
                  <span>{c.label}</span>
                  <span className="text-xs font-normal opacity-80">{c.detail}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- exit + first company

function ExitStory({ s, onDone }: { s: Startup; onDone: () => void }) {
  const inv = INVESTORS[s.investor];
  const target = bigValuation(s);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    play('level');
    let f = 0;
    const id = setInterval(() => {
      f += 1;
      setShown(target * Math.min(1, Math.pow(f / 40, 2)));
      if (f >= 40) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [target]);
  return (
    <div className="anim-fade text-center">
      <div className="text-6xl mt-4 anim-seal">🏆</div>
      <div className="text-xs font-bold uppercase tracking-wider text-gold mt-3">Week {s.week} · Goal reached</div>
      <h1 className="text-3xl font-black mt-1">{s.name} is sold!</h1>
      <p className="text-sm text-muted mt-2">{inv.name} buys the rest of the company, as agreed. With {inv.firm} behind it, {s.name} grows into a giant:</p>
      <div className="text-5xl font-black text-gold num mt-3">{fmtMoney(shown)}</div>
      <div className="text-xs text-muted">company value a few years later</div>
      <Card className="p-4 mt-5">
        <div className="text-sm text-muted">Your payout</div>
        <div className="text-4xl font-black text-green num">{short(payout(s))}</div>
        {s.rescued && <div className="text-xs text-amber mt-1">Less than {short(PAYOUT)} because {inv.name.split(' ')[0]} had to rescue you once.</div>}
        <p className="text-sm text-muted mt-2">Now the real game begins. Use it to buy your first company in Astoria's supply chain.</p>
      </Card>
      <Button block size="lg" className="mt-4" onClick={onDone}>Choose your first company</Button>
    </div>
  );
}

function StarterPick({ flow, onDone }: { flow: Flow; onDone: (o: ReturnType<typeof starterOffers>[number]) => void }) {
  const cash = payout(flow.startup!);
  const offers = starterOffers(flow.seed);
  const [sel, setSel] = useState<number | null>(null);
  const fits = (good: keyof typeof GOODS) => {
    const raw = GOODS[good].tier === 'raw';
    const t = flow.traits;
    if (raw && t.includes('raw')) return 'Fits your Raw materials trait';
    if (!raw && t.includes('finance')) return 'Fits your Finance trait';
    return null;
  };
  const o = sel != null ? offers[sel] : null;
  return (
    <div className="anim-fade">
      <Header kicker="Chapter 2 · Your empire" title="Buy your first company"
        sub={<>You have <b className="text-green">{short(cash)}</b>. These small companies are for sale. What is left over stays with you as cash.</>} />
      <div className="space-y-2.5">
        {offers.map((x, i) => {
          const fit = fits(x.good);
          const on = sel === i;
          return (
            <button key={x.good} onClick={() => setSel(i)} aria-pressed={on}
              className={cx('w-full text-left rounded-card border p-3 flex gap-3 items-center transition-colors', on ? 'border-gold bg-gold/10' : 'border-line bg-card hover:border-line-strong')}>
              <GoodThumb good={x.good} size={52} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <div className="font-bold truncate">{x.name}</div>
                  <div className="num font-bold text-gold shrink-0">{short(x.price)}</div>
                </div>
                <div className="text-xs text-muted">{GOODS[x.good].name} · {x.pitch}</div>
                <div className="flex justify-between items-center mt-1">
                  {fit ? <span className="text-[11px] text-green font-semibold">✓ {fit}</span> : <span />}
                  <span className="text-[11px] text-muted num">{short(cash - x.price)} left</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="sticky bottom-0 pt-3 pb-2 bg-gradient-to-t from-bg via-bg to-transparent">
        <Button block size="lg" disabled={!o} onClick={() => o && onDone(o)}>{o ? `Buy ${o.name} for ${short(o.price)}` : 'Pick a company'}</Button>
      </div>
    </div>
  );
}
