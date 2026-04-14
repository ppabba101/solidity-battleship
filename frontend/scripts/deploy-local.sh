#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR/../../contracts"
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 | tee /tmp/deploy.out
ADDR=$(grep -oE "BattleshipGame deployed at: 0x[a-fA-F0-9]{40}" /tmp/deploy.out | awk '{print $NF}')
[ -z "$ADDR" ] && ADDR=$(grep -oE "0x[a-fA-F0-9]{40}" /tmp/deploy.out | tail -1)
echo "VITE_BATTLESHIP_ADDRESS=$ADDR" > "$FRONTEND_DIR/.env.local"
echo "Deployed at $ADDR — wrote $FRONTEND_DIR/.env.local"
