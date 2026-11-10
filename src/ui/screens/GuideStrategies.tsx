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

const RUNNING: Feature[] = [
  {
    icon: '🧲', name: 'Winning customers',
    see: 'Company › Overview › Running the business: the Customers bar shows how many buyers you have compared with an established firm, and how many weeks until 80%.',
    how: [
      'A new company starts with about a quarter of the customers an established firm has, so it loses money for the first few months.',
      'Marketing wins customers faster: shoppers follow brands (about 5% of sales is typical for products), while factories buying materials mostly compare price (2–3% is plenty).',
      'Happy customers stay. Satisfaction comes from filling orders, a fair price and quality close to your rivals. Unhappy customers slowly drift away.',
      'Your assistant tells you how much to spend and how many weeks it saves.',
    ],
    todo: 'Spend on marketing while you build up customers, then trim it once you are established. Never run out of stock.',
  },
  {
    icon: '📥', name: 'The monthly inbox',
    see: 'Home › Inbox. Two to five decisions a month: pay claims, volume deals, cheaper suppliers, faulty batches, worn machines, training, late payers, rival attacks.',
    how: [
      'Every choice is a trade-off: cash now against morale, customers or risk later.',
      'If you do not answer within two weeks, the default happens. It is rarely the best choice.',
      'A manager can answer for you (Company › Running the business): a manager picks safe choices after two days and keeps machines and supplies in order; a top manager picks the best one at once and runs the whole company.',
      'A top manager checks price, customers, satisfaction, quality, pay, stock, the warehouse share and cash every week, and sends one report to your assistant. Upgrades and deals it recommends wait for you: tap Approve.',
    ],
    todo: 'Check the inbox once a month, and whenever a rival makes a move. Big, risky choices are worth your attention; hire managers for companies you do not want to watch.',
  },
  {
    icon: '⚔️', name: 'Rivals fight back',
    see: 'When you enter a market, the biggest rival there gets in touch. When you take their customers, their move lands in your inbox.',
    how: [
      'Aggressive rivals cut prices for six weeks; ambitious ones flood the market with ads; some poach your best staff; ruthless ones spread rumours.',
      'You can match a price cut, answer with your own ads, pay retention bonuses, or sue.',
      'Friendly rivals strike back less often. Telling one "I\'m here to win" makes them watch you closely.',
    ],
    todo: 'Match price cuts only when your margin can take it; otherwise counter with ads or ride it out.',
  },
  {
    icon: '🔧', name: 'Machines, staff and cash flow',
    see: 'Company › Overview › Running the business: machines, team experience and money owed by customers.',
    how: [
      'Machines wear as they run. Normal maintenance keeps up with a busy plant; low saves money but output drops and breakdowns rise; high brings worn machines back.',
      'New hires start slower and learn over a few weeks. Unhappy staff quit, and every replacement starts green.',
      'Factories and shops that buy your materials pay over about a month, so profit arrives as cash later. Shoppers pay at once.',
    ],
    todo: 'Keep maintenance normal, morale above 60% and a cash buffer for the month your customers take to pay.',
  },
  {
    icon: '📉', name: 'Booms and recessions',
    see: 'News warns of a coming recession about two months ahead. The World tab and your assistant show where the economy is.',
    how: [
      'Every few years a recession cuts what shoppers buy by about 10% for 6 to 11 months; a recovery follows.',
      'Some products grow for years (AI, robots, online stores, gaming) while others slowly fade (phones, laptops, fashion).',
    ],
    todo: 'Build cash before a downturn, avoid big loans, and put new money into growing markets.',
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
    see: 'Planner → any product → "Bring in a partner". Each partner shows how keen they are.',
    how: [
      'A partner pays the same share of the founding bill (plant plus permit) as the share of the company they get, up to 49%, so you keep control.',
      'Make an offer. They say yes, ask for a different share (keen partners want more, unsure ones put in less) or say no. They look at your size and record, the market, and how well you get on. After three offers they want a break for a month.',
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
    how: ['Offers come from rival companies short of a material and from the government.', 'Pay is about the market price (−3% to +5%); rush jobs of 30–45 days pay 3–6% more. The real prize is a guaranteed buyer at a locked price.', 'Each company runs 2 contracts at first, one more every 2 plant levels (up to 6), and contracts can book at most 70% of its output.', 'Each day deliveries come out of your stock before normal sales, then from your warehouses.', 'Finish within 75% of the time for a 5% bonus; a miss costs up to 25%. Done: XP and a better relationship. Missed: penalty and an angry rival.'],
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
    see: 'Business tab → Warehouses (or Deals & Strategies → Warehouses) shows how full each one is, what is inside, its value and the daily cost. Each company\'s Supply & Deals tab shows its own stored stock with Sell and Send buttons, and your assistant tells you when prices make it worth selling.',
    how: ['Build one for $400K (each next one costs 80% more) and upgrade it to level 10: +60% space a level. One warehouse holds any mix of products.', 'On a company\'s Overview, "Where your output goes" sends a share of each day\'s output to the warehouse (or turn on "Send extra output to the warehouse" in Automation to store only what it cannot sell).', 'Storage costs about $600 a day in rent plus a share of the stock\'s value. Durable goods lose 0.25% a month, food and crops far more, and anything kept over 3 months loses more each month. Electricity and services cannot be stored.', 'Sell by hand, or set auto-sell when the price is 10–40% above what you paid. Stock goes back to your company to sell, or to traders at 95% of the price if you do not make it.', 'From level 6, buy stock from the market with standing buy orders.'],
    todo: 'Store when prices are low, sell when demand and prices are high.',
  },
  {
    icon: '🏛️', name: 'Government tenders', unlock: 'tenders',
    see: 'Your assistant (and a pause, if it is on in More) tells you when a tender opens: "New tender: City Hospital wants medicine. 2,000 a month for 9 months."',
    how: ['Governments and big companies buy huge amounts over 6 to 12 months. Bids close after 14 days.', 'Tap Start tender to enter the tender room: you and 2–4 rivals take turns to bid lower. A rival drops out when it would go below its costs (aggressive owners go closer).', 'Lowest price wins, but quality counts (each 0.1 is worth 2.5% of price) and so does being able to deliver it all every day.', 'The room shows your cost, profit per unit, units a month, months, revenue and profit before you bid.', 'Deliveries are checked every month: a short month costs 10% of the missing units\' value.', 'Winning pays 15% of the whole contract up front; each delivery then pays the rest. Miss the contract and the unused part of the advance goes back.', 'Buyers reject bids below 80% of the market price: nobody believes a price that low.', 'Your record counts: each tender or board contract delivered in full is worth 1% of price in your favour, each one you fail costs 2% (up to 8% either way).', 'More tenders appear when the economy slows down.'],
    todo: 'Stay above your unit cost: winning at a loss means losing money for a year. Drop out when the profit gets too thin.',
  },
  {
    icon: '📮', name: 'Your own contract requests',
    see: 'Deals & Strategies → Contracts → Post a request. Replies arrive in your assistant after about 2 days.',
    how: ['Ask to buy an input, or offer your product, at your price, amount a day and length.', 'Companies that can do it reply within 2 days with their terms. Sign the one you like; the request closes after 9 days.', 'Up to 3 requests at once. A price far from the market gets no replies.'],
    todo: 'Lock in cheap inputs before a shortage, or sell a year of output ahead.',
  },
  {
    icon: '📊', name: 'Budget & forecast',
    see: 'More → Budget & forecast, or the Budget card on the Business tab.',
    how: ['A 12-month forecast of revenue, profit and cash for each company and all together, from the last 30 days, growing with the economy, after tax and dividends.', 'What if: move price, wages or marketing, or tick an upgrade, and compare against today. A higher price loses about 1.8% of sales for each 1%.', 'Save it as your plan: at the end of each month you see what you really made against it.'],
    todo: 'Check an upgrade here before you buy it: it shows how many months it takes to pay back.',
  },
  {
    icon: '👔', name: 'Executives',
    see: 'More → Executives. Three candidates for each role every month, with stars, personality and salary.',
    how: ['CFO: customers pay faster, up to 6% less tax, and a warning when a company will run out of cash within 3 months.', 'Head of Sales: customers come up to 35% faster and board contracts pay up to 5% more.', 'Operations Chief: workers make up to 7% more and machines wear up to 40% more slowly.', 'They work for all your companies. Hiring costs 30 days of salary, and so does letting someone go.', 'Underpaid or ambitious ones get unhappy, work less and may quit. A 10% raise cheers them up. Stars cost more and get calls from rivals.'],
    todo: 'Hire when your empire is big enough that a few % on every company is worth more than the salary.',
  },
  {
    icon: '🔬', name: 'R&D labs & patents',
    see: 'Company → R&D: what research gives the company now, the current project, the team, and patents (yours and rivals\').',
    how: ['Hire researchers (1–5 stars). Skill counts twice over, and someone from the company\'s own industry works almost twice as fast as an outsider. The R&D budget in Operations adds a little more. A Head of R&D (More › Executives) speeds up every lab.', 'Pick a project: cheaper production, better quality, or a premium version customers accept at a higher price.', 'Each project has 3 milestones. Every milestone gives a small gain that lasts (smaller each time you repeat the same kind).', 'At the end there is a rare breakthrough: usually 7–15%, up to 35% with top people. It becomes a 5-year patent: 18% cheaper units, +0.15 quality, or 12% more price room. A miss makes the next try on the same idea likelier.', 'Your patents help all your companies making the same product, and related products at half strength (cheaper production only).', 'License a patent to rivals for a fee on every unit they sell, or license theirs. Rivals research too: if one patents your idea first, your prize halves.'],
    todo: 'Put the best people in the right field on your biggest product. A patent that cuts cost by 18% lets you undercut everyone and still win tenders.',
  },
  {
    icon: '🌍', name: 'Countries & exports', unlock: 'world',
    see: 'World tab: tap a country on the map to see what it is short of and has spare. Coloured dots show how it gets on with Astoria. Trade with… opens selling, buying and swaps.',
    how: ['Eight countries, each with its own currency, tariff and days by sea. Short goods sell for up to 40% more than at home; spare goods are cheap to buy.', 'Ship goods from your warehouses. You pay shipping when the ship leaves, and they sell on arrival at that day\'s price and exchange rate, minus the tariff. Selling a lot at once lowers the price.', 'Buy spare goods to bring home into your warehouses (a 5% import tariff, none from allies).', 'Swaps: a country offers its spare goods for what it lacks, worth 5–22% more, with no tariff.', 'Countries trade with each other too. When two go to war they pay more for food, steel, medicine and fuel. If Astoria falls out with a country, trade with it stops and ships turn back.', 'Every trade builds goodwill: friends charge lower tariffs, allies less than half.', 'Each country has its own economy: a boom there means it pays more for what it buys, a recession means less. Its central bank raises rates in a boom, which pulls its currency up.', 'A trade office ($1.5M, $40K a month) halves that country\'s tariff, and ships there sail 30% faster and 25% cheaper.', 'Astoria signs free-trade deals with friends (no tariffs either way) and puts sanctions on countries it falls out with or that attack its allies (no trade at all).', 'The world reaches home: a war between oil exporters makes oil (and what importers charge for it) dearer in Astoria, a glut abroad makes it cheaper, and Astoria\'s exports fall when its trading partners fight, fall out with it, or see their money weaken.'],
    todo: 'Store goods when home prices are low and ship them to whoever is short. Watch the exchange rate: a falling currency eats your profit.',
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

      <SectionTitle>Running a real business</SectionTitle>
      <div className="space-y-2">{RUNNING.map((f) => <FeatureCard key={f.name} f={f} level={level} />)}</div>
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
