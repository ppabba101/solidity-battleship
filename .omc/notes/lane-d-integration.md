# Lane D — Viz Layer Integration Note

Lane D delivered a self-contained "Behind the Scenes" viz layer. App.tsx only needs one mount and a prover swap.

## Files created
- `frontend/src/lib/vizBus.ts` — event bus (`emit`, `subscribe`, `getRecent`)
- `frontend/src/lib/provingSimulator.ts` — wraps stub prover, emits viz events
- `frontend/src/components/viz/VizLayer.tsx` — single mount point
- `frontend/src/components/viz/ArchitectureFlow.tsx`
- `frontend/src/components/viz/ProvingPanel.tsx`
- `frontend/src/components/viz/BoardToHashViz.tsx`
- `frontend/src/components/viz/ChainPanel.tsx`
- `frontend/src/components/viz/CircuitStatsCard.tsx`

## One-liner integration in `frontend/src/App.tsx`

1. Add imports near the other imports:
   ```ts
   import { VizLayer } from "./components/viz/VizLayer";
   import {
     simulateBoardValidity,
     simulateShotResponse,
   } from "./lib/provingSimulator";
   ```

2. Replace the existing `proveBoardValidity` / `proveShotResponse` call sites
   with `simulateBoardValidity` / `simulateShotResponse` (same signatures,
   drop-in). This routes every run through the viz bus.

3. Mount `<VizLayer />` as the first child inside the top-level
   `<div className="h-full flex flex-col">` (before `<StatusBar />`). The
   viz rail is `position: fixed` on the right and the pipeline diagram is a
   flow element, so no other layout changes are needed.

4. Optional: remove the existing generic proving modal in App.tsx since
   `ProvingPanel` supersedes it (both can coexist without breaking).

That is the whole integration. The viz layer is fully decoupled via
`vizBus`, so any other subsystem (real prover, contract watcher) can emit
events later and the UI will react automatically.
