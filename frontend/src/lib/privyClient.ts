import { useEffect, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
} from "viem";
import {
  BASE_SEPOLIA_PRIMARY_RPC,
  baseSepoliaChain,
} from "./rpcConfig";
import type { ContractCtx } from "./contract";

// viem types collide across transitive copies (Privy ships its own).
// Treat clients structurally to avoid TS2719.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Singleton public client for Base Sepolia. Cheap to call from anywhere
 * (`useActiveContractCtx`, lobby, escrow polling).
 */
let _pub: AnyClient = null;
export function basePublicClient(): AnyClient {
  if (!_pub) {
    _pub = createPublicClient({
      chain: baseSepoliaChain,
      transport: http(BASE_SEPOLIA_PRIMARY_RPC),
    });
  }
  return _pub;
}

/**
 * Build a viem WalletClient backed by a Privy embedded wallet's
 * EIP-1193 provider. Returns null until a wallet is available.
 */
export function useActiveWalletClient(): {
  walletClient: AnyClient | null;
  address: `0x${string}` | null;
} {
  const { wallets } = useWallets();
  // Prefer the privy embedded wallet if present, else first wallet.
  const wallet =
    wallets.find((w) => w.walletClientType === "privy") ?? wallets[0] ?? null;

  const [walletClient, setWalletClient] = useState<AnyClient | null>(null);
  const address = (wallet?.address ?? null) as `0x${string}` | null;

  useEffect(() => {
    let cancelled = false;
    if (!wallet) {
      setWalletClient(null);
      return;
    }
    (async () => {
      try {
        // Pin the EVM chain to Base Sepolia so signing / RPC route correctly.
        try {
          await wallet.switchChain(baseSepoliaChain.id);
        } catch {
          /* user may decline; viem call will surface error later */
        }
        const provider = await wallet.getEthereumProvider();
        if (cancelled) return;
        const client = createWalletClient({
          account: wallet.address as `0x${string}`,
          chain: baseSepoliaChain,
          transport: custom(provider),
        });
        setWalletClient(client);
      } catch (e) {
        console.warn("useActiveWalletClient: failed to build wallet client", e);
        if (!cancelled) setWalletClient(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  return { walletClient, address };
}

/**
 * Convenience hook: bundles {address, walletClient, publicClient, chain}
 * into a ContractCtx. Returns null until the wallet is ready.
 */
export function useContractCtx(
  contractAddress: `0x${string}` | null,
): ContractCtx | null {
  const { walletClient } = useActiveWalletClient();
  const publicClient = useMemo(() => basePublicClient(), []);
  if (!walletClient || !contractAddress) return null;
  return {
    address: contractAddress,
    walletClient,
    publicClient,
    chain: baseSepoliaChain,
  };
}
