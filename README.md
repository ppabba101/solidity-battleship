# Battleship.zk

Two-player hot-seat Battleship where every board is committed on-chain, every
board is proven legal with a zero-knowledge proof, and every shot response is
proven against the committed board. No trust, no peeking, no "empty board"
cheat.

## Architecture

```
React UI  ─▶  bb.js prover  ─▶  Noir circuit
    │                             │
    │                             ▼
    └──────▶ viem ──▶ Solidity verifier ──▶ BattleshipGame ──▶ Anvil
```

- `contracts/` — Foundry project with `BattleshipGame.sol` plus stubbed
  Noir-generated `BoardValidityVerifier` and `ShotResponseVerifier`.
- `frontend/` — Vite + React + Tailwind + shadcn/ui + framer-motion. Uses
  viem burner wallets against Anvil.
- `circuits/` — Noir circuits for board validity and shot response (see
  `circuits/README.md` for regeneration).
- `presentation/battleship-zk-demo.pptx` — deck walking through the design.

## Run the demo

**Terminal 1 — local chain**

```
anvil
```

**Terminal 2 — deploy + run UI**

```
cd frontend
./scripts/deploy-local.sh          # deploys verifiers + BattleshipGame, writes .env.local
npm run dev
```

Then open <http://localhost:5173>.

### What to click

- **Placement**: drag each ship onto the grid (press `R` to rotate). When all
  five ships are placed, hit **Ready**. The UI proves board legality in zk,
  then calls `createGame` (Player 1 only) and `commitBoard` on-chain.
- **Hand off**: control swaps to Player 2 so they can place and commit too.
- **Battle**: click a cell on *Enemy Waters* to fire. The UI submits
  `fireShot` as the shooter, then proves hit/miss against the opponent's
  stored board, then submits `respondShot` as the opponent burner.
- **Turn rule**: a **hit** keeps your turn, a **miss** flips the active
  player. The "Switch Player" button in the status bar is still there for
  manual override.
- **Crypto log** on the right streams every proof + every chain event
  (`ShotFired`, `ShotResponded`, `GameWon`).
- 17 hits wins. On `GameWon` the UI drops confetti and the win screen.

## Notes

- Proofs are currently stubbed out (always-true verifiers + mock `bb.js`
  prover in `frontend/src/lib/prover.ts`). Regenerate real Noir artifacts and
  drop in the compiled verifiers per `circuits/README.md` to get end-to-end
  soundness.
- Sound effects in `frontend/public/sfx/` are placeholders — swap in your own
  `.wav`/`.mp3` files with the same names.
- Burner keys are the deterministic Anvil test accounts. Do **not** reuse
  them anywhere real.

## Slide deck

See [`presentation/battleship-zk-demo.pptx`](presentation/battleship-zk-demo.pptx)
for the walkthrough deck.
