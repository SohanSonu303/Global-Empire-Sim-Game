import { useState, type ReactNode } from 'react';
import { useGame, type GuideSection } from '../../store/game';
import { GOODS, GOOD_IDS, INDUSTRIES, startCost } from '../../engine/data';
import { netWorth } from '../../engine/progress';
import { rivalWorth } from '../../engine/rewards';
import { fmtMoney, fmtPct } from '../../engine/news';
import { BearBadge, BullBadge, IndustryThumb, Portrait } from '../art/art';
import { Badge, Button, Card, Chips, Screen, SectionTitle, cx } from '../components/core';
import { IconBriefcase, IconChart, IconDots, IconGlobe, IconHome, IconPause, IconPlay, IconTarget } from '../components/Icons';
import { SubHeader } from './More';
import { Strategies } from './GuideStrategies';

const SECTIONS: { id: GuideSection; label: string }[] = [
  { id: 'about', label: 'The game' },
  { id: 'play', label: 'How to play' },
  { id: 'win', label: 'How to win' },
  { id: 'grow', label: 'How to grow' },
  { id: 'business', label: 'Grow a business' },
  { id: 'markets', label: 'Stocks' },
  { id: 'deals', label: 'Stakes, takeovers & banks' },
  { id: 'strategies', label: 'Business strategies' },
  { id: 'economy', label: 'A living economy' },
  { id: 'world', label: 'The world' },
  { id: 'rivals', label: 'Beat rivals' },
];

export function GuideScreen({ section = 'about' }: { section?: GuideSection }) {
  const [tab, setTab] = useState<GuideSection>(section);
  const idx = SECTIONS.findIndex((s) => s.id === tab);
  const go = (i: number) => {
    setTab(SECTIONS[i].id);
    document.querySelector('main')?.scrollTo({ top: 0 });
  };
  return (
    <div>
      <SubHeader title="How to Play" sub="Everything you need to build your empire" />
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-line px-gutter py-1">
        <Chips items={SECTIONS} value={tab} onChange={(v) => go(SECTIONS.findIndex((s) => s.id === v))} />
      </div>
      <Screen>
        {tab === 'about' && <About />}
        {tab === 'play' && <Play />}
        {tab === 'win' && <Win />}
        {tab === 'grow' && <Grow />}
        {tab === 'business' && <Business />}
        {tab === 'markets' && <Markets />}
        {tab === 'deals' && <Deals />}
        {tab === 'strategies' && <Strategies />}
        {tab === 'economy' && <Economy />}
        {tab === 'world' && <World />}
        {tab === 'rivals' && <Rivals />}
        <div className="flex gap-2 mt-6">
          <Button variant="dark" block disabled={idx === 0} onClick={() => go(idx - 1)}>Back</Button>
          {idx < SECTIONS.length - 1 ? (
            <Button block onClick={() => go(idx + 1)}>Next: {SECTIONS[idx + 1].label}</Button>
          ) : (
            <Button block onClick={() => useGame.getState().back()}>Start playing</Button>
          )}
        </div>
        <p className="text-center text-xs text-dim mt-3">Page {idx + 1} of {SECTIONS.length}</p>
      </Screen>
    </div>
  );
}

/* ---------------------------------------------------------------- building blocks */

function Hero({ art, title, children }: { art: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="mt-4 p-4 overflow-hidden bg-gradient-to-br from-card-2 to-card">
      <div className="flex items-center gap-4">
        <div className="shrink-0">{art}</div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight">{title}</h2>
          <p className="text-sm text-muted mt-1 leading-relaxed">{children}</p>
        </div>
      </div>
    </Card>
  );
}

function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={it.title}>
          <Card className="p-3">
            <div className="flex gap-3">
              <span className="grid place-items-center size-8 shrink-0 rounded-full bg-gold text-gold-ink font-black text-sm">{i + 1}</span>
              <div className="min-w-0">
                <div className="font-bold">{it.title}</div>
                <div className="text-sm text-muted leading-relaxed mt-0.5">{it.body}</div>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}

function Lever({ icon, name, effect, tip }: { icon: ReactNode; name: string; effect: string; tip: string }) {
  return (
    <div className="flex gap-3 px-3 py-3">
      <span className="grid place-items-center size-10 shrink-0 rounded-lg bg-card-2 text-gold text-lg font-black">{icon}</span>
      <div className="min-w-0">
        <div className="font-bold">{name}</div>
        <div className="text-sm text-text/90 leading-relaxed">{effect}</div>
        <div className="text-xs text-gold mt-1 leading-relaxed">Tip: {tip}</div>
      </div>
    </div>
  );
}

function Tip({ tone = 'gold', children }: { tone?: 'gold' | 'warn'; children: ReactNode }) {
  return (
    <div className={cx('mt-3 rounded-lg border px-3 py-2.5 text-sm leading-relaxed', tone === 'gold' ? 'border-gold/40 bg-gold/10 text-text' : 'border-amber/40 bg-amber/10 text-text')}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- sections */

function About() {
  const w = useGame((s) => s.world)!;
  const richest = Math.max(...w.rivals.map((r) => rivalWorth(w, r)));
  return (
    <>
      <Hero art={<IndustryThumb industry="tech" size={84} level={2} />} title="Build a business empire">
        You start with a little money in the Republic of Astoria. Start companies, make them profitable, invest in stocks,
        and become the richest person in the country.
      </Hero>
      <SectionTitle>Your goal</SectionTitle>
      <Card className="p-4">
        <p className="text-sm leading-relaxed">
          Five billionaires already run Astoria. Your score is your <b className="text-gold">net worth</b>, which is your cash,
          plus the value of your companies, plus your shares, minus your loans. Climb the rich list past every rival to
          become number one. The How to win page shows the way.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-lg bg-surface border border-line p-3">
            <div className="text-xs text-muted">You now</div>
            <div className="num text-lg font-bold">{fmtMoney(netWorth(w))}</div>
          </div>
          <div className="rounded-lg bg-surface border border-line p-3">
            <div className="text-xs text-muted">Richest rival</div>
            <div className="num text-lg font-bold text-gold">{fmtMoney(richest)}</div>
          </div>
        </div>
      </Card>
      <SectionTitle>What makes it different</SectionTitle>
      <Steps
        items={[
          { title: 'A living economy', body: 'GDP, inflation, interest rates and oil prices change over time and affect every company, including yours.' },
          { title: 'Real competition', body: 'Customers compare your price, brand and quality with 20 AI companies. Rivals react to what you do.' },
          { title: 'Every number is explained', body: <>Tap any number with a <span className="underline decoration-dotted">dotted underline</span> to see exactly how it was calculated.</> },
        ]}
      />
    </>
  );
}

function Play() {
  return (
    <>
      <Hero
        art={
          <div className="grid place-items-center size-20 rounded-full bg-gold text-gold-ink btn-edge"><IconPlay size={36} /></div>
        }
        title="Time only moves when you press Play"
      >
        The game starts paused. Use the bar at the bottom of the screen to start, pause and speed up time.
      </Hero>
      <SectionTitle>The time bar</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon={<IconPlay size={18} />} name="Play" effect="Starts time. One day passes every 1.5 seconds at 1x." tip="The gold bar fills up as each day passes." />
        <Lever icon={<IconPause size={18} />} name="Pause" effect="Stops time so you can think and make changes." tip="The game pauses by itself when an important event needs your answer." />
        <Lever icon="⏩" name="1x · 2x · 5x" effect="Choose how fast days pass. 5x is about 3 days per second." tip="Use 5x when things are going well and you are waiting for cash." />
      </Card>
      <SectionTitle>Your first 10 minutes</SectionTitle>
      <Steps
        items={[
          { title: 'Start a company', body: 'Tap an empty plot on Home, or + New on Business. The Planner shows what is in demand, what it costs to start and a profit forecast.' },
          { title: 'Press Play', body: 'Watch Profit / day on Home. Your new company makes a small profit at first.' },
          { title: 'Claim your goals', body: "Today's Goals on Home give cash and XP. Tap Claim when a goal is done." },
          { title: 'Answer your inbox', body: 'Every month your staff and customers bring a few decisions, and rivals write when they make a move (Home › Inbox). Each choice says what it changes. Unanswered ones take the default after two weeks.' },
          { title: 'Upgrade when you have cash', body: 'Open your company and tap Upgrade. A bigger company can sell more.' },
        ]}
      />
      <SectionTitle>Your money and company money</SectionTitle>
      <Card className="p-4">
        <p className="text-sm leading-relaxed">
          Your <b className="text-gold">personal cash</b> (shown at the top of the screen) and each company's cash are
          kept apart, like your own wallet and a company's bank account.
        </p>
      </Card>
      <Card className="divide-y divide-line mt-2">
        <Lever icon="📜" name="Industry licence" effect="You may only found companies in industries you hold a licence for. The first one is free; the others are paid to the government." tip="New plants cost more in easy, high-margin businesses like ores, cars and appliances. Most pay back in one to two years, faster if you run them well." />
        <Lever icon="👛" name="Personal cash" effect="Pays to found companies, buy shares, industry licences, and the part of an upgrade the company can't cover." tip="Goal rewards and dividends from your companies land here." />
        <Lever icon="🏦" name="Company cash" effect="Pays that company's materials, wages, running costs and loan interest." tip="Each company keeps its own profits. Set a dividend in Automation to send part of them to you." />
        <Lever icon="➡️" name="Invest" effect="Moves 25% of your personal cash into the company (Financials tab)." tip="Use it when a company is low on cash, so it does not borrow and pay interest." />
        <Lever icon="⬅️" name="Withdraw spare" effect="Moves the company's cash above its safety buffer back to you." tip="Handy before founding another company or buying shares." />
      </Card>
      <p className="text-xs text-dim mt-2">
        Moving money between them does not change your net worth. If a company's cash stays below zero for about 45 days, it goes bankrupt.
      </p>
      <SectionTitle>The five tabs</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon={<IconHome size={18} />} name="Home" effect="Your city, your assistant, your money and today's goals." tip="Tap a building to open that company, or an empty plot to plan one." />
        <Lever icon={<IconBriefcase size={18} />} name="Business" effect="All your companies and the supply chain map. A dot means one needs attention." tip="Tap + New to open the planner and start another company." />
        <Lever icon={<IconChart size={18} />} name="Markets" effect="The stock exchange. Buy and sell shares of 20 companies." tip="The mood bar shows if investors feel bullish or bearish." />
        <Lever icon={<IconGlobe size={18} />} name="World" effect="Astoria's economy: growth, inflation, jobs and interest rates. From level 5, the other eight countries and trade with them." tip="High interest rates make loans expensive." />
        <Lever icon={<IconDots size={18} />} name="More" effect="Newspaper, rivals, statistics, achievements, saves and this guide." tip="Read the newspaper to see what rivals are doing." />
      </Card>
    </>
  );
}

function Win() {
  const w = useGame((s) => s.world)!;
  const ranked = [...w.rivals].sort((a, b) => rivalWorth(w, b) - rivalWorth(w, a));
  const nw = netWorth(w);
  const above = ranked.filter((r) => rivalWorth(w, r) > nw).length;
  return (
    <>
      <Hero art={<div className="text-6xl">🏆</div>} title="Become the richest in Astoria">
        You win by passing every rival on the rich list. Your score is your net worth: cash, plus what your companies
        and shares are worth, minus your loans.
      </Hero>
      <Card className="p-4 mt-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface border border-line p-3">
            <div className="text-xs text-muted">Your rank</div>
            <div className="num text-lg font-bold">#{above + 1} of {ranked.length + 1}</div>
          </div>
          <div className="rounded-lg bg-surface border border-line p-3">
            <div className="text-xs text-muted">Next to pass</div>
            <div className="text-sm font-bold text-gold truncate">{above > 0 ? ranked[above - 1].name : 'Nobody: you are #1'}</div>
            {above > 0 && <div className="num text-xs text-muted">{fmtMoney(rivalWorth(w, ranked[above - 1]))}</div>}
          </div>
        </div>
      </Card>
      <SectionTitle>The road to number one</SectionTitle>
      <Steps
        items={[
          { title: '1. One profitable company', body: 'Pick a product that is short (the Planner shows it). Hire until output nears capacity and price close to the market. Most plants pay back in one to two years.' },
          { title: '2. Grow it, then build a chain', body: 'Upgrade when it sells out. Then start the companies that supply it, so you keep the margin your suppliers made, and sell what is left to others.' },
          { title: '3. Put spare money to work', body: 'Idle cash earns nothing. Buy dividend shares, buy stakes in private companies, bid at bankruptcy auctions, and win government tenders.' },
          { title: '4. Spread out (level 5+)', body: 'Open the world: ship goods where they are short, buy where they are spare, and open trade offices in your best markets. Use R&D to patent cheaper ways to make things.' },
          { title: '5. Take on the billionaires', body: 'Enter their industries with big, efficient plants, undercut them, and buy their weak companies. The Beat rivals page has the details.' },
        ]}
      />
      <SectionTitle>Habits that win</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon="📉" name="Watch your margin" effect="Profit ÷ sales. Above 10% is healthy for most goods; regulated care runs 5–8%." tip="If it falls, check prices, wages and input costs on the company's Overview." />
        <Lever icon="💵" name="Never run dry" effect="A company below zero cash for about 45 days goes bankrupt." tip="Keep a buffer, and lower dividends before a big upgrade." />
        <Lever icon="🔔" name="Listen to the assistant" effect="It warns about shortages on the way, price wars, cash trouble and chances abroad." tip="Each tip has a button that takes you straight to the fix." />
        <Lever icon="🧭" name="Read the cycle" effect="Save cash in a boom. In a slump weak rivals go bankrupt and their plants are sold cheaply at auction." tip="The World tab shows where Astoria is in its cycle." />
      </Card>
      <Tip>A company that stays below zero cash goes bankrupt and is sold at auction. Spread your risk over several companies and industries.</Tip>
    </>
  );
}

function Economy() {
  return (
    <>
      <Hero art={<IndustryThumb industry="finance" size={84} level={2} />} title="Everything is connected">
        Every company buys from others and sells to others, so a change in one market travels down the supply chain.
        Rivals think for themselves, and the government and the central bank react to the economy.
      </Hero>
      <SectionTitle>Between companies</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon="🏷️" name="Price competition" effect="A rival with spare capacity and a fat margin cuts its price about 3% at a time to win buyers, especially when someone else is cheaper." tip="If rivals undercut you, compete on quality and brand, or cut costs with R&D before you match them." />
        <Lever icon="🏗️" name="Rivals expand only when needed" effect="They build more capacity when they are sold out and the whole market is still short after the new plant opens." tip="A market that stays short and profitable is your chance too." />
        <Lever icon="🚪" name="Newcomers" effect="When a market stays short and very profitable (margins above about 18%), a rich rival launches a new company there. A market with only one maker draws a challenger on a much lower margin, even if it needs a government permit." tip="High margins never last forever: get big before the newcomers arrive." />
        <Lever icon="🤝" name="Mergers and the regulator" effect="Rich rivals buy out weaker companies in markets where they already sell. The regulator blocks any deal that would give one group more than 40% of a market, and that rule applies to you too." tip="A rival group that merges can set prices together; expect tougher competition in that market." />
        <Lever icon="💰" name="What rivals do with money" effect="They pay down their companies' debts, buy shares and companies, and spend part of a big fortune on themselves." tip="A rival with lots of cash can outbid you at auctions; one with lots of debt is weak when rates rise." />
      </Card>
      <SectionTitle>Shocks travel down the chain</SectionTitle>
      <Card className="p-4 text-sm leading-relaxed">
        When a raw material or part jumps more than 12% in a month (a war abroad, a disaster at a mine, a plant closing),
        the news reports it and names the goods that will cost more next. If one of your companies buys it, the assistant
        warns you before your costs rise. Stock up in a warehouse, sign a supply deal at today's price, or raise your own
        price a little.
      </Card>
      <SectionTitle>Workers by industry</SectionTitle>
      <Card className="p-4 text-sm leading-relaxed">
        Each industry has its own labour market. When an industry is short of workers or the whole country is near full
        employment, its wages rise, most in skilled fields like tech and finance and least in retail. The Employees tab
        on each company shows its industry's wage level against normal. Higher wages push that industry's prices up
        over time.
      </Card>
      <SectionTitle>The home economy</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon="📈" name="Growth and the cycle" effect="Astoria moves through booms and slowdowns. Shoppers spend more in a boom and less in a slump." tip="Regulated care barely changes; most other products follow shoppers' incomes." />
        <Lever icon="🔥" name="Inflation" effect="Rising costs and rising prices feed each other. The central bank raises its rate when inflation runs above 2%." tip="A higher rate makes your loans dearer and stock prices lower." />
        <Lever icon="👷" name="Jobs" effect="Unemployment falls when companies hire faster than usual and rises when they cut." tip="Low unemployment means higher wages for everyone." />
      </Card>
    </>
  );
}

function World() {
  return (
    <>
      <Hero art={<div className="text-6xl">🌍</div>} title="Eight countries, one world economy">
        From level 5 the World tab opens the rest of the world. Until then you trade only at home.
      </Hero>
      <SectionTitle>Each country has its own economy</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon="🔄" name="Booms and recessions" effect="Each country grows around its own normal rate (fast in emerging Bharatara, slow in Varnholm) in cycles, with the odd financial crisis." tip="A country in a boom pays more for what it buys: ship there. One in recession pays less." />
        <Lever icon="🏛️" name="Interest rates" effect="Its central bank raises rates when the economy runs hot and cuts them in a slump." tip="Shown on each country's card on the map." />
        <Lever icon="💱" name="Exchange rates" effect="Money flows to higher interest rates: when a country's rate rises above Astoria's, its currency climbs, so your goods sell there for more dollars." tip="War weakens a currency. A fall while your ship is at sea cuts what you get." />
      </Card>
      <SectionTitle>Trade with them</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon="🚢" name="Export and import" effect="Ship goods from your warehouses to countries short of them, or bring home what they have spare." tip="Short goods sell for up to 40% more than at home, before tariff and shipping." />
        <Lever icon="🏢" name="Trade office" effect="$1.5M to open, $40K a month. That country's tariff is halved, and ships sail 30% faster and 25% cheaper." tip="Open one in the country you trade with most. It slowly builds goodwill too." />
        <Lever icon="🔁" name="Swaps" effect="A country offers its spare goods for what it lacks, worth 5–22% more, with no tariff." tip="New offers come each month." />
      </Card>
      <SectionTitle>Politics: deals, sanctions and wars</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon="✍️" name="Free-trade deals" effect="Astoria signs them with friendly countries: no tariffs either way for two to four years." tip="Winners: makers of what that country lacks. Losers: makers of what it has spare, who face cheaper imports." />
        <Lever icon="🚫" name="Sanctions" effect="Astoria stops all trade with a country it has fallen out with, or one that attacks an ally." tip="Winners: makers of what that country used to sell. Losers: exporters who sold there." />
        <Lever icon="⚔️" name="Wars" effect="Countries at war pay more for food, steel, medicine and fuel, and stop trading with each other. If Astoria falls out badly with a country, trade stops and ships turn back." tip="A war between oil countries makes fuel dearer at home too." />
      </Card>
      <Tip>The world reaches home: world prices set what importers charge in Astoria, and foreign demand for Astoria's goods rises in a global boom and falls in wars and recessions.</Tip>
    </>
  );
}

function Grow() {
  const w = useGame((s) => s.world)!;
  const next = w.goals.filter((g) => !g.claimed).slice(0, 4);
  return (
    <>
      <Hero art={<IndustryThumb industry="finance" size={84} level={7} />} title="Level up your empire">
        You grow in three ways: more money (net worth), a higher player level (XP), and bigger companies (company levels 1 to 25).
      </Hero>
      <SectionTitle>The growth path</SectionTitle>
      <Steps
        items={[
          { title: 'Early game: one industry', body: 'Your first industry licence is free. Get one company profitable, hire until output is close to capacity, then upgrade. Buy the materials you are missing from rivals with supply deals instead of building everything yourself.' },
          { title: 'Mid game: more industries', body: 'Each new industry needs a government licence ($200K for retail, $250K for services, up to $1M for finance and $2M for resources, and 50% more for every licence you already hold). Buy it in the Planner, or get it free by buying a company in that industry.' },
          { title: 'Late game: mega businesses', body: 'Space, defense, airlines, robots, hospitals and wellness also need a government permit ($250M to $1B). Bring in a partner to share the bill, or buy an existing plant at auction to get the permit with it.' },
          { title: 'Mid game: make money work', body: 'Put spare cash into stocks that pay dividends, instead of leaving it idle.' },
          { title: 'Late game: take on the billionaires', body: 'Build big companies in the rivals’ industries and take their customers. See the Beat rivals page.' },
        ]}
      />
      <SectionTitle>XP and player level</SectionTitle>
      <Card className="p-4 text-sm leading-relaxed">
        You earn XP from <b>goals</b> and <b>achievements</b>. The thin gold line under <b>Lv</b> in the top bar shows how close you are to the
        next level. Goals also give cash, so claim them as soon as they are done.
      </Card>
      {next.length > 0 && (
        <>
          <SectionTitle>Your next goals</SectionTitle>
          <Card className="divide-y divide-line">
            {next.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-3 py-3">
                <IconTarget className="text-gold shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{g.label}</div>
                  <div className="text-xs text-muted">Reward {fmtMoney(g.rewardCash)} · {g.rewardXp} XP</div>
                </div>
                {g.progress >= g.target && <Badge tone="gold">Ready</Badge>}
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function Business() {
  return (
    <>
      <Hero art={<IndustryThumb industry="manufacturing" size={84} level={6} />} title="How a company makes money">
        Profit = what you sell × your price, minus wages, materials, running costs and loan interest.
      </Hero>
      <Tip>
        <b>Rule of thumb:</b> you sell the smallest of three numbers: your <b>capacity</b> (factory size), what your <b>workers</b> can
        make, and how much <b>customers</b> want. Grow whichever one is the smallest.
      </Tip>
      <SectionTitle>Your six controls</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon="👥" name="Hire" effect="More workers make more goods, but each worker costs a daily wage." tip="If Output is far below Capacity, hire more people." />
        <Lever icon="⬆" name="Upgrade" effect="Raises capacity and the company level. Your first upgrade costs about 1.4× the plant's base price, and each level after that costs about 1.75× more than the last and adds 70% more capacity. Very big plants can outgrow their market, so a second company can be the better buy later on." tip="Upgrade when output is close to capacity and you are selling everything you make." />
        <Lever icon="🏷" name="Price" effect="A lower price wins customers from competitors. A higher price earns more on each sale but sells less." tip="If stock is piling up in Storage, lower the price a little." />
        <Lever icon="💵" name="Salary" effect="Higher pay raises mood. Happy workers make more and rarely strike." tip="Keep Mood above about 60%. Below 45%, workers start to quit." />
        <Lever icon="📣" name="Marketing" effect="Spending a share of revenue on marketing slowly builds your brand." tip="Brand and quality both make customers choose you over rivals." />
        <Lever icon="🔬" name="R&D" effect="Research slowly raises product quality." tip="Results take months, so start early." />
      </Card>
      <SectionTitle>Helpers</SectionTitle>
      <Card className="divide-y divide-line">
        <Lever icon="⚙" name="Automation" effect="Let a company hire, upgrade, pay dividends or keep a cash buffer by itself." tip="Turn on auto-recruit so output keeps up when demand grows." />
        <Lever icon="🏦" name="Loans" effect="Borrow to grow faster. Loans come from a bank company: the central bank rate plus a margin that grows with your debt and with how full the bank's loan book is." tip="Compare banks on a company's Owners & Bank tab. Only borrow for upgrades that will pay back." />
        <Lever icon="💳" name="Automatic borrowing" effect="When a company runs out of cash (to buy materials, hire, or keep its cash buffer) it draws on its credit line by itself. It pays the loan back from spare cash before paying you dividends." tip="The Financials tab shows why a company borrowed. Turn off auto-repay in Automation if you prefer to repay yourself." />
        <Lever icon="🔥" name="Accidents" effect="Fires, machine breakdowns and new safety rules hit without warning and cost money to fix. Fixing properly costs more but restores output; a cheap patch or ignoring it keeps output down for weeks." tip="Keep some spare cash in each company: bills are paid from company cash, then its credit line, then your own cash." />
        <Lever icon="🏛" name="Own a bank" effect="Found a Banking company ($10M, mostly locked capital) and its loans to your other companies are cheaper (set the discount), and their interest becomes its income. Set its loan margin to win borrowers from rival banks." tip="A bank lends about 6x its capital. If a borrower goes bankrupt, it loses 60% of the loan." />
        <Lever icon="🤝" name="Partner stakes" effect="Sell up to 49% of a private company to investors. Their money goes into the company, with no interest to pay, and they get their share of dividends." tip="Buy them back later for their share of the value plus 10%." />
        <Lever icon="🎯" name="Takeovers" effect="Open any AI company's Owners tab to bid. Owners sell if you offer enough above the market price. Over 50% of the shares gives you control." tip="Hostile rivals want more or refuse. You can also sell your own companies to rivals for cash." />
        <Lever icon="PA" name="Assistant" effect="The card on Home lists what needs you now, with a one-tap fix for each." tip="Check it whenever the Business tab shows a dot. Tap ✕ to clear a tip for two weeks; it comes back if it still applies." />
        <Lever icon="🗺" name="Planner" effect="Shows every product: price, demand vs supply, cost of each unit and a profit forecast for the price you pick." tip="Look for Shortage tags and a payback under a year." />
      </Card>
      <SectionTitle>Is my company healthy?</SectionTitle>
      <Card className="p-4">
        <ul className="space-y-2 text-sm">
          {[
            ['Output is close to Capacity', 'You have enough workers'],
            ['Inventory stays low', 'Customers buy what you make'],
            ['Mood is above 60%', 'Wages are fair'],
            ['Cash stays positive', 'Bills are paid without loans'],
          ].map(([a, b]) => (
            <li key={a} className="flex gap-2">
              <span className="text-green font-black">✓</span>
              <span><b>{a}</b> <span className="text-muted">· {b}</span></span>
            </li>
          ))}
        </ul>
      </Card>
      <SectionTitle>Supply chains</SectionTitle>
      <Card className="p-4 text-sm leading-relaxed space-y-2">
        <p>Every company makes one product. Most products need <b>materials</b> made by other companies: steel needs iron ore and electricity, cars need steel, plastics and chips.</p>
        <p>Your company buys materials automatically: first from <b>your own companies</b> (at a discount you choose), then from the market. If Astoria runs short, it <b>imports at about 30% more</b>.</p>
        <p>Prices move every day. When buyers want more than producers can make, prices rise; when there is too much, they fall. News and hype push demand up and down.</p>
      </Card>
      <div className="grid grid-cols-1 gap-2 mt-2">
        {(['raw', 'material', 'product'] as const).map((tier) => (
          <Card key={tier} className="p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-gold mb-1">{tier === 'raw' ? 'Raw materials' : tier === 'material' ? 'Materials' : 'Consumer products'}</div>
            <div className="divide-y divide-line">
              {GOOD_IDS.filter((g) => GOODS[g].tier === tier).map((g) => (
                <div key={g} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span className="font-semibold">{GOODS[g].name}</span>
                    <span className="block text-xs text-muted">{GOODS[g].inputs.length ? `Needs ${GOODS[g].inputs.map((i) => GOODS[i.good].name.toLowerCase()).join(', ')}` : 'Needs only staff'}</span>
                  </span>
                  <span className="num text-xs text-gold shrink-0">{fmtMoney(startCost(g))}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <SectionTitle>Deals with other companies</SectionTitle>
      <Card className="p-4 text-sm leading-relaxed space-y-2">
        <p>Open a company, then <b>Supply &amp; Deals → New deal</b>. Offer to sell your product to a company that uses it, or to buy materials at a fixed price.</p>
        <p>A cheap, large deal for a rival's company makes that rival <b>like you more</b>. Breaking a deal makes them angry. Rivals who hate you refuse all deals.</p>
      </Card>
    </>
  );
}

function Markets() {
  return (
    <>
      <Hero art={<div className="flex -space-x-2"><BullBadge size={52} /><BearBadge size={52} /></div>} title="Make your money work">
        Buy shares in Astoria's 20 listed companies. When they earn more, the share price usually rises and many pay dividends.
      </Hero>
      <SectionTitle>What moves a share price</SectionTitle>
      <Steps
        items={[
          { title: 'Profits', body: 'Each stock has a fair value based on its earnings. Over time the price moves toward it.' },
          { title: 'News and mood', body: 'Good news and a bullish market push prices up. Bad news and bearish mood pull them down.' },
          { title: 'Buying and selling', body: 'Big orders move the price. You can buy at most 10% of a stock’s daily volume each day, so large orders fill over several days.' },
        ]}
      />
      <SectionTitle>Simple strategy</SectionTitle>
      <Card className="p-4 text-sm leading-relaxed space-y-2">
        <p>• Buy companies whose price is <b>below</b> their fair value (open a stock to see it).</p>
        <p>• Use a <b>limit order</b> to choose the most you will pay.</p>
        <p>• Spread your money over several industries.</p>
        <p>• Keep enough cash for your own companies first.</p>
      </Card>
    </>
  );
}

function Deals() {
  return (
    <>
      <Hero art={<IndustryThumb industry="finance" size={84} level={5} />} title="Partner stakes, takeovers and business banks">
        Companies can change hands. Raise money by selling part of a company, buy rivals' companies, and run a bank that lends to everyone.
        It all happens on a company's <b>Owners &amp; Bank</b> tab.
      </Hero>

      <SectionTitle>Partner stakes</SectionTitle>
      <Steps
        items={[
          { title: 'Sell part of a company', body: 'Open one of your private companies, go to Owners & Bank and pick 10% to 49%. Rivals and the Astoria Growth Fund make offers.' },
          { title: 'The money goes into the company', body: 'It is new money to grow with and, unlike a loan, there is no interest. At a fair price your share keeps its value.' },
          { title: 'Partners share the dividends', body: 'Dividends are split by ownership. You cannot withdraw cash from a shared company, so take money out as dividends.' },
          { title: 'Buy them back any time', body: 'It costs their share of today\'s value plus 10%. You can also buy up to 49% of a private AI company.' },
        ]}
      />
      <Tip>Rivals who like you, or who know the industry, pay the most. The fund always buys, but at an 8% discount. You always keep at least 51%.</Tip>

      <SectionTitle>Takeovers</SectionTitle>
      <Steps
        items={[
          { title: 'Pick a company and a premium', body: 'On any AI company (from Markets → a stock → View company) offer 10% to 50% above the share price.' },
          { title: 'Owners decide', body: 'Public shareholders sell from +25%. Rivals want more, especially for their own companies, and hostile rivals refuse. The card shows who would sell.' },
          { title: 'Majority or all', body: 'Majority buys 51%: you run it and it stays listed, sharing dividends with other shareholders. All buys every share and takes it off the exchange.' },
          { title: 'Or sell yours', body: 'Sell the company shows what rivals would pay for one of your private companies. Partners get their share of the price.' },
        ]}
      />
      <Tip tone="warn">The premium is the price of control: your net worth dips right after a takeover. Buy companies you will run better, or ones that supply your others.</Tip>

      <SectionTitle>Business banks</SectionTitle>
      <Card className="p-4 text-sm leading-relaxed space-y-2">
        <p>Every company borrows from one of the bank companies, and the interest it pays becomes that bank's income. The rate is the central bank rate plus a margin that grows with the borrower's debt, plus extra for risky borrowers.</p>
        <p>A bank pays 70% of the central bank rate for the deposits that fund its loans, and can lend about 6x its capital. The fuller its loan book, the more it charges.</p>
        <p><b className="text-gold">Own a bank</b> by founding a Banking company. It costs {fmtMoney(startCost('banking'))}: the branch plus required capital that stays locked in the bank (it still counts in your net worth). That capital is what lets it lend. Move your companies' loans to it on their Owners &amp; Bank tab. They get your discount (up to 50% off the margin) and their interest stays in your group. Set the bank's loan margin to win borrowers from rival banks.</p>
      </Card>

      <SectionTitle>Banks carry real risk</SectionTitle>
      <Lever icon="📉" name="Provisions" effect="Each day a bank sets money aside for loans it expects to go bad. Heavy debt, losses and low cash make a borrower riskier." tip="The bad-loan reserve shows on the bank's Owners & Loans tab." />
      <Lever icon="🧾" name="Restructuring" effect="A struggling borrower can fail to repay and settle for paying back only part of its loan. The bank takes the loss, first from its reserve." tip="It happens more often when the economy shrinks and unemployment rises." />
      <Lever icon="💥" name="Bankruptcy" effect="A company that runs out of cash for 45 days goes bankrupt, and its bank loses 60% of what it lent. A bank can go bankrupt too." tip="That includes your own companies: lending to a weak sister company is still a risk for your bank." />
      <Tip>Cheap margins win borrowers, but if the bank lends past its capacity or to shaky companies, one bad year can wipe out its profit.</Tip>
    </>
  );
}

function Rivals() {
  const w = useGame((s) => s.world)!;
  const push = useGame((s) => s.push);
  const list = w.rivals
    .map((r) => {
      const owned = w.companies.filter((c) => c.ownerId === r.id && !c.bankrupt);
      return { r, nw: rivalWorth(w, r), owned };
    })
    .sort((a, b) => b.nw - a.nw);
  return (
    <>
      <Hero art={<Portrait rival={w.rivals[0]} size={84} />} title="How to make rivals lose">
        A rival's wealth is mostly shares in the companies they own. When those companies lose customers, their profits and share price
        fall, and so does the rival's net worth.
      </Hero>
      <SectionTitle>The plan</SectionTitle>
      <Steps
        items={[
          { title: 'Enter their industry', body: 'Start a company in an industry the rival focuses on (shown below).' },
          { title: 'Win their customers', body: 'Customers compare price, brand, quality and size. Price a little below the rival, and spend on marketing and R&D.' },
          { title: 'Get big', body: 'Upgrade so you have the capacity to serve the customers you win. A small company cannot take much share.' },
          { title: 'Hit them when they are weak', body: 'Each rival has a weakness. A rival with high debt suffers most when interest rates rise or the economy slows.' },
          { title: 'Don’t help them', body: 'Buying shares in a rival’s company pushes its price up and makes the rival richer. Rejecting low takeover bids keeps your companies yours.' },
        ]}
      />
      <Tip tone="warn">
        Rivals notice you. Once you take more than 5% of a market they focus on, they start to dislike you and may become a
        <b> Competitor</b>. That is a sign your plan is working, but expect tougher deals from them.
      </Tip>
      <SectionTitle>Know your rivals</SectionTitle>
      <div className="space-y-2">
        {list.map(({ r, nw, owned }) => (
          <Card key={r.id} className="p-3" onClick={() => push({ screen: 'rival', id: r.id })}>
            <div className="flex items-start gap-3">
              <Portrait rival={r} size={52} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold">{r.name}</div>
                    <div className="text-xs text-muted">{r.title}</div>
                  </div>
                  <span className="num text-sm font-bold text-gold shrink-0">{fmtMoney(nw)}</span>
                </div>
                <div className="mt-2 text-xs leading-relaxed space-y-1">
                  <div><span className="text-dim">Focus:</span> {r.focus.map((f) => INDUSTRIES[f].name).join(', ')}</div>
                  <div><span className="text-dim">Weakness:</span> <span className="text-amber">{r.weakness}</span></div>
                  {owned.length > 0 && (
                    <div>
                      <span className="text-dim">Owns:</span>{' '}
                      {owned.map((c) => `${c.name} (${fmtPct(c.last.marketShare, 0)} of ${GOODS[c.good].name.toLowerCase()})`).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
