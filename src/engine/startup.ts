/**
 * The startup mini-game played before the main game. It is a small version of the main game:
 * you set a price, marketing, R&D, team size and loans each week, and see demand, capacity and a
 * profit and loss statement. An investor buys 51% after a strict technical pitch, then reviews you
 * every 4 weeks against a target and their own rule. Reach $500K and they buy you out.
 */
import { GOODS, startCost } from './data';
import type { GoodId, TraitId } from './types';
import { chance, createRng, next, pick, range, type RngState } from './rng';

export type IdeaId = 'chips' | 'gaming' | 'energy' | 'freelance' | 'ai';
export type FreelanceKind = 'design' | 'editing' | 'saas' | 'writing';
export type InvestorId = 'quinn' | 'north' | 'harbor';
export type Model = 'hours' | 'subs' | 'copies';

export const GOAL_VALUE = 500_000;
/** Weeks of sales and profit the value is based on. */
export const VALUE_WEEKS = 12;
export const PAYOUT = 400_000;
export const RESCUE_PAYOUT = 300_000;
export const RESCUE_CASH = 40_000;
export const INVESTOR_PCT = 0.51;
export const RESCUE_PCT = 0.65;
export const REVIEW_EVERY = 4;
export const DEADLINE_WEEK = 64;
export const WEEKLY_RATE = 0.003;
export const START_TRUST = 70;

// ---------------------------------------------------------------- ideas and their economics

export interface IdeaSpec {
  id: IdeaId;
  icon: string;
  name: string;
  blurb: string;
  style: string;
  risk: 'Low' | 'Medium' | 'High' | 'Low to medium';
  teaches: string;
  side: [string, string];
}

export const IDEAS: Record<IdeaId, IdeaSpec> = {
  chips: {
    id: 'chips', icon: '💻', name: 'Chip design research', risk: 'Medium',
    blurb: 'Design chip blocks and license them to chipmakers for a weekly royalty.',
    style: 'Long research before the first licence. Few customers, each worth a lot.',
    teaches: 'R&D and cash runway: you must survive until the research pays.',
    side: ['Consult for a chipmaker', 'Cash now, but half your team is away this week'],
  },
  gaming: {
    id: 'gaming', icon: '🎮', name: 'Gaming studio', risk: 'High',
    blurb: 'Make a game, build hype, launch it, then keep it alive with updates.',
    style: 'Sales peak at launch and fade. Marketing before launch and updates after it decide everything.',
    teaches: 'Hype, launch timing and how price changes the number you sell.',
    side: ['Contract work for a bigger studio', 'Cash now, but half your team is away this week'],
  },
  energy: {
    id: 'energy', icon: '🌱', name: 'Renewable energy research', risk: 'Low to medium',
    blurb: 'Build better solar and battery tech and run paid pilots with power companies.',
    style: 'Grants help early. Each pilot customer pays well but needs your people.',
    teaches: 'Fixed costs, capacity per person and spreading costs over more output.',
    side: ['Apply for a government grant', 'About a 45% chance of $20K to $40K. Half your team is busy.'],
  },
  freelance: {
    id: 'freelance', icon: '✍️', name: 'Freelance', risk: 'Low',
    blurb: 'Sell your skills to clients by the hour (or small software subscriptions).',
    style: 'Money from week one. You grow by hiring and by charging the right price.',
    teaches: 'Price vs demand, capacity per worker and profit margins.',
    side: ['Take a rush job', 'Cash now, but half your team is busy this week'],
  },
  ai: {
    id: 'ai', icon: '🤖', name: 'AI software', risk: 'High',
    blurb: 'An AI tool that businesses pay for every week.',
    style: 'Build first, then win subscribers. Computing costs grow with every customer.',
    teaches: 'Subscriptions, churn, variable costs and customer payback.',
    side: ['Custom AI project for a company', 'Cash now, but half your team is away this week'],
  },
};

export const IDEA_IDS: IdeaId[] = ['freelance', 'ai', 'gaming', 'chips', 'energy'];

export const FREELANCE: Record<FreelanceKind, { icon: string; name: string; blurb: string }> = {
  design: { icon: '🎨', name: 'Graphic design', blurb: 'Logos and brands. Good hourly rate.' },
  editing: { icon: '🎬', name: 'Video editing', blurb: 'Edit videos for creators and companies.' },
  saas: { icon: '🧩', name: 'Small SaaS tools', blurb: 'Tiny subscriptions. Build first, then many small customers.' },
  writing: { icon: '📝', name: 'Writing', blurb: 'Articles and copy. Lower rate, more demand.' },
};

/** The economics behind each business. */
export interface Econ {
  model: Model;
  unit: string;
  units: string;
  /** what rivals charge per unit (per week for subscriptions) */
  ref: number;
  /** cost of each unit sold (materials, computing, support) */
  varCost: number;
  /** share of the price a store keeps (games) */
  varShare: number;
  /** units one person can handle per week (hours, or customers supported) */
  perPerson: number;
  salary: number;
  rent: number;
  elasticity: number;
  /** hours/copies wanted per person who knows you, or sign-up rate for subscriptions */
  buyRate: number;
  churn: number;
  /** marketing $ per new person reached */
  reachCost: number;
  startReach: number;
  needsLaunch: boolean;
  teamPoints: number;
  rdPerPoint: number;
  /** value of a finished prototype before launch */
  proto: number;
  /** R&D spend at which quality is halfway to its best */
  rdHalf: number;
  sidePay: number;
  /** value = profit x profitMult + sales x revMult (per year) */
  profitMult: number;
  revMult: number;
}

const MULTS: Record<Model, { profitMult: number; revMult: number }> = {
  hours: { profitMult: 4, revMult: 0.4 },
  subs: { profitMult: 4, revMult: 0.3 },
  copies: { profitMult: 2, revMult: 0.3 },
};

const BASE: Omit<Econ, 'model' | 'unit' | 'units' | 'ref' | 'varCost' | 'perPerson' | 'salary' | 'rent' | 'elasticity' | 'buyRate' | 'reachCost' | 'startReach' | 'profitMult' | 'revMult'> = {
  varShare: 0, churn: 0, needsLaunch: false, teamPoints: 0, rdPerPoint: 1, proto: 0, rdHalf: 2000, sidePay: 2000,
};

const RAW: Record<IdeaId | FreelanceKind, Omit<Econ, 'profitMult' | 'revMult'>> = {
  design: { ...BASE, model: 'hours', unit: 'hour', units: 'hours', ref: 60, varCost: 6, perPerson: 30, salary: 950, rent: 300, elasticity: 1.8, buyRate: 0.22, reachCost: 30, startReach: 130, rdHalf: 1500, sidePay: 1800 },
  editing: { ...BASE, model: 'hours', unit: 'hour', units: 'hours', ref: 50, varCost: 5, perPerson: 32, salary: 870, rent: 300, elasticity: 1.8, buyRate: 0.26, reachCost: 28, startReach: 130, rdHalf: 1500, sidePay: 1600 },
  writing: { ...BASE, model: 'hours', unit: 'hour', units: 'hours', ref: 40, varCost: 3, perPerson: 35, salary: 750, rent: 250, elasticity: 1.9, buyRate: 0.32, reachCost: 25, startReach: 130, rdHalf: 1500, sidePay: 1400 },
  saas: { ...BASE, model: 'subs', unit: 'subscriber', units: 'subscribers', ref: 25, varCost: 3, perPerson: 150, salary: 1000, rent: 250, elasticity: 2.0, buyRate: 0.028, churn: 0.03, reachCost: 12, startReach: 120, needsLaunch: true, teamPoints: 10, rdPerPoint: 300, proto: 30_000, rdHalf: 1500, sidePay: 1800 },
  freelance: { ...BASE, model: 'hours', unit: 'hour', units: 'hours', ref: 60, varCost: 6, perPerson: 30, salary: 1050, rent: 300, elasticity: 1.8, buyRate: 0.22, reachCost: 30, startReach: 130 },
  ai: { ...BASE, model: 'subs', unit: 'subscriber', units: 'subscribers', ref: 50, varCost: 14, perPerson: 80, salary: 1600, rent: 900, elasticity: 2.0, buyRate: 0.022, churn: 0.035, reachCost: 18, startReach: 80, needsLaunch: true, teamPoints: 3, rdPerPoint: 450, proto: 70_000, rdHalf: 2500, sidePay: 3500 },
  gaming: { ...BASE, model: 'copies', unit: 'copy', units: 'copies', ref: 20, varCost: 0, varShare: 0.3, perPerson: Infinity, salary: 1300, rent: 600, elasticity: 2.2, buyRate: 0.25, reachCost: 2.5, startReach: 300, needsLaunch: true, teamPoints: 3.5, rdPerPoint: 400, proto: 60_000, rdHalf: 2500, sidePay: 2500 },
  chips: { ...BASE, model: 'subs', unit: 'licensee', units: 'licensees', ref: 900, varCost: 150, perPerson: 3, salary: 1500, rent: 1300, elasticity: 2.6, buyRate: 0.006, churn: 0.01, reachCost: 70, startReach: 40, needsLaunch: true, teamPoints: 1.6, rdPerPoint: 700, proto: 90_000, rdHalf: 3000, sidePay: 3500 },
  energy: { ...BASE, model: 'subs', unit: 'pilot', units: 'pilots', ref: 1400, varCost: 300, perPerson: 2, salary: 1500, rent: 1300, elasticity: 2.6, buyRate: 0.006, churn: 0.014, reachCost: 60, startReach: 40, needsLaunch: true, teamPoints: 1.5, rdPerPoint: 700, proto: 80_000, rdHalf: 3000, sidePay: 0 },
};

export const ECON = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, { ...v, ...MULTS[v.model] }])) as Record<IdeaId | FreelanceKind, Econ>;

export function econOf(s: Pick<Startup, 'idea' | 'kind'>): Econ {
  return s.idea === 'freelance' ? ECON[s.kind ?? 'design'] : ECON[s.idea];
}

// ---------------------------------------------------------------- investors and the pitch

export const INVESTORS: Record<InvestorId, { name: string; firm: string; likes: IdeaId[]; quote: string; avatar: string; rule: string; ruleShort: string }> = {
  harbor: {
    name: 'Lena Ortiz', firm: 'Harbor Angels', likes: ['freelance'], quote: 'Make money from day one and I am happy.', avatar: '#e0913a',
    rule: 'From month 3 you must make a profit (last 4 weeks together).', ruleShort: 'Be profitable',
  },
  quinn: {
    name: 'Mara Quinn', firm: 'Quinn Ventures', likes: ['ai', 'gaming'], quote: 'Show me something that can grow ten times.', avatar: '#7c5cff',
    rule: 'Before launch: at least 15% more product every month. After launch: company value must grow 5% every month.', ruleShort: 'Keep growing',
  },
  north: {
    name: 'Dev Okafor', firm: 'Northbridge Capital', likes: ['chips', 'energy'], quote: 'Deep tech wins. I can wait, but never run out of cash.', avatar: '#2fa36b',
    rule: 'Always keep at least 8 weeks of costs in cash (or make a profit).', ruleShort: '8 weeks of runway',
  },
};

export interface PitchQuestion { q: string; options: { text: string; ok?: boolean }[]; why: string }

const Q = (q: string, right: string, wrong: string[], why: string): PitchQuestion => ({ q, options: [{ text: right, ok: true }, ...wrong.map((text) => ({ text }))], why });

/** Finance questions every investor may ask, whatever the idea. */
export const PITCH_FINANCE: PitchQuestion[] = [
  Q('Revenue is $200K, cost of goods $120K and operating costs $50K. What is your operating margin?', '15%', ['40%', '25%', '30%'],
    '$200K − $120K − $50K = $30K operating profit. $30K ÷ $200K = 15%.'),
  Q('An investor puts in $1M for 20% of your company. What is the post-money valuation?', '$5M', ['$4M', '$1.2M', '$20M'],
    'Post-money = investment ÷ share bought = $1M ÷ 20% = $5M. The pre-money value was $4M.'),
  Q('Your pre-money valuation is $4M and an investor adds $1M. What share do they get?', '20%', ['25%', '80%', '4%'],
    'Post-money = $4M + $1M = $5M. Their share = $1M ÷ $5M = 20%.'),
  Q('You borrow $100K at 12% a year and pay interest only. What is the interest each month?', '$1,000', ['$12,000', '$1,200', '$100'],
    '$100K × 12% = $12,000 a year. ÷ 12 months = $1,000 a month.'),
  Q('You have $300K in the bank and lose $25K a month. What is your runway?', '12 months', ['25 months', '3 months', '7.5 months'],
    'Runway = cash ÷ monthly burn = $300K ÷ $25K = 12 months.'),
  Q('What is EBITDA?', 'Earnings before interest, taxes, depreciation and amortisation', ['Cash in the bank minus debt', 'Revenue minus cost of goods only', 'Profit after all taxes'],
    'EBITDA shows how much the operations earn before financing, tax and the cost of wearing out equipment.'),
  Q('A customer pays $40 a month at a 75% gross margin and stays 20 months. What is their lifetime gross profit (LTV)?', '$600', ['$800', '$30', '$1,600'],
    '$40 × 75% = $30 gross profit a month. × 20 months = $600.'),
  Q('Each customer is worth $600 (LTV) and costs $200 to win (CAC). What does that tell you?', 'LTV:CAC is 3:1, a healthy business', ['LTV:CAC is 1:3, you lose money', 'You lose $400 per customer', 'It needs to be 10:1 to work'],
    '$600 ÷ $200 = 3. A ratio of 3 or more is the usual target for a healthy business.'),
  Q('Customers pay you after 60 days, but you pay suppliers after 30. What happens when sales grow fast?', 'You need more cash: unpaid invoices tie up money (working capital)', ['Profit falls', 'Nothing, only profit matters', 'Suppliers start paying you'],
    'You pay out before you collect, so faster growth means more cash stuck in invoices. Profitable companies can still run out of cash this way.'),
  Q('You invest $100K and it returns $30K a year. What is the simple payback period?', 'About 3.3 years', ['5 years', '1.5 years', '30 years'],
    'Payback = investment ÷ yearly return = $100K ÷ $30K ≈ 3.3 years.'),
  Q('Revenue grows 10% every month for 12 months. Roughly how much bigger is it?', 'About 3.1×', ['2.2×', '1.2×', '12×'],
    'Growth compounds: 1.1¹² ≈ 3.14. Adding 12 × 10% (2.2×) forgets that each month grows on the last.'),
  Q('Fixed costs are $60K a month. You sell at $50 and each unit costs $20 to make. How many units a month to break even?', '2,000', ['1,200', '3,000', '857'],
    'Each unit leaves $50 − $20 = $30. $60K ÷ $30 = 2,000 units.'),
];

/** Questions about the business itself. Every one must be answered right. */
export const PITCHES: Record<IdeaId, PitchQuestion[]> = {
  freelance: [
    Q('A project takes 10 hours. You charge $60 an hour and software costs $50 per project. What is your gross profit per project?', '$550', ['$600', '$50', '$650'],
      'Revenue 10 × $60 = $600, minus the $50 variable cost = $550.'),
    Q('You have 3 people who can each bill 30 hours a week. Clients want 120 hours. What limits your sales?', 'Capacity: we can only sell 90 hours', ['Demand: clients do not want enough', 'The price is too low', 'Marketing'],
      'You sell the smaller of demand (120) and capacity (3 × 30 = 90).'),
    Q('Fixed costs are $2,000 a week. Each hour leaves $40 after variable costs. How many hours a week to break even?', '50 hours', ['40 hours', '80 hours', '20 hours'],
      'Break-even = fixed costs ÷ margin per unit = $2,000 ÷ $40 = 50 hours.'),
    Q('You are fully booked. What should you try first?', 'Raise your rate: you earn more per hour and lose only the cheapest clients', ['Cut your rate to win more clients', 'Spend more on ads', 'Work for free to build a name'],
      'When demand is bigger than capacity, a higher price earns more from the same hours. Ads or lower prices only bring work you cannot do.'),
    Q('You work 40 hours a week but only 28 can be billed to clients. What is your utilisation?', '70%', ['28%', '40%', '143%'],
      'Utilisation = billable hours ÷ hours worked = 28 ÷ 40 = 70%.'),
    Q('You bill a freelancer at $80 an hour and pay them $50. They work 100 hours for a client. What is your gross profit?', '$3,000', ['$8,000', '$5,000', '$30'],
      '100 × ($80 − $50) = $3,000.'),
    Q('A fixed-price job was quoted at 50 hours × $60. It took 75 hours. What did you really earn per hour?', '$40', ['$60', '$90', '$45'],
      'The client pays $3,000 either way. $3,000 ÷ 75 hours = $40 an hour.'),
    Q('What is a retainer?', 'A fixed monthly fee for an agreed amount of work', ['A deposit you return later', 'A fee for cancelling', 'A tax on freelancers'],
      'Retainers give steady, predictable revenue, so they are worth more than one-off jobs.'),
  ],
  ai: [
    Q('A customer pays $50 a week and costs $15 a week in computing. What is your gross margin?', '70%', ['30%', '35%', '85%'],
      '($50 − $15) ÷ $50 = 70%.'),
    Q('You spend $4,000 on marketing and win 20 customers. Each brings $35 a week of gross profit. How long until the marketing pays back?', 'About 6 weeks', ['About 1 week', 'About 20 weeks', 'About 114 weeks'],
      '$4,000 ÷ 20 = $200 per customer. $200 ÷ $35 ≈ 6 weeks.'),
    Q('5% of your customers leave every week. What is the best fix?', 'Improve the product so fewer leave', ['More ads to replace them', 'Give the product away', 'Raise the price'],
      'Churn is a quality problem. Ads only refill a leaking bucket.'),
    Q('What happens to your computing bill as you grow?', 'It grows with every customer: it is a variable cost', ['It stays the same: it is a fixed cost', 'It shrinks', 'It is paid by the customers directly'],
      'Costs that rise with each unit sold are variable costs. Price must stay above them.'),
    Q('You serve 2 million requests a day at $0.002 of computing each. What is the daily computing bill?', '$4,000', ['$400', '$40,000', '$2,000'],
      '2,000,000 × $0.002 = $4,000 a day.'),
    Q('What is "inference" in an AI product?', 'Running the trained model to answer a user’s request', ['Training the model on data', 'Labelling data by hand', 'Buying GPUs'],
      'Training happens once (or rarely). Inference runs for every request, so it drives your variable cost.'),
    Q('Your GPUs are busy 40% of the time. If you raise that to 80%, what happens to the computing cost per request?', 'It halves', ['It doubles', 'It stays the same', 'It falls by 80%'],
      'You pay for the GPUs either way. Twice the requests on the same hardware = half the cost per request.'),
    Q('Why do most AI startups fine-tune an existing model instead of training one from scratch?', 'Far less cost and time for a model that is good at your task', ['Fine-tuned models need no computing', 'Training from scratch is illegal', 'It is always more accurate'],
      'Training a large model costs millions. Fine-tuning adapts an existing one to your data for a tiny fraction.'),
    Q('Monthly churn is 5%. Roughly how long does an average customer stay?', '20 months', ['5 months', '12 months', '95 months'],
      'Average lifetime ≈ 1 ÷ churn = 1 ÷ 5% = 20 months.'),
  ],
  gaming: [
    Q('You sell a game for $20 and the store keeps 30%. What do you keep per copy?', '$14', ['$20', '$6', '$17'],
      '$20 × (1 − 30%) = $14.'),
    Q('What usually happens to a game’s weekly sales?', 'They peak at launch and fade; updates bring players back', ['They grow every week forever', 'They stay flat', 'They start low and peak after a year'],
      'Most sales come at launch. Updates and new content lift them again.'),
    Q('Development costs $8,000 a week for 12 weeks. You keep $14 a copy. Roughly how many copies to break even?', '6,900', ['960', '69,000', '1,400'],
      '$8,000 × 12 = $96,000. $96,000 ÷ $14 ≈ 6,900 copies.'),
    Q('When is marketing worth the most?', 'Before and at launch, so hype turns into first-week sales', ['A year after launch', 'Never: good games sell themselves', 'Only after the first update'],
      'People who hear about you before launch buy in the first weeks, when sales are biggest.'),
    Q('Day-1 retention is 40% and day-30 retention is 5%. What does that mean?', '40% come back the day after installing; 5% still play a month later', ['40% finish the game', '5% of players paid', 'The game lost 35 players'],
      'Retention measures how many players return. Low day-30 retention means the game does not hold people.'),
    Q('A free game has 100,000 daily players. 2% buy something each day, spending $5 on average. What is the daily revenue?', '$10,000', ['$2,000', '$500,000', '$100,000'],
      '100,000 × 2% = 2,000 buyers × $5 = $10,000.'),
    Q('What does ARPDAU mean?', 'Average revenue per daily active user', ['Annual revenue per download', 'Average reviews per day', 'Active players per update'],
      'ARPDAU = daily revenue ÷ daily players. With the numbers above: $10,000 ÷ 100,000 = $0.10.'),
    Q('Your game engine charges 5% of revenue above the first $1M. The game earns $3M. What is the fee?', '$100,000', ['$150,000', '$50,000', '$0'],
      'Only the $2M above $1M is charged: 5% × $2M = $100,000.'),
  ],
  chips: [
    Q('How does a chip design (IP) company make money?', 'Licence fees plus a royalty on every chip sold', ['Making chips in its own factory', 'Advertising', 'Selling raw silicon'],
      'Design firms sell the design, not the chip: a fee up front plus a royalty.'),
    Q('Research costs $6,000 a week and the first design needs about 15 weeks. How much cash do you need before the first licence?', 'About $90,000', ['About $6,000', 'About $15,000', 'About $21,000'],
      '$6,000 × 15 weeks = $90,000 of runway.'),
    Q('You have 10 licensees paying $900 a week. Each costs $120 a week to support, and fixed costs are $6,000. What is the weekly profit?', '$1,800', ['$9,000', '$7,800', '$3,000'],
      '10 × ($900 − $120) = $7,800, minus $6,000 fixed = $1,800.'),
    Q('What is a "tape-out"?', 'Sending the finished design to the factory to make the first chips', ['Packaging chips for shipping', 'A failed chip test', 'Recording a product video'],
      'Tape-out is the big milestone: after it, changes are slow and very expensive.'),
    Q('A wafer holds 500 chips and the yield is 80%. How many good chips per wafer?', '400', ['500', '80', '420'],
      'Yield is the share that works: 500 × 80% = 400.'),
    Q('What does a smaller process node (say 3 nm instead of 7 nm) usually give?', 'More transistors in the same space: faster and less power, but costlier to make', ['Bigger, cheaper chips', 'No change at all', 'Slower chips that use more power'],
      'Smaller transistors pack more logic per area, but the masks and factories cost far more.'),
    Q('What is a "fabless" chip company?', 'One that designs chips and pays a foundry to manufacture them', ['One with no designers', 'One that only sells used chips', 'One that makes chips without silicon'],
      'Fabless firms avoid the billions a factory costs and pay a foundry per wafer instead.'),
    Q('A licensee sells 1 million chips at $50 and pays you a 2% royalty. How much do you earn?', '$1,000,000', ['$100,000', '$50,000', '$10,000,000'],
      '1,000,000 × $50 = $50M of chip sales. 2% of $50M = $1M.'),
  ],
  energy: [
    Q('Where does early money usually come from?', 'Government grants and paid pilot projects', ['Selling power to homes', 'Advertising', 'Selling shares to the public'],
      'Before the tech is proven, grants and pilots pay for the research.'),
    Q('A grant has a 50% chance to pay $40,000. What is it worth on average?', '$20,000', ['$40,000', '$0', '$80,000'],
      'Expected value = chance × prize = 50% × $40,000.'),
    Q('Each engineer can run 2.5 pilots. You have 2 engineers and 7 power companies want a pilot. What do you do?', 'Hire: you can only serve 5 pilots', ['Sign all 7 and hope', 'Cut your price', 'Turn everyone away'],
      'Capacity = 2 × 2.5 = 5. Customers you cannot serve leave and hurt your name.'),
    Q('A 10 MW solar farm has a 25% capacity factor. How much energy does it make in a year (8,760 hours)?', '21,900 MWh', ['87,600 MWh', '2,190 MWh', '25,000 MWh'],
      '10 MW × 8,760 h × 25% = 21,900 MWh. Capacity factor is the share of the maximum the plant really produces.'),
    Q('What is a PPA (power purchase agreement)?', 'A long contract where a buyer agrees to buy your power at a set price', ['A government safety permit', 'A loan for solar panels', 'A share of the power grid'],
      'PPAs lock in revenue for 10–20 years, which makes banks willing to lend for the plant.'),
    Q('What does LCOE measure?', 'The average cost of producing each MWh over the plant’s whole life', ['The price of power on one day', 'How much carbon the plant saves', 'The cost of the land'],
      'Levelised cost of energy spreads building and running costs over every MWh produced, so different plants can be compared.'),
    Q('You sell 20,000 MWh a year at $50 per MWh. What is the yearly revenue?', '$1,000,000', ['$100,000', '$10,000,000', '$400,000'],
      '20,000 × $50 = $1,000,000.'),
    Q('Why do solar and wind farms add batteries?', 'To store power and sell it when the sun or wind is gone, often at higher prices', ['Batteries make the panels produce more', 'The law always requires it', 'To avoid paying for land'],
      'Power is worth most at peak times. Storage moves cheap midday solar to the expensive evening.'),
  ],
};

/** How many questions an investor asks: two on finance and three on the business itself. */
export const PITCH_FINANCE_ASKED = 2;
export const PITCH_IDEA_ASKED = 3;

/** A repeatable shuffle. The seed is mixed first, so nearby seeds give unrelated orders. */
function shuffled<T>(list: T[], seed: number): T[] {
  const a = [...list];
  let x = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The `attempt`-th group of `n` from a list shuffled once per game, so retries do not repeat questions. */
function group<T>(list: T[], n: number, seed: number, attempt: number): T[] {
  const order = shuffled(list, seed);
  return Array.from({ length: Math.min(n, list.length) }, (_, i) => order[(attempt * n + i) % order.length]);
}

/** The questions for one pitch attempt. Each retry draws the next questions in the bank. */
export function pitchQuestions(idea: IdeaId, seed: number, attempt = 0): PitchQuestion[] {
  return [...group(PITCH_FINANCE, PITCH_FINANCE_ASKED, seed, attempt), ...group(PITCHES[idea], PITCH_IDEA_ASKED, seed + 1, attempt)];
}

export const INVEST_AMOUNT: Record<IdeaId, number> = { freelance: 40_000, ai: 110_000, gaming: 90_000, chips: 140_000, energy: 110_000 };

export interface PitchResult { pass: boolean; correct: number; total: number; amount: number; verdict: string; misses: { q: string; why: string }[]; offTopic: boolean }

/** answers[i] is the index into questions[i].options. All answers must be right. */
export function pitchResult(idea: IdeaId, investor: InvestorId, questions: PitchQuestion[], answers: number[]): PitchResult {
  const inv = INVESTORS[investor];
  if (!inv.likes.includes(idea)) {
    return { pass: false, correct: 0, total: questions.length, amount: 0, offTopic: true, misses: [],
      verdict: `I only back ${inv.likes.map((l) => IDEAS[l].name.toLowerCase()).join(' and ')}. This is not for me.` };
  }
  const misses = questions.flatMap((q, i) => (q.options[answers[i]]?.ok ? [] : [{ q: q.q, why: q.why }]));
  const correct = questions.length - misses.length;
  const pass = misses.length === 0;
  return {
    pass, correct, total: questions.length, offTopic: false, misses, amount: pass ? INVEST_AMOUNT[idea] : 0,
    verdict: pass ? 'You know your numbers. I am in.' : correct === questions.length - 1 ? 'Close, but I do not invest in founders who get the numbers wrong. Study them and come back.' : 'You do not understand your own business yet. No deal.',
  };
}
export interface StartupEvent { id: string; title: string; body: string; choices: { id: string; label: string; detail: string }[] }
export interface StartupLog { week: number; text: string; tone: 'good' | 'bad' | 'neutral'; cash?: number }

export interface WeekReport {
  week: number;
  demand: number;
  capacity: number;
  sold: number;
  revenue: number;
  wages: number;
  rent: number;
  variable: number;
  marketing: number;
  rd: number;
  interest: number;
  side: number;
  profit: number;
  newCustomers: number;
  lost: number;
}

export interface Review {
  month: number;
  target: number;
  value: number;
  valueOk: boolean;
  ruleOk: boolean;
  ruleText: string;
  trust: number;
  message: string;
  seen: boolean;
}

export interface Startup {
  v: 2;
  rng: RngState;
  idea: IdeaId;
  kind?: FreelanceKind;
  name: string;
  investor: InvestorId;
  stage: 'run' | 'won' | 'lost';
  lostReason?: 'fired' | 'bust' | 'deadline' | 'quit';
  week: number;
  cash: number;
  debt: number;
  invested: number;
  // levers
  price: number;
  marketing: number;
  rd: number;
  team: number;
  side: boolean;
  // state
  reach: number;
  quality: number;
  progress: number;
  launched: boolean;
  customers: number;
  novelty: number;
  trust: number;
  rescued: boolean;
  investorPct: number;
  grantCooldown: number;
  hist: WeekReport[];
  last?: WeekReport;
  reviews: Review[];
  /** revenue and progress at the last review (for growth rules) */
  checkRev: number;
  checkValue: number;
  checkProgress: number;
  event?: StartupEvent;
  log: StartupLog[];
  values: number[];
}

export function newStartup(seed: number, idea: IdeaId, name: string, investor: InvestorId, kind?: FreelanceKind, invested = INVEST_AMOUNT[idea]): Startup {
  const s: Startup = {
    v: 2, rng: createRng(seed), idea, kind: idea === 'freelance' ? kind ?? 'design' : undefined, name: name.trim().slice(0, 28) || 'My Startup', investor,
    stage: 'run', week: 1, cash: invested + 5_000, debt: 0, invested, price: 0, marketing: 0, rd: 0, team: 1, side: false,
    reach: 0, quality: 0.45, progress: 0, launched: false, customers: 0, novelty: 0, trust: START_TRUST, rescued: false, investorPct: INVESTOR_PCT,
    grantCooldown: 0, hist: [], reviews: [], checkRev: 0, checkValue: 0, checkProgress: 0, log: [], values: [],
  };
  const e = econOf(s);
  s.price = e.ref;
  s.reach = e.startReach;
  s.launched = !e.needsLaunch;
  s.marketing = Math.round(e.reachCost * 10 / 50) * 50;
  s.rd = e.needsLaunch ? 1000 : 0;
  s.values = [value(s)];
  s.log.unshift({ week: 0, text: `${INVESTORS[investor].name} invests ${money(invested)} for ${Math.round(INVESTOR_PCT * 100)}% of ${s.name}. Goal: ${money(GOAL_VALUE)} by week ${DEADLINE_WEEK}.`, tone: 'good' });
  return s;
}

export function money(n: number): string {
  const a = Math.abs(n);
  const t = a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}K` : a >= 1e3 ? `${(a / 1e3).toFixed(1).replace(/\.0$/, '')}K` : `${Math.round(a)}`;
  return `${n < 0 ? '-' : ''}$${t}`;
}

function say(s: Startup, text: string, tone: StartupLog['tone'] = 'neutral', cash?: number) {
  s.log.unshift({ week: s.week, text, tone, cash });
  if (s.log.length > 40) s.log.length = 40;
}

// ---------------------------------------------------------------- numbers the screens show

/** Average of the last n weeks of a report field. */
export function avg(s: Startup, key: keyof WeekReport, n = 4): number {
  const h = s.hist.slice(-n);
  return h.length ? h.reduce((t, r) => t + (r[key] as number), 0) / h.length : 0;
}

/** Average over the last `n` weeks, counting weeks before the company existed as zero. */
export function trailing(s: Startup, key: keyof WeekReport, n = VALUE_WEEKS): number {
  const h = s.hist.slice(-n);
  return h.reduce((t, r) => t + (r[key] as number), 0) / n;
}

export function weeklyCosts(s: Startup): number {
  const e = econOf(s);
  return (s.team - 1) * e.salary + e.rent + s.marketing + s.rd + s.debt * WEEKLY_RATE;
}

export function runway(s: Startup): number {
  const burn = weeklyCosts(s) - avg(s, 'revenue', 2);
  return burn <= 0 ? Infinity : Math.max(0, s.cash) / burn;
}

export function bankLimit(s: Startup): number {
  return Math.round((15_000 + avg(s, 'revenue') * 8) / 1000) * 1000;
}

export function capacityOf(s: Startup): number {
  const e = econOf(s);
  return e.perPerson === Infinity ? Infinity : s.team * e.perPerson * (s.side ? 0.5 : 1);
}

export function unitMargin(s: Startup): number {
  const e = econOf(s);
  return s.price * (1 - e.varShare) - e.varCost;
}

export function hireCost(s: Startup): number {
  return econOf(s).salary;
}

/** Company value: cash minus debt, 5 x yearly profit, half a year's sales, plus an unfinished prototype. */
export function valueParts(s: Startup): { label: string; amount: number; hint: string }[] {
  const e = econOf(s);
  // Investors look at the last 12 weeks (a quarter), so one lucky week cannot carry the value.
  const profitYear = trailing(s, 'profit') * 52;
  const revYear = trailing(s, 'revenue') * 52;
  return [
    { label: 'Cash − loans', amount: Math.max(0, s.cash - s.debt), hint: 'What is in the bank after paying back loans' },
    { label: `Profit × ${e.profitMult}`, amount: Math.max(0, profitYear) * e.profitMult, hint: `A year of profit (average of the last 12 weeks × 52), times ${e.profitMult}` },
    { label: `Sales × ${e.revMult}`, amount: revYear * e.revMult, hint: `A year of sales (last 12 weeks), times ${e.revMult}` },
    { label: s.launched ? 'Product' : 'Prototype', amount: e.proto * (s.progress / 100), hint: s.launched ? 'The finished product you own' : 'Unfinished product, worth more as it nears launch' },
  ];
}

export function value(s: Startup): number {
  return valueParts(s).reduce((t, p) => t + p.amount, 0);
}

export function targetFor(month: number): number {
  const months = DEADLINE_WEEK / REVIEW_EVERY;
  return Math.round((GOAL_VALUE * Math.min(1, Math.pow(month / months, 1.7))) / 1000) * 1000;
}

export function nextReviewWeek(s: Startup): number {
  return Math.ceil(s.week / REVIEW_EVERY) * REVIEW_EVERY;
}

/** Advice for the last week, like the assistant in the main game. */
export function lesson(s: Startup): { tone: 'good' | 'warn' | 'bad'; text: string } | null {
  const r = s.last;
  const e = econOf(s);
  if (!r) return null;
  if (unitMargin(s) <= 0) return { tone: 'bad', text: `You lose money on every ${e.unit}: price ${money(s.price)} is below the cost of ${money(s.price - unitMargin(s))}. Raise the price.` };
  if (runway(s) < 6) return { tone: 'bad', text: `Only about ${Math.floor(runway(s))} weeks of cash left. Cut spending, take side work or borrow.` };
  if (!s.launched) {
    if (s.progress >= 100) return { tone: 'good', text: 'The product is ready. Launch when your hype (people reached) is high.' };
    return { tone: 'warn', text: `Building: ${Math.round(s.progress)}%. More people and R&D finish it faster. Marketing now builds hype for launch.` };
  }
  if (e.model !== 'copies' && r.demand > r.capacity * 1.08) return { tone: 'warn', text: `Sold out: customers wanted ${Math.round(r.demand)} ${e.units} but you can only handle ${Math.round(r.capacity)}. Raise the price or hire.` };
  if (e.model !== 'copies' && r.capacity > r.demand * 1.6 && s.team > 1) return { tone: 'warn', text: `Your team is idle: you could handle ${Math.round(r.capacity)} ${e.units} but sold ${Math.round(r.sold)}. Market more, cut the price, or let someone go.` };
  if (e.model === 'copies' && s.novelty < 0.45) return { tone: 'warn', text: 'Sales are fading. Spend on R&D to ship updates and bring players back.' };
  if (r.profit < 0) return { tone: 'warn', text: `You lost ${money(-r.profit)} this week. Costs: wages ${money(r.wages)}, marketing ${money(r.marketing)}, R&D ${money(r.rd)}.` };
  return { tone: 'good', text: `Profit ${money(r.profit)} this week. Margin per ${e.unit}: ${money(unitMargin(s))}.` };
}

// ---------------------------------------------------------------- levers (commands)

export function setPrice(s: Startup, price: number) {
  const e = econOf(s);
  s.price = Math.max(e.ref * 0.4, Math.min(e.ref * 2.5, price));
}
export function setMarketing(s: Startup, v: number) { s.marketing = Math.max(0, Math.min(10_000, Math.round(v))); }
export function setRd(s: Startup, v: number) { s.rd = Math.max(0, Math.min(10_000, Math.round(v))); }
export function setSide(s: Startup, on: boolean) { s.side = on; }

export function hire(s: Startup): boolean {
  if (s.team >= 12) return false;
  const c = hireCost(s);
  if (s.cash < c) return false;
  s.cash -= c;
  s.team += 1;
  say(s, `Hired person #${s.team} (one week of pay to recruit).`, 'neutral', -c);
  return true;
}

export function fire(s: Startup): boolean {
  if (s.team <= 1) return false;
  const c = econOf(s).salary;
  s.cash -= c;
  s.team -= 1;
  s.quality = Math.max(0.2, s.quality - 0.02);
  say(s, `Let one person go (one week of severance). Team mood dips.`, 'neutral', -c);
  return true;
}

export function borrow(s: Startup, amount: number): boolean {
  const room = bankLimit(s) - s.debt;
  const a = Math.min(amount, room);
  if (a < 1000) return false;
  s.debt += a;
  s.cash += a;
  say(s, `Borrowed ${money(a)} from the bank (${(WEEKLY_RATE * 100).toFixed(1)}% a week).`, 'neutral', a);
  return true;
}

export function repay(s: Startup, amount: number): boolean {
  const a = Math.min(amount, s.debt, Math.max(0, s.cash));
  if (a < 1) return false;
  s.debt -= a;
  s.cash -= a;
  say(s, `Paid back ${money(a)} of loans.`, 'neutral', -a);
  return true;
}

export function launch(s: Startup): boolean {
  if (s.launched || s.progress < 100) return false;
  s.launched = true;
  const e = econOf(s);
  if (e.model === 'copies') {
    s.novelty = 1;
    say(s, `Launched! ${Math.round(s.reach).toLocaleString()} people heard about it before launch.`, 'good');
  } else {
    const first = Math.round(s.reach * e.buyRate * 3 * (0.5 + s.quality));
    s.customers = first;
    say(s, `Launched! ${first} ${first === 1 ? e.unit : e.units} sign up in the first week.`, 'good');
  }
  return true;
}

// ---------------------------------------------------------------- the week

export function playWeek(s: Startup): void {
  if (s.stage !== 'run' || s.event) return;
  const e = econOf(s);
  const r = s.rng;
  const work = s.side ? 0.5 : 1;

  // Marketing brings new people (with diminishing returns); people slowly forget you
  const reached = e.reachCost > 0 ? Math.pow(s.marketing / e.reachCost, 0.9) : 0;
  const forget = !s.launched && e.model === 'copies' ? 0.015 : 0.08;
  s.reach = s.reach * (1 - forget) + reached;

  // R&D raises quality toward a target; before launch it also builds the product
  const qTarget = 0.35 + 0.6 * (s.rd / (s.rd + e.rdHalf));
  s.quality += (qTarget - s.quality) * 0.12;
  if (!s.launched) {
    s.progress = Math.min(100, s.progress + (s.team * e.teamPoints * work + s.rd / e.rdPerPoint) * (0.8 + 0.4 * s.quality) * range(r, 0.85, 1.15));
  } else if (e.model === 'copies') {
    s.novelty = Math.min(1, s.novelty * 0.9 + s.rd / 40_000);
  }

  const priceF = Math.pow(s.price / e.ref, -e.elasticity);
  const qualF = 0.5 + s.quality;
  const capacity = capacityOf(s);
  let demand = 0, sold = 0, revenue = 0, newC = 0, lost = 0;
  if (s.launched) {
    if (e.model === 'hours') {
      demand = s.reach * e.buyRate * priceF * qualF * range(r, 0.9, 1.1);
      sold = Math.min(demand, capacity);
      revenue = sold * s.price;
      s.reach += sold * s.quality * 0.25; // happy clients tell others
    } else if (e.model === 'subs') {
      newC = s.reach * e.buyRate * priceF * qualF * range(r, 0.85, 1.15);
      const churn = e.churn * (1.6 - s.quality) * Math.pow(s.price / e.ref, 2);
      lost = s.customers * churn;
      s.customers = Math.max(0, s.customers - lost + newC);
      demand = s.customers;
      // customers you cannot support get poor service and many leave
      if (s.customers > capacity) {
        const angry = (s.customers - capacity) * 0.25;
        s.customers -= angry;
        lost += angry;
      }
      sold = Math.min(s.customers, capacity);
      revenue = sold * s.price;
      s.reach += sold * s.quality * 0.08;
    } else {
      demand = s.reach * e.buyRate * priceF * qualF * s.novelty * range(r, 0.85, 1.15);
      sold = demand;
      revenue = sold * s.price;
      s.reach = Math.max(0, s.reach - sold * 0.6) + sold * s.quality * 0.3; // buyers stop being prospects, some tell friends
      s.novelty *= 0.94;
    }
  }

  // Side work: cash now, half the team this week
  let side = 0;
  if (s.side) {
    if (s.idea === 'energy') {
      if (s.grantCooldown <= 0) {
        s.grantCooldown = 4;
        if (chance(r, 0.45)) { side = Math.round(range(r, 20_000, 40_000)); say(s, `Grant approved: ${money(side)}!`, 'good', side); }
        else say(s, 'Grant rejected. You can apply again in 4 weeks.', 'bad');
      }
    } else {
      side = Math.round(e.sidePay * (0.6 + 0.4 * s.team) * range(r, 0.8, 1.2));
      say(s, `${IDEAS[s.idea].side[0]}: ${money(side)}.`, 'good', side);
    }
  }
  if (s.grantCooldown > 0) s.grantCooldown -= 1;

  const wages = (s.team - 1) * e.salary;
  const variable = sold * e.varCost + revenue * e.varShare;
  const interest = s.debt * WEEKLY_RATE;
  // Operating profit (side work is extra cash, not part of the business, so it does not raise the value)
  const profit = revenue - wages - e.rent - variable - s.marketing - s.rd - interest;
  const rep: WeekReport = { week: s.week, demand, capacity: capacity === Infinity ? demand : capacity, sold, revenue, wages, rent: e.rent, variable, marketing: s.marketing, rd: s.rd, interest, side, profit, newCustomers: newC, lost };
  s.cash += profit + side;
  s.last = rep;
  s.hist.push(rep);
  if (s.hist.length > 26) s.hist.shift();

  // Out of cash: the bank covers what it can, then the investor, once
  if (s.cash < 0) {
    const need = -s.cash + 2000;
    const room = bankLimit(s) - s.debt;
    if (room >= need) {
      s.debt += need; s.cash += need;
      say(s, `Cash ran out: the bank lent you ${money(need)} automatically.`, 'bad', need);
    } else if (!s.rescued) {
      s.event = {
        id: 'rescue', title: 'Out of cash',
        body: `The bank will not lend more. ${INVESTORS[s.investor].name} offers ${money(RESCUE_CASH)} for a bigger share (${Math.round(RESCUE_PCT * 100)}%) and loses a lot of trust in you. Your payout at the end drops to ${money(RESCUE_PAYOUT)}.`,
        choices: [{ id: 'accept', label: `Take ${money(RESCUE_CASH)}`, detail: `Trust −30 · investor owns ${Math.round(RESCUE_PCT * 100)}%` }, { id: 'quit', label: 'Shut down', detail: 'Start over' }],
      };
    } else {
      s.stage = 'lost'; s.lostReason = 'bust';
      say(s, `${s.name} ran out of cash again and shut down.`, 'bad');
    }
  }

  s.values.push(value(s));
  if (s.values.length > 80) s.values.shift();

  if (s.stage === 'run' && value(s) >= GOAL_VALUE) {
    s.stage = 'won';
    say(s, `${s.name} is worth ${money(value(s))}. Goal reached!`, 'good');
    return;
  }
  if (s.stage === 'run' && s.week % REVIEW_EVERY === 0) review(s);
  if (s.stage === 'run' && s.week >= DEADLINE_WEEK) {
    s.stage = 'lost'; s.lostReason = 'deadline';
    say(s, `Week ${DEADLINE_WEEK}: ${INVESTORS[s.investor].name} ran out of patience and sold ${s.name} for parts.`, 'bad');
    return;
  }
  s.week += 1;
  if (s.stage === 'run' && !s.event && !s.reviews.some((v) => !v.seen) && chance(r, 0.18)) s.event = makeEvent(s);
}

/** The investor's own rule, checked at the next review (also shown live on the dashboard). */
export function ruleCheck(s: Startup): { ok: boolean; text: string } {
  const month = nextReviewWeek(s) / REVIEW_EVERY;
  let ok = true;
  let text = '';
  if (s.investor === 'harbor') {
    const p = avg(s, 'profit');
    ok = month < 3 || p >= 0;
    text = month < 3 ? `Profit rule starts in month 3 (now ${money(p * 4)})` : `Profit (last 4 weeks): ${money(p * 4)}`;
  } else if (s.investor === 'quinn') {
    if (!s.launched) {
      const gained = s.progress - s.checkProgress;
      ok = gained >= 15 || s.progress >= 100;
      text = `Product progress this month: +${Math.round(gained)}%`;
    } else if (s.checkValue <= 0) {
      ok = true;
      text = 'First month after launch: growth is checked from next month';
    } else {
      const g = value(s) / s.checkValue - 1;
      ok = g >= 0.05;
      text = `Value growth this month: ${g >= 0 ? '+' : ''}${Math.round(g * 100)}%`;
    }
  } else {
    const rw = runway(s);
    ok = rw >= 8;
    text = rw === Infinity ? 'Profitable: runway is not a worry' : `Runway: ${Math.floor(rw)} weeks of cash`;
  }
  return { ok, text };
}

/** Monthly investor review: the value target plus the investor's own rule. */
function review(s: Startup): void {
  const month = s.week / REVIEW_EVERY;
  const target = targetFor(month);
  const v = value(s);
  const valueOk = v >= target;
  const rev = avg(s, 'revenue');
  const { ok: ruleOk, text: ruleText } = ruleCheck(s);
  s.checkRev = s.launched ? rev : 0;
  s.checkValue = s.launched ? value(s) : 0;
  s.checkProgress = s.progress;
  const inv = INVESTORS[s.investor];
  const first = inv.name.split(' ')[0];
  let delta = 0;
  if (valueOk && ruleOk) delta = 10;
  else delta = (valueOk ? 0 : -15) + (ruleOk ? 0 : -15);
  s.trust = Math.max(0, Math.min(100, s.trust + delta));
  let message: string;
  if (valueOk && ruleOk) message = pick(s.rng, ['Good month. Keep this pace.', 'On track. Do not get comfortable.', 'Numbers look right. Next month I expect more.']);
  else if (!valueOk && !ruleOk) message = `Two misses. ${ruleHint(s)} And the company is worth ${money(v)}, I expected ${money(target)}.`;
  else if (!valueOk) message = `You are behind: worth ${money(v)}, I expected ${money(target)}. ${valueHint(s)}`;
  else message = `${ruleHint(s)} You agreed to my rule: ${inv.rule.toLowerCase()}`;
  if (s.trust <= 0) {
    s.stage = 'lost'; s.lostReason = 'fired';
    message = `${first} has lost all trust and replaces you as CEO. ${s.name} goes on without you.`;
    say(s, message, 'bad');
  } else if (s.trust < 30 && !(valueOk && ruleOk)) message += ' This is your last warning.';
  s.reviews.push({ month, target, value: v, valueOk, ruleOk, ruleText, trust: s.trust, message, seen: false });
  say(s, `Month ${month} review: ${valueOk && ruleOk ? 'passed' : 'missed'}. Trust ${s.trust}.`, valueOk && ruleOk ? 'good' : 'bad');
}

function ruleHint(s: Startup): string {
  if (s.investor === 'harbor') return 'You are losing money. Cut costs or raise prices.';
  if (s.investor === 'quinn') return s.launched ? 'The company did not grow enough. Grow sales and profit.' : 'The product is moving too slowly. More people or more R&D.';
  return 'You are too close to running out of cash. Cut spending or bring in money.';
}

function valueHint(s: Startup): string {
  const p = avg(s, 'profit');
  if (!s.launched) return 'Finish the product.';
  if (p < 0) return `A year of profit counts ${econOf(s).profitMult} times in the value: losses kill it.`;
  return 'Grow sales and profit.';
}

export function seeReview(s: Startup): void {
  for (const r of s.reviews) r.seen = true;
}

// ---------------------------------------------------------------- events

const EVENTS: { id: string; when?: (s: Startup) => boolean; make: (s: Startup) => StartupEvent }[] = [
  {
    id: 'rush', make: (s) => ({ id: 'rush', title: 'A big client wants a rush job', body: 'Good money now, but the team drops other work for a week.',
      choices: [{ id: 'yes', label: `Take it (+${money(2500 + 1500 * s.team)})`, detail: 'Lose some reach and progress' }, { id: 'no', label: 'Say no', detail: 'Stay focused' }] }),
  },
  {
    id: 'laptop', make: () => ({ id: 'laptop', title: 'Your main computer died', body: 'Work is stuck until you fix it.',
      choices: [{ id: 'buy', label: 'Buy a new one (−$2K)', detail: 'No delay' }, { id: 'wait', label: 'Make do', detail: 'Quality and progress drop' }] }),
  },
  {
    id: 'press', make: () => ({ id: 'press', title: 'A tech blog wants an interview', body: 'Free publicity, if you have the time.',
      choices: [{ id: 'yes', label: 'Do the interview', detail: 'Reach +25%' }, { id: 'no', label: 'Too busy', detail: 'Nothing happens' }] }),
  },
  {
    id: 'raise', when: (s) => s.team >= 2, make: (s) => ({ id: 'raise', title: 'Your best person asks for a raise', body: 'They have another offer.',
      choices: [{ id: 'pay', label: `Pay a bonus (−${money(econOf(s).salary * 2)})`, detail: 'They stay' }, { id: 'no', label: 'Say no', detail: '50% chance they leave' }] }),
  },
  {
    id: 'copy', when: (s) => s.launched, make: () => ({ id: 'copy', title: 'A rival copies you and charges less', body: 'Customers are tempted by the cheaper copy.',
      choices: [{ id: 'price', label: 'Match them: price −10%', detail: 'Keep customers, earn less each' }, { id: 'quality', label: 'Win on quality', detail: 'Quality up, lose some customers' }] }),
  },
  {
    id: 'bug', when: (s) => s.launched && s.idea !== 'freelance', make: () => ({ id: 'bug', title: 'A nasty bug!', body: 'Customers are complaining.',
      choices: [{ id: 'fix', label: 'Fix it now (−$3K)', detail: 'Safe' }, { id: 'ship', label: 'Ignore it', detail: 'Quality drops, some leave' }] }),
  },
  {
    id: 'accel', when: (s) => s.week < 30, make: () => ({ id: 'accel', title: 'An accelerator invites you', body: 'They pay $15K for you to join their workshops.',
      choices: [{ id: 'yes', label: 'Join (+$15K)', detail: 'Progress and reach slow a little' }, { id: 'no', label: 'Skip it', detail: 'Stay focused' }] }),
  },
  {
    id: 'streamer', when: (s) => s.idea === 'gaming', make: () => ({ id: 'streamer', title: 'A famous streamer shows your game', body: 'Millions of viewers see it.',
      choices: [{ id: 'yes', label: 'Send them a thank-you pack (−$1K)', detail: 'Reach +60%' }, { id: 'no', label: 'Just enjoy it', detail: 'Reach +35%' }] }),
  },
  {
    id: 'gpu', when: (s) => s.idea === 'ai' && s.launched, make: () => ({ id: 'gpu', title: 'Computing prices jump', body: 'Your cloud bill will be much higher for a while.',
      choices: [{ id: 'buy', label: 'Buy your own servers (−$12K)', detail: 'No extra costs' }, { id: 'pay', label: 'Pay the higher bills', detail: '−$1.5K a week for 6 weeks' }] }),
  },
];

function makeEvent(s: Startup): StartupEvent {
  return pick(s.rng, EVENTS.filter((x) => !x.when || x.when(s))).make(s);
}

export function answerEvent(s: Startup, choice: string): void {
  const ev = s.event;
  if (!ev) return;
  s.event = undefined;
  const e = econOf(s);
  switch (`${ev.id}:${choice}`) {
    case 'rescue:accept':
      s.rescued = true; s.investorPct = RESCUE_PCT; s.cash += RESCUE_CASH; s.trust = Math.max(5, s.trust - 30);
      say(s, `${INVESTORS[s.investor].name} puts in ${money(RESCUE_CASH)} more and now owns ${Math.round(RESCUE_PCT * 100)}%.`, 'bad', RESCUE_CASH); break;
    case 'rescue:quit': s.stage = 'lost'; s.lostReason = 'quit'; say(s, `${s.name} shuts down.`, 'bad'); break;
    case 'rush:yes': { const p = 2500 + 1500 * s.team; s.cash += p; s.reach *= 0.92; s.progress = Math.max(0, s.progress - 4); say(s, `Rush job done: ${money(p)}.`, 'good', p); break; }
    case 'laptop:buy': s.cash -= 2000; say(s, 'New computer bought.', 'neutral', -2000); break;
    case 'laptop:wait': s.progress = Math.max(0, s.progress - 6); s.quality = Math.max(0.2, s.quality - 0.03); say(s, 'A slow week on an old machine.', 'bad'); break;
    case 'press:yes': s.reach *= 1.25; say(s, 'The article brings new people.', 'good'); break;
    case 'raise:pay': s.cash -= e.salary * 2; say(s, 'Bonus paid. They stay.', 'neutral', -e.salary * 2); break;
    case 'raise:no': if (chance(s.rng, 0.5)) { s.team = Math.max(1, s.team - 1); say(s, 'They took the other offer and left.', 'bad'); } else say(s, 'They grumble, but stay.'); break;
    case 'copy:price': s.price *= 0.9; say(s, 'Price cut 10% to match the copy.', 'neutral'); break;
    case 'copy:quality': s.quality = Math.min(1, s.quality + 0.05); s.customers *= 0.85; s.reach *= 0.9; say(s, 'Some customers try the copy. Your product gets better.', 'neutral'); break;
    case 'bug:fix': s.cash -= 3000; say(s, 'Bug fixed fast.', 'neutral', -3000); break;
    case 'bug:ship': s.quality = Math.max(0.2, s.quality - 0.08); s.customers *= 0.9; say(s, 'Reviews mention the bug.', 'bad'); break;
    case 'accel:yes': s.cash += 15_000; s.progress = Math.max(0, s.progress - 3); s.reach *= 0.95; say(s, 'Accelerator joined: +$15K.', 'good', 15_000); break;
    case 'streamer:yes': s.cash -= 1000; s.reach *= 1.6; say(s, 'Players pour in!', 'good', -1000); break;
    case 'streamer:no': s.reach *= 1.35; say(s, 'Some new players find you.', 'good'); break;
    case 'gpu:buy': s.cash -= 12_000; say(s, 'You buy your own servers.', 'neutral', -12_000); break;
    case 'gpu:pay': s.cash -= 9000; say(s, 'Higher cloud bills: about $9K over 6 weeks.', 'bad', -9000); break;
    default: say(s, 'You let it pass.');
  }
  if (s.stage === 'run' && value(s) >= GOAL_VALUE) { s.stage = 'won'; say(s, `${s.name} is worth ${money(value(s))}. Goal reached!`, 'good'); }
}

// ---------------------------------------------------------------- exit

export function payout(s: Startup): number {
  return s.rescued ? RESCUE_PAYOUT : PAYOUT;
}

/** How big the investor grows the company after buying it (for the story screen). */
export function bigValuation(s: Startup): number {
  const h = (s.name.length * 7919 + s.week * 104729) % 1000;
  return (1.5 + (h / 1000) * 6) * 1e9;
}

export const STARTUP_TRAIT_HINT: Record<IdeaId, TraitId> = { chips: 'ops', gaming: 'deals', energy: 'raw', freelance: 'finance', ai: 'stocks' };

// ---------------- after the exit: pick an existing company ----------------

export interface StarterOffer { good: GoodId; name: string; price: number; pitch: string }

const STARTER_NAMES: Partial<Record<GoodId, string[]>> = {
  grain: ['Golden Acre Farms', 'Riverbend Grain', 'Hillside Harvest'],
  iron_ore: ['Red Rock Mining', 'Copperline Ore', 'Deepvale Mine'],
  timber: ['Pinewood Timber', 'Northfork Lumber', 'Cedar Ridge Logging'],
  software: ['Bytecraft Software', 'Pixel Forge Apps', 'Cloudlet Labs'],
  clothing: ['Threadline Apparel', 'Urban Stitch', 'Bluebird Clothing'],
  plastics: ['Polyform Plastics', 'Clearcast Materials', 'Mouldwell Plastics'],
};

export const STARTER_GOODS: GoodId[] = ['grain', 'iron_ore', 'timber', 'software', 'clothing', 'plastics'];

export function starterOffers(seed: number): StarterOffer[] {
  const r = createRng(seed ^ 0x5eed);
  return STARTER_GOODS.map((g) => {
    const names = STARTER_NAMES[g]!;
    const name = names[Math.floor(next(r) * names.length)];
    const price = Math.round((startCost(g) * 1.15) / 1000) * 1000;
    const def = GOODS[g];
    const pitch = def.tier === 'raw' ? 'Raw materials: sells to factories. No inputs to buy.' : `Makes ${def.name.toLowerCase()} from ${def.inputs.map((i) => GOODS[i.good].name.toLowerCase()).join(', ')}.`;
    return { good: g, name, price, pitch };
  });
}

/** Everything the main game needs from the new-game setup. */
export interface GameSetup {
  traits: TraitId[];
  starter?: { good: GoodId; name: string; price: number };
  startup?: { idea: string; name: string; investor: string; payout: number; valuation: number };
}

