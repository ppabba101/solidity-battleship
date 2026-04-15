#!/usr/bin/env bash
# One-shot switch to FAST demo mode:
#   - Deploys BattleshipGame with MockVerifier (any proof accepted).
#   - Flips frontend prover to stub mode (3–5s fake proving delay).
#   - Restarts Vite so the env var takes effect.
#
# Assumes anvil is already running at http://127.0.0.1:8545 with
# `anvil --silent --code-size-limit 50000`. If not, start it in another
# terminal first.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"
# MIN_STAKE=0 is the default but we export explicitly so the demo's
# intent is obvious: hot-seat mode never touches real stakes.
FAKE_VERIFIERS=1 MIN_STAKE=0 forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --skip-simulation | tee /tmp/deploy-fast.out
ADDR=$(grep -oE "BattleshipGame deployed at: 0x[a-fA-F0-9]{40}" /tmp/deploy-fast.out | awk '{print $NF}')
[ -z "$ADDR" ] && { echo "Could not parse deployed address" >&2; exit 1; }
cat > "$ROOT/frontend/.env.local" <<EOF
VITE_BATTLESHIP_ADDRESS=$ADDR
VITE_PROVER_MODE=stub
EOF
echo "✓ Fast demo mode: contract=$ADDR, prover=stub"
echo "  Restart 'npm run dev' in frontend/ to pick up the env change."
