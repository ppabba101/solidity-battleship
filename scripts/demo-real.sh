#!/usr/bin/env bash
# Switch back to REAL zk proving:
#   - Deploys BattleshipGame with the real Noir-generated HonkVerifier
#     (2460 lines of sumcheck arithmetic).
#   - Starts the local Node prover sidecar (scripts/prove-sidecar.mjs) on
#     127.0.0.1:8899. The browser build of @aztec/bb.js 5.0.0-nightly.20260324
#     emits UltraHonk proofs that revert the deployed HonkVerifier with
#     SumcheckFailed (0x9fc3a218); the Node build of the same bb.js version
#     does not. The frontend now posts witnesses to the sidecar instead of
#     running bb.js in the browser, and each proof takes ~0.5–1.5s.
#   - Flips frontend prover to real mode pointed at the sidecar.
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

# (Re)start the prover sidecar.
pkill -f "prove-sidecar.mjs" >/dev/null 2>&1 || true
(cd "$ROOT" && nohup node scripts/prove-sidecar.mjs > /tmp/sidecar.log 2>&1 &)
# Wait up to 5s for /healthz.
for i in 1 2 3 4 5; do
  if curl -s -f http://127.0.0.1:8899/healthz >/dev/null 2>&1; then break; fi
  sleep 1
done

cat > "$ROOT/frontend/.env.local" <<EOF
VITE_BATTLESHIP_ADDRESS=$ADDR
VITE_PROVER_MODE=real
VITE_PROVER_SIDECAR_URL=http://127.0.0.1:8899
EOF
echo "✓ Real demo mode: contract=$ADDR, prover=sidecar (bb.js on Node)"
echo "  Sidecar log: /tmp/sidecar.log"
echo "  Restart 'npm run dev' in frontend/ to pick up the env change."
