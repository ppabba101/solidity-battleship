import { baseSepolia } from "viem/chains";

export const BASE_SEPOLIA_PRIMARY_RPC: string =
  (import.meta.env.VITE_BASE_SEPOLIA_RPC as string | undefined) ??
  "https://sepolia.base.org";

export const BASE_SEPOLIA_FALLBACK_RPC = "https://sepolia.base.org";

export { baseSepolia as baseSepoliaChain };

/**
 * Tries `primaryFn`. If it throws, tries `fallbackFn` once.
 * Both functions receive no arguments and must return a Promise<T>.
 */
export async function withFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
): Promise<T> {
  try {
    return await primaryFn();
  } catch {
    return await fallbackFn();
  }
}
