# Battleship zk Circuits

Two Noir circuits power the zk-secured battleship demo:

- `board_validity/` — proves a committed board has a legal fleet ({1x5, 1x4, 2x3, 1x2}, no overlaps, no diagonals) without revealing the board.
- `shot_response/` — proves a given `(x, y)` response (hit/miss) is consistent with the committed board.

## Toolchain install

```bash
# noirup (Noir toolchain manager)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# bbup (Barretenberg prover/verifier manager)
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
bbup
```

Then verify:

```bash
nargo --version
bb --version
```

## Compile + generate Solidity verifiers

From this `circuits/` directory:

```bash
# Board validity
cd board_validity
nargo compile
bb write_vk -b ./target/board_validity.json -o ./target/vk
bb contract -k ./target/vk -o ../../contracts/src/verifiers/BoardValidityVerifier.sol
cd ..

# Shot response
cd shot_response
nargo compile
bb write_vk -b ./target/shot_response.json -o ./target/vk
bb contract -k ./target/vk -o ../../contracts/src/verifiers/ShotResponseVerifier.sol
cd ..
```

The generated contracts expose:

```solidity
function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
```

`BattleshipGame.sol` calls this interface. Until the verifiers are generated, stub contracts at
`contracts/src/verifiers/*.sol` return `true` so the full game state machine can be tested.
Replace the stubs with the `bb contract` output and rebuild.
