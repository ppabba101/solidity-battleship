# Noir + bb.js Browser Proving Speedup: Ecosystem Findings

**Target:** Noir 1.0.0-beta.20, `@aztec/bb.js` UltraHonkBackend, ~3,500-constraint `board_validity` circuit, 30–60 s browser proving → target single-digit seconds.

---

## 1. Threading: The Highest-Leverage Known Fix

**Finding:** `Barretenberg.new()` accepts a `threads` option. Default = number of CPU cores, capped at 32. Setting `threads: 1` falls back to single-threaded WASM (no SharedArrayBuffer required). If your frontend is currently not setting COOP/COEP headers, `bb.js` silently falls back to single-threaded mode even on multi-core hardware.

**Required server headers for multithreading:**
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

**Constructor pattern:**
```typescript
import { UltraHonkBackend, Barretenberg } from '@aztec/bb.js';

// Explicit multi-threaded init
const api = await Barretenberg.new({ threads: navigator.hardwareConcurrency ?? 8 });
const backend = new UltraHonkBackend(circuit.bytecode, api);
```

**Caveat:** Adding COOP/COEP headers disables cross-origin script loading. Vite dev server and production CDN must both send these headers.

**Source:** `barretenberg/ts/README.md` (archived master) — https://github.com/AztecProtocol/barretenberg/blob/master/ts/README.md

---

## 2. `verifierTarget: 'evm-no-zk'` — Faster Prover, Still EVM-Verifiable

**Finding:** `UltraHonkBackendOptions` exposes a `verifierTarget` field. Confirmed targets as of the current `aztec-packages` master:

| Target | Description |
|---|---|
| `'evm'` | Keccak + ZK hiding. Slowest prover. Current default for Battleship. |
| `'evm-no-zk'` | No ZK hiding. Faster prover. Still generates a Solidity-verifiable proof. |
| `'noir-recursive'` | Poseidon2, ZK. For recursive circuits. |
| `'noir-recursive-no-zk'` | Poseidon2, no ZK. Fastest for recursive use. |

For Battleship, `'evm-no-zk'` removes the ZK hiding layer. The board commitment already provides privacy (the board is never revealed); the ZK property of the proof itself is not required for game correctness. **This is applicable and low-effort.**

```typescript
const { proof, publicInputs } = await backend.generateProof(witness, {
  verifierTarget: 'evm-no-zk'
});
```

The generated Solidity verifier must also be regenerated with `nargo codegen-verifier` using the matching target flag. The on-chain `HonkVerifier` for `evm-no-zk` is a different contract than the `evm` (keccak+ZK) one.

**Source:** `barretenberg/ts/src/barretenberg/backend.ts` in aztec-packages master — https://github.com/AztecProtocol/aztec-packages

---

## 3. Hash: `poseidon2_permutation` Is the Fastest Public In-Circuit Hash

**Finding (Noir 1.0.0-beta.20 stdlib):** The following hash functions are public in `std::hash`:
- `pedersen_hash<N>(input: [Field; N]) -> Field` — public, current
- `poseidon2_permutation<N>(input: [Field; N]) -> [Field; N]` — **public** (exported from `mod.nr`), but the `poseidon2` *module* itself is `pub(crate)` (internal)
- `blake2s`, `blake3`, `sha256_compression`, `keccakf1600` — public but expensive in-circuit

**Constraint costs (from TaceoLabs noir-poseidon, generic non-blackbox implementation):**
- Poseidon2 permutation t=4 (generic): ~2,313 gates per call
- Poseidon2 **with barretenberg custom gates** (blackbox): **~73 gates per permutation call** (forum.aztec.network confirmed)
- Pedersen hash: no published per-call gate count in current docs, but historically more expensive than Poseidon2 with custom gates

`poseidon2_permutation` as a blackbox function uses barretenberg's custom gates and achieves ~73 gates/permutation. For 101 field elements (board + salt), you need ~34 permutation calls at rate=3 → ~2,482 gates total vs Pedersen's undocumented but higher cost.

**Migration:** Replace `pedersen_hash(board_and_salt)` with a Poseidon2 sponge. The `poseidon2_permutation` blackbox is callable directly. No third-party library needed for the permutation itself; a sponge wrapper is ~10 lines of Noir.

**Sources:**
- Noir stdlib hash docs (v1.0.0-beta.20): https://noir-lang.org/docs/noir/standard_library/cryptographic_primitives/hashes
- Aztec forum on Poseidon vs Poseidon2 constraint counts: https://forum.aztec.network/t/on-the-usability-differences-between-poseidon-and-poseidon2/8233
- noir stdlib `hash/mod.nr`: https://github.com/noir-lang/noir/blob/master/noir_stdlib/src/hash/mod.nr

---

## 4. Native vs Browser Proving Gap

**Finding (Savio-Sou benchmarks, v1.0.0-beta.0, native Linux):**

| Constraint count | Native prove time |
|---|---|
| 2^10 (~1k) | 0.477 s |
| 2^15 (~32k) | 1.127 s |
| 2^20 (~1M) | 20.255 s |
| 2^22 (~4M) | 77.385 s |

The `board_validity` circuit has **3,482 constraints**, which sits between 2^11 and 2^12. **Native proving should be well under 1 second** for this circuit size on modern hardware. The 30–60 s browser time indicates single-threaded WASM fallback is almost certainly in effect. Multi-threaded WASM should close the gap to 3–8× of native, not 60–120×.

**Source:** https://github.com/Savio-Sou/noir-benchmarks

---

## 5. Proving Key Caching

**Finding:** No official bb.js API for proving key persistence to IndexedDB exists in documented form. `Barretenberg.new()` loads the SRS (Structured Reference String) on every call. The `skipSrsInit` option exists in source but is not publicly documented. **No cached/persistent proving key story is confirmed in the public API as of 2025.**

Community workaround (unverified in primary docs): initialize `Barretenberg` once on app load and keep the `api` instance alive across proof generations rather than re-initializing per proof. This avoids repeated SRS download overhead (~10–40 MB depending on circuit size).

---

## 6. Folding / Incremental Proving for Shot-per-Shot Pattern

**Finding:** No Nova, HyperNova, or ProtoGalaxy support is available in Noir + bb.js for application developers as of 2025. These are active research areas within the Aztec team (`client_ivc` appears in source) but are not exposed as public APIs.

**Noir recursive proofs** (`std::verify_proof` / `#[foreign(recursive_aggregation)]`) are supported and allow composing proofs. The pattern for Battleship would be: prove each shot response independently, then optionally aggregate via recursion. However, this does not fold incremental state; each shot still needs a full `shot_response` proof.

The `shot_response` circuit has very few constraints (board index lookup + one Pedersen hash call = ~50–200 constraints). Its proving time should already be sub-second in the browser with multithreading enabled.

**Source:** https://noir-lang.org/docs/noir/standard_library/recursion

---

## 7. Alternative Proof Systems

| System | Browser proving | EVM verifier | Notes |
|---|---|---|---|
| **Plonky2** | QEDProtocol has a WebGPU-accelerated wasm port | No native Solidity verifier (18M gas to verify directly; needs Groth16 wrapper) | Not a drop-in for Battleship |
| **Circom + snarkjs Groth16** | Yes, mature. But still 10–60 s for non-trivial circuits in browser | Yes, ~200k gas | Requires trusted setup per circuit |
| **RISC Zero / SP1 / Jolt** | No browser proving | Yes (via SNARK wrapper) | Remote-proving services only; overkill |
| **Sindri / Gevulot / Succinct** | Remote proving (server-side) | Yes | Loses client-side trust model — out of scope |

**Conclusion:** No alternative system offers a better browser-proving + EVM-verifier combination than Noir + bb.js for this use case without significant re-architecture.

---

## 8. WebGPU / SIMD Acceleration in bb.js

**Finding:** No WebGPU backend in `@aztec/bb.js` is documented or released as of 2025. WASM SIMD is used by the existing multi-threaded WASM build. The only confirmed WebGPU ZK work is StarkWare's Stwo prover (Circle STARKs, not UltraHonk), achieving 2× overall speedup and 5× on constraint polynomial evaluation. This is not applicable to Noir + bb.js.

**Source:** https://www.webgpu.com/news/zk-proofs-webgpu-boost/

---

## Top 3 Actionable Recommendations

### Rec 1 — Enable multithreaded WASM (highest impact, ~1 hour effort)
Add `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` response headers to the Vite dev server and production host. Initialize `Barretenberg.new({ threads: navigator.hardwareConcurrency ?? 4 })` explicitly. Expected result: proving drops from 30–60 s to 5–15 s (rough estimate based on single-threaded fallback being the current bottleneck for a ~3,500-constraint circuit whose native time is sub-second).
- **Source:** bb.js README — https://github.com/AztecProtocol/barretenberg/blob/master/ts/README.md

### Rec 2 — Switch `verifierTarget` to `'evm-no-zk'` (~2 hours effort including verifier regen)
The board is already hidden by the Pedersen commitment; the ZK property of the proof transcript is redundant for Battleship's security model. `evm-no-zk` removes the keccak-based ZK hiding layer from proof generation, reducing prover work. Regenerate the Solidity HonkVerifier with the matching target and re-deploy.
- **Source:** aztec-packages backend.ts — https://github.com/AztecProtocol/aztec-packages

### Rec 3 — Replace `pedersen_hash` with `poseidon2_permutation` sponge (~4 hours effort)
`poseidon2_permutation` as a blackbox uses barretenberg custom gates at ~73 gates/permutation vs. Pedersen's higher cost. For 101 field elements (100 board cells + salt), a rate-3 sponge needs ~34 permutation calls = ~2,482 gates vs. the current Pedersen. The constraint count reduction directly reduces proving time. Call `std::hash::poseidon2_permutation` — it is public in the stdlib at Noir 1.0.0-beta.20.
- **Source:** Aztec forum thread — https://forum.aztec.network/t/on-the-usability-differences-between-poseidon-and-poseidon2/8233 ; Noir stdlib — https://github.com/noir-lang/noir/blob/master/noir_stdlib/src/hash/mod.nr
