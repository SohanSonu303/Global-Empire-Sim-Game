import type { RngState } from './rng';

/** Everything in WorldState is plain JSON: it is cloned to the UI and saved as-is. */

export type IndustryId = 'resources' | 'energy' | 'manufacturing' | 'tech' | 'retail' | 'finance' | 'health' | 'services';

export interface IndustryDef {
  id: IndustryId;
  name: string;
  /** Market salary per worker per day */
  salary: number;
  /** R&D effectiveness on quality */
  rdK: number;
}

export type GoodId =
  | 'iron_ore' | 'grain' | 'cotton' | 'silicon'
  | 'crude_oil' | 'electricity' | 'plastics'
  | 'steel' | 'cars' | 'appliances'
  | 'chips' | 'phones' | 'software'
  | 'food' | 'clothing'
  | 'banking'
  | 'timber' | 'chemicals' | 'glass' | 'freight'
  | 'furniture' | 'laptops' | 'medicine' | 'telecom' | 'clinics';

export type GoodTier = 'raw' | 'material' | 'product';

export interface GoodDef {
  id: GoodId;
  name: string;
  industry: IndustryId;
  tier: GoodTier;
  /** Unit label, e.g. "t", "cars" */
  unit: string;
  /** Inputs consumed per unit produced */
  inputs: { good: GoodId; qty: number }[];
  /** Other variable cost per unit (packaging, utilities, wear), at price level 1 */
  vc: number;
  /** Units produced per worker per day at morale 1.0 */
  unitsPerWorker: number;
  /** Final demand per day (households + exports) at income index 1 */
  d0: number;
  /** Price elasticity of final demand */
  elasticity: number;
  /** How strongly buyers switch between sellers on price */
  switchElasticity: number;
  /** Cost to found a level-1 company */
  foundCost: number;
  /** One-line description for the planner */
  blurb: string;
  // Derived at load time (see data.ts):
  /** Reference price per unit at price level 1 */
  p0: number;
  /** Capacity of a level-1 company (units/day) */
  baseCapacity: number;
  /** Fixed cost per day of a level-1 company */
  baseFixed: number;
}

/** Live market state for one good. */
export interface GoodMarket {
  /** Price multiplier on p0 x price level, moved by shortage, costs and hype */
  idx: number;
  /** Yesterday's totals (units) */
  finalDemand: number;
  b2bDemand: number;
  supply: number;
  sold: number;
  imported: number;
  /** demand / domestic supply, smoothed (>1 = shortage) */
  tightness: number;
  hist: { day: number; price: number }[];
}

/** A supply contract: seller delivers qtyPerDay to buyer at a fixed unit price until endDay. */
export interface Contract {
  id: string;
  good: GoodId;
  sellerId: string;
  buyerId: string;
  qtyPerDay: number;
  price: number;
  startDay: number;
  endDay: number;
  /** Units short of the promise so far (seller penalty basis) */
  shortfall: number;
  delivered: number;
}

export interface Explanation {
  title: string;
  lines: { label: string; value: number; op?: '+' | '-' | '=' | 'x' | ''; fmt?: 'money' | 'pct' | 'num' }[];
  note?: string;
}

export interface Automation {
  /** Keep this many days of expected sales in inventory */
  inventoryDays: number;
  /** Hire / lay off to staff current capacity */
  autoRecruit: boolean;
  /** Buy the next capacity upgrade when utilisation is high and cash allows */
  autoUpgrade: boolean;
  /** Percent of positive daily net income paid to the owner as dividends */
  dividendPct: number;
  /** Borrow automatically to keep at least this much cash */
  minCash: number;
  /** Keep this many days of inputs in the store room */
  supplyDays: number;
  /** Pay loans back from spare cash before dividends (on unless turned off) */
  autoRepay?: boolean;
  /** Keep the plant running when its own stock is full and send the extra to your warehouses */
  toWarehouse?: boolean;
}

export interface DayResult {
  produced: number;
  demand: number;
  sold: number;
  price: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  wages: number;
  fixed: number;
  marketing: number;
  rd: number;
  opex: number;
  operatingProfit: number;
  interest: number;
  tax: number;
  netIncome: number;
  capacity: number;
  laborCap: number;
  materialCap: number;
  marketShare: number;
  /** Money spent buying inputs today */
  purchases: number;
  /** Input + variable cost per unit produced today */
  unitMaterialCost: number;
  /** Units bought from importers because no local seller had stock */
  importedInputs: number;
  /** Units sold to your own companies / under contracts */
  sisterSold: number;
  contractSold: number;
  /** Banks only: interest earned from borrowers, and what the bank pays for the deposits that fund those loans */
  interestIncome: number;
  fundingCost: number;
  /** Banks only: money set aside (or released) for loans expected to go bad */
  loanLosses: number;
}

/** An outside owner of part of a private company (an investor, a rival, or you). */
export type LoanReason = 'materials' | 'hiring' | 'cash buffer' | 'repairs' | 'you borrowed' | 'expansion';

export interface Partner {
  ownerId: string; // rival id, 'fund' or 'player'
  name: string;
  /** Fraction of the company owned, 0..1 */
  pct: number;
  /** What they paid in */
  paid: number;
  day: number;
}

export interface Company {
  id: string;
  name: string;
  good: GoodId;
  industry: IndustryId;
  ownerId: string; // 'player' or a rival id or 'public'
  isPlayer: boolean;
  ticker: string | null;
  founded: number;
  level: number;
  capacity: number;
  workers: number;
  /** salary relative to industry market salary */
  salaryMult: number;
  morale: number; // 0..1
  /** price relative to industry reference price */
  priceMult: number;
  /** Day the owner last changed the price (so advice waits to see the effect) */
  priceSetDay?: number;
  quality: number; // ~0.6..1.6
  brand: number; // ~0.6..1.6
  inventory: number;
  /** Average cost per finished unit in inventory (inputs + variable cost) */
  invCost: number;
  /** Input store room: units and average purchase cost per input good */
  inputs: Partial<Record<GoodId, { qty: number; cost: number }>>;
  /** Discount given to sister companies with the same owner (0..0.5) */
  sisterDiscount: number;
  cash: number;
  debt: number;
  /** % of revenue to marketing / R&D (AI or manual baseline) */
  marketingPct: number;
  rdPct: number;
  automation: Automation;
  last: DayResult;
  /** Rolling 30-day sums of the P&L */
  sum30: DayResult;
  /** Daily history (recent window) */
  hist: { day: number; revenue: number; net: number; cash: number }[];
  /** Quarterly revenue/net history */
  quarters: { label: string; revenue: number; net: number }[];
  qAcc: { revenue: number; net: number };
  bankrupt: boolean;
  lowCashDays: number;
  strikeUntil: number;
  /** Total capital spent on founding/upgrades (book value of fixed assets) */
  assets: number;
  /** Utility AI memory */
  aiLastAction: string;
  /** Outside owners of a private company */
  partners?: Partner[];
  /** The bank company this company borrows from */
  bankId?: string;
  /** Banks only: multiplier on the loan margin the bank charges (1 = normal) */
  loanRateMult?: number;
  /** Damage from an accident: output is limited to mult x capacity until untilDay */
  damage?: { mult: number; untilDay: number; cause: string };
  /** Patched-up machines break down more often until replaced */
  worn?: boolean;
  /** Recent borrowing and why it happened (newest first) */
  loanLog?: { day: number; amount: number; reason: LoanReason }[];
  /** Banks you found: capital that must stay in the company (no withdrawals or dividends from it) */
  lockedCapital?: number;
  /** Banks only: reserve held against bad loans (not counted as cash) */
  loanReserve?: number;
}

export interface Stock {
  ticker: string;
  companyId: string;
  shares: number;
  price: number;
  prevClose: number;
  open: number;
  fair: number;
  beta: number;
  /** Average daily volume (shares) */
  adv: number;
  volume: number;
  sentiment: number; // -1..1, decays
  newsImpact: number; // decays
  pressure: number; // net buy pressure from orders today, fraction of adv
  hist: { day: number; price: number }[];
  monthly: { day: number; price: number }[];
  halted: boolean;
}

export interface Holding {
  shares: number;
  avgCost: number;
}

export type OrderSide = 'buy' | 'sell';
export interface Order {
  id: string;
  ownerId: string;
  ticker: string;
  side: OrderSide;
  type: 'market' | 'limit';
  qty: number;
  filled: number;
  limit: number | null;
  createdDay: number;
  status: 'open' | 'filled' | 'cancelled';
  avgFill: number;
  lastFillDay: number;
  filledToday: number;
}

export interface Macro {
  gdp: number; // annualized nominal
  gdpPrev: number;
  c: number;
  i: number;
  g: number;
  x: number;
  m: number;
  growth: number; // annualized real growth, fraction
  trendGrowth: number;
  inflation: number; // annual fraction
  inflationTarget: number;
  unemployment: number;
  naturalUnemployment: number;
  rate: number; // central bank policy rate
  neutralRate: number;
  priceLevel: number;
  realConsumption: number; // index, 1 = base
  confidence: number; // 0..1
  oilPrice: number; // index 1 = normal
  oilSupply: number; // index 1 = normal
  wageGrowth: number;
  taxRate: number;
  govDebt: number;
  realOutputPrev: number;
  capexMonth: number;
  govRevenue: number;
  govSpending: number;
  rateExplain: Explanation;
  gdpExplain: Explanation;
  hist: { day: number; gdp: number; inflation: number; unemployment: number; rate: number; growth: number }[];
}

export interface Personality {
  risk: number;
  aggression: number;
  patience: number;
  ambition: number;
  loyalty: number;
  negotiation: number;
  financial: number;
  political: number;
  ethics: number;
}

export interface Rival {
  id: string;
  name: string;
  title: string;
  focus: IndustryId[];
  weakness: string;
  quote: string;
  flag: string;
  personality: Personality;
  cash: number;
  holdings: Record<string, Holding>;
  /** -100 hostile .. 100 ally */
  relation: number;
  memory: { day: number; text: string; delta: number }[];
  avatarColor: string;
}

export type NewsCategory =
  | 'business'
  | 'market'
  | 'economy'
  | 'technology'
  | 'commodities'
  | 'politics'
  | 'player';

export interface NewsItem {
  id: string;
  day: number;
  category: NewsCategory;
  headline: string;
  body: string;
  tone: 'good' | 'bad' | 'neutral';
  entityIds: string[];
}

export interface EventChoice {
  id: string;
  label: string;
  detail: string;
}

export interface PendingEvent {
  id: string;
  template: string;
  day: number;
  title: string;
  body: string;
  companyId: string | null;
  rivalId: string | null;
  choices: EventChoice[];
  expiresDay: number;
  amount?: number;
  good?: GoodId;
}

export interface Goal {
  id: string;
  label: string;
  kind: 'profitTotal' | 'level' | 'netWorth' | 'companies' | 'stocks' | 'share';
  target: number;
  progress: number;
  rewardCash: number;
  rewardXp: number;
  claimed: boolean;
  industry?: IndustryId;
}

export interface Achievement {
  id: string;
  title: string;
  body: string;
  day: number;
  rewardCash: number;
  rewardXp: number;
  seen: boolean;
}

export interface Player {
  name: string;
  cash: number;
  xp: number;
  level: number;
  holdings: Record<string, Holding>;
  reputation: number; // 0..100
  realizedPnl: number;
  dividendsReceived: number;
  lifetimeProfit: number;
  netWorthHist: { day: number; value: number }[];
  /** Industries you may found companies in */
  licences?: IndustryId[];
}

// ---------- rewards and strategies ----------

export type RecordId = 'bestDay' | 'bestMonth' | 'netWorth' | 'companies' | 'share' | 'bigCompany';

/** A money pop over a company on the city map (today only). */
export interface Pop { companyId: string; amount: number; kind: 'big' | 'record' }

/** A short banner that does not pause the game (records, contract results...). */
export interface Banner { id: string; day: number; title: string; body: string; xp: number; tone: 'gold' | 'good' | 'bad' }

export interface MonthReport {
  id: string;
  day: number;
  month: number;
  grade: string;
  score: number;
  profit: number;
  prevProfit: number;
  netWorth: number;
  prevNetWorth: number;
  rank: number;
  prevRank: number;
  of: number;
  best?: { name: string; net: number };
  worst?: { name: string; net: number };
  tip: string;
  xp: number;
  parts: { label: string; points: number; max: number }[];
}

export interface Streak { last: string; count: number; best: number; freezeUsed?: string; reward?: { cash: number; xp: number; count: number; froze: boolean; date: string; seen: boolean } }

/** A delivery job: deliver qty units by the deadline for a fixed pay. Comes from the contracts board or a won tender. */
export interface Job {
  id: string;
  source: 'rival' | 'gov' | 'tender';
  buyerName: string;
  buyerId?: string;
  rivalId?: string;
  good: GoodId;
  qty: number;
  delivered: number;
  /** Total pay for the full quantity (paid per unit as it is delivered) */
  pay: number;
  bonus: number;
  penalty: number;
  days: number;
  deadline: number;
  startDay: number;
  companyId?: string;
  status: 'offer' | 'active' | 'done' | 'failed';
  offerUntil: number;
  early?: boolean;
}

export interface Tender {
  id: string;
  buyer: string;
  good: GoodId;
  qtyPerMonth: number;
  months: number;
  closes: number;
  ref: number;
  bids: { companyId: string; name: string; price: number; quality: number }[];
  mine?: { companyId: string; price: number };
  status: 'open' | 'won' | 'lost' | 'closed';
  winner?: string;
  winPrice?: number;
}

export type CampaignSize = 's' | 'm' | 'l';
export interface Campaign {
  id: string;
  companyId: string;
  size: CampaignSize;
  start: number;
  end: number;
  cost: number;
  lift: number;
  baseRev: number;
  rev: number;
  done: boolean;
  seen?: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  level: number;
  stock: Partial<Record<GoodId, { qty: number; cost: number }>>;
  /** Most of this warehouse's space each product may use (0..1) */
  limits: Partial<Record<GoodId, number>>;
  /** Auto-sell rules: release stock when the price is this much above what you paid, or when there is a shortage */
  rules: Partial<Record<GoodId, { above?: number; shortage?: boolean }>>;
  built: number;
}

/** A standing order to buy a product from the market into a warehouse each day. */
export interface BuyOrder { id: string; warehouseId: string; good: GoodId; perDay: number; maxPrice: number }

export interface PriceWar {
  id: string;
  good: GoodId;
  playerCoId: string;
  rivalCoId: string;
  rivalId: string;
  start: number;
  mode: 'match' | 'undercut' | 'backoff';
  startShare: number;
  rivalStartShare: number;
  status: 'active' | 'won' | 'lost' | 'truce';
  end?: number;
  cost: number;
}

export interface Tip {
  id: string;
  rivalId: string;
  day: number;
  dueDay: number;
  text: string;
  ticker: string;
  dir: 1 | -1;
  truth: boolean;
  sharesAtTip: number;
  done: boolean;
}

/** A rival's speculative stockpile of a product. */
export interface AiStore { rivalId: string; good: GoodId; qty: number; cost: number; day: number }

export interface Play {
  records: Partial<Record<RecordId, number>>;
  banners: Banner[];
  pops: Pop[];
  levelSeen: number;
  reports: MonthReport[];
  reportSeen: string | null;
  streak: Streak;
  jobs: Job[];
  tenders: Tender[];
  campaigns: Campaign[];
  warehouses: Warehouse[];
  buyOrders: BuyOrder[];
  wars: PriceWar[];
  tips: Tip[];
  aiStores: AiStore[];
  /** Last antitrust check per company */
  probes: Record<string, number>;
  /** Day of the last upgrade per company (for the crane animation) */
  upgraded: Record<string, number>;
  /** XP earned inside a tick, paid out by updateProgress */
  xpOwed: number;
}

export interface WorldState {
  version: number;
  seed: number;
  rng: RngState;
  day: number;
  scenario: ScenarioId;
  countryName: string;
  player: Player;
  companies: Company[];
  stocks: Stock[];
  orders: Order[];
  macro: Macro;
  rivals: Rival[];
  news: NewsItem[];
  pending: PendingEvent[];
  goals: Goal[];
  achievements: Achievement[];
  marketMood: number; // 0..1 bullish share
  marketIndexHist: { day: number; value: number }[];
  marketIndex: number;
  indexBase: number;
  lastDilemmaDay: number;
  /** Active temporary effects created by events (underlying variable changes) */
  effects: { id: string; kind: 'oilSupply' | 'confidence' | 'goodDemand' | 'goodSupply'; target?: GoodId; delta: number; untilDay: number }[];
  goods: Record<GoodId, GoodMarket>;
  contracts: Contract[];
  seq: number;
  play: Play;
}

export type ScenarioId = 'young' | 'established';

export type Command =
  | { type: 'foundCompany'; name: string; good: GoodId; priceMult?: number }
  | { type: 'upgrade'; companyId: string }
  | { type: 'hire'; companyId: string; count: number }
  | { type: 'setPrice'; companyId: string; priceMult: number }
  | { type: 'setSalary'; companyId: string; salaryMult: number }
  | { type: 'setSpend'; companyId: string; marketingPct: number; rdPct: number }
  | { type: 'setAutomation'; companyId: string; automation: Partial<Automation> }
  | { type: 'borrow'; companyId: string; amount: number }
  | { type: 'repay'; companyId: string; amount: number }
  | { type: 'transfer'; companyId: string; amount: number } // + to company, - to player
  | { type: 'placeOrder'; ticker: string; side: OrderSide; orderType: 'market' | 'limit'; qty: number; limit?: number }
  | { type: 'cancelOrder'; orderId: string }
  | { type: 'claimGoal'; goalId: string }
  | { type: 'resolveEvent'; eventId: string; choiceId: string }
  | { type: 'seenAchievement'; id: string }
  | { type: 'setSisterDiscount'; companyId: string; discount: number }
  | { type: 'offerContract'; companyId: string; partnerId: string; side: 'sell' | 'buy'; qtyPerDay: number; price: number; days: number }
  | { type: 'cancelContract'; contractId: string }
  | { type: 'sellStake'; companyId: string; pct: number; buyerId: string }
  | { type: 'buyBackStake'; companyId: string; partnerId: string }
  | { type: 'buyStake'; companyId: string; pct: number }
  | { type: 'bidCompany'; companyId: string; premium: number; mode: 'all' | 'majority' }
  | { type: 'sellCompany'; companyId: string; buyerId: string }
  | { type: 'chooseBank'; companyId: string; bankId: string }
  | { type: 'setLoanRate'; companyId: string; mult: number }
  | { type: 'buyLicence'; industry: IndustryId }
  | { type: 'seenLevel' }
  | { type: 'seenReport'; id: string }
  | { type: 'seenStreak' }
  | { type: 'seenCampaign'; id: string }
  | { type: 'checkIn'; date: string }
  | { type: 'acceptJob'; jobId: string; companyId: string }
  | { type: 'startCampaign'; companyId: string; size: CampaignSize; weeks: number }
  | { type: 'buildWarehouse' }
  | { type: 'upgradeWarehouse'; id: string }
  | { type: 'setWarehouseLimit'; id: string; good: GoodId; share: number }
  | { type: 'releaseStock'; id: string; good: GoodId; qty: number }
  | { type: 'setBuyOrder'; warehouseId: string; good: GoodId; perDay: number; maxPrice: number }
  | { type: 'setSellRule'; id: string; good: GoodId; above?: number; shortage?: boolean }
  | { type: 'sellToRivals'; id: string; good: GoodId; qty: number }
  | { type: 'bidTender'; tenderId: string; companyId: string; price: number }
  | { type: 'endWar'; warId: string };

export interface CommandResult {
  ok: boolean;
  message: string;
}
