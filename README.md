# Global Empire

A phone-first business, finance and politics strategy sim that runs entirely in the browser.
No backend: the simulation, AI, markets and news all run client-side and the app deploys as a static Vercel build.

This is the **Phase 1 vertical slice** from the MVP spec: a single country (Republic of Astoria), five industries,
20 listed AI companies, five AI billionaires, a macro layer, a stock exchange and an event-to-news pipeline.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # headless simulation tests (Vitest)
npm run probe      # headless balance run: npm run probe -- <seed> <years> <industry>
npm run build      # static build in dist/ (deploy to Vercel as-is)
```

## Architecture

```
UI (React + Tailwind) --dispatch(Command)--> Zustand store --postMessage--> Web Worker (engine)
        ^                                         |                              |
        +----------- WorldState snapshot <--------+<------- step() each tick ----+
                                                  |
                         IndexedDB saves (idb + Zod) · localStorage settings
```

- `src/engine/` – pure TypeScript, no DOM. Seeded PRNG (`rng.ts`): the same seed and commands give the same world.
  - `company.ts` – production `Q = min(C, L×P, M)`, demand `D = D0 (P/P0)^-ε × B × Qf × I` split by attractiveness and capped by supply, full P&L, morale, automation policies.
  - `market.ts` – DCF intrinsic value; daily return from market, industry, news, sentiment, reversion to value, order pressure and noise; market/limit orders with spread, price impact and a 10%-of-volume daily liquidity limit; dividends.
  - `macro.ts` – `GDP = C + I + G + (X − M)`, inflation with inertia, Okun's law, Taylor-rule central bank, oil market.
  - `ai.ts` – weekly utility-scored corporate strategy and billionaire investor AI; rivals remember the player.
  - `events.ts` – events only change underlying variables (oil supply, confidence, demand, quality, morale); player dilemmas appear as bottom sheets.
  - `tick.ts` – one tick = one day; systems run daily, weekly, monthly or quarterly.
  - Important numbers carry an `Explanation`, so the UI can show how each was computed.
- `src/worker/` – runs the engine off the main thread at 1x / 2x / 5x.
- `src/store/` – Zustand store bridging worker and UI; saves shortly after every decision, every 30 days and on page hide.
- `src/persistence/` – IndexedDB saves with a version number, Zod validation and a migration hook; JSON export/import.
- `src/ui/` – design tokens in `src/index.css` (`@theme`); core components in `ui/components`; screens in `ui/screens`.
  Illustrations in `ui/art` are SVG stand-ins for the painted WebP art described in the spec.

See [TODO.md](TODO.md) for progress and next steps.
