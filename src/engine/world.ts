import { createRng, normal, range } from './rng';
import { ensureBanks } from './banks';
import { ensureLicences } from './licences';
import { emptyPlay } from './rewards';
import { AI_COMPANIES, AI_UPGRADE_COST_GROWTH, UPGRADE_COST_GROWTH, GOODS, GOOD_IDS, LEVEL_CAP_MULT, RIVALS, SAVE_VERSION, capacityAt, upgradeCost } from './data';
import { emptyDay, refPrice, runAutomation, workersNeeded } from './company';
import { createGoodsMarket, operateEconomy } from './economy';
import { createMacro } from './macro';
import { fairValue } from './market';
import { createGoals } from './progress';
import { addNews, fmtMoney } from './news';
import { setTraits } from './traits';
import type { GameSetup } from './startup';
import type { Company, GoodId, ScenarioId, Stock, WorldState } from './types';

export function newCompany(
  w: Pick<WorldState, 'day' | 'seq'>,
  opts: { id: string; name: string; good: GoodId; ownerId: string; isPlayer: boolean; ticker: string | null; level: number; capacity?: number },
): Company {
  const capacity = opts.capacity ?? capacityAt(opts.good, opts.level);
  let assets = 0;
  for (let l = 1; l <= opts.level; l++) assets += upgradeCost(opts.good, l, opts.isPlayer ? UPGRADE_COST_GROWTH : AI_UPGRADE_COST_GROWTH);
  const c: Company = {
    id: opts.id, name: opts.name, good: opts.good, industry: GOODS[opts.good].industry, ownerId: opts.ownerId, isPlayer: opts.isPlayer, ticker: opts.ticker,
    founded: w.day, level: opts.level, capacity, workers: 0, salaryMult: 1, morale: 0.75, priceMult: 1,
    quality: opts.isPlayer ? 0.85 : 1, brand: opts.isPlayer ? 0.75 : 1, inventory: 0, invCost: 0, inputs: {}, sisterDiscount: 0.2, cash: 0, debt: 0,
    marketingPct: opts.isPlayer ? 0.02 : 0.025, rdPct: opts.isPlayer ? 0.02 : 0.025,
    automation: opts.isPlayer
      ? { inventoryDays: 0.5, autoRecruit: true, autoUpgrade: false, dividendPct: 50, minCash: 5_000, supplyDays: 4 }
      : { inventoryDays: 0.6, autoRecruit: true, autoUpgrade: false, dividendPct: 0, minCash: 0, supplyDays: 4 },
    last: emptyDay(), sum30: emptyDay(), hist: [], quarters: [], qAcc: { revenue: 0, net: 0 },
    bankrupt: false, lowCashDays: 0, strikeUntil: 0, assets, aiLastAction: 'hold',
  };
  c.workers = workersNeeded(c);
  c.last.demand = capacity * 0.9;
  return c;
}

/** Fill a company's input store room for `days` of production at market prices (no charge). */
export function seedInputs(w: WorldState, c: Company, days: number, rate = c.capacity * 0.6): void {
  for (const i of GOODS[c.good].inputs) c.inputs[i.good] = { qty: rate * i.qty * days, cost: refPrice(w, i.good) };
}

/** Scale AI capacity per good to observed consumption x 1.15 (used during warm-up only). */
function rebalanceCapacity(w: WorldState): void {
  // Products first, so the materials they consume are sized to the new plants.
  for (const g of [...GOOD_IDS].reverse()) {
    const sellers = w.companies.filter((c) => c.good === g && !c.isPlayer);
    const cap = sellers.reduce((s, c) => s + c.capacity, 0);
    if (cap <= 0) continue;
    const used = w.companies.reduce((s, c) => {
      const i = GOODS[c.good].inputs.find((x) => x.good === g);
      return i ? s + (c.sum30.produced / 30) * i.qty : s;
    }, 0);
    const consumption = w.goods[g].finalDemand + used;
    const k = Math.max(0.5, Math.min(2, (consumption * 1.15) / cap));
    for (const c of sellers) {
      c.capacity *= k;
      c.level = Math.max(1, 1 + Math.round(Math.log(c.capacity / GOODS[g].baseCapacity) / Math.log(LEVEL_CAP_MULT)));
      c.workers *= k;
      c.inventory *= k;
      c.last.demand *= k;
      c.sum30.demand *= k;
      for (const st of Object.values(c.inputs)) if (st) st.qty *= k;
    }
    w.goods[g].tightness = 0.87;
    w.goods[g].idx = 1;
  }
}

/**
 * Saves from before a good existed get its market plus private AI producers sized to
 * today's demand (+15% spare), so the new market opens balanced rather than all imports.
 */
export function addMissingGoods(w: WorldState): void {
  const fresh = createGoodsMarket();
  const missing = GOOD_IDS.filter((g) => !w.goods[g]);
  if (missing.length === 0) return;
  for (const g of missing) w.goods[g] = fresh[g];
  const demand = chainDemand();
  const pl = w.macro.priceLevel;
  for (const good of missing) {
    const list = AI_COMPANIES.filter((a) => a[2] === good);
    const sumW = list.reduce((s, a) => s + Math.pow(1.3, a[3] - 10), 0);
    const def = GOODS[good];
    for (const [name, ticker, , weight] of list) {
      const cap = (demand[good] * 1.15 * Math.pow(1.3, weight - 10)) / sumW;
      const level = Math.max(1, 1 + Math.round(Math.log(cap / def.baseCapacity) / Math.log(LEVEL_CAP_MULT)));
      const c = newCompany(w, { id: `c_${ticker}`, name, good, ownerId: 'public', isPlayer: false, ticker: null, level, capacity: cap });
      c.inventory = cap * 0.4;
      c.invCost = def.p0 * pl * 0.45;
      c.cash = cap * def.p0 * pl * 40;
      c.automation.minCash = cap * def.p0 * pl * 5;
      c.sisterDiscount = 0.1;
      c.last.demand = cap / 1.15;
      seedInputs(w, c, 5, cap / 1.15);
      w.companies.push(c);
    }
  }
  // Existing plants that now use a new material get a starter delivery of it, like a new plant would
  for (const c of w.companies) {
    if (c.bankrupt || missing.includes(c.good)) continue;
    for (const i of GOODS[c.good].inputs) {
      if (!missing.includes(i.good) || c.inputs[i.good]) continue;
      c.inputs[i.good] = { qty: c.capacity * 0.7 * i.qty * 5, cost: refPrice(w, i.good) };
    }
  }
  // The new businesses buy steel, chips, power and more: existing producers grow to meet them
  const before = chainDemand(missing);
  for (const g of GOOD_IDS) {
    if (missing.includes(g)) continue;
    const k = Math.min(2.5, demand[g] / Math.max(1, before[g]));
    if (k < 1.03) continue;
    for (const c of w.companies) {
      if (c.good !== g || c.isPlayer || c.bankrupt) continue;
      c.capacity *= k;
      c.level = Math.max(1, 1 + Math.round(Math.log(c.capacity / GOODS[g].baseCapacity) / Math.log(LEVEL_CAP_MULT)));
      c.workers *= k;
      c.inventory *= k;
      c.last.demand *= k;
    }
  }
  const names = missing.map((g) => GOODS[g].name.toLowerCase());
  addNews(w, 'business', 'New industries open in Astoria',
    `Markets for ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are now open to new companies.`, 'good');
}

/** Total daily demand for every good: final demand plus what downstream producers use. */
export function chainDemand(without: GoodId[] = []): Record<GoodId, number> {
  const d = {} as Record<GoodId, number>;
  for (const id of GOOD_IDS) d[id] = without.includes(id) ? 0 : GOODS[id].d0;
  for (const id of [...GOOD_IDS].reverse()) for (const i of GOODS[id].inputs) d[i.good] += d[id] * i.qty;
  return d;
}

export function createWorld(seed: number, scenario: ScenarioId = 'young', setup?: GameSetup): WorldState {
  const rng = createRng(seed);
  const w: WorldState = {
    version: SAVE_VERSION, seed, rng, day: 0, scenario, countryName: 'Republic of Astoria',
    player: {
      name: 'You', cash: scenario === 'young' ? 400_000 : 10_000_000, xp: 0, level: 1, holdings: {}, reputation: 20,
      realizedPnl: 0, dividendsReceived: 0, lifetimeProfit: 0, netWorthHist: [],
    },
    companies: [], stocks: [], orders: [], macro: createMacro(),
    rivals: RIVALS.map((r) => ({
      id: r.id, name: r.name, title: r.title, focus: r.focus, weakness: r.weakness, quote: r.quote, flag: r.flag,
      personality: r.personality, cash: r.cash, holdings: {}, relation: r.id === 'kane' ? -20 : 0, memory: [], avatarColor: r.avatarColor, ...(r.tycoon ? { tycoon: true } : {}),
    })),
    news: [], pending: [], goals: createGoals(), achievements: [],
    marketMood: 0.55, marketIndexHist: [], marketIndex: 1000, indexBase: 0, lastDilemmaDay: 0, effects: [], seq: 0, play: emptyPlay(),
    goods: createGoodsMarket(), contracts: [],
  };

  // AI companies sized so each good has ~15% spare capacity over chain demand.
  const demand = chainDemand();
  for (const good of GOOD_IDS) {
    const list = AI_COMPANIES.filter((a) => a[2] === good);
    const sumW = list.reduce((s, a) => s + Math.pow(1.3, a[3] - 10), 0);
    const totalCap = demand[good] * 1.15;
    const def = GOODS[good];
    for (const [name, ticker, , weight] of list) {
      const cap = (totalCap * Math.pow(1.3, weight - 10)) / sumW;
      const level = Math.max(1, 1 + Math.round(Math.log(cap / def.baseCapacity) / Math.log(LEVEL_CAP_MULT)));
      const owner = RIVALS.find((r) => r.owns.includes(ticker))?.id ?? 'public';
      const c = newCompany(w, { id: `c_${ticker}`, name, good, ownerId: owner, isPlayer: false, ticker, level, capacity: cap });
      c.priceMult = 1 + 0.04 * normal(rng);
      c.quality = 0.95 + 0.1 * range(rng, 0, 1);
      c.brand = 0.95 + 0.1 * range(rng, 0, 1);
      c.inventory = cap * 0.4;
      c.invCost = def.p0 * 0.45;
      c.cash = cap * def.p0 * 40;
      c.debt = c.cash * range(rng, 0.2, 1.2);
      c.automation.minCash = cap * def.p0 * 5;
      c.sisterDiscount = 0.1;
      c.last.demand = cap / 1.15;
      seedInputs(w, c, 5, cap / 1.15);
      w.companies.push(c);
    }
  }

  if (scenario === 'established') {
    const c = newCompany(w, { id: 'p1', name: 'Founders Steel', good: 'steel', ownerId: 'player', isPlayer: true, ticker: null, level: 4 });
    seedInputs(w, c, 4);
    c.cash = 400_000;
    c.brand = 0.9;
    c.quality = 0.95;
    w.companies.push(c);
  }

  // Startup story: your payout buys a small existing company (it runs through the warm-up, so it has customers and history)
  if (setup?.startup) w.player.cash = setup.startup.payout;
  if (setup?.starter && GOODS[setup.starter.good] && w.player.cash >= setup.starter.price) {
    const st = setup.starter;
    const c = newCompany(w, { id: 'p1', name: st.name.slice(0, 28), good: st.good, ownerId: 'player', isPlayer: true, ticker: null, level: 1 });
    seedInputs(w, c, 4);
    c.cash = Math.round(st.price * 0.2);
    c.assets = st.price - c.cash;
    c.brand = 0.85;
    c.quality = 0.9;
    w.player.cash -= st.price;
    w.companies.push(c);
  }
  if (setup) setTraits(w, setup.traits);

  const startCash = w.player.cash;
  // Warm up the economy so companies have a financial history before listing.
  // Halfway through, resize AI producers to what the chain really uses (+15% spare).
  for (let d = 1; d <= 150; d++) {
    w.day = d;
    operateEconomy(w);
    for (const c of w.companies) runAutomation(w, c);
    if (d === 40 || d === 80 || d === 120) rebalanceCapacity(w);
  }

  for (const c of w.companies) {
    if (!c.ticker) continue;
    const s: Stock = {
      ticker: c.ticker, companyId: c.id, shares: 1, price: 1, prevClose: 1, open: 1, fair: 1,
      beta: range(rng, 0.7, 1.4), adv: 0, volume: 0, sentiment: 0, newsImpact: 0, pressure: 0, hist: [], monthly: [], halted: false,
    };
    const equity = fairValue(w, s).value; // with shares = 1 this is total equity
    const targetPrice = range(rng, 18, 160);
    s.shares = Math.max(1_000_000, Math.round(equity / targetPrice));
    s.price = (equity / s.shares) * (1 + 0.08 * normal(rng));
    s.prevClose = s.open = s.price;
    s.fair = equity / s.shares;
    s.adv = s.shares * 0.003;
    s.volume = s.adv;
    for (let k = 30; k > 0; k--) s.hist.push({ day: -k, price: s.price * (1 + 0.01 * normal(rng)) });
    s.hist.push({ day: 0, price: s.price });
    s.monthly.push({ day: 0, price: s.price });
    w.stocks.push(s);
    // Founding stakes for rival owners
    if (c.ownerId !== 'public') {
      const rv = w.rivals.find((r) => r.id === c.ownerId)!;
      rv.holdings[s.ticker] = { shares: Math.round(s.shares * 0.2), avgCost: s.price * 0.6 };
    }
  }

  for (const c of w.companies) {
    c.hist = [];
    c.quarters = [];
    c.qAcc = { revenue: 0, net: 0 };
    c.strikeUntil = 0;
  }
  w.day = 0;
  if (setup?.starter) w.player.cash = startCash; // warm-up dividends are not yours yet
  ensureBanks(w);
  ensureLicences(w);
  w.indexBase = w.stocks.reduce((s, x) => s + x.price * x.shares, 0);
  w.marketIndexHist.push({ day: 0, value: 1000 });
  w.macro.realOutputPrev = w.companies.reduce((s, c) => s + c.sum30.sold * GOODS[c.good].p0, 0);
  for (const id of GOOD_IDS) w.goods[id].hist = w.goods[id].hist.map((h) => ({ ...h, day: h.day - 150 }));
  w.macro.hist.push({ day: 0, gdp: w.macro.gdp, inflation: w.macro.inflation, unemployment: w.macro.unemployment, rate: w.macro.rate, growth: w.macro.growth });
  addNews(w, 'economy', 'Astoria economy steady as new year opens',
    'Growth near trend, inflation slightly above the 2% target and the central bank holding at 3.50%.', 'neutral');
  if (setup?.startup) {
    const s = setup.startup;
    w.player.startup = { idea: s.idea, name: s.name, investor: s.investor, payout: s.payout };
    addNews(w, 'business', `${s.investor} turns ${s.name} into a ${fmtMoney(s.valuation)} giant`,
      `The startup you founded is now one of the hottest companies around. You were paid ${fmtMoney(s.payout)} when you sold it.`, 'good');
  }
  addNews(w, 'business', `Exchange lists ${w.stocks.length} companies across six industries`,
    'Mining, farming, energy, manufacturing, technology, retail and finance shares all trade on the Astoria Exchange.', 'neutral');
  return w;
}
