# RALPLAN — Battleship.zk Real Multiplayer (Base Sepolia)

**Mode:** consensus / direct
**Spec:** `.omc/specs/deep-interview-real-battleship-game.md`
**Type:** Brownfield extension (existing `BattleshipGame.sol` + Vite SPA + sidecar prover stay working)
**Planner pass:** 1 (Architect + Critic to follow)

---

## RALPLAN-DR Summary

### Principles (5)
1. **Demo never breaks.** `scripts/demo-fast.sh` and the existing 13 MockVerifier tests must stay green at every commit. Any new behavior is opt-in via a constructor param or zero-stake fast path.
2. **Immutable, audit-ready, non-upgradeable.** No admin keys, no pause, no fee switch. CEI + reentrancy guard on every payout. Foundry invariants prove no ETH gets stuck.
3. **Additive, not rewritten.** `BattleshipGame.sol` gains escrow/clock/lobby surface; the existing state machine (`Created → Committed → Playing → Finished`) is preserved verbatim. New states (`Canceled`, `Drawn`) layer on the side.
4. **Brownfield-safe parallelism.** Work packages are sliced so two of them can run in parallel under `/team` without touching the same files; the contract package is the critical path everything else depends on.
5. **Honest preview.** v1 is Option E (MockVerifier-backed Sepolia deploy) + Option B (optional local sidecar) — the in-app banner says so. Crypto guarantees are a power-user toggle, not a v1 promise.

### Decision Drivers (top 3)
1. **Stake safety > everything else.** The contract holds real (testnet) ETH. A reentrancy bug, a stuck-stake bug, or an unhandled terminal state is a P0. Drives: invariant tests, CEI, single payout flag.
2. **"Two strangers, any two browsers" UX.** No backend, no MetaMask install, no seed phrase, no mandatory Node sidecar for casual play. Drives: Privy embedded wallets, event-scan matchmaking, Option E preview mode.
3. **Ship in days, not weeks.** Spec timeline is "ship the preview, iterate." Drives: skip indexer, skip TEE, skip mainnet, skip mobile, single React Router lib, single Privy SDK.

### Viable Options (hard decisions)

#### D1 — Escrow location
- **Option A (chosen): in-game-contract escrow.** Stake lives in `Game.pot` inside `BattleshipGame`. Pros: no cross-contract auth, atomic with state transitions, fewer SLOADs, matches spec. Cons: bigger contract surface, more invariants to prove, single blast radius.
- **Option B: separate `Escrow.sol` contract.** Pros: smaller per-contract surface, can be reused across game variants. Cons: cross-contract auth (Game must be the only authorized payer), double-deploy, two invariant suites, atomicity becomes "two txs or one wrapped tx," reentrancy surface across both contracts.
- **Why A:** spec is explicit, atomicity wins, and the contract is non-upgradeable so we don't gain reuse value from B.

#### D2 — How `demo-fast.sh` survives `payable createGame`
- **Option A (chosen): `MIN_STAKE = 0` allowed in fast/demo mode via a constructor flag, plus a default of e.g. `1e14` wei in production deploys.** Constructor takes `(boardVerifier, shotVerifier, minStake)`. Demo deploy passes `minStake = 0`; Sepolia deploy passes `1e14`. `createGame` accepts `msg.value == stakeWei && stakeWei >= MIN_STAKE`, so `stakeWei = 0, msg.value = 0` is legal in demo mode. The 13 existing tests pass `minStake=0` and call `createGame{value:0}(...)`.
- **Option B: two contracts (`BattleshipGame` and `BattleshipGameStaked`).** Rejected: doubles maintenance, demo and prod diverge, the spec says "additions, not changes."
- **Option C: hardcode `MIN_STAKE = 0` everywhere, enforce minimum in frontend.** Rejected: spam vector, contradicts spec ("contract-enforced floor").
- **Why A:** smallest diff, single codebase, demo path stays a one-liner, frontend tests remain meaningful.

#### D3 — Privy SDK
- **Option A (chosen): `@privy-io/react-auth`.** Pros: largest install base in the embedded-wallet space, first-class wagmi/viem connector, social + email login out of the box, free tier covers MVP. Cons: vendor lock-in (mitigated by thin `EmbeddedWalletProvider` interface).
- **Option B: Dynamic.xyz.** Comparable feature set; smaller community, weaker viem story.
- **Option C: Magic.link.** Older, more enterprise-flavored, weaker on Base.
- **Why A:** spec already names Privy as the primary candidate, lowest integration friction with the existing viem/wagmi stack.

#### D4 — Matchmaking transport
- **Option A (chosen for MVP): `publicClient.getLogs({ event: GameCreated, fromBlock: 'now - 5000 blocks' })` direct from browser.** Pros: zero backend, zero infra, fits the "no central server" principle, fine at <1k games/day. Cons: RPC rate limits, slow at scale, lossy on long-tail history.
- **Option B: thin Ponder/Envio indexer hosted on Railway.** Pros: scales, sub-second lobby refresh. Cons: backend, ops, secret keys, contradicts MVP minimalism.
- **Option C: The Graph.** Pros: decentralized. Cons: subgraph dev/deploy time, latency, overkill for MVP.
- **Why A:** spec ranks scale as out-of-scope; we explicitly capture "swap to indexer at >1k games/day" as a follow-up.

#### D5 — Per-move clock unit
- **Option A (chosen): `block.timestamp` (uint64) with per-game `clockSeconds`.** Pros: human-meaningful (30/60/120s), matches the spec UX, easy to render countdown, decouples from L2 block-time variance. Cons: ±2s jitter from validator clocks (acceptable for a 60s clock with 10s grace).
- **Option B: keep `block.number + TIMEOUT_BLOCKS`.** Pros: zero-diff from current code, deterministic. Cons: Base block time can drift, "blocks" is a bad UX surface, hardcoded global timeout fights per-game configurability.
- **Why A:** the spec explicitly asks for 30/60/120s configurable clocks. Migrating to timestamps is a one-field swap and the existing test only needs `vm.warp` instead of `vm.roll`.

#### D6 — Routing
- **Option A (chosen): `react-router-dom` v6 with `BrowserRouter` and routes `/`, `/g/:gameId`, `/fund`.** Pros: stable, ubiquitous, clean nested routes, Vercel-friendly with SPA fallback rewrite. Cons: ~10KB, learning curve for nested data routing (we don't need it).
- **Option B: TanStack Router.** Better DX, file-based routing, but a bigger lift to retrofit and the team isn't using it elsewhere.
- **Option C: Hash routing (`#/g/123`) with no library.** Cheapest, but `/g/[gameId]` URLs in the spec imply pathname routing and look amateur with `#`.
- **Why A:** smallest learning curve, smallest deviation from the spec's path shape, Vercel rewrite is one line.

#### D7 — Sidecar story for public deploy
- **Chosen: Option E + Option B hybrid (already in spec).** Public deploy uses MockVerifier + a "PREVIEW" banner. A settings panel exposes "Advanced → Run your own prover" that takes a `http://127.0.0.1:8899` URL. The Sepolia contract is deployed twice in v1: once with HonkVerifier (the "real" address) and once with MockVerifier (the "preview" address). Frontend reads `VITE_BATTLESHIP_ADDRESS_PREVIEW` and `VITE_BATTLESHIP_ADDRESS_REAL` and toggles between them based on the user's mode. No alternative considered — the spec already chose this; the Planner's job is to make it testable, not re-litigate it.

### Mode marker
**SHORT mode.** No `--deliberate` flag and no signal in the spec demanding pre-mortem + expanded test plan. (If Architect/Critic upgrades to deliberate, add: pre-mortem of stuck-pot/reentrancy/double-claim, plus e2e Playwright on the deployed Sepolia URL.)

---

## Architecture deltas at a glance

```
contracts/src/BattleshipGame.sol
  + struct Game { stakeWei, pot, paidOut, lastActionAt (uint64),
                  clockSeconds (uint32), drawProposed[2], canceled }
  + enum GameState { Created, Committed, Playing, Finished, Canceled, Drawn }
  + uint256 immutable MIN_STAKE
  + uint32  immutable ABORT_TIMEOUT (e.g. 3600)
  + reentrancy lock (1-slot uint256)
  + createGame(opponent, clockSeconds, stakeWei) payable
  + joinGame(gameId) payable
  + cancelGame(gameId)            // creator OR anyone after ABORT_TIMEOUT
  + claimPot(gameId)              // normal-win payout
  + claimTimeoutWin(gameId)       // EXTEND existing → also pays pot
  + proposeDraw(gameId)
  + withdrawDrawProposal(gameId)
  + getGame returns extended struct (stakeWei, pot, paidOut, drawProposed, lastActionAt)
  + events: GameJoined, PotPaid, StakeRefunded, DrawProposed,
            DrawWithdrawn, GameCanceled
  ~ commitBoard / fireShot / respondShot: only change is bumping
    lastActionAt = uint64(block.timestamp) instead of lastActionBlock = block.number
  ~ TIMEOUT_BLOCKS removed; per-game clockSeconds + GRACE_SECONDS (constant) replace it

contracts/test/BattleshipGame.t.sol
  ~ All 13 existing tests updated to call createGame with (opponent, 60, 0)
    and a new MIN_STAKE=0 setUp
  + ~25 new tests covering escrow paths, draw flow, cancel flow,
    timeout payouts, reentrancy attacker contract
contracts/test/BattleshipGame.invariant.t.sol  (NEW)
  + invariant_contract_balance_eq_sum_active_pots
  + invariant_no_finished_with_unreconciled_pot

contracts/script/Deploy.s.sol           ~ accept MIN_STAKE env var
contracts/script/DeployBaseSepolia.s.sol (NEW) — real HonkVerifier + preview MockVerifier
contracts/foundry.toml                  ~ rpc_endpoints, etherscan, gas_reports

frontend/src/
  + AppRouter.tsx                       (BrowserRouter)
  + routes/Landing.tsx                  (sign-in, New Game, Public Games, Fund)
  + routes/Game.tsx                     (current App.tsx body, parameterised on :gameId)
  + lib/embeddedWallet.ts               (Privy provider behind a thin interface)
  + lib/contract.ts                     (NEW signatures: createGame, joinGame,
                                         claimPot, cancelGame, proposeDraw, etc.)
  + lib/lobby.ts                        (getLogs of GameCreated, filtered)
  + lib/clock.ts                        (countdown hook)
  + components/StakeInput.tsx
  + components/FundWalletPanel.tsx
  + components/PublicGamesList.tsx
  + components/PreviewBanner.tsx
  + components/ClaimPotButton.tsx
  + components/DrawDialog.tsx
  ~ App.tsx                             refactored into Game route; burner wallet path
                                        kept behind VITE_DEMO_MODE=1 for local dev
  ~ lib/burnerWallets.ts                gated behind VITE_DEMO_MODE=1
vercel.json                             COOP/COEP headers + SPA rewrite
```

---

## Work Packages

Eight packages, sliced so the critical path is **WP1 → WP2 → (WP3 ‖ WP4 ‖ WP5) → WP6 → WP7 → WP8**. WP3/WP4/WP5 are the parallel fan-out for `/team`. `/ralph` should run them sequentially in the listed order.

### WP1 — Contract escrow + clock surface (CRITICAL PATH)
- **Goal:** extend `BattleshipGame.sol` with stake/pot/clock/draw/cancel without touching the proven state machine. Demo path stays green throughout (`MIN_STAKE=0` constructor).
- **Files touched:**
  - `contracts/src/BattleshipGame.sol` (extend, do not rewrite)
  - `contracts/script/Deploy.s.sol` (pass MIN_STAKE)
- **Depends on:** nothing (this is the foundation)
- **Key implementation notes:**
  - Use OpenZeppelin `ReentrancyGuard` (verified present at `contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol`). Import as `import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";` and declare `contract BattleshipGame is ReentrancyGuard`. Every payout path (`claimPot`, `claimTimeoutWin`, `cancelGame`, `proposeDraw`'s second-side refund, `withdrawDrawProposal` does not touch ETH) uses the `nonReentrant` modifier. Add `contracts/remappings.txt` if not present so `openzeppelin-contracts/` resolves.
  - `MaliciousReceiver` test fixture lives at `contracts/test/helpers/MaliciousReceiver.sol` — its `receive()` re-enters `claimPot` on the target game; the test asserts the re-entrant call reverts on `nonReentrant` and that the attacker balance equals exactly `pot` (not `2 * pot`).
  - All payouts use `(bool ok,) = to.call{value: amount}(""); require(ok)` AFTER state writes (CEI)
  - `paidOut` flag is the source of truth — once true, every payout path reverts
  - `lastActionAt` becomes `uint64(block.timestamp)`; old `block.number` callsites swapped 1:1
  - `claimTimeoutWin` is **extended** (not replaced) — same laggard logic, plus a `_payoutPot(gameId, msg.sender)` call at the end
  - `proposeDraw` only legal in `Committed` or `Playing`; `withdrawDrawProposal` legal until both flags are set
  - `cancelGame` legal iff `state == Created && player2 == address(0) && (msg.sender == creator || block.timestamp > createdAt + ABORT_TIMEOUT)`
- **Test strategy:**
  - Update all 13 existing tests to the new `createGame(opponent, clockSeconds=60, stakeWei=0)` signature with `setUp` deploying `MIN_STAKE=0`. They must still pass.
  - **Per-function unit test mapping (every escrow-touching function gets ≥1 named test):**
    | Function | Named tests |
    |---|---|
    | `createGame` | `test_createGame_locks_value`, `test_createGame_rejects_below_min`, `test_createGame_rejects_value_mismatch` |
    | `joinGame` | `test_joinGame_rejects_wrong_value`, `test_joinGame_locks_value`, `test_joinGame_sets_player2` |
    | `claimPot` | `test_claimPot_happy_path`, `test_claimPot_reentrancyAttackerReverts`, `test_claimPot_requires_finished_state`, `test_claimPot_only_winner` |
    | `claimTimeoutWin` | `test_timeoutWin_pays_pot_playing`, `test_timeoutWin_pays_pot_committed`, `test_timeoutWin_reverts_too_early` |
    | `cancelGame` | `test_cancelGame_creator_refund`, `test_cancelGame_rejects_after_join`, `test_cancelGame_stale_sweep_after_timeout` |
    | `proposeDraw` | `test_proposeDraw_one_sided_no_refund`, `test_proposeDraw_both_sides_refunds_both` |
    | `withdrawDrawProposal` | `test_withdrawDrawProposal_unsets_flag`, `test_withdrawDrawProposal_rejects_non_player` |
  - **Reentrancy test spec:** `test_claimPot_reentrancyAttackerReverts()` — deploy `contracts/test/helpers/MaliciousReceiver.sol` as the winning player, drive a full game to Finished, call `claimPot` from the attacker; the attacker's `receive()` re-enters `claimPot(gameId)`; expect the re-entrant inner call to revert via `ReentrancyGuardReentrantCall`; after the outer call returns, assert `address(attacker).balance == pot` (single payout — attacker did NOT double-drain) and `game.paidOut == true`.
  - Additional coverage (non-mapping): double-forfeit race in `Committed` state (whoever calls `claimTimeoutWin` first wins — documented edge case).
  - **Invariant test file (new):** `contracts/test/BattleshipGame.invariant.t.sol` + handler `contracts/test/handlers/BattleshipGameHandler.sol`
    - Bounded actors: **2** (alice, bob) — fuzzer can only drive tx from these two addresses, matching a real 2-player game.
    - Handler maintains a ghost `uint256 ghostSumActivePots` updated on every create/join/win/cancel/draw path.
    - `invariant_balance_eq_sum_active_pots()` — exact expression: `assert(address(game).balance == handler.sumActivePots())` where `sumActivePots()` returns the ghost variable.
    - `invariant_no_stuck_pot()` — for every finalized gameId the handler has touched, `!(game.state in {Finished, Canceled, Drawn} && game.pot > 0 && game.paidOut == false)`.
- **Acceptance criteria:**
  - [ ] All 13 original tests pass against the extended contract
  - [ ] All 25 new unit tests pass
  - [ ] Both invariants hold over `runs=256, depth=64`
  - [ ] `forge coverage` ≥ 95% on `BattleshipGame.sol`
  - [ ] No SLOAD/SSTORE pattern in payout paths violates CEI (manual review)

### WP2 — Demo path & MockVerifier deploy regression
- **Goal:** prove that `scripts/demo-fast.sh` and local hot-seat play still work with WP1's contract. This is a separate package because it's a *gate*: if WP1 broke the demo, nothing else ships.
- **Files touched:**
  - `scripts/demo-fast.sh` (pass `MIN_STAKE=0` env)
  - `contracts/script/Deploy.s.sol` (read `MIN_STAKE` env, default 0)
  - `frontend/src/lib/contract.ts` (update `createGame` signature; demo path passes `clockSeconds=60, stakeWei=0`)
  - `frontend/src/App.tsx` (only the createGame callsite — single line)
- **Depends on:** WP1
- **Test strategy:**
  - Commit the headless walker to `scripts/demo-headless.mjs` (Playwright script, two-context hot-seat walk of the local demo)
  - CI pass/fail signal: **`scripts/demo-fast.sh && forge test -vvv && node scripts/demo-headless.mjs` all exit 0**
- **Acceptance criteria:**
  - [ ] `scripts/demo-fast.sh` exits 0 and writes a working address to `frontend/.env.local`
  - [ ] `forge test -vvv` exits 0 (all 13 original + all WP1 new tests green)
  - [ ] `node scripts/demo-headless.mjs` exits 0 — completes P1 place → P2 place → 17 hits → win screen, zero console errors
  - [ ] CI job `demo-regression-gate` chains all three commands and blocks merge on failure

### WP3 — Privy embedded wallet + routing shell  (parallelizable)
- **Goal:** strip burner wallets from the production path, wire Privy, add `react-router-dom` with the three routes. Demo mode (`VITE_DEMO_MODE=1`) keeps burners.
- **Files touched:**
  - `frontend/package.json` (+ `@privy-io/react-auth`, `react-router-dom`)
  - `frontend/src/main.tsx` (PrivyProvider + RouterProvider)
  - `frontend/src/AppRouter.tsx` (NEW)
  - `frontend/src/lib/embeddedWallet.ts` (NEW — interface + Privy impl + burner impl gated by env)
  - `frontend/src/lib/burnerWallets.ts` (gated)
  - `frontend/src/routes/Landing.tsx` (NEW — stub OK)
  - `frontend/src/routes/Game.tsx` (NEW — wraps existing App.tsx body)
  - `vercel.json` (NEW — COOP/COEP + SPA rewrite; **headers must be declared on the rewrite target `/index.html` AND on `/(.*)` because Vercel strips headers on rewrite destinations unless they are declared on the final served path**). Exact block:
    ```json
    {
      "rewrites": [
        { "source": "/g/:gameId", "destination": "/index.html" },
        { "source": "/preview/g/:gameId", "destination": "/index.html" },
        { "source": "/real/g/:gameId", "destination": "/index.html" },
        { "source": "/fund", "destination": "/index.html" }
      ],
      "headers": [
        {
          "source": "/(.*)",
          "headers": [
            { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
            { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
            { "key": "Cross-Origin-Resource-Policy", "value": "same-origin" }
          ]
        },
        {
          "source": "/index.html",
          "headers": [
            { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
            { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
            { "key": "Cross-Origin-Resource-Policy", "value": "same-origin" }
          ]
        }
      ]
    }
    ```
  - `frontend/.env.example` (NEW — `VITE_PRIVY_APP_ID`, `VITE_BATTLESHIP_ADDRESS_REAL`, `VITE_BATTLESHIP_ADDRESS_PREVIEW`, `VITE_CHAIN_ID`, `VITE_BASE_SEPOLIA_RPC`, `VITE_DEMO_MODE`)
- **Depends on:** WP1 (for ABI), WP2 (must not regress demo)
- **Test strategy:**
  - Vitest: `embeddedWallet` interface conformance (burner impl satisfies same contract as Privy mock impl)
  - Manual: `VITE_DEMO_MODE=1 npm run dev` → demo path unchanged
  - Manual: with a Privy app id, sign in with email → wallet address shown
- **Acceptance criteria:**
  - [ ] `npm run build` succeeds
  - [ ] Demo-mode build matches current visual + functional behavior
  - [ ] Production-mode build shows Landing page with sign-in
  - [ ] `/g/123` route renders the Game shell (data layer can be a TODO)
  - [ ] COOP/COEP headers present on dev and `vercel build` output

### WP4 — Lobby / matchmaking / share-link  (parallelizable with WP3)
- **Goal:** Public Games tab + share-link join flow on top of `GameCreated` event scan. UI-only against a stubbed contract during dev; wired to WP1 ABI at end.
- **Files touched:**
  - `frontend/src/lib/lobby.ts` (NEW — `listOpenGames(client, fromBlock)`)
  - `frontend/src/components/PublicGamesList.tsx` (NEW)
  - `frontend/src/components/StakeInput.tsx` (NEW)
  - `frontend/src/components/CreateGameDialog.tsx` (NEW)
  - `frontend/src/lib/contract.ts` (extend with `createGame`, `joinGame`, `getGame`)
- **Depends on:** WP1 (event signature), WP3 (router shell)
- **Test strategy:**
  - Vitest: lobby filter logic (open games only, sorted by stake desc, dedupe joined ones)
  - Local anvil + WP1 contract: create 3 games, verify lobby renders 3 entries with correct stakes
  - Share-link: open `/g/{id}` in second browser → joinGame succeeds
- **Acceptance criteria:**
  - [ ] Public Games list renders open games from on-chain events (last N blocks)
  - [ ] Stake input validates ≥ MIN_STAKE and ≤ wallet balance
  - [ ] Create flow lands on `/g/{newId}` with copy-share-link button
  - [ ] Join flow from URL or list lands both players in placement

### WP5 — Fund-wallet panel + per-move clock UI  (parallelizable with WP3, WP4)
- **Goal:** the "you need ETH" story (faucet links, QR, balance polling) and the visible countdown clock.
- **Files touched:**
  - `frontend/src/components/FundWalletPanel.tsx` (NEW)
  - `frontend/src/lib/clock.ts` (NEW — `useCountdown(lastActionAt, clockSeconds, graceSeconds)`)
  - `frontend/src/components/MoveClock.tsx` (NEW — countdown chip + claim-timeout button)
  - `frontend/src/components/PreviewBanner.tsx` (NEW)
- **Depends on:** WP1 (lastActionAt field in getGame), WP3 (router)
- **Test strategy:**
  - Vitest: `useCountdown` hook with `vi.useFakeTimers()`
  - Manual: faucet links open, QR renders for the connected address, balance updates after a faucet drip
  - Manual: clock counts down, hits zero, claim-timeout button appears for non-laggard
- **Acceptance criteria:**
  - [ ] Fund panel shows address, QR, copy button, three faucet links
  - [ ] "Insufficient funds" guards Create/Join when balance < stake + 0.001 ETH gas buffer
  - [ ] Clock visible on `/g/:id`, ticks down once per second
  - [ ] Claim-timeout button posts the correct tx and finalizes

### WP6 — Escrow UI integration: claim, draw, cancel
- **Goal:** wire the three escrow-related buttons to WP1's payout paths with confirm dialogs and optimistic UI.
- **Required `data-testid` attributes** (WP8 Playwright asserts on these):
  - `data-testid="preview-banner"` on `PreviewBanner.tsx`
  - `data-testid="claim-pot-button"` on `ClaimPotButton.tsx`
  - `data-testid="paid-out-marker"` on the post-claim UI node that renders when `getGame().paidOut === true`
  - `data-testid="win-screen"` on `WinScreen.tsx`
  - `data-testid="share-link-copy"` on the share-link button
  - `data-testid="placement-ready"` on the Ready-to-commit button
  - `data-testid="create-game-submit"`, `data-testid="join-game-submit"`
- **Files touched:**
  - `frontend/src/components/ClaimPotButton.tsx`
  - `frontend/src/components/DrawDialog.tsx`
  - `frontend/src/components/CancelGameButton.tsx`
  - `frontend/src/routes/Game.tsx` (mount the three above based on game state)
  - `frontend/src/components/WinScreen.tsx` (extend with "Claim N ETH" CTA)
- **Depends on:** WP1, WP3, WP5
- **Test strategy:**
  - End-to-end (anvil + Privy mock or burner): create game with stake → both join → P1 wins → claimPot succeeds → balance increases by `2 * stake - gas`
  - Draw flow: P1 propose → P2 propose → both refunded
  - Cancel flow: P1 create → P1 cancel → refunded
- **Acceptance criteria:**
  - [ ] Win screen shows "Claim X ETH" button after WIN_HITS, calls `claimPot`, reflects `paidOut`
  - [ ] Both-sided draw refunds both, single-sided draw exposes "Withdraw proposal"
  - [ ] Creator cancel button visible only in `Created` state with no opponent
  - [ ] All three flows show a confirm dialog with the ETH amount

### WP6.5 — Security review gate (HARD BLOCKER — not advisory)
- **Goal:** no contract reaches Base Sepolia without an explicit self-review + `security-reviewer` agent pass. This package produces no new code; it produces a signed review artifact that gates WP7.
- **Files touched:**
  - `.omc/reviews/wp1-battleship-escrow-selfreview.md` (NEW — planner/executor self-review notes)
  - `.omc/reviews/wp1-battleship-escrow-security.md` (NEW — `security-reviewer` agent output)
- **Depends on:** WP1, WP6
- **Checklist (all must be signed off):**
  - [ ] CEI ordering verified on `claimPot`, `claimTimeoutWin`, `cancelGame`, `proposeDraw` (second-side refund)
  - [ ] `nonReentrant` present on every ETH-sending function
  - [ ] `paidOut` flag flipped BEFORE external call on every payout
  - [ ] No path reaches a terminal state (`Finished`, `Canceled`, `Drawn`) with `pot > 0 && paidOut == false`
  - [ ] Draw flags reset on `Finished` transition (can't re-trigger after game ends)
  - [ ] `cancelGame` rejects after `player2 != address(0)`
  - [ ] Stake floor enforcement: `stakeWei >= MIN_STAKE` AND `msg.value == stakeWei` on both `createGame` and `joinGame`
  - [ ] Foundry invariants green over `runs=512, depth=128` (stricter than WP1's initial 256/64 smoke)
  - [ ] Slither run clean (or triaged with written justification for each finding)
  - [ ] `security-reviewer` agent verdict = PASS
- **Acceptance criteria:**
  - [ ] Both review artifacts committed
  - [ ] WP7 is blocked by CI on the presence of `wp1-battleship-escrow-security.md` containing `VERDICT: PASS`

### WP7 — Base Sepolia deploy + Basescan verification
- **Goal:** ship a real address on Base Sepolia and a parallel preview address with MockVerifier. Hardcode addresses in `.env.example` and README.
- **Files touched:**
  - `contracts/script/DeployBaseSepolia.s.sol` (NEW)
  - `contracts/foundry.toml` (rpc_endpoints, etherscan, gas reports)
  - `README.md` (addresses + faucet pointers + dress-rehearsal tx hashes)
  - `frontend/.env.production` (NEW)
  - `vercel.json` (env passthrough)
- **Depends on:** WP1, WP6, **WP6.5 (hard blocker)**
- **Dress-rehearsal checklist** (enumerated, all must tick before WP8):
  - [ ] (a) `forge script DeployBaseSepolia --rpc-url $BASE_SEPOLIA --broadcast --verify` deploys BOTH the real-HonkVerifier address AND the preview-MockVerifier address
  - [ ] (b) Both contracts verified on Basescan with matching constructor args (boardVerifier, shotVerifier, minStake)
  - [ ] (c) Two funded EOAs play one full preview game end-to-end: createGame → joinGame → commitBoard×2 → 17 hits → `claimPot` → winner balance increased by `2 * stakeWei - gas`
  - [ ] (d) One cancel-before-join refund flow: createGame → cancelGame → creator balance restored minus gas
  - [ ] (e) One timeout-claim path: createGame → joinGame → commitBoard → stall past `clockSeconds + GRACE_SECONDS` → `claimTimeoutWin` pays pot
  - [ ] (f) After (c), (d), (e) finalize, assert `address(previewGame).balance == 0`
  - [ ] (g) Record all tx hashes (deploy, createGame, joinGame, commitBoard, claimPot, cancelGame, claimTimeoutWin) in `README.md` under a "Dress Rehearsal — <date>" section
- **Acceptance criteria:**
  - [ ] All seven dress-rehearsal checkboxes ticked with tx hashes in README
  - [ ] `DeployBaseSepolia.s.sol` is idempotent (re-runnable safely; skips already-deployed verifiers)
  - [ ] `frontend/.env.production` contains both addresses under the right env var names

### WP8 — Public deploy + smoke test
- **Goal:** Vercel deploy + headless chromium smoke test from two browser contexts on the deployed URL.
- **Files touched:**
  - `vercel.json`
  - `.github/workflows/ci.yml` (add a deploy-preview job)
  - `scripts/smoke-public.mjs` (NEW — playwright two-context preview-mode game)
- **Depends on:** WP7
- **Test strategy (enumerated Playwright assertions in `scripts/smoke-public.mjs`):**
  - (a) `await expect(page.locator('[data-testid=preview-banner]')).toBeVisible()` on landing
  - (b) Two browser contexts (ctxA, ctxB) both reach the Placement screen within 30s of signing in and joining the game
  - (c) Full placement → fire → win flow: drive 17 hits from ctxA; `await expect(ctxA.locator('[data-testid=win-screen]')).toContainText(/You Win/i)`
  - (d) Click `[data-testid=claim-pot-button]`; `await expect(ctxA.locator('[data-testid=paid-out-marker]')).toBeVisible()` within 20s
  - (e) Total wall-clock from first sign-in to `paid-out-marker` visible < **8 minutes** (measured via `Date.now()` span)
  - (f) `curl -I` on the deployed URL returns `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
- **Acceptance criteria:**
  - [ ] All six assertions above pass in CI on the Vercel preview URL
  - [ ] CI job `public-smoke` is green against the deployed URL
  - [ ] Console error count == 0 across both contexts during the run

---

## Dependency graph

```
WP1 (contract) ──► WP2 (demo regression gate)
                          │
              ┌───────────┴───────────┐
              ▼           ▼           ▼
            WP3         WP4         WP5
         (privy +      (lobby)    (fund +
         routing)                  clock)
              └───────────┬───────────┘
                          ▼
                       WP6 (escrow UI)
                          │
                          ▼
                  WP6.5 (security gate) ⛔ hard blocker
                          │
                          ▼
                    WP7 (sepolia deploy)
                          │
                          ▼
                    WP8 (public smoke)
```

---

## ADRs

### ADR-1 — Escrow lives inside `BattleshipGame.sol`
- **Decision:** All stake/pot logic is added to `BattleshipGame.sol`; no separate `Escrow.sol`.
- **Drivers:** Atomicity with state transitions; non-upgradeable so reuse value of a separate contract is zero; spec explicitly chose this.
- **Alternatives considered:** Standalone `Escrow.sol` with `BattleshipGame` as the only authorized payer.
- **Why chosen:** Minimal surface, single invariant suite, zero cross-contract auth risk.
- **Consequences:** `BattleshipGame.sol` grows ~250 LoC; the file becomes the entire blast radius for stake bugs; tests must cover both gameplay and treasury paths.
- **Follow-ups:** If a v2 fee model or multi-game treasury becomes a requirement, factor escrow out then.

### ADR-2 — `MIN_STAKE` constructor param keeps the demo working
- **Decision:** Constructor takes `(boardVerifier, shotVerifier, minStake)`. Demo deploys with `0`, Sepolia deploys with `1e14`.
- **Drivers:** Spec says the demo never breaks; spec says contract enforces a floor.
- **Alternatives:** Two separate contracts; hardcoded floor; frontend-only floor.
- **Why chosen:** Single source of truth, smallest diff to existing tests, demo stays a one-liner.
- **Consequences:** Six concrete touchpoints — **not "one line"**:
  1. `contracts/test/BattleshipGame.t.sol` `_createGame()` helper updated to `game.createGame{value: 0}(bob, 60, 0)` (new positional params `clockSeconds=60`, `stakeWei=0`)
  2. `contracts/test/BattleshipGame.t.sol` `setUp()` constructs `BattleshipGame(boardVerifier, shotVerifier, 0)` with `minStake=0`
  3. `frontend/src/lib/contract.ts` `createGame()` signature gains `clockSeconds` and `stakeWei` params; demo path passes `60, 0n`
  4. `frontend/src/App.tsx:204-207` callsite updated to pass `(60, 0n)` alongside the opponent address
  5. `contracts/script/Deploy.s.sol` reads `vm.envOr("MIN_STAKE", uint256(0))` and forwards to constructor; default 0 keeps demo fast path working without env var
  6. `scripts/demo-fast.sh` explicitly `export MIN_STAKE=0` before the `forge script` invocation (belt-and-suspenders — doesn't rely on default)
- **Follow-ups:** Document the floor prominently in README; consider raising it post-v1 if Sepolia faucet caps change.

### ADR-3 — `@privy-io/react-auth` for embedded wallets
- **Decision:** Privy is the embedded-wallet provider, abstracted behind `lib/embeddedWallet.ts`.
- **Drivers:** Spec names Privy as primary; best viem story; ships fastest.
- **Alternatives:** Dynamic.xyz, Magic.link.
- **Why chosen:** Lowest friction with existing viem stack, free tier covers MVP.
- **Consequences:** Vendor dependency; mitigated by the abstraction layer (1–2 day swap to Dynamic if needed).
- **Follow-ups:** Confirm the abstraction surface stays minimal (sign tx, sign message, get address, get balance) so an alternate impl is easy.

### ADR-4 — Browser `getLogs` for matchmaking, no indexer
- **Decision:** Lobby reads `GameCreated` events directly from a public RPC.
- **Drivers:** No backend; ships in hours, not days; <1k games/day is well within RPC budgets.
- **Alternatives:** Ponder/Envio indexer; The Graph subgraph.
- **Why chosen:** Aligns with "no central server" principle; defers ops cost until traffic earns it.
- **Consequences (concrete operating parameters):**
  - `fromBlock` window = **4500 blocks** (~2.5h at Base 2s block time) — captures the realistic "open game" lifetime
  - Primary RPC: **Alchemy Base Sepolia free tier** via `VITE_BASE_SEPOLIA_RPC` env var
  - Fallback RPC: **`https://sepolia.base.org`** used as a 1-shot retry on primary 429/5xx
  - Refresh debounce: **30s** between lobby refetches (manual "Refresh" button bypasses)
  - Backoff: exponential on 429, base 1s, factor 2, max 30s, max 5 retries then surface error banner
  - Hard cap: **250 events per scan** (slice `logs.slice(-250)` if exceeded; log warning)
  - Lobby refresh is RPC-bound (~1–3s p50); long-tail history beyond 4500 blocks is intentionally lossy
- **Follow-ups:** Watch RPC rate-limit headers; if refresh exceeds 3s p50 or the 250-event cap trips >5% of scans, ship a Ponder indexer (pre-scoped as a 1-day spike).

### ADR-5 — `block.timestamp` (uint64) replaces `block.number` for clocks
- **Decision:** Per-game `clockSeconds` (uint32), `lastActionAt` (uint64 timestamp), shared `GRACE_SECONDS` constant.
- **Drivers:** Human-meaningful 30/60/120s clocks; spec UX requirement.
- **Alternatives:** Keep `block.number + TIMEOUT_BLOCKS`.
- **Why chosen:** Human time matches the UX countdown directly; ±2s validator drift is negligible against a 60s clock with 10s grace.
- **Consequences:**
  - Existing tests swap `vm.roll` → `vm.warp` (plus a paired `vm.roll` to keep the block number monotonic for the secondary witness below).
  - **Base sequencer recovery risk:** when the Base sequencer recovers from an outage, it can post a burst of blocks with clustered / backdated timestamps. A naive `block.timestamp > lastActionAt + clockSeconds` check could either fire prematurely (if clock jumps forward during recovery) or never fire (if clock stalls). Mitigation: **belt-and-suspenders secondary witness** — `claimTimeoutWin` additionally requires `block.number > g.lastActionBlock + MIN_BLOCKS_FOR_TIMEOUT` where `MIN_BLOCKS_FOR_TIMEOUT = 5`. Both conditions must hold. We keep `lastActionBlock` as a second storage field alongside `lastActionAt`, and update both on every state-advancing call.
  - `lastActionBlock` costs one extra SSTORE per action (~5k gas) — negligible against the ~2.7M gas HonkVerifier call.
- **Follow-ups:** If Base upgrades to a deterministic-timestamp fork, the block-number witness can be removed without breaking existing games (legacy paths still satisfy both).

### ADR-6 — `react-router-dom` v6 for `/`, `/g/:gameId`
- **Decision:** Add `react-router-dom` v6 with `BrowserRouter`; Vercel SPA rewrite to `index.html`.
- **Drivers:** Spec implies pathname routes; share links should look real.
- **Alternatives:** TanStack Router; hash routing.
- **Why chosen:** Stable, ubiquitous, smallest learning curve, smallest deviation from the spec's URL shape.
- **Consequences:** ~10KB bundle delta; one rewrite line in `vercel.json`.
- **Follow-ups:** None.

### ADR-7 — Option E + Option B hybrid for proving on the public deploy
- **Decision:** Public Sepolia deploy has two contracts — a real-HonkVerifier address and a MockVerifier "preview" address. Frontend defaults to the preview, with an "Advanced → run your own prover" toggle that points at a local sidecar and the real-Honk address. **Routing is mode-scoped**: `/preview/g/:gameId` for the preview contract and `/real/g/:gameId` for the real-Honk contract. The lobby `getLogs` scan is parameterized on the **active mode's contract address** — switching mode triggers a full lobby refetch and a URL rewrite. This eliminates the "which game belongs to which contract" ambiguity.
- **Drivers:** Browser bb.js is broken upstream; sidecar requires Node install; spec already chose this hybrid.
- **Alternatives:** Wait for Aztec; remote prover service; bundled desktop wrapper.
- **Why chosen:** Ships now; honest about the limitation; preserves "two strangers, any browser" UX; gives crypto-curious users a real path. Mode-scoped routes prevent cross-contract gameId collisions in the lobby and share-link flows.
- **Consequences:**
  - Two deployed addresses to maintain (`VITE_BATTLESHIP_ADDRESS_PREVIEW`, `VITE_BATTLESHIP_ADDRESS_REAL`)
  - UI must surface mode clearly via `[data-testid=preview-banner]`
  - Vercel rewrites defined for BOTH `/preview/g/:gameId` and `/real/g/:gameId` (both added in WP3's `vercel.json` block)
  - Share links include the mode prefix — a preview-game link opened while in real mode triggers a confirmation dialog and a mode switch, not a silent-fail
  - `lib/lobby.ts` takes `contractAddress` as a parameter; mode toggle in the Landing page refetches
- **Follow-ups:** When upstream bb.js is fixed, retire the preview path, flip the default to `/real/g/:id`, and redirect bare `/g/:id` → `/real/g/:id`.

---

## Risk register (Planner pass — Critic should expand)

1. **Reentrancy on `claimPot` via malicious receiver.** Mitigation: CEI + `paidOut` flag + `_locked` guard + explicit attacker test in WP1.
2. **Stuck pot in an unhandled terminal state.** Mitigation: invariant test enumerates every state transition path and asserts no leftover pot.
3. **Privy outage / pricing change.** Mitigation: `embeddedWallet.ts` interface; documented as 1–2 day swap.
4. **RPC rate-limit on lobby getLogs.** Mitigation: cap `fromBlock` window, debounce refresh, document indexer follow-up.
5. **Demo regression from contract changes.** Mitigation: WP2 is a dedicated gate package; CI runs `forge test` + `demo-fast.sh` smoke.
6. **Validator clock drift on `block.timestamp`.** Mitigation: 10s grace; `clockSeconds ≥ 30` enforced in `createGame`.
7. **Double-forfeit race in `Committed` state.** Documented as intentional per spec; covered by test.
8. **In-contract escrow blast radius (testnet-only v1).** Because stake logic and game logic share a contract, a single bug can drain every active pot. Mitigation: v1 is explicitly **Base Sepolia only** — mainnet promotion is gated on an **external audit** (out of scope for v1, but pre-scoped as a post-v1 follow-up). No mainnet deploy script ships in WP7.
9. **Two-contract lobby ambiguity.** With both a real-Honk and a preview-Mock contract deployed at different addresses, a naive lobby scan could surface the wrong `gameId` or let a share link land a user on the wrong contract. Mitigation: **mode-scoped routing** (ADR-7) — `/preview/g/:id` vs `/real/g/:id`, lobby parameterized on active mode's contract address, share links include the mode prefix, cross-mode link opens trigger a confirm+switch dialog.
10. **Base sequencer timestamp clustering.** Post-outage timestamp bursts could cause `block.timestamp`-only timeouts to fire early or never. Mitigation: **`block.number` secondary witness** (ADR-5 consequences) — `claimTimeoutWin` requires both `block.timestamp > lastActionAt + clockSeconds + GRACE_SECONDS` AND `block.number > lastActionBlock + MIN_BLOCKS_FOR_TIMEOUT` (=5).

---

## Open Questions (write to `.omc/plans/open-questions.md`)

- Exact `MIN_STAKE` value for Sepolia deploy: 1e14 wei (~0.0001 ETH) is the default; confirm with stakeholder.
- Exact `ABORT_TIMEOUT`: 1 hour per spec; confirm.
- `clockSeconds` allowed values: hardcode {30, 60, 120} or accept any uint32 in `[30, 600]`?
- Privy app id provisioning: who owns the account?
- Vercel project ownership / domain.
- CI: should `BaseSepolia` deploy run on every main merge or only on manual dispatch?

---

## Plan Summary

**Plan saved to:** `.omc/plans/ralplan-battleship-real-multiplayer.md`

**Scope:**
- 8 work packages, 1 critical path (WP1 → WP2 → fan-out → WP6 → WP7 → WP8)
- ~250 LoC added to `BattleshipGame.sol`, ~25 new unit tests + 2 invariants
- ~12 new frontend files, ~3 refactored
- 2 new deploy scripts, 1 new vercel config, 1 README update
- Estimated complexity: **HIGH** (real ETH escrow + new auth + new routing + new deploy target)

**Key Deliverables:**
1. Extended `BattleshipGame.sol` with stake/pot/draw/cancel/clock, demo path preserved
2. Foundry invariant suite proving no stuck ETH
3. Privy-backed Vite SPA with `/`, `/g/:gameId` routes, lobby, fund panel, clock
4. Two Base Sepolia addresses (real + preview) verified on Basescan
5. Vercel public deploy with COOP/COEP + smoke test
