import { useEffect, useRef } from 'react';
import { useGame, type Route } from './store/game';
import { ExplainSheet, TabBar, TimeBar, Toast, TopBar } from './ui/components/game';
import { GuideScreen } from './ui/screens/Guide';
import { PlannerScreen } from './ui/screens/Planner';
import { ChainScreen } from './ui/screens/Chain';
import { ArticleScreen, NewsScreen } from './ui/screens/News';
import { HomeScreen } from './ui/screens/Home';
import { BusinessScreen } from './ui/screens/Business';
import { CompanyScreen } from './ui/screens/Company';
import { MarketsScreen, StockScreen } from './ui/screens/Markets';
import { WorldScreen } from './ui/screens/World';
import {
  AchievementsScreen, GovernmentScreen, MoreScreen, ReportsScreen, RivalScreen, RivalsScreen, SavesScreen, StatsScreen,
} from './ui/screens/More';
import { EventSheet } from './ui/screens/Overlays';
import { RewardOverlays } from './ui/screens/Rewards';
import { TitleScreen } from './ui/screens/Title';
import { StrategyScreen } from './ui/screens/Strategy';

function RouteView({ r }: { r: Route }) {
  switch (r.screen) {
    case 'company': return <CompanyScreen id={r.id} />;
    case 'stock': return <StockScreen ticker={r.ticker} />;
    case 'rival': return <RivalScreen id={r.id} />;
    case 'news': return <NewsScreen />;
    case 'rivals': return <RivalsScreen />;
    case 'stats': return <StatsScreen />;
    case 'saves': return <SavesScreen />;
    case 'achievements': return <AchievementsScreen />;
    case 'government': return <GovernmentScreen />;
    case 'guide': return <GuideScreen section={r.section} />;
    case 'planner': return <PlannerScreen good={r.good} industry={r.industry} />;
    case 'chain': return <ChainScreen good={r.good} />;
    case 'article': return <ArticleScreen id={r.id} />;
    case 'strategy': return <StrategyScreen tab={r.tab} />;
    case 'reports': return <ReportsScreen />;
  }
}

export default function App() {
  const world = useGame((s) => s.world);
  const booting = useGame((s) => s.booting);
  const tab = useGame((s) => s.tab);
  const stack = useGame((s) => s.stack);
  const scroller = useRef<HTMLElement>(null);
  const top = stack[stack.length - 1];

  useEffect(() => {
    void useGame.getState().boot();
  }, []);
  useEffect(() => {
    // Element.scrollTo may return a Promise in newer browsers; never return it from an effect.
    void scroller.current?.scrollTo({ top: 0 });
  }, [tab, stack.length]);

  return (
    <div className="h-full flex justify-center bg-[#070d18]">
      <div className="relative w-full max-w-[520px] h-full flex flex-col bg-bg sm:border-x sm:border-line">
        {booting ? (
          <div className="flex-1 grid place-items-center text-muted">Loading…</div>
        ) : !world ? (
          <main className="flex-1 overflow-y-auto"><TitleScreen /></main>
        ) : (
          <>
            <TopBar />
            <main ref={scroller} className="flex-1 overflow-y-auto overscroll-contain">
              {top ? <RouteView r={top} /> : (
                <>
                  {tab === 'home' && <HomeScreen />}
                  {tab === 'business' && <BusinessScreen />}
                  {tab === 'markets' && <MarketsScreen />}
                  {tab === 'world' && <WorldScreen />}
                  {tab === 'more' && <MoreScreen />}
                </>
              )}
            </main>
            <TimeBar />
            <TabBar />
            <EventSheet />
            <RewardOverlays />
            <ExplainSheet />
          </>
        )}
        <Toast />
      </div>
    </div>
  );
}
