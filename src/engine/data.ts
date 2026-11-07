import type { GoodDef, GoodId, IndustryDef, IndustryId, Personality } from './types';

export const SAVE_VERSION = 3;

export const INDUSTRIES: Record<IndustryId, IndustryDef> = {
  resources: { id: 'resources', name: 'Resources', salary: 240, rdK: 5 },
  energy: { id: 'energy', name: 'Energy', salary: 320, rdK: 5 },
  manufacturing: { id: 'manufacturing', name: 'Manufacturing', salary: 260, rdK: 6 },
  tech: { id: 'tech', name: 'Technology', salary: 420, rdK: 10 },
  retail: { id: 'retail', name: 'Retail', salary: 160, rdK: 6 },
  finance: { id: 'finance', name: 'Finance', salary: 460, rdK: 6 },
  health: { id: 'health', name: 'Healthcare', salary: 380, rdK: 8 },
  services: { id: 'services', name: 'Services', salary: 200, rdK: 4 },
};

export const INDUSTRY_IDS = Object.keys(INDUSTRIES) as IndustryId[];

/** Variable costs (inputs + other + labour) are this share of the reference price at level 1. */
const VAR_SHARE = 0.58;
/** Fixed costs are this share of revenue for a level-1 company at full capacity. */
const FIXED_SHARE = 0.2;
/** A level-1 company's full-capacity daily revenue is foundCost / this. */
const REVENUE_DAYS = 16;
const PRODUCTIVITY_AT_START = 0.975; // productivity factor at morale 0.75

type Spec = Omit<GoodDef, 'p0' | 'baseCapacity' | 'baseFixed'>;
const g = (
  id: GoodId, name: string, industry: IndustryId, tier: GoodDef['tier'], unit: string, inputs: [GoodId, number][], vc: number,
  unitsPerWorker: number, d0: number, elasticity: number, switchElasticity: number, foundCost: number, blurb: string,
): Spec => ({ id, name, industry, tier, unit, inputs: inputs.map(([good, qty]) => ({ good, qty })), vc, unitsPerWorker, d0, elasticity, switchElasticity, foundCost, blurb });

/** Listed in dependency order: every input appears before the goods that use it. */
const SPECS: Spec[] = [
  g('iron_ore', 'Iron Ore', 'resources', 'raw', 't', [], 6, 30, 40_000, 0.6, 3.5, 120_000, 'Dug from mines. Steel mills need 2 t for every tonne of steel.'),
  g('grain', 'Grain', 'resources', 'raw', 't', [], 3, 40, 30_000, 0.5, 3.5, 90_000, 'Farmed crops. The main input for packaged food.'),
  g('cotton', 'Cotton', 'resources', 'raw', 'bales', [], 4, 30, 20_000, 0.6, 3.5, 100_000, 'Grown on farms. Clothing makers turn it into garments.'),
  g('silicon', 'Silicon', 'resources', 'raw', 'kg', [], 8, 20, 10_000, 0.6, 3.2, 140_000, 'Refined sand. Every computer chip starts here.'),
  g('timber', 'Timber', 'resources', 'raw', 't', [], 4, 30, 15_000, 0.6, 3.5, 100_000, 'Logged from forests. Furniture makers need it.'),
  g('crude_oil', 'Crude Oil', 'energy', 'raw', 'bbl', [], 10, 26, 60_000, 0.4, 4, 220_000, 'Pumped from wells. Feeds power plants and plastics. Swings with world oil prices.'),
  g('electricity', 'Electricity', 'energy', 'material', 'MWh', [['crude_oil', 0.3]], 4, 40, 300_000, 0.4, 3.5, 180_000, 'Power for homes and almost every factory.'),
  g('plastics', 'Plastics', 'energy', 'material', 't', [['crude_oil', 1]], 3, 30, 10_000, 0.7, 3, 160_000, 'Made from oil. Used in phones, cars, appliances and packaging.'),
  g('chemicals', 'Chemicals', 'energy', 'material', 't', [['crude_oil', 0.6], ['electricity', 0.3]], 4, 22, 6_000, 0.7, 3, 180_000, 'Refined from oil. Medicine makers depend on them.'),
  g('glass', 'Glass', 'manufacturing', 'material', 't', [['silicon', 0.8], ['electricity', 0.6]], 3, 24, 5_000, 0.7, 3, 150_000, 'Melted from silicon sand. Laptop screens and windows.'),
  g('freight', 'Freight', 'services', 'material', 'loads', [['crude_oil', 0.3], ['electricity', 0.1]], 6, 10, 15_000, 0.5, 3, 150_000, 'A service: trucks and warehouses that deliver for shops and factories.'),
  g('steel', 'Steel', 'manufacturing', 'material', 't', [['iron_ore', 2], ['electricity', 0.5]], 4, 20, 10_000, 0.8, 3, 200_000, 'Smelted from iron ore. Car and appliance makers depend on it.'),
  g('chips', 'Chips', 'tech', 'material', 'boxes', [['silicon', 1], ['electricity', 0.3]], 5, 12, 5_000, 0.9, 2.6, 260_000, 'Computer chips. Phones, cars and appliances all need them.'),
  g('cars', 'Cars', 'manufacturing', 'product', 'cars', [['steel', 1.5], ['plastics', 0.5], ['chips', 2]], 30, 1.2, 8_000, 1.2, 2.2, 320_000, 'Big-ticket product. Needs steel, plastics and chips.'),
  g('appliances', 'Appliances', 'manufacturing', 'product', 'units', [['steel', 0.5], ['plastics', 0.3], ['chips', 0.5]], 8, 4, 25_000, 1.1, 2.4, 180_000, 'Fridges and washing machines for every home.'),
  g('phones', 'Phones', 'tech', 'product', 'phones', [['chips', 1], ['plastics', 0.2]], 10, 8, 40_000, 1.2, 2.2, 240_000, 'Everyone wants the latest one. Brand and quality matter a lot.'),
  g('software', 'Software', 'tech', 'product', 'licences', [['electricity', 0.2]], 2, 6, 80_000, 1.0, 2.0, 120_000, 'Apps and services. Almost no materials, mostly skilled staff.'),
  g('food', 'Groceries', 'retail', 'product', 'baskets', [['grain', 2], ['plastics', 0.05], ['electricity', 0.05]], 2, 50, 400_000, 0.5, 3, 110_000, 'Supermarkets selling packaged food. Huge, steady demand.'),
  g('clothing', 'Fashion', 'retail', 'product', 'items', [['cotton', 1.5]], 3, 20, 200_000, 1.1, 2.6, 120_000, 'Clothing stores. Shoppers follow trends and prices.'),
  g('furniture', 'Furniture', 'manufacturing', 'product', 'pieces', [['timber', 0.5], ['plastics', 0.05], ['freight', 0.1]], 6, 5, 30_000, 1.1, 2.4, 170_000, 'Sofas, tables and beds. Needs timber and deliveries.'),
  g('laptops', 'Laptops', 'tech', 'product', 'laptops', [['chips', 3], ['plastics', 0.3], ['glass', 0.05], ['freight', 0.05]], 15, 4, 15_000, 1.2, 2.2, 280_000, 'Work and play machines. They need lots of chips.'),
  g('medicine', 'Medicine', 'health', 'product', 'packs', [['chemicals', 0.3], ['plastics', 0.05], ['freight', 0.02]], 4, 25, 120_000, 0.3, 2.4, 220_000, 'Drug makers. People buy it in good times and bad, and clinics need it too.'),
  g('telecom', 'Mobile Network', 'tech', 'product', 'plans', [['electricity', 0.1], ['chips', 0.02]], 3, 40, 150_000, 0.6, 1.9, 240_000, 'A service: phone and internet plans with loyal monthly customers.'),
  g('clinics', 'Clinics', 'health', 'product', 'visits', [['medicine', 1], ['electricity', 0.05]], 5, 6, 60_000, 0.4, 2.0, 200_000, 'A service: doctors and clinics. Needs medicine and skilled staff.'),
  g('banking', 'Banking', 'finance', 'product', 'accounts', [['electricity', 0.05]], 8, 18, 160_000, 0.9, 1.8, 200_000, 'Accounts and loans. Loyal customers and low material costs.'),
];

function derive(): Record<GoodId, GoodDef> {
  const out = {} as Record<GoodId, GoodDef>;
  for (const sp of SPECS) {
    const inputCost = sp.inputs.reduce((s, i) => s + i.qty * out[i.good].p0, 0);
    const labour = INDUSTRIES[sp.industry].salary / (sp.unitsPerWorker * PRODUCTIVITY_AT_START);
    const p0 = (inputCost + sp.vc + labour) / VAR_SHARE;
    const baseCapacity = sp.foundCost / (REVENUE_DAYS * p0);
    out[sp.id] = { ...sp, p0, baseCapacity, baseFixed: FIXED_SHARE * p0 * baseCapacity };
  }
  return out;
}

export const GOODS: Record<GoodId, GoodDef> = derive();
export const GOOD_IDS = SPECS.map((s) => s.id);
export const goodsOf = (ind: IndustryId) => GOOD_IDS.filter((id) => GOODS[id].industry === ind);
/** Which goods use this good as an input. */
export const usedBy = (good: GoodId) => GOOD_IDS.filter((id) => GOODS[id].inputs.some((i) => i.good === good));

/** Importers always sell, at a premium over the reference price. */
export const IMPORT_PREMIUM = 1.3;

/** Capacity multiplier per level above 1 */
export const LEVEL_CAP_MULT = 1.7;
export const LEVEL_FIXED_MULT = 1.45;
export const MAX_LEVEL = 25;
/** Each upgrade of a player company costs this much more than the one before */
export const UPGRADE_COST_GROWTH = 1.75;
/**
 * AI companies keep the steeper curve the economy was calibrated on: their capex feeds GDP and
 * their book assets set share prices, so cheaper AI upgrades would shrink demand everywhere.
 */
export const AI_UPGRADE_COST_GROWTH = 2.3;

/**
 * Opening a bank needs $10M: the branch costs the usual founding price, and the rest is required
 * capital. It stays inside the bank (you cannot withdraw it or pay it out) and lets the bank lend.
 */
export const BANK_START = 10_000_000;

/**
 * What a new plant costs you, as a multiple of its base price (land, permits, equipment). Set so a
 * new level-1 company in a normal market earns its price back in about 6 months, whichever product
 * it makes: easy, high-margin businesses (ores, appliances, cars) cost the most to get into.
 */
export const START_MULT: Partial<Record<GoodId, number>> = {
  iron_ore: 1.65, grain: 1.5, cotton: 1.55, silicon: 1.85, timber: 1.55, crude_oil: 1.85,
  electricity: 1.45, plastics: 1.35, chemicals: 1.45, glass: 1.45, freight: 1.35, steel: 1.65, chips: 1.5,
  cars: 1.7, appliances: 1.9, phones: 1.5, software: 1.1, food: 1.2, clothing: 1.1, furniture: 1.7,
  laptops: 1.45, medicine: 1.55, telecom: 1.55, clinics: 1.35,
};

/** What you pay to found a company of this good (not counting any industry licence). */
export function startCost(good: GoodId): number {
  if (good === 'banking') return Math.max(BANK_START, GOODS[good].foundCost);
  return Math.round((GOODS[good].foundCost * (START_MULT[good] ?? 1.3)) / 1000) * 1000;
}

/** Capital a newly founded company must keep (banks only). */
export function requiredCapital(good: GoodId): number {
  return good === 'banking' ? startCost(good) - GOODS[good].foundCost : 0;
}

/**
 * Your upgrades start at 1.4x the plant's base price for level 2 (AI firms pay 0.9x), then each level
 * costs 1.75x the last. Growing one plant is a real investment, not a quick win.
 */
export const PLAYER_UPGRADE_BASE = 1.4;
export const AI_UPGRADE_BASE = 0.9;

export function upgradeCost(good: GoodId, level: number, growth = UPGRADE_COST_GROWTH, base = growth === AI_UPGRADE_COST_GROWTH ? AI_UPGRADE_BASE : PLAYER_UPGRADE_BASE): number {
  return Math.round(GOODS[good].foundCost * base * Math.pow(growth, level - 2));
}

/**
 * Industry licences, paid to the government. Your first industry is free; each further one costs its
 * base fee, plus 50% more for every licence you already hold beyond the first.
 */
export const LICENCE_FEE: Record<IndustryId, number> = {
  resources: 200_000, retail: 200_000, services: 250_000, energy: 350_000,
  manufacturing: 400_000, tech: 600_000, health: 600_000, finance: 1_000_000,
};

export function capacityAt(good: GoodId, level: number): number {
  return GOODS[good].baseCapacity * Math.pow(LEVEL_CAP_MULT, level - 1);
}

export function fixedAt(good: GoodId, level: number): number {
  return GOODS[good].baseFixed * Math.pow(LEVEL_FIXED_MULT, level - 1);
}

/** Listed AI companies: [name, ticker, good, size weight] */
export const AI_COMPANIES: [string, string, GoodId, number][] = [
  ['Redrock Mining', 'RRM', 'iron_ore', 12],
  ['Granite Peak Minerals', 'GPM', 'iron_ore', 9],
  ['Goldfield Farms', 'GFF', 'grain', 12],
  ['Prairie Harvest', 'PHV', 'grain', 10],
  ['Southern Cotton Co', 'SCC', 'cotton', 10],
  ['Crystal Sands', 'CSD', 'silicon', 10],
  ['Terra Energy', 'TEN', 'crude_oil', 13],
  ['Summit Resources', 'SMR', 'crude_oil', 11],
  ['Blue Delta Power', 'BDP', 'electricity', 12],
  ['Northwind Grid', 'NWG', 'electricity', 10],
  ['Polymer United', 'PLU', 'plastics', 10],
  ['Kane Industries', 'KNE', 'steel', 13],
  ['Ironvale Works', 'IVW', 'steel', 10],
  ['Arcwire Labs', 'ARC', 'chips', 11],
  ['Lumen Systems', 'LUM', 'chips', 11],
  ['Halcyon Motors', 'HCM', 'cars', 12],
  ['Brassfield Home', 'BRF', 'appliances', 10],
  ['NovaTech', 'NTC', 'phones', 13],
  ['Quillbyte', 'QBT', 'software', 11],
  ['BrightMart', 'BRT', 'food', 13],
  ['Corner Pantry', 'CPN', 'food', 10],
  ['Harbor & Finch', 'HNF', 'clothing', 11],
  ['Urbanly', 'URB', 'clothing', 9],
  ['EverBank', 'EYB', 'banking', 13],
  ['Vale Capital', 'VLC', 'banking', 12],
  ['Astoria Mutual', 'ASM', 'banking', 10],
  ['Tallpine Timber', 'TPT', 'timber', 11],
  ['Cedar Ridge Forestry', 'CRF', 'timber', 9],
  ['Meridian Chemical', 'MCH', 'chemicals', 11],
  ['Clearview Glass', 'CVG', 'glass', 10],
  ['Swift Haul Logistics', 'SHL', 'freight', 11],
  ['Portside Freight', 'PSF', 'freight', 10],
  ['Oakhaven Furniture', 'OHF', 'furniture', 10],
  ['Vertex Computing', 'VTX', 'laptops', 11],
  ['Helix Pharma', 'HLX', 'medicine', 12],
  ['Cura Labs', 'CRL', 'medicine', 10],
  ['Skyline Telecom', 'SKT', 'telecom', 12],
  ['Wavelink Mobile', 'WVL', 'telecom', 10],
  ['Northside Health', 'NSH', 'clinics', 11],
  ['Crescent Care', 'CRC', 'clinics', 10],
];

export interface RivalDef {
  id: string;
  name: string;
  title: string;
  focus: IndustryId[];
  weakness: string;
  quote: string;
  flag: string;
  personality: Personality;
  cash: number;
  avatarColor: string;
  owns: string[]; // tickers with founding stakes
}

const p = (risk: number, aggression: number, patience: number, ambition: number, loyalty: number, negotiation: number, financial: number, political: number, ethics: number): Personality =>
  ({ risk, aggression, patience, ambition, loyalty, negotiation, financial, political, ethics });

export const RIVALS: RivalDef[] = [
  {
    id: 'kane', name: 'Victor Kane', title: 'The Aggressive Industrialist', focus: ['manufacturing', 'resources'],
    weakness: 'High leverage, and his car plant depends on his own steel', quote: "You're playing a small game, kid. I play for the empire.", flag: 'astoria',
    personality: p(0.85, 0.92, 0.34, 0.88, 0.4, 0.7, 0.6, 0.55, 0.3), cash: 900_000_000, avatarColor: '#c0392b', owns: ['KNE', 'RRM', 'HCM', 'CVG'],
  },
  {
    id: 'roth', name: 'Elena Roth', title: 'The Strategic Investor', focus: ['tech'],
    weakness: 'Avoids uncertain opportunities', quote: 'I invest in what the world will need in ten years.', flag: 'astoria',
    personality: p(0.25, 0.35, 0.9, 0.7, 0.7, 0.8, 0.9, 0.4, 0.75), cash: 1_200_000_000, avatarColor: '#2e86c1', owns: ['NTC', 'LUM', 'QBT', 'VTX', 'SKT'],
  },
  {
    id: 'vale', name: 'Marcus Vale', title: 'The Banking King', focus: ['finance'],
    weakness: 'Vulnerable to liquidity shocks', quote: "Everyone owes someone. Usually it's me.", flag: 'astoria',
    personality: p(0.6, 0.6, 0.6, 0.8, 0.5, 0.85, 0.95, 0.7, 0.45), cash: 1_000_000_000, avatarColor: '#7d3c98', owns: ['EYB', 'VLC'],
  },
  {
    id: 'okafor', name: 'Ada Okafor', title: 'The Oil Tycoon', focus: ['energy'],
    weakness: 'Exposed to oil price swings', quote: 'The world runs on what I pull out of the ground.', flag: 'astoria',
    personality: p(0.7, 0.55, 0.5, 0.75, 0.55, 0.65, 0.7, 0.6, 0.5), cash: 800_000_000, avatarColor: '#d68910', owns: ['TEN', 'SMR', 'PLU', 'MCH'],
  },
  {
    id: 'park', name: 'Daniel Park', title: 'The Retail Magnate', focus: ['retail'],
    weakness: 'Chases volume over margin; his stores need cheap grain and cotton', quote: 'Every household in Astoria is my customer.', flag: 'astoria',
    personality: p(0.5, 0.65, 0.45, 0.7, 0.6, 0.6, 0.55, 0.45, 0.6), cash: 700_000_000, avatarColor: '#229954', owns: ['BRT', 'HNF', 'GFF', 'OHF'],
  },
];

export const COUNTRIES = [
  { id: 'astoria', name: 'Republic of Astoria', identity: 'Developed economy', advantage: 'Finance and technology', unlocked: true },
  { id: 'bharatara', name: 'Bharatara', identity: 'Emerging economy', advantage: 'Manufacturing and workforce', unlocked: false },
  { id: 'nordland', name: 'Federation of Nordland', identity: 'Resource economy', advantage: 'Oil, gas and minerals', unlocked: false },
  { id: 'meridian', name: 'East Meridian', identity: 'Export powerhouse', advantage: 'Electronics and shipping', unlocked: false },
] as const;

export function xpForLevel(level: number): number {
  return Math.round(500 * Math.pow(level, 1.6));
}
