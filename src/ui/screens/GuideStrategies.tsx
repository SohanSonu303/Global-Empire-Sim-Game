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
    icon: '🚀', name: 'Startup story',
    see: 'Before the main game: pick an idea (chip design, gaming, renewable energy, freelance or AI), pass a strict technical pitch, then run the company week by week toward $500K by week 64.',
    how: [
      'Each investor only backs certain ideas. They ask 5 questions: 2 on finance math (margins, break-even, payback, interest) and 3 technical ones about your idea. One wrong answer and there is no deal; you see the right answers, and a retry brings new questions.',
      'Every week you set the price, marketing and R&D spend, hire or let people go, borrow or repay, and turn side work on or off. The same levers drive the companies in the main game.',
      'Value = cash − loans + a year of profit × a multiple + a year of sales × a smaller multiple + the product. Profit and sales use the last 12 weeks, so one lucky week does not count for much.',
      'Every 4 weeks the investor checks the value against a rising target and their own rule (be profitable, keep growing, or keep 8 weeks of cash). Pass both: trust +10. Each miss: −15. At 0 you are fired.',
      'Run out of cash: the bank lends up to its limit, then the investor rescues you once (payout drops to $300K). At $500K the investor buys you out for $400K and you buy your first company.',
    ],
    todo: 'Read the weekly results: sell out means raise the price or hire, an idle team means market more or let someone go, and a loss means cut costs before the review.',
  },
  {
    icon: '🧬', name: 'Career traits',
    see: 'Two traits you pick when a game starts. Their payouts show on each monthly report under "Your traits this month".',
    how: ['💼 Finance: +5% of monthly profit from companies that do not make raw materials.', '📈 Stock market: +7% of net trading gains a month, 5% of net losses back (shares held 7+ days).', '⛏️ Raw materials: +8% of the profit raw companies make selling outside, and raw inputs 5% cheaper.', '🤝 Deal-making: +5% on finished contracts and tenders, +10% of company-sale gains, +10% on dividends.', '🏭 Operations: upgrades and new companies 10% cheaper, workers make 5% more.', 'Each trait pays on a different kind of income, so two traits never pay on the same money. From level 10 you can swap one trait once for $1M (More screen).'],
    todo: 'Pick traits that match your plan: a supply chain likes Raw materials + Finance, fast growth likes Operations.',
  },
  {
    icon: '💸', name: 'Money pops',
    see: 'A green "+$12K" floats up over a building on the city map when that company has a big sales day. A gold one with a ★ marks a new record. A coin sound plays.',
    how: ['A pop shows when a company sells 25% more than its usual day.', 'Records beat the old best by at least 25%.', 'Turn sound on or off in More → Sound effects.'],
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
    icon: '🔨', name: 'Bankruptcy auctions',
    see: 'Deals & Strategies → Auctions lists bankrupt companies for sale with the top bid, who leads, who else is interested and the days left. A gold banner tells you when a new one opens.',
    how: [
      'When a company goes bust (no cash for 45 days, a long run of losses in a crowded market, or an uninsured plant wrecked by a disaster), the government clears its debts and sells it over 14 days.',
      'Bids start at half of what the plant is worth (its book value, capped at about 0.6x a year of sales). Rivals bid what it is worth to them: more if it is in their industry, feeds or buys from companies they own, or lifts their market share. Tycoons bid hardest.',
      'Your bid money is held until the end and comes back at once if you are outbid. A bid in the last 2 days adds 2 more days, so you can always answer.',
      'Regulators block a buyer (you too) who already sells that product from passing 40% of the market. You cannot buy back a company you took bankrupt.',
      'Win and the company is yours with no debts, its staff rehired and its licence included. 20% of your bid stays in it as working cash. If nobody bids, the price drops 40% for 10 more days, then the plant is scrapped.',
    ],
    todo: 'Watch for plants in markets you know, or that feed your own companies. A cheap plant with no debts can pay back far faster than building new.',
  },
  {
    icon: '🌋', name: 'Natural disasters & insurance',
    see: 'A red banner and news such as "🌀 Hurricane batters the coast: 9 companies are damaged". Hit companies show the damage and a repair bill.',
    how: [
      'About one disaster every two to three years, with no warning: earthquakes (any industry), floods and wildfires (farms, forests, power, freight, shops), hurricanes (oil, power, plastics, chemicals, freight), droughts (crops and power), pandemics (everyone; medicine and clinics boom, shops and cars slump) and solar storms (power, chips, networks, banking).',
      'Each one hits most companies in those industries: output drops for weeks or months, and there is a repair bill of a few % of the plant\'s value. Shortages push prices up for whoever is still running.',
      'Insurance (Company → Operations) costs 1.2% of the plant\'s value a year and pays 80% of repair bills from disasters and fires.',
      'Uninsured rival plants that are badly hit can go bankrupt, and then they come up at auction.',
    ],
    todo: 'Insure your big plants. Keep some cash spare so a disaster bill does not push a company into loans.',
  },
  {
    icon: '⛏️', name: 'Raw materials: reserves',
    see: 'Raw companies (iron ore, grain, cotton, silicon, timber, crude oil) show "Reserves left" on Company → Operations, with an Explore button.',
    how: [
      'Raw producers need no inputs, so they cost more: a dearer plant, a $2M resources licence or a $1.5M energy licence (your first licence is free), and 15% more upkeep.',
      'Every unit uses up the reserve. A full plant runs dry in about 4 years. Below 50% each unit costs more to extract (up to double); below 25% output falls.',
      'Exploring brings the reserve back to 100%. It costs more the emptier the reserve is. Auto-explore (on by default) pays below 30%, borrowing or using your cash if needed.',
    ],
    todo: 'Explore before reserves hit 50% when cash allows. A raw plant pays back in about 10 months, against 5–6 for most products, but it feeds your whole chain.',
  },
  {
    icon: '🚀', name: 'Mega businesses & permits',
    see: 'Space launches, defense, airlines, robots, hospitals and wellness carry a "Permit" badge in the Planner.',
    how: [
      'On top of the industry licence, the government charges a one-off permit: robots $250M, wellness $300M, airlines $400M, defense $500M, space $750M, hospitals $1B.',
      'The plants are huge too ($13M to $66M to found) and every upgrade costs far more than in other businesses. In return the markets are big, and few rivals can afford to enter.',
      'Buying a company in one of these markets, or winning one at auction, brings its permit with it.',
      'Tycoons start mega businesses when a market runs short, and they pay the permit too.',
    ],
    todo: 'Save up, bring in a partner, or buy an existing plant at auction. Your permit lasts for good, so later plants only cost the plant.',
  },
  {
    icon: '🏥', name: 'Regulated healthcare',
    see: 'Hospitals and wellness show a "Regulated" badge. The price slider stops at the market price.',
    how: [
      'The government caps the price: you cannot charge more than the market price, and shortages do not push it up. Rising costs still pass through.',
      'Margins are thin, about 5-8% for a small plant, a little more as you grow, because fixed costs fall as a share of sales.',
      'Demand hardly moves with the economy or with price. Hospitals are the biggest market in Astoria, and pandemics fill them.',
    ],
    todo: 'A safe, steady earner once you are big. Pay for it with partners, then grow it level by level.',
  },
  {
    icon: '🤝', name: 'Founding with partners',
    see: 'Planner → any project over $5M (mega businesses, banks) → "Bring in a partner".',
    how: [
      'A partner pays the same share of the founding bill (plant plus permit) as the share of the company they get, up to 49%, so you keep control.',
      'Rivals who know the industry and tycoons go up to 49%; other rivals and the Astoria Growth Fund up to 30%. They need the cash, and will not work with you if they dislike you.',
      'Partners get their share of the dividends and of the price if you sell. You can buy them out later from Financials.',
    ],
    todo: 'Use partners to get into a $1B hospital years earlier. Rivals like you more after co-founding.',
  },
  {
    icon: '🔗', name: 'New supply chains',
    see: 'The Supply chain map now has 46 markets in 7 rows.',
    how: [
      'New raw materials: copper, lithium, bauxite, rare earths, limestone and natural gas.',
      'They feed aluminium, batteries, cement, water and construction, which feed robots, AI, real estate, hospitals, rockets and more.',
      'Old products use them too: power and plastics burn gas, chips need copper and rare earths, phones, laptops and cars need batteries, car plants and online stores buy robots, banks use AI.',
    ],
    todo: 'A shortage of one raw material now ripples far. Owning the base of a chain (gas, copper, lithium) feeds many industries.',
  },
  {
    icon: '🎩', name: 'Tycoons',
    see: 'Eight hands-on tycoons in People & Rivals with a Tycoon badge: Moln Eusk, Mas Saltman, Gill Bates, Hukesh Mambani, Jeff Bozes, Zark Muckerberg, Hensen Juang and Barren Wuffett.',
    how: [
      'Each runs businesses across several industries and starts new companies in short, growing markets, usually grabbing about 8% of that market.',
      'They bid at bankruptcy auctions and trade shares like the other rivals.',
      'They may offer to buy 15–20% of your fast-growing private companies above the fair price: accept, ask for 25% more (they may walk) or decline.',
      'Their profile shows the companies they founded or bought, how much those earn, and how they play.',
    ],
    todo: 'Take a tycoon\'s money when you need cash to grow; turn it down when you want all the profit. Expect them in any market that runs short.',
  },
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
    how: ['Above 40% share, buyers switch away half as easily when you raise prices.', 'Each month there is a chance of an antitrust investigation, rising with your share.', 'You choose: pay a fine of 20% of a year\'s profit (never more than half of it), fight in court (45% chance, better with a strong brand; lose = 1.5x the fine), or sell 25% of the plant (capacity and fixed costs both drop 25%).', 'Auto-upgrade stops above 40% share: there are no buyers left to grow into. If a plant is far bigger than its sales, close a production line in its Automation tab.'],
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
