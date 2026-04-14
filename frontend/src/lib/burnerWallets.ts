import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

// Anvil deterministic test keys — demo-only, do NOT reuse.
const ANVIL_KEY_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const ANVIL_KEY_1 =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

export const ANVIL_RPC = "http://127.0.0.1:8545";

export function createBurners() {
  const player1 = privateKeyToAccount(ANVIL_KEY_0);
  const player2 = privateKeyToAccount(ANVIL_KEY_1);
  return { player1, player2 };
}

export type PlayerIndex = 0 | 1;

export function getWalletClient(player: PlayerIndex): WalletClient {
  const { player1, player2 } = createBurners();
  const account = player === 0 ? player1 : player2;
  return createWalletClient({
    account,
    chain: foundry,
    transport: http(ANVIL_RPC),
  });
}

export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: foundry,
    transport: http(ANVIL_RPC),
  });
}
