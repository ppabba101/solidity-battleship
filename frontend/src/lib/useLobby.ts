import { useState, useEffect, useRef, useCallback } from "react";
import { createPublicClient, http } from "viem";
import { type OpenGame, fetchOpenGames } from "./lobby";
import { BASE_SEPOLIA_PRIMARY_RPC, baseSepoliaChain } from "./rpcConfig";

// ---------------------------------------------------------------------------
// TODO (WP3 dependency): Replace this fallback with the real hook from
// @/lib/activeMode once WP3 lands. The hook there should expose
// usePublicClient() or equivalent. For now we build our own public client
// pointed at the configured Base Sepolia RPC.
// ---------------------------------------------------------------------------
function makePublicClient() {
  return createPublicClient({
    chain: baseSepoliaChain,
    transport: http(BASE_SEPOLIA_PRIMARY_RPC),
  });
}

const POLL_INTERVAL_MS = 30_000;

export interface UseLobbyResult {
  games: OpenGame[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLobby(
  contractAddress: `0x${string}` | null,
): UseLobbyResult {
  const [games, setGames] = useState<OpenGame[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track whether a fetch is currently in-flight so we don't overlap polls
  const inFlightRef = useRef(false);
  // Allow external refetch trigger
  const triggerRef = useRef(0);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!contractAddress) {
      setGames([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function doFetch() {
      if (inFlightRef.current) return; // skip if already running
      inFlightRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const publicClient = makePublicClient();
        const currentBlock = await publicClient.getBlockNumber();
        const result = await fetchOpenGames({
          contractAddress: contractAddress!,
          publicClient,
          currentBlock,
        });
        if (!cancelled) {
          setGames(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        inFlightRef.current = false;
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    doFetch();

    const intervalId = setInterval(doFetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // tick is used as a manual refetch trigger; contractAddress change resets everything
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, tick]);

  // Keep triggerRef in sync (not strictly needed but silences the exhaustive-deps lint
  // if someone enables it later)
  triggerRef.current = tick;

  return { games, isLoading, error, refetch };
}
