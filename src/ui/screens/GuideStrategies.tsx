import { useState } from 'react';
import { useGame } from '../../store/game';
import { UNLOCKS, unlockLevel, type UnlockKey } from '../../engine/rewards';
import { Badge, Card, SectionTitle, cx } from '../components/core';

interface Feature {
  icon: string;
  name: string;
  unlock?: UnlockKey;
  see: string;
  how: string[];
  todo: string;
}

const REWARDS: Feature[] = [
  {
    icon: '💸', name: 'Money pops',
    see: 'A green "+$12K" floats up over a building on the city map when that company has a big sales day. A gold one with a ★ marks a new record. A coin sound plays.',
    how: ['A pop shows when a company sells 25% more than its usual day.', 'Records beat the old best by at least 10%.', 'Turn sound on or off in More → Sound effects.'],
    todo: 'Keep the Home screen open at 2x or 5x and watch your city earn.',
  },
  {
    icon: '🏅', name: 'Records',
    see: 'A gold banner at the top such as "New record: best profit day! $48K" with a little XP. It does not pause the game.',
    how: ['Tracked: best profit day, biggest month, highest net worth, most companies, biggest market share and your first $1M company.', 'Each record gives 30–100 XP.'],
    todo: 'Beat your own bests: they come faster as you grow.',
  },
  {
    icon: '⬆️', name: 'Level-up screen',
    see: 'A full-screen card that pauses the game: "Level 4! You unlocked: Government tenders."',
    how: ['XP comes from goals, achievements, records, contracts, tenders, good report cards and your streak.', 'Each level opens a new feature (see the unlock list below), so you learn one thing at a time.'],
    todo: 'Check what the next unlock is on the level-up card and aim for it.',
  },
  {
    icon: '📝', name: 'Monthly report card',
    see: 'Every 30 game days a report pops up (and pauses) with a grade from A+ to F, profit compared with last month, your rank among the billionaires, your best and worst company and one tip.',
    how: ['Score out of 100: profit growth 30, making a profit 25, cash safety 20, market share 15, net worth growth 10.', 'A or A+ gives bonus XP (up to 300).', 'Old reports are kept in More → Monthly reports.'],
    todo: 'Fix the "Needs work" company and follow the tip to lift next month\'s grade.',
  },
  {
    icon: '🔥', name: 'Daily streak',
    see: 'A 🔥 counter in the top bar and a reward card the first time you open the game each real day.',
    how: ['Open the game on the next real day and the streak goes up; miss a day and it starts again.', 'Cash grows with your streak (a small share of your net worth, capped) plus XP. Day 7 pays double.', 'From level 5, one streak freeze a week saves you if you miss a single day.'],
    todo: 'Open your empire once a day, even for a minute.',
  },
  {
    icon: '🏗️', name: 'Growing buildings',
    see: 'Your buildings grow taller with each upgrade. A crane swings over a plot for a few days after an upgrade, landmark flags appear at company levels 5, 10, 15, 20 and 25, and ★ marks your biggest company when you own several in one industry.',
    how: ['Player level 12 adds gold trim, level 15 a helipad on big plants, level 20 neon lights.'],
    todo: 'Upgrade and watch your city change.',
  },
];

const STRATEGIES: Feature[] = [
  {
    icon: '📋', name: 'Contracts board', unlock: 'contracts',
    see: 'Deals & Strategies → Contracts lists 3–4 offers, e.g. "Halcyon Motors wants 5,000 steel within 60 days: $820K, bonus $82K if early, penalty $164K if missed."',
    how: ['Offers come from rival companies short of a material and from the government.', 'Pay is 15–30% above the market price.', 'Each day deliveries come out of your stock before normal sales, then from your warehouses.', 'Finish within 75% of the time for the bonus. Done: XP and a better relationship. Missed: penalty and an angry rival.'],
    todo: 'Accept jobs your plant can handle on top of normal sales. Watch the progress bar.',
  },
  {
    icon: '📣', name: 'Brand campaigns', unlock: 'campaigns',
    see: 'Company → Operations → Brand campaign. Pick Small, Medium or Big and 2, 4 or 8 weeks. Afterwards a result card says how much extra you sold, with a "Great value!" stamp when it paid off.',
    how: ['A campaign makes the company more appealing to buyers: +15%, +30% or +50%.', 'The lift fades over 3 weeks after the end, and a little brand stays for good.', 'Running campaigns back to back makes each one 30% weaker.', 'Works best for consumer products, where shoppers look at brand.'],
    todo: 'Run one when demand is strong and you have spare capacity to sell into.',
  },
  {
    icon: '🏬', name: 'Warehouses', unlock: 'warehouse',
    see: 'Deals & Strategies → Warehouses shows how full each one is, what is inside, its value and the daily cost.',
    how: ['Build one for $150K (each next one costs more) and upgrade it to level 10: +60% space a level.', 'Turn on "Send extra output to the warehouse" (Automation tab) and the plant keeps running at full capacity, storing what it cannot sell.', 'Storage costs rent plus a share of the stock\'s value each day. Food, grain and cotton spoil faster. Electricity and services cannot be stored.', 'Sell by hand, or set auto-sell when the price is 10–40% above what you paid. Stock goes back to your company to sell, or to traders at 95% of the price if you do not make it.', 'From level 6, buy stock from the market with standing buy orders.'],
    todo: 'Store when prices are low, sell when demand and prices are high.',
  },
  {
    icon: '🏛️', name: 'Government tenders', unlock: 'tenders',
    see: 'Deals & Strategies → Tenders: "City Hospital: 2,000 medicine a month for 6 months. Bids close in 10 days."',
    how: ['Send a price per unit. 1–4 rival companies bid too, based on their costs and how aggressive their owner is.', 'Lowest price wins, but quality counts: each 0.1 of quality is worth 2.5% of price.', 'Winning gives you a guaranteed buyer for months; a short delivery costs a penalty in proportion.', 'More tenders appear when the economy slows down.'],
    todo: 'Bid low enough to win but above your unit cost. The screen shows both.',
  },
  {
    icon: '⚔️', name: 'Price wars', unlock: 'wars',
    see: 'Setting a price at 85% of the market or lower shows a warning: "Kane may answer this." Wars appear in Deals & Strategies → Price wars with both sides\' share, price and cash.',
    how: ['A war starts against the biggest rival seller (at least 10% share).', 'Depending on personality and cash the rival matches your price, cuts even deeper, or backs off.', 'Raise your price above 90% to stop. If you gained share it counts as a win.', 'A rival short of cash gives up. If your company runs out of cash, you lose and they grow their brand.', 'Rivals remember wars.'],
    todo: 'Only start one with cash or a bank behind you, against a weaker rival.',
  },
  {
    icon: '👑', name: 'Monopoly bonus',
    see: 'A note on the company Overview when you pass 40% of a market, and a warning bar in Price wars.',
    how: ['Above 40% share, buyers switch away half as easily when you raise prices.', 'Each month there is a chance of an antitrust investigation, rising with your share.', 'You choose: fight in court (fee, 50% chance, lose = double fine), sell 25% of the plant, or pay a fine of 5% of a year\'s revenue.'],
    todo: 'Raise prices a little when you dominate, but not so much that you invite the regulators.',
  },
  {
    icon: '🤝', name: 'Joint ventures', unlock: 'ventures',
    see: 'A rival who likes you (relationship 40+) sends an offer: "Build a $2M chip plant together."',
    how: ['You put in 51% and run it; the rival puts in 49% and gets 49% of the dividends.', 'It starts at level 3 and needs no licence.', 'Your relationship grows every month it makes money. You can buy the partner out later on the Owners tab.'],
    todo: 'Build friendships with supply deals and contracts, then say yes to good ventures.',
  },
  {
    icon: '🤫', name: 'Insider tips', unlock: 'tips',
    see: 'A gold banner: "Tip from Victor Kane: Between us, Vale Capital is about to announce a big expansion." Tips are listed in Deals & Strategies → Tips.',
    how: ['Tips come from rivals with relationship 40+ about companies they own or hold.', 'About 4 in 5 come true within a week and move the share price; 1 in 5 are wrong.', 'Trading more than $100K of that stock before the news has a 30% chance of a fine.'],
    todo: 'Act quickly but not too big.',
  },
  {
    icon: '🗜️', name: 'Supply squeeze', unlock: 'squeeze',
    see: 'Warehouse stock rows show 🔥 when there is a shortage, and a "Sell to short rivals" button.',
    how: ['Fill warehouses with most of a raw material by buying it and holding your own output.', 'Your buying takes supply from rivals, so a shortage starts and the price climbs.', 'Then release slowly, use auto-sell on shortage, or sell straight to short rivals at a 10–30% premium.', 'Risks: storage costs and spoilage pile up, squeezed rivals get angry, and if demand drops you hold expensive stock.', 'Rivals stockpile too: watch the news for "stockpiles" headlines.'],
    todo: 'Pick a raw material with few producers and steady demand.',
  },
];

function Block({ label, tone, children }: { label: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 py-2 border-t border-line first:border-t-0">
      <span className={cx('shrink-0 w-[74px] text-[11px] font-black uppercase tracking-wide pt-0.5', tone)}>{label}</span>
      <div className="text-sm leading-relaxed flex-1 min-w-0">{children}</div>
    </div>
  );
}

function FeatureCard({ f, level }: { f: Feature; level: number }) {
  const [open, setOpen] = useState(false);
  const lvl = f.unlock ? unlockLevel(f.unlock) : 0;
  const locked = lvl > level;
  return (
    <Card className={cx('overflow-hidden', open && 'border-gold-edge/60')}>
      <button className="w-full flex items-center gap-3 p-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={cx('grid place-items-center size-12 shrink-0 rounded-xl text-2xl border', locked ? 'bg-card-2 border-line grayscale opacity-70' : 'bg-gradient-to-br from-gold/30 to-card-2 border-gold-edge/50')}>{f.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold">{f.name}</span>
          <span className="block text-xs text-muted truncate">{f.see}</span>
        </span>
        {lvl > 0 && <Badge tone={locked ? 'neutral' : 'good'}>{locked ? `🔒 Lv ${lvl}` : `Lv ${lvl} ✓`}</Badge>}
        <span className={cx('text-dim transition-transform', open && 'rotate-90')}>›</span>
      </button>
      {open && (
        <div className="px-3 pb-3 anim-fade">
          <Block label="What you see" tone="text-blue">{f.see}</Block>
          <Block label="How it works" tone="text-gold">
            <ul className="space-y-1">{f.how.map((h) => <li key={h} className="flex gap-1.5"><span className="text-gold">•</span><span>{h}</span></li>)}</ul>
          </Block>
          <Block label="What you do" tone="text-green">{f.todo}</Block>
        </div>
      )}
    </Card>
  );
}

export function Strategies() {
  const level = useGame((s) => s.world?.player.level ?? 1);
  const push = useGame((s) => s.push);
  return (
    <>
      <Card className="mt-4 p-4 overflow-hidden bg-gradient-to-br from-card-2 to-card">
        <div className="flex items-center gap-4">
          <span className="text-5xl">♟️</span>
          <div>
            <h2 className="text-xl font-bold leading-tight">Business strategies</h2>
            <p className="text-sm text-muted mt-1 leading-relaxed">Making things is only half the game. Win contracts, store and squeeze supply, fight price wars and team up with rivals. Each one unlocks as your level grows. Tap a card for what you see, how it works and what to do.</p>
          </div>
        </div>
      </Card>

      <SectionTitle>Unlock path</SectionTitle>
      <Card className="p-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {UNLOCKS.map((u) => (
            <div key={u.key} className={cx('shrink-0 w-[92px] rounded-lg border p-2 text-center', u.level <= level ? 'border-green/60 bg-green/5' : 'border-line bg-card-2 opacity-75')}>
              <div className="text-2xl">{u.icon}</div>
              <div className="text-[11px] font-bold leading-tight mt-1">{u.title}</div>
              <div className={cx('text-[11px] mt-0.5 font-semibold', u.level <= level ? 'text-green' : 'text-dim')}>{u.level <= level ? '✓ ' : '🔒 '}Lv {u.level}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-dim mt-1">You are level {level}.</p>
      </Card>

      <SectionTitle>Rewards that keep you going</SectionTitle>
      <div className="space-y-2">{REWARDS.map((f) => <FeatureCard key={f.name} f={f} level={level} />)}</div>

      <SectionTitle>Strategies to beat rivals</SectionTitle>
      <div className="space-y-2">{STRATEGIES.map((f) => <FeatureCard key={f.name} f={f} level={level} />)}</div>

      <button className="w-full mt-3 rounded-card border-2 border-dashed border-gold-edge/60 p-3 text-gold font-bold" onClick={() => push({ screen: 'strategy' })}>
        Open Deals & Strategies →
      </button>
    </>
  );
}
