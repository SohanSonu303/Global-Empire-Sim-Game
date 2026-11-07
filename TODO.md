# Global Empire – build tracker

## Step 1: Foundation
- [x] Vite, React, TypeScript, Tailwind v4 scaffold (static build, `vercel.json`)
- [x] Design tokens (`src/index.css`): navy surfaces, one gold accent, green/red/amber status, 12px min type, 44px taps, 16px gutter
- [x] Core components: gold/dark buttons, ribbon header, progress bar, row card, stat pill, chips/tab strip, tab bar, bottom sheet
- [x] 5-tab shell with sticky top bar (level, cash, day) and pause/1x/2x/5x
- [ ] Deploy the build to Vercel (needs your Vercel account)

## Step 2: Simulation slice
- [x] Pure TS engine with seeded PRNG and daily tick in a Web Worker
- [x] Player companies with production, demand, P&L, cash, employees
- [x] Zustand store connecting worker and UI
- [x] Home (city + goals) and Businesses list wired to live state

## Step 3: Saves
- [x] IndexedDB saves with version + Zod validation on load
- [x] Autosave, load, JSON export/import
- [x] localStorage for settings and last opened save

## Step 4: Phase 1 systems
- [x] 5 industries, 20 AI companies with utility-based weekly strategy, 5 AI billionaires
- [x] Macro layer: GDP, inflation, unemployment, Taylor-rule central bank, oil
- [x] Stock exchange: fundamentals + sentiment pricing, market and limit orders, liquidity limits, dividends
- [x] Event-to-news pipeline with templates; player dilemmas (union, bulk contract, takeover bid, ad campaign)
- [x] Drill-down explanations (P&L, output, valuation, net worth, GDP, rate rule, intrinsic value)
- [x] Automation policies (auto-recruit, auto-upgrade, dividends, inventory buffer, minimum cash)
- [x] Headless Vitest suite: determinism, 10-year bounds on 4 seeds, profitability, liquidity

## Next
- [ ] Balance pass on a real phone: early-game pace, mid-game payback, index drift (AIs hoard cash)
- [x] Detailed isometric SVG art: city diorama, company cutaway, trading floor, world map, rival portraits
- [ ] Optional: painted WebP art pass on top of the SVG scenes
- [ ] Downsample old history to monthly inside saves
- [ ] Lightweight Charts for the stock detail page
- [ ] More event templates (target 30–50 by Phase 2)
- [ ] Phase 2: IPOs, bonds, commodities, M&A, taxes/subsidies, parties and elections, 3 foreign countries + FX
