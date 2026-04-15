import type { WalletClient } from "viem";

/**
 * Thin abstraction over an embedded-wallet provider. Concrete impls live
 * next to their vendor bindings (Privy today; Dynamic/Magic tomorrow if we
 * need to swap per ADR-3). Keep this surface minimal — no vendor types leak.
 */
export interface EmbeddedWalletProvider {
  /** Current authenticated address, or null if the user has not signed in. */
  getAddress(): Promise<`0x${string}` | null>;
  /** Return a viem WalletClient bound to the current embedded wallet. */
  getWalletClient(): Promise<WalletClient | null>;
  /** Sign the user out of the embedded wallet. */
  signOut(): Promise<void>;
}

/**
 * Placeholder implementation. WP3 wires Privy at the React-hook layer
 * (see `PrivyProvider` in `main.tsx`) and exposes `usePrivy()`/`useWallets()`
 * inside components directly. This class exists so non-React code paths
 * (and the future Dynamic swap) have a stable interface to target.
 *
 * The landing page + game room obtain Privy handles via hooks; downstream
 * WPs (lobby, escrow) should adopt this interface once the hook-level
 * plumbing is stable.
 */
export class PrivyEmbeddedWallet implements EmbeddedWalletProvider {
  constructor(
    private readonly _getAddress: () => Promise<`0x${string}` | null>,
    private readonly _getWalletClient: () => Promise<WalletClient | null>,
    private readonly _signOut: () => Promise<void>,
  ) {}

  getAddress() {
    return this._getAddress();
  }
  getWalletClient() {
    return this._getWalletClient();
  }
  signOut() {
    return this._signOut();
  }
}
