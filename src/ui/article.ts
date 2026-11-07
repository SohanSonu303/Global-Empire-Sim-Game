/**
 * Turns a one-line news item into a full newspaper article using live game data:
 * company figures, the market for its good, the economy, and what it means for you.
 */
import { GOODS, GOOD_IDS, INDUSTRIES } from '../engine/data';
import { netWorth } from '../engine/progress';
import { fmtMoney, fmtPct, fmtPrice } from '../engine/news';
import type { Company, GoodId, NewsCategory, NewsItem, Rival, WorldState } from '../engine/types';
import type { Route } from '../store/game';
import { marketView } from './screens/Chain';

export type ArtSpec =
  | { kind: 'plant'; good: GoodId; level: number }
  | { kind: 'market'; up: boolean }
  | { kind: 'economy'; up: boolean }
  | { kind: 'tech' }
  | { kind: 'player' };

export interface Article {
  kicker: string;
  color: string;
  headline: string;
  deck: string;
  byline: string;
  paragraphs: string[];
  quote: { text: string; who: string };
  facts: { label: string; value: string }[];
  links: { label: string; route: Route }[];
  art: ArtSpec;
}

export const SECTION: Record<NewsCategory, { label: string; color: string }> = {
  player: { label: 'Your Empire', color: '#b8862b' },
  business: { label: 'Business', color: '#2d5b8c' },
  market: { label: 'Markets', color: '#2f7d4a' },
  economy: { label: 'Economy', color: '#7a3f8f' },
  commodities: { label: 'Commodities', color: '#a0522d' },
  technology: { label: 'Technology', color: '#1f6f8b' },
  politics: { label: 'Politics', color: '#5b544a' },
};

const pick = <T,>(arr: T[], seed: string): T => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
};

export function dateline(day: number): string {
  return `Day ${day}, Year ${Math.floor(day / 360) + 1}`;
}

/** Companies named in the story (by id, or by name in the text). */
function companiesIn(w: WorldState, n: NewsItem): Company[] {
  const byId = n.entityIds.map((id) => w.companies.find((c) => c.id === id)).filter((c): c is Company => !!c);
  if (byId.length) return byId;
  const text = `${n.headline} ${n.body}`;
  return w.companies.filter((c) => text.includes(c.name)).slice(0, 2);
}

/** Goods the story is about: its companies' goods, or goods named in the text. */
function goodsIn(n: NewsItem, cos: Company[]): GoodId[] {
  const out = new Set<GoodId>(cos.map((c) => c.good));
  const text = `${n.headline} ${n.body}`.toLowerCase();
  for (const g of GOOD_IDS) {
    const name = GOODS[g].name.toLowerCase();
    if (text.includes(name) || (g === 'crude_oil' && /\boil\b/.test(text)) || (g === 'chips' && text.includes('chip'))) out.add(g);
  }
  return [...out].slice(0, 2);
}

function ownerOf(w: WorldState, c: Company): { text: string; rival?: Rival } {
  if (c.isPlayer) return { text: 'your company' };
  const rival = w.rivals.find((r) => r.id === c.ownerId);
  return rival ? { text: `controlled by ${rival.name}`, rival } : { text: 'independently owned' };
}

const DECKS: Record<'good' | 'bad' | 'neutral', string[]> = {
  good: [
    'A strong move that rivals will be watching closely.',
    'Analysts say the news is good for jobs, suppliers and shareholders.',
    'Confidence grows as the numbers point the right way.',
  ],
  bad: [
    'A setback that could ripple through suppliers and customers.',
    'Questions grow over what comes next, and who pays for it.',
    'Owners brace for a difficult few weeks.',
  ],
  neutral: [
    'What it means for the market, and for your companies.',
    'The details, the numbers and who is affected.',
    'A closer look at a change that could matter more than it seems.',
  ],
};

const ANALYSTS = ['Mira Castell, chief economist at Harbor Bank', 'Theo Varga, analyst at Astoria Securities', 'June Okafor, editor of the Trade Ledger', 'Rafael Ines, industry consultant'];
const QUOTES: Record<'good' | 'bad' | 'neutral', string[]> = {
  good: ['Demand is real and the numbers back it up.', 'This is the kind of news that builds momentum.', 'Companies that move quickly will benefit most.'],
  bad: ['Owners who kept cash in reserve will ride this out.', 'The question is how long it lasts, not whether it hurts.', 'Watch the suppliers. That is where the pain spreads first.'],
  neutral: ['Smart owners will watch their costs closely.', 'It is not dramatic, but it changes the maths for some businesses.', 'The market will take a few weeks to digest this.'],
};

export function buildArticle(w: WorldState, n: NewsItem): Article {
  const sec = SECTION[n.category];
  const cos = companiesIn(w, n);
  const goods = goodsIn(n, cos);
  const m = w.macro;
  const paragraphs: string[] = [n.body];
  const facts: Article['facts'] = [];
  const links: Article['links'] = [];

  // Company context
  const c = cos[0];
  if (c) {
    const def = GOODS[c.good];
    const own = ownerOf(w, c);
    const sold = Math.round(c.last.sold);
    // Share of everything sold in Astoria (open market, own companies, deals and imports)
    const share = marketView(w, c.good).sellers.find((s) => s.id === c.id)?.share ?? 0;
    let p = `${c.name}, ${own.text}, makes ${def.name.toLowerCase()} in Astoria.`;
    if (c.bankrupt) p += ' It has stopped trading.';
    else if (sold > 0) p += ` Yesterday it sold ${sold.toLocaleString()} ${def.unit} at ${fmtPrice(c.last.price)} each, ${fmtPct(share, share < 0.1 ? 1 : 0)} of all ${def.name.toLowerCase()} sold in Astoria.`;
    const stock = c.ticker ? w.stocks.find((s) => s.ticker === c.ticker) : undefined;
    if (stock) {
      const chg = stock.price / stock.prevClose - 1;
      p += ` Its shares (${stock.ticker}) trade at $${stock.price.toFixed(2)}, ${chg >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(chg))} today.`;
      facts.push({ label: `${stock.ticker} share price`, value: `$${stock.price.toFixed(2)}` });
      links.push({ label: `${stock.ticker} shares`, route: { screen: 'stock', ticker: stock.ticker } });
    }
    paragraphs.push(p);
    if (!c.bankrupt && sold > 0) facts.push({ label: 'Market share', value: fmtPct(share, share < 0.1 ? 1 : 0) });
    if (c.isPlayer) links.unshift({ label: `Open ${c.name}`, route: { screen: 'company', id: c.id } });
    else if (own.rival) links.push({ label: own.rival.name, route: { screen: 'rival', id: own.rival.id } });
  }

  // The market for the good
  for (const g of goods.slice(0, 1)) {
    const v = marketView(w, g);
    const def = GOODS[g];
    const state = { shortage: 'short of supply', strong: 'in high demand', balanced: 'well balanced', low: 'oversupplied' }[v.status];
    const trend = Math.abs(v.trend) < 0.01 ? 'flat over the last month' : `${v.trend > 0 ? 'up' : 'down'} ${fmtPct(Math.abs(v.trend), 0)} over the last month`;
    let p = `${def.name} sells for ${fmtPrice(v.price)} per ${def.unit}, ${trend}. The market is ${state}, with ${v.sellers.length} local producer${v.sellers.length === 1 ? '' : 's'}.`;
    if (v.importShare >= 0.01) p += ` ${fmtPct(v.importShare, 0)} has to be imported from abroad at a premium.`;
    paragraphs.push(p);
    facts.push({ label: `${def.name} price`, value: fmtPrice(v.price) });
    links.push({ label: `${def.name} market`, route: { screen: 'chain', good: g } });
  }

  // Section context
  if (n.category === 'economy' || (n.category === 'commodities' && goods.length === 0)) {
    paragraphs.push(
      `Across Astoria, the economy is growing at ${fmtPct(m.growth)} a year, inflation is ${fmtPct(m.inflation)} and the central bank rate is ${fmtPct(m.rate, 2)}. Unemployment stands at ${fmtPct(m.unemployment)}.`,
    );
    facts.push({ label: 'Growth', value: fmtPct(m.growth) }, { label: 'Interest rate', value: fmtPct(m.rate, 2) });
  }
  if (n.category === 'commodities') {
    const oil = Math.round(m.oilPrice * 100);
    paragraphs.push(`World oil trades at ${oil}% of its usual price. Power plants and plastics makers feel oil prices first, and they pass the cost down the chain.`);
    facts.push({ label: 'World oil', value: `${oil}% of normal` });
  }
  if (n.category === 'market') {
    const movers = w.stocks.map((s) => ({ s, chg: s.price / s.prevClose - 1 })).sort((a, b) => b.chg - a.chg);
    const best = movers[0];
    const worst = movers[movers.length - 1];
    paragraphs.push(
      `The Astoria index stands at ${w.marketIndex.toFixed(0)} and ${Math.round(w.marketMood * 100)}% of investors are bullish.${best ? ` Today's best performer is ${best.s.ticker} (${fmtPct(best.chg)}), the weakest ${worst.s.ticker} (${fmtPct(worst.chg)}).` : ''}`,
    );
    facts.push({ label: 'Index', value: w.marketIndex.toFixed(0) });
  }
  if (n.category === 'player' && !c) {
    paragraphs.push(`Your net worth now stands at ${fmtMoney(netWorth(w))}, across ${w.companies.filter((x) => x.isPlayer && !x.bankrupt).length} companies.`);
  }

  // What it means for you
  const mine = w.companies.filter((x) => x.isPlayer && !x.bankrupt);
  const angle: string[] = [];
  if (c?.isPlayer) {
    angle.push(n.tone === 'bad' ? `This is your company. Open ${c.name} to see what needs fixing.` : `This is your company, and the story raises its profile with customers and investors.`);
  } else {
    for (const g of goods) {
      const makers = mine.filter((x) => x.good === g);
      const users = mine.filter((x) => GOODS[x.good].inputs.some((i) => i.good === g));
      const v = marketView(w, g);
      if (makers.length) angle.push(`Your ${makers[0].name} also sells ${GOODS[g].name.toLowerCase()}, so ${v.status === 'shortage' || v.status === 'strong' ? 'strong demand works in your favour' : 'expect competition on price'}.`);
      if (users.length) angle.push(`Your ${users[0].name} buys ${GOODS[g].name.toLowerCase()}, so ${v.trend > 0.02 ? 'its costs are rising' : v.trend < -0.02 ? 'its costs are falling' : 'keep an eye on its costs'}.`);
    }
    if (!angle.length && n.category === 'economy') {
      angle.push(m.rate > m.neutralRate ? 'Higher rates make borrowing more expensive, so companies with debt should pay it down.' : 'Cheap borrowing makes this a good time to expand with a loan.');
    }
    if (!angle.length && c && !c.isPlayer && INDUSTRIES[c.industry] && mine.some((x) => x.industry === c.industry)) {
      angle.push(`It competes in ${INDUSTRIES[c.industry].name.toLowerCase()}, the same industry as some of your companies.`);
    }
  }
  if (angle.length) paragraphs.push(`What it means for you: ${angle.join(' ')}`);

  const owner = c ? ownerOf(w, c).rival : undefined;
  const quote = owner
    ? { text: owner.quote, who: `${owner.name}, ${owner.title}` }
    : { text: pick(QUOTES[n.tone], n.id), who: pick(ANALYSTS, `${n.id}a`) };

  const art: ArtSpec = c
    ? { kind: 'plant', good: c.good, level: Math.max(2, c.level) }
    : goods[0]
      ? { kind: 'plant', good: goods[0], level: 3 }
      : n.category === 'market'
        ? { kind: 'market', up: n.tone !== 'bad' }
        : n.category === 'technology'
          ? { kind: 'tech' }
          : n.category === 'player'
            ? { kind: 'player' }
            : { kind: 'economy', up: n.tone !== 'bad' };

  return {
    kicker: sec.label,
    color: sec.color,
    headline: n.headline,
    deck: pick(DECKS[n.tone], n.id),
    byline: `By the Astoria Times ${n.category === 'player' ? 'business' : sec.label.toLowerCase()} desk · ${dateline(n.day)}`,
    paragraphs,
    quote,
    facts: facts.slice(0, 4),
    links: links.slice(0, 3),
    art,
  };
}

/** Front-page importance: your stories and big news first, recent first. */
export function storyScore(w: WorldState, n: NewsItem): number {
  const age = w.day - n.day;
  return -age * 0.35 + (n.category === 'player' ? 2.5 : 0) + (n.tone !== 'neutral' ? 1.5 : 0) + (n.entityIds.length ? 0.5 : 0) + (n.category === 'economy' ? 0.6 : 0);
}

