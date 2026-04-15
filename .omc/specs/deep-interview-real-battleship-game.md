# Deep Interview Spec: Battleship.zk — Real Multiplayer Game

## Metadata
- Interview ID: real-battleship-game
- Rounds: 6
- Final Ambiguity: 18%
- Type: brownfield (extends current demo)
- Status: PASSED
- Threshold: 20%

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|---|---|---|---|
| Goal Clarity | 0.85 | 35% | 0.298 |
| Constraint Clarity | 0.85 | 25% | 0.213 |
| Success Criteria | 0.75 | 25% | 0.188 |
| Context Clarity | 0.85 | 15% | 0.128 |
| **Total Clarity** | | | **0.826** |
| **Ambiguity** | | | **17.4%** |

## Goal

Take the current single-machine hot-seat Battleship.zk demo and ship a **publicly playable multiplayer version** on **Base Sepolia (a real live L2 testnet)** that two strangers on two separate browsers can play against each other with real zk cheat-resistance. Sepolia ETH (free from faucets) stands in for real ETH so we see genuine network behavior with zero financial risk; mainnet promotion is post-v1.

The game is **free-play, real-time, short-clock**. A player clicks "New Game", gets a share link, sends it to a friend, both join, both place fleets, both prove board legality in their browser, they play a round, someone wins, rematch button. Matches take 5–10 minutes start to finish.

The cryptographic novelty (provable cheat-resistance) is the draw, **backed by real on-chain ETH stakes** — players wager real ETH per game, winner takes the pot, no leaderboard/ELO.

**The existing demo (`scripts/demo-fast.sh` + MockVerifier) stays fully working as the local-development path.** Nothing in this spec breaks the demo. The real-game work ships as an *additional* deployment target, not a replacement.

## Non-Goals
- Global leaderboards, ELO, ranking, seasons, tournaments
- Async play with email/push notifications
- Long-form persistent games (>30 minutes)
- Custom rule variants or alternate fleet sizes
- Mobile-first responsive UI (desktop targets only; mobile can be a follow-up)
- Anti-collusion or chat moderation
- Spectator mode
- Replacing the existing local demo — the demo stays

## Acceptance Criteria

### Onboarding
- [ ] Player opens `https://<deploy-url>`, clicks "Sign in", signs in with email or Google via Privy (or Dynamic), lands inside the app with an embedded wallet already provisioned
- [ ] No MetaMask install required, no seed phrase shown — but players DO need to fund their embedded wallet with Sepolia ETH (from a faucet) to stake and pay gas (see Real-ETH economics below)
- [ ] Sign-in state persists across page reloads (localStorage or httpOnly cookie from the auth provider)

### Game creation & matchmaking
- [ ] "New Game" button on landing page calls `createGame(opponent=0x0)` on L2 (Base Sepolia MVP, Base mainnet post-MVP), gets a `gameId`, routes player to `/g/{gameId}` with share-link copy button
- [ ] "Public Games" tab on landing page lists open gameIds pulled from `GameCreated` events with `opponent == 0x0` (no opponent yet), filtered to games created in the last N minutes
- [ ] Clicking a public-games entry or opening a share-link URL joins that game as player 2 (the contract updates `opponent` via a `joinGame(gameId)` call), both players land in the placement screen

### Real-ETH economics (no sponsorship)
- [ ] Players pay their own gas out of their Privy embedded wallet — **no paymaster, no sponsorship**. The "you need ETH" story is honest and consistent with the stake model.
- [ ] First-run onboarding shows the wallet address + a "Fund wallet" panel with (a) QR code, (b) copyable address, (c) direct links to Base Sepolia faucets (Coinbase CDP faucet, Alchemy faucet, QuickNode faucet), (d) a visible reminder: "this is Base Sepolia — the ETH is testnet ETH from a faucet, not real money. You need enough for your stake + gas for ~3 txs."
- [ ] Game creation UI has a **stake input field** — creator picks any amount ≥ `MIN_STAKE` (contract-enforced floor, e.g. 0.0001 ETH, to prevent spam) and ≤ wallet balance
- [ ] `createGame(opponent=0x0, clockSeconds, stakeWei)` is `payable` and locks exactly `stakeWei` from the creator
- [ ] `joinGame(gameId)` is `payable` and requires `msg.value == game.stakeWei` — joiner matches the creator's stake exactly; mismatched value reverts
- [ ] Public-games lobby shows each open game's stake prominently; filter/sort by stake
- [ ] Pre-game UI warns if wallet balance is below (stake + estimated gas buffer) and disables "Create"/"Join" until funded

### Real zk proving (UPDATED after Lane AA — sidecar is the path forward)

**Lane AA finding:** The browser build of `@aztec/bb.js@5.0.0-nightly.20260324` emits UltraHonk proofs that revert the deployed Solidity `HonkVerifier` with `SumcheckFailed`, while the **Node build of the exact same bb.js version** produces proofs that verify both natively and on-chain. The skew is browser-wasm-specific (CRS/worker loading under cross-origin isolation), not a protocol or VK bug.

**Conclusion:** Shipping a public multiplayer game that relies on in-browser bb.js is blocked until Aztec fixes the browser wasm loader. The sidecar approach is the working path.

- [ ] Real proof generation goes through a **localhost Node proving sidecar** (`scripts/prove-sidecar.mjs`) on port 8899
- [ ] Placing a fleet + clicking Ready POSTs the fleet layout to `http://127.0.0.1:8899/prove-board`, receives a real UltraHonk proof, submits via `commitBoard` — measured **6.1s cold, 5.6s warm** including chain round-trip
- [ ] Firing a shot posts to `/prove-shot`, measured **5.3s** round-trip
- [ ] The generated proof is accepted by the on-chain `HonkVerifier` (verified — tx status=1, gasUsed=2,693,647)
- [ ] Full E2E bench run in headless chromium: zero console errors, P1 commit + P2 commit + shot-response all landed

### Sidecar implication for the PUBLIC multiplayer story (NEW)

The local-sidecar path works for the current demo but creates a deployment problem for "two strangers on any two browsers":

**Option A — bundled desktop wrapper**: ship the game as an Electron/Tauri app with the sidecar embedded. One-click install, zero config, proving stays client-side. **Loses "just open a URL" UX.** Biggest scope hit.

**Option B — `npx battleship-zk-prove` CLI**: players install Node.js and run `npx battleship-zk-prove` in a terminal before opening the game. The in-app prover-sidecar-URL field lets them paste in their own sidecar address. **Terrible UX for casual players** but keeps the trust model and ships fast.

**Option C — trusted remote prover service**: host the sidecar on a public URL, have players POST witnesses to it. **Breaks privacy**: the remote server sees each player's fleet layout. Only acceptable if run in a TEE (SGX/TDX) or if the privacy guarantee isn't critical.

**Option D — wait for Aztec to fix the browser bb.js**: file a bug report at AztecProtocol/aztec-packages, wait weeks/months. Doesn't unblock the spec timeline.

**Option E — MockVerifier-backed "preview" deployment**: the public deployment runs with MockVerifier so proofs don't actually mean anything, but the game state machine + matchmaking + UX all work. Tag the deployment as "preview, not cryptographically secure yet", plan to flip to real proving once the browser bb.js loader is fixed upstream. **Ships fast, honest about the limitation.**

**Recommended MVP path: Option E for v1**, with a highly visible "This is a preview — proofs are simulated" banner, plus Option A/B as a "play in secure mode" bonus for power users. Flip to real proving globally once upstream is fixed. This preserves "two strangers, any two browsers" as the primary UX and doesn't make perfect the enemy of shippable.

- [ ] Public deployment decision documented as Option E + Option B hybrid
- [ ] Real-proving mode is available via "Advanced → Run your own prover" settings for users who want cryptographic guarantees now

### Escrow & payout (the new goal)
- [ ] Stake is held in-contract from `joinGame` until game resolution; no separate escrow contract (avoids cross-contract auth complexity) — stake sits in `Game.pot = 2 * stakeWei`
- [ ] **Normal win** (reached WIN_HITS): winner can call `claimPot(gameId)`; contract transfers `pot` to winner via `call{value: pot}`, zeroes `pot`, marks `paidOut = true`. Re-entrancy guard required (CEI pattern + `paidOut` flag).
- [ ] **Timeout win**: `claimTimeoutWin(gameId)` already transfers game state to Finished; extend it so the same tx also pays out the full pot to the claimant in one call. The laggard forfeits everything they staked.
- [ ] **Creator abort (no joiner yet)**: `cancelGame(gameId)` is callable by the creator iff `state == Created && player2 == address(0)`; refunds full stake to creator. Anyone can also call it after `ABORT_TIMEOUT` (e.g. 1 hour) if a game sits unjoined.
- [ ] **Mutual draw / abort mid-game**: `proposeDraw(gameId)` sets a `drawProposed[gameId][msg.sender] = true` flag; when both flags are set, contract refunds each player their original `stakeWei` (they each eat their own gas — no rake). State goes to `Finished` with `winner == address(0)`.
- [ ] **Proposer-only draw withdrawal**: if only one player has proposed and they change their mind, `withdrawDrawProposal(gameId)` unsets the flag. Prevents a bad-faith "I proposed draw, now respond" trap.
- [ ] **Double-forfeit edge case**: if a game is in `Committed` state (both committed, nobody has fired) and both clocks expire simultaneously, `claimTimeoutWin` goes to whichever player calls it first — whoever moves first in the real world gets the pot. Document the race explicitly.
- [ ] **Commit-phase timeout**: if P1 committed but P2 never committed within commit clock, P1 calls `claimTimeoutWin` and gets both stakes. (This is the existing `Committed`-state timeout path, extended to pay the pot.)
- [ ] **Post-finalization safety**: once `paidOut == true`, all payout/refund paths revert. Once `state == Finished`, no new moves accepted. No path lets a stake get stuck: every terminal state either paid out or refunded.
- [ ] Contract exposes `getGame(gameId)` with `stakeWei`, `pot`, `paidOut`, `drawProposed[0]`, `drawProposed[1]` so the frontend can render state accurately
- [ ] All payout paths emit events: `PotPaid(gameId, to, amount)`, `StakeRefunded(gameId, to, amount)`, `DrawProposed(gameId, by)`, `GameCanceled(gameId)`
- [ ] **Protocol fee**: v1 has zero protocol fee (winner gets full `2 * stakeWei`). Fee hook is left as a TODO — not a v1 goal.
- [ ] Fuzz + invariant tests: sum of all `pot` balances in active games == contract ETH balance; no path reaches `Finished` with `pot > 0 && paidOut == false` that isn't draw-claimable

### Real-time game pace
- [ ] Each move has a 60-second clock (configurable per game at creation time: 30s / 60s / 120s)
- [ ] Clock is enforced on-chain via block timestamps: `claimTimeoutWin(gameId)` lets the non-stalling player claim a win if the other player hasn't moved within the clock window
- [ ] Both players see a visible countdown
- [ ] Grace period of 10 seconds on top of the clock to account for proving latency

### Game lifecycle
- [ ] Phase transitions: `Created → Waiting → Committed → Playing → Finished`
- [ ] End-of-game shows "You Win / You Lose" screen with stats (shots, hit rate, proving time), a "Rematch" button (creates a new gameId between the same two players), and a "Back to Lobby" button
- [ ] Closing the browser mid-game triggers the opponent's timeout win after the grace period; on reconnect within the grace period the game resumes

### Deployment
- [ ] Frontend deployed to Vercel / Cloudflare Pages / Netlify as a static site (no backend server)
- [ ] **v1 target is Base Sepolia** — a real live L2 testnet, not local Anvil. Stakes are denominated in Sepolia ETH (free from faucets) so we can observe real network behavior — block times, RPC latency, confirmation UX, gas costs, mempool — without putting real money at risk. Mainnet promotion is a post-v1 decision gated on v1 going smoothly.
- [ ] Contracts deployed on Base Sepolia, verified on Base Sepolia Basescan, address committed to README
- [ ] Contract is **non-upgradeable** (immutable) from day one — no admin keys, no pause, no fee switch. Same safety posture as mainnet would require, so the Sepolia deploy is a true rehearsal.
- [ ] Public demo URL is shareable and loads the app for anyone
- [ ] COOP/COEP headers are set in production (via `vercel.json` or Cloudflare Pages `_headers` file) so multi-threaded bb.js works

### Cheat-resistance (the whole point)
- [ ] On-chain `HonkVerifier.verify` is the real Noir-generated contract, NOT MockVerifier
- [ ] Any attempt to submit an invalid fleet (not exactly 1×5, 1×4, 2×3, 1×2, no overlaps) is rejected at `commitBoard` — no proof can be generated for an invalid board
- [ ] Any attempt to lie about a shot response is rejected at `respondShot` — the proof binds to the committed fleet
- [ ] "Commit empty board and always say miss" attack is cryptographically impossible (verified by attempting it as a test)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|---|---|---|
| "Real game means mainnet + stakes" | Revisited: zk cheat-resistance is most convincing when money is actually on the line | **REVERSED** — Base mainnet with real player-chosen ETH stakes is now the v1 goal |
| "Users need MetaMask" | Is the target audience crypto natives? | No — email/Google login via Privy, sponsored gas |
| "We need a backend for matchmaking" | On-chain events can be the matchmaking substrate | No backend; share links + on-chain event scan |
| "Async chess-style play is the real experience" | Does Battleship actually benefit from async? | No — real-time with a clock matches how humans play Battleship IRL |
| "We need real-time proving (<1s)" | Does 5-15s kill the UX for a short game? | No — 5-15s per proof is acceptable when turns are seconds apart anyway |

## Technical Context

### What already exists (stays working)
- `contracts/src/BattleshipGame.sol` — state machine, createGame / commitBoard / fireShot / respondShot / claimTimeoutWin / claimWin
- `contracts/src/verifiers/{Board,Shot}*Verifier.sol` — real 2460-line Noir-generated UltraHonk verifiers
- `circuits/board_validity` + `circuits/shot_response` — Noir circuits with pedersen commitments
- `frontend/src/lib/prover.ts` — real @aztec/bb.js integration (currently blocked by Lane AA on version compatibility)
- `frontend/src/lib/provingSimulator.ts` — stub fallback path
- `frontend/src/components/viz/*` — architecture flow + proving panel + chain panel + circuit stats
- `scripts/demo-fast.sh` and `scripts/demo-real.sh` — switchers between stub+MockVerifier and real+HonkVerifier
- `.github/workflows/ci.yml` — CI for contracts + frontend + presentation

### What needs to be added

**Contracts:**
- `createGame(address opponent, uint32 clockSeconds, uint256 stakeWei)` is now `payable`; requires `msg.value == stakeWei` and `stakeWei >= MIN_STAKE`; `opponent == address(0)` allowed for open games
- `joinGame(uint256 gameId)` is `payable`; requires `msg.value == game.stakeWei`, sets `player2`, emits `GameJoined`
- `cancelGame(uint256 gameId)` — creator refund path before anyone joins; plus stale-game sweep after `ABORT_TIMEOUT`
- `claimPot(uint256 gameId)` — winner withdraws `pot` after normal WIN_HITS victory (CEI + reentrancy guard, `paidOut` flag)
- `claimTimeoutWin` — extend existing path to transfer `pot` to claimant atomically
- `proposeDraw(uint256 gameId)` / `withdrawDrawProposal(uint256 gameId)` — two-sided consent, both-refund on mutual agreement
- New events: `GameJoined`, `PotPaid`, `StakeRefunded`, `DrawProposed`, `GameCanceled`
- Per-move clock on-chain: store `lastActionTimestamp`, modify `claimTimeoutWin` to use it with a per-game clock setting
- Emit enriched `GameCreated(gameId, creator, opponent, clockSeconds, stakeWei)` so the lobby can index open games
- Invariant tests (Foundry `invariant_`): `address(this).balance >= sum(activeGames.pot)`; no path reaches terminal state with unreconciled pot
- Deploy scripts: `DeployBaseSepolia.s.sol` (dress-rehearsal) AND `DeployBaseMainnet.s.sol` (real deploy); both verify on Basescan
- Adjust foundry.toml: add Base Sepolia + Base mainnet RPC endpoints, Basescan API keys, gas reporting on

**Frontend:**
- New `/` landing page: sign-in button, "New Game" button, "Public Games" tab, "How it works" section
- New `/g/[gameId]` route that replaces the current single-page app as the game screen
- `@privy-io/react-auth` integration (or Dynamic equivalent)
- Wagmi/viem client pointed at Base Sepolia instead of local Anvil (keep local Anvil as a dev-mode fallback behind an env flag)
- Replace burner wallet layer with Privy-provided embedded wallet, signing straight to Base mainnet (no paymaster layer)
- Fund-wallet panel: address QR, copy button, Coinbase Onramp widget link, balance polling, "insufficient funds" guard on Create/Join buttons
- Stake input + validation UI at game creation; stake display everywhere the game is shown (lobby, in-game header, end screen)
- Claim-pot / propose-draw / cancel-game buttons wired to the corresponding contract calls, with optimistic UI + confirm dialogs ("You are staking X ETH. Continue?")
- Share-link generation + clipboard copy
- Public games lobby component that reads `GameCreated` events via `publicClient.getLogs`
- Per-move countdown clock with framer-motion
- End-of-game stats screen with rematch flow
- Sign-out / switch account button

**Proving (DEPENDS ON LANE AA):**
- Fix the current bb.js ↔ HonkVerifier `SumcheckFailed` mismatch (Lane AA is working on this right now)
- If Lane AA succeeds with in-browser proving → ship it, target 5-15s per proof
- If Lane AA has to fall back to a Node sidecar → publish it as `@battleship-zk/prover` on npm with a `npx battleship-zk-prove` entrypoint, document it as an optional "fast mode" for users who want <3s proving

**Infra:**
- Vercel deployment of the Vite frontend (or Cloudflare Pages)
- `vercel.json` with COOP/COEP headers
- Environment variable for contract address + chain ID + Privy app ID + paymaster key (all public or sponsor-side secrets)
- DNS / custom domain (optional, post-MVP)

### What's explicitly NOT changing
- Circuit source code (`circuits/**/src/main.nr`)
- Solidity verifier format
- Core `BattleshipGame.sol` commit/shot/respond state machine (only additions, not changes)
- The local demo path (`scripts/demo-fast.sh`)
- Presentation / docs

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| Player | core | wallet_address, embedded_wallet_id, display_name | has many Games |
| Game | core | gameId, player1, player2, state, turn, clockSeconds, createdAt, lastActionAt | has one Board per player, has many Shots |
| Board | core | fleet (5 ships), salt, commitment, ownCells[100] | belongs to Game and Player |
| Ship | supporting | shipType, x, y, orientation, length | belongs to Board |
| Shot | core | x, y, shooter, hit, proof | belongs to Game |
| Commitment | core | pedersenHash(board ∥ salt) | derived from Board |
| Proof | core | bytes, publicInputs[], verifierTarget | accompanies Commitment or Shot |
| PublicGame | derived | gameId, creator, createdAt | filtered list of open Games |
| Rematch | supporting | previousGameId, newGameId | links two Games between same Players |
| Stake | core | amountWei, staker | belongs to Game, two per Game |
| Pot | core | totalWei (2 * stakeWei), paidOut, payee | belongs to Game, terminal payout target |
| DrawProposal | supporting | gameId, by, at | two-of-two consent refunds the Pot |

## Ontology Convergence

| Round | Entities | New | Stability |
|---|---|---|---|
| 1 | Player, Game, Board | 3 | N/A (first) |
| 2 | Player, Game, Board, EmbeddedWallet | +EmbeddedWallet | 75% |
| 3 | Player, Game, Board, PublicGame, ShareLink | +2 | 60% |
| 4 | Player, Game, Board, Proof, VerifierTarget | +2 | 67% |
| 5 | Player, Game, Board, Proof, Clock, Forfeit | +2 | 71% |
| 6 | Same as round 5 (free-play removed "Stake" which was never added) | 0 | 100% ✅ |

Converged at round 6.

## Interview Transcript

### Round 1 — Game shape
**Q:** When you say 'actual functional game people can play,' which version are you picturing?
**A:** Two strangers, any two browsers

### Round 2 — Onboarding
**Q:** How should players sign in and pay for gas?
**A:** Email/Google login, sponsored gas (Privy + L2 paymaster)

### Round 3 — Matchmaking
**Q:** How do two strangers end up in the same game?
**A:** Share link + rematch list + public games tab (no central server)

### Round 4 — Proving
**Q:** Where does the real zk proof get generated for a public player?
**A:** In browser, accept ~5-15s per proof (requires fixing bb.js ↔ verifier mismatch)

### Round 5 — Game pace
**Q:** When do the two players need to be online together?
**A:** Real-time only, short clock (~30-60s per move, forfeit on timeout)

### Round 6 — Stakes (Contrarian)
**Q:** Do the games need stakes or leaderboards to feel 'real'?
**A:** Free play, no stakes — the zk cryptography is the draw

## Risks & Open Questions

1. **Browser bb.js is broken, sidecar works (RESOLVED by Lane AA)** — browser bb.js 5.0.0-nightly.20260324 emits proofs that revert the HonkVerifier; Node bb.js does not. Sidecar landed with real E2E verified (6s cold / 5.5s warm / 5.3s shot). Public-deployment implications captured above — MVP ships with Option E (MockVerifier-backed preview + optional local sidecar for crypto mode).

2. **Player gas costs on Base mainnet** — no sponsorship means players pay their own gas. `commitBoard` runs the HonkVerifier (~2.7M gas), which at Base mainnet ~1 gwei is ≈ $0.07 per commit. `respondShot` is another ~2.7M per shot. A full game is ~40–50 txs for both players → roughly $3–6 in gas per game at current Base mainnet prices. Document this loudly in the onboarding panel so players know what to expect.

6. **Real-money safety of the escrow** — the contract holds real ETH. Must be non-upgradeable, no admin keys, no pause, CEI + reentrancy guard on all payout paths, Foundry invariant tests proving the "contract balance == sum of active pots" invariant, and fuzz tests on every state transition that touches `pot`. No protocol fee in v1 to keep logic simple. Pre-mainnet: at minimum one self-review pass + a `security-reviewer` agent pass. A real external audit is out of scope but the code should be audit-ready.

7. **Stake ladder / lobby sybil** — with open stakes and an open lobby, the lobby can fill with spam 1-wei games. `MIN_STAKE` (contract-enforced) keeps this bounded; the frontend additionally sorts lobby by stake descending and can hide <MIN_STAKE games.

8. **Timeout-win race on `Committed` state** — if both players' clocks expire simultaneously (neither fires the first shot), whoever calls `claimTimeoutWin` first takes the pot. This is documented as intentional, not a bug — the contract can't know who was "more at fault." Alternative (mutual-refund on double-timeout) is explicitly rejected as extra complexity for an edge case.

3. **Public-games tab needs event scanning** — with no backend, the lobby reads `GameCreated` events via RPC. At 1000 games/day this is fine. At 100k games/day it needs an indexer (The Graph, Ponder, Envio). Out of scope for MVP.

4. **Clock enforcement is block-timestamp-dependent** — L2 block times are ~2 seconds, so the clock has ±2s jitter. Acceptable for 60s moves, not for bullet-chess pacing. Noted.

5. **Privy lock-in** — if we pick Privy and they change pricing, migration to Dynamic or Magic.link is maybe 1-2 days of work. Mitigated by abstracting the embedded-wallet SDK behind a thin interface.

## Handoff

Recommended execution path: **this spec → `/ralplan --consensus --direct` → `/autopilot`** (the standard 3-stage pipeline). Ralplan will have Planner/Architect/Critic review the L2 deployment architecture, sponsored-gas integration choice, and the Privy vs Dynamic tradeoff.
