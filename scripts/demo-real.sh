#!/usr/bin/env bash
# Switch back to REAL zk proving:
#   - Deploys BattleshipGame with the real Noir-generated HonkVerifier
#     (2460 lines of sumcheck arithmetic).
#   - Flips frontend prover to real bb.js mode.
#   - Warning: first board_validity proof takes 30–60 seconds in browser.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --skip-simulation | tee /tmp/deploy-real.out
ADDR=$(grep -oE "BattleshipGame deployed at: 0x[a-fA-F0-9]{40}" /tmp/deploy-real.out | awk '{print $NF}')
[ -z "$ADDR" ] && { echo "Could not parse deployed address" >&2; exit 1; }
cat > "$ROOT/frontend/.env.local" <<EOF
VITE_BATTLESHIP_ADDRESS=$ADDR
VITE_PROVER_MODE=real
EOF
echo "✓ Real demo mode: contract=$ADDR, prover=real bb.js"
echo "  Restart 'npm run dev' in frontend/ to pick up the env change."
