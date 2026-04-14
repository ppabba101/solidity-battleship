# Battleship.zk — E2E QA Report

**Date:** 2026-04-14
**Test environment:** Local Anvil (31337), Vite dev server, Chromium via Playwright MCP

## Verification checklist

| # | Check | Result |
|---|---|---|
| 1 | Landing renders without console errors | ✅ PASS |
| 2 | StatusBar shows connected chain (Anvil 31337 green dot) | ✅ PASS |
| 3 | VizLayer mounted (architecture flow diagram visible) | ✅ PASS |
| 4 | Circuit Stats card visible with correct values (~3,482 constraints, ~265k gas, no trusted setup) | ✅ PASS |
| 5 | ChainPanel shows correct deployed contract address (fixed) | ✅ PASS |
| 6 | Randomize produces a legal fleet visible on the grid | ✅ PASS |
| 7 | Ready triggers proving simulator | ✅ PASS |
| 8 | Proving completes and `commitBoard` tx lands on-chain | ✅ PASS |
| 9 | `BoardCommitted` event visible in ChainPanel | ✅ PASS |
| 10 | BoardToHashViz animates during commit (17/17 cells + commitment hash) | ✅ PASS |
| 11 | Phase transitions to "playing" after both commits | ✅ PASS |
| 12 | Turn order matches contract (Player 1 shoots first) | ✅ PASS (fixed) |
| 13 | Firing a shot triggers both `fireShot` + `respondShot` txs | ✅ PASS |
| 14 | Hit cells show orange flame icon on Enemy Waters | ✅ PASS |
| 15 | Miss cells show blue droplet on Your Fleet (own-miss) | ✅ PASS |
| 16 | Hit keeps turn (Player 2 hit → still Player 2's turn) | ✅ PASS |
| 17 | Miss flips turn (Player 1 miss → Player 2's turn) | ✅ PASS |
| 18 | CryptoLog appends entries throughout | ✅ PASS |
| 19 | No uncaught console errors on the happy path | ✅ PASS |

**OVERALL: PASS**

## Bugs found and fixed during QA

1. **ChainPanel hardcoded stale placeholder address** (`ChainPanel.tsx:21`) — was showing `0x5FbDB2...` while the real deployed address is `0x9fE46736...` in `contract.ts`. Fixed by importing `CONTRACT_ADDRESS` from `lib/contract.ts`.

2. **VizLayer fixed overlay blocked clicks on main UI content** — fixed right-rail with `pointer-events-auto` intercepted clicks on Ready button (and overlapped visually with the CryptoLog aside). Fixed by splitting VizLayer into top-pipeline + `VizSidebar` export; App.tsx now mounts `VizSidebar` inside a widened `aside` alongside CryptoLog for a clean single right-column layout.

3. **Turn-order mismatch after both commits** (`App.tsx:201-207`) — UI state stayed on Player 2 after Player 2 committed, but the contract expects Player 1 (game creator) to shoot first, causing `fireShot reverted: not your turn`. Fixed by explicitly `setPlayer(0)` when transitioning to the playing phase.

4. **SFX 416 Range Not Satisfiable errors** — empty placeholder mp3 files in `public/sfx/` caused browser-level 416 errors that were logged to console before the JS `.catch()` could suppress them. Fixed by gating SFX behind `VITE_SFX_ENABLED=1` env flag in `lib/sfx.ts`; audio elements are now only created when real audio is provided.

## Screenshots

| # | File | Phase |
|---|---|---|
| 01 | `01-landing.png` | Initial landing (Player 1 placement) |
| 02 | `02-p1-randomized.png` | After P1 Randomize — 5 ships placed |
| 03 | `03-proving.png` | During P1 proving — BoardToHashViz animating |
| 04 | `04-playing.png` | Layout overlap bug — shows pre-fix |
| 05 | `05-landing-v2.png` | After layout fix — clean right sidebar |
| 06 | `06-playing-v2.png` | Phase 2 Battle reached after both commits |
| 07 | `07-battle.png` | Player 1's turn confirmed (turn fix verified) |
| 08 | `08-shot1.png` | First shot (miss) — turn flipped to P2, droplet visible |
| 09 | `09-shot2.png` | P2 shot → hit — orange flame on Enemy Waters |
| 10 | `10-final.png` | Final clean landing with zero console errors after all fixes |

## On-chain verification

At the end of the test run, the deployed `BattleshipGame` contract at `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` had processed:

- 2 × `commitBoard` transactions (one per player)
- 2 × `BoardCommitted` events
- Multiple `fireShot` + `respondShot` tx pairs
- Block height advanced through #4 → #11 across the test
- All 9 Foundry tests still pass after all fixes: `forge test → 9 passed, 0 failed`

## Known non-blockers

1. **Vite chunk size warning**: `dist/assets/index-*.js` is ~670 kB (213 kB gzip), above the default 500 kB warning. Pre-existing; can be code-split later.
2. **Noir verifier contracts are stubs** that always return `true`. Real verifiers require `nargo` + `bb` locally — documented in `circuits/README.md`. This is a known limitation of this pass, not a bug.
3. **Prover is simulated** (3–5s fake delay + fake constraint counter) to let the UX narrative work without the real toolchain. `src/lib/prover.ts` has a canonical TODO for swapping to `@aztec/bb.js`.
4. **Forge lint notes** on `boardVerifier` / `shotVerifier` immutables (SCREAMING_SNAKE_CASE). Non-fatal style only.

## Conclusion

The full demo flow works end-to-end against a live Anvil node with on-chain commit / fire / respond transactions, visual cell-state differentiation (hit = orange flame, miss = blue droplet, ship = grey icon), working turn rules that match contract behavior, and a cinematic "behind the scenes" zk visualization layer (pipeline diagram, BoardToHashViz, circuit stats, chain panel). Zero console errors on the happy path.
