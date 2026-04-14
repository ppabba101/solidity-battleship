# Deep Dive Trace: solidity-battleship-overhaul

## Observed Result
Solidity Battleship demo has three compounding problems: (1) Merkle commitment provides weak cryptographic guarantees, (2) raw MetaMask integration makes the demo clunky — especially for two players, (3) the UI is ugly and conflates hit/miss/attempted/ship cell states.

## Ranked Hypotheses
| Rank | Hypothesis | Confidence | Evidence | Why it leads |
|---|---|---|---|---|
| 1 | Merkle binds cells but cannot prove board validity at commit time; deferred reveal enforcement is also broken by a winner-assignment bug | High | Strong (code) | Compounding design-limit + real bug in `revealFinalBoard` |
| 2 | Frontend has no CellState model, no design system, and no fleet-placement primitives | High | Strong (code) | `BoardGrid.tsx` has 3 hardcoded colors; `board[idx]` is boolean toggle |
| 3 | Raw `window.ethereum` + single `account` state makes 2-player demo structurally unsupported | High | Strong (code) | No `accountsChanged` listener, no `wallet_switchEthereumChain`, no loading states |

## Evidence Summary by Hypothesis

**H1 (crypto):**
- `BattleshipGame.sol:99-120` — `commitBoardRoot` accepts any `bytes32` with zero validation.
- `BattleshipGame.sol:143-177` — `respondToShot` only verifies per-cell Merkle proofs, never fleet legality.
- `BattleshipGame.sol:206-210` — **critical bug**: both branches of the legality check assign `game.winner = game.winnerCandidate`, so the enforcement gate is a no-op. A player can commit an all-empty board, always answer "miss," and win.
- `BoardValidator.sol:112` — `lengths[5]` bucket exists but is never checked, so a length-5 ship passes `validateStandardFleet` silently (secondary gap).
- Attack: commit an empty board → never get hit → win by timeout.

**H2 (frontend):**
- `frontend/src/components/BoardGrid.tsx:8-12` — three-value numeric cell model: 0/1/2 mapped to three hex colors. State `1` conflates "attempted shot" and "confirmed miss"; state `2` conflates "own ship" and "confirmed hit."
- `App.tsx:52-59` — `onBoardPlacement` is a single toggle; no ship shape, no fleet constraint, no rotation, no snap-to-grid. Player can scatter individual cells freely.
- `App.tsx:236` — root element uses inline `style={{}}` objects; no Tailwind, no component library, no design system, no responsive layout.
- `index.html` — no stylesheet, no font, no tailwind CDN.

**H3 (wallet UX):**
- `App.tsx:78` — raw `window.ethereum` check, hardcoded error string.
- `App.tsx:83-86` — chain ID check against `"0x7a69"` (Anvil 31337) with no `wallet_switchEthereumChain` prompt.
- `App.tsx:102,116,138,161,187` — every `writeContract` call has no pending/loading state.
- `App.tsx:24` — single `account` state; no Player 2 slot; no `accountsChanged`/`chainChanged` listeners.
- `contract.ts:92-93` — `getClients()` recreated on every call; `publicClient` hardcoded to `http://127.0.0.1:8545`.
- `package.json` — zero wallet libraries (only react, react-dom, viem).

## zk Toolchain Ranking (Lane 1)
| Rank | Stack | Verifier Gas | DX | Demo Fit | Browser Proving |
|---|---|---|---|---|---|
| 1 | **Noir + `@aztec/bb.js`** | ~250–300k (UltraPlonk) | Best (Rust-like, no per-circuit setup) | High — no trusted setup ceremony | 3–10s estimated |
| 2 | Circom + snarkjs (Groth16) | ~200–250k | Moderate | Moderate — trusted setup is narrative liability | 5–20s |
| 3 | Halo2 / Plonky2 | ~300–600k | Poor | Low — Rust-only, immature browser story | 30s+ |

## Wallet Option Scoring (Lane 2)
| Option | Demo Smoothness | 2-Player One Machine | Setup | Realism |
|---|---|---|---|---|
| **Burner wallets (viem `privateKeyToAccount` + Anvil)** | Very High | **Very High** — two pre-funded keys in state | Low | Low |
| RainbowKit / ConnectKit | High | Low (still one MetaMask at a time) | Medium | High |
| Privy / Dynamic | Very High | Medium | High | Medium |

Burner wallets are the only option that structurally solves 2-players-on-one-laptop.

## Per-Lane Critical Unknowns
- **Lane 1 (crypto):** Noir browser proving time for a ~100-cell fleet-validity circuit — is it under 10s? If yes → Noir; if no → Circom.
- **Lane 2 (wallet):** Is the demo "two people one laptop" or "two devices/profiles"? If same-session → burner wallets; if separate → polish raw MetaMask + RainbowKit.
- **Lane 3 (frontend):** Does placement need Battleship-standard fleet shapes (drag a 5-cell carrier, rotate, snap) or is click-toggle + on-commit validity check acceptable? 3x implementation cost difference.

## Rebuttal Round
- Best rebuttal to H1: "deferred reveal catches cheating" — fails because lines 206-210 assign the same winner in both branches.
- Best rebuttal to Noir (H1 remedy): "Circom has lower verifier gas and proven browser prover" — valid, but trusted-setup ceremony is a demo narrative cost.
- Best rebuttal to burner wallets (H3 remedy): "loses production realism" — valid only if demo audience is investors on a testnet.

## Most Likely Explanation
The demo is weak because three layers are each under-built AND they compound:
1. **Crypto layer** is structurally unable to prove board validity (Merkle limit) AND the deferred enforcement is a dead code path (winner-assignment bug).
2. **UX layer** has no cell-state model and no design system, so the game is literally unreadable.
3. **Wallet layer** is a bare `window.ethereum` wrapper with no account-switching support, blocking the 2-player flow.

The fix is a full overhaul across all three: **Noir circuit for board validity**, **Tailwind + shadcn + framer-motion redesign with a proper CellState enum**, and **burner wallets over local Anvil** for a zero-friction 2-player demo. Plus the `revealFinalBoard` bug must be fixed regardless of crypto choice.

## Recommended Discriminating Probe
Before full implementation: write a minimal Noir circuit for the fleet-validity predicate, run `@aztec/bb.js` in the browser, measure wall-clock proving time. If <10s → commit to Noir stack; if >15s → fall back to Circom.
