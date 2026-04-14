# Deep Dive Spec: Solidity Battleship — Full Overhaul

## Goal
Transform the Solidity Battleship demo from a rough Merkle-based proof-of-concept into a cinematic, zk-secured, zero-friction two-player demo that runs on one laptop. The demo must look polished, feel instant, and tell a clear crypto story ("your board is proven legal without being revealed").

## Non-Goals
- Multi-chain / mainnet / testnet deployment (local Anvil only for this overhaul).
- Matchmaking, lobbies, tournaments, leaderboards, or accounts beyond the two burner players.
- Mobile responsive layout (desktop demo only).
- Wallet library integration (RainbowKit/Privy) — burner wallets replace it entirely.
- Keeping the existing Merkle commitment scheme as a primary path.

## Stack Decisions
| Layer | Decision |
|---|---|
| Cryptography | **Noir** circuits + `@aztec/bb.js` browser prover + Noir-generated Solidity verifier |
| Wallet | **Burner wallets** via `viem`'s `privateKeyToAccount`, two Anvil test keys held in React state |
| Chain | **Local Anvil only** (`http://127.0.0.1:8545`, chain id 31337) |
| Frontend | **Tailwind CSS** + **shadcn/ui** + **framer-motion** |
| Contracts | **Full rewrite** of `BattleshipGame.sol` around the zk verifier |
| Tests | **Foundry** unit + integration, including cheating-attempt coverage |

## Acceptance Criteria

### Cryptographic layer
- [ ] A Noir circuit (`board_validity.nr`) takes 100 private cells + salts and proves: exactly 17 occupied cells arranged as fleet {1x5, 1x4, 2x3, 1x2}, no overlaps, no diagonal ships, no out-of-bounds.
- [ ] A second Noir circuit (`shot_response.nr`) proves: given committed board + a queried `(x,y)`, the response is hit/miss consistent with the committed board, without revealing other cells.
- [ ] Noir-generated Solidity verifier contracts are deployed and invoked from `BattleshipGame.sol` on `commitBoard` and `respondToShot`.
- [ ] A player who commits an illegal board (e.g., all-empty) is rejected at commit time; the old "commit empty board and win by never-hit" attack is impossible.
- [ ] The `revealFinalBoard` winner-assignment bug (`BattleshipGame.sol:206-210`) is removed — there is no deferred-reveal enforcement path, because validity is proven upfront.
- [ ] Browser proving time for `board_validity` is measured and displayed in the UI during placement ("Proving your board… 4.2s").
- [ ] Foundry tests cover: valid commit, invalid-fleet commit rejection, valid shot response, forged shot response rejection, full game to checkmate.

### Wallet & demo flow
- [ ] Two burner wallets are created on app mount from hardcoded Anvil account-0 and account-1 private keys.
- [ ] "Now playing: Player 1 / Player 2" toggle in the header switches which burner signs the next tx. Turn enforcement is still on-chain.
- [ ] No MetaMask popup ever appears during the demo.
- [ ] Every on-chain action shows a loading state with spinner + label ("Committing board…", "Proving shot…", "Waiting for opponent…").
- [ ] A "Deploy fresh game" button redeploys `BattleshipGame` via the burner and resets local state.
- [ ] Chain connection, account balance (Anvil test ETH), and current player are visible at all times in a status bar.

### Frontend & game UX
- [ ] Tailwind + shadcn installed; all inline `style={{}}` removed from `App.tsx`.
- [ ] `CellState` discriminated union replaces the `0|1|2` number model, with states: `EMPTY`, `OWN_SHIP`, `OWN_SHIP_HIT`, `OWN_MISS`, `UNKNOWN`, `PENDING_SHOT`, `CONFIRMED_HIT`, `CONFIRMED_MISS`, `SUNK`, `HOVER_VALID`, `HOVER_INVALID`.
- [ ] Grid cells render with distinct visual treatment per state: colors + icons (ship sprite, splash, explosion, X), not just background color.
- [ ] Two grids are always visible side-by-side with clear labels: "Your Fleet" (own board) and "Enemy Waters" (target board).
- [ ] Drag-and-drop ship placement: a sidebar shows unplaced ships (1x5, 1x4, 2x3, 1x2). Drag a ship onto the grid, press R to rotate, hover shows green/red preview for valid/invalid placement. Ships snap to grid. Overlap and out-of-bounds rejected at drop time.
- [ ] A "Randomize" button places all ships legally for lazy users.
- [ ] A "Ready" button is disabled until all 5 ships placed; clicking triggers `@aztec/bb.js` proving with a live spinner and then `commitBoard` on-chain.
- [ ] Shot firing: click a cell on "Enemy Waters", cell enters `PENDING_SHOT` state with pulse animation; on response, flips to `CONFIRMED_HIT` (orange explosion, framer-motion pop) or `CONFIRMED_MISS` (blue splash ripple).
- [ ] When a ship is fully sunk, all its cells transition to `SUNK` state with a red border + small sinking animation.
- [ ] Win screen: confetti, "You Win / You Lose" banner, game summary (shots fired, hit rate, proving-time total), "Play Again" button.
- [ ] Sound effects: fire sound on shot, splash on miss, explosion on hit, horn on sink, victory fanfare on win. All optional via a mute toggle.

### Demo narrative
- [ ] A persistent "What's happening cryptographically" panel shows a live log: "✓ Board legality proven in 4.2s", "✓ Shot at (3,5) response proven", etc. This is the story for the audience.
- [ ] README includes a "Run the demo" section with `anvil` + `npm run dev` + one-click deploy button walkthrough.

## Assumptions Exposed
- Anvil ships two known test accounts with deterministic private keys; burner wallets use account 0 and account 1. Not a real security model — explicitly a demo.
- Browser proving time for the board-validity circuit will fall in the 3–10s range; if it exceeds 15s, fallback plan is to drop `shot_response` circuit and keep Merkle for per-shot proofs while still using Noir for commit-time board validity.
- `@aztec/bb.js` WASM prover is compatible with Vite's bundler with minimal config (a plausible but unverified assumption — verify during implementation).
- Standard fleet is the "classic" set: 1x5 (Carrier), 1x4 (Battleship), 2x3 (Cruiser+Submarine), 1x2 (Destroyer). 17 cells total.
- Turn enforcement, game-state machine, and timeout logic stay in Solidity; only the validity/hiding primitives change from Merkle to zk.

## Technical Context
**Current code map (brownfield):**
- `contracts/src/BattleshipGame.sol` (267 lines) — commit/shot/reveal state machine, Merkle-based, has winner-assignment bug at lines 206–210.
- `contracts/src/libraries/BoardValidator.sol` — standard-fleet validator, has length-5 bucket gap.
- `contracts/test/BattleshipGame.t.sol` — uses a test board with an invalid length-5 ship that passes validator silently (separate bug).
- `frontend/src/App.tsx` (287 lines) — raw window.ethereum, inline styles, click-toggle board model.
- `frontend/src/components/BoardGrid.tsx` (45 lines) — 3-value cell model, hardcoded colors.
- `frontend/src/lib/contract.ts` — viem clients, hardcoded to Anvil, re-instantiated per call.
- `frontend/src/lib/merkle.ts` (48 lines) — to be deleted; replaced by Noir proving module.
- `frontend/src/lib/demoFlow.ts` (16 lines) — demo data helpers; will be rewritten.

**New code surface:**
- `contracts/src/BattleshipGame.sol` — rewritten around zk verifiers.
- `contracts/src/verifiers/BoardValidityVerifier.sol` and `ShotResponseVerifier.sol` — Noir-generated.
- `circuits/board_validity/` — Noir project with `src/main.nr`, `Nargo.toml`.
- `circuits/shot_response/` — Noir project.
- `frontend/src/lib/prover.ts` — `@aztec/bb.js` wrapper with progress events.
- `frontend/src/lib/burnerWallets.ts` — two-account burner wallet manager.
- `frontend/src/lib/gameState.ts` — CellState enum, reducer, turn state machine.
- `frontend/src/components/ui/*` — shadcn components.
- `frontend/src/components/Grid.tsx`, `ShipPalette.tsx`, `StatusBar.tsx`, `CryptoLog.tsx`, `WinScreen.tsx`.
- `frontend/tailwind.config.ts`, `postcss.config.js`, updated `index.html`.

## Ontology
- **Fleet** = set of 5 ships: {Carrier(5), Battleship(4), Cruiser(3), Submarine(3), Destroyer(2)} — 17 cells total.
- **Board** = 10x10 grid of cells.
- **CellState** = one of the 11 states listed in the AC above.
- **Player** = a burner wallet bound to Anvil account 0 or 1; addressed by `playerIndex: 0|1`.
- **Turn** = on-chain enforced, burner is just which key signs.
- **Proof** = a Noir-generated bb-UltraPlonk proof, verified by a generated Solidity verifier contract.

## Trace Findings
Three compounding root causes were confirmed by parallel trace lanes:

1. **Crypto (Lane 1):** Merkle commitment cannot prove board validity by design (commitment schemes don't carry constraint satisfaction). The deferred reveal intended to enforce validity is a dead code path because `revealFinalBoard` assigns `game.winner = game.winnerCandidate` in both branches of the legality check (`BattleshipGame.sol:206-210`). A secondary gap: `BoardValidator` doesn't check `lengths[5]`, so a 5-long ship slips past silently. The Noir+bb.js stack is recommended because it avoids a trusted-setup ceremony (narrative liability in a demo) while keeping verifier gas reasonable.

2. **Wallet (Lane 2):** Raw `window.ethereum` + single `account` state makes two-player flow structurally impossible without manual MetaMask account switching. No `accountsChanged` listener, no `wallet_switchEthereumChain`, no loading states on any tx. The codebase is already hardcoded to local Anvil. Burner wallets are the only option that structurally solves two-players-on-one-laptop — every wallet library still bottlenecks on "one MetaMask account active at a time".

3. **Frontend (Lane 3):** `BoardGrid.tsx` has a 3-value numeric cell model mapped to 3 hex colors, conflating "attempted shot" with "confirmed miss" and "own ship" with "confirmed hit". `App.tsx` uses a boolean-toggle placement model with no ship shapes, no rotation, no fleet constraints. All styling is inline `style={{}}`; no design system. Tailwind + shadcn + framer-motion is the correct fix — the grid stays a CSS Grid but cells become variant-styled buttons keyed to a CellState enum.

Critical unknowns from each lane were resolved via interview:
- Demo context → **two people, one laptop, local** → burner wallets.
- Placement UX → **drag-and-drop with rotation** → full ship-palette + fleet model.
- zk stack → **Noir + bb.js** → no trusted setup ceremony.
- Polish depth → **cinematic** → framer-motion + SFX + confetti.
- Contract scope → **full rewrite around zk verifier** → both board-validity AND shot-response circuits.

## Presentation Deliverable

A companion presentation must ship with the overhaul:

- **Format**: PowerPoint (`.pptx`) generated via `python-pptx`. Output path: `presentation/battleship-zk-demo.pptx`.
- **Length**: 8 minutes total, **including** a live-demo slide/segment.
- **Presenters**: 2 (speaker notes split across Presenter A and Presenter B per slide).
- **Style**: Clean, plain, professional. Fonts: **Inter** (or Helvetica Neue fallback) for body, **JetBrains Mono** for code. No clipart, no drop shadows, no gradients. Generous whitespace. Max 5 bullets per slide. Single accent color (navy `#0B2545`) + one highlight (orange `#F97316`, matching the hit state).
- **Slide plan** (~8 slides, ~1 min each):
  1. **Title** — "Battleship, Proven: A zk-SNARK Demo" + presenter names. (Presenter A opens.)
  2. **The Problem** — Battleship has hidden state. How do you prove your board is legal without revealing it? (Presenter A.)
  3. **Why Merkle Isn't Enough** — Merkle commits to values, not constraints. A cheater can commit an all-empty board and win. (Presenter A.)
  4. **Enter zk-SNARKs (Noir)** — one proof = "my board has exactly {1x5, 1x4, 2x3, 1x2}, no overlap, no diagonal." No trusted setup. (Presenter B takes over.)
  5. **System Architecture** — diagram: React → @aztec/bb.js → Noir circuit → Solidity verifier → BattleshipGame.sol → Anvil. (Presenter B.)
  6. **Live Demo** — burner wallets, drag-drop placement, proving spinner, fire shots, hit/miss animations, win screen. (Both: A drives UI, B narrates the crypto log.)
  7. **What Was Proven** — recap of on-chain proofs from the demo (board validity, shot responses). (Presenter B.)
  8. **What's Next & Q&A** — mainnet path, circuit optimization, multi-game lobby. (Presenter A closes.)
- **Speaker notes**: every slide has ~80–120 words split into `[Presenter A]` and `[Presenter B]` blocks matching the ownership above. Conversational, not bullet regurgitation.
- **Acceptance**: file opens in Keynote and PowerPoint without warnings; fonts embedded or fall back cleanly; all 8 slides present; speaker notes populated; total spoken length ~8 minutes when delivered.

## Interview Transcript
- Lane confirmation: user confirmed all 3 trace lanes.
- Q1 (demo context): Two people, one laptop, local.
- Q2 (placement UX): Drag-and-drop with rotation.
- Q3 (zk stack): Noir + bb.js in-browser proving.
- Q4 (polish depth): Cinematic.
- Q5 (contract scope): Full rewrite around zk verifier.

Estimated ambiguity: ~12% (under 20% threshold).
