# Battleship zk Circuits

Two Noir circuits power the zk-secured battleship demo:

- `board_validity/` — proves a legal fleet layout (5 axis-aligned ships of
  length 5/4/3/3/2, no overlaps) hashes to the public commitment. The private
  witness is **the fleet itself** (`(x, y, orientation)` for each ship), not
  the 100-cell board. The circuit stamps the fleet into a 100-cell occupancy
  mask, asserts the stamps don't collide, and Pedersen-hashes the resulting
  board together with a salt.
- `shot_response/` — proves a given `(x, y)` response (hit/miss) is
  consistent with the committed board. Takes the raw 100-cell board and the
  salt as private witness; re-derives the Pedersen commitment so the proof is
  bound to the exact board that was committed.

Both circuits use the **same Pedersen hash preimage** (`[board || salt]`, 101
Field elements, `hashIndex = 0`) so the responder can reconstruct its board
from the fleet layout and reproduce the commitment byte-for-byte.

## Toolchain

```bash
# noirup (Noir toolchain manager)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup --version 1.0.0-beta.20

# bbup (Barretenberg prover/verifier manager)
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
bbup
```

Verify:

```bash
nargo --version   # expect 1.0.0-beta.20
bb --version
```

## Compile the circuits

```bash
cd circuits/board_validity && nargo compile
cd ../shot_response && nargo compile
```

`nargo compile` writes `target/<name>.json` which contains the ACIR bytecode
and ABI. These JSON files are consumed directly by the browser prover via
`@aztec/bb.js` + `@noir-lang/noir_js` (see `frontend/src/lib/prover.ts`).

## Generate the Solidity verifiers

The EVM verifier MUST be generated from the **same bb.js version** that the
browser prover uses; otherwise sumcheck will fail on-chain even though the
proof is mathematically correct. The `scripts/generate-solidity-verifiers.mjs`
helper does this automatically:

```bash
node scripts/generate-solidity-verifiers.mjs
```

This loads each compiled circuit into `@aztec/bb.js`, computes the verification
key with `{ verifierTarget: 'evm' }`, and writes the Solidity verifier to
`contracts/src/verifiers/{BoardValidity,ShotResponse}Verifier.sol`.

## Browser proving notes

- The `commitment: pub Field` public input must be supplied to the prover; it
  is **not** derived inside the circuit. The frontend computes it via
  `BarretenbergSync.pedersenHash({ inputs, hashIndex: 0 })` over the same 101
  Field preimage the circuit hashes.
- Proofs are generated with `{ verifierTarget: 'evm' }` so the transcript uses
  keccak (the EVM verifier's native hash). The returned 8768-byte proof blob
  is passed verbatim as the `proof` argument to `HonkVerifier.verify(bytes,
  bytes32[])`; `publicInputs` is a single 32-byte element carrying the
  commitment.
- The EVM HonkVerifier contract is ~25 KB and exceeds the EIP-170 24 KB
  contract size limit. For local demos start anvil with
  `anvil --disable-code-size-limit` and deploy with
  `forge script ... --disable-code-size-limit`.
