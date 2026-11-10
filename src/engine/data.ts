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
const FIXED_SHARE = 0.21;
/** A level-1 company's full-capacity daily revenue is foundCost / this. */
const REVENUE_DAYS = 16;
const PRODUCTIVITY_AT_START = 0.975; // productivity factor at morale 0.75
/** Regulated goods (hospitals, wellness) run on thin, steady margins: about 14% before interest and tax at full capacity, much less with empty beds. */
const REG_VAR_SHARE = 0.75;
const REG_FIXED_SHARE = 0.11;
/** Regulated goods can't be priced above the market price. */
export const REG_PRICE_CAP = 1;

type Spec = Omit<GoodDef, 'p0' | 'baseCapacity' | 'baseFixed'>;
const g = (
  id: GoodId, name: string, industry: IndustryId, tier: GoodDef['tier'], unit: string, inputs: [GoodId, number][], vc: number,
  unitsPerWorker: number, d0: number, elasticity: number, switchElasticity: number, foundCost: number, blurb: string,
  extra: Pick<Spec, 'reg' | 'permit'> = {},
): Spec => ({ id, name, industry, tier, unit, inputs: inputs.map(([good, qty]) => ({ good, qty })), vc, unitsPerWorker, d0, elasticity, switchElasticity, foundCost, blurb, ...extra });

/** Listed in dependency order: every input appears before the goods that use it. */
const SPECS: Spec[] = [
  // Raw materials
  g('iron_ore', 'Iron Ore', 'resources', 'raw', 't', [], 6, 30, 40_000, 0.6, 3.5, 120_000, 'Dug from mines. Steel mills need 2 t for every tonne of steel.'),
  g('grain', 'Grain', 'resources', 'raw', 't', [], 3, 40, 30_000, 0.5, 3.5, 90_000, 'Farmed crops. The main input for packaged food.'),
  g('cotton', 'Cotton', 'resources', 'raw', 'bales', [], 4, 30, 20_000, 0.6, 3.5, 100_000, 'Grown on farms. Clothing makers turn it into garments.'),
  g('silicon', 'Silicon', 'resources', 'raw', 'kg', [], 8, 20, 10_000, 0.6, 3.2, 140_000, 'Refined sand. Every computer chip starts here.'),
  g('timber', 'Timber', 'resources', 'raw', 't', [], 4, 30, 15_000, 0.6, 3.5, 100_000, 'Logged from forests. Furniture makers and builders need it.'),
  g('copper', 'Copper', 'resources', 'raw', 't', [], 10, 20, 15_000, 0.6, 3.3, 160_000, 'Mined copper. Wiring for cars, appliances, chips, batteries and phone networks.'),
  g('lithium', 'Lithium', 'resources', 'raw', 'kg', [], 14, 12, 4_000, 0.6, 3.2, 180_000, 'From salt flats and rock mines. The key metal in every battery.'),
  g('bauxite', 'Bauxite', 'resources', 'raw', 't', [], 5, 30, 8_000, 0.6, 3.5, 110_000, 'Red clay ore. Smelters turn 2 t of it into a tonne of aluminium.'),
  g('rare_earths', 'Rare Earths', 'resources', 'raw', 'kg', [], 20, 8, 2_000, 0.5, 3, 220_000, 'Scarce metals for magnets. Chips, robots, rockets and weapons need them.'),
  g('limestone', 'Limestone', 'resources', 'raw', 't', [], 2, 50, 10_000, 0.6, 3.5, 80_000, 'Quarried rock. Cement plants and steel mills use it.'),
  g('crude_oil', 'Crude Oil', 'energy', 'raw', 'bbl', [], 10, 26, 60_000, 0.4, 4, 220_000, 'Pumped from wells. Feeds power plants, plastics and airlines. Swings with world oil prices.'),
  g('natural_gas', 'Natural Gas', 'energy', 'raw', 'mcf', [], 8, 30, 80_000, 0.4, 4, 200_000, 'Pumped from gas fields. Fuels power plants, plastics, chemicals, cement and home heating.'),
  // Materials
  g('electricity', 'Electricity', 'energy', 'material', 'MWh', [['crude_oil', 0.2], ['natural_gas', 0.12]], 4, 40, 300_000, 0.4, 3.5, 180_000, 'Power for homes and almost every factory. Burns oil and gas.'),
  g('plastics', 'Plastics', 'energy', 'material', 't', [['crude_oil', 0.8], ['natural_gas', 0.24]], 3, 30, 10_000, 0.7, 3, 160_000, 'Made from oil and gas. Used in phones, cars, appliances and packaging.'),
  g('chemicals', 'Chemicals', 'energy', 'material', 't', [['crude_oil', 0.45], ['natural_gas', 0.18], ['electricity', 0.3]], 4, 22, 6_000, 0.7, 3, 180_000, 'Refined from oil and gas. Medicine, batteries, water plants and rockets need them.'),
  g('water', 'Water', 'energy', 'material', 'kL', [['electricity', 0.03], ['chemicals', 0.005]], 0.5, 150, 600_000, 0.2, 2, 160_000, 'A utility: clean water for homes, farms, hospitals, data centres and offices.'),
  g('glass', 'Glass', 'manufacturing', 'material', 't', [['silicon', 0.8], ['electricity', 0.45], ['natural_gas', 0.19]], 3, 24, 5_000, 0.7, 3, 150_000, 'Melted from silicon sand. Laptop screens and windows.'),
  g('freight', 'Freight', 'services', 'material', 'loads', [['crude_oil', 0.3], ['electricity', 0.1]], 6, 10, 15_000, 0.5, 3, 150_000, 'Logistics: trucks and warehouses that deliver for shops, online stores and factories.'),
  g('steel', 'Steel', 'manufacturing', 'material', 't', [['iron_ore', 2], ['limestone', 0.2], ['electricity', 0.5]], 1.6, 20, 10_000, 0.8, 3, 200_000, 'Smelted from iron ore. Cars, builders, robots and weapons depend on it.'),
  g('cement', 'Cement', 'manufacturing', 'material', 't', [['limestone', 1.5], ['natural_gas', 0.2], ['electricity', 0.3]], 2, 30, 5_000, 0.6, 3.2, 150_000, 'Baked from limestone in gas kilns. Every building starts with it.'),
  g('aluminium', 'Aluminium', 'manufacturing', 'material', 't', [['bauxite', 2], ['electricity', 1]], 4, 18, 4_000, 0.8, 3, 220_000, 'Smelted from bauxite with lots of power. Light metal for cars, planes and rockets.'),
  g('chips', 'Chips', 'tech', 'material', 'boxes', [['silicon', 0.8], ['copper', 0.07], ['rare_earths', 0.05], ['electricity', 0.3]], 4.9, 12, 5_000, 0.9, 2.6, 260_000, 'Computer chips. Phones, cars, robots, AI and weapons all need them.'),
  g('batteries', 'Batteries', 'tech', 'material', 'packs', [['lithium', 0.5], ['copper', 0.3], ['chemicals', 0.2], ['electricity', 0.2]], 6, 10, 8_000, 0.9, 2.6, 260_000, 'Battery cells for phones, laptops, electric cars, robots and rockets.'),
  g('construction', 'Construction', 'services', 'material', 'jobs', [['cement', 1], ['steel', 0.3], ['timber', 0.2], ['glass', 0.05], ['freight', 0.1]], 10, 4, 12_000, 0.9, 2.6, 220_000, 'Builders. Turn cement, steel and timber into homes, offices and hospitals.'),
  // Products and services
  g('robots', 'Robots', 'tech', 'product', 'robots', [['steel', 1], ['chips', 5], ['batteries', 1], ['aluminium', 0.5], ['rare_earths', 0.2]], 30, 0.8, 3_000, 0.8, 2.2, 15_000_000, 'Factory and warehouse robots. Car plants and online stores buy them. Needs a $250M government permit.', { permit: 250_000_000 }),
  g('cars', 'Cars', 'manufacturing', 'product', 'cars', [['steel', 1], ['plastics', 0.5], ['chips', 1.6], ['batteries', 0.4], ['copper', 0.5], ['aluminium', 0.2], ['robots', 0.004]], 13.3, 1.2, 8_000, 1.2, 2.2, 320_000, 'Big-ticket product. Needs steel, chips, batteries and factory robots.'),
  g('appliances', 'Appliances', 'manufacturing', 'product', 'units', [['steel', 0.45], ['plastics', 0.3], ['chips', 0.5], ['copper', 0.3]], 4, 4, 25_000, 1.1, 2.4, 180_000, 'Fridges and washing machines for every home.'),
  g('phones', 'Phones', 'tech', 'product', 'phones', [['chips', 1], ['plastics', 0.1], ['batteries', 0.1]], 4, 9, 40_000, 1.2, 2.2, 240_000, 'Everyone wants the latest one. Brand and quality matter a lot.'),
  g('software', 'Software', 'tech', 'product', 'licences', [['electricity', 0.2]], 2, 6, 80_000, 1.0, 2.0, 120_000, 'Apps and services. Almost no materials, mostly skilled staff.'),
  g('ai', 'AI Services', 'tech', 'product', 'seats', [['chips', 0.5], ['electricity', 1], ['water', 0.5]], 5, 4, 25_000, 1.0, 2.0, 300_000, 'AI models for businesses and banks. Eats chips, power and cooling water.'),
  g('gaming', 'Gaming', 'tech', 'product', 'players', [['electricity', 0.2], ['chips', 0.05]], 2, 6, 60_000, 1.1, 2.2, 160_000, 'Game studios and online games. Hits make fortunes; fans follow brand and quality.'),
  g('food', 'Groceries', 'retail', 'product', 'baskets', [['grain', 2], ['water', 0.2], ['plastics', 0.05], ['electricity', 0.05]], 0.4, 50, 400_000, 0.5, 3, 110_000, 'Supermarkets selling packaged food. Huge, steady demand.'),
  g('clothing', 'Fashion', 'retail', 'product', 'items', [['cotton', 1.5]], 3, 20, 200_000, 1.1, 2.6, 120_000, 'Clothing stores. Shoppers follow trends and prices.'),
  g('ecommerce', 'Online Store', 'retail', 'product', 'orders', [['freight', 0.3], ['software', 0.05], ['electricity', 0.1], ['robots', 0.0005]], 2.45, 25, 200_000, 1.0, 2.6, 160_000, 'An everything store online. Lives on fast deliveries, good software and warehouse robots.'),
  g('furniture', 'Furniture', 'manufacturing', 'product', 'pieces', [['timber', 0.5], ['plastics', 0.05], ['freight', 0.1]], 6, 5, 30_000, 1.1, 2.4, 170_000, 'Sofas, tables and beds. Needs timber and deliveries.'),
  g('laptops', 'Laptops', 'tech', 'product', 'laptops', [['chips', 3], ['batteries', 0.15], ['plastics', 0.15], ['glass', 0.05], ['freight', 0.05]], 2, 4, 15_000, 1.2, 2.2, 280_000, 'Work and play machines. They need lots of chips and a battery.'),
  g('medicine', 'Medicine', 'health', 'product', 'packs', [['chemicals', 0.3], ['water', 0.2], ['plastics', 0.05], ['freight', 0.02]], 2.4, 25, 120_000, 0.3, 2.4, 220_000, 'Drug makers. People buy it in good times and bad, and clinics and hospitals need it.'),
  g('telecom', 'Mobile Network', 'tech', 'product', 'plans', [['electricity', 0.1], ['chips', 0.02], ['copper', 0.02]], 2.2, 40, 150_000, 0.6, 1.9, 240_000, 'A service: phone and internet plans with loyal monthly customers.'),
  g('clinics', 'Clinics', 'health', 'product', 'visits', [['medicine', 1], ['water', 0.3], ['electricity', 0.05]], 2.6, 6, 60_000, 0.4, 2.0, 200_000, 'A service: doctors and clinics. Needs medicine and skilled staff.'),
  g('banking', 'Banking', 'finance', 'product', 'accounts', [['electricity', 0.05], ['ai', 0.005]], 6, 18, 160_000, 0.9, 1.8, 200_000, 'Accounts and loans. Loyal customers and low material costs.'),
  g('real_estate', 'Real Estate', 'finance', 'product', 'leases', [['construction', 0.4], ['water', 1], ['electricity', 0.2]], 10, 6, 25_000, 0.8, 2.2, 260_000, 'Offices and apartments to rent. Needs builders, water and power.'),
  // Mega businesses: a government permit on top of the industry licence, and very expensive plants
  g('space', 'Space Launches', 'manufacturing', 'product', 'launches', [['aluminium', 3], ['chips', 4], ['chemicals', 4], ['batteries', 1], ['rare_earths', 1]], 100, 0.2, 2_000, 0.7, 2, 30_000_000, 'Rockets that put satellites in orbit. Needs a $750M space permit and a huge factory.', { permit: 750_000_000 }),
  g('defense', 'Defense', 'manufacturing', 'product', 'systems', [['steel', 4], ['aluminium', 2], ['chips', 4], ['chemicals', 2], ['rare_earths', 0.5]], 80, 0.25, 2_000, 0.2, 1.8, 25_000_000, 'Military equipment. The government is the big buyer and it pays in good times and bad. Needs a $500M permit.', { permit: 500_000_000 }),
  g('airlines', 'Airlines', 'services', 'product', 'seats', [['crude_oil', 1.5], ['food', 0.1], ['aluminium', 0.05], ['electricity', 0.1]], 20, 2, 45_000, 1.0, 2.4, 20_000_000, 'Passenger flights. Jet fuel is the big cost, so oil prices swing profits. Needs a $400M permit.', { permit: 400_000_000 }),
  g('hospitals', 'Hospitals', 'health', 'product', 'stays', [['medicine', 1], ['water', 1], ['electricity', 0.3], ['construction', 0.02]], 20, 1.5, 90_000, 0.15, 1.6, 60_000_000, 'The biggest market of all. Prices are set by the government, so margins are thin (about 5-8%) but demand never stops. Needs a $1B permit.', { reg: true, permit: 1_000_000_000 }),
  g('wellness', 'Wellness', 'health', 'product', 'visits', [['water', 0.5], ['medicine', 0.2], ['electricity', 0.1]], 5, 10, 150_000, 0.3, 2, 12_000_000, 'Spas, gyms and care homes. Regulated like hospitals: capped prices, thin margins, steady customers. Needs a $300M permit.', { reg: true, permit: 300_000_000 }),
];

function derive(): Record<GoodId, GoodDef> {
  const out = {} as Record<GoodId, GoodDef>;
  for (const sp of SPECS) {
    const inputCost = sp.inputs.reduce((s, i) => s + i.qty * out[i.good].p0, 0);
    const labour = INDUSTRIES[sp.industry].salary / (sp.unitsPerWorker * PRODUCTIVITY_AT_START);
    const p0 = (inputCost + sp.vc + labour) / (sp.reg ? REG_VAR_SHARE : VAR_SHARE);
    const baseCapacity = sp.foundCost / (REVENUE_DAYS * p0);
    out[sp.id] = { ...sp, p0, baseCapacity, baseFixed: (sp.reg ? REG_FIXED_SHARE : FIXED_SHARE) * p0 * baseCapacity };
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
  // Raw producers need no inputs, so getting in costs more (x1.6 on the old prices)
  iron_ore: 1.45, grain: 2.4, cotton: 2.5, silicon: 2.95, timber: 2.5, crude_oil: 2.95,
  electricity: 1.45, plastics: 1.35, chemicals: 1.45, glass: 1.45, freight: 1.35, steel: 1.65, chips: 1.5,
  cars: 1.7, appliances: 1.9, phones: 1.5, software: 1.1, food: 1.2, clothing: 1.1, furniture: 1.7,
  laptops: 1.45, medicine: 1.55, telecom: 1.55, clinics: 1.35,
  copper: 2.6, lithium: 2.8, bauxite: 2.5, rare_earths: 2.95, limestone: 2.4, natural_gas: 2.8,
  aluminium: 1.6, batteries: 1.5, cement: 1.45, water: 1.4, construction: 1.35,
  real_estate: 1.5, ecommerce: 1.2, gaming: 1.1, ai: 1.3,
  robots: 1.5, space: 1.5, defense: 1.5, airlines: 1.35, hospitals: 1.1, wellness: 1.1,
};

/** What you pay to found a company of this good (not counting any industry licence). */
/**
 * What you pay to build a plant, on top of the economy's base cost: real plants take a year or two
 * to pay for themselves, so a new business is a commitment you have to run well.
 */
export const BUILD_COST_MULT = 1.6;

export function startCost(good: GoodId): number {
  if (good === 'banking') return Math.max(BANK_START, GOODS[good].foundCost);
  return Math.round((GOODS[good].foundCost * (START_MULT[good] ?? 1.3) * BUILD_COST_MULT) / 1000) * 1000;
}

/** The highest price multiple you may charge (regulated goods are capped at the market price). */
export function maxPriceMult(good: GoodId): number {
  return GOODS[good].reg ? REG_PRICE_CAP : 2;
}

/** Capital a newly founded company must keep (banks only). */
export function requiredCapital(good: GoodId): number {
  return good === 'banking' ? startCost(good) - GOODS[good].foundCost : 0;
}

/**
 * Your upgrades start at 1.4x the plant's base price for level 2 (AI firms pay 0.9x), then each level
 * costs 1.75x the last. Growing one plant is a real investment, not a quick win.
 */
export const PLAYER_UPGRADE_BASE = 1.4 * BUILD_COST_MULT;
export const AI_UPGRADE_BASE = 0.9;

export function upgradeCost(good: GoodId, level: number, growth = UPGRADE_COST_GROWTH, base = growth === AI_UPGRADE_COST_GROWTH ? AI_UPGRADE_BASE : PLAYER_UPGRADE_BASE): number {
  return Math.round(GOODS[good].foundCost * base * Math.pow(growth, level - 2));
}

/**
 * Industry licences, paid to the government. Your first industry is free; each further one costs its
 * base fee, plus 50% more for every licence you already hold beyond the first.
 */
export const LICENCE_FEE: Record<IndustryId, number> = {
  resources: 2_000_000, retail: 200_000, services: 250_000, energy: 1_500_000,
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
  // Phase 4 markets
  ['Redwire Copper', 'RWC', 'copper', 11],
  ['Andes Ridge Mining', 'ADR', 'copper', 9],
  ['Saltflat Lithium', 'SFL', 'lithium', 10],
  ['Ruby Clay Minerals', 'RCM', 'bauxite', 10],
  ['Neodyne Metals', 'NDM', 'rare_earths', 10],
  ['Whitecliff Quarries', 'WCQ', 'limestone', 10],
  ['Bluewell Gas', 'BWG', 'natural_gas', 12],
  ['Frontier Gasfields', 'FGF', 'natural_gas', 10],
  ['Alucor Smelting', 'ALC', 'aluminium', 11],
  ['Voltcell', 'VLT', 'batteries', 11],
  ['Ampera Cells', 'AMP', 'batteries', 9],
  ['Bedrock Cement', 'BDC', 'cement', 11],
  ['Clearspring Water', 'CSW', 'water', 12],
  ['Riverbend Utilities', 'RBU', 'water', 10],
  ['Ironbeam Builders', 'IBB', 'construction', 11],
  ['Keystone Construction', 'KSC', 'construction', 10],
  ['Automata Robotics', 'ATR', 'robots', 11],
  ['Synapse Labs', 'SYN', 'ai', 11],
  ['Deepfield AI', 'DFA', 'ai', 10],
  ['Pixelforge Studios', 'PXF', 'gaming', 11],
  ['Nightowl Games', 'NOG', 'gaming', 9],
  ['Cartwheel Online', 'CWO', 'ecommerce', 11],
  ['Parcelpop', 'PPP', 'ecommerce', 9],
  ['Skyview Properties', 'SVP', 'real_estate', 11],
  ['Harborline Estates', 'HLE', 'real_estate', 10],
  ['Orbital Dynamics', 'ORB', 'space', 10],
  ['Aegis Defense Systems', 'AGS', 'defense', 11],
  ['Bastion Arms', 'BSA', 'defense', 9],
  ['Astoria Airways', 'AAW', 'airlines', 12],
  ['Skyhop Air', 'SKH', 'airlines', 9],
  ['St. Meridian Health', 'SMH', 'hospitals', 12],
  ['Unity Hospitals', 'UNH', 'hospitals', 11],
  ['Lakeside Medical', 'LKM', 'hospitals', 9],
  ['Serene Living', 'SRL', 'wellness', 10],
  ['Vitalis Wellness', 'VWL', 'wellness', 9],
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
  tycoon?: boolean;
}

const p = (risk: number, aggression: number, patience: number, ambition: number, loyalty: number, negotiation: number, financial: number, political: number, ethics: number): Personality =>
  ({ risk, aggression, patience, ambition, loyalty, negotiation, financial, political, ethics });

export const RIVALS: RivalDef[] = [
  {
    id: 'kane', name: 'Victor Kane', title: 'The Aggressive Industrialist', focus: ['manufacturing', 'resources'],
    weakness: 'High leverage, and his car plant depends on his own steel', quote: "You're playing a small game, kid. I play for the empire.", flag: 'astoria',
    personality: p(0.85, 0.92, 0.34, 0.88, 0.4, 0.7, 0.6, 0.55, 0.3), cash: 900_000_000, avatarColor: '#c0392b', owns: ['KNE', 'RRM', 'HCM', 'CVG', 'AGS', 'BDC'],
  },
  {
    id: 'roth', name: 'Elena Roth', title: 'The Strategic Investor', focus: ['tech'],
    weakness: 'Avoids uncertain opportunities', quote: 'I invest in what the world will need in ten years.', flag: 'astoria',
    personality: p(0.25, 0.35, 0.9, 0.7, 0.7, 0.8, 0.9, 0.4, 0.75), cash: 1_200_000_000, avatarColor: '#2e86c1', owns: ['NTC', 'LUM', 'QBT', 'VTX', 'SKT', 'ATR', 'PXF'],
  },
  {
    id: 'vale', name: 'Marcus Vale', title: 'The Banking King', focus: ['finance'],
    weakness: 'Vulnerable to liquidity shocks', quote: "Everyone owes someone. Usually it's me.", flag: 'astoria',
    personality: p(0.6, 0.6, 0.6, 0.8, 0.5, 0.85, 0.95, 0.7, 0.45), cash: 1_000_000_000, avatarColor: '#7d3c98', owns: ['EYB', 'VLC', 'HLE', 'SMH'],
  },
  {
    id: 'okafor', name: 'Ada Okafor', title: 'The Oil Tycoon', focus: ['energy'],
    weakness: 'Exposed to oil price swings', quote: 'The world runs on what I pull out of the ground.', flag: 'astoria',
    personality: p(0.7, 0.55, 0.5, 0.75, 0.55, 0.65, 0.7, 0.6, 0.5), cash: 800_000_000, avatarColor: '#d68910', owns: ['TEN', 'SMR', 'PLU', 'MCH', 'FGF', 'AAW'],
  },
  {
    id: 'park', name: 'Daniel Park', title: 'The Retail Magnate', focus: ['retail'],
    weakness: 'Chases volume over margin; his stores need cheap grain and cotton', quote: 'Every household in Astoria is my customer.', flag: 'astoria',
    personality: p(0.5, 0.65, 0.45, 0.7, 0.6, 0.6, 0.55, 0.45, 0.6), cash: 700_000_000, avatarColor: '#229954', owns: ['BRT', 'HNF', 'GFF', 'OHF', 'PPP'],
  },
  // Hands-on tycoons (parody names): they found companies, bid at auctions and offer you deals
  {
    id: 'eusk', name: 'Moln Eusk', title: 'The Rocket Visionary', focus: ['tech', 'manufacturing', 'energy'], tycoon: true,
    weakness: 'Bets the house on moonshots and fights regulators', quote: 'If it sounds impossible, I am already building it.', flag: 'astoria',
    personality: p(0.95, 0.85, 0.3, 0.98, 0.35, 0.6, 0.65, 0.5, 0.45), cash: 2_500_000_000, avatarColor: '#5d6d7e', owns: ['NWG', 'CSD', 'ORB', 'VLT'],
  },
  {
    id: 'saltman', name: 'Mas Saltman', title: 'The AI Prophet', focus: ['tech'], tycoon: true,
    weakness: 'Burns cash for growth long before profits', quote: 'The next big thing is always software that thinks.', flag: 'astoria',
    personality: p(0.8, 0.6, 0.55, 0.95, 0.5, 0.8, 0.7, 0.75, 0.55), cash: 1_600_000_000, avatarColor: '#48c9b0', owns: ['WVL', 'SYN'],
  },
  {
    id: 'bates', name: 'Gill Bates', title: 'The Software Philanthropist', focus: ['tech', 'health'], tycoon: true,
    weakness: 'Slow to move outside software and medicine', quote: 'Patience and a good licence model beat luck.', flag: 'astoria',
    personality: p(0.45, 0.55, 0.8, 0.8, 0.6, 0.85, 0.9, 0.7, 0.75), cash: 2_200_000_000, avatarColor: '#3498db', owns: ['HLX', 'NSH', 'UNH', 'DFA'],
  },
  {
    id: 'mambani', name: 'Hukesh Mambani', title: 'The Conglomerate King', focus: ['energy', 'tech', 'retail'], tycoon: true,
    weakness: 'Spread across so many businesses that one shock hits them all', quote: 'Own the oil, the network and the shop, and the customer is yours.', flag: 'astoria',
    personality: p(0.6, 0.75, 0.65, 0.92, 0.55, 0.8, 0.85, 0.9, 0.45), cash: 2_000_000_000, avatarColor: '#b9770e', owns: ['BDP', 'CPN', 'BWG', 'CSW'],
  },
  {
    id: 'bozes', name: 'Jeff Bozes', title: 'The Everything Store', focus: ['retail', 'services', 'tech'], tycoon: true,
    weakness: 'Runs on thin margins and squeezes partners hard', quote: 'Your margin is my opportunity.', flag: 'astoria',
    personality: p(0.7, 0.88, 0.75, 0.95, 0.4, 0.85, 0.85, 0.6, 0.4), cash: 2_400_000_000, avatarColor: '#e67e22', owns: ['SHL', 'PSF', 'URB', 'CWO'],
  },
  {
    id: 'muckerberg', name: 'Zark Muckerberg', title: 'The Social Network Mogul', focus: ['tech'], tycoon: true,
    weakness: 'Buys rivals instead of out-building them', quote: 'Move fast. If you cannot beat them, buy them.', flag: 'astoria',
    personality: p(0.75, 0.8, 0.5, 0.9, 0.35, 0.7, 0.75, 0.55, 0.35), cash: 1_800_000_000, avatarColor: '#2471a3', owns: ['NOG'],
  },
  {
    id: 'juang', name: 'Hensen Juang', title: 'The Chip Emperor', focus: ['tech', 'manufacturing'], tycoon: true,
    weakness: 'Everything he owns depends on silicon and power', quote: 'Every product of the future runs on my chips.', flag: 'astoria',
    personality: p(0.65, 0.7, 0.7, 0.88, 0.65, 0.75, 0.8, 0.5, 0.65), cash: 1_900_000_000, avatarColor: '#27ae60', owns: ['ARC', 'IVW', 'NDM', 'AMP'],
  },
  {
    id: 'wuffett', name: 'Barren Wuffett', title: 'The Oracle Investor', focus: ['finance', 'retail', 'energy'], tycoon: true,
    weakness: 'Will not overpay, so he misses hot markets', quote: 'Buy wonderful companies at fair prices, then wait.', flag: 'astoria',
    personality: p(0.2, 0.3, 0.98, 0.65, 0.9, 0.9, 0.98, 0.5, 0.85), cash: 2_600_000_000, avatarColor: '#7f8c8d', owns: ['ASM', 'PHV', 'SVP', 'IBB'],
  },
];

export const COUNTRIES = [
  { id: 'astoria', name: 'Republic of Astoria', identity: 'Developed economy', advantage: 'Finance and technology', unlocked: true },
  { id: 'bharatara', name: 'Bharatara', identity: 'Emerging economy', advantage: 'Manufacturing and workforce', unlocked: false },
  { id: 'nordland', name: 'Federation of Nordland', identity: 'Resource economy', advantage: 'Oil, gas and minerals', unlocked: false },
  { id: 'meridian', name: 'East Meridian', identity: 'Export powerhouse', advantage: 'Electronics and shipping', unlocked: false },
] as const;

/** Steepness of the level curve: level 10 needs about 77K XP in total, level 20 about 410K. */
export const XP_CURVE = 2.25;

/** Total XP you need to leave this level. */
export function xpForLevel(level: number): number {
  return Math.round((550 * Math.pow(level, XP_CURVE)) / 50) * 50;
}
